"use strict";

const path = require("path");
const fs = require("fs");

const RASTREA_URL = "https://shalom.com.pe/rastrea";
const PERFIL_DIR = path.join(__dirname, ".perfil");

const CANDIDATOS = [
  {estado: "Demora de envíos", claves: ["demora", "retras"]},
  {estado: "Entregado", claves: ["entregado", "recogido", "recepcion del destinatario", "culminado"]},
  {estado: "En destino", claves: ["listo para su recojo", "en agencia de destino", "disponible para", "a disposicion", "en destino"]},
  {estado: "En tránsito", claves: ["viaja", "en camino", "rumbo a", "en transito", "en traslado", "reparto"]},
  {estado: "En origen", claves: ["recepcionado", "en origen"]},
];

const _norm = (s) => String(s || "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function parsearEstado(textoVisible) {
  const crudo = String(textoVisible || "");
  const t = _norm(crudo).replace(/\s+/g, " ");

  let fecha = null;
  const mF = crudo.match(/[Dd]esde el\s+([\d/]+)\s+a las\s+([\d:]+)/);
  if (mF) fecha = mF[1] + " " + mF[2];

  const bloqueado = /inicia sesion para rastrear|para poder rastrear tu envio necesitas/.test(t);
  if (bloqueado) return {ok: false, estado: null, fecha: fecha, bloqueado: true};

  const noEncontrado = /no se encontro la orden de servicio/.test(t);
  if (noEncontrado) {
    return {ok: false, estado: null, fecha: fecha, bloqueado: false, noEncontrado: true};
  }

  const errorShalom = /algo no ha funcionado correctamente/.test(t);
  if (errorShalom) {
    return {ok: false, estado: null, fecha: fecha, bloqueado: false, errorShalom: true};
  }

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

async function abrirContexto() {
  const {chromium} = require("playwright");
  return chromium.launchPersistentContext(PERFIL_DIR, {
    headless: false,
    viewport: {width: 1280, height: 900},
    locale: "es-PE",
  });
}

async function rastrear(numero, codigo, opts) {
  opts = opts || {};
  const ctxPropio = !opts.ctx;
  const ctx = opts.ctx || await abrirContexto();
  const page = await ctx.newPage();
  const out = {numero, codigo};

  try {
    await page.goto(RASTREA_URL, {waitUntil: "domcontentloaded", timeout: 45000});

    const inputs = page.locator("input[type=text], input[type=search], input:not([type])");
    await inputs.first().waitFor({state: "visible", timeout: 20000});
    await inputs.nth(0).fill(String(numero));
    await inputs.nth(1).fill(String(codigo));

    const btn = page.getByRole("button", {name: /buscar/i}).first();
    if (await btn.count().catch(() => 0)) await btn.click();
    else await inputs.nth(1).press("Enter");

    const CLAVE_RE = /en\s*origen|en\s*tr[aá]nsito|en\s*destino|entregado|demora|inicia sesi|no se encontr[oó]|algo no ha funcionado/i;
    await page.waitForFunction(
        (re) => re.test(document.body.innerText), CLAVE_RE, {timeout: 20000},
    ).catch(() => {});
    await page.waitForTimeout(800);

    const texto = await page.locator("body").innerText().catch(() => "");
    const res = parsearEstado(texto);
    Object.assign(out, res);
    out.textoBruto = texto;

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
    if (ctxPropio) await ctx.close().catch(() => {});
  }
}

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

module.exports = {parsearEstado, rastrear, abrirContexto};

if (require.main === module) {
  main().catch((e) => { console.error("Error:", e && e.message || e); process.exit(1); });
}
