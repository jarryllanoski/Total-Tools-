/**
 * tests/monto-pedido.test.js — cuánto debe un pedido, igual en todas partes
 * ==========================================================================
 * Hasta el 26/10/2026 la tarjeta enseñaba `cost` crudo («S/ 15996.1»,
 * «S/ 33.333333») y nada si no había monto; solo «Editar» sabía tachar lo
 * pagado. Ahora una sola regla (functions/montoPedido.js) para la tarjeta,
 * el aviso de «llegó a destino» y «Editar» — y los pedidos de antes se
 * enseñan exactamente como siempre.
 *
 * Y el aviso de destino: una tira DEBAJO de otra (antes se montaban y solo
 * se leía la primera), con el celular en vez de la guía.
 */
'use strict';
const M = require('../functions/montoPedido.js');
const E = require('./_entorno.js');

/* Un DOM mínimo para las tiras de destino: lo justo que usa tracking.js. */
function domTiras() {
  const todos = [];
  function el(tag) {
    const n = {
      tagName: tag, style: {}, children: [], _oy: {}, attrs: {}, parentNode: null,
      textContent: '', title: '', id: '', className: '',
      classList: {contains: (c) => (' ' + n.className + ' ').indexOf(' ' + c + ' ') >= 0},
      set innerHTML(v) { n._html = v; }, get innerHTML() { return n._html || ''; },
      appendChild: (h) => { if (h.parentNode) h.remove(); h.parentNode = n; n.children.push(h); return h; },
      insertBefore: (h, ref) => {
        if (h.parentNode) h.remove();
        h.parentNode = n; const i = n.children.indexOf(ref);
        n.children.splice(i < 0 ? 0 : i, 0, h); return h;
      },
      get firstChild() { return n.children[0] || null; },
      remove: () => {
        const p = n.parentNode; if (!p) return;
        p.children.splice(p.children.indexOf(n), 1); n.parentNode = null;
      },
      setAttribute: (k, v) => { n.attrs[k] = v; },
      addEventListener: (ev, f) => { n._oy[ev] = f; },
      click: () => n._oy.click && n._oy.click(),
      querySelectorAll: (sel) => {
        const out = [];
        const ok = (x) => sel === '[data-ship]' ? 'data-ship' in x.attrs :
          sel === '.trk-mazo' ? x.className === 'trk-mazo' : false;
        (function rec(x) { x.children.forEach((c) => { if (ok(c)) out.push(c); rec(c); }); })(n);
        return out;
      },
      querySelector: (sel) => {
        const m = /^\[data-ship="(.+)"\]$/.exec(sel);
        return m ? n.querySelectorAll('[data-ship]').find((c) => c.attrs['data-ship'] === m[1]) || null : null;
      },
    };
    todos.push(n);
    return n;
  }
  const body = el('body');
  const stats = el('div'); stats.id = 'statsArea'; body.appendChild(stats);
  const document = {
    createElement: el, body,
    getElementById: (id) => {
      let r = null;
      (function rec(x) { x.children.forEach((c) => { if (!r && c.id === id) r = c; rec(c); }); })(body);
      return r;
    },
  };
  return {document, body};
}

function textoDe(n) {
  return (n.textContent || '') + (n.innerHTML || '') +
    n.children.map(textoDe).join('');
}

module.exports = async ({bloque, ok}) => {

  bloque('La regla: debe · S/ 0.00 · tachado si ya pagó');

  {
    ok(M.de({cost: '45.5', monto: '100', adelanto: '54.5'}).texto === 'S/ 45.50' &&
       M.de({cost: '45.5'}).tipo === 'debe', 'debe: la deuda, con céntimos');
    const p = M.de({monto: '120', adelanto: '120', cost: ''});
    ok(p.tipo === 'pagado' && p.texto === 'S/ 120.00',
       'pagado: el MONTO (no un cero) para tacharlo');
    ok(M.html(p) === '<s>S/ 120.00</s>', 'y se tacha');
    ok(M.de({}).texto === 'S/ 0.00' && M.de({}).tipo === 'sin',
       'sin monto: S/ 0.00');
    ok(M.de({cost: '33.333333'}).texto === 'S/ 33.33', 'redondea los decimales largos');
    ok(M.de({cost: '15996.1'}).texto === 'S/ 15,996.10', 'y pone la coma de miles');
    ok(M.de({cost: '0.005'}).texto === 'S/ 0.01', 'redondeo de verdad, no corte');
    ok(M.de({cost: 'abc'}).tipo === 'sin' && M.de({cost: '-5'}).tipo === 'sin',
       'basura o negativo no es deuda');
    ok(M.de({cost: '1,234.5'}).texto === 'S/ 1,234.50', 'lee la coma de miles');
    ok(M.de({cost: '80'}).tipo === 'debe',
       'pedido de antes del campo `monto`: `cost` sigue siendo lo que debe');
    ok(M.deDatos('100', '30').texto === 'S/ 70.00' &&
       M.deDatos('100', '100').tipo === 'pagado' &&
       M.deDatos('', '').texto === 'S/ 0.00',
       '«Editar» calcula desde monto y adelanto con la misma regla');
    ok(M.deDatos('100', '150').tipo === 'pagado',
       'adelanto mayor que el monto: pagado, nunca deuda negativa');
    ok(M.deDatos('100', '-50').texto === 'S/ 100.00',
       'un adelanto negativo (mal escrito) no infla la deuda');
  }

  bloque('La tarjeta: de hoy en adelante la regla; los de antes, igual que siempre');

  {
    const src = E.trozo('index.html', 'function _montoCard(s){', 'function cardHTML(s){');
    const escH = (t) => String(t).replace(/</g, '&lt;');
    // eslint-disable-next-line no-new-func
    const card = new Function('MontoPedido', 'escH', src + ';return _montoCard;')(M, escH);
    const hoy = '2026-10-26T15:00:00Z';
    ok(/💰 S\/ 0\.00/.test(card({createdAt: hoy})), 'pedido nuevo sin monto: S/ 0.00');
    ok(/<s>S\/ 120\.00<\/s>/.test(card({createdAt: hoy, monto: '120', adelanto: '120', cost: ''})),
       'pedido nuevo pagado: tachado');
    ok(/💰 S\/ 15,996\.10/.test(card({createdAt: hoy, cost: '15996.1'})),
       'pedido nuevo que debe: redondeado');
    ok(card({createdAt: '2026-10-20T10:00:00Z'}) === '',
       '⚠️ pedido ANTIGUO sin monto: nada, como siempre (sin S/ 0.00 nuevo)');
    ok(card({createdAt: '2026-10-20T10:00:00Z', cost: '15996.1'}) ===
       '<span class="meta">💰 S/ 15996.1</span>',
       '⚠️ pedido antiguo que debe: EXACTAMENTE lo de antes');
    ok(card({createdAt: '2026-10-20T10:00:00Z', monto: '50', adelanto: '50', cost: ''}) === '',
       'pedido antiguo pagado: sin tachado que antes no estaba');
    const cardSrc = E.trozo('index.html', 'function cardHTML(s){', 'function dlvDriverBlock');
    ok(/\$\{_montoCard\(s\)\}/.test(cardSrc), 'la tarjeta pinta el monto por aquí');
    ok(/functions\/montoPedido\.js/.test(E.leer('index.html')), 'el panel carga el módulo');
    ok(/MontoPedido\.html\(MontoPedido\.deDatos\(m, a\)\)/.test(E.leer('config.js')),
       '«Editar» usa la misma regla, no su propia copia');
  }

  bloque('Aviso de destino: una debajo de otra, celular en vez de guía');

  {
    const {document} = domTiras();
    const copiados = [];
    const win = {MontoPedido: M, copyPhone: (t) => copiados.push(t)};
    const src = 'function _esc(s){ return String(s||\'\').replace(/&/g,\'&amp;\').replace(/</g,\'&lt;\').replace(/>/g,\'&gt;\'); }' +
      E.trozo('tracking.js', 'function _destinoStack(){', '/* ══════════════════════════════════════════════\n   CSS');
    // eslint-disable-next-line no-new-func
    const api = new Function('document', 'window',
        src + ';return {_tiraDestino, _desplegarMazo, _destinoStack, _quitarTira};',
    )(document, win);

    const hoy = '2026-10-26T15:00:00Z';
    const ships = [
      {id: 'a', name: 'ANA', phone: '935242298', trackingOrderNumber: '101038480',
        createdAt: hoy, cost: '45.5'},
      {id: 'b', name: 'LUIS', phone: '922222222', trackingOrderNumber: '100883517',
        createdAt: hoy, monto: '80', adelanto: '80', cost: ''},
      {id: 'c', name: 'EVA', phone: '@eva.ok', trackingOrderNumber: '100885413',
        createdAt: hoy},
      {id: 'd', name: 'VIEJO', phone: '911111111', trackingOrderNumber: '82037653',
        createdAt: '2026-10-01T10:00:00Z'},
    ];
    api._desplegarMazo(ships);
    const stack = api._destinoStack();
    const tiras = stack.querySelectorAll('[data-ship]');
    ok(tiras.length === 4, 'las cuatro tiras están');
    ok(tiras.every((t) => !t.style.marginTop || t.style.marginTop === ''),
       '⚠️ ninguna se monta sobre la anterior (adiós al -62px)');
    const mazo = stack.querySelectorAll('.trk-mazo')[0];
    ok(/flex-direction:column/.test(mazo.style.cssText) && /gap:8px/.test(mazo.style.cssText),
       'van en columna, con espacio entre ellas');

    const t0 = textoDe(tiras[0]);
    ok(t0.indexOf('935242298') >= 0 && t0.indexOf('101038480') < 0 &&
       !/Guía/.test(t0), 'enseña el celular, no la guía');
    ok(t0.indexOf('📞') < 0 && !/toca|copiar/i.test(t0),
       'el número solo: sin emoji ni «toca para copiar»');
    ok(/S\/ 45\.50/.test(t0), 'y en la misma línea, lo que debe');
    ok(/<s>S\/ 80\.00<\/s>/.test(textoDe(tiras[1])), 'si ya pagó, tachado');
    ok(/S\/ 0\.00/.test(textoDe(tiras[2])), 'si no hay monto, S/ 0.00');
    ok(/@eva\.ok/.test(textoDe(tiras[2])), 'un usuario de WhatsApp se enseña tal cual');
    ok(!/S\//.test(textoDe(tiras[3])),
       'pedido antiguo sin deuda: sin monto, como su tarjeta');

    const tel = (function buscar(n) {
      if (n.className === 'trk-tel') return n;
      for (const c of n.children) { const r = buscar(c); if (r) return r; }
      return null;
    })(tiras[0]);
    tel.click();
    ok(copiados[0] === '935242298', 'tocar el número lo copia');

    const todos = document.getElementById('trkDestinoTodos');
    ok(todos && stack.firstChild === todos, 'con varias tiras, «Cerrar todos» arriba');
    api._quitarTira(tiras[0]);
    ok(stack.querySelectorAll('[data-ship]').length === 3, 'cerrar una quita solo esa');
    todos.click();
    ok(stack.querySelectorAll('[data-ship]').length === 0 &&
       !document.getElementById('trkDestinoTodos'), '«Cerrar todos» las quita todas');
  }
};
