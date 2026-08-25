"use strict";

/*
 * subir.js — Fase B: consulta los pedidos Shalom pendientes y sube el estado
 * =============================================================================
 * Lee de tu Firestore los pedidos Shalom con guía+código que aún no terminaron,
 * los consulta con el lector de rastrear.js (tu navegador, tu IP, el mismo que
 * ya probamos), y escribe el resultado de vuelta — respetando el modo de
 * etiquetas de tu Config, exactamente como lo hace el botón ⟳ del panel.
 *
 * NO ES EL MISMO CÓDIGO que tracking.js `_aplicarEstadoShalom` — es una copia
 * deliberada, pura (sin DOM), porque el navegador y Node no comparten módulos
 * en este proyecto. Es el MISMO patrón que ya usa functions/shalomWebSync.js
 * para sus palabras clave: motor aislado, misma regla, documentado a propósito.
 * Si cambias la regla de etiquetas en tracking.js, cámbiala aquí también.
 *
 * REGLA DE ORO (la misma de siempre): si Shalom no dio un dato real, NO se
 * toca el pedido. Nunca se finge éxito.
 *
 * USO:
 *   node subir.js            → consulta todos los pendientes y escribe
 *   node subir.js --dry-run  → consulta y MUESTRA qué escribiría, sin tocar Firestore
 *   node subir.js 92678946   → una sola guía puntual (por su N° de orden)
 *
 * Requiere `serviceAccount.json` en esta carpeta (ver README.md — Fase B).
 */

const path = require("path");
const fs = require("fs");
const https = require("https");
const {rastrear, abrirContexto} = require("./rastrear.js");

const PAUSA_ENTRE_CONSULTAS_MS = 2500; // gentil con Shalom — mismo ritmo que el
//   worker viejo, para no verse como una ráfaga de bot.

// ── Internet REAL antes de arrancar ─────────────────────────────────────────
// Cuando el Programador despierta la PC de la suspensión, Windows puede tardar
// en reconectar el Wi-Fi aunque el ícono ya diga "conectado". Si abrimos el
// navegador contra una red que no responde, rastrear.js puede quedarse
// esperando mucho más de lo esperado. Se comprueba con una petición real (no
// basta con el estado del adaptador) y se reintenta antes de rendirse.
const ESPERA_INTERNET_MS = 2 * 60 * 1000; // 2 minutos de margen tras despertar
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

// ── Vigía: nunca colgado más de la cuenta ───────────────────────────────────
// Segundo seguro además del "Detener la tarea si se ejecuta más de..." del
// Programador: si CUALQUIER paso se cuelga (perfil de navegador bloqueado por
// una corrida zombie, red que nunca vuelve, lo que sea), esto fuerza el cierre
// en vez de dejar un node.exe vivo para siempre bloqueando las próximas corridas.
const VIGIA_MIN = 20;

// ── Reglas de negocio — COPIA DELIBERADA de tracking.js, ver cabecera ───────
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

function modoEtiqueta(cfg) {
  const m = cfg && cfg.trackingEtiquetaModo;
  if (m === "off" || m === "auto" || m === "semi") return m;
  return (cfg && cfg.trackingWebCambiaEtiqueta) ? "auto" : "off";
}

/*
 * Decide qué escribir en Firestore para UN pedido, a partir de la lectura del
 * lector. Devuelve SOLO los campos que cambian (nunca el objeto completo — el
 * mismo principio que ya corrigió el bug de window.save: no reescribir de más).
 *   {cambio:true,  cambios:{...}, resultado}
 *   {cambio:false, motivo}   ← sin dato real: no se escribe nada
 */
function decidirCambios(ship, lectura, cfg) {
  const nowMs = Date.now();
  if (lectura.bloqueado) return {cambio: false, motivo: "BLOQUEADO"};
  // "No se encontró la orden de servicio": dato mal tecleado, no un fallo.
  if (lectura.noEncontrado) return {cambio: false, motivo: "NO_ENCONTRADO"};
  // "Ups, algo no ha funcionado correctamente": tropiezo DE SHALOM, no del dato.
  if (lectura.errorShalom) return {cambio: false, motivo: "ERROR_SHALOM"};
  if (!lectura.ok || !lectura.estado) return {cambio: false, motivo: "SIN_DATO"};

  const estadoTexto = lectura.estado;
  const autoEstado = detectarEstadoAuto(estadoTexto);
  const cambios = {trackingLastAutoCheck: nowMs};

  // 1) Tracking visible: solo si el texto cambió (igual que el navegador).
  if (ship.trackingStatus !== estadoTexto) {
    const hist = Array.isArray(ship.trackingHistory) ? ship.trackingHistory.slice() : [];
    hist.push({date: nowMs === nowMs ? new Date(nowMs).toISOString() : null,
      status: estadoTexto, message: estadoTexto, source: "shalom-local"});
    cambios.trackingStatus = estadoTexto;
    cambios.trackingMessage = estadoTexto;
    cambios.trackingLastUpdate = new Date(nowMs).toISOString();
    cambios.trackingHistory = hist;
  }

  // 2) Etiqueta: según el modo, SOLO hacia adelante, nunca retrocede.
  const modo = modoEtiqueta(cfg);
  let resultado = "ok";
  if (modo !== "off") {
    if (autoEstado === "FINALIZADO") {
      if (modo !== "semi" && ship.status !== "FINALIZADO") cambios.status = "FINALIZADO";
      resultado = "FINALIZADO";
    } else if (autoEstado === "EN_DESTINO") {
      const conSaldo = ship.cost && parseFloat(ship.cost) > 0;
      if (conSaldo && ["PENDIENTE DE PAGO", "FINALIZADO"].indexOf(ship.status) < 0) {
        cambios.status = "PENDIENTE DE PAGO"; resultado = "EN_DESTINO";
      } else if (["LLEGÓ A DESTINO", "PENDIENTE DE PAGO", "FINALIZADO"].indexOf(ship.status) < 0) {
        cambios.status = "LLEGÓ A DESTINO"; resultado = "EN_DESTINO";
      } else { resultado = "EN_DESTINO"; }
    } else if (["NUEVO PEDIDO", "EN PROCESO", "POR ALISTAR", "ALISTADO"].indexOf(ship.status) >= 0) {
      cambios.status = "ENVIADO"; resultado = "ENVIADO";
    }
  }

  return {cambio: true, cambios: cambios, resultado: resultado, estado: estadoTexto};
}

// ── Candado: nunca dos corridas a la vez ────────────────────────────────────
// El Programador puede disparar mientras una corrida sigue viva (PC lenta, o
// una corrida larga). Sin esto tendrías DOS navegadores golpeando Shalom a la
// vez — justo lo que sube el riesgo de bloqueo. El candado guarda el PID: si el
// proceso que lo dejó ya murió (corte de luz, cierre forzado), se ignora solo.
const LOCK = path.join(__dirname, ".corriendo.lock");
let candadoTomado = false;

// Cada cuánto corre la tarea programada. El panel lo usa para saber a partir de
// cuándo alarmarse: con 6 h, avisar a las 3 h daría rojo casi siempre.
const INTERVALO_MIN = 360;

function tomarCandado() {
  try {
    if (fs.existsSync(LOCK)) {
      const pid = parseInt(fs.readFileSync(LOCK, "utf8").trim(), 10);
      let vivo = false;
      try { process.kill(pid, 0); vivo = true; } catch (e) { vivo = false; }
      if (vivo) return false;              // otra corrida en curso: no arrancamos
      fs.unlinkSync(LOCK);                 // candado huérfano: se limpia solo
    }
    fs.writeFileSync(LOCK, String(process.pid), "utf8");
    candadoTomado = true;
    return true;
  } catch (e) { return true; } // ante la duda, dejamos correr (no bloquear por el candado)
}
function soltarCandado() { try { fs.unlinkSync(LOCK); } catch (e) {} }

// ── Registro mensual ────────────────────────────────────────────────────────
// Un archivo por mes, y se borran solos los de más de 3 meses. Sin esto, una
// corrida que falla de madrugada no deja rastro y volvemos al fallo silencioso.
function registrar(linea) {
  try {
    const dir = path.join(__dirname, "logs");
    fs.mkdirSync(dir, {recursive: true});
    const ahora = new Date();
    const mes = ahora.getFullYear() + "-" + String(ahora.getMonth() + 1).padStart(2, "0");
    const sello = ahora.toLocaleString("es-PE", {hour12: false}).replace(",", "");
    fs.appendFileSync(path.join(dir, mes + ".log"), "[" + sello + "] " + linea + "\n", "utf8");

    // Limpieza: fuera los registros de más de 3 meses.
    const limite = new Date(ahora.getFullYear(), ahora.getMonth() - 3, 1);
    fs.readdirSync(dir).forEach((f) => {
      const m = f.match(/^(\d{4})-(\d{2})\.log$/);
      if (!m) return;
      if (new Date(+m[1], +m[2] - 1, 1) < limite) {
        try { fs.unlinkSync(path.join(dir, f)); } catch (e) {}
      }
    });
  } catch (e) { /* el registro nunca debe tumbar la corrida */ }
}

// ── Latido: revive el centro de alertas del panel ───────────────────────────
// Se escribe DENTRO de panel/config (campo "salud"), que el panel ya sabe leer
// y mostrar con su semáforo, sus KPIs y sus problemas agrupados. Va con merge,
// así que no pisa el resto de la configuración. Se ve desde el celular sin
// tener nada abierto: el lector corre en la PC, pero el latido viaja a Firestore.
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

// ── Firestore (Admin SDK) ────────────────────────────────────────────────────
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

// Trae los pedidos Shalom elegibles: guía+código presentes, no finalizados.
// Barrido por prefijo de courier (cubre "SHALOM", "SHALOM EMPRESAS", etc.),
// igual que ya hacía el backend viejo — mismo criterio, sin sorpresas.
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

  // Antes que nada: ¿hay Internet DE VERDAD? Si la PC recién se despertó y la
  // red todavía no responde, mejor esperar un poco y avisar claro que abrir el
  // navegador contra la nada.
  if (!(await esperarInternet(ESPERA_INTERNET_MS))) {
    console.log("❌ Sin Internet tras " + Math.round(ESPERA_INTERNET_MS / 60000) + " min de espera — se salta esta corrida.");
    registrar("saltada (sin Internet tras " + Math.round(ESPERA_INTERNET_MS / 60000) + " min de espera)");
    return;
  }

  // El candado solo aplica a la corrida COMPLETA. Una consulta suelta es tan
  // poco tráfico que no necesita turno, y bloquearla sería molesto.
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
  // Eventos para el centro de alertas del panel: se agrupan por código y son
  // pulsables (te llevan al pedido). Así el caso "guía mal escrita" no se
  // pierde en la terminal — lo ves desde el celular.
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
          // Dato mal tecleado, no un fallo del lector ni de Shalom.
          noEncontrados++;
          console.log("🔴 guía/código no coinciden con ningún pedido — revisa el número de orden");
          anotar("GUIA_NO_ENCONTRADA", item, "guía " + item.guia + " / " + item.codigo);
        } else if (dec.motivo === "ERROR_SHALOM") {
          // Tropiezo del lado de Shalom, no del dato: se reintenta en la próxima corrida.
          erroresShalom++;
          console.log("⚠️  Shalom tuvo un error temporal — se reintentará más tarde");
          anotar("SHALOM_ERROR_TEMPORAL", item, "reintento en la próxima corrida");
        } else {
          sinDato++;
          // Autodiagnóstico: guardamos lo que Shalom mostró, SOLO cuando no lo
          // reconocemos, para calibrar sin tener que volver a consultar a mano.
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

  // Registro en disco: aunque no estés mirando la pantalla, mañana lo lees.
  const resumenTxt = ok + " actualizados · " + noEncontrados + " guía no reconocida · " +
    erroresShalom + " error Shalom · " + bloqueados + " bloqueados · " + sinDato +
    " sin dato (" + dur + ")" + (dryRun ? " [simulación]" : "");
  registrar((soloOrden ? "[guía " + soloOrden + "] " : "") + resumenTxt);

  // Latido → el centro de alertas del panel (y tu celular) lo muestran solo.
  // En simulación o consulta suelta NO se escribe: el latido representa la
  // corrida completa de verdad, y ensuciarlo daría una lectura falsa del sistema.
  if (!dryRun && !soloOrden) {
    await escribirLatido(db, {
      activo: true,
      motor: "pc-local",
      equipo: require("os").hostname(),   // qué máquina corrió (útil si mañana hay dos)
      ultimaCorrida: new Date().toISOString(),
      intervaloMin: INTERVALO_MIN,        // el panel calcula con esto cuándo alarmarse
      enCola: pendientes.length,
      procesados: ok,
      errores: bloqueados + erroresShalom + sinDato,
      sinGuia: noEncontrados,
      duracionSeg: seg,
    }, eventos);
  }
}

module.exports = {decidirCambios, detectarEstadoAuto, modoEtiqueta};

if (require.main === module) {
  // El candado se suelta pase lo que pase (error, Ctrl+C, process.exit).
  process.on("exit", function(){ if (candadoTomado) soltarCandado(); });
  process.on("SIGINT", function(){ process.exit(130); });

  // Si algo cuelga la corrida (perfil de navegador bloqueado, red que nunca
  // vuelve, etc.) esto la mata igual — el candado y el navegador quedan
  // liberados en vez de un node.exe zombie esperando para siempre.
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
