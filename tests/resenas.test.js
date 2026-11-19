'use strict';
const vm = require('vm');
const E = require('./_entorno.js');
const R = require('../functions/resenas.js');
const L = require('../functions/enlaceSeguimiento.js');

const DIA = 86400000;
const AHORA = Date.now();
const hace = (d) => new Date(AHORA - d * DIA).toISOString();
const TOK = (c) => 't1_' + c.repeat(22);

function servidor(pedidos, opciones) {
  const o = opciones || {};
  const src = E.leer('functions/index.js');
  const T = src.slice(src.indexOf('function _texto(v) {'), src.indexOf('function setCORS(req, res) {')) +
    src.slice(src.indexOf('const VITRINA_DOC'), src.indexOf('async function handleDoc(req, res) {')) +
    src.slice(src.indexOf('async function handleReview(req, res) {'), src.indexOf('const OLVA_STORES_URL ='));
  const escrituras = [];
  const refDe = (id) => ({id});
  const db = {
    doc: (p) => ({get: async () => {
      if (p === 'panel/vitrina') return {exists: !!o.vitrina, data: () => o.vitrina};
      const id = p.split('/').pop();
      return pedidos[id] ? {exists: true, data: () => pedidos[id], ref: refDe(id)} : {exists: false};
    }}),
    collection: () => ({where: (k, op, v) => ({limit: () => ({get: async () => {
      const d = Object.keys(pedidos).filter((id) => pedidos[id][k] === v);
      return {empty: !d.length, docs: d.map((id) => ({data: () => pedidos[id], ref: refDe(id)}))};
    }})})}),
    runTransaction: async (fn) => fn({
      get: async (ref) => ({exists: !!pedidos[ref.id], data: () => pedidos[ref.id]}),
      update: (ref, campos) => {
        escrituras.push({id: ref.id, campos});
        pedidos[ref.id] = Object.assign({}, pedidos[ref.id], campos);
      },
    }),
  };
  // eslint-disable-next-line no-new-func
  const fn = new Function('db', 'enlace', 'checkRateLimit', 'SHIP_COL', 'getStorage', 'vitrina', 'resenas', 'garantia', '_conMts',
      T + ';return handleReview;')(
      db, L, async () => o.freno !== true, 'panel/shipments/items', () => ({bucket: () => ({name: 'b'})}),
      require('../functions/vitrina.js'), R, require('../functions/garantia.js'), (c) => Object.assign({}, c, {_mts: 'HORA_SERVIDOR'}));
  const enviar = async (body, metodo) => {
    const r = {code: 200, body: null, cab: {}};
    r.status = (c) => { r.code = c; return r; };
    r.json = (b) => { r.body = b; return r; };
    r.set = (k, v) => { r.cab[k] = v; };
    await fn({method: metodo || 'POST', body}, r);
    return r;
  };
  return {enviar, escrituras, pedidos};
}

module.exports = async ({bloque, ok}) => {
  bloque('Reseñas: solo pedidos entregados y recientes');
  {
    ok(R.abierta({status: 'FINALIZADO', createdAt: hace(1)}, AHORA) && R.abierta({status: ' entregado ', date: hace(59).slice(0, 10)}, AHORA),
       'finalizado o entregado en los últimos 60 días: se puede calificar');
    ok(!R.abierta({status: 'ENVIADO', createdAt: hace(1)}, AHORA) && !R.abierta({status: 'CANCELADO', createdAt: hace(1)}, AHORA) &&
       !R.abierta({status: 'PENDIENTE DE PAGO', createdAt: hace(1)}, AHORA), '⚠️ en camino, cancelado o por pagar: todavía no');
    ok(!R.abierta({status: 'FINALIZADO', createdAt: hace(61)}, AHORA) && !R.abierta({status: 'FINALIZADO'}, AHORA) && !R.abierta(null, AHORA),
       'más de 60 días o sin fecha: ya no');
  }

  bloque('Reseñas: el servidor limpia lo que llega');
  {
    ok([0, 6, 3.5, -1, NaN, 'x', null, undefined].every((n) => R.limpiar({estrellas: n}) === null) && R.limpiar(null) === null,
       'estrellas fuera de 1 a 5 o no enteras: se rechaza');
    const r = R.limpiar({estrellas: 5, texto: '  <img src=x onerror=alert(1)>\n\nMuy   bueno\u0007 ', otro: 'x'});
    ok(r.estrellas === 5 && r.texto === 'img src=x onerror=alert(1) Muy bueno' && Object.keys(r).join() === 'estrellas,texto',
       'sin < >, sin saltos ni caracteres de control, y solo estrellas y texto');
    ok(R.limpiar({estrellas: 4, texto: 'a'.repeat(900)}).texto.length === R.MAX_TEXTO, 'texto con tope de 500');
    ok(R.publica({estrellas: 9}) === null && R.publica('x') === null && R.publica({estrellas: 3, texto: '<b>'}).texto === 'b', 'lo guardado se vuelve a limpiar al mostrarlo');
  }

  bloque('Link de Google: solo de Google, si no la ficha de Maps');
  {
    ok(R.linkGoogle({link: 'https://g.page/r/CabC123/review'}) === 'https://g.page/r/CabC123/review' &&
       R.linkGoogle({link: 'https://maps.app.goo.gl/abc'}) === 'https://maps.app.goo.gl/abc' &&
       R.linkGoogle({link: 'https://search.google.com/local/writereview?placeid=ChIJ1'}).startsWith('https://search.google.com/'),
       'g.page, maps.app.goo.gl y search.google.com: sí');
    const malos = ['https://evil.example/r', 'http://g.page/r/x', 'https://g.page.evil.example/x', 'https://user:pw@g.page/x',
      'javascript:alert(1)', '', 'https://g.page/' + 'a'.repeat(600)];
    ok(malos.every((u) => R.linkGoogle({link: u}) === R.GOOGLE_DEFECTO) && R.linkGoogle(null) === R.GOOGLE_DEFECTO,
       '⚠️ otro dominio, http, subdominio falso, con usuario, javascript o muy largo: se usa la ficha de Maps');
    ok(/^https:\/\/www\.google\.com\/maps\/search\//.test(R.GOOGLE_DEFECTO) && /Puente%20Piedra/.test(R.GOOGLE_DEFECTO), 'la ficha por defecto es la de la tienda en Maps');
  }

  bloque('Reseñas en el servidor real (handleReview)');
  {
    const ped = () => ({
      a: {id: 'id_1790000000001', status: 'FINALIZADO', createdAt: hace(2), trackToken: TOK('A')},
      b: {id: 'id_1790000000002', status: 'ENVIADO', createdAt: hace(2), trackToken: TOK('B')},
      id_1754000000003: {id: 'id_1754000000003', status: 'FINALIZADO', createdAt: hace(2)},
      d: {id: 'id_1790000000004', status: 'ENTREGADO', createdAt: hace(90), trackToken: TOK('D')},
    });
    const s = servidor(ped(), {vitrina: {resenas: {link: 'https://g.page/r/Total/review'}}});
    ok((await s.enviar({token: TOK('A'), estrellas: 5}, 'GET')).code === 405, 'solo POST');
    ok((await s.enviar({token: 'a/../b', estrellas: 5})).code === 400 && (await s.enviar({token: TOK('A'), estrellas: 7})).code === 400,
       'token o estrellas no válidos: 400');
    ok((await s.enviar({token: TOK('Z'), estrellas: 5})).code === 404, 'token que no existe: 404');
    ok((await s.enviar({token: TOK('B'), estrellas: 5})).body.status === 'cerrada', '⚠️ pedido en camino: no se puede calificar');
    ok((await s.enviar({token: TOK('D'), estrellas: 5})).body.status === 'cerrada', 'entregado hace 90 días: ya no');
    ok((await s.enviar({token: 'id_1754000000003', estrellas: 1})).code === 404, 'link antiguo (sin token) de un pedido finalizado: no responde');
    ok(s.escrituras.length === 0, 'nada de eso escribió en la base de datos');

    const r = await s.enviar({token: TOK('A'), estrellas: 4, texto: 'Llegó rápido <b>', status: 'CANCELADO', name: 'X'});
    ok(r.body.status === 'ok' && r.body.google === 'https://g.page/r/Total/review' && r.cab['Cache-Control'] === 'private, no-store',
       'pedido finalizado: se guarda y devuelve el link de Google del panel');
    const w = s.escrituras[0];
    ok(s.escrituras.length === 1 && Object.keys(w.campos).sort().join() === '_mts,resena' && w.campos.resena.estrellas === 4 &&
       w.campos.resena.texto === 'Llegó rápido b' && /^\d{4}-\d\d-\d\dT/.test(w.campos.resena.fecha) && w.campos._mts === 'HORA_SERVIDOR',
       '⚠️ escribe SOLO la reseña (y la hora para que el panel la sincronice): no puede tocar estado ni nombre');
    ok(s.pedidos.a.status === 'FINALIZADO', 'el estado del pedido sigue igual');

    const r2 = await s.enviar({token: TOK('A'), estrellas: 1, texto: 'cambio'});
    ok(r2.body.status === 'ya' && s.escrituras.length === 1 && s.pedidos.a.resena.estrellas === 4,
       '⚠️ una sola reseña por pedido: un segundo envío no la reemplaza');

    const f = servidor(ped(), {freno: true});
    ok((await f.enviar({token: TOK('A'), estrellas: 5})).code === 429 && f.escrituras.length === 0, 'con el freno activo: 429 y no escribe');
    const sinLink = servidor(ped());
    ok((await sinLink.enviar({token: TOK('A'), estrellas: 5})).body.google === R.GOOGLE_DEFECTO, 'sin link en el panel: la ficha de Maps');
  }

  bloque('Seguimiento: invita a calificar y muestra la reseña hecha');
  {
    const src = E.leer('functions/index.js');
    const T = src.slice(src.indexOf('function _texto(v) {'), src.indexOf('function setCORS(req, res) {')) +
      src.slice(src.indexOf('async function handleTrack'), src.indexOf('async function handleDoc(req, res) {'));
    const pedidos = {
      a: {id: 'id_1790000000001', status: 'FINALIZADO', createdAt: hace(1), trackToken: TOK('A')},
      b: {id: 'id_1790000000002', status: 'ENVIADO', createdAt: hace(1), trackToken: TOK('B')},
      c: {id: 'id_1790000000003', status: 'ENTREGADO', createdAt: hace(1), trackToken: TOK('C'), resena: {estrellas: 2, texto: 'Demoró', fecha: 'x'}},
    };
    const db = {doc: () => ({get: async () => ({exists: false})}),
      collection: () => ({where: (k, op, v) => ({limit: () => ({get: async () => {
        const d = Object.values(pedidos).filter((x) => x[k] === v);
        return {empty: !d.length, docs: d.map((x) => ({data: () => x}))};
      }})})})};
    // eslint-disable-next-line no-new-func
    const ht = new Function('db', 'enlace', 'checkRateLimit', 'pedidoPublico', 'SHIP_COL', 'CFG_DOC', 'docsPublicos', 'getStorage', 'vitrina', 'resenas', 'garantia',
        T + ';return handleTrack;')(db, L, async () => true, require('../functions/pedidoPublico.js'), 'panel/shipments/items', 'panel/config',
        require('../functions/docsPublicos.js'), () => ({bucket: () => ({name: 'b'})}), require('../functions/vitrina.js'), R, require('../functions/garantia.js'));
    const ver = async (t) => { const r = {json: (b) => { r.body = b; return r; }, status: () => r}; await ht({query: {token: t}}, r); return r.body; };
    const a = await ver(TOK('A'));
    ok(a.order.resenaAbierta === true && a.order.resena === undefined && a.google === undefined, 'finalizado sin reseña: invita a calificar');
    const b = await ver(TOK('B'));
    ok(b.order.resenaAbierta === undefined, 'en camino: no invita');
    const c = await ver(TOK('C'));
    ok(c.order.resena.estrellas === 2 && c.order.resena.fecha === undefined && c.order.resenaAbierta === undefined && c.google === R.GOOGLE_DEFECTO,
       'ya calificado: muestra su reseña (sin datos internos) y el link de Google');
  }

  bloque('Cliente: tarjeta de calificación');
  {
    const seg = E.leerReal('cliente/seguimiento.js');
    const comun = E.leerReal('cliente/comun.js');
    const trozo = seg.slice(seg.indexOf('var _segRes = '), seg.indexOf('function _segNavHtml(){'));
    const caja = {innerHTML: ''};
    const msg = {textContent: ''};
    const pedidosFetch = [];
    const ctx = vm.createContext({
      window: {_segTok: TOK('A'), _segGoogle: 'https://g.page/r/Total/review', _segTel: '933724178', _segCodigo: 'B001-9'},
      navigator: {clipboard: {writeText: async () => {}}},
      FORM_API: 'https://api.example/formApi',
      $: (id) => (id === 'segResena' ? caja : id === 'segResMsg' ? msg : null),
      fetch: async (url, op) => { pedidosFetch.push({url, op}); return {json: async () => ({status: 'ok', google: 'https://g.page/r/Total/review'})}; },
    });
    vm.runInContext((/function esc\(s\)\{.*\}/.exec(comun) || [''])[0] + '\n' + trozo +
      ';this.api={_resenaHtml,_resenaCuerpo,_resenaGracias,_resenaTexto,resenaEstrella,resenaChip,resenaTexto,enviarResena,_segRes};', ctx);
    const A = ctx.api;
    ok(A._resenaHtml({status: 'ENVIADO'}) === '', 'sin invitación del servidor: no aparece');
    const h0 = A._resenaHtml({resenaAbierta: true});
    ok((h0.match(/class="seg-estrella[ "]/g) || []).length === 5 && !/textarea/.test(h0) && /role="radiogroup"/.test(h0),
       'primero solo 5 estrellas grandes (un toque, sin formularios)');
    A.resenaEstrella(5);
    ok(/Llegó rápido/.test(caja.innerHTML) && /textarea/.test(caja.innerHTML) && (caja.innerHTML.match(/seg-estrella on/g) || []).length === 5,
       'con 5 estrellas: frases rápidas positivas y comentario opcional');
    A.resenaChip(0); A.resenaChip(1);
    A.resenaEstrella(2);
    ok(A._segRes.chips.length === 0 && /Llegó dañado/.test(caja.innerHTML), 'al bajar a 2 estrellas: cambian las frases y se limpian las elegidas');
    A.resenaChip(0); A.resenaTexto('La caja llegó abierta');
    ok(A._resenaTexto() === 'Demoró — La caja llegó abierta', 'el texto junta frases y comentario');
    await A.enviarResena({disabled: false, textContent: ''});
    const env = pedidosFetch[0];
    const cuerpo = JSON.parse(env.op.body);
    ok(/action=review$/.test(env.url) && env.op.method === 'POST' && cuerpo.token === TOK('A') && cuerpo.estrellas === 2 &&
       cuerpo.texto === 'Demoró — La caja llegó abierta' && Object.keys(cuerpo).length === 3, 'envía por POST solo token, estrellas y texto');
    ok(/wa\.me\/51933724178/.test(caja.innerHTML) && /También puedes opinar en Google/.test(caja.innerHTML),
       'con nota baja: primero WhatsApp para solucionarlo, y Google sigue disponible (Google prohíbe ocultarlo a quien califica bajo)');
    const g5 = A._resenaGracias({estrellas: 5, texto: 'Excelente'});
    ok(/Publicarla en Google/.test(g5) && /href="https:\/\/g\.page\/r\/Total\/review"/.test(g5) && /rel="noopener noreferrer"/.test(g5),
       'con nota alta: botón principal a Google');
    ctx.window._segCodigo = '"><img src=x onerror=alert(1)>';
    const g1 = A._resenaGracias({estrellas: 1, texto: '<script>alert(1)</script>'});
    ok(!/<script>|<img src=x/.test(g1), 'texto y código con HTML no se ejecutan');
  }

  bloque('Panel: la reseña se ve en la tarjeta del pedido y el link se configura');
  {
    const lista = E.leerReal('panel/pantalla/lista.js');
    const ctx = vm.createContext({});
    vm.runInContext([/function escH\(s\)\{.*\}/, /function _resenaCard\(s\)\{[\s\S]*?\n\}/].map((r) => (r.exec(lista) || [''])[0]).join('\n'), ctx);
    ok(/★★★★★/.test(ctx._resenaCard({resena: {estrellas: 5, texto: 'Todo bien'}})) && ctx._resenaCard({}) === '' && ctx._resenaCard({resena: {estrellas: 9}}) === '',
       'muestra las estrellas, y nada si no hay reseña válida');
    ok([1, 2, 3].every((n) => /card-resena-mala/.test(ctx._resenaCard({resena: {estrellas: n}}))) && !/card-resena-mala/.test(ctx._resenaCard({resena: {estrellas: 4}})), 'las de 1 a 3 estrellas resaltan en rojo para atenderlas');
    ok(!/<img/.test(ctx._resenaCard({resena: {estrellas: 3, texto: '<img src=x onerror=alert(1)>'}})), 'el comentario del cliente va escapado');
    ok(/\$\{_resenaCard\(s\)\}/.test(lista), 'la tarjeta la usa');
    const vit = E.leerReal('panel/config/vitrina.js');
    ok(/resenas: \{link: rl\}/.test(vit) && /_linkGoogleOk\(rl\)/.test(vit), 'el panel guarda el link de reseñas y valida que sea de Google');
    const cfgHosts = (/var HOSTS_GOOGLE = (\[[^\]]+\])/.exec(vit) || [])[1];
    ok(cfgHosts && JSON.stringify(vm.runInNewContext(cfgHosts)) === JSON.stringify(R.HOSTS_GOOGLE), 'panel y servidor aceptan los mismos dominios de Google');
  }
};
