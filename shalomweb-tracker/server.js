"use strict";

/*
 * shalomweb-tracker — Fase 1
 * ==========================
 * Servicio que rastrea envios de Shalom usando un NAVEGADOR REAL (Playwright).
 *
 * Idea (limpia y legitima): abrimos shalom.com.pe/rastrea como lo haria una
 * persona, escribimos numero + codigo y damos "Buscar". La PROPIA pagina de
 * Shalom genera su token y su reCAPTCHA (nosotros NO los tocamos ni falsificamos)
 * y hace sus llamadas internas "buscar" y "estados". Nosotros solo INTERCEPTAMOS
 * la respuesta que esa pagina recibe, que ya viene en JSON limpio.
 *
 * En Fase 1 devolvemos el JSON crudo de "buscar" y "estados" para validar contra
 * un pedido real. La normalizacion a tus etiquetas (ENVIADO / LLEGO A DESTINO /
 * FINALIZADO) llega en Fase 2. No toca Firestore ni el panel todavia.
 */

const express = require("express");
const {chromium} = require("playwright");

const app = express();
const PORT = process.env.PORT || 8080;

// URL de la pagina de rastreo (configurable por si Shalom cambia la ruta).
const RASTREA_URL = process.env.RASTREA_URL || "https://shalom.com.pe/rastrea";

// Guardia opcional: si defines TRACK_KEY en el deploy, exige ?k=... o header.
const TRACK_KEY = process.env.TRACK_KEY || "";

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

// Rastrea un envio. Devuelve {ok, buscar, estados, ...}.
const track = async (numero, codigo, debug) => {
  const browser = await getBrowser();
  const ctx = await browser.newContext({
    userAgent: UA,
    viewport: {width: 1366, height: 900},
    locale: "es-PE",
  });
  const page = await ctx.newPage();
  const out = {numero: numero, codigo: codigo};
  const grab = {};

  // Interceptar las respuestas internas de la propia pagina.
  page.on("response", async (resp) => {
    const u = resp.url();
    if (u.indexOf("/rastrea/buscar") >= 0 ||
        u.indexOf("/rastrea/estados") >= 0) {
      const key = u.indexOf("/rastrea/buscar") >= 0 ? "buscar" : "estados";
      try {
        grab[key] = await resp.json();
      } catch (e) {
        try {
          grab[key + "_text"] = await resp.text();
        } catch (e2) {
          grab[key + "_err"] = String((e2 && e2.message) || e2);
        }
      }
      grab[key + "_status"] = resp.status();
    }
  });

  try {
    await page.goto(RASTREA_URL, {
      waitUntil: "domcontentloaded", timeout: 45000,
    });

    const {inNum, inCod} = await ubicarInputs(page);
    await inNum.waitFor({state: "visible", timeout: 20000});
    await inNum.fill(String(numero));
    await inCod.fill(String(codigo));

    // Preparar la espera de las respuestas ANTES de dar click.
    const waitBuscar = page.waitForResponse(
        (r) => r.url().indexOf("/rastrea/buscar") >= 0,
        {timeout: 30000}).catch(() => null);
    const waitEstados = page.waitForResponse(
        (r) => r.url().indexOf("/rastrea/estados") >= 0,
        {timeout: 30000}).catch(() => null);

    // Click en "Buscar" (dispara token + reCAPTCHA + llamadas de Shalom).
    const btn = page.getByRole("button", {name: /buscar/i}).first();
    if (await btn.count().catch(() => 0)) {
      await btn.click();
    } else {
      await inCod.press("Enter");
    }

    await Promise.all([waitBuscar, waitEstados]);
    // Respiro para que se resuelvan los .json() de las respuestas.
    await page.waitForTimeout(1500);

    out.ok = true;
    out.buscar = grab.buscar || grab.buscar_text || null;
    out.estados = grab.estados || grab.estados_text || null;
    out.status = {
      buscar: grab.buscar_status || null,
      estados: grab.estados_status || null,
    };

    if (debug) {
      out.bodyText = await page.locator("body").innerText()
          .catch(() => "").then((t) => String(t).slice(0, 2500));
      out.screenshot = (await page.screenshot({fullPage: false}))
          .toString("base64");
    }
    return out;
  } catch (e) {
    out.ok = false;
    out.error = String((e && e.message) || e);
    out.buscar = grab.buscar || grab.buscar_text || null;
    out.estados = grab.estados || grab.estados_text || null;
    if (debug) {
      try {
        out.screenshot = (await page.screenshot()).toString("base64");
      } catch (e2) {
        out.screenshotErr = String((e2 && e2.message) || e2);
      }
    }
    return out;
  } finally {
    await ctx.close().catch(() => {});
  }
};

const authOk = (req) =>
  !TRACK_KEY || req.query.k === TRACK_KEY ||
  req.get("x-track-key") === TRACK_KEY;

// Salud (Cloud Run hace ping a "/").
app.get("/", (req, res) => {
  res.json({ok: true, service: "shalomweb-tracker", fase: 1});
});

// Rastreo puntual: /track?numero=88124236&codigo=HHM9[&debug=1]
app.get("/track", async (req, res) => {
  if (!authOk(req)) {
    res.status(401).json({ok: false, error: "No autorizado"});
    return;
  }
  const numero = String(req.query.numero || "").trim();
  const codigo = String(req.query.codigo || "").trim();
  const debug = req.query.debug === "1";
  if (!numero || !codigo) {
    res.status(400).json({ok: false, error: "Faltan numero y/o codigo"});
    return;
  }
  try {
    const r = await track(numero, codigo, debug);
    res.status(r.ok ? 200 : 502).json(r);
  } catch (e) {
    res.status(500).json({ok: false, error: String((e && e.message) || e)});
  }
});

app.listen(PORT, () => {
  console.log("shalomweb-tracker escuchando en :" + PORT);
});
