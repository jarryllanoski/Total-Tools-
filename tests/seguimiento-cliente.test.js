/**
 * tests/seguimiento-cliente.test.js — la página de seguimiento del cliente
 * ========================================================================
 * 27/10/2026. Cuatro arreglos, y la regla que los cruza:
 *
 *   1. El narrador (Delfi) leía SOLO la etiqueta del panel. Esperaba la
 *      etapa de Shalom en `data-shalom-st` y la página nunca la ponía: con
 *      Shalom en «Entregado» y el panel en ENVIADO, seguía con lo viejo.
 *   2. «Copiar» copiaba solo la guía, y en el navegador de WhatsApp decía
 *      «✓ Copiado» sin haber copiado (la promesa rechazada no se veía).
 *   3. La ayuda hablaba de estados que el cliente no ve, y le decía «ya
 *      puedes recogerlo» a un delivery.
 *   4. Retiro en tienda: ALISTADO = «pasa a recoger», con la dirección de
 *      Config.
 *
 * ⚠️ LA CLAVE DE RECOJO NO SE COMPARTE NUNCA. Ni en el link, ni en la
 *    ayuda, ni en lo que dice el narrador, ni en lo que copia «Copiar».
 */
'use strict';
const E = require('./_entorno.js');

const esc = (s) => s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* Las funciones reales de formulario.html, en un ámbito con CFG a elección. */
function formulario(CFG) {
  const src = E.trozo('formulario.html', 'function _isOtrasAg(name){', '\n}\n') + '\n}\n' +
    E.trozo('formulario.html', 'function _tipoEnvioDe(name){', 'function onCourierChange(name){') +
    E.trozo('formulario.html', '/* Deriva la fase del recorrido', 'function renderTrackResult(ship, code){') +
    E.trozo('formulario.html', 'function _ayudaTrackContenido(', 'function abrirAyudaTrack(){');
  // eslint-disable-next-line no-new-func
  return new Function('CFG', 'esc', 'window', 'DniPedido',
      src + ';return {_tipoEnvioDe, _datosNarrador, _shalomTrackingBlock, _ayudaTrackContenido};',
  )(CFG, esc, {DniPedido: require('../functions/dniPedido.js')},
      require('../functions/dniPedido.js'));
}

/* El narrador real, contra un DOM de mentira que dice lo que la página pintó. */
function narrador(pintado) {
  const attrs = pintado.attrs || {};
  const card = {getAttribute: (k) => attrs[k] === undefined ? null : String(attrs[k])};
  const nodoTexto = (t) => ({textContent: t});
  const filas = Object.keys(pintado.filas || {}).map((k) => ({
    querySelector: (s) => s === '.tk-row-lbl' ? nodoTexto(k) : nodoTexto(pintado.filas[k]),
  }));
  const app = {
    textContent: '',
    querySelector: (sel) => {
      if (sel === '.status-badge') return pintado.badge ? nodoTexto(pintado.badge) : null;
      const m = /^\.track-card\[(data-[a-z-]+)\]$/.exec(sel);
      if (m) return (m[1] in attrs) ? card : null;
      if (sel === '.track-card') return card;
      return null;
    },
    querySelectorAll: (sel) => sel === '.tk-row' ? filas : [],
  };
  const win = {addEventListener: () => {}};
  const document = {getElementById: (id) => id === 'app' ? app : null, readyState: 'loading',
    addEventListener: () => {}, currentScript: null};
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', 'navigator', 'MutationObserver', E.leer('narrador/narrador.js'))(
      win, document, {}, function() { this.observe = () => {}; });
  return win.__ttNarrador;
}

module.exports = async ({bloque, ok}) => {

  bloque('El tipo de envío: una sola regla para el formulario y el seguimiento');

  {
    const F = formulario({courierTypes: {DELIVERY: 'delivery'}});
    ok(F._tipoEnvioDe('SHALOM') === 'agencia', 'Shalom → agencia');
    ok(F._tipoEnvioDe('RETIRO EN TIENDA') === 'retiro', 'retiro en tienda');
    ok(F._tipoEnvioDe('ENCOMIENDA') === 'encomienda', 'encomienda (otra agencia)');
    ok(F._tipoEnvioDe('DELIVERY') === 'delivery', 'delivery');
    ok(F._tipoEnvioDe('OLVA COURIER') === 'agencia', 'Olva → agencia');
    const oc = E.trozo('formulario.html', 'function onCourierChange(name){', '$(\'err_courier\')');
    ok(/selCourierType = _tipoEnvioDe\(name\);/.test(oc),
       'el formulario elige con la MISMA función (no una copia)');
  }

  bloque('⚠️ El narrador por fin recibe la etapa REAL de Shalom');

  {
    const F = formulario({config: {city: 'Av Primavera Puente Piedra'}});
    const sh = (estado) => F._datosNarrador({courier: 'SHALOM', trackingStatus: estado});
    ok(sh('ENTREGADO').shalomSt === 4, 'Shalom «Entregado» → etapa 4 (entrega completada)');
    ok(sh('En destino').shalomSt === 3, '«En destino» → 3');
    ok(sh('En tránsito').shalomSt === 2 && sh('Registrado en origen').shalomSt === 2,
       'en camino / en origen → 2 (ya salió de la tienda)');
    ok(sh('').shalomSt === null,
       'sin estado de Shalom (p. ej. «Mostrar en el link» apagado) → nada: manda el panel');
    ok(F._datosNarrador({courier: 'OLVA COURIER', trackingStatus: 'ENTREGADO'}).shalomSt === null,
       '⚠️ SOLO Shalom: otro courier nunca publica etapa de Shalom');
    ok(F._datosNarrador({courier: 'RETIRO EN TIENDA'}).tiendaDir === 'Av Primavera Puente Piedra',
       'retiro: la dirección de la tienda sale de Config');
    ok(F._datosNarrador({courier: 'DELIVERY'}).tiendaDir === '', 'y solo para retiro');

    const r = E.trozo('formulario.html', 'function renderTrackResult(ship, code){', 'function clearOrderAndReset');
    ok(/<div class="track-card" data-tipo="\$\{esc\(narr\.tipo\)\}"/.test(r) &&
       /data-shalom-st="\$\{narr\.shalomSt\}"/.test(r) && /data-tienda-dir="\$\{esc\(narr\.tiendaDir\)\}"/.test(r),
       'la tarjeta publica tipo, etapa de Shalom y dirección (escapados)');
  }

  bloque('Lo que lee el narrador: panel vs Shalom');

  {
    let N = narrador({badge: '🚚 ENVIADO', attrs: {'data-tipo': 'agencia', 'data-shalom-st': '4'}});
    let e = N.estadoATexto();
    ok(e.st === 4, '⚠️ Shalom ENTREGADO + panel ENVIADO → Delfi dice entrega completada');
    ok(/Entrega completada/i.test(N.mensajeDelfi(e, 'agencia', {})), 'con su frase');
    N = narrador({badge: '🏁 FINALIZADO', attrs: {'data-tipo': 'agencia', 'data-shalom-st': '2'}});
    ok(N.estadoATexto().st === 4, 'nunca retrocede: si el panel va más adelante, manda el panel');
    N = narrador({badge: '🚚 ENVIADO', attrs: {'data-tipo': 'agencia'}});
    ok(N.estadoATexto().st === 2, 'sin etapa de Shalom: la etiqueta del panel, como siempre');
    N = narrador({badge: '🚚 ENVIADO', attrs: {'data-tipo': 'agencia'},
      filas: {'DNI destinatario': '46514***', 'Courier': 'SHALOM'}});
    ok(N.tipoEnvio() === 'agencia',
       'un Shalom con fila «DNI destinatario» sigue siendo agencia (antes pasaba por otra agencia)');
    N = narrador({badge: '✅ ALISTADO', attrs: {'data-tipo': 'retiro'}});
    ok(N.estadoATexto().alistado === true, 'ALISTADO se distingue de POR ALISTAR');
    N = narrador({badge: '📦 POR ALISTAR', attrs: {'data-tipo': 'retiro'}});
    ok(!N.estadoATexto().alistado && N.estadoATexto().st === 1,
       'POR ALISTAR no es «listo», pero sí etapa 1 (preparando)');
  }

  bloque('Qué dice Delfi según el tipo de envío');

  {
    const N = narrador({});
    const M = N.mensajeDelfi;
    ok(/pasar a recogerlo a nuestra tienda en Av Primavera/.test(
        M({st: 1, alistado: true}, 'retiro', {tiendaDir: 'Av Primavera Puente Piedra'})),
       'retiro + ALISTADO → «ya puedes pasar a recoger a la tienda en <dirección>»');
    ok(!/recoger/.test(M({st: 1}, 'retiro', {})), 'retiro + POR ALISTAR → aún no');
    ok(/motorizado/.test(M({st: 2}, 'delivery', {})) && !/tiempo real/.test(M({st: 2}, 'delivery', {})),
       'delivery ENVIADO: con el motorizado, sin prometer rastreo en vivo');
    ok(/Cusco/.test(M({st: 2}, 'encomienda', {ciudad: 'Cusco'})) &&
       !/tiempo real/.test(M({st: 2}, 'encomienda', {ciudad: 'Cusco'})),
       'otra agencia ENVIADO: viaja a su ciudad, sin rastreo en vivo');
    ok(/Shalom/.test(M({st: 2}, 'agencia', {shalom: true})), 'Shalom ENVIADO: mira el bloque de Shalom');
    ok(/DNI/.test(M({st: 3}, 'agencia', {})), 'agencia en destino: con DNI');
    ok(/motorizado está llegando/.test(M({st: 3}, 'delivery', {})), 'delivery en destino: está llegando');
    ok(/pago/i.test(M({st: 3, pago: true}, 'delivery', {})), 'pendiente de pago');
    const todas = ['delivery', 'agencia', 'encomienda', 'retiro'].map((t) =>
      [0, 1, 2, 3, 4].map((st) => M({st}, t, {shalom: true, ciudad: 'X', tiendaDir: 'Y'})).join(' ')).join(' ') +
      JSON.stringify(Object.keys(N.DELFI).map((k) => typeof N.DELFI[k] === 'function' ? N.DELFI[k]('a', 'b') : N.DELFI[k]));
    ok(!/clave/i.test(todas), '⚠️ el narrador NUNCA menciona la clave de recojo');
  }

  bloque('«Copiar»: guía + código, y de verdad');

  {
    const src = E.trozo('formulario.html', '/* ★ COPIAR, DE VERDAD.', '/* Deriva la fase del recorrido');
    const correr = (clipboard, execOk) => {
      const r = {copiado: null, prompt: null, btn: {textContent: 'Copiar', _a: {},
        getAttribute(k) { return this._a[k] === undefined ? null : this._a[k]; },
        setAttribute(k, v) { this._a[k] = v; }}};
      const document = {
        createElement: () => ({style: {}, setAttribute() {}, select() {}}),
        body: {appendChild() {}, removeChild() {}},
        execCommand: () => { if (execOk) r.copiado = 'clasico'; return execOk; },
      };
      // eslint-disable-next-line no-new-func
      const api = new Function('document', 'navigator', 'window', 'setTimeout',
          src + ';return {_copyGuia, _textoGuia, _copyTrack};',
      )(document, {clipboard}, {prompt: (m, t) => { r.prompt = t; }}, () => {});
      r.api = api;
      return r;
    };
    let r = correr(null, false);
    ok(r.api._textoGuia('101402709', 'P9PK') === 'Guía: 101402709 · Código: P9PK',
       'copia guía Y código, legibles');
    ok(r.api._textoGuia('101402709', '') === '101402709', 'sin código, solo la guía');

    const btn = (b) => { b._a['data-guia'] = '101402709'; b._a['data-codigo'] = 'P9PK'; return b; };
    let texto = null;
    r = correr({writeText: async (t) => { texto = t; }}, false);
    await r.api._copyGuia(btn(r.btn));
    ok(texto === 'Guía: 101402709 · Código: P9PK' && /Copiado/.test(r.btn.textContent),
       'con permiso: copia y dice «Copiado»');
    r = correr({writeText: () => Promise.reject(new Error('denied'))}, true);
    await r.api._copyGuia(btn(r.btn));
    ok(r.copiado === 'clasico' && /Copiado/.test(r.btn.textContent),
       '⚠️ navegador de WhatsApp (rechaza el permiso): copia con el método clásico');
    r = correr({writeText: () => Promise.reject(new Error('denied'))}, false);
    await r.api._copyGuia(btn(r.btn));
    ok(!/Copiado/.test(r.btn.textContent) && r.prompt === 'Guía: 101402709 · Código: P9PK',
       'si nada funciona, NO miente: enseña los datos para copiarlos a mano');
    r = correr(undefined, true);
    await r.api._copyGuia(btn(r.btn));
    ok(r.copiado === 'clasico', 'sin la API moderna, el método clásico');

    const F = formulario({});
    const html = F._shalomTrackingBlock({courier: 'SHALOM', trackingOrderNumber: '101402709',
      trackingOrderCode: 'P9PK', trackingStatus: 'En tránsito', shalomClave: '4321'});
    ok(/onclick="_copyGuia\(this\)" data-guia="101402709" data-codigo="P9PK"/.test(html),
       'el botón lleva guía y código en data-*, no como código en un onclick');
    ok(html.indexOf('4321') < 0, '⚠️ aunque el pedido traiga la clave, el bloque no la pinta');
  }

  bloque('La ayuda «¿Cómo sigo mi pedido?» según el tipo de envío');

  {
    const F = formulario({});
    const txt = (r) => JSON.stringify(r);
    const ret = F._ayudaTrackContenido('retiro', false, 'Av Primavera <b>Puente</b> Piedra');
    ok(ret.estados.some((e) => e.t === 'ALISTADO' && /recogerlo a nuestra tienda/.test(e.d)),
       'retiro: ALISTADO = ya puedes pasar a recoger');
    ok(/Av Primavera &lt;b&gt;Puente&lt;\/b&gt; Piedra/.test(txt(ret)), 'con la dirección, escapada');
    ok(!ret.estados.some((e) => e.t === 'ENVIADO'), 'retiro no habla de ENVIADO');
    const del = F._ayudaTrackContenido('delivery', false, '');
    ok(!/recoger/i.test(txt(del.estados)), '⚠️ delivery: nunca «ya puedes recogerlo»');
    ok(/motorizado/.test(txt(del)), 'delivery: el motorizado');
    const sh = F._ayudaTrackContenido('agencia', true, '');
    ok(/N\.º de guía y el código/.test(txt(sh)) && /Copiar/.test(txt(sh)), 'Shalom: guía y código explicados');
    ok(/DNI de la persona que figura como destinatario/.test(txt(sh)), 'qué llevar al recoger');
    ok(['NUEVO PEDIDO', 'ENVIADO', 'LLEGÓ A DESTINO', 'FINALIZADO'].every((n) => txt(sh).indexOf(n) >= 0),
       'con los nombres de estado que el cliente VE');
    const todas = ['delivery', 'agencia', 'encomienda', 'retiro'].map((t) =>
      txt(F._ayudaTrackContenido(t, true, 'X'))).join(' ');
    ok(!/clave/i.test(todas), '⚠️ la ayuda NUNCA menciona la clave de recojo');
  }

  bloque('⚠️ La clave de recojo: blindada');

  {
    const PP = require('../functions/pedidoPublico.js');
    const v = PP.proyectar({id: 'x', name: 'A', status: 'ENVIADO', shalomClave: '4321',
      courier: 'SHALOM'}, {code: '1', frozen: false});
    ok(!('shalomClave' in v), 'el link del cliente nunca la recibe (lista cerrada del servidor)');
    const f = E.leer('formulario.html').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    ok(!/shalomClave/.test(f), 'la página del cliente no la lee en ningún sitio');
    ok(!/shalomClave/.test(E.leer('narrador/narrador.js')), 'ni el narrador');
  }
};
