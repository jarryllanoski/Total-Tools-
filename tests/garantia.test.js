'use strict';
const vm = require('vm');
const E = require('./_entorno.js');
const G = require('../functions/garantia.js');
const L = require('../functions/enlaceSeguimiento.js');

const DIA = 86400000;
const AHORA = Date.now();
const hace = (d) => new Date(AHORA - d * DIA).toISOString();
const TOK = (c) => 't1_' + c.repeat(22);
const JPG = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(300, 7)]).toString('base64');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47]), Buffer.alloc(300, 7)]).toString('base64');
const valido = (o) => Object.assign({tipo: 'falla', producto: 'Taladro 20V', texto: 'No enciende desde ayer', fotos: [JPG]}, o || {});

function servidor(pedidos, opciones) {
  const o = opciones || {};
  const src = E.leer('functions/index.js');
  const T = src.slice(src.indexOf('function _texto(v) {'), src.indexOf('function setCORS(req, res) {')) +
    src.slice(src.indexOf('async function _pedidoDelEnlace'), src.indexOf('async function handleDoc(req, res) {')) +
    src.slice(src.indexOf('const RECLAMOS_COL'), src.indexOf('const OLVA_STORES_URL ='));
  const escrituras = [];
  const creados = [];
  const guardados = [];
  const borrados = [];
  const refDe = (id) => ({id});
  const db = {
    doc: (p) => ({path: p}),
    collection: () => ({where: (k, op, v) => ({limit: () => ({get: async () => {
      const d = Object.keys(pedidos).filter((id) => pedidos[id][k] === v);
      return {empty: !d.length, docs: d.map((id) => ({data: () => pedidos[id], ref: refDe(id)}))};
    }})})}),
    runTransaction: async (fn) => fn({
      get: async (ref) => ({exists: !!pedidos[ref.id], data: () => (o.antesDeTx ? o.antesDeTx(pedidos[ref.id]) : pedidos[ref.id])}),
      create: (ref, d) => creados.push({path: ref.path, d}),
      update: (ref, campos) => {
        escrituras.push({id: ref.id, campos});
        pedidos[ref.id] = Object.assign({}, pedidos[ref.id], campos);
      },
    }),
  };
  const bucket = {name: 'tt.firebasestorage.app', file: (ruta) => ({
    save: async (buf, op) => guardados.push({ruta, buf, op}),
    delete: async () => borrados.push(ruta),
  })};
  // eslint-disable-next-line no-new-func
  const fn = new Function('db', '_anotar', 'enlace', 'checkRateLimit', 'SHIP_COL', 'getStorage', 'garantia', '_conMts', 'crypto',
      T + ';return handleClaim;')(
      db, (globalThis.__anotar || (async () => false)), L, async () => o.freno !== true, 'panel/shipments/items', () => ({bucket: () => bucket}), G,
      (c) => Object.assign({}, c, {_mts: 'HORA_SERVIDOR'}), {randomUUID: () => 'llave-' + guardados.length});
  const enviar = async (body, metodo) => {
    const r = {code: 200, body: null, cab: {}};
    r.status = (c) => { r.code = c; return r; };
    r.json = (b) => { r.body = b; return r; };
    r.set = (k, v) => { r.cab[k] = v; };
    await fn({method: metodo || 'POST', body}, r);
    return r;
  };
  return {enviar, escrituras, creados, guardados, borrados, pedidos};
}

module.exports = async ({bloque, ok}) => {
  bloque('Garantía: qué puede pedir el cliente según los días');
  {
    ok(G.tipos({status: 'FINALIZADO', createdAt: hace(3)}, AHORA).join() === 'cambio,devolucion,falla', 'hasta 30 días: cambio, devolución o falla');
    ok(G.tipos({status: 'ENTREGADO', createdAt: hace(30)}, AHORA).join() === 'cambio,devolucion,falla', 'el día 30 todavía cuenta');
    ok(G.tipos({status: 'ENTREGADO', createdAt: hace(31)}, AHORA).join() === 'falla', 'después de 30 días: solo falla de fabricación');
    ok(G.tipos({status: 'FINALIZADO', createdAt: hace(366)}, AHORA).length === 0, 'pasado el año: ya no en línea');
    ok(['ENVIADO', 'CANCELADO', 'NUEVO PEDIDO', ''].every((st) => G.tipos({status: st, createdAt: hace(1)}, AHORA).length === 0) &&
       G.tipos({status: 'FINALIZADO'}, AHORA).length === 0, '⚠️ sin entregar, cancelado o sin fecha: nada');
  }

  bloque('Garantía: el servidor solo acepta solicitudes completas y fotos JPEG');
  {
    const P = ['cambio', 'devolucion', 'falla'];
    const r = G.limpiar(valido({texto: ' <b>No enciende</b> desde ayer\n', otro: 1}), P);
    ok(r && r.tipo === 'falla' && r.texto === 'bNo enciende/b desde ayer' && Buffer.isBuffer(r.fotos[0]) && Object.keys(r).sort().join() === 'fotos,producto,texto,tipo',
       'limpia el texto y deja solo lo necesario');
    ok(G.limpiar(valido({tipo: 'cambio'}), ['falla']) === null, '⚠️ un tipo vencido para ese pedido: rechazado');
    ok(G.limpiar(valido({tipo: 'regalo'}), P) === null && G.limpiar(valido({tipo: '__proto__'}), P) === null, 'tipo inventado: rechazado');
    ok(G.limpiar(valido({producto: 'x'}), P) === null && G.limpiar(valido({texto: 'corto'}), P) === null, 'sin producto o sin explicación: rechazado');
    ok(G.limpiar(valido({fotos: []}), P) === null && G.limpiar(valido({fotos: [JPG, JPG, JPG, JPG]}), P) === null, 'sin fotos o más de 3: rechazado');
    ok(G.limpiar(valido({fotos: [PNG]}), P) === null && G.limpiar(valido({fotos: ['PHNjcmlwdD4=']}), P) === null &&
       G.limpiar(valido({fotos: ['data:image/jpeg;base64,' + JPG]}), P) === null, '⚠️ lo que no es JPEG de verdad (por sus bytes): rechazado');
    const casi = (b) => Buffer.concat([Buffer.from(b), Buffer.alloc(300, 7)]).toString('base64');
    ok(G.fotoJpeg(casi([0xFF, 0x00, 0xFF])) === null && G.fotoJpeg(casi([0xFF, 0xD8, 0x00])) === null && G.fotoJpeg(casi([0x00, 0xD8, 0xFF])) === null &&
       G.fotoJpeg(casi([0xFF, 0xD8, 0xFF])) !== null, 'revisa los 3 bytes de inicio de un JPEG');
    const grande = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF]), Buffer.alloc(G.MAX_FOTO_BYTES)]).toString('base64');
    ok(G.limpiar(valido({fotos: [grande]}), P) === null, 'foto de más de 1.5 MB: rechazada');
    ok(G.publico({estado: 'APROBADO', tipo: 'falla', fecha: 'f', respuesta: '<i>Trae tu boleta</i>', telefono: '999'}).respuesta === 'iTrae tu boleta/i' &&
       G.publico({estado: 'APROBADO', tipo: 'falla', telefono: '999'}).telefono === undefined && G.publico({estado: 'X', tipo: 'falla'}) === null,
       'al cliente solo le llega estado, tipo, fecha y respuesta');
  }

  bloque('Garantía en el servidor real (handleClaim)');
  {
    const ped = () => ({
      a: {id: 'id_1790000000001', status: 'FINALIZADO', createdAt: hace(3), trackToken: TOK('A'), name: 'CLIENTE PRUEBA', phone: '900 000 001'},
      b: {id: 'id_1790000000002', status: 'ENVIADO', createdAt: hace(3), trackToken: TOK('B')},
      c: {id: 'id_1790000000003', status: 'FINALIZADO', createdAt: hace(60), trackToken: TOK('C')},
      id_1754000000004: {id: 'id_1754000000004', status: 'FINALIZADO', createdAt: hace(3)},
    });
    const s = servidor(ped());
    ok((await s.enviar(Object.assign({token: TOK('A')}, valido()), 'GET')).code === 405, 'solo POST');
    ok((await s.enviar(Object.assign({token: 'id_1754000000004'}, valido()))).code === 400, '⚠️ con link antiguo (sin token): no se aceptan solicitudes');
    ok((await s.enviar(Object.assign({token: TOK('Z')}, valido()))).code === 404, 'token que no existe: 404');
    ok((await s.enviar(Object.assign({token: TOK('B')}, valido()))).code === 400, 'pedido sin entregar: rechazado');
    ok((await s.enviar(Object.assign({token: TOK('C')}, valido({tipo: 'devolucion'})))).code === 400, 'devolución pasados 30 días: rechazada');
    ok(s.guardados.length === 0 && s.escrituras.length === 0 && s.creados.length === 0, 'nada de eso subió fotos ni escribió');

    const r = await s.enviar(Object.assign({token: TOK('A')}, valido({fotos: [JPG, JPG], status: 'CANCELADO'})));
    ok(r.body.status === 'ok' && r.cab['Cache-Control'] === 'private, no-store', 'solicitud válida: ok');
    ok(s.guardados.length === 2 && s.guardados.every((g) => /^reclamos\/id_1790000000001\/\d+-[12]\.jpg$/.test(g.ruta) && g.op.contentType === 'image/jpeg' &&
       g.op.metadata.metadata.firebaseStorageDownloadTokens), 'fotos en reclamos/<pedido>/ como JPEG, con llave privada');
    const c = s.creados[0];
    ok(c.path === 'panel/reclamos/items/id_1790000000001' && c.d.estado === 'RECIBIDO' && c.d.fotos.length === 2 &&
       c.d.fotos.every((u) => u.startsWith('https://firebasestorage.googleapis.com/v0/b/tt.firebasestorage.app/o/reclamos%2F')) &&
       c.d.telefono === '900000001' && c.d.cliente === 'CLIENTE PRUEBA', 'la solicitud queda en el panel con fotos, cliente y teléfono');
    const w = s.escrituras[0];
    ok(Object.keys(w.campos).sort().join() === '_mts,reclamo' && Object.keys(w.campos.reclamo).sort().join() === 'estado,fecha,tipo',
       '⚠️ en el pedido solo escribe el estado del reclamo (sin fotos ni teléfono), y no toca su estado');
    ok(s.pedidos.a.status === 'FINALIZADO', 'el pedido sigue FINALIZADO');
    const r2 = await s.enviar(Object.assign({token: TOK('A')}, valido()));
    ok(r2.body.status === 'ya' && s.guardados.length === 2 && s.creados.length === 1, '⚠️ una sola solicitud por pedido: la segunda no sube nada');

    const carrera = servidor(ped(), {antesDeTx: (p) => Object.assign({}, p, {reclamo: {estado: 'RECIBIDO', tipo: 'falla'}})});
    const rc = await carrera.enviar(Object.assign({token: TOK('A')}, valido()));
    ok(rc.body.status === 'ya' && carrera.creados.length === 0 && carrera.borrados.length === 1 && carrera.borrados[0] === carrera.guardados[0].ruta,
       'si otra solicitud ganó mientras subía las fotos: no escribe y borra sus fotos');
    const f = servidor(ped(), {freno: true});
    ok((await f.enviar(Object.assign({token: TOK('A')}, valido()))).code === 429 && f.guardados.length === 0, 'con el freno: 429 y no sube nada');
  }

  bloque('Seguimiento: el cliente ve su plazo o su reclamo');
  {
    const src = E.leer('functions/index.js');
    const T = src.slice(src.indexOf('function _texto(v) {'), src.indexOf('function setCORS(req, res) {')) +
      src.slice(src.indexOf('async function handleTrack'), src.indexOf('async function handleDoc(req, res) {'));
    const pedidos = {
      a: {id: 'id_1790000000001', status: 'FINALIZADO', createdAt: hace(3), trackToken: TOK('A')},
      b: {id: 'id_1790000000002', status: 'ENVIADO', createdAt: hace(3), trackToken: TOK('B')},
      c: {id: 'id_1790000000003', status: 'FINALIZADO', createdAt: hace(90), trackToken: TOK('C'), reclamo: {estado: 'APROBADO', tipo: 'falla', fecha: 'f', respuesta: 'Ven a tienda'}},
      d: {id: 'id_1790000000004', status: 'FINALIZADO', createdAt: hace(90), trackToken: TOK('D')},
    };
    const db = {doc: () => ({get: async () => ({exists: false})}),
      collection: () => ({where: (k, op, v) => ({limit: () => ({get: async () => {
        const d = Object.values(pedidos).filter((x) => x[k] === v);
        return {empty: !d.length, docs: d.map((x) => ({data: () => x}))};
      }})})})};
    // eslint-disable-next-line no-new-func
    const ht = new Function('db', '_anotar', 'enlace', 'checkRateLimit', 'pedidoPublico', 'SHIP_COL', 'CFG_DOC', 'docsPublicos', 'getStorage', 'vitrina', 'resenas', 'garantia',
        T + ';return handleTrack;')(db, (globalThis.__anotar || (async () => false)), L, async () => true, require('../functions/pedidoPublico.js'), 'panel/shipments/items', 'panel/config',
        require('../functions/docsPublicos.js'), () => ({bucket: () => ({name: 'b'})}), require('../functions/vitrina.js'), require('../functions/resenas.js'), G);
    const ver = async (t) => { const r = {json: (b) => { r.body = b; return r; }, status: () => r}; await ht({query: {token: t}}, r); return r.body; };
    ok((await ver(TOK('A'))).order.garantia.join() === 'cambio,devolucion,falla', 'recién entregado: puede pedir cambio, devolución o garantía');
    ok((await ver(TOK('B'))).order.garantia.length === 0, 'en camino: todavía nada');
    const c = await ver(TOK('C'));
    ok(c.order.reclamo.estado === 'APROBADO' && c.order.reclamo.respuesta === 'Ven a tienda' && c.order.garantia === undefined && c.order.minimo === true,
       'con reclamo: ve su estado y respuesta, aunque el pedido sea antiguo');
    ok((await ver(TOK('D'))).order.garantia.join() === 'falla', 'pedido de hace 90 días (datos ocultos): igual puede pedir garantía por falla');
  }

  bloque('Cliente: pestaña Garantía');
  {
    const seg = E.leerReal('cliente/seguimiento.js');
    const comun = E.leerReal('cliente/comun.js');
    const trozo = seg.slice(seg.indexOf('var _segRes = '), seg.indexOf('function _segNavHtml(){'));
    const caja = {innerHTML: ''};
    const msg = {textContent: ''};
    const envios = [];
    const ctx = vm.createContext({
      window: {_segTok: TOK('A'), Garantia: G},
      URL: {createObjectURL: () => 'blob:x', revokeObjectURL: () => {}},
      FileReader: function() { this.readAsDataURL = () => { this.result = 'data:image/jpeg;base64,' + JPG; this.onload(); }; },
      FORM_API: 'https://api.example/formApi',
      $: (id) => (id === 'segGarantia' ? caja : id === 'segGarMsg' ? msg : null),
      fetch: async (url, op) => { envios.push({url, op}); return {json: async () => ({status: 'ok'})}; },
      buscarPedido: () => {},
    });
    ctx.window.Garantia = G;
    ctx.Garantia = G;
    vm.runInContext((/function esc\(s\)\{.*\}/.exec(comun) || [''])[0] + '\n' + trozo +
      ';this.api={_garantiaHtml,garAbrir,garTipo,garCampo,enviarGarantia,get _segGar(){return _segGar;}};', ctx);
    const A = ctx.api;
    const pedido = {status: 'FINALIZADO', createdAt: hace(5), garantia: ['cambio', 'devolucion', 'falla']};
    ctx.window._segUltimoPedido = pedido;
    const h = A._garantiaHtml(pedido);
    ok(/Tu compra está protegida/.test(h) && /quedan 25 días/.test(h) && /Solicitar cambio o garantía/.test(h) && /Cambios y devoluciones: 30 días/.test(h),
       'muestra la protección con los días que quedan, el botón y las políticas');
    ok(!/offertassperu|@gmail|Canadá/.test(h) && /WhatsApp/.test(h), 'sin correo ni dirección: todo por WhatsApp');
    ok(/No enciende|Aún|plazo|recibas/.test(A._garantiaHtml({status: 'ENVIADO', garantia: []})) && !/Solicitar cambio/.test(A._garantiaHtml({status: 'ENVIADO', garantia: []})),
       'sin entregar: explica que podrá pedirlo al recibir, sin botón');
    A.garAbrir();
    ok(/segGarForm/.test(caja.innerHTML) && (caja.innerHTML.match(/class="seg-chip"/g) || []).length === 3, 'el formulario ofrece solo los tipos permitidos');
    await A.enviarGarantia({disabled: false, textContent: ''});
    ok(msg.textContent === 'Elige qué necesitas.' && envios.length === 0, 'sin completar: avisa qué falta y no envía');
    A.garTipo('falla'); A.garCampo('producto', 'Taladro 20V'); A.garCampo('texto', 'No enciende desde ayer');
    await A.enviarGarantia({disabled: false, textContent: ''});
    ok(msg.textContent === 'Agrega al menos una foto.' && envios.length === 0, 'sin foto: la pide');
    A._segGar.fotos.push({blob: {}, url: 'blob:x'});
    await A.enviarGarantia({disabled: false, textContent: ''});
    const cuerpo = JSON.parse(envios[0].op.body);
    ok(/action=claim$/.test(envios[0].url) && envios[0].op.method === 'POST' && cuerpo.tipo === 'falla' && cuerpo.fotos[0] === JPG &&
       Object.keys(cuerpo).sort().join() === 'fotos,producto,texto,tipo,token', 'envía por POST solo los datos de la solicitud y las fotos');
    ok(/Recibimos tu solicitud/.test(caja.innerHTML) && pedido.reclamo.estado === 'RECIBIDO', 'después de enviar: ve su solicitud recibida');
    const x = A._garantiaHtml({reclamo: {estado: 'RECHAZADO', tipo: 'falla', respuesta: '<img src=x onerror=alert(1)>'}});
    ok(!/<img src=x/.test(x) && /no procede/.test(x), 'la respuesta va escapada');
  }

  bloque('Panel: reclamo en la tarjeta y modal');
  {
    const lista = E.leerReal('panel/pantalla/lista.js');
    const ctx = vm.createContext({});
    vm.runInContext([/function escH\(s\)\{.*\}/, /function escJs\(s\)\{.*\}/, /function _reclamoCard\(s\)\{[\s\S]*?\n\}/].map((r) => (r.exec(lista) || [''])[0]).join('\n'), ctx);
    ok(ctx._reclamoCard({}) === '' && /card-reclamo-abierto/.test(ctx._reclamoCard({id: 'a', reclamo: {estado: 'RECIBIDO'}})) &&
       /card-reclamo-abierto/.test(ctx._reclamoCard({id: 'a', reclamo: {estado: 'EN REVISIÓN'}})) &&
       !/card-reclamo-abierto/.test(ctx._reclamoCard({id: 'a', reclamo: {estado: 'RESUELTO'}})), 'botón en la tarjeta, resaltado si está pendiente');
    ok(!/<img/.test(ctx._reclamoCard({id: 'a', reclamo: {estado: '<img src=x>'}})), 'estado escapado');
    const rec = E.leerReal('panel/pedidos/reclamos.js');
    ok(/escU\(u\)/.test(rec) && /escH\(r\.doc\.texto/.test(rec) && /escH\(r\.doc\.producto/.test(rec), 'el modal escapa texto y links de las fotos');
    ok(/f\.estado === 'RECHAZADO' && !f\.respuesta/.test(rec), 'para rechazar hay que explicar el motivo');
    const w = {Garantia: G};
    vm.runInNewContext(rec, {window: w, document: {}});
    const m = w.Reclamos.mensaje({doc: {cliente: 'ANA PEREZ', tipo: 'falla', producto: 'Taladro', codigo: 'B001-9'}}, {estado: 'APROBADO', respuesta: 'Trae tu boleta'});
    ok(m === 'Hola ANA, te escribimos de Total Tools por tu solicitud de falla de fabricación (Taladro, pedido #B001-9). ¡Tu solicitud fue aprobada! Trae tu boleta' &&
       /Caso resuelto\. $/.test(w.Reclamos.mensaje({doc: {tipo: 'cambio'}}, {estado: 'RESUELTO'}) + ' '), 'mensaje de WhatsApp listo para el cliente');
    ok(/_fbLeerReclamo/.test(E.leerReal('panel/datos/nube.js')) && /functions\/garantia\.js/.test(E.leerReal('index.html')) &&
       /functions\/garantia\.js/.test(E.leerReal('seguimiento.html')), 'panel y seguimiento usan la misma pieza de garantía');
  }
};
