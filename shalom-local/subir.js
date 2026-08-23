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
const {rastrear, abrirContexto} = require("./rastrear.js");

const PAUSA_ENTRE_CONSULTAS_MS = 2500; // gentil con Shalom — mismo ritmo que el
//   worker viejo, para no verse como una ráfaga de bot.

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
        } else if (dec.motivo === "NO_ENCONTRADO") {
          // Dato mal tecleado, no un fallo del lector ni de Shalom.
          noEncontrados++;
          console.log("🔴 guía/código no coinciden con ningún pedido — revisa el número de orden");
        } else if (dec.motivo === "ERROR_SHALOM") {
          // Tropiezo del lado de Shalom, no del dato: se reintenta en la próxima corrida.
          erroresShalom++;
          console.log("⚠️  Shalom tuvo un error temporal — se reintentará más tarde");
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

  console.log("\n── Resumen ──");
  console.log("✅ " + ok + " actualizado" + (ok !== 1 ? "s" : "") +
    (dryRun ? " (simulación — nada se escribió)" : ""));
  if (noEncontrados) console.log("🔴 " + noEncontrados + " con guía/código que Shalom no reconoce — revisa esos números");
  if (erroresShalom) console.log("⚠️  " + erroresShalom + " con error temporal de Shalom (no es tu dato — se reintenta solo)");
  if (bloqueados) console.log("⚠️  " + bloqueados + " bloqueados por reCAPTCHA (reintenta más tarde)");
  if (sinDato) console.log("❓ " + sinDato + " sin dato reconocible — revisa debug/ para calibrar");
}

module.exports = {decidirCambios, detectarEstadoAuto, modoEtiqueta};

if (require.main === module) {
  main().catch((e) => { console.error("Error:", e && e.message || e); process.exit(1); });
}
