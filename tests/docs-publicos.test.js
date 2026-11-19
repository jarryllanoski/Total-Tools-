'use strict';
const E = require('./_entorno.js');
const DP = require('../functions/docsPublicos.js');
const L = require('../functions/enlaceSeguimiento.js');

const BUCKET = 'total-tools-24ce8.firebasestorage.app';
const url = (ruta, b) => 'https://firebasestorage.googleapis.com/v0/b/' + (b || BUCKET) + '/o/' + encodeURIComponent(ruta) + '?alt=media&token=abc';

function servidor(pedidos, archivos, opciones) {
  const o = opciones || {};
  const src = E.leer('functions/index.js');
  const T = src.slice(src.indexOf('function _texto(v) {'), src.indexOf('function setCORS(req, res) {')) +
    src.slice(src.indexOf('async function _pedidoDelEnlace'), src.indexOf('const RATE_LIMITS = {'));
  const descargas = [];
  const db = {
    doc: (p) => ({get: async () => { const id = p.split('/').pop(); return pedidos[id] ? {exists: true, data: () => pedidos[id]} : {exists: false}; }}),
    collection: () => ({where: (k, op, v) => ({limit: () => ({get: async () => {
      const d = Object.values(pedidos).filter((x) => x[k] === v);
      return {empty: !d.length, docs: d.map((x) => ({data: () => x}))};
    }})})}),
  };
  const bucket = {name: BUCKET, file: (ruta) => ({
    getMetadata: async () => { if (!archivos[ruta]) throw new Error('no existe'); return [archivos[ruta].meta]; },
    download: async () => { descargas.push(ruta); return [archivos[ruta].bytes]; },
  })};
  // eslint-disable-next-line no-new-func
  const fn = new Function('db', '_anotar', 'enlace', 'checkRateLimit', 'pedidoPublico', 'SHIP_COL', 'docsPublicos', 'getStorage', 'vitrina', 'resenas', 'garantia', T + ';return handleDoc;')(
      db, (globalThis.__anotar || (async () => false)), L, async () => o.freno !== false, require('../functions/pedidoPublico.js'), 'panel/shipments/items', DP, () => ({bucket: () => bucket}), require('../functions/vitrina.js'), require('../functions/resenas.js'), require('../functions/garantia.js'));
  const pedir = async (token, tipo) => {
    const r = {code: 200, body: null, cab: {}};
    r.status = (c) => { r.code = c; return r; };
    r.json = (b) => { r.body = b; return r; };
    r.send = (b) => { r.body = b; return r; };
    r.set = (k, v) => { r.cab[k.toLowerCase()] = v; return r; };
    await fn({query: {token, tipo}}, r);
    return r;
  };
  return {pedir, descargas};
}

module.exports = async ({bloque, ok}) => {
  const hoy = new Date().toISOString();
  const TOK = 't1_' + 'A'.repeat(22);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

  bloque('Qué documentos hay (sin entregar ningún enlace)');
  {
    const p = {id: 'id_1790000000001', docTicket: {d: url('shipments/id_1790000000001/ticket.jpg')}, docEmbalado: {d: url('shipments/id_1790000000001/embalado.jpg')},
      docGuia: {d: '[img]'}, links: [{u: 'https://drive.google.com/x'}]};
    const d = DP.disponibles(p, BUCKET);
    ok(d.boleta === 'archivo' && d.paquete === 'archivo' && d.guia === '', 'boleta y foto sí; la guía perdida ([img]) no');
    ok(!JSON.stringify(d).includes('firebasestorage') && !JSON.stringify(d).includes('token='), '⚠️ al cliente solo le llega «hay o no hay», nunca el enlace del archivo');
    const sinBoleta = DP.disponibles({id: 'id_1', links: [{u: 'https://drive.google.com/x'}]}, BUCKET);
    ok(sinBoleta.boleta === 'link' && sinBoleta.link === 'https://drive.google.com/x', 'sin boleta subida: el link adjunto ocupa su lugar');
    ok(DP.disponibles({id: 'id_1', links: [{u: 'javascript:alert(1)'}]}, BUCKET).boleta === '', 'un link que no es https no cuenta');
    ok(DP.disponibles(null, BUCKET).boleta === '' && DP.disponibles({}, BUCKET).guia === '', 'sin pedido: nada');
  }

  bloque('De dónde sale cada archivo: solo de la carpeta de ESE pedido');
  {
    const O = (d, id, b) => DP.origen({d}, id || 'id_1790000000001', b === undefined ? BUCKET : b);
    ok(O(url('shipments/id_1790000000001/guia.png')).ruta === 'shipments/id_1790000000001/guia.png', 'su propia carpeta: sí');
    ok(O(url('shipments/id_1790000000002/guia.png')) === null, '⚠️ el archivo de OTRO pedido: no');
    ok(O(url('shipments/id_1790000000001/../id_2/guia.png')) === null && O(url('shipments/id_1790000000001//x.png')) === null, 'rutas con .. o // : no');
    ok(O(url('shipments/id_1790000000001/sub/x.png')) === null, 'subcarpetas: no');
    ok(O(url('recursos/portada/x.png')) === null, 'otra carpeta del bucket: no');
    ok(O(url('shipments/id_1790000000001/guia.png', 'otro-bucket.appspot.com')) === null, 'otro bucket: no');
    ok(O('https://evil.example/v0/b/' + BUCKET + '/o/x') === null && O('http://firebasestorage.googleapis.com/v0/b/' + BUCKET + '/o/x') === null, 'otro dominio o http: no');
    ok(O('data:image/png;base64,iVBORw0KGgo=').tipo === 'base64', 'una foto antigua guardada en base64: sí');
    ok(O('data:text/html;base64,PHNjcmlwdD4=') === null && O('data:image/svg+xml;base64,PHN2Zz4=') === null, 'HTML o SVG (pueden llevar código): no');
    ok(DP.origen({d: url('shipments/x/y.png')}, '../x', BUCKET) === null && DP.origen(null, 'id_1', BUCKET) === null, 'id raro o sin documento: no');
  }

  bloque('El servidor entrega el archivo solo con un link válido');
  {
    const pedido = {id: 'id_1790000000001', status: 'ENVIADO', createdAt: hoy, trackToken: TOK,
      docTicket: {d: url('shipments/id_1790000000001/ticket.png')}, docGuia: {d: url('shipments/id_1790000000002/guia.png')}};
    const archivos = {
      'shipments/id_1790000000001/ticket.png': {meta: {contentType: 'image/png', size: 4}, bytes: png},
      'shipments/id_1790000000002/guia.png': {meta: {contentType: 'image/png', size: 4}, bytes: png},
    };
    let s = servidor({id_1790000000001: pedido}, archivos);
    let r = await s.pedir(TOK, 'boleta');
    ok(r.code === 200 && r.body === png && r.cab['content-type'] === 'image/png', 'link válido + boleta: entrega la imagen');
    ok(r.cab['cache-control'] === 'private, no-store' && r.cab['x-content-type-options'] === 'nosniff', 'sin guardarse en cachés compartidas y sin adivinar el tipo');
    ok(r.cab['content-disposition'] === 'inline; filename="boleta-0001.png"' && r.cab['access-control-expose-headers'] === 'Content-Disposition',
       'con un nombre de archivo limpio, que el navegador puede leer');
    r = await s.pedir(TOK, 'guia');
    ok(r.code === 404 && s.descargas.length === 1, '⚠️ un documento que apunta a la carpeta de otro pedido: no se descarga');
    r = await s.pedir('t1_' + 'B'.repeat(22), 'boleta');
    ok(r.code === 404, 'token que no existe: nada');
    r = await s.pedir('../../x', 'boleta');
    ok(r.code === 404, 'token con forma rara: nada');
    r = await s.pedir(TOK, 'constructor');
    ok(r.code === 404, 'un tipo inventado (aunque exista en Object): nada');
    r = await s.pedir(TOK, 'paquete');
    ok(r.code === 404, 'documento que no se subió: nada');
    s = servidor({id_1790000000001: pedido}, archivos, {freno: false});
    r = await s.pedir(TOK, 'boleta');
    ok(r.code === 429 && s.descargas.length === 0, 'demasiadas pedidas seguidas: frenado antes de leer nada');
  }

  bloque('Las reglas de privacidad del seguimiento se respetan aquí también');
  {
    const viejo = new Date(Date.now() - 90 * 864e5).toISOString();
    const archivos = {'shipments/id_1754000000001/ticket.png': {meta: {contentType: 'image/png', size: 4}, bytes: png}};
    const doc = {docTicket: {d: url('shipments/id_1754000000001/ticket.png')}};
    let s = servidor({id_1754000000001: Object.assign({id: 'id_1754000000001', status: 'FINALIZADO', createdAt: viejo}, doc)}, archivos);
    ok((await s.pedir('id_1754000000001', 'boleta')).code === 404, 'link antiguo de un pedido cerrado: nada');
    s = servidor({id_1754000000001: Object.assign({id: 'id_1754000000001', status: 'ENVIADO', createdAt: hoy}, doc)}, archivos);
    ok((await s.pedir('id_1754000000001', 'boleta')).code === 200, 'link antiguo de un pedido abierto: sí (como el seguimiento)');
    s = servidor({id_1754000000001: Object.assign({id: 'id_1754000000001', status: 'FINALIZADO', createdAt: viejo, trackToken: TOK}, doc)}, archivos);
    ok((await s.pedir(TOK, 'boleta')).code === 404, 'entregado hace más de 60 días: los documentos ya no se muestran');
  }

  bloque('El seguimiento solo dice qué documentos hay, y nada en pedidos viejos');
  {
    const src = E.leer('functions/index.js');
    const T = src.slice(src.indexOf('function _texto(v) {'), src.indexOf('function setCORS(req, res) {')) +
      src.slice(src.indexOf('async function handleTrack'), src.indexOf('async function handleDoc(req, res) {'));
    const viejo = new Date(Date.now() - 90 * 864e5).toISOString();
    const pedidos = {
      a: {id: 'id_1790000000001', status: 'ENVIADO', createdAt: hoy, trackToken: TOK, docTicket: {d: url('shipments/id_1790000000001/t.png')}},
      b: {id: 'id_1754000000001', status: 'FINALIZADO', createdAt: viejo, trackToken: 't1_' + 'C'.repeat(22), docTicket: {d: url('shipments/id_1754000000001/t.png')}},
    };
    const db = {doc: () => ({get: async () => ({exists: false})}),
      collection: () => ({where: (k, op, v) => ({limit: () => ({get: async () => {
        const d = Object.values(pedidos).filter((x) => x[k] === v);
        return {empty: !d.length, docs: d.map((x) => ({data: () => x}))};
      }})})})};
    // eslint-disable-next-line no-new-func
    const ht = new Function('db', '_anotar', 'enlace', 'checkRateLimit', 'pedidoPublico', 'SHIP_COL', 'CFG_DOC', 'docsPublicos', 'getStorage', 'vitrina', 'resenas', 'garantia', T + ';return handleTrack;')(
        db, (globalThis.__anotar || (async () => false)), L, async () => true, require('../functions/pedidoPublico.js'), 'panel/shipments/items', 'panel/config', DP, () => ({bucket: () => ({name: BUCKET})}), require('../functions/vitrina.js'), require('../functions/resenas.js'), require('../functions/garantia.js'));
    const ver = async (t) => { const r = {json: (b) => { r.body = b; return r; }, status: () => r}; await ht({query: {token: t}}, r); return r.body; };
    const r1 = await ver(TOK);
    ok(r1.order.docs && r1.order.docs.boleta === 'archivo' && !JSON.stringify(r1).includes('firebasestorage'), 'pedido actual: dice «hay boleta», sin el enlace');
    const r2 = await ver('t1_' + 'C'.repeat(22));
    ok(r2.order.minimo === true && r2.order.docs === undefined, 'entregado hace más de 60 días: ni siquiera dice qué documentos había');
  }

  bloque('Archivos peligrosos o enormes no salen');
  {
    const p = {id: 'id_1790000000001', status: 'ENVIADO', createdAt: hoy, trackToken: TOK,
      docTicket: {d: url('shipments/id_1790000000001/a.html')}, docEmbalado: {d: url('shipments/id_1790000000001/b.png')}};
    const s = servidor({id_1790000000001: p}, {
      'shipments/id_1790000000001/a.html': {meta: {contentType: 'text/html', size: 10}, bytes: Buffer.from('<script>')},
      'shipments/id_1790000000001/b.png': {meta: {contentType: 'image/png', size: 20 * 1024 * 1024}, bytes: png},
    });
    ok((await s.pedir(TOK, 'boleta')).code === 404, 'un archivo que no es imagen ni PDF: no');
    ok((await s.pedir(TOK, 'paquete')).code === 404 && s.descargas.length === 0, 'un archivo de más de 8 MB: no, y ni se descarga');
  }

  bloque('Cliente: documentos en su pantalla');
  {
    const sj = E.leerReal('cliente/seguimiento.js');
    ok(/\['boleta', '🧾', 'Boleta \/ factura'/.test(sj) && /\['paquete', '📦', 'Foto del paquete'/.test(sj) && /\['guia', '🚚', 'Guía de envío'/.test(sj),
       'boleta, foto del paquete y guía, en ese orden');
    ok(/fetch\(FORM_API \+ '\?action=doc&tipo=' \+ encodeURIComponent\(cual\) \+ '&token=' \+ encodeURIComponent\(window\._segTok\)\)/.test(sj),
       'se piden solo al tocarlos, con el link del cliente');
    ok(/var url = URL\.createObjectURL\(await r\.blob\(\)\);/.test(sj) && /_segDocCache\[cual\] = \{/.test(sj) &&
       /var c = _segDocCache\[cual\];\s*if\(c\)\{ _verDoc\(cual, c\.url, c\.mime, c\.nombre\); return; \}/.test(sj),
       'se ven desde la memoria del celular; la segunda vez no se vuelven a pedir');
    ok(/application\\\/pdf\)\$\/\.test\(mime\)/.test(sj), 'solo imágenes o PDF se muestran');
    ok(/download="' \+ esc\(nombre\) \+ '">⬇ Descargar<\/a>/.test(sj), 'botón Descargar');
    ok(/if\(docs\[cual\] === 'link' && docs\.link\)\{ window\.open\(docs\.link, '_blank', 'noopener'\)/.test(sj), 'el link adjunto se abre aparte, sin acceso a la página');
    ok(/Por tu privacidad, los documentos de un pedido entregado hace tiempo ya no se muestran/.test(sj), 'pedido viejo: lo explica');
    ok(/action === "doc"\) await handleDoc\(req, res\)/.test(E.leer('functions/index.js')), 'el servidor atiende la acción doc');
    ok(/formApi_doc: \{windowMs: 60000, max: 20, memoria: true\}/.test(E.leer('functions/index.js')), 'con freno propio');
  }
};
