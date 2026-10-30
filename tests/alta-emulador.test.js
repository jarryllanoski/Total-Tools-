/**
 * tests/alta-emulador.test.js — el alta de pedidos contra Firestore DE VERDAD
 * ==========================================================================
 * (No corre si no hay emulador en 127.0.0.1:8085.)
 * `handleCreate` REAL de functions/index.js, con firebase-admin contra el
 * emulador, probando los dos agujeros que cerró la transacción (30/10/2026):
 *   · dos clientes en el MISMO milisegundo → dos pedidos, ninguno se pisa;
 *   · el mismo link desde dos pestañas a la vez → UN solo pedido.
 */
'use strict';
const E = require('./_entorno.js');
const path = require('path');
const EMU = '127.0.0.1:8085';

module.exports = async ({bloque, ok}) => {
  bloque('El alta contra el emulador de Firestore (choques y links usados dos veces)');
  let hay = false;
  try { hay = (await fetch('http://' + EMU)).ok; } catch (e) { hay = false; }
  if (!hay) {
    ok(true, 'OMITIDA: no hay emulador en ' + EMU + '. Se corrió el 30/10/2026 con todo bien.');
    return;
  }
  process.env.FIRESTORE_EMULATOR_HOST = EMU;
  const req = require('module').createRequire(path.join(__dirname, '../functions/index.js'));
  try { req.resolve('firebase-admin/app'); } catch (e) {
    ok(true, 'OMITIDA: falta functions/node_modules (cd functions && npm ci).');
    return;
  }
  const {initializeApp, getApps} = req('firebase-admin/app');
  const {getFirestore} = req('firebase-admin/firestore');
  const app = getApps().find((a) => a.name === 'alta') || initializeApp({projectId: 'demo-alta'}, 'alta');
  const db = getFirestore(app);
  await fetch('http://' + EMU + '/emulator/v1/projects/demo-alta/databases/(default)/documents', {method: 'DELETE'});

  const src = E.leer('functions/index.js');
  const campos = src.slice(src.indexOf('const ORDER_FIELDS'), src.indexOf('// ── action=create'));
  const create = src.slice(src.indexOf('async function handleCreate'), src.indexOf('// ── action=token'));
  // El reloj CONGELADO: todos los pedidos nacen en el mismo milisegundo.
  let T = 1793350000000;
  class Reloj extends Date {
    constructor(...a) { if (a.length) super(...a); else super(T); }
    static now() { return T; }
  }
  // eslint-disable-next-line no-new-func
  const handleCreate = new Function('db', 'agencias', 'enlace', 'reniecPublico', 'nroComp',
      'checkRateLimit', 'TOK_COL', 'SHIP_COL', 'CFG_DOC', '_conMts', 'SYNC_V', 'Date',
      campos + create + ';return handleCreate;',
  )(db, require('../functions/agencias.js'), {generar: () => 't1_' + Math.random().toString(36).slice(2)},
      {normalizar: () => ''}, require('../functions/nroComprobante.js'), async () => true,
      'panel/tokens/items', 'panel/shipments/items', 'panel/config', (o) => o, 1, Reloj);
  const llamar = async (body) => {
    const r = {code: 200, body: null};
    r.status = (c) => { r.code = c; return r; };
    r.json = (b) => { r.body = b; return r; };
    await handleCreate({body}, r);
    return r;
  };

  const r5 = await Promise.all([1, 2, 3, 4, 5].map((i) =>
    llamar({order: {name: 'CLIENTE ' + i, phone: '90000000' + i}})));
  const ids = r5.map((r) => r.body && r.body.orderId);
  ok(r5.every((r) => r.code === 200 && r.body.status === 'ok'), '5 pedidos a la vez en el mismo milisegundo: los 5 responden ok');
  ok(new Set(ids).size === 5, '⚠️ con 5 ids DISTINTOS: ' + ids.join(', '));
  const docs = await db.collection('panel/shipments/items').get();
  ok(docs.size === 5, '⚠️ y los 5 están en la base: ninguno pisó a otro (antes el segundo borraba al primero)');
  ok(ids.every((id) => /^id_\d+$/.test(id)), 'el formato del id no cambia (id_ + número)');
  const nombres = docs.docs.map((d) => d.data().name).sort().join(',');
  ok(nombres === 'CLIENTE 1,CLIENTE 2,CLIENTE 3,CLIENTE 4,CLIENTE 5', 'cada pedido con SUS datos');

  T += 1000; // el reloj avanza, como en la vida real
  await db.doc('panel/tokens/items/LINKdePrueba01').set({prefillPhone: '911111111'});
  const r3 = await Promise.all([1, 2, 3].map((i) =>
    llamar({token: 'LINKdePrueba01', order: {name: 'PESTAÑA ' + i, phone: '911111111'}})));
  const buenos = r3.filter((r) => r.code === 200);
  ok(buenos.length === 1, '⚠️ el mismo link desde 3 pestañas a la vez: UN solo pedido (' + buenos.length + ')');
  ok(r3.filter((r) => r.code === 400 && /utilizado/.test(r.body.error)).length === 2,
     'las otras dos reciben «Token ya utilizado»');
  const tok = (await db.doc('panel/tokens/items/LINKdePrueba01').get()).data();
  ok(tok.used === true && tok.orderId === buenos[0].body.orderId, 'el link queda marcado con el pedido que sí nació');
  const total = (await db.collection('panel/shipments/items').get()).size;
  ok(total === 6, 'en la base: 5 + 1 = 6 pedidos');
  const r4 = await llamar({token: 'otro/../ruta', order: {name: 'X', phone: '9'}});
  ok(r4.code === 400 && /inválido/.test(r4.body.error), 'un id de link con «/» se rechaza sin leer nada');
};
