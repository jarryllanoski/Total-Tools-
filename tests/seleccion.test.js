/**
 * La selección de pedidos es de ESTE dispositivo, no del pedido.
 *
 * Antes `sel` era un campo del pedido, y el pedido es la cosa que se
 * sincroniza: desmarcabas algo y cinco segundos después el latido de Firebase
 * te lo devolvía marcado. Peor: `delSelected` leía la selección dos veces —al
 * abrir el aviso y al confirmar— y entre las dos cabía un latido, así que podía
 * desaparecer de la pantalla un pedido que nunca entró a la papelera.
 *
 * Ver docs/INVARIANTES.md § 2 ter.
 */
'use strict';
const E = require('./_entorno.js');

module.exports = (t) => {
  const {ok, bloque} = t;
  const idx = E.leer('index.html');

  function montar(ids) {
    const dom = E.domFalso({ids: ['selAllBtn'], tarjetas: ids});
    const win = {S: {shipments: ids.map((id) => ({id, name: 'Pedido ' + id}))},
      document: dom.doc};
    E.cargar('seleccion.js', win);
    return {Sel: win.Seleccion, win, dom};
  }

  bloque('Lo básico');
  {
    const {Sel, dom} = montar(['a', 'b', 'c', 'd']);
    Sel.alternar('a');
    ok(Sel.tiene('a') && Sel.cantidad() === 1, 'marcar uno');
    ok(dom.tarjetas.a.querySelector('.chk').classList.contains('on'), 'pinta la casilla');
    ok(dom.porId.selAllBtn.classList.contains('sel-on'), 'el botón de todos se pone azul');
    Sel.alternar('a');
    ok(!Sel.tiene('a') && Sel.cantidad() === 0, 'desmarcar');
    ok(!dom.porId.selAllBtn.classList.contains('sel-on'), 'y el botón se apaga');
    Sel.marcar(['a', 'c']);
    ok(Sel.marcados().map((s) => s.id).join() === 'a,c', 'marcados() devuelve los pedidos');
  }

  bloque('El latido ya no revive la selección — el bug original');
  {
    const {Sel, win} = montar(['a', 'b', 'c']);
    Sel.marcar(['a']);
    Sel.alternar('a');
    ok(!Sel.tiene('a'), 'el usuario desmarca');
    // Llega el latido: Firestore devuelve los pedidos, y `a` trae sel:true guardado.
    win.S.shipments = [{id: 'a', name: 'Pedido a', sel: true},
      {id: 'b', name: 'Pedido b'}, {id: 'c', name: 'Pedido c'}];
    Sel._olvidarHeredado();
    ok(!Sel.tiene('a'), 'tras el latido SIGUE desmarcado');
    ok(win.S.shipments[0].sel === undefined, 'y el `sel` heredado se suelta del pedido');
  }

  bloque('Un pedido borrado en otro dispositivo deja de contar solo');
  {
    const {Sel, win} = montar(['a', 'b']);
    Sel.marcar(['a', 'b']);
    win.S.shipments = win.S.shipments.filter((s) => s.id !== 'b');
    ok(Sel.cantidad() === 1 && Sel.ids().join() === 'a', 'un id muerto se limpia solo');
    ok(Sel.marcados().length === 1, 'y no sale en marcados()');
  }

  bloque('La carrera del borrado');
  {
    // Escenario exacto: se congela la lista, llega el latido con un pedido
    // extra marcado, y recién ahí se confirma.
    const {Sel, win} = montar(['a', 'b', 'c', 'd']);
    Sel.marcar(['a', 'b', 'c']);
    const sel = Sel.marcados();                      // ① el aviso dice 3
    const ids = new Set(sel.map((s) => String(s.id))); // ← lo que congela el código
    Sel.marcar(['d']);                               // ② el latido marca `d` de más
    const aBorrar = win.S.shipments.filter((s) => ids.has(String(s.id)));
    win.S.shipments = win.S.shipments.filter((x) => !ids.has(String(x.id)));
    ok(aBorrar.length === 3, 'se borra exactamente lo que decía el aviso: 3');
    ok(win.S.shipments.map((s) => s.id).join() === 'd', '`d` NO desapareció de la pantalla');
    ok(aBorrar.map((s) => s.id).join() === 'a,b,c', 'y no se coló en la papelera');
  }

  bloque('`sel` no puede viajar a Firestore');
  {
    ok(/const \{sel, \.\.\.limpio\} = s;/.test(idx),
        'slimShipment lo quita en la puerta de subida');
    ok(!/\bx\.sel\b/.test(idx) && !/\bs\.sel\b/.test(idx),
        'index.html no lee ni escribe `sel` en el pedido');
    ['print.js', 'config.js', 'voz.js'].forEach((a) => {
      ok(!/\bx\.sel\b/.test(E.leer(a)), a + ' tampoco');
    });
  }

  bloque('El código desplegado congela los ids una sola vez');
  {
    const del = E.trozo('index.html', 'function delSelected', '\n/* PIN */');
    ok(/const ids=new Set\(sel\.map/.test(del), 'delSelected congela los ids');
    ok(!/filter\(x=>!x\.sel\)/.test(del), 'no vuelve a preguntar por el flag al confirmar');
    ok(/aBorrar\.length\} movidos/.test(del), 'el mensaje cuenta lo que de verdad se borró');
  }

  bloque('Marcar no rehace la lista');
  {
    ok(/function toggleSel\(id\)\{ Seleccion\.alternar\(id\); \}/.test(idx),
        'toggleSel ya no llama a saveLocal() ni a render()');
    const sa = E.trozo('index.html', 'function selAll', '\n}')
        .replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    ok(!/render\(\)/.test(sa) && !/saveLocal\(\)/.test(sa), 'selAll tampoco');
  }
};
