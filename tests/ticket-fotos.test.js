/**
 * tests/ticket-fotos.test.js — Fase 1 de documentos (28/10/2026)
 * ==============================================================
 *   · «🧾 Jalar ticket de Shalom» conectado: el SERVIDOR descarga, valida,
 *     guarda en el bucket y apunta en el pedido. La clave nunca sale.
 *   · ⚠️ Ninguna foto se pierde: lo que no sube queda en una cola
 *     (IndexedDB) y se reintenta; jamás se sube «[img]» en su lugar.
 *   · Fotos comprimidas + miniatura; tarjetas con carga diferida.
 *   · Diagnóstico «Documentos perdidos».
 */
'use strict';
const E = require('./_entorno.js');
const P = require('../functions/shalomPuerta.js');
const T = require('../functions/ticketShalom.js');

const PNG = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3]);
const PDF = Buffer.from('%PDF-1.4 hola');

function respuesta(status, bytes, cabeceras) {
  return {ok: status >= 200 && status < 300, status,
    headers: {get: (k) => (cabeceras || {})[k.toLowerCase()] || null},
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
    text: async () => bytes.toString()};
}

/* fotos.js sin navegador: su núcleo puro, con dependencias de mentira. */
function fotos(extra) {
  const win = {};
  E.cargar('fotos.js', win);
  const almacen = {};
  const cola = {
    poner: async (it) => { almacen[it.clave] = it; },
    todos: async () => Object.keys(almacen).map((k) => almacen[k]),
    quitar: async (k) => { delete almacen[k]; },
  };
  const S = {shipments: []};
  const llam = {subidas: [], patches: [], repintes: 0};
  let fallaSubir = false;
  const M = win.FotosModuleCrear(Object.assign({
    cola,
    urlLocal: () => 'blob:local',
    redimensionar: async (f, lado) => ({archivo: {name: 'r.jpg', type: 'image/jpeg',
      size: lado < 400 ? 20000 : 300000, lado}, achico: true}),
    subir: async (f, id, slot) => {
      if (fallaSubir) throw new Error('sin red');
      llam.subidas.push({f, id, slot});
      return {d: 'https://firebasestorage.googleapis.com/' + id + '/' + slot, t: f.type, n: f.name,
        storage: true, path: 'shipments/' + id + '/' + slot};
    },
    patch: async (id, campos) => { llam.patches.push({id, campos}); },
    pedido: (id) => S.shipments.find((x) => x.id === id) || null,
    repintar: () => { llam.repintes++; },
  }, extra || {}));
  return {M, S, llam, almacen, falla: (v) => { fallaSubir = v; },
    perdidos: win.FotosDocumentosPerdidos};
}

module.exports = async ({bloque, ok}) => {

  bloque('El ticket: lo que llega de Shalom se comprueba antes de guardarlo');

  {
    ok(P.tipoPorFirma(PNG) === 'image/png' && P.tipoPorFirma(PDF) === 'application/pdf',
       'PNG y PDF se reconocen por sus BYTES');
    ok(P.tipoPorFirma(Buffer.from('<html>error</html>')) === '',
       'una página HTML de error no pasa por ticket');

    const real = global.fetch;
    let pedidas = [];
    const con = (r) => { global.fetch = async (url, op) => { pedidas.push({url, op}); return r; }; };
    try {
      con(respuesta(200, PNG, {'content-type': 'image/png'}));
      let r = await P.descargarVoucher('CLAVE-SECRETA', {orderNumber: '101035310', orderCode: 'pmc7'});
      ok(r.ok && r.tipo === 'image/png' && r.bytes.length === PNG.length, 'guía de 9 dígitos: descarga el PNG');
      ok(/\/track\/voucher\?orderNumber=101035310&orderCode=PMC7&format=image$/.test(pedidas[0].url),
         'pide /track/voucher con guía y código');
      ok(pedidas[0].op.headers['x-api-key'] === 'CLAVE-SECRETA' && pedidas[0].url.indexOf('CLAVE') < 0,
         'la clave va en la cabecera, nunca en la URL');

      con(respuesta(200, Buffer.from('<html>oops</html>'), {'content-type': 'image/png'}));
      r = await P.descargarVoucher('K', {orderNumber: '82037653', orderCode: 'AB12'});
      ok(!r.ok && r.motivo === 'FORMATO_DESCONOCIDO',
         '⚠️ un 200 que no es imagen ni PDF NO se acepta (aunque diga image/png)');

      con(respuesta(200, PNG, {'content-length': String(10 * 1024 * 1024)}));
      r = await P.descargarVoucher('K', {orderNumber: '82037653', orderCode: 'AB12'});
      ok(!r.ok && /enorme/.test(r.detalle), 'un archivo enorme se rechaza');

      con(respuesta(404, Buffer.from('{"message":"no existe"}')));
      r = await P.descargarVoucher('K', {orderNumber: '82037653', orderCode: 'AB12'});
      ok(!r.ok && r.http === 404, 'un 404 de Shalom se dice, no se calla');

      pedidas = [];
      r = await P.descargarVoucher('K', {orderNumber: '93972666', orderCode: "x'; DROP"});
      ok(!r.ok && r.motivo === 'SIN_DATO' && pedidas.length === 0,
         'guía o código con forma rara: no sale ninguna petición');
      r = await P.descargarVoucher('K', {orderNumber: '939726661', orderCode: 'AB12'});
      ok(!r.ok && pedidas.length === 0, 'el error de tipeo de 9 dígitos tampoco');
      r = await P.descargarVoucher('', {orderNumber: '82037653', orderCode: 'AB12'});
      ok(!r.ok && r.motivo === 'BLOQUEADO', 'sin clave no se llama');
    } finally {
      global.fetch = real;
    }
  }

  bloque('El ticket: el servidor guarda en el bucket y en el pedido');

  {
    const hacer = (pedido, desc) => {
      const v = {subido: null, guardado: null};
      return T.jalar({pedidoId: 'id_1', orderNumber: '101035310', orderCode: 'PMC7'}, {
        leerPedido: async (id) => (id === 'id_1' ? pedido : null),
        descargar: async () => desc,
        subir: async (ruta, bytes, tipo) => { v.subido = {ruta, bytes, tipo}; return 'https://firebasestorage.googleapis.com/x?alt=media&token=t'; },
        guardar: async (c) => { v.guardado = c; },
      }).then((r) => Object.assign(v, {r}));
    };
    let v = await hacer({courier: 'SHALOM'}, {ok: true, bytes: PNG, tipo: 'image/png'});
    ok(v.r.ok && v.subido.ruta === 'shipments/id_1/guia.png' && v.subido.tipo === 'image/png',
       'se guarda en la carpeta del pedido, como «Guía / Ticket»');
    ok(v.guardado && v.guardado.docGuia && v.guardado.docGuia.d === v.r.doc.d &&
       v.guardado.docGuia.t === 'image/png' && v.guardado.docGuia.origen === 'shalom',
       'y se apunta en el pedido (docGuia)');
    ok(JSON.stringify(v.r).indexOf('CLAVE') < 0 && !('bytes' in v.r),
       'al navegador vuelve solo el enlace: ni bytes ni clave');
    v = await hacer({courier: 'SHALOM'}, {ok: true, bytes: PDF, tipo: 'application/pdf'});
    ok(v.subido.ruta === 'shipments/id_1/guia.pdf', 'si es PDF, se guarda como PDF');
    v = await hacer(null, {ok: true, bytes: PNG, tipo: 'image/png'});
    ok(!v.r.ok && v.r.motivo === 'NO_ENCONTRADO' && !v.subido, 'pedido que no existe: nada se sube');
    v = await hacer({courier: 'DELIVERY'}, {ok: true, bytes: PNG, tipo: 'image/png'});
    ok(!v.r.ok && !v.subido, 'solo pedidos de Shalom');
    v = await hacer({courier: 'SHALOM'}, {ok: false, motivo: 'NO_ENCONTRADO'});
    ok(!v.r.ok && v.r.motivo === 'NO_ENCONTRADO' && !v.guardado, 'si Shalom falla, no se toca el pedido');
    const malo = await T.jalar({pedidoId: '../x'}, {leerPedido: async () => ({})});
    ok(!malo.ok && malo.motivo === 'SIN_DATO', 'un id de pedido raro se corta');

    ok(P.ORQUESTADAS.jalarTicket === true, 'es una orquestación del servidor');
    const paso = await P.barreras({metodo: 'POST', authorization: 'Bearer x',
      cuerpo: {op: 'jalarTicket', datos: {pedidoId: 'id_1'}}},
    {verificar: async () => ({email: 'jarryllanoski@gmail.com', email_verified: true}),
      admins: ['jarryllanoski@gmail.com']});
    ok(paso.orquestar === 'jalarTicket', 'pasa por sesión y administrador, como las demás');
    const idx = E.leer('functions/index.js');
    ok(/paso\.orquestar === "jalarTicket"/.test(idx) && /descargar: _voucherPorLaPuerta/.test(idx),
       'el servidor la atiende');
    ok(/interruptor\.decidir\(estado, Date\.now\(\), false\)/.test(
        idx.slice(idx.indexOf('async function _voucherPorLaPuerta'))),
       'y respeta el interruptor de la puerta (apagada = no se llama)');
    ok(/firebaseStorageDownloadTokens/.test(idx), 'enlace con token, como los que sube el panel');
  }

  bloque('El botón: lo que hace el panel');

  {
    const sh = E.leer('shalom.js');
    ok(/op: 'jalarTicket', datos: \{pedidoId: id,/.test(sh), 'pide la orquestación con el id del pedido');
    const tk = E.leer('ticket.js');
    ok(/Guarda el pedido primero/.test(tk), 'pedido sin guardar: lo dice');
    ok(/confirm\('Este pedido ya tiene una Guía \/ Ticket/.test(tk), 'reemplazar uno existente: pregunta');
    ok(/_docs\.guia = rt\.doc/.test(tk) && /s\.docGuia = rt\.doc/.test(tk),
       'pinta el ticket en el formulario y en el pedido en memoria');
    ok(!/x-api-key/.test(tk), 'y nunca una clave en el navegador');
  }

  bloque('⚠️ Ninguna foto se pierde: la cola');

  {
    const {M, S, llam, almacen, falla} = fotos();
    const file = {name: 'guia.jpg', type: 'image/jpeg', size: 4e6};
    S.shipments.push({id: 'id_9', docGuia: M.marcaPendiente(file), docTicket: {d: 'https://firebasestorage/x', t: 'image/png'}});
    falla(true);
    let n = await M.trasGuardar('id_9');
    await new Promise((r) => setTimeout(r, 0));
    ok(n === 1 && Object.keys(almacen).length === 1,
       'sin red: la foto pendiente ENTRA a la cola (sobrevive a cerrar la pestaña)');
    ok(llam.patches.length === 0, 'y no se escribe nada en la nube todavía');
    falla(false);
    n = await M.procesar();
    ok(n === 1 && Object.keys(almacen).length === 0, 'al volver la red: sube y sale de la cola');
    ok(llam.patches.length === 1 && Object.keys(llam.patches[0].campos).join() === 'docGuia',
       'se escribe SOLO ese campo del pedido');
    ok(llam.patches[0].campos.docGuia.d.indexOf('https://firebasestorage') === 0 &&
       llam.patches[0].campos.docGuia.m, 'con su enlace y su miniatura');
    ok(S.shipments[0].docGuia.storage && !S.shipments[0].docGuia.pendiente,
       'y en memoria la marca pasa a ser el documento real');
    ok(llam.repintes >= 1, 'se repinta');

    // Pedido borrado mientras esperaba: no se resucita con un campo suelto.
    S.shipments.push({id: 'id_10', docEmbalado: M.marcaPendiente(file)});
    falla(true); await M.trasGuardar('id_10');
    await new Promise((r) => setTimeout(r, 0));   // el intento de fondo termina (falla)
    falla(false);
    S.shipments.pop();
    const antes = llam.patches.length;
    await M.procesar();
    await new Promise((r) => setTimeout(r, 0));
    ok(llam.patches.length === antes && Object.keys(almacen).length === 0,
       'pedido borrado: la foto sale de la cola sin crear un pedido fantasma');
  }

  {
    const {M, S, llam} = fotos();
    S.shipments.push({id: 'id_d'});
    await M.encolarUrl('id_d', '_dlvFoto', 'delivery-foto', {name: 'f.jpg', type: 'image/jpeg', size: 1e6});
    await new Promise((r) => setTimeout(r, 0));
    ok(llam.patches.length === 1 && typeof llam.patches[0].campos._dlvFoto === 'string',
       'la foto de entrega del delivery también va por la cola (campo con solo el enlace)');
  }

  bloque('Fotos comprimidas, miniatura, y lo que no se toca');

  {
    const {M, llam} = fotos();
    const grande = {name: 'cam.jpg', type: 'image/jpeg', size: 5e6};
    const doc = await M.subirDoc(grande, 'id_1', 'guia');
    ok(llam.subidas[0].f.size === 300000 && llam.subidas[0].f.lado === 1600,
       'una foto de 5 MB sube comprimida (máx. 1600 px)');
    ok(llam.subidas[1].slot === 'guia_mini' && llam.subidas[1].f.lado === 320 && doc.m,
       'y con su miniatura de 320 px para las tarjetas');
    ok(doc.n === 'cam.jpg', 'conserva el nombre original');
    const pdf = {name: 'g.pdf', type: 'application/pdf', size: 2e6};
    llam.subidas.length = 0;
    await M.subirDoc(pdf, 'id_1', 'guia');
    ok(llam.subidas.length === 1 && llam.subidas[0].f === pdf, 'un PDF sube tal cual, sin miniatura');
    const heic = {name: 'i.heic', type: 'image/heic', size: 2e6};
    ok(await M.comprimir(heic) === heic, 'HEIC (que el navegador no sabe leer) tal cual');
    const chica = {name: 's.png', type: 'image/png', size: 100000};
    const {M: M2} = fotos({redimensionar: async () => ({archivo: {size: 90000}, achico: false})});
    ok(await M2.comprimir(chica) === chica, 'una imagen ya liviana y chica no se recomprime');
    const {M: M3, llam: l3} = fotos({redimensionar: async (f, lado) => {
      if (lado < 400) throw new Error('x'); return {archivo: {size: 1, lado}, achico: true};
    }});
    const d3 = await M3.subirDoc(grande, 'id_1', 'guia');
    ok(l3.subidas.length === 1 && !d3.m, 'si la miniatura falla, el documento sube igual');
  }

  bloque('La nube nunca recibe «[img]» por una foto pendiente');

  {
    const src = E.trozo('index.html', '  function _slimDoc(doc){', '  function slimSupplier(sup){');
    // eslint-disable-next-line no-new-func
    const slim = new Function(src + ';return slimShipment;')();
    const s = slim({id: 'a', docGuia: {pendiente: true, _archivo: {}, d: 'blob:x'},
      docTicket: {d: 'https://firebasestorage/ok', t: 'image/png'}, docEmbalado: null});
    ok(!('docGuia' in s), '⚠️ el campo de una foto pendiente se OMITE (no «[img]»)');
    ok(s.docTicket.d === 'https://firebasestorage/ok', 'lo que ya está en Storage viaja igual');
    const cfg = E.leer('config.js');
    const pd = cfg.slice(cfg.indexOf('function _procesarDoc('), cfg.indexOf('function _procesarDocBase64('));
    ok(/F\.marcaPendiente\(file\)/.test(pd) && pd.indexOf('_procesarDocBase64') > pd.indexOf('if(shipId && window.StorageModule'),
       'el formulario deja la foto pendiente, no en base64');
    ok((cfg.match(/FotosModule\.trasGuardar\(/g) || []).length === 2,
       'al guardar (nuevo y editado) lo pendiente entra a la cola');
    ok(/FotosModule\.trasGuardar\(data\.id\)/.test(cfg),
       'el pedido nuevo usa SU id para las fotos (no uno anticipado distinto)');
    const st = E.leer('storage.js');
    ok(!/var ok1 = patchLoadDoc\(\)/.test(st) && !/var ok2 = patchSaveShipment\(\)/.test(st),
       'storage.js ya no tiene su segundo camino de subida con base64');
    ok(/_fbPatchShipment = async \(id, campos\)/.test(E.leer('index.html')),
       'la nube expone escribir solo unos campos');
  }

  bloque('Tarjetas: miniatura liviana y carga diferida');

  {
    const src = E.trozo('index.html', 'function _docMini(doc, icono){', 'function cardDocs(');
    const escU = (u) => /^https?:\/\//.test(u) ? u : '#';
    // eslint-disable-next-line no-new-func
    const mini = new Function('escU', src + ';return _docMini;')(escU);
    const conM = mini({t: 'image/jpeg', d: 'https://f/grande', m: 'https://f/mini'}, '📄');
    ok(/src="https:\/\/f\/mini"/.test(conM) && /loading="lazy"/.test(conM),
       'usa la miniatura y la carga diferida');
    ok(/src="https:\/\/f\/grande"/.test(mini({t: 'image/jpeg', d: 'https://f/grande'}, '📄')),
       'una foto de antes (sin miniatura) sigue saliendo');
    ok(/⏳/.test(mini({pendiente: true}, '📄')), 'pendiente: ⏳');
    ok(/⚠️/.test(mini({t: 'image/jpeg', d: '[img]'}, '📄')), 'perdida: ⚠️ (en vez de una imagen rota)');
    ok(/📦/.test(mini({t: 'application/pdf', d: 'https://f/a.pdf'}, '📦')), 'PDF: su icono');
  }

  bloque('Diagnóstico «Documentos perdidos»');

  {
    const {perdidos} = fotos();
    const l = perdidos([
      {id: 'a', name: 'ANA', docGuia: {d: '[img]'}},
      {id: 'b', name: 'LUIS', docTicket: {d: 'data:image/png;base64,xx'}},
      {id: 'c', name: 'EVA', docGuia: {d: 'https://firebasestorage/ok'}},
      {id: 'd', docEmbalado: {pendiente: true, d: 'blob:x'}},
    ]);
    ok(l.length === 2, 'encuentra los dos casos y nada más');
    ok(l[0].id === 'a' && l[0].faltan[0].tipo === 'perdido', '«[img]» = perdido (hay que volver a subirlo)');
    ok(l[1].faltan[0].tipo === 'local', 'base64 = solo en este navegador (se puede salvar guardando)');
    ok(/id="docsPerdidosList"/.test(E.leer('index.html')) &&
       /FotosModule\.pintarPerdidos\(\)/.test(E.leer('index.html')), 'está en 📦 (Importar / Exportar)');
  }
};
