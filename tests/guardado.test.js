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
const PERSIST  = E.trozo('index.html', 'let _dirtyShips = new Set();', '_recuperarSucios();');
const REINTENTO = E.trozo('index.html', 'async function _fbSaveWithRetry(data, attempt){',
                                        '// Sin modo offline');
const MERGE = E.trozo('index.html', 'window._mergeRemote = (remote) => {',
                                    '// On Firebase ready');
const INIT  = E.trozo('index.html', 'const _initFirebase = async (intento) => {',
                                    'if(window._fbReady) {');

/* ── Un Firestore de mentira ──────────────────────────────────────────────
   Cuenta peticiones, guarda los cuerpos y puede fallar a voluntad: por
   transporte (un HTTP feo) o por documento (el `status[]` de batchWrite). */

function montar(op) {
  op = op || {};
  const red = { commit: [], patch: [], urls: [], vivos: 0, maxVivos: 0 };
  const almacen = op.almacen || {};
  const win = {
    FBConfig: { KEY: 'k', PRJ: 'proj' },
    _estados: [], _anotados: [], _sucios: 0
  };
  win._fbStatus = function (s) { win._estados.push(s); };
  win._guardarSucios = function () { win._sucios++; };
  win.Errores = { anotar: function (d) { win._anotados.push(d); } };

  let nCommit = 0;
  const fetchFalso = async function (url, init) {
    const limpia = String(url).split('?')[0];
    red.urls.push(limpia);
    if (limpia.indexOf(':commit') >= 0) {
      const cuerpo = JSON.parse(init.body);
      red.commit.push(cuerpo);
      const r = (op.commit || [])[nCommit++] || {};
      if (r.http) return { ok: false, status: r.http, text: async () => 'feo' };
      return { ok: true, status: 200,
               json: async () => ({ writeResults: cuerpo.writes.map(() => ({})), commitTime: 'x' }) };
    }
    // PATCH suelto: el desglose. Se mide cuántos van a la vez.
    red.vivos++; if (red.vivos > red.maxVivos) red.maxVivos = red.vivos;
    red.patch.push(limpia);
    await new Promise((r) => setTimeout(r, 1));
    red.vivos--;
    const cae = op.patchFalla ||
                (op.patchFallaEn || []).some((id) => limpia.endsWith('/' + id));
    if (cae) return { ok: false, status: 500, text: async () => 'no' };
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
    lsSet: (k, v) => { almacen[k] = String(v); },
    lsGet: (k) => (k in almacen ? almacen[k] : null),
    salida: {}
  };
  const codigo = PERSIST +
    '\nsalida.guardar = _guardarSucios; salida.recuperar = _recuperarSucios;' +
    '\nsalida.estado = function(){ return { all: _dirtyAll, ships: _dirtyShips,' +
    ' supps: _dirtySupps, hubo: _huboSuciosGuardados }; };' +
    '\nsalida.marcar = function(s, p, all){ (s||[]).forEach(function(x){_dirtyShips.add(x);});' +
    ' (p||[]).forEach(function(x){_dirtySupps.add(x);}); if(all) _dirtyAll = true; };';
  const n = Object.keys(ctx);
  new Function(...n, codigo)(...n.map((k) => ctx[k]));
  if (op.ships || op.supps || op.all) ctx.salida.marcar(op.ships, op.supps, op.all);
  return { api: ctx.salida, almacen };
}

/* ── El reintento, aislado ────────────────────────────────────────────── */

function montarReintento(op) {
  const almacen = op.almacen || {};
  const pendientes = [];
  const win = { _estados: [], _expulsado: null };
  win._fbStatus = function (s) { win._estados.push(s); };
  win._authExpulsar = function (m) { win._expulsado = m || 'sí'; };
  win._authHaySesion = function () { return !!op.haySesion; };
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

/* ── El merge del latido, aislado ─────────────────────────────────────── */

function montarMerge(op) {
  op = op || {};
  const S = { shipments: op.locales || [], suppliers: op.localesP || [], labels: [], config: {} };
  const win = { _isSaving: !!op.guardando };
  const almacen = {};
  const ctx = {
    window: win, S,
    FIXED_LABELS: ['NUEVO PEDIDO', 'ENVIADO', 'FINALIZADO'],
    _dirtyShips: op.ships || new Set(),
    _dirtySupps: op.supps || new Set(),
    _S_TS: 0,
    lsSet: (k, v) => { almacen[k] = String(v); },
    render: () => {}, renderChips: () => {}, toast: () => {},
    salida: {}
  };
  const codigo = MERGE + '\nsalida.merge = window._mergeRemote;';
  const n = Object.keys(ctx);
  new Function(...n, codigo)(...n.map((k) => ctx[k]));
  return { S, api: ctx.salida, win };
}

const ped = (id, extra) => Object.assign({ id, name: 'C' + id, status: 'ENVIADO' }, extra || null);
const ids = (lista) => (lista || []).map((x) => x.id).sort().join(',');

/* ── El arranque, aislado ─────────────────────────────────────────────── */

function montarInit(op) {
  op = op || {};
  const almacen = op.almacen || {};
  const subidas = [];
  const S = { shipments: op.locales || [], suppliers: [], config: { name: op.nombre || 'Mi Negocio' } };
  const reintentos = [];
  const win = {
    _fbLoad: async () => {
      if (op.cargaFalla) {
        const e = new Error('Firestore ' + op.cargaFalla);
        e.http = op.cargaFalla;
        throw e;
      }
      return op.remoto;
    },
    _mergeRemote: () => {}, _fbListen: () => {}, _expulsado: null
  };
  win._authExpulsar = function (m) { win._expulsado = m || 'sí'; };
  win._authHaySesion = function () { return !!op.haySesion; };
  const ctx = {
    window: win, S,
    document: { getElementById: () => null },
    lsGet: (k) => (k in almacen ? almacen[k] : null),
    _fbSaveWithRetry: (d, i) => { subidas.push(i); },
    _dirtyAll: false,
    _huboSuciosGuardados: !!op.recuperoSucios,
    console: { warn: () => {} },
    toast: () => {},
    setTimeout: (fn, ms) => { reintentos.push(ms); },
    salida: {}
  };
  const codigo = INIT + '\nsalida.init = _initFirebase;' +
                 '\nsalida.dirtyAll = function(){ return _dirtyAll; };';
  const n = Object.keys(ctx);
  new Function(...n, codigo)(...n.map((k) => ctx[k]));
  return { api: ctx.salida, subidas, win, reintentos };
}

/* ═══════════════════════════════════════════════════════════════════════ */

module.exports = async function ({ bloque, ok }) {

  bloque('Mil peticiones se vuelven dos');

  const m1 = montar({});
  await m1.win._fbSave(datos(971));
  ok(m1.red.commit.length === 2, '971 pedidos se guardan en 2 peticiones, no en 972');
  ok(m1.red.patch.length === 0, 'y ninguna suelta: la tanda entró de una');
  ok(m1.red.commit[0].writes.length === 500, 'la primera tanda llega al tope de 500 de Firestore');
  ok((m1.red.commit[1] || { writes: [] }).writes.length === 472, 'y la segunda lleva el resto');

  const w = m1.red.commit[0].writes[1] || { update: {}, updateMask: {} }; // 0 es config
  ok(w.update.name === 'projects/proj/databases/(default)/documents/panel/shipments/items/p0',
     'cada escritura apunta a la ruta completa del documento');
  ok((w.updateMask.fieldPaths || []).length > 0,
     'y lleva su updateMask: sin él, Firestore reemplaza el documento entero');
  ok((w.updateMask.fieldPaths || []).indexOf('`id`') >= 0,
     'los campos van entre backticks, igual que en fsPatch');
  ok(w.updateMask.fieldPaths && w.updateMask.fieldPaths.indexOf('`sel`') < 0,
     'sel sigue sin viajar: slimShipment no se saltó por el camino nuevo');
  ok(String((m1.red.commit[0].writes[0] || { update: {} }).update.name).indexOf('panel/config') >= 0,
     'config va en la misma tanda, no en una petición aparte');

  bloque('El endpoint es :commit — batchWrite se probó y da 403');

  ok(m1.red.urls.some((u) => u.indexOf(':commit') >= 0), 'se llama a documents:commit');
  ok(!m1.red.urls.some((u) => u.indexOf(':batchWrite') >= 0),
     'y NUNCA a documents:batchWrite: desde el navegador devuelve PERMISSION_DENIED');

  bloque('Commit es todo-o-nada, así que la tanda que falla se desglosa');

  const m2 = montar({ ships: new Set(['p0', 'p1', 'p2', 'p3']), all: false,
                      commit: [{ http: 403 }], patchFallaEn: ['p1'] });
  let reventó = false;
  try { await m2.win._fbSave(datos(4)); } catch (e) { reventó = true; }
  ok(reventó, 'si algo no entra, el guardado no se declara exitoso');
  ok(m2.red.patch.length === 5, 'la tanda rechazada se rehace documento por documento');
  ok(m2.estado().ships.size === 1 && m2.estado().ships.has('p1'),
     'y así se sabe cuál fue: queda sucio 1, no los 4');
  ok(m2.estado().all === false, '_dirtyAll se apaga: el reintento no manda la lista entera');
  ok(m2.win._estados[m2.win._estados.length - 1] === 'err', 'el indicador lo dice');
  ok(m2.win._sucios > 0, 'y lo que quedó pendiente se persiste antes de lanzar');
  ok(m2.win._anotados.indexOf('fs.commit') >= 0, 'el fallo queda anotado, no en silencio');

  const m2b = montar({ all: true, commit: [{ http: 403 }] });
  await m2b.win._fbSave(datos(20));
  ok(m2b.red.patch.length === 21, 'si la tanda falla pero los documentos están bien, entran todos');
  ok(m2b.red.maxVivos <= 6, 'el desglose nunca lanza más de 6 peticiones a la vez');
  ok(m2b.red.maxVivos > 1, 'y tampoco va de una en una: sería lentísimo');

  const m3 = montar({ ships: new Set(['p1', 'p3']), all: false });
  await m3.win._fbSave(datos(5));
  ok(m3.red.commit[0].writes.length === 3, 'incremental: config + los 2 marcados, no los 5');
  ok(m3.estado().ships.size === 0 && m3.estado().all === false,
     'el éxito completo limpia el registro de sucios');

  bloque('Cuándo apagar el camino rápido, y cuándo no');

  // Un 403 con TODOS los documentos entrando sueltos = el endpoint no sirve.
  const m4 = montar({ commit: [{ http: 403 }] });
  await m4.win._fbSave(datos(3));
  await m4.win._fbSave(datos(3));
  ok(m4.red.commit.length === 1,
     'si el rechazo no era de ningún documento, era del endpoint: no se reintenta en la sesión');

  // El mismo 403 pero con un documento que también falla suelto = el culpable
  // era el documento, y el camino rápido sigue sirviendo para los demás.
  const m5 = montar({ ships: new Set(['p0', 'p1']), all: false,
                      commit: [{ http: 403 }], patchFallaEn: ['p1'] });
  try { await m5.win._fbSave(datos(2)); } catch (e) { /* esperado */ }
  try { await m5.win._fbSave(datos(2)); } catch (e) { /* esperado */ }
  ok(m5.red.commit.length === 2,
     'si el culpable era un documento, no se castiga al endpoint');

  const m6 = montar({ commit: [{ http: 503 }] });
  await m6.win._fbSave(datos(2));
  await m6.win._fbSave(datos(2));
  ok(m6.red.commit.length === 2, 'un 503 es pasajero: la próxima vez se vuelve a intentar');

  const m7 = montar({ commit: [{ http: 429 }] });
  await m7.win._fbSave(datos(2));
  await m7.win._fbSave(datos(2));
  ok(m7.red.commit.length === 2, 'un 429 tampoco apaga el camino rápido');

  bloque('No subir todo por no saber');

  const m8 = montar({ all: false });
  await m8.win._fbSave(datos(971));
  ok(m8.red.commit[0].writes.length === 1,
     'sin nada marcado sube solo config: "nada sucio" ya no significa "sube los 971"');

  const m9 = montar({ all: true });
  await m9.win._fbSave(datos(30));
  ok(m9.red.commit[0].writes.length === 31,
     '_dirtyAll sigue mandando todo cuando se enciende a propósito');

  bloque('El reloj compartido solo avanza si config entró');

  const m10 = montar({ commit: [{ http: 500 }], patchFalla: true });
  try { await m10.win._fbSave(datos(3)); } catch (e) { /* esperado */ }
  ok(m10.win._S_TS === undefined, 'config no entró: _S_TS no avanza o _poll recargaría de más');
  const m11 = montar({});
  await m11.win._fbSave(datos(3));
  ok(typeof m11.win._S_TS === 'number', 'config entró: _S_TS avanza');

  bloque('Una tanda se parte por peso, no solo por cantidad');

  const relleno = () => ({ trackingHistory: new Array(2600).fill('x'.repeat(1000)) });
  const m12 = montar({});
  await m12.win._fbSave(datos(2, relleno));
  ok(m12.red.commit.length >= 2,
     '2 pedidos gordos no caben en una petición: se parten aunque no lleguen a 500');

  bloque('El latido ya no se lleva por delante lo que solo existe aquí');

  const g1 = montarMerge({ locales: [ped('p1'), ped('nuevo')], ships: new Set(['nuevo']) });
  g1.api.merge({ shipments: [ped('p1'), ped('p2')] });
  ok(ids(g1.S.shipments) === 'nuevo,p1,p2',
     'un pedido creado aquí y aún sin subir sobrevive al latido');

  const g2 = montarMerge({ locales: [ped('p1'), ped('borrado')], ships: new Set() });
  g2.api.merge({ shipments: [ped('p1')] });
  ok(ids(g2.S.shipments) === 'p1',
     'pero lo que otro dispositivo borró NO resucita: sin marcar, su ausencia es la verdad');

  const g3 = montarMerge({ locales: [ped('p1', { name: 'MÍO' })], ships: new Set(['p1']) });
  g3.api.merge({ shipments: [ped('p1', { name: 'NUBE' })] });
  ok(g3.S.shipments[0].name === 'MÍO',
     'y un pedido sucio que sí está en la nube conserva la versión local');

  const g4 = montarMerge({ localesP: [{ id: 's1' }, { id: 'sNuevo' }], supps: new Set(['sNuevo']) });
  g4.api.merge({ suppliers: [{ id: 's1' }] });
  ok(ids(g4.S.suppliers) === 's1,sNuevo', 'con los proveedores pasa lo mismo');

  const g5 = montarMerge({ locales: [ped('p1')], ships: new Set(['p1']), guardando: true });
  g5.api.merge({ shipments: [ped('p9')] });
  ok(ids(g5.S.shipments) === 'p1', 'con un guardado en curso no se mergea nada');

  bloque('El arranque sube lo que quedó pendiente');

  const i1 = montarInit({ remoto: { shipments: [] }, recuperoSucios: true });
  await i1.api.init();
  ok(i1.subidas.length === 1, 'si la sesión anterior dejó algo sin subir, se sube al arrancar');
  ok(i1.api.dirtyAll() === false, 'y se suben ESOS, no los 971: _dirtyAll sigue apagado');

  const i2 = montarInit({ remoto: { shipments: [] }, recuperoSucios: false });
  await i2.api.init();
  ok(i2.subidas.length === 0, 'sin nada pendiente, arrancar no escribe en la nube');

  const i3 = montarInit({ remoto: { shipments: [] }, almacen: { dpanel_pending: '1' } });
  await i3.api.init();
  ok(i3.subidas.length === 1, 'la bandera de pendiente sigue disparando la resubida');

  const i4 = montarInit({ remoto: null, locales: [ped('p1')] });
  await i4.api.init();
  ok(i4.subidas.length === 1 && i4.api.dirtyAll() === true,
     'nube vacía con datos locales: primer arranque real, ahí sí se enciende _dirtyAll a mano');

  const i5 = montarInit({ remoto: null, locales: [] });
  await i5.api.init();
  ok(i5.subidas.length === 0, 'nube vacía y nada local: no se sube nada');

  bloque('Un 403 es tu sesión, no la red');

  {
    /* auth.js corta la sesión a las 12 h, y ese control solo corría AL CARGAR
       la página. Si la sesión moría con el panel abierto, Firestore empezaba a
       responder 403 y el panel decía "Sin conexión a Firebase" — a revisar el
       internet por un problema de permisos. Pasó de verdad. */
    const i = montarInit({cargaFalla: 403, haySesion: true});
    await i.api.init();
    ok(i.win._expulsado, 'un 403 al cargar dice que la sesión venció');
    ok(String(i.win._expulsado).toLowerCase().indexOf('sesión') >= 0,
       'y lo dice con esas palabras, no con "sin conexión"');
    ok(i.reintentos.length === 0,
       'y no se reintenta: cuatro intentos no arreglan un problema de permisos');
    ok(i.subidas.length === 0, 'ni se sube nada a una nube que nos rechaza');
  }
  {
    /* ⚠️ EL CASO QUE LO ROMPIÓ TODO. Esta carga corre EN PARALELO con la
       pantalla de login: sin haber entrado todavía, el 403 es lo NORMAL, no
       una sesión vencida. Tratarlo como expulsión borraba la sesión y dibujaba
       una segunda pantalla de login encima — y al entrar se quitaba una sola.
       El usuario tecleaba su contraseña una y otra vez sin entender nada. */
    const i = montarInit({cargaFalla: 403, haySesion: false});
    await i.api.init();
    ok(!i.win._expulsado,
       'sin sesión previa, un 403 no expulsa a nadie: todavía no había entrado');
    ok(i.reintentos.length === 0, 'y tampoco se reintenta, que no lo arregla');
    ok(i.subidas.length === 0, 'ni se sube nada');
  }
  {
    const i = montarInit({cargaFalla: 503});
    await i.api.init();
    ok(!i.win._expulsado, 'un 503 NO es tu sesión: no se expulsa a nadie');
    ok(i.reintentos.length === 1, 'ese sí se reintenta');
  }
  {
    let intentos = 0;
    const r = montarReintento({guardar: async () => {
      intentos++;
      const e = new Error('denegado'); e.http = 403; throw e;
    }, haySesion: true});
    await r.api.reintentar({}, 0); await r.drenar();
    ok(intentos === 1, 'guardando, un 403 tampoco se reintenta cuatro veces');
    ok(r.almacen.dpanel_pending === '1',
       'pero queda marcado pendiente: lo que no subió no se pierde');
    ok(r.win._expulsado, 'y se pide entrar de nuevo');
    ok(String(r.win._expulsado).indexOf('se subirán') > 0,
       'diciendo que los cambios están a salvo — si no, uno cree que los perdió');
  }

  bloque('Lo que no subió sobrevive al cierre de la pestaña');

  const p0 = montarPersistencia({});
  ok(p0.api.estado().all === false,
     '_dirtyAll arranca APAGADO: arrancar en true convertía cada recuperación en subir los 971');
  ok(p0.api.estado().ships.size === 0, 'y sin nada marcado');

  const p1 = montarPersistencia({ ships: ['a', 'b'], supps: ['s1'] });
  p1.api.guardar();
  const crudo = JSON.parse(p1.almacen.dpanel_dirty);
  ok(crudo.s.length === 2 && crudo.p.length === 1, 'se anota qué quedó sin subir');
  ok(crudo.all === false, 'y si no era "subir todo", no se miente diciendo que sí');

  const p2 = montarPersistencia({ almacen: p1.almacen });
  p2.api.recuperar();
  ok(p2.api.estado().ships.has('a') && p2.api.estado().ships.has('b'),
     'al volver a abrir, los pedidos sin subir se reconocen otra vez');
  ok(p2.api.estado().supps.has('s1'), 'los proveedores también');

  const p3 = montarPersistencia({});
  p3.api.guardar();
  ok(p3.almacen.dpanel_dirty === '', 'sin nada pendiente no se deja basura guardada');
  const p4 = montarPersistencia({ almacen: { dpanel_dirty: '{{{roto' } });
  let reventóP = false;
  try { p4.api.recuperar(); } catch (e) { reventóP = true; }
  ok(!reventóP, 'un dato corrupto no impide arrancar');

  const p5 = montarPersistencia({ almacen: { dpanel_dirty: JSON.stringify({ all: true, s: [], p: [] }) } });
  p5.api.recuperar();
  ok(p5.api.estado().all === true, '"subir todo" también sobrevive al cierre');

  const p6 = montarPersistencia({ almacen: p1.almacen });
  p6.api.recuperar();
  ok(p6.api.estado().hubo === true,
     'y queda constancia de que había algo pendiente: es lo que dispara la subida al arrancar');
  const p7 = montarPersistencia({ almacen: {} });
  p7.api.recuperar();
  ok(p7.api.estado().hubo === false, 'si no había nada, no se marca nada');

  bloque('Un pedido no se escribe dos veces');

  /* Esta es estructural, no de comportamiento: probar saveForm() entero pediría
     medio formulario de mentira. Lo que se guarda es que no vuelva a colarse el
     patrón exacto que duplicaba —guardado inmediato seguido de save() del mismo
     pedido— que es como estaba escrito y como volvería a escribirse. */
  const CFG = E.leer('config.js');
  ok(!/_fbSaveShipmentNow\([^)]*\);\s*(\/\/[^\n]*\n\s*)*save\(/.test(CFG),
     'en config.js ya no hay un guardado inmediato seguido de save() del mismo pedido');
  ok(CFG.indexOf('save(data.id)') >= 0 && CFG.indexOf('save(_editId)') >= 0,
     'pero save() sigue ahí: quitar el duplicado no puede dejar el pedido sin guardar');

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
