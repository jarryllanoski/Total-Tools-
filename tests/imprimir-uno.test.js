/**
 * tests/imprimir-uno.test.js — la 🖨️ de cada tarjeta
 * ===================================================
 * Desde el 26/10/2026 cada tarjeta tiene su impresora: imprime SOLO ese
 * pedido (el panel de impresión de siempre, vía PrintModule.openOne) y se
 * pinta de azul cuando ya se imprimió. «✨ Nuevos» se retiró del panel de
 * impresión.
 *
 * ⚠️ Y una sola respuesta a «¿se imprimió?». La campana miraba `_printed`,
 * que dependía del aviso `afterprint` de la pestaña del panel — pero la
 * etiqueta se imprime en OTRA pestaña, así que casi nunca llegaba, y la
 * campana ofrecía «Imprimir» de pedidos ya impresos.
 */
'use strict';
const E = require('./_entorno.js');

/* print.js entero, contra un navegador de mentira. */
function cargarPrint(S, seleccion) {
  const nodos = {};
  const nodo = (id) => ({id, style: {}, innerHTML: '', textContent: '',
    querySelector: () => null, appendChild: () => {}});
  const document = {
    readyState: 'complete',
    getElementById: (id) => nodos[id] || (nodos[id] = nodo(id)),
    createElement: () => nodo(''),
    body: {appendChild: () => {}},
    addEventListener: () => {},
  };
  const llam = {save: [], render: 0, check: 0, abiertas: 0};
  const win = {
    S, DniPedido: require('../functions/dniPedido.js'),
    NroComprobante: require('../functions/nroComprobante.js'),
    save: (ids) => llam.save.push(ids),
    render: () => { llam.render++; },
    NotifyModule: {check: () => { llam.check++; }},
    toast: () => {},
    open: () => { llam.abiertas++; return {}; },
  };
  const ls = {getItem: () => null, setItem: () => {}};
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', 'Seleccion', 'localStorage',
      'requestAnimationFrame', 'setTimeout', 'Blob', 'URL', 'toast',
      'DniPedido', 'NroComprobante', E.leer('print.js'),
  )(win, document, {marcados: () => seleccion || []}, ls, () => {},
      () => {}, function() {}, {createObjectURL: () => 'blob:x',
        revokeObjectURL: () => {}}, () => {}, win.DniPedido, win.NroComprobante);
  return {PM: win.PrintModule, nodos, llam};
}

module.exports = async ({bloque, ok}) => {

  bloque('«¿Se imprimió?» tiene UNA respuesta');

  {
    const {PM} = cargarPrint({shipments: []});
    ok(PM.impreso({printed: true}) === true, '`printed` (lo que guarda el panel de impresión)');
    ok(PM.impreso({_printed: true}) === true,
       'y `_printed`, para los que la campana ya marcó');
    ok(PM.impreso({}) === false && PM.impreso(null) === false, 'sin marca, no');
    const nt = E.leer('notify.js');
    ok(/_impreso\(s\) && !existing\.printed/.test(nt) && /printed: _impreso\(s\)/.test(nt),
       '⚠️ la campana pregunta lo mismo: deja de ofrecer «Imprimir» de algo impreso');
    ok(!/s\._printed && !existing/.test(nt), 'y ya no mira solo `_printed`');
  }

  bloque('La 🖨️ de la tarjeta');

  {
    const src = E.trozo('index.html', 'function _btnImprimir(s){', 'function cardHTML(s){');
    const {PM} = cargarPrint({shipments: []});
    // eslint-disable-next-line no-new-func
    const btn = new Function('window', 'PrintModule', src + ';return _btnImprimir;')(
        {PrintModule: PM}, PM);
    const sin = btn({id: 'id_9', printed: false});
    ok(/class="wa-btn prn-btn"/.test(sin), 'sin imprimir: sin color');
    ok(/class="wa-btn prn-btn on"/.test(btn({id: 'id_9', printed: true})),
       'impreso: círculo azul');
    ok(/prn-btn on/.test(btn({id: 'id_9', _printed: true})),
       'también si lo marcó la campana');
    ok(/PrintModule\.openOne\('id_9'\)/.test(sin) && /event\.stopPropagation\(\)/.test(sin),
       'imprime SOLO ese pedido, con el panel de impresión de siempre');
    ok(/🖨️/.test(sin), 'con la impresora');

    const card = E.trozo('index.html', 'function cardHTML(s){', 'function dlvDriverBlock');
    const iBtn = card.indexOf('${_btnImprimir(s)}');
    ok(iBtn > card.indexOf('class="cname"') && iBtn < card.indexOf('title="Cotización"'),
       'entre el nombre y el 🧾');
    const css = E.leer('panel.css');
    ok(/\.prn-btn\.on\{background:var\(--blue\)/.test(css), 'azul relleno al imprimir');
    ok(/\.prn-btn\{[^}]*grayscale/.test(css), 'gris sin imprimir');
  }

  bloque('Imprimir uno marca SOLO ese, lo guarda y repinta al instante');

  {
    const S = {config: {name: 'TT'}, shipments: [
      {id: 'a', name: 'ANA', phone: '911111111', status: 'NUEVO PEDIDO'},
      {id: 'b', name: 'LUIS', phone: '922222222', status: 'NUEVO PEDIDO'},
    ]};
    const {PM, llam} = cargarPrint(S);
    PM.openOne('a');
    PM.print();
    ok(S.shipments[0].printed === true && !S.shipments[1].printed,
       'se marca el pedido impreso, y solo ese');
    ok(llam.save.length === 1 && llam.save[0].join() === 'a',
       'se guarda SOLO ese pedido, no los 1500');
    ok(llam.render === 1, 'la tarjeta se repinta al momento (pasa a azul)');
    ok(llam.check === 1, 'y la campana se entera');
    ok(llam.abiertas === 1, 'se abre la etiqueta para imprimir');
  }

  bloque('«✨ Nuevos» ya no está en el panel de impresión');

  {
    const S = {config: {}, shipments: [
      {id: 'a', name: 'ANA', status: 'NUEVO PEDIDO'},
      {id: 'b', name: 'LUIS', status: 'ENVIADO'},
    ]};
    let r = cargarPrint(S, []);
    r.PM.open();
    const fila = r.nodos.printScopeRow.innerHTML;
    ok(!/Nuevos/.test(fila) && !/scope_new/.test(fila), 'sin la opción «Nuevos»');
    ok(/Todos · 2/.test(fila), 'sin selección queda «Todos», como cuando no había nuevos');

    r = cargarPrint(S, [S.shipments[1]]);
    r.PM.open();
    const fila2 = r.nodos.printScopeRow.innerHTML;
    ok(/Seleccionados · 1/.test(fila2) && !/Nuevos/.test(fila2),
       'con selección, «Seleccionados» como siempre');
    r.PM.print();
    ok(S.shipments[1].printed === true && !S.shipments[0].printed,
       'e imprime lo seleccionado, no los nuevos');
    ok(!/'new'/.test(E.leer('print.js')), 'el scope «new» no queda en el código');
  }
};
