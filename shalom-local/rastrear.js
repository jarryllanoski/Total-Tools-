"use strict";

/*
 * rastrear.js — Lector LOCAL del seguimiento público de Shalom
 * ============================================================
 * Corre en TU PC (no en la nube), con tu IP residencial, que sí pasa el
 * reCAPTCHA v3 de Shalom. Abre la página PÚBLICA shalom.com.pe/rastrea como lo
 * haría una persona, escribe la guía + código, y lee el estado que Shalom pinta
 * en pantalla (la barra de 4 pasos + el encabezado). No inicia sesión, no
 * descifra nada, no falsifica firmas: lee una página pública, como tú a mano.
 *
 * FASE A (este archivo): SOLO LEER. No toca tu base de datos. Sirve para
 * comprobar lo único que aún no sabemos: si tu PC puede leer Shalom a través
 * del reCAPTCHA. Cuando eso quede probado, la Fase B agrega subir a Firestore.
 *
 * USO:
 *   node rastrear.js --debug 92892656 ABCD
 *      → abre el navegador, busca esa guía, GUARDA el texto y una captura en
 *        ./debug/ y muestra lo que interpretó. Con esto CALIBRAMOS el lector
 *        contra la estructura real antes de confiar en él.
 *
 * Requisitos (una sola vez, en tu PC):
 *   npm install
 *   npx playwright install chromium
 */

const path = require("path");
const fs = require("fs");

const RASTREA_URL = "https://shalom.com.pe/rastrea";
const PERFIL_DIR = path.join(__dirname, ".perfil"); // perfil persistente: mejora
//   la nota de reCAPTCHA con el tiempo (cookies estables) y parece más humano.

// ── Interpretación del estado ───────────────────────────────────────────────
// CLAVE: la barra de pasos SIEMPRE trae las 4 palabras (En origen, En tránsito,
// En destino, Entregado). Buscar una palabra "a secas" agarraría la barra, no el
// estado real. Pero el ENCABEZADO (el estado actual) aparece SIEMPRE ANTES que
// la barra en el texto → gana la coincidencia de MENOR posición. Estas claves se
// afinan con la salida de --debug contra la página real.
const CANDIDATOS = [
  {estado: "Demora de envíos", claves: ["demora", "retras"]},
  {estado: "Entregado", claves: ["entregado", "recogido", "recepcion del destinatario", "culminado"]},
  {estado: "En destino", claves: ["listo para su recojo", "en agencia de destino", "disponible para", "a disposicion", "en destino"]},
  {estado: "En tránsito", claves: ["viaja", "en camino", "rumbo a", "en transito", "en traslado", "reparto"]},
  {estado: "En origen", claves: ["recepcionado", "en origen"]},
];

const _norm = (s) => String(s || "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/*
 * Interpreta el TEXTO visible del resultado. Devuelve {ok, estado, fecha, bloqueado}.
 * NUNCA inventa: si no reconoce nada, ok:false (no forzamos un estado).
 * Elige el estado por POSICIÓN (el encabezado va antes que la barra), así la
 * barra de 4 pasos no lo confunde. Exportada aparte para probarla sin navegador.
 */
function parsearEstado(textoVisible) {
  const crudo = String(textoVisible || "");
  const t = _norm(crudo).replace(/\s+/g, " ");

  // Fecha del evento: "Desde el 22/08/26 a las 16:56"
  let fecha = null;
  const mF = crudo.match(/[Dd]esde el\s+([\d/]+)\s+a las\s+([\d:]+)/);
  if (mF) fecha = mF[1] + " " + mF[2];

  // Bloqueo (reCAPTCHA / login) — NO es "sin estado", es "no me dejaron ver".
  const bloqueado = /inicia sesion para rastrear|para poder rastrear tu envio necesitas/.test(t);
  if (bloqueado) return {ok: false, estado: null, fecha: fecha, bloqueado: true};

  // Estado = la clave que aparece MÁS TEMPRANO (el encabezado, no la barra).
  let estado = null;
  let mejorIdx = Infinity;
  for (const c of CANDIDATOS) {
    for (const k of c.claves) {
      const i = t.indexOf(_norm(k));
      if (i >= 0 && i < mejorIdx) { mejorIdx = i; estado = c.estado; }
    }
  }

  return {ok: !!estado, estado: estado, fecha: fecha, bloqueado: false};
}

/*
 * Abre el navegador con perfil persistente (cookies estables entre corridas:
 * mejora la nota de reCAPTCHA con el tiempo). Quien la abre debe cerrarla
 * (ctx.close()) al terminar. Compartida entre rastrear.js (una guía) y
 * subir.js (varias guías en la misma sesión — más rápido y más "humano" que
 * abrir/cerrar un navegador por cada una).
 */
async function abrirContexto() {
  const {chromium} = require("playwright");
  return chromium.launchPersistentContext(PERFIL_DIR, {
    headless: false,
    viewport: {width: 1280, height: 900},
    locale: "es-PE",
  });
}

// ── Driver del navegador ──────────────────────────────────────────────────
// Si se pasa `opts.ctx` (un contexto ya abierto), lo REUTILIZA y NO lo cierra
// al terminar — así subir.js puede consultar muchas guías en una sola sesión.
// Sin `opts.ctx`, abre y cierra su propio contexto (uso suelto / CLI).
async function rastrear(numero, codigo, opts) {
  opts = opts || {};
  const ctxPropio = !opts.ctx;
  const ctx = opts.ctx || await abrirContexto();
  const page = await ctx.newPage();
  const out = {numero, codigo};

  try {
    await page.goto(RASTREA_URL, {waitUntil: "domcontentloaded", timeout: 45000});

    // Los dos primeros inputs de texto: N° de Orden y Código.
    const inputs = page.locator("input[type=text], input[type=search], input:not([type])");
    await inputs.first().waitFor({state: "visible", timeout: 20000});
    await inputs.nth(0).fill(String(numero));
    await inputs.nth(1).fill(String(codigo));

    const btn = page.getByRole("button", {name: /buscar/i}).first();
    if (await btn.count().catch(() => 0)) await btn.click();
    else await inputs.nth(1).press("Enter");

    // Esperamos a que la página pinte algo reconocible (estado o muro de login).
    const CLAVE_RE = /en\s*origen|en\s*tr[aá]nsito|en\s*destino|entregado|demora|inicia sesi/i;
    await page.waitForFunction(
        (re) => re.test(document.body.innerText), CLAVE_RE, {timeout: 20000},
    ).catch(() => {});
    await page.waitForTimeout(800); // que termine de asentarse

    const texto = await page.locator("body").innerText().catch(() => "");
    const res = parsearEstado(texto);
    Object.assign(out, res);

    // En modo debug guardamos TODO para calibrar el lector contra la realidad.
    if (opts.debug) {
      const dir = path.join(__dirname, "debug");
      fs.mkdirSync(dir, {recursive: true});
      const base = path.join(dir, numero + "_" + codigo);
      fs.writeFileSync(base + ".txt", texto, "utf8");
      await page.screenshot({path: base + ".png", fullPage: true}).catch(() => {});
      out.guardadoEn = base + ".{txt,png}";
    }
    return out;
  } finally {
    await page.waitForTimeout(opts.debug ? 1500 : 200);
    await page.close().catch(() => {});
    if (ctxPropio) await ctx.close().catch(() => {}); // solo cerramos lo que abrimos
  }
}

// ── CLI ─────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const debug = args.includes("--debug");
  const libres = args.filter((a) => !a.startsWith("--"));
  const numero = libres[0];
  const codigo = libres[1];

  if (!numero || !codigo) {
    console.log("Uso: node rastrear.js --debug <numero> <codigo>");
    console.log("Ej:  node rastrear.js --debug 92892656 ABCD");
    process.exit(1);
  }

  console.log("Abriendo Shalom para la guía", numero, "…");
  const r = await rastrear(numero, codigo, {debug});
  console.log("\n── Resultado ──");
  if (r.bloqueado) {
    console.log("⚠️  BLOQUEADO: Shalom pidió iniciar sesión / verificación (reCAPTCHA).");
    console.log("    Reintenta en un rato; si pasa siempre, tu IP está puntuando bajo.");
  } else if (r.ok) {
    console.log("✅ Estado:", r.estado, r.fecha ? "· " + r.fecha : "");
  } else {
    console.log("❓ No reconocí el estado. Revisa ./debug para ver qué mostró Shalom.");
  }
  if (r.guardadoEn) console.log("   Guardado:", r.guardadoEn);
}

// Exportamos parsearEstado para poder probarla sin abrir el navegador.
module.exports = {parsearEstado, rastrear, abrirContexto};

if (require.main === module) {
  main().catch((e) => { console.error("Error:", e && e.message || e); process.exit(1); });
}
