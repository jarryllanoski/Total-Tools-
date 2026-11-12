/**
 * tests/config-nube.test.js — etiquetas y recursos: en la nube, sin pisarse
 * =========================================================================
 * 06/11/2026: cada guardado —hasta editar un pedido— reescribía etiquetas,
 * recursos y mensajes desde la memoria del equipo que guardaba. Un teléfono
 * con la lista vieja borraba la etiqueta recién creada en la PC.
 *
 * Aquí corren DOS equipos de verdad (el `_fbSave` y el `_mergeRemote` que se
 * despliegan) contra UNA nube de mentira que aplica las escrituras como
 * Firestore: por `updateMask`, campo a campo.
 *
 * Y las etiquetas: borrar no borra pedidos (quedan en SIN ETIQUETA), renombrar
 * se los lleva, sin nombres repetidos, y editar un pedido sin etiqueta no le
 * cambia el estado.
 */
'use strict';
const E = require('./_entorno.js');
const M = require('../panel/datos/mezclaConfig.js');

function bloqueCon(marca) {
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  const t = E.leer('index.html');
  let m;
  while ((m = re.exec(t))) if (m[1].indexOf(marca) >= 0) return m[1];
  throw new Error('no hay bloque con ' + marca);
}
const FIREBASE = bloqueCon('window._fbSave =');
const MERGE = E.trozo('index.html', 'window._mergeRemote = (remote) => {', 'const _initFirebase = async (intento) => {');
const FIJAS = ['NUEVO PEDIDO', 'ENVIADO', 'FINALIZADO'];

/* ── Firestore de mentira ─────────────────────────────────────────────── */
function aFs(v) {
  if (v === null || v === undefined) return {nullValue: null};
  if (typeof v === 'boolean') return {booleanValue: v};
  if (typeof v === 'number') return {integerValue: String(v)};
  if (typeof v === 'string') return {stringValue: v};
  if (Array.isArray(v)) return {arrayValue: {values: v.map(aFs)}};
  const f = {}; Object.keys(v).forEach((k) => { f[k] = aFs(v[k]); });
  return {mapValue: {fields: f}};
}
function deFs(fv) {
  if ('nullValue' in fv) return null;
  if ('booleanValue' in fv) return fv.booleanValue;
  if ('integerValue' in fv) return parseInt(fv.integerValue, 10);
  if ('doubleValue' in fv) return fv.doubleValue;
  if ('stringValue' in fv) return fv.stringValue;
  if ('arrayValue' in fv) return (fv.arrayValue.values || []).map(deFs);
  const o = {}; Object.keys(fv.mapValue.fields || {}).forEach((k) => { o[k] = deFs(fv.mapValue.fields[k]); });
  return o;
}
function nube(inicial) {
  const docs = {'panel/config': JSON.parse(JSON.stringify(inicial))};
  const red = {lecturasCfg: 0, cfgEscrito: []};
  const ruta = (name) => String(name).split('/documents/')[1];
  const fetch = async (url, init) => {
    const limpia = String(url).split('?')[0];
    if (limpia.indexOf(':commit') >= 0) {
      const cuerpo = JSON.parse(init.body);
      cuerpo.writes.forEach((w) => {
        const p = ruta(w.update.name);
        const d = docs[p] || (docs[p] = {});
        const claves = w.updateMask.fieldPaths.map((k) => k.replace(/`/g, ''));
        claves.forEach((k) => { d[k] = deFs(w.update.fields[k]); });
        if (p === 'panel/config') red.cfgEscrito.push(claves.sort());
      });
      return {ok: true, status: 200, json: async () => ({writeResults: cuerpo.writes.map(() => ({}))})};
    }
    const p = ruta(limpia);
    if (!init || !init.method) { // GET
      if (p === 'panel/config') red.lecturasCfg++;
      const d = docs[p];
      if (!d) return {ok: false, status: 404, text: async () => ''};
      const fields = {}; Object.keys(d).forEach((k) => { fields[k] = aFs(d[k]); });
      return {ok: true, status: 200, json: async () => ({fields})};
    }
    return {ok: true, status: 200, json: async () => ({})};
  };
  return {docs, red, fetch, cfg: () => docs['panel/config']};
}

/* ── Un equipo: su memoria, su `_fbSave` y su `_mergeRemote` reales ───── */
function equipo(n) {
  const S = {shipments: [], suppliers: [], labels: [], config: {}};
  const win = {FBConfig: {KEY: 'k', PRJ: 'p'}, _nubeLista: true, MezclaConfig: M};
  win._fbStatus = () => {};
  win._guardarSucios = () => {};
  win._authToken = async () => 'tok';
  const dirty = {ships: new Set(), supps: new Set()};
  const ctxF = {window: win, fetch: n.fetch, MezclaConfig: M,
    localStorage: {getItem: () => null, setItem: () => {}},
    lsSet: () => {}, lsGet: () => null, console: {warn: () => {}, log: () => {}, error: () => {}},
    _dirtyShips: dirty.ships, _dirtySupps: dirty.supps, _dirtyAll: false, _dirtyConfigOnly: true};
  const kF = Object.keys(ctxF);
  new Function(...kF, FIREBASE)(...kF.map((k) => ctxF[k]));
  const ctxM = {window: win, S, MezclaConfig: M, FIXED_LABELS: FIJAS,
    _sinRepetir: (a) => Array.from(new Set(a || [])),
    _dirtyShips: dirty.ships, _dirtySupps: dirty.supps, _S_TS: 0,
    lsSet: () => {}, render: () => {}, renderChips: () => {}, toast: () => {}, salida: {},
    _avisar: () => {}, _guardarCopiaLocal: () => {},
    save: (k) => { if (k === 'config') win._pidioGuardarCfg = true; }};
  const kM = Object.keys(ctxM);
  new Function(...kM, MERGE + '\nsalida.merge = window._mergeRemote;')(...kM.map((k) => ctxM[k]));
  return {
    S, win, dirty,
    cargar: () => ctxM.salida.merge(Object.assign(JSON.parse(JSON.stringify(n.cfg())), {shipments: [], suppliers: []})),
    guardar: () => win._fbSave(S),
  };
}

module.exports = async ({bloque, ok}) => {

  bloque('La mezcla, sola (mezclaConfig.js)');

  {
    ok(M.lista(['A', 'B'], ['A', 'B', 'C'], ['A', 'B', 'D']).join() === 'A,B,C,D', 'tu etiqueta y la del otro: quedan las dos');
    ok(M.lista(['A', 'B'], ['B'], ['A', 'B']).join() === 'B', 'la que borraste tú queda borrada');
    ok(M.lista(['A', 'B'], ['A', 'B', 'C'], ['B']).join() === 'B,C', 'la que borró el otro no resucita');
    ok(M.lista(['A', 'B'], ['B', 'A'], ['A', 'B', 'X']).join() === 'B,A,X', 'tu orden (arrastrado) se respeta');
    ok(M.lista([], ['A', 'A'], ['A']).join() === 'A', 'nunca repetidas');
    const r1 = {id: 'r1', t: 'Manual'}, r1b = {id: 'r1', t: 'Manual v2'}, r2 = {id: 'r2', t: 'Video'};
    ok(JSON.stringify(M.porId([r1], [r1, r2], [r1b])) === JSON.stringify([r1b, r2]),
       'recursos: el otro editó r1, tú agregaste r2 → r1 editado + r2');
    ok(M.porId([r1], [], [r1]).length === 0, 'el recurso que quitaste no vuelve');
    ok(M.porId([r1], [r1b], []).length === 1, 'si el otro lo quitó pero tú lo editabas, no se pierde tu edición');
    const t = M.mapa({A: ['a', '']}, {A: ['a', ''], B: ['b', '']}, {A: ['a2', '']});
    ok(t.A[0] === 'a2' && t.B[0] === 'b', 'mensajes por etiqueta: cada uno lo suyo');
    ok(!('A' in M.mapa({A: [1]}, {}, {A: [1]})), 'mensaje borrado aquí, borrado');
    const z = M.mezclar({statusPin: '1', labels: ['A']}, {statusPin: '9', labels: ['A']}, {statusPin: '1', labels: ['A', 'Z']});
    ok(z.statusPin === '9' && z.labels.join() === 'A,Z', 'valores sueltos: el que cambió gana');
  }

  bloque('Dos equipos reales contra una nube');

  {
    const n = nube({labels: FIJAS.concat(['AVISAR']), recursos: [{id: 'r1', t: 'M', u: 'https://a.b/1'}],
      msgTemplates: {}, config: {name: 'Total Tools', phone: '9', city: 'Lima'}, ts: 1});
    const pc = equipo(n), cel = equipo(n);
    pc.cargar(); cel.cargar();
    ok(pc.S.labels.join() === FIJAS.concat(['AVISAR']).join(), 'los dos ven lo de la nube');

    // La PC crea una etiqueta.
    pc.S.labels.push('RECLAMOS');
    await pc.guardar();
    ok(n.cfg().labels.indexOf('RECLAMOS') >= 0, 'la etiqueta nueva queda en la NUBE');
    const l0 = n.red.lecturasCfg;
    pc.dirty.ships.add('p0'); pc.S.shipments.push({id: 'p0', name: 'Luis', status: 'ENVIADO'});
    await pc.guardar();
    ok(n.red.lecturasCfg === l0 && n.red.cfgEscrito[n.red.cfgEscrito.length - 1].join() === 'syncHint,ts',
       'lo recién subido es la nueva base: el siguiente guardado no vuelve a leer ni a subir la configuración');

    // El teléfono, con la lista VIEJA, edita un pedido.
    const antes = n.red.lecturasCfg;
    cel.S.shipments.push({id: 'p1', name: 'Ana', status: 'ENVIADO'});
    cel.dirty.ships.add('p1');
    await cel.guardar();
    ok(n.cfg().labels.indexOf('RECLAMOS') >= 0, '⚠️ editar un pedido con la lista vieja YA NO borra la etiqueta nueva');
    ok(n.red.cfgEscrito[n.red.cfgEscrito.length - 1].join() === 'syncHint,ts',
       'guardar un pedido solo toca la hora de la configuración');
    ok(n.red.lecturasCfg === antes, 'y no cuesta ni una lectura');

    // El teléfono agrega un recurso y borra AVISAR, sin haber visto RECLAMOS.
    cel.S.recursos.push({id: 'r2', t: 'V', u: 'https://a.b/2'});
    cel.S.labels = cel.S.labels.filter((l) => l !== 'AVISAR');
    await cel.guardar();
    ok(n.cfg().labels.join() === FIJAS.concat(['RECLAMOS']).join(),
       'se mezcla: AVISAR borrada (teléfono) y RECLAMOS conservada (PC)');
    ok(n.cfg().recursos.map((r) => r.id).join() === 'r1,r2', 'el recurso nuevo sube junto a los que había');
    ok(cel.S.labels.indexOf('RECLAMOS') >= 0, 'y el teléfono ya ve la etiqueta de la PC');
    ok(n.red.lecturasCfg === antes + 1, 'cambiar la configuración cuesta UNA lectura (la de mezclar)');
    ok(n.red.cfgEscrito[n.red.cfgEscrito.length - 1].join() === 'labels,recursos,syncHint,ts',
       'y sube SOLO lo que cambió');

    // La PC tiene un cambio sin subir cuando llega el latido.
    pc.S.labels.push('RETORNO');
    pc.cargar();
    ok(pc.S.labels.join() === FIJAS.concat(['RECLAMOS', 'RETORNO']).join(),
       '⚠️ el latido no borra lo que aún no subió, y aplica lo del otro (AVISAR fuera)');
    ok(pc.S.recursos.length === 2, 'los recursos del teléfono llegan a la PC');
    await pc.guardar();
    ok(n.cfg().labels.join() === FIJAS.concat(['RECLAMOS', 'RETORNO']).join(), 'y luego sube');
    ok(n.cfg().config.name === 'Total Tools', 'los datos del negocio intactos');
  }

  bloque('Etiquetas repetidas en la nube: se limpian una vez');

  {
    const n = nube({labels: FIJAS.concat(['AVISAR', 'AVISAR', 'Enviado', 'RECLAMOS']), msgTemplates: {}, ts: 1,
      config: {name: 'Total Tools'}});
    const pc = equipo(n);
    pc.cargar();
    ok(pc.S.labels.join() === FIJAS.concat(['AVISAR', 'RECLAMOS']).join(), 'en pantalla ya salen sin repetir (como antes)');
    await new Promise((r) => setTimeout(r, 5));
    ok(pc.win._pidioGuardarCfg === true, 'y como la nube las tiene repetidas, se pide guardar la configuración');
    await pc.guardar();
    ok(n.cfg().labels.join() === FIJAS.concat(['AVISAR', 'RECLAMOS']).join(), '⚠️ la nube queda limpia (sin la doble ni el alias viejo)');
    const pc2 = equipo(n);
    pc2.cargar();
    await new Promise((r) => setTimeout(r, 5));
    ok(!pc2.win._pidioGuardarCfg, 'ya limpia, la próxima carga no vuelve a guardar');
  }

  bloque('Nube vacía (primer arranque): se sube todo, como siempre');

  {
    const n = nube({ts: 1});
    const pc = equipo(n);
    pc.S.labels = FIJAS.slice(); pc.S.config = {name: 'Total Tools'};
    await pc.guardar();
    ok(n.cfg().labels.length === 3 && n.cfg().config.name === 'Total Tools', 'sin base se escribe la configuración entera');
  }

  bloque('Etiquetas: borrar, renombrar, repetidas');

  const panel = E.leer('index.html');
  const cfg = E.leer('config.js');

  {
    const del = cfg.slice(cfg.indexOf('function confirmDelItem('), cfg.indexOf('function toggleDispatchDay('));
    ok(!/shipments\.(splice|filter\([^)]*\)\s*;?\s*S\.shipments\s*=)/.test(del) && /quedan en 🏷️ SIN ETIQUETA/.test(del),
       'borrar una etiqueta NO toca los pedidos y lo dice («quedan en SIN ETIQUETA»)');
    ok(/delete S\.msgTemplates\[name\]/.test(del), 'sus mensajes A/B se van con ella');
    const ren = cfg.slice(cfg.indexOf('function saveLabelEdit('), cfg.indexOf('function openCourierEdit(i){'));
    ok(/if\(S\.labels\.includes\(newName\)\)\{ toast\('⚠️ Ya existe/.test(ren), 'renombrar a un nombre que ya existe: se avisa');
    ok(/movidos\.forEach\(x=>\{ x\.status=newName; \}\)/.test(ren) && /save\(movidos\.length \? movidos\.map\(x=>x\.id\) : 'config'\)/.test(ren),
       'renombrar se lleva sus pedidos (y sube solo esos)');
    const add = cfg.slice(cfg.indexOf('function addLabelInline('), cfg.indexOf('function addCourierInline('));
    ok(/while\(S\.labels\.includes\(nombre\)\) nombre='NUEVA ETIQUETA '\+\(n\+\+\)/.test(add), '«+ Agregar» nunca repite el nombre');
    ok(/if\(s\.status && !S\.labels\.includes\(s\.status\)\)\{[\s\S]{0,200}\(sin etiqueta\)/.test(cfg),
       '⚠️ editar un pedido sin etiqueta conserva su estado (antes quedaba vacío)');

    // nombreEtiqueta y pedidosSinEtiqueta, ejecutados.
    const src = panel.slice(panel.indexOf('function _sinRepetir('), panel.indexOf('const customLabels='));
    const S = {labels: FIJAS.concat(['AVISAR']), shipments: [{id: 1, status: 'AVISAR'}, {id: 2, status: 'BORRADA'}, {id: 3, status: ''}]};
    // eslint-disable-next-line no-new-func
    const f = new Function('S', src + ';return {nombreEtiqueta, pedidosSinEtiqueta, _sinRepetir, SIN_ETIQUETA};')(S);
    ok(f.nombreEtiqueta(` ret'orno  "a" <b>`) === 'RETORNO A B', 'el nombre se limpia (sin comillas ni < >) y va en mayúsculas');
    ok(f.pedidosSinEtiqueta().map((x) => x.id).join() === '2,3', 'SIN ETIQUETA: los que tienen un estado que ya no existe');
    ok(f._sinRepetir(['A', 'B', 'A']).join() === 'A,B', 'al cargar, sin repetidas');

    // El filtro real de la lista.
    const vs = E.trozo('index.html', 'function visibleShipments(){', 'let _renderPedido = false;');
    // eslint-disable-next-line no-new-func
    const vis = new Function('S', '$', '_dniDe', 'NroComprobante', '_adv',
        'const SIN_ETIQUETA="' + f.SIN_ETIQUETA + '";let _filt=SIN_ETIQUETA,_advActive=false;function _soloActivos(){return false}' + vs + ';return visibleShipments;',
    )(S, () => ({value: ''}), () => '', {coincide: () => false}, {});
    ok(vis().map((x) => x.id).join() === '2,3', 'el chip «🏷️ SIN ETIQUETA» muestra esos pedidos');
    ok(/function _chipSinEtiqueta\(\)\{\s*const n=pedidosSinEtiqueta\(\)\.length;\s*if\(!n\)/.test(panel),
       'el chip solo aparece si hay pedidos así');
    ok(/const libre=curIdx<0;\s*const ok=libre\|\|/.test(panel), 'desde SIN ETIQUETA se pueden mover a cualquier etiqueta');
  }

  bloque('Recursos y etiquetas viven en la nube, no en la PC');

  {
    const proy = panel.slice(panel.indexOf('window._cfgProy = (data) => {'), panel.indexOf('window._fbSave = async (data) => {'));
    ['labels', 'msgTemplates', 'recursos', 'couriers', 'extraFields'].forEach((k) =>
      ok(new RegExp(k + ':data\\.' + k).test(proy), k + ' viaja al documento de configuración'));
    ok(/const _PANTALLAS_NUBE = \['configurar', 'recursos'\];/.test(panel),
       'Config y Recursos no se pueden editar hasta que llega la nube (la copia local no manda)');
    ok(/<script src="panel\/datos\/mezclaConfig\.js\?v=\d+"><\/script>/.test(E.leerReal('index.html')), 'el panel carga la mezcla');
  }
};
