'use strict';
const vm = require('vm');
const E = require('./_entorno.js');
const A = require('../functions/actividad.js');
const LP = require('../functions/limpieza.js');
const L = require('../functions/enlaceSeguimiento.js');

const H = 3600000;
const T0 = Date.parse('2026-11-19T15:00:00Z');
const ped = (id, extra) => Object.assign({id: id, name: 'ana maría pérez', nroComprobante: ''}, extra || {});

function anotador(opciones) {
  const o = opciones || {};
  const src = E.leer('functions/index.js');
  const T = src.slice(src.indexOf('const ACTIVIDAD_DOC'), src.indexOf('async function handleEvento(req, res) {'));
  const doc = {items: o.items || null};
  const txs = [];
  const db = {
    doc: (p) => ({path: p}),
    runTransaction: async (fn) => {
      if (o.falla) throw new Error('sin red');
      txs.push(1);
      return fn({
        get: async () => ({exists: !!doc.items, data: () => ({items: doc.items})}),
        set: (ref, d) => { doc.items = d.items; doc.path = ref.path; },
      });
    },
  };
  // eslint-disable-next-line no-new-func
  const _anotar = new Function('db', 'actividad', T + ';return _anotar;')(db, A);
  return {_anotar, doc, txs};
}

module.exports = async ({bloque, ok}) => {
  bloque('Actividad: cada acción, limpia y corta');
  {
    const ev = A.evento('visto', ped('id_1790000000001', {nroComprobante: 'b002-4393'}), {}, T0);
    ok(ev.t === 'visto' && ev.n === 'Ana' && ev.c === 'B002-4393' && ev.ts === T0 && ev.x === undefined, 'primer nombre, boleta y hora; nada más');
    ok(Object.keys(A.evento('pedido', ped('id_1', {phone: '999', dni: '12345678', address: 'Av 1'}), {}, T0)).sort().join() === 'c,id,n,t,ts',
       '⚠️ nunca guarda teléfono, DNI ni dirección');
    ok(A.evento('visto', ped('id_1790000000001'), {}, T0).c === '0001', 'sin boleta: los últimos 4 del pedido');
    ok(A.evento('hackeo', ped('id_1'), {}, T0) === null && A.evento('visto', {id: '../x'}, {}, T0) === null && A.evento('visto', null, {}, T0) === null,
       'tipo inventado o pedido inválido: nada');
    const r = A.evento('resena', ped('id_1', {name: '<img src=x>'}), {x: '2', s: '<script>Demoró</script>'}, T0);
    ok(!/[<>]/.test(JSON.stringify(r)) && r.s === 'scriptDemoró/script', 'sin < > en nombre ni texto');
    ok(A.evento('reclamo', ped('id_1'), {s: 'x'.repeat(300)}, T0).s.length === 80, 'textos con tope');
    ok(A.nombreCorto('') === '' && A.texto(A.evento('visto', {id: 'id_1'}, {}, T0)) === 'Cliente (#ID_1) vio su seguimiento', 'sin nombre: «Cliente»');
  }

  bloque('Solo las últimas 50: la 51 borra la más antigua');
  {
    let l = [];
    for (let i = 0; i < 51; i++) l = A.agregar(l, A.evento('pedido', ped('id_' + i), {}, T0 + i));
    ok(l.length === 50 && l[0].id === 'id_50' && l[49].id === 'id_1' && !l.some((e) => e.id === 'id_0'), '50 guardadas, la más nueva primero, la primera se fue');
    ok(A.agregar([{t: 'x'}, null, 'a', {t: 'visto', id: 'id_1', ts: 'ayer'}], A.evento('visto', ped('id_2'), {}, T0)).length === 1,
       'basura guardada se descarta al agregar');
    ok(A.agregar(l, null).length === 50, 'agregar nada no cambia la lista');
  }

  bloque('Repetidos: vistas y documentos cuentan una vez cada 6 horas');
  {
    const v = A.evento('visto', ped('id_1'), {}, T0);
    const l = A.agregar([], v);
    ok(A.repetido(l, A.evento('visto', ped('id_1'), {}, T0 + 5 * H)), 'la misma visita 5 h después: repetida');
    ok(!A.repetido(l, A.evento('visto', ped('id_1'), {}, T0 + 6 * H + 1)), 'pasadas las 6 h: cuenta de nuevo');
    ok(!A.repetido(l, A.evento('visto', ped('id_2'), {}, T0 + 1)), 'otro pedido: cuenta');
    const d = A.agregar([], A.evento('doc', ped('id_1'), {x: 'boleta'}, T0));
    ok(A.repetido(d, A.evento('doc', ped('id_1'), {x: 'boleta'}, T0 + H)) && !A.repetido(d, A.evento('doc', ped('id_1'), {x: 'guia'}, T0 + H)),
       'cada documento por separado');
    ['resena', 'reclamo', 'pedido'].forEach((t) => {
      const x = A.agregar([], A.evento(t, ped('id_1'), {x: '5'}, T0));
      ok(!A.repetido(x, A.evento(t, ped('id_1'), {x: '5'}, T0 + 1)), t + ': siempre cuenta (nunca se pierde)');
    });
  }

  bloque('Textos y prioridad en la campana');
  {
    const e = (t, x, s) => A.evento(t, ped('id_1790000000001'), {x: x, s: s}, T0);
    ok(A.texto(e('visto')) === 'Ana (#0001) vio su seguimiento', 'vio su seguimiento');
    ok(A.texto(e('doc', 'boleta')) === 'Ana (#0001) abrió su boleta' && A.texto(e('doc', 'raro')) === 'Ana (#0001) abrió su documento', 'abrió su documento');
    ok(A.texto(e('resena', '2')) === 'Ana (#0001) calificó su compra ★★☆☆☆', 'reseña con estrellas');
    ok(A.texto(e('reclamo', 'falla')) === 'Ana (#0001) pidió garantía por falla', 'reclamo');
    ok(A.texto(e('promo', 'Amoladora 42V')) === 'Ana (#0001) quiere la promo «Amoladora 42V»', 'promo');
    ok(A.urgente(e('reclamo', 'cambio')) && A.urgente(e('resena', '3')) && !A.urgente(e('resena', '4')) && !A.urgente(e('visto')),
       'reclamos y reseñas de 1 a 3 estrellas: en rojo');
  }

  bloque('Servidor: anotar no frena ni rompe nada');
  {
    const a = anotador();
    ok(await a._anotar('visto', ped('id_1')) === true && a.doc.items.length === 1 && a.doc.path === 'panel/actividad', 'anota en panel/actividad');
    ok(await a._anotar('visto', ped('id_1')) === false && a.txs.length === 1, '⚠️ la misma visita otra vez: ni siquiera lee la base (memoria del servidor)');
    ok(await a._anotar('resena', ped('id_1'), {x: '5'}) === true && await a._anotar('resena', ped('id_1'), {x: '5'}) === true && a.doc.items.length === 3,
       'reseñas siempre se anotan');
    const otra = anotador({items: [A.evento('visto', ped('id_9'), {}, Date.now() - H)]});
    ok(await otra._anotar('visto', ped('id_9')) === false && otra.doc.items.length === 1, 'si otra instancia ya la anotó hace poco: no repite');
    const caida = anotador({falla: true});
    ok(await caida._anotar('pedido', ped('id_1')) === false, '⚠️ si la base falla, devuelve false y no lanza (el cliente no se entera)');
    ok(await a._anotar('hackeo', ped('id_1')) === false, 'tipo inválido: nada');
  }

  bloque('Servidor: dónde se anota cada acción');
  {
    const src = E.leer('functions/index.js');
    const tramo = (a, b) => src.slice(src.indexOf(a), src.indexOf(b));
    ok(/if \(_texto\(req\.query\.r\) !== "1"\) await _anotar\("visto", order\);/.test(tramo('async function handleTrack', 'const VITRINA_DOC')),
       'seguimiento: anota la visita, salvo el refresco automático (r=1)');
    ok(/await _anotar\("doc", order, \{x: cual\}\);/.test(tramo('async function handleDoc', 'const RATE_LIMITS')), 'documentos');
    ok(/if \(estado === "ok"\) \{\s*await _anotar\("resena"/.test(tramo('async function handleReview', 'async function _snapDelEnlace')) ||
       /if \(estado === "ok"\) \{\s*await _anotar\("resena"/.test(src), 'reseñas, solo si se guardó');
    ok(/if \(estado === "ok"\) \{\s*await _anotar\("reclamo"/.test(src), 'reclamos, solo si se guardó');
    ok(/await _anotar\("pedido", Object\.assign\(\{\}, orderToSave, \{id: orderId\}\)/.test(tramo('async function handleCreate', 'const LLENADO_MIN_MS')),
       'pedidos nuevos del formulario');
    const seg = E.leerReal('cliente/seguimiento.js');
    ok(/_api\('track', silent \? \{token: t, r: 1\} : \{token: t\}\)/.test(seg), 'el seguimiento marca su refresco automático');
  }

  bloque('Clics en promos y sorteo (handleEvento)');
  {
    const src = E.leer('functions/index.js');
    const T = src.slice(src.indexOf('function _texto(v) {'), src.indexOf('function setCORS(req, res) {')) +
      src.slice(src.indexOf('function _cuerpoJson(req) {'), src.indexOf('const RECLAMOS_COL'));
    const anotados = [];
    const pedidos = {a: {id: 'id_1790000000001', name: 'ANA', trackToken: 't1_' + 'A'.repeat(22)}};
    const vit = {promos: [{titulo: 'Amoladora 42V'}, {titulo: 'Taladro'}], sorteo: {titulo: 'Sorteo de noviembre'}};
    // eslint-disable-next-line no-new-func
    const fn = new Function('enlace', 'checkRateLimit', '_vitrinaPublica', '_pedidoDelEnlace', '_anotar', T + ';return handleEvento;')(
        L, async () => true, async () => vit,
        async (t) => Object.values(pedidos).find((p) => p.trackToken === t) || null,
        async (t, p, x) => { anotados.push([t, p.id, x.x]); return true; });
    const pedir = async (body, metodo) => {
      const r = {code: 200};
      r.status = (c) => { r.code = c; return r; };
      r.json = () => r; r.send = () => r; r.set = () => {};
      await fn({method: metodo || 'POST', body}, r);
      return r.code;
    };
    const tok = pedidos.a.trackToken;
    ok(await pedir(JSON.stringify({token: tok, tipo: 'promo', i: 1})) === 204 && anotados[0].join() === 'promo,id_1790000000001,Taladro',
       'promo por su posición: anota el título que tiene el SERVIDOR (no el que mande el celular)');
    ok(await pedir(Buffer.from(JSON.stringify({token: tok, tipo: 'sorteo'}))) === 204 && anotados[1][2] === 'Sorteo de noviembre', 'sorteo (llega como texto)');
    ok(await pedir({token: tok, tipo: 'promo', i: 9}) === 404 && await pedir({token: tok, tipo: 'promo', i: -1}) === 404 &&
       await pedir({token: tok, tipo: 'promo', i: '1; drop'}) === 404, 'posición que no existe: 404');
    ok(await pedir({token: tok, tipo: 'hackeo'}) === 400 && await pedir({token: 'a/b', tipo: 'promo', i: 0}) === 400, 'tipo o token inválido: 400');
    ok(await pedir({token: tok, tipo: 'promo', i: 0}, 'GET') === 405, 'solo POST');
    ok(await pedir('x'.repeat(5000)) === 400 && await pedir('{malo') === 400 &&
       await pedir(JSON.stringify({token: tok, tipo: 'promo', i: 0, relleno: 'x'.repeat(3000)})) === 400, 'cuerpo enorme (aunque sea válido) o roto: 400');
    ok(await pedir({token: tok, tipo: 'promo', i: 0.5}) === 404 && await pedir({token: tok, tipo: 'promo', i: 'length'}) === 404, 'posición rara: 404');
    ok(await pedir({token: 't1_' + 'Z'.repeat(22), tipo: 'promo', i: 0}) === 404, 'token que no existe: 404');
    ok(anotados.length === 2, 'solo se anotaron los dos válidos');
    const seg = E.leerReal('cliente/seguimiento.js');
    const ctx = vm.createContext({window: {_segTok: tok}, FORM_API: 'https://api.example/formApi', Blob: function(p, o) { this.p = p; this.o = o; },
      navigator: {sendBeacon: (u, b) => { ctx.enviado = {u, b}; return true; }}});
    vm.runInContext((/function segEvento\(tipo, i\)\{[\s\S]*?\n\}/.exec(seg) || [''])[0], ctx);
    ctx.segEvento('promo', 1);
    ok(/action=evento$/.test(ctx.enviado.u) && ctx.enviado.b.o.type === 'text/plain' && JSON.parse(ctx.enviado.b.p[0]).i === 1,
       'el celular avisa con sendBeacon (no frena el WhatsApp)');
  }

  bloque('Campana del panel');
  {
    const nt = E.leerReal('panel/pedidos/actividad-campana.js');
    const vieja = E.leerReal('panel/pedidos/notify.js');
    ok(/🔔 Nuevos pedidos/.test(vieja) && /window\.NotifyModule = \{/.test(vieja) && !/Actividad|_fbLeerActividad/.test(vieja),
       '⚠️ la campana de nuevos pedidos sigue como estaba, sin la actividad');
    ok(/id="actividadBellSlot"/.test(E.leerReal('index.html')) && /'actividadBellSlot'/.test(nt) && /window\.ActividadCampana = \{/.test(nt) &&
       !/NotifyModule|notifyPanel|notifyBtn/.test(nt), 'la actividad va en su propia campana (👥), con sus propios ids');
    ok(/var CADA_MS = 120000;/.test(nt) && /window\._syncUltimo && typeof window\._fbLeerActividad === 'function'/.test(nt) &&
       /if\(document\.hidden && !forzar\) return false;/.test(nt), 'lee cada 2 minutos, solo con sesión y con el panel a la vista');
    ok(/localStorage\.getItem\(CLAVE_VISTO\)/.test(nt) && /e\.ts > desde/.test(nt), 'el número cuenta solo lo nuevo desde que la abriste');
    ok(/'reclamos', 'Reclamos'/.test(nt) && /'resenas', 'Reseñas'/.test(nt) && /'vistas', 'Vistas'/.test(nt), 'filtros');
    ok(!/clearAll/.test(nt), 'la actividad no se borra a mano');
    ok(/_fbLeerActividad = \(\) => fsGet\(`\$\{RAIZ\}\/actividad`\)/.test(E.leerReal('panel/datos/nube.js')) &&
       /functions\/actividad\.js/.test(E.leerReal('index.html')), 'panel y servidor usan la misma pieza');
  }

  bloque('Papelera: nadie la vacía, se borra sola a los 30 días');
  {
    const pp = E.leerReal('panel/pedidos/pin-papelera.js');
    const ctx = vm.createContext({});
    vm.runInContext('const PAPELERA_DIAS=30;' + (/function papeleraVigentes\(lista, ahora\)\{[\s\S]*?\n\}/.exec(pp) || [''])[0], ctx);
    const D = 86400000;
    const l = [{shipment: {id: 'a'}, deletedAt: T0 - 29 * D}, {shipment: {id: 'b'}, deletedAt: T0 - 30 * D}, {shipment: {id: 'c'}}, {deletedAt: T0}, null];
    ok(ctx.papeleraVigentes(l, T0).map((x) => x.shipment.id).join() === 'a', 'quedan los de menos de 30 días; lo dañado se descarta');
    ok(ctx.papeleraVigentes(null, T0).length === 0, 'sin papelera: vacía, sin error');
    ok(!/emptyTrash/.test(pp) && !/Vaciar todo/.test(E.leerReal('index.html')), '⚠️ no existe botón ni función para vaciarla');
    ok(/Nadie puede vaciar la papelera/.test(E.leerReal('index.html')), 'y se lo explica al usuario');

    const cfg = {trash: [{shipment: {id: 'viejo'}, deletedAt: T0 - 31 * D}, {shipment: {id: 'nuevo'}, deletedAt: T0 - D}, {shipment: {id: 'sinFecha'}},
      {shipment: {id: 'casi'}, deletedAt: T0 - 29.5 * D}, {shipment: {id: 'texto'}, deletedAt: String(T0 - 40 * D)}]};
    const sueltos = [{id: 's1', deletedAt: T0 - 40 * D}, {id: 's2', deletedAt: T0 - 31 * D}];
    let actualizado = null;
    const borrados = [];
    const db = {
      doc: () => ({}),
      runTransaction: async (fn) => fn({get: async () => ({exists: true, data: () => cfg}), update: (r, d) => { actualizado = d; }}),
      collection: () => ({where: (k, op, v) => ({limit: () => ({get: async () => {
        const d = sueltos.filter((x) => op === '<' && x[k] < v && borrados.indexOf(x.id) < 0);
        return {empty: !d.length, docs: d.map((x) => ({ref: x.id}))};
      }})})}),
      batch: () => { const b = []; return {delete: (r) => b.push(r), commit: async () => { borrados.push(...b); }}; },
    };
    const r = await LP.limpiarPapelera(db, T0);
    ok(r.enConfig === 1 && actualizado.trash.map((x) => x.shipment.id).join() === 'nuevo,sinFecha,casi,texto', 'en el servidor: borra solo los vencidos de la papelera');
    ok(r.sueltos === 2 && borrados.join() === 's1,s2', 'y las copias sueltas vencidas');
    actualizado = null;
    const db2 = Object.assign({}, db, {runTransaction: async (fn) => fn({get: async () => ({exists: true, data: () => ({trash: [{shipment: {}, deletedAt: T0}]})}), update: (r, d) => { actualizado = d; }})});
    ok((await LP.limpiarPapelera(db2, T0)).enConfig === 0 && actualizado === null, 'si no hay nada vencido: no escribe');
    ok(LP.DIAS_PAPELERA === 30 && /limpieza\.limpiarPapelera\(db, Date\.now\(\)\)/.test(E.leer('functions/index.js')), 'corre cada día en la limpieza de las 3:17');
  }
};
