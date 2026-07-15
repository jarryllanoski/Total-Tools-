"use strict";

/*
 * shalomweb-tracker — Fase 1b
 * ============================
 * Servicio que rastrea envios de Shalom usando un NAVEGADOR REAL (Playwright).
 *
 * Idea (limpia y legitima): abrimos shalom.com.pe/rastrea como lo haria una
 * persona, escribimos numero + codigo y damos "Buscar". La PROPIA pagina de
 * Shalom genera su token, resuelve su reCAPTCHA y descifra su respuesta
 * (Shalom cifra el cuerpo de "buscar"/"estados"; NO intentamos descifrarlo
 * nosotros — eso seria romper su cifrado, y no lo vamos a hacer).
 *
 * En vez de leer la red, leemos el TEXTO YA RENDERIZADO en pantalla — lo mismo
 * que veria una persona — una vez que la pagina termino de pintar el resultado.
 * Es el equivalente automatizado de "abrir la pagina y mirar".
 *
 * En Fase 1b devolvemos ese texto para validar contra un pedido real. La
 * normalizacion fina a tus etiquetas (ENVIADO / LLEGO A DESTINO / FINALIZADO)
 * se termina de afinar en Fase 2. No toca Firestore ni el panel todavia.
 */

const express = require("express");
const {chromium} = require("playwright");

const app = express();
const PORT = process.env.PORT || 8080;

// URL de la pagina de rastreo (configurable por si Shalom cambia la ruta).
const RASTREA_URL = process.env.RASTREA_URL || "https://shalom.com.pe/rastrea";

// Guardia opcional: si defines TRACK_KEY en el deploy, exige ?k=... o header.
const TRACK_KEY = process.env.TRACK_KEY || "";

// Validacion de entrada: numero solo digitos; codigo solo alfanumerico.
const RE_NUMERO = /^\d{6,12}$/;
const RE_CODIGO = /^[A-Za-z0-9]{3,12}$/;

// Tope global de una consulta (backstop; los pasos tienen su propio timeout).
const TRACK_TIMEOUT_MS = 60000;

// Envuelve una promesa con un limite de tiempo (rechaza si se pasa).
const withTimeout = (p, ms, label) => {
  let t;
  const guard = new Promise((_, rej) => {
    t = setTimeout(
        () => rej(new Error("Timeout " + label + " (" + ms + "ms)")), ms);
  });
  return Promise.race([p, guard]).finally(() => clearTimeout(t));
};

// User-Agent realista (navegador de escritorio comun).
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" +
  " (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Un solo navegador para todo el servicio; contexto nuevo por peticion.
let _browser = null;

const getBrowser = async () => {
  if (_browser && _browser.isConnected()) return _browser;
  _browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  return _browser;
};

// Localiza los dos inputs (numero / codigo) con varias estrategias, por si el
// placeholder cambia. Devuelve {inNum, inCod}.
const ubicarInputs = async (page) => {
  // 1) Por placeholder (lo que vimos: "N° de Orden" / "Código de Orden").
  let inNum = page.getByPlaceholder(/n.*orden/i).first();
  let inCod = page.getByPlaceholder(/c.digo/i).first();
  const okNum = await inNum.count().catch(() => 0);
  const okCod = await inCod.count().catch(() => 0);
  if (okNum && okCod) return {inNum, inCod};
  // 2) Fallback: los dos primeros inputs de texto de la pagina.
  const inputs = page.locator(
      "input[type=text], input[type=search], input:not([type])");
  inNum = inputs.nth(0);
  inCod = inputs.nth(1);
  return {inNum, inCod};
};

// Palabras clave para detectar el estado a partir del texto YA renderizado
// (no de la red, que va cifrada). Motor propio y separado del de tracking.js.
const KW_ENTREGADO = ["entregado", "entrega realizada", "recojo completado"];
const KW_DESTINO = ["en destino", "listo para su recojo", "disponible"];
const KW_TRANSITO = ["en tránsito", "en transito", "rumbo a su destino"];
const KW_ORIGEN = ["en origen"];

const _norm = (s) => String(s || "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// Extrae el titulo real del resultado: la linea que sigue al boton "Buscar",
// ANTES de la lista de la linea de tiempo (que siempre lista los 4 pasos,
// completados o no — por eso no basta con buscar "entregado" en todo el
// texto: esa palabra SIEMPRE aparece como etiqueta del ultimo paso).
const extraerEncabezado = (texto) => {
  const m = String(texto || "").match(/Buscar\s*\n+\s*([^\n]+)/i);
  return m ? m[1].trim() : null;
};

// Clasifica un texto corto (el encabezado) por palabras clave.
const clasificar = (texto) => {
  const t = _norm(texto);
  const hit = (arr) => arr.some((k) => t.indexOf(_norm(k)) >= 0);
  if (hit(KW_ENTREGADO)) return "ENTREGADO";
  if (hit(KW_DESTINO)) return "EN_DESTINO";
  if (hit(KW_TRANSITO)) return "EN_TRANSITO";
  if (hit(KW_ORIGEN)) return "EN_ORIGEN";
  return null;
};

// Respaldo: si no se pudo aislar el encabezado (p.ej. cambio el texto del
// boton), usa la PRIMERA aparicion de cualquier palabra clave en todo el
// texto — el titulo real siempre aparece antes que la lista de la linea de
// tiempo, asi que la coincidencia con el indice mas bajo es la correcta.
const detectarEstadoPorPosicion = (texto) => {
  const t = _norm(texto);
  const grupos = [
    {estado: "ENTREGADO", palabras: KW_ENTREGADO},
    {estado: "EN_DESTINO", palabras: KW_DESTINO},
    {estado: "EN_TRANSITO", palabras: KW_TRANSITO},
    {estado: "EN_ORIGEN", palabras: KW_ORIGEN},
  ];
  let mejorEstado = null;
  let mejorIdx = Infinity;
  grupos.forEach((g) => {
    g.palabras.forEach((p) => {
      const idx = t.indexOf(_norm(p));
      if (idx >= 0 && idx < mejorIdx) {
        mejorIdx = idx;
        mejorEstado = g.estado;
      }
    });
  });
  return mejorEstado;
};

// Detecta el estado a partir del texto visible de la pagina (encabezado
// primero; si no se pudo aislar, cae al metodo por posicion).
const detectarEstado = (texto) => {
  const encabezado = extraerEncabezado(texto);
  if (encabezado) {
    const c = clasificar(encabezado);
    if (c) return c;
  }
  return detectarEstadoPorPosicion(texto);
};

// Rastrea un envio. Devuelve {ok, estadoDetectado, textoVisible, ...}.
const track = async (numero, codigo, debug) => {
  const browser = await getBrowser();
  const ctx = await browser.newContext({
    userAgent: UA,
    viewport: {width: 1366, height: 900},
    locale: "es-PE",
  });
  const page = await ctx.newPage();
  const out = {numero: numero, codigo: codigo};
  const netStatus = {};

  // Solo registramos el status HTTP (diagnostico). El cuerpo va cifrado por
  // Shalom y no lo leemos ni intentamos descifrarlo: dejamos que su propia
  // pagina lo descifre y lo pinte; nosotros leemos la pantalla, no la red.
  page.on("response", (resp) => {
    const u = resp.url();
    if (u.indexOf("/rastrea/buscar") >= 0) netStatus.buscar = resp.status();
    if (u.indexOf("/rastrea/estados") >= 0) netStatus.estados = resp.status();
  });

  try {
    await page.goto(RASTREA_URL, {
      waitUntil: "domcontentloaded", timeout: 45000,
    });

    const {inNum, inCod} = await ubicarInputs(page);
    await inNum.waitFor({state: "visible", timeout: 20000});
    await inNum.fill(String(numero));
    await inCod.fill(String(codigo));

    // Click en "Buscar" (dispara token + reCAPTCHA + llamadas de Shalom).
    const btn = page.getByRole("button", {name: /buscar/i}).first();
    if (await btn.count().catch(() => 0)) {
      await btn.click();
    } else {
      await inCod.press("Enter");
    }

    // Esperar a que la propia pagina PINTE el resultado (ya descifrado).
    // No dependemos de una clase CSS especifica: esperamos a que aparezca
    // en el texto visible alguna de las palabras clave de estado.
    const KEY_RE =
      /entregado|en\s*tr[aá]nsito|en\s*destino|en\s*origen|no\s*se\s*encontr/i;
    await page.waitForFunction(
        (re) => re.test(document.body.innerText),
        KEY_RE,
        {timeout: 20000},
    ).catch(() => {});

    // Respiro corto para que termine de asentarse el render.
    await page.waitForTimeout(800);

    const textoVisible = await page.locator("body").innerText()
        .catch(() => "");

    out.ok = true;
    out.encabezado = extraerEncabezado(textoVisible);
    out.estadoDetectado = detectarEstado(textoVisible);
    out.netStatus = netStatus;

    // "Sobre" compatible con el que ya interpreta tracking.js (aplicarResultado
    // / detectarEstadoAuto). Le mandamos el TITULO REAL que muestra Shalom
    // ("En destino", "Entregado", "En tránsito"...) como "message": ese texto
    // ya usa las mismas palabras clave que tu cerebro de tracking sabe leer,
    // asi que NO reinventamos aqui el mapeo a ENVIADO/LLEGÓ A DESTINO/
    // FINALIZADO — esa regla de negocio sigue viviendo en un solo lugar
    // (tracking.js), evitando que dos motores decidan cosas distintas.
    out.statuses = {
      message: out.encabezado || null,
      historial: [],
    };

    // Solo en modo debug incluimos el texto completo de la pagina (puede
    // traer datos personales del destinatario, p.ej. nombre y DNI en el caso
    // "Entregado") y la captura. Fuera de debug no se exponen ni se deben
    // persistir.
    if (debug) {
      out.textoVisible = String(textoVisible).slice(0, 3000);
      out.screenshot = (await page.screenshot({fullPage: false}))
          .toString("base64");
    }
    return out;
  } catch (e) {
    out.ok = false;
    out.error = String((e && e.message) || e);
    out.netStatus = netStatus;
    if (debug) {
      try {
        out.screenshot = (await page.screenshot()).toString("base64");
      } catch (e2) {
        out.screenshotErr = String((e2 && e2.message) || e2);
      }
    }
    return out;
  } finally {
    await page.close().catch(() => {});
    await ctx.close().catch(() => {});
  }
};

const authOk = (req) =>
  !TRACK_KEY || req.query.k === TRACK_KEY ||
  req.get("x-track-key") === TRACK_KEY;

// Salud (Cloud Run hace ping a "/"). No abre Chromium.
const salud = (req, res) => {
  res.json({ok: true, service: "shalomweb-tracker", fase: 1});
};
app.get("/", salud);
app.get("/health", salud);

// Rastreo puntual: /track?numero=88124236&codigo=HHM9[&debug=1]
app.get("/track", async (req, res) => {
  if (!authOk(req)) {
    res.status(401).json({ok: false, error: "No autorizado"});
    return;
  }
  const numero = String(req.query.numero || "").trim();
  const codigo = String(req.query.codigo || "").trim().toUpperCase();
  const debug = req.query.debug === "1";
  if (!numero || !codigo) {
    res.status(400).json({ok: false, error: "Faltan numero y/o codigo"});
    return;
  }
  if (!RE_NUMERO.test(numero)) {
    res.status(400).json({ok: false, error: "numero invalido (6-12 digitos)"});
    return;
  }
  if (!RE_CODIGO.test(codigo)) {
    res.status(400).json({
      ok: false, error: "codigo invalido (3-12 letras/numeros)",
    });
    return;
  }
  try {
    const r = await withTimeout(
        track(numero, codigo, debug), TRACK_TIMEOUT_MS, "track");
    res.status(r.ok ? 200 : 502).json(r);
  } catch (e) {
    res.status(504).json({ok: false, error: String((e && e.message) || e)});
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("shalomweb-tracker escuchando en 0.0.0.0:" + PORT);
});
