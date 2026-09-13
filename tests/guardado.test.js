/**
 * tests/guardado.test.js — que guardar no vuelva a tumbar la conexión
 * ===================================================================
 * El bug que produjo estas pruebas: `_fbSave` hacía `Promise.all` de un
 * `fsPatch` por documento. Con 971 pedidos eso eran 971 peticiones sueltas a la
 * vez; Firestore devolvía 429, `Promise.all` se rompía con la primera y el
 * reintento volvía a mandar las 971 — unas 4.000 escrituras en medio minuto.
 * El síntoma que se veía era "el botón de Firebase se pone rojo y me quedo sin
 * conexión".
 *
 * Se prueba el TEXTO REAL de index.html, extraído del archivo que se despliega.
 * Una copia del código en el test se desincroniza y deja pasar el bug de vuelta.
 */
'use strict';
const E = require('./_entorno');

/* ── Sacar los trozos vivos de index.html ─────────────────────────────── */

function bloqueCon(marca) {
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  const t = E.leer('index.html');
  let m;
  while ((m = re.exec(t))) if (m[1].indexOf(marca) >= 0) return m[1];
  throw new Error('no hay bloque <script> que contenga "' + marca + '"');
}

const FIREBASE = bloqueCon('window._fbSave =');
const PERSIST  = E.trozo('index.html', "const DIRTY_KEY = 'dpanel_dirty';", '_recuperarSucios();');
const REINTENTO = E.trozo('index.html', 'async function _fbSaveWithRetry(data, attempt){',
                                        '// Sin modo offline');

/* ── Un Firestore de mentira ──────────────────────────────────────────────
   Cuenta peticiones, guarda los cuerpos y puede fallar a voluntad: por
   transporte (un HTTP feo) o por documento (el `status[]` de batchWrite). */

function montar(op) {
  op = op || {};
  const red = { batch: [], patch: [], vivos: 0, maxVivos: 0 };
  const almacen = op.almacen || {};
  const win = {
    FBConfig: { KEY: 'k', PRJ: 'proj' },
    _estados: [], _anotados: [], _sucios: 0
  };
  win._fbStatus = function (s) { win._estados.push(s); };
  win._guardarSucios = function () { win._sucios++; };
  win.Errores = { anotar: function (d) { win._anotados.push(d); } };

  let nBatch = 0;
  const fetchFalso = async function (url, init) {
    if (String(url).indexOf(':batchWrite') >= 0) {
      const cuerpo = JSON.parse(init.body);
      red.batch.push(cuerpo);
      const r = (op.batch || [])[nBatch++] || {};
      if (r.http) return { ok: false, status: r.http, text: async () => 'feo' };
      const st = cuerpo.writes.map(() => ({}));
      (r.fallan || []).forEach((i) => { if (i < st.length) st[i] = { code: 9, message: 'no' }; });
      return { ok: true, status: 200, json: async () => ({ status: st, writeResults: st.map(() => ({})) }) };
    }
    // PATCH suelto: el camino de respaldo. Se mide cuántos van a la vez.
    red.vivos++; if (red.vivos > red.maxVivos) red.maxVivos = red.vivos;
    red.patch.push(String(url).split('?')[0]);
    await new Promise((r) => setTimeout(r, 1));
    red.vivos--;
    if (op.patchFalla) return { ok: false, status: 500, text: async () => 'no' };
    return { ok: true, status: 200, json: async () => ({}) };
  };

  const ctx = {
    window: win,
    fetch: fetchFalso,
    localStorage: { getItem: (k) => (k in almacen ? almacen[k] : null),
                    setItem: (k, v) => { almacen[k] = String(v); } },
    lsSet: (k, v) => { almacen[k] = String(v); },
    lsGet: (k) => (k in almacen ? almacen[k] : null),
    console: { warn: () => {}, log: () => {}, error: () => {} },
    _dirtyShips: op.ships || new Set(),
    _dirtySupps: op.supps || new Set(),
    _dirtyAll: op.all === undefined ? true : op.all,
    _dirtyConfigOnly: !!op.cfgOnly
  };
  // El espía cierra sobre las MISMAS variables que usa el código, así que ve
  // las reasignaciones (_dirtyAll = false) y no una copia.
  const codigo = FIREBASE +
    '\n;window.__estado = function(){ return { all: _dirtyAll, ships: _dirtyShips,' +
    ' supps: _dirtySupps, cfgOnly: _dirtyConfigOnly }; };';
  const n = Object.keys(ctx);
  new Function(...n, codigo)(...n.map((k) => ctx[k]));
  return { win, red, almacen, estado: () => win.__estado() };
}

function datos(n, extra) {
  const shipments = [];
  for (let i = 0; i < n; i++) {
    shipments.push(Object.assign({ id: 'p' + i, name: 'Cliente ' + i, status: 'ENVIADO', sel: true },
                                 extra ? extra(i) : null));
  }
  return { shipments, suppliers: [], couriers: ['SHALOM'], labels: [] };
}

/* ── Persistencia de los sucios, aislada ──────────────────────────────── */

function montarPersistencia(op) {
  op = op || {};
  const almacen = op.almacen || {};
  const ctx = {
    _dirtyShips: op.ships || new Set(),
    _dirtySupps: op.supps || new Set(),
    _dirtyAll: !!op.all,
    lsSet: (k, v) => { almacen[k] = String(v); },
    lsGet: (k) => (k in almacen ? almacen[k] : null),
    salida: {}
  };
  const codigo = PERSIST +
    '\nsalida.guardar = _guardarSucios; salida.recuperar = _recuperarSucios;' +
    '\nsalida.estado = function(){ return { all: _dirtyAll, ships: _dirtyShips, supps: _dirtySupps }; };';
  const n = Object.keys(ctx);
  new Function(...n, codigo)(...n.map((k) => ctx[k]));
  return { api: ctx.salida, almacen };
}

/* ── El reintento, aislado ────────────────────────────────────────────── */

function montarReintento(op) {
  const almacen = op.almacen || {};
  const pendientes = [];
  const win = { _estados: [] };
  win._fbStatus = function (s) { win._estados.push(s); };
  win._fbSave = op.guardar;
  const ctx = {
    window: win,
    lsSet: (k, v) => { almacen[k] = String(v); },
    lsGet: (k) => (k in almacen ? almacen[k] : null),
    console: { warn: () => {} },
    // Los esperas del reintento no se esperan de verdad: se encolan y se
    // drenan. Si no se drenaran, la prueba terminaría antes que el código.
    setTimeout: (fn) => { pendientes.push(Promise.resolve().then(fn)); },
    salida: {}
  };
  const codigo = REINTENTO + '\nsalida.reintentar = _fbSaveWithRetry;';
  const n = Object.keys(ctx);
  new Function(...n, codigo)(...n.map((k) => ctx[k]));
  const drenar = async () => { while (pendientes.length) await pendientes.shift(); };
  return { api: ctx.salida, win, almacen, drenar };
}

/* ═══════════════════════════════════════════════════════════════════════ */

module.exports = async function ({ bloque, ok }) {

  bloque('Mil peticiones se vuelven dos');

  const m1 = montar({});
  await m1.win._fbSave(datos(971));
  ok(m1.red.batch.length === 2, '971 pedidos se guardan en 2 peticiones, no en 972');
  ok(m1.red.patch.length === 0, 'y ninguna suelta: batchWrite se usa de verdad');
  ok(m1.red.batch[0].writes.length === 500, 'la primera tanda llega al tope de 500 de Firestore');
  ok((m1.red.batch[1] || { writes: [] }).writes.length === 472, 'y la segunda lleva el resto');

  const w = m1.red.batch[0].writes[1] || { update: {}, updateMask: {} }; // 0 es config
  ok(w.update.name === 'projects/proj/databases/(default)/documents/panel/shipments/items/p0',
     'cada escritura apunta a la ruta completa del documento');
  ok(Array.isArray(w.updateMask.fieldPaths || null) && (w.updateMask.fieldPaths || []).length > 0,
     'y lleva su updateMask: sin él, Firestore reemplaza el documento entero');
  ok((w.updateMask.fieldPaths || []).indexOf('`id`') >= 0,
     'los campos van entre backticks, igual que en fsPatch');
  ok(w.updateMask.fieldPaths && w.updateMask.fieldPaths.indexOf('`sel`') < 0,
     'sel sigue sin viajar: slimShipment no se saltó por el camino nuevo');
  ok(String((m1.red.batch[0].writes[0] || { update: {} }).update.name).indexOf('panel/config') >= 0,
     'config va en la misma tanda, no en una petición aparte');

  bloque('Lo que entró, entró');

  const m2 = montar({ batch: [{ fallan: [3, 7] }, {}] });
  let reventó = false;
  try { await m2.win._fbSave(datos(971)); } catch (e) { reventó = true; }
  ok(reventó, 'si algo no entra, el guardado no se declara exitoso');
  ok(m2.estado().ships.size === 2, 'quedan sucios 2, no los 971');
  ok(m2.estado().ships.has('p2') && m2.estado().ships.has('p6'), 'y son exactamente los que fallaron');
  ok(m2.estado().all === false, '_dirtyAll se apaga: el reintento no vuelve a mandar la lista entera');
  ok(m2.win._estados[m2.win._estados.length - 1] === 'err', 'el indicador lo dice');
  ok(m2.win._sucios > 0, 'y lo que quedó pendiente se persiste antes de lanzar');

  const m2b = montar({ ships: new Set(['p0', 'p1', 'p2', 'p3']), all: false, batch: [{ fallan: [2] }] });
  let reventó2 = false;
  try { await m2b.win._fbSave(datos(4), null); } catch (e) { reventó2 = true; }
  ok(reventó2, 'con 4 marcados y 1 rechazado, tampoco se declara éxito');
  ok(m2b.estado().ships.size === 1 && m2b.estado().ships.has('p1'),
     'los 3 que SÍ entraron se descuentan: el reintento manda 1, no los 4');

  const m3 = montar({ ships: new Set(['p1', 'p3']), all: false });
  await m3.win._fbSave(datos(5));
  ok(m3.red.batch[0].writes.length === 3, 'incremental: config + los 2 marcados, no los 5');
  ok(m3.estado().ships.size === 0 && m3.estado().all === false,
     'el éxito completo limpia el registro de sucios');

  bloque('No subir todo por no saber');

  const m4 = montar({ all: false });
  await m4.win._fbSave(datos(971));
  ok(m4.red.batch[0].writes.length === 1,
     'sin nada marcado sube solo config: "nada sucio" ya no significa "sube los 971"');

  const m5 = montar({ all: true });
  await m5.win._fbSave(datos(30));
  ok(m5.red.batch[0].writes.length === 31,
     '_dirtyAll sigue mandando todo cuando se enciende a propósito');

  bloque('El reloj compartido solo avanza si config entró');

  const m6 = montar({ batch: [{ fallan: [0] }] });
  try { await m6.win._fbSave(datos(3)); } catch (e) { /* esperado */ }
  ok(m6.win._S_TS === undefined, 'config falló: _S_TS no avanza o _poll recargaría de más');
  const m7 = montar({});
  await m7.win._fbSave(datos(3));
  ok(typeof m7.win._S_TS === 'number', 'config entró: _S_TS avanza');

  bloque('Si batchWrite no sirve, el peor caso es el de antes pero sin avalancha');

  const m8 = montar({ batch: [{ http: 400 }] });
  await m8.win._fbSave(datos(20));
  ok(m8.red.patch.length === 21, 'se cae a escribir uno por uno y no se pierde ningún documento');
  ok(m8.red.maxVivos <= 6, 'pero nunca más de 6 peticiones a la vez');
  ok(m8.red.maxVivos > 1, 'y tampoco de una en una: sería lentísimo');
  ok(m8.win._anotados.indexOf('fs.batchWrite') >= 0, 'el fallo queda anotado, no en silencio');

  await m8.win._fbSave(datos(20));
  ok(m8.red.batch.length === 1, 'tras un 400 no se reintenta batchWrite en toda la sesión');

  const m9 = montar({ batch: [{ http: 503 }] });
  await m9.win._fbSave(datos(2));
  await m9.win._fbSave(datos(2));
  ok(m9.red.batch.length === 2, 'un 503 es pasajero: la próxima vez se vuelve a intentar');

  const m10 = montar({ batch: [{ http: 429 }] });
  await m10.win._fbSave(datos(2));
  await m10.win._fbSave(datos(2));
  ok(m10.red.batch.length === 2, 'un 429 tampoco apaga el camino rápido');

  bloque('Una tanda se parte por peso, no solo por cantidad');

  const relleno = () => ({ trackingHistory: new Array(2600).fill('x'.repeat(1000)) });
  const m11 = montar({});
  await m11.win._fbSave(datos(2, relleno));
  ok(m11.red.batch.length >= 2,
     '2 pedidos gordos no caben en una petición: se parten aunque no lleguen a 500');

  bloque('Lo que no subió sobrevive al cierre de la pestaña');

  const p1 = montarPersistencia({ ships: new Set(['a', 'b']), supps: new Set(['s1']) });
  p1.api.guardar();
  const crudo = JSON.parse(p1.almacen.dpanel_dirty);
  ok(crudo.s.length === 2 && crudo.p.length === 1, 'se anota qué quedó sin subir');
  ok(crudo.all === false, 'y si no era "subir todo", no se miente diciendo que sí');

  const p2 = montarPersistencia({ almacen: p1.almacen });
  p2.api.recuperar();
  ok(p2.api.estado().ships.has('a') && p2.api.estado().ships.has('b'),
     'al volver a abrir, los pedidos sin subir se reconocen otra vez');
  ok(p2.api.estado().supps.has('s1'), 'los proveedores también');

  const p3 = montarPersistencia({ ships: new Set(), all: false });
  p3.api.guardar();
  ok(p3.almacen.dpanel_dirty === '', 'sin nada pendiente no se deja basura guardada');
  const p4 = montarPersistencia({ almacen: { dpanel_dirty: '{{{roto' } });
  let reventóP = false;
  try { p4.api.recuperar(); } catch (e) { reventóP = true; }
  ok(!reventóP, 'un dato corrupto no impide arrancar');

  const p5 = montarPersistencia({ almacen: { dpanel_dirty: JSON.stringify({ all: true, s: [], p: [] }) } });
  p5.api.recuperar();
  ok(p5.api.estado().all === true, '"subir todo" también sobrevive al cierre');

  bloque('El aviso de pendiente por fin existe');

  let intentos = 0;
  const r1 = montarReintento({ guardar: async () => { intentos++; throw new Error('no'); } });
  await r1.api.reintentar({}, 0); await r1.drenar();
  ok(intentos === 4, 'se intenta 4 veces antes de rendirse');
  ok(r1.almacen.dpanel_pending === '1',
     'al rendirse queda marcado pendiente — esta bandera no se ponía NUNCA en 1');
  ok(r1.win._estados[r1.win._estados.length - 1] === 'err', 'y el indicador lo refleja');

  const r2 = montarReintento({ guardar: async () => {}, almacen: { dpanel_pending: '1' } });
  await r2.api.reintentar({}, 0); await r2.drenar();
  ok(r2.almacen.dpanel_pending === '0', 'cuando por fin entra, el pendiente se limpia');
  ok(r2.win._estados[r2.win._estados.length - 1] === 'ok',
     'y se repinta DESPUÉS de limpiarlo: pintar antes dejaba el aviso encendido');

  let veces = 0;
  const r3 = montarReintento({ guardar: async () => { veces++; if (veces < 3) throw new Error('no'); } });
  await r3.api.reintentar({}, 0); await r3.drenar();
  ok(r3.almacen.dpanel_pending === '0', 'si entra al tercer intento, no queda marcado pendiente');
};
