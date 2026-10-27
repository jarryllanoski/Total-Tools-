/**
 * tests/nro-comprobante.test.js — el N° de factura/boleta de un pedido
 * =====================================================================
 * Desde el 26/10/2026 el dueño puede poner el número de factura o boleta al
 * generar un link personalizado o en «Editar pedido». Cuando existe, ES el
 * código del pedido: etiqueta, QR, escáner, campana, buscador.
 *
 * Lo que se cuida aquí, en orden de gravedad:
 *   · que el número lo ponga el SERVIDOR desde el token, nunca el cliente;
 *   · que los pedidos sin número (todos los de antes) sigan EXACTAMENTE igual;
 *   · que una etiqueta impresa antes de poner la factura se siga escaneando;
 *   · que el QR pequeño lleve a UN pedido, sin adivinar;
 *   · que no salga en el seguimiento público.
 *
 * Se EJECUTA el código desplegado (trozos reales de cada archivo), no copias.
 */
'use strict';
const N = require('../functions/nroComprobante.js');
const DP = require('../functions/dniPedido.js');
const E = require('./_entorno.js');

/* La etiqueta: el trozo real de print.js, del código al pie, más `esc`. */
function cargarEtiqueta() {
  const win = {PrintModule: {}, NroComprobante: N, DniPedido: DP};
  const src = E.trozo('print.js', 'var _CODIGO_CUTOFF', '/* ── FORMATO 2') +
    E.trozo('print.js', 'function esc(s){', 'window.esc = esc;');
  // eslint-disable-next-line no-new-func
  return new Function('window', 'NroComprobante', 'DniPedido',
      'const _dniDe=(s)=>DniPedido.de(s);' + src +
      ';return {codigo:_codigoEnvio, base:_codigoBase, qr:_qrValor,' +
      ' pie:_pieQrPedido, etiqueta:_htmlEtiqueta, PM:window.PrintModule};',
  )(win, N, DP);
}

/* El alta de pedidos del servidor, ejecutada contra una base de mentira. */
function cargarCreate(tokens) {
  const src = E.leer('functions/index.js');
  const campos = src.slice(src.indexOf('const ORDER_FIELDS'),
      src.indexOf('// ── action=create'));
  const create = src.slice(src.indexOf('async function handleCreate'),
      src.indexOf('// ── action=token'));
  const escritos = [];
  const db = {
    doc: (p) => ({
      _p: p,
      get: async () => {
        const id = p.split('/').pop();
        const t = p.indexOf('panel/tokens/items/') === 0 ? tokens[id] : null;
        return {exists: !!t, data: () => t};
      },
    }),
    batch: () => ({
      set: (ref, data, opt) => escritos.push({p: ref._p, data, opt}),
      commit: async () => {},
    }),
  };
  // eslint-disable-next-line no-new-func
  const fn = new Function('db', 'agencias', 'enlace', 'reniecPublico',
      'nroComp', 'checkRateLimit', 'TOK_COL', 'SHIP_COL', 'CFG_DOC',
      campos + create + ';return handleCreate;',
  )(db, require('../functions/agencias.js'), {generar: () => 'tok128'},
      {normalizar: () => ''}, N, async () => true,
      'panel/tokens/items', 'panel/shipments/items', 'panel/config');
  return {fn, escritos};
}
function resFalsa() {
  const r = {code: 200, body: null};
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}

module.exports = async ({bloque, ok}) => {

  bloque('El número, limpio: lo que entra en un QR sin romperlo');

  {
    ok(N.limpiar('f001-00123') === 'F001-00123', 'mayúsculas');
    ok(N.limpiar('  b001 456 ') === 'B001-456',
       'espacios a los lados fuera; el de en medio pasa a guion');
    ok(N.limpiar('F001 / 123') === 'F001-123', 'barra y espacios → un guion');
    ok(N.limpiar('F001#123') === 'F001123',
       '⚠️ el # se va: dentro del QR `teléfono#número` partiría la lectura');
    ok(N.limpiar('<script>') === 'SCRIPT', 'nada que pueda ser HTML');
    ok(N.limpiar('--F001--') === 'F001', 'sin guiones en los bordes');
    ok(N.limpiar('A'.repeat(30)).length === 20, 'máximo 20');
    ok(N.limpiar('ABCDEFGHIJKLMNOPQRS-T') === 'ABCDEFGHIJKLMNOPQRS',
       'y si el corte cae en un guion, no queda colgando');
    ok(N.limpiar(null) === '' && N.limpiar(undefined) === '' &&
       N.limpiar('  ') === '', 'vacío es vacío');
    ok(N.de({nroComprobante: ' f001-1 '}) === 'F001-1', 'de() lee el campo');
    ok(N.de({}) === '' && N.de(null) === '',
       'un pedido sin el campo —todos los de antes— no tiene número');
    ok(N.tipo('F001-1') === 'FACTURA' && N.tipo('B001-1') === 'BOLETA' &&
       N.tipo('0001-1') === 'COMPROBANTE', 'la serie dice qué es (SUNAT)');
  }

  bloque('El buscador lo encuentra como lo escribas');

  {
    const p = {nroComprobante: 'F001-00123'};
    ok(N.coincide(p, 'f001-00123'), 'en minúsculas');
    ok(N.coincide(p, 'f001 00123'), 'con espacio en vez de guion');
    ok(N.coincide(p, '123'), 'a medias');
    ok(!N.coincide(p, '999'), 'otro número, no');
    ok(!N.coincide({}, '123'), 'un pedido sin número nunca coincide');
    ok(!N.coincide(p, '   '), 'buscar espacios no lo encuentra todo');

    // El buscador REAL del panel, ejecutado.
    const src = E.trozo('index.html', 'function visibleShipments(){',
        '/* ══════');
    const S = {shipments: [
      {id: 'a', name: 'ANA', phone: '911111111', address: 'X', courier: 'SHALOM',
        status: 'NUEVO PEDIDO', nroComprobante: 'F001-00123'},
      {id: 'b', name: 'LUIS', phone: '922222222', address: 'Y', courier: 'SHALOM',
        status: 'NUEVO PEDIDO'},
    ]};
    let q = '';
    // eslint-disable-next-line no-new-func
    const vis = new Function('S', '$', '_dniDe', 'NroComprobante',
        'let _filt="",_advActive=false;const _adv={};' +
        'function _soloActivos(){return true}' + src +
        ';return visibleShipments;',
    )(S, () => ({value: q}), DP.de, N);
    q = 'f001-00123';
    ok(vis().length === 1 && vis()[0].id === 'a',
       'el buscador general encuentra el pedido por su factura');
    q = 'f001 123';
    ok(vis().length === 0,
       'y no inventa: «f001 123» no está dentro de F001-00123');
    q = '00123';
    ok(vis().length === 1, 'un trozo del número basta');
    q = 'luis';
    ok(vis().length === 1 && vis()[0].id === 'b',
       'lo demás se sigue buscando igual');
  }

  bloque('El servidor lo pone desde el TOKEN, nunca desde el cliente');

  {
    const src = E.leer('functions/index.js');
    const lista = src.slice(src.indexOf('const ORDER_FIELDS'),
        src.indexOf('];', src.indexOf('const ORDER_FIELDS')));
    ok(lista.indexOf('nroComprobante') < 0,
       '⚠️ no está en ORDER_FIELDS: lo que mande el formulario con ese ' +
       'nombre se tira — nadie se pone el número de otra venta');

    let c = cargarCreate({T1: {nroComprobante: 'f001 / 77', used: false}});
    let r = resFalsa();
    await c.fn({body: {token: 'T1', order: {name: 'ANA', phone: '911111111',
      nroComprobante: 'B999-TRAMPA'}}}, r);
    const ped = c.escritos.find((w) => w.p.indexOf('panel/shipments/') === 0);
    ok(r.body && r.body.status === 'ok', 'el pedido se crea');
    ok(ped && ped.data.nroComprobante === 'F001-77',
       'el pedido lleva el número DEL TOKEN, limpio');
    ok(r.body.nroComprobante === 'F001-77',
       'y se devuelve al formulario para el WhatsApp');

    c = cargarCreate({T2: {used: false}});
    r = resFalsa();
    await c.fn({body: {token: 'T2', order: {name: 'ANA', phone: '911111111',
      nroComprobante: 'B999-TRAMPA'}}}, r);
    const ped2 = c.escritos.find((w) => w.p.indexOf('panel/shipments/') === 0);
    ok(!('nroComprobante' in ped2.data),
       '⚠️ token sin número + cliente que manda uno = pedido SIN número');
    ok(!('nroComprobante' in r.body),
       'y la respuesta es exactamente la de antes');

    c = cargarCreate({});
    r = resFalsa();
    await c.fn({body: {order: {name: 'ANA', phone: '911111111',
      nroComprobante: 'B999-TRAMPA'}}}, r);
    const ped3 = c.escritos.find((w) => w.p.indexOf('panel/shipments/') === 0);
    ok(!('nroComprobante' in ped3.data),
       'sin token (link general) tampoco hay número');
  }

  bloque('El seguimiento del cliente lo enseña como su código (desde el 26/10)');

  {
    /* Decisión del dueño: con factura/boleta, el cliente ve ESE número en
       su WhatsApp, y el link de seguimiento tiene que decir lo mismo. */
    const PP = require('../functions/pedidoPublico.js');
    const vista = PP.proyectar({id: 'id_1', name: 'ANA', status: 'NUEVO PEDIDO',
      nroComprobante: 'F001-1', shalomClave: '1234'}, {code: '1234', frozen: false});
    ok(vista.nroComprobante === 'F001-1',
       'el número entra en la lista cerrada de campos públicos');
    ok(!('shalomClave' in vista), 'y los secretos siguen fuera');
  }

  bloque('La etiqueta: QR grande = solo celular; el número va en el pie con su QR pequeño');

  {
    const P = cargarEtiqueta();
    const viejo = {id: 'id_1754000123456', createdAt: '2026-07-01T10:00:00Z',
      phone: '911111111', name: 'ANA'};
    const ayer = {id: 'id_1761400987654', createdAt: '2026-10-25T10:00:00Z',
      phone: '911111111', name: 'ANA'};
    const conNro = {id: 'id_1761500555444', createdAt: '2026-10-26T10:00:00Z',
      phone: '922222222', name: 'LUIS', nroComprobante: 'F001-00123'};
    const rapido = {id: 'id_1761500111222', createdAt: '2026-10-26T11:00:00Z',
      phone: '933333333', name: 'EVA'};

    ok(P.codigo(viejo) === '3456' && P.qr(viejo) === '911111111',
       'pedido antiguo: 4 caracteres y QR grande con el celular');
    ok(P.codigo(ayer) === '987654' && P.qr(ayer) === '911111111',
       '⚠️ QR grande = SOLO el celular (27/10), ya sin «#código»');
    ok(P.codigo(conNro) === 'F001-00123',
       'con número, el código ES el número');
    ok(P.qr(conNro) === '922222222',
       'y aunque tenga boleta, el QR grande sigue siendo solo el celular');
    ok(P.base(conNro) === '555444',
       'el código de 6 dígitos sigue existiendo por debajo');
    ok(P.PM.codigoEnvio === P.codigo && P.PM.codigoBase === P.base,
       'y los dos se exponen al escáner');

    ok(/QR:TTPED:id_1754000123456/.test(P.pie(viejo, (v) => 'QR:' + v)) &&
       /QR:TTPED:id_1761400987654/.test(P.pie(ayer, (v) => 'QR:' + v)),
       '⚠️ TODA etiqueta impresa lleva el QR pequeño, también la de un pedido ' +
       'antiguo: sin él no se podría cambiar de etiqueta por QR');
    ok(/#3456/.test(P.pie(viejo, (v) => v)), 'el antiguo, rotulado con su código de 4');
    const pieN = P.pie(conNro, (v) => 'QR:' + v);
    ok(/QR:TTPED:id_1761500555444/.test(pieN),
       'con número: QR pequeño con el ID del pedido');
    ok(/FACTURA/.test(pieN) && /F001-00123/.test(pieN),
       'rotulado «FACTURA F001-00123»');
    const pieR = P.pie(rapido, (v) => 'QR:' + v);
    ok(/QR:TTPED:id_1761500111222/.test(pieR) && /PEDIDO/.test(pieR) &&
       /#111222/.test(pieR),
       'link rápido (sin número): QR pequeño con «PEDIDO #111222»');

    const html = P.etiqueta([conNro], 1, 'TOTAL TOOLS', '', '', 'hoy',
        (v) => 'QR:' + encodeURIComponent(v));
    ok(/#F001-00123/.test(html), 'el pie de la etiqueta dice #F001-00123');
    ok(html.indexOf('class="card-pie"') > html.indexOf('class="card-thanks-txt"'),
       'y el QR pequeño va DEBAJO de toda la etiqueta');
    const htmlV = P.etiqueta([ayer], 1, 'TOTAL TOOLS', '', '', 'hoy',
        (v) => 'QR:' + v);
    ok(/#987654/.test(htmlV) && htmlV.indexOf('class="card-pie"') > 0 &&
       htmlV.indexOf('QR:911111111"') > 0,
       'la de un pedido de ayer: código de siempre abajo, QR grande con el celular y QR pequeño');
    const malo = Object.assign({}, conNro, {nroComprobante: '"><img src=x>'});
    ok(P.etiqueta([malo], 1, 'T', '', '', 'h', (v) => v).indexOf('<img src=x') < 0,
       'un número con HTML no se cuela en la etiqueta');
    {
      // Segunda defensa: aunque el módulo un día dejara pasar algo, la
      // etiqueta escapa por su cuenta.
      const crudo = Object.assign({}, N, {de: () => '<b>X</b>'});
      const win = {PrintModule: {}, NroComprobante: crudo, DniPedido: DP};
      const src = E.trozo('print.js', 'var _CODIGO_CUTOFF', '/* ── FORMATO 2') +
        E.trozo('print.js', 'function esc(s){', 'window.esc = esc;');
      // eslint-disable-next-line no-new-func
      const pie = new Function('window', 'NroComprobante', 'DniPedido',
          'const _dniDe=(s)=>DniPedido.de(s);' + src + ';return _pieQrPedido;',
      )(win, crudo, DP);
      ok(pie(conNro, (v) => v).indexOf('<b>X</b>') < 0,
         'y la etiqueta escapa por su cuenta, sin fiarse del módulo');
    }
  }

  bloque('El QR pequeño: un pedido, sin adivinar');

  {
    const p = {id: 'id_1761500555444', createdAt: '2026-10-26T10:00:00Z'};
    ok(N.leerQrPedido(N.valorQrPedido(p)) === p.id, 'ida y vuelta');
    ok(N.leerQrPedido('911111111#123456') === '', 'el QR grande no es este');
    ok(N.leerQrPedido('TTPED:../x') === '' &&
       N.leerQrPedido('TTPED:') === '', 'un id con forma rara se rechaza');
    ok(N.valorQrPedido({id: '../x', nroComprobante: 'F1'}) === '',
       'ni se imprime');
  }

  bloque('El escáner: QR grande = búsqueda de siempre; QR pequeño = directo al pedido');

  {
    const P = cargarEtiqueta();
    const S = {shipments: [
      {id: 'id_1761500555444', createdAt: '2026-10-26T10:00:00Z',
        phone: '922222222', name: 'LUIS', nroComprobante: 'F001-00123',
        status: 'NUEVO PEDIDO'},
      {id: 'id_1761500999888', createdAt: '2026-10-26T12:00:00Z',
        phone: '922222222', name: 'LUIS 2', status: 'NUEVO PEDIDO'},
    ]};
    const src = E.trozo('index.html', 'function handleQR(raw){',
        'function closeQR(){');
    const fuimos = [];
    const avisos = [];
    const found = {style: {}, textContent: ''};
    const fSearch = {value: ''};
    let mov = [];
    // eslint-disable-next-line no-new-func
    const api = new Function('S', '$', 'window', 'PrintModule',
        'NroComprobante', 'irAlPedido', 'closeQR', 'toast', 'setTimeout',
        'esUsuarioWA', 'renderChips', 'render', '_qrMove', 'document',
        'requestAnimationFrame', '_qrMoveOnScan', 'scanLoop',
        'let _filt="";' + src + ';return {handleQR};',
    )(S, (id) => (id === 'qrFound' ? found : fSearch),
        {PrintModule: P.PM, NroComprobante: N}, P.PM, N,
        (id) => fuimos.push(id), () => {}, (m) => avisos.push(m),
        (f) => f(), () => false, () => {}, () => {}, {on: false},
        {querySelectorAll: () => []}, () => {}, (r) => mov.push(r), () => {});

    api.handleQR('TTPED:id_1761500999888');
    ok(fuimos[0] === 'id_1761500999888',
       'QR pequeño → va directo a ESE pedido (como «Ver»)');
    api.handleQR('922222222');
    ok(fuimos.length === 1 && fSearch.value === '922222222',
       '⚠️ QR grande (solo celular) → la búsqueda de siempre: todos los de ese número');
    fSearch.value = '';
    api.handleQR('922222222#F001-00123');
    ok(fuimos.length === 1 && fSearch.value === '922222222',
       'etiqueta impresa antes con «número#código» → también búsqueda por celular');
    ok(!/_qrPorCodigo|_exactos/.test(src),
       'ya no queda el atajo «directo por código» del QR grande');
  }

  bloque('Cambio de etiqueta: SOLO con el QR pequeño');

  {
    const src = E.trozo('index.html', 'function _qrMoveOnScan(raw){',
        '// Revertir (con confirmación');
    const ESTADOS = ['NUEVO PEDIDO', 'EN PROCESO', 'POR ALISTAR', 'ALISTADO', 'ENVIADO'];
    const correr = (estadoPedido, objetivo, raw) => {
      const S = {shipments: [
        {id: 'id_1', name: 'ANA', phone: '922222222', status: estadoPedido},
        {id: 'id_2', name: 'LUIS', phone: '922222222', status: 'NUEVO PEDIDO'},
      ]};
      const r = {fallos: [], guardados: [], avisos: []};
      const qm = {on: true, status: objetivo, last: null, shown: null};
      // eslint-disable-next-line no-new-func
      new Function('S', 'window', 'NroComprobante', '_qrMove', 'allStatuses', 'closeQR',
          '_qrMoveArmTimer', '_qrMoveFallo', 'render', 'toast', 'save',
          src + ';_qrMoveOnScan(' + JSON.stringify(raw) + ');',
      )(S, {NroComprobante: N, _fbSaveShipmentNow: (x) => r.guardados.push(x.id)}, N, qm,
          () => ESTADOS, () => {}, () => {}, (m) => r.fallos.push(m), () => {},
          (m) => r.avisos.push(m), () => {});
      r.S = S; r.qm = qm;
      return r;
    };
    let r = correr('NUEVO PEDIDO', 'EN PROCESO', '922222222');
    ok(r.guardados.length === 0 && /QR pequeño/.test(r.fallos[0] || ''),
       '⚠️ QR grande en modo escaneo: NO mueve nada, y avisa «escanea el QR pequeño»');
    r = correr('NUEVO PEDIDO', 'EN PROCESO', '922222222#F001-00123');
    ok(r.guardados.length === 0 && r.S.shipments.every((x) => x.status === 'NUEVO PEDIDO'),
       'una etiqueta vieja «número#código» tampoco mueve');
    r = correr('NUEVO PEDIDO', 'EN PROCESO', 'TTPED:id_1');
    ok(r.S.shipments[0].status === 'EN PROCESO' && r.guardados.join() === 'id_1' &&
       r.S.shipments[1].status === 'NUEVO PEDIDO',
       'QR pequeño: mueve ESE pedido, y no al otro del mismo celular');
    ok(r.qm.last && r.qm.last.prev === 'NUEVO PEDIDO', 'con su tira «de → a» para revertir');
    r = correr('ALISTADO', 'EN PROCESO', 'TTPED:id_1');
    ok(r.guardados.length === 0 && /retroceder/.test(r.fallos[0] || ''), 'solo avanza');
    r = correr('EN PROCESO', 'EN PROCESO', 'TTPED:id_1');
    ok(r.guardados.length === 0 && r.qm.shown === 'id_1' && !r.fallos.length,
       'si ya está en ese estado, solo lo muestra');
    r = correr('NUEVO PEDIDO', 'EN PROCESO', 'TTPED:id_noexiste');
    ok(r.guardados.length === 0 && /ya no está/.test(r.fallos[0] || ''),
       'un pedido que ya no existe: avisa');
    const idx = E.leer('index.html');
    ok(/function qrMoveToggle\(\)\{[\s\S]{0,400}openPin\(/.test(idx),
       'se sigue activando igual: con la clave');
  }

  bloque('Editar pedido: se guarda solo si hay algo, y borrarlo viaja');

  {
    const bloqueSave = E.trozo('config.js', '  {\n    const _nro = _nroLimpio(',
        '  if(_editId && window.DniPedido){');
    const correr = (valor, previo, otros) => {
      const S = {shipments: [].concat(previo ? [previo] : [], otros || [])};
      const data = {};
      const avisos = [];
      // eslint-disable-next-line no-new-func
      new Function('$', 'S', '_editId', 'data', '_nroLimpio', '_nroRepetido',
          'toast', bloqueSave,
      )((id) => (id === 'fComprobante' ? {value: valor} : null), S,
          previo ? previo.id : null, data, N.limpiar,
          (nro, idP) => (nro ? (S.shipments.find((x) => x.id !== idP &&
            N.de(x) === nro) || null) : null),
          (m) => avisos.push(m));
      return {data, avisos};
    };
    let r = correr('', {id: 'v1', name: 'VIEJO'});
    ok(!('nroComprobante' in r.data),
       '⚠️ abrir y guardar un pedido antiguo NO le estrena el campo');
    r = correr('f001 9', {id: 'v1'});
    ok(r.data.nroComprobante === 'F001-9', 'escribirlo lo guarda, limpio');
    r = correr('', {id: 'v1', nroComprobante: 'F001-9'});
    ok(r.data.nroComprobante === '',
       'borrarlo guarda vacío: el borrado llega a la nube');
    r = correr('F001-9', {id: 'v1'}, [{id: 'v2', name: 'ANA',
      nroComprobante: 'F001-9'}]);
    ok(r.data.nroComprobante === 'F001-9' && /ANA/.test(r.avisos[0] || ''),
       'repetido en otro pedido: avisa, pero guarda (una factura, dos bultos)');

    const cfg = E.leer('config.js');
    ok(/'fComprobante'\]/.test(cfg), 'cuenta como cambio sin guardar');
    ok(/fComprobante'\)\)\$\('fComprobante'\)\.value=_nroDe\(s\)/.test(cfg),
       'se carga al abrir el pedido');
    ok(/if\(\$\('fComprobante'\)\)\$\('fComprobante'\)\.value='';/.test(cfg),
       'y se vacía al crear uno nuevo');
    ok(/'Factura\/Boleta'\]/.test(cfg) && /_nroDe\(s\)\]\)/.test(cfg),
       'el CSV tiene su columna');
    const copia = cfg.slice(cfg.indexOf('var CLIENTE_COPIA'),
        cfg.indexOf(';', cfg.indexOf('var CLIENTE_COPIA')));
    ok(copia.indexOf('nroComprobante') < 0,
       '⚠️ cliente recurrente: el número NO se copia de una venta anterior');
  }

  bloque('El link personalizado lo lleva dentro del token');

  {
    const cfg = E.leer('config.js');
    const gen = cfg.slice(cfg.indexOf('async function _genTokenDo'),
        cfg.indexOf('function genToken('));
    ok(/_nroLimpio\(\(\$\('tokComprobante'\)/.test(gen), 'lee la casilla, limpia');
    ok(/if\(nroComp\) tok\.nroComprobante = nroComp;/.test(gen),
       'solo si hay: los links sin número quedan como antes');
    ok(gen.indexOf('tok.nroComprobante') < gen.indexOf('_fbSaveTok(tok)'),
       'y entra en el token ANTES de guardarlo');
    ok(/\$\('tokComprobante'\)\.value=''/.test(gen), 'se borra tras generar');
    const quick = cfg.slice(cfg.indexOf('async function _genQuickDo'),
        cfg.indexOf('async function _genQuickDo') + 3000);
    ok(quick.indexOf('nroComprobante') < 0, 'el link rápido no lleva número');

    const idx = E.leer('index.html');
    ok(/id="tokLink"[\s\S]{0,300}id="tokComprobante"/.test(idx),
       'la casilla va al lado del link adjunto');
    ok(/id="fDni"[\s\S]{0,500}id="fComprobante"/.test(idx) &&
       idx.indexOf('id="fComprobante"') < idx.indexOf('id="fEncAgenciaGroup"'),
       'en Editar va en la fila del DNI, y la agencia baja a la siguiente');
    ok(/functions\/nroComprobante\.js/.test(idx), 'el panel carga el módulo');
  }

  bloque('La campana y la tarjeta lo muestran, discreto y al día');

  {
    const nt = E.leer('notify.js');
    ok(/_nroDe\(n\.shipId\)/.test(nt),
       'la campana lo lee del PEDIDO al pintar, no de una copia vieja');
    const card = E.trozo('index.html', 'function cardHTML(s){',
        'function dlvDriverBlock');
    ok(/NroComprobante\.de\(s\)/.test(card) && /escH\(NroComprobante/.test(card),
       'la tarjeta lo enseña, escapado');
  }

  bloque('El WhatsApp del formulario lo menciona si existe');

  {
    const f = E.leer('formulario.html');
    ok(/if\(resp\.nroComprobante\) order\.nroComprobante/.test(f),
       'lo toma de la respuesta del servidor');
    ok(/nroLine/.test(f) && /\[\^A-Z0-9-\]/.test(f),
       'y lo vuelve a filtrar antes de escribirlo en el mensaje');
  }
};
