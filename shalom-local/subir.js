"use strict";

const path = require("path");
const fs = require("fs");
const https = require("https");
const {rastrear, abrirContexto} = require("./rastrear.js");

const PAUSA_ENTRE_CONSULTAS_MS = 2500;

const ESPERA_INTERNET_MS = 2 * 60 * 1000;
function hayInternet() {
  return new Promise((resolve) => {
    const req = https.get("https://shalom.com.pe", {timeout: 8000}, (res) => {
      res.destroy();
      resolve(true);
    });
    req.on("timeout", () => { req.destroy(); resolve(false); });
    req.on("error", () => resolve(false));
  });
}
async function esperarInternet(maxMs) {
  const desde = Date.now();
  do {
    if (await hayInternet()) return true;
    await new Promise((r) => setTimeout(r, 10000));
  } while (Date.now() - desde < maxMs);
  return false;
}

const VIGIA_MIN = 20;

const KEYWORDS_ENTREGADO = ["entregado", "recogido"];
const KEYWORDS_DESTINO = ["en destino", "a disposicion", "listo para su recojo", "disponible"];

const _norm = (s) => String(s || "").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "");

function detectarEstadoAuto(estadoTexto) {
  if (!estadoTexto) return null;
  const t = _norm(estadoTexto);
  if (KEYWORDS_ENTREGADO.some((k) => t.indexOf(_norm(k)) >= 0)) return "FINALIZADO";
  if (KEYWORDS_DESTINO.some((k) => t.indexOf(_norm(k)) >= 0)) return "EN_DESTINO";
  return null;
}

function decidirCambios(ship, lectura, cfg) {
  const nowMs = Date.now();
  if (lectura.bloqueado) return {cambio: false, motivo: "BLOQUEADO"};
  if (lectura.noEncontrado) return {cambio: false, motivo: "NO_ENCONTRADO"};
  if (lectura.errorShalom) return {cambio: false, motivo: "ERROR_SHALOM"};
  if (!lectura.ok || !lectura.estado) return {cambio: false, motivo: "SIN_DATO"};

  const estadoTexto = lectura.estado;
  const autoEstado = detectarEstadoAuto(estadoTexto);
  const cambios = {trackingLastAutoCheck: nowMs};

  if (ship.trackingStatus !== estadoTexto) {
    const hist = Array.isArray(ship.trackingHistory) ? ship.trackingHistory.slice() : [];
    hist.push({date: nowMs === nowMs ? new Date(nowMs).toISOString() : null,
      status: estadoTexto, message: estadoTexto, source: "shalom-local"});
    cambios.trackingStatus = estadoTexto;
    cambios.trackingMessage = estadoTexto;
    cambios.trackingLastUpdate = new Date(nowMs).toISOString();
    cambios.trackingHistory = hist;
  }

  let resultado = "ok";
  if (autoEstado === "FINALIZADO")      resultado = "FINALIZADO";
  else if (autoEstado === "EN_DESTINO") resultado = "EN_DESTINO";

  return {cambio: true, cambios: cambios, resultado: resultado, estado: estadoTexto};
}

const LOCK = path.join(__dirname, ".corriendo.lock");
let candadoTomado = false;

const INTERVALO_MIN = 360;

function tomarCandado() {
  try {
    if (fs.existsSync(LOCK)) {
      const pid = parseInt(fs.readFileSync(LOCK, "utf8").trim(), 10);
      let vivo = false;
      try { process.kill(pid, 0); vivo = true; } catch (e) { vivo = false; }
      if (vivo) return false;
      fs.unlinkSync(LOCK);
    }
    fs.writeFileSync(LOCK, String(process.pid), "utf8");
    candadoTomado = true;
    return true;
  } catch (e) { return true; }
}
function soltarCandado() { try { fs.unlinkSync(LOCK); } catch (e) {} }

function registrar(linea) {
  try {
    const dir = path.join(__dirname, "logs");
    fs.mkdirSync(dir, {recursive: true});
    const ahora = new Date();
    const mes = ahora.getFullYear() + "-" + String(ahora.getMonth() + 1).padStart(2, "0");
    const sello = ahora.toLocaleString("es-PE", {hour12: false}).replace(",", "");
    fs.appendFileSync(path.join(dir, mes + ".log"), "[" + sello + "] " + linea + "\n", "utf8");

    const limite = new Date(ahora.getFullYear(), ahora.getMonth() - 3, 1);
    fs.readdirSync(dir).forEach((f) => {
      const m = f.match(/^(\d{4})-(\d{2})\.log$/);
      if (!m) return;
      if (new Date(+m[1], +m[2] - 1, 1) < limite) {
        try { fs.unlinkSync(path.join(dir, f)); } catch (e) {}
      }
    });
  } catch (e) {  }
}

const MAX_EVENTOS = 100;
async function escribirLatido(db, resumen, eventos) {
  try {
    const snap = await db.doc("panel/config").get();
    const prev = (snap.exists && snap.data().salud) || {};
    const salud = Object.assign({}, prev, resumen);
    if (eventos && eventos.length) {
      const todos = (Array.isArray(prev.eventos) ? prev.eventos : []).concat(eventos);
      salud.eventos = todos.slice(-MAX_EVENTOS);
    }
    await db.doc("panel/config").set({salud: salud}, {merge: true});
  } catch (e) {
    console.log("   (no se pudo escribir el latido: " + (e && e.message || e) + ")");
  }
}

function requiereAdmin() {
  const keyPath = path.join(__dirname, "serviceAccount.json");
  if (!fs.existsSync(keyPath)) {
    console.log("❌ Falta serviceAccount.json en esta carpeta.");
    console.log("   Firebase Console → ⚙️ Configuración del proyecto → Cuentas");
    console.log("   de servicio → \"Generar nueva clave privada\" → guárdalo aquí");
    console.log("   con el nombre exacto serviceAccount.json (ver README.md).");
    process.exit(1);
  }
  const admin = require("firebase-admin");
  if (!admin.apps.length) {
    admin.initializeApp({credential: admin.credential.cert(require(keyPath))});
  }
  return admin.firestore();
}

async function obtenerPendientes(db, soloOrden) {
  const snap = await db.collection("panel/shipments/items")
      .where("courier", ">=", "SHALOM").where("courier", "<=", "SHALOM").get();
  const out = [];
  snap.forEach((doc) => {
    const s = doc.data();
    const guia = s.trackingOrderNumber || s.shalomGuia || "";
    const codigo = s.trackingOrderCode || s.shalomCodigo || "";
    if (!guia || !codigo) return;
    if (s.status === "FINALIZADO") return;
    if (soloOrden && guia !== soloOrden) return;
    out.push({id: doc.id, ship: s, guia: guia, codigo: codigo});
  });
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const soloOrden = args.find((a) => !a.startsWith("--"));
  const arrancado = Date.now();

  if (!(await esperarInternet(ESPERA_INTERNET_MS))) {
    console.log("❌ Sin Internet tras " + Math.round(ESPERA_INTERNET_MS / 60000) + " min de espera — se salta esta corrida.");
    registrar("saltada (sin Internet tras " + Math.round(ESPERA_INTERNET_MS / 60000) + " min de espera)");
    return;
  }

  if (!soloOrden && !tomarCandado()) {
    console.log("⏭️  Ya hay una corrida en curso — esta se salta.");
    registrar("saltada (ya había una corrida en curso)");
    return;
  }

  const db = requiereAdmin();
  const cfgSnap = await db.doc("panel/config").get();
  const cfg = (cfgSnap.exists && cfgSnap.data().config) || {};

  const pendientes = await obtenerPendientes(db, soloOrden);
  if (!pendientes.length) {
    console.log(soloOrden ?
      "No encontré ese pedido (¿guía correcta? ¿ya finalizado?)." :
      "No hay pedidos Shalom pendientes con guía y código.");
    return;
  }
  console.log((dryRun ? "🔎 (simulación) " : "") +
    "Consultando " + pendientes.length + " pedido" + (pendientes.length !== 1 ? "s" : "") + "…\n");

  const ctx = await abrirContexto();
  let ok = 0, sinDato = 0, bloqueados = 0, noEncontrados = 0, erroresShalom = 0;
  const eventos = [];
  const anotar = (codigo, item, msg) => eventos.push({
    ts: new Date().toISOString(), nivel: "error", codigo: codigo,
    pedidoId: item.id, pedido: item.ship.name || item.id, msg: msg || "",
  });
  try {
    for (let i = 0; i < pendientes.length; i++) {
      const item = pendientes[i];
      const nombre = item.ship.name || item.id;
      process.stdout.write("  " + nombre + " (" + item.guia + ")… ");
      let lectura;
      try {
        lectura = await rastrear(item.guia, item.codigo, {ctx: ctx});
      } catch (e) {
        lectura = {ok: false, bloqueado: false, motivo: "ERROR: " + (e && e.message || e)};
      }
      const dec = decidirCambios(item.ship, lectura, cfg);
      if (!dec.cambio) {
        if (dec.motivo === "BLOQUEADO") {
          bloqueados++; console.log("⚠️  bloqueado (reCAPTCHA/login)");
          anotar("SHALOM_BLOQUEO", item, "Shalom pidió verificación");
        } else if (dec.motivo === "NO_ENCONTRADO") {
          noEncontrados++;
          console.log("🔴 guía/código no coinciden con ningún pedido — revisa el número de orden");
          anotar("GUIA_NO_ENCONTRADA", item, "guía " + item.guia + " / " + item.codigo);
        } else if (dec.motivo === "ERROR_SHALOM") {
          erroresShalom++;
          console.log("⚠️  Shalom tuvo un error temporal — se reintentará más tarde");
          anotar("SHALOM_ERROR_TEMPORAL", item, "reintento en la próxima corrida");
        } else {
          sinDato++;
          let dondeQuedo = "";
          if (lectura.textoBruto) {
            const dir = path.join(__dirname, "debug");
            fs.mkdirSync(dir, {recursive: true});
            const archivo = path.join(dir, "sindato_" + item.guia + "_" + item.codigo + ".txt");
            fs.writeFileSync(archivo, lectura.textoBruto, "utf8");
            dondeQuedo = " — guardado en debug/" + path.basename(archivo);
          }
          console.log("❓ sin dato reconocible" + dondeQuedo);
          anotar("ESTADO_NO_RECONOCIDO", item, "revisar debug/");
        }
      } else {
        console.log("✅ " + dec.estado + (dec.resultado !== "ok" ? " → " + dec.resultado : ""));
        if (!dryRun) {
          await db.doc("panel/shipments/items/" + item.id).set(dec.cambios, {merge: true});
        }
        ok++;
      }
      if (i < pendientes.length - 1) await new Promise((r) => setTimeout(r, PAUSA_ENTRE_CONSULTAS_MS));
    }
  } finally {
    await ctx.close().catch(() => {});
  }

  const seg = Math.round((Date.now() - arrancado) / 1000);
  const dur = seg < 60 ? seg + "s" : Math.floor(seg / 60) + "m " + (seg % 60) + "s";

  console.log("\n── Resumen ──");
  console.log("✅ " + ok + " actualizado" + (ok !== 1 ? "s" : "") +
    (dryRun ? " (simulación — nada se escribió)" : ""));
  if (noEncontrados) console.log("🔴 " + noEncontrados + " con guía/código que Shalom no reconoce — revisa esos números");
  if (erroresShalom) console.log("⚠️  " + erroresShalom + " con error temporal de Shalom (no es tu dato — se reintenta solo)");
  if (bloqueados) console.log("⚠️  " + bloqueados + " bloqueados por reCAPTCHA (reintenta más tarde)");
  if (sinDato) console.log("❓ " + sinDato + " sin dato reconocible — revisa debug/ para calibrar");

  const resumenTxt = ok + " actualizados · " + noEncontrados + " guía no reconocida · " +
    erroresShalom + " error Shalom · " + bloqueados + " bloqueados · " + sinDato +
    " sin dato (" + dur + ")" + (dryRun ? " [simulación]" : "");
  registrar((soloOrden ? "[guía " + soloOrden + "] " : "") + resumenTxt);

  if (!dryRun && !soloOrden) {
    await escribirLatido(db, {
      activo: true,
      motor: "pc-local",
      equipo: require("os").hostname(),
      ultimaCorrida: new Date().toISOString(),
      intervaloMin: INTERVALO_MIN,
      enCola: pendientes.length,
      procesados: ok,
      errores: bloqueados + erroresShalom + sinDato,
      sinGuia: noEncontrados,
      duracionSeg: seg,
    }, eventos);
  }
}

module.exports = {decidirCambios, detectarEstadoAuto};

if (require.main === module) {
  process.on("exit", function(){ if (candadoTomado) soltarCandado(); });
  process.on("SIGINT", function(){ process.exit(130); });

  const vigia = setTimeout(() => {
    console.error("⏱️  La corrida superó " + VIGIA_MIN + " min — se fuerza el cierre.");
    registrar("ERROR: se forzó el cierre por exceder " + VIGIA_MIN + " min (vigía)");
    process.exit(1);
  }, VIGIA_MIN * 60 * 1000);

  main().then(() => clearTimeout(vigia)).catch((e) => {
    clearTimeout(vigia);
    console.error("Error:", e && e.message || e);
    registrar("ERROR: " + (e && e.message || e));
    process.exit(1);
  });
}
