/**
 * tests/guias.test.js — los avisos del número de guía
 * ====================================================
 * Los dos avisos salieron de mirar los 971 pedidos reales, y las pruebas usan
 * esos mismos casos:
 *   · `939726661` — 9 dígitos, EN TRÁNSITO. Su seguimiento llevaba semanas
 *     sin funcionar y no lo sabía nadie: un número mal escrito no da error,
 *     da silencio.
 *   · `92866322` — la misma guía en dos pedidos de clientes distintos.
 *
 * La regla que se prueba una y otra vez: AVISA, NO IMPIDE. Repetir una guía
 * es algo que el negocio hace a propósito (un retorno a origen reutiliza la
 * misma), así que bloquear rompería la forma de trabajar.
 */
'use strict';
const E = require('./_entorno.js');

/* Un DOM mínimo hecho para esto: el módulo crea su caja de aviso al vuelo y
   hay que poder encontrarla después. */
function domGuias(idInput, valor) {
  const nodos = {};
  const crear = (id) => {
    const n = {
      id: id || '', style: {}, value: '', innerHTML: '', parentNode: null,
      _ev: {},
      appendChild(h) { h.parentNode = this; nodos[h.id] = h; return h; },
      addEventListener(ev, fn) { this._ev[ev] = fn; }
    };
    return n;
  };
  const input = crear(idInput);
  input.value = valor || '';
  const padre = crear('padre');
  input.parentNode = padre;
  nodos[idInput] = input;
  return {
    input,
    caja: () => nodos['avisoGuia_' + idInput] || null,
    doc: {
      getElementById: (id) => nodos[id] || null,
      createElement: () => crear('')
    }
  };
}

function montar(pedidos, idInput, valor) {
  const d = domGuias(idInput || 'fShalomGuia', valor);
  const win = {document: d.doc, S: {shipments: pedidos || []}};
  E.cargar('guias.js', win);
  return {G: win.Guias, d, win};
}

const ped = (id, guia, extra) => Object.assign(
    {id, name: 'Cliente ' + id, status: 'ENVIADO', trackingOrderNumber: guia},
    extra || null);

module.exports = async ({bloque, ok}) => {
  const {G} = montar([]);

  bloque('El formato: 8 dígitos, ni uno más ni uno menos');

  ok(G.LARGO === 8, 'una guía de Shalom mide 8 dígitos (medido: 484 de 487)');
  ok(G.revisar('82037653', '', []).length === 0, 'una guía bien escrita no dice nada');
  ok(G.revisar('', '', []).length === 0,
     'el campo vacío tampoco: la guía es opcional y se pone después');
  ok(G.revisar('   ', '', []).length === 0, 'ni con espacios');

  {
    // El caso real: 9 dígitos, y el pedido estaba EN TRÁNSITO.
    const a = G.revisar('939726661', '', []);
    ok(a.length === 1 && a[0].tipo === 'FORMATO', '939726661 se avisa');
    ok(a[0].texto.indexOf('9') > 0 && a[0].texto.indexOf('8') > 0,
       'y se dice cuántos tiene y cuántos debería: sin eso hay que contarlos a mano');
  }
  ok(G.revisar('8727153', '', [])[0].tipo === 'FORMATO', 'y 8727153, que tiene 7');
  ok(G.revisar('8203765a', '', [])[0].texto.indexOf('números') > 0,
     'una letra colada se dice con sus palabras, no como "formato inválido"');

  bloque('La guía repetida: se avisa, no se impide');

  {
    const lista = [ped('p1', '92866322', {name: 'Ana', status: 'RETORNO A ORIGEN'})];
    const a = G.revisar('92866322', 'p2', lista);
    ok(a.length === 1 && a[0].tipo === 'REPETIDA', 'la guía repetida se detecta');
    ok(a[0].texto.indexOf('Ana') > 0 && a[0].texto.indexOf('RETORNO A ORIGEN') > 0,
       'con el nombre y el estado del otro: es lo que deja decidir en un segundo');
    ok(a[0].pedidos.length === 1, 'y se devuelven los pedidos, no solo el texto');
  }
  {
    const lista = [ped('p1', '92866322')];
    ok(G.revisar('92866322', 'p1', lista).length === 0,
       'un pedido no se avisa a sí mismo al editarlo');
  }
  {
    const lista = [ped('p1', '11111111'), ped('p2', '11111111'),
      ped('p3', '11111111'), ped('p4', '11111111')];
    const a = G.revisar('11111111', 'nuevo', lista);
    ok(a[0].pedidos.length === 4, 'con cuatro repetidos, los encuentra los cuatro');
    ok(a[0].texto.indexOf('y 1 más') > 0,
       'pero solo nombra tres y resume el resto: un párrafo no se lee');
  }
  {
    const lista = [{id: 'p1', name: 'B', status: 'ENVIADO', shalomGuia: '82037653'}];
    ok(G.revisar('82037653', 'x', lista).length === 1,
       'también encuentra los que guardan la guía en el campo viejo shalomGuia');
  }
  {
    const lista = [ped('p1', '939726661', {name: 'Ana'})];
    const a = G.revisar('939726661', 'p2', lista);
    ok(a.length === 2, 'mal escrita Y repetida: se dicen las dos cosas, no solo una');
  }

  bloque('Nada de esto bloquea');

  {
    const a = G.revisar('939726661', '', []);
    ok(a.every((x) => !('bloquea' in x) && !('impide' in x)),
       'un aviso es solo texto: no hay forma de que el módulo impida guardar');
    ok(typeof G.vigilar === 'function' && !G.validar && !G.bloquear,
       'y no expone nada que suene a veto');
  }

  bloque('Lo que se pinta');

  {
    const m = montar([], 'fShalomGuia', '');
    m.G.vigilar('fShalomGuia', '');
    ok(m.d.caja() === null || m.d.caja().style.display === 'none',
       'con el campo vacío no aparece ninguna caja');

    m.d.input.value = '939726661';
    m.d.input._ev.input();
    ok(m.d.caja() && m.d.caja().style.display === 'block', 'al escribir mal, aparece');
    ok(m.d.caja().innerHTML.indexOf('⚠️') >= 0, 'con su señal');

    m.d.input.value = '82037653';
    m.d.input._ev.input();
    ok(m.d.caja().style.display === 'none', 'y al corregirlo, desaparece');
  }
  {
    // El nombre del otro cliente va escapado: un `<` en un nombre no puede
    // escribir HTML dentro del aviso.
    const lista = [ped('p1', '82037653', {name: '<img src=x onerror=alert(1)>'})];
    const m = montar(lista, 'fShalomGuia', '82037653');
    m.G.vigilar('fShalomGuia', 'p2');
    ok(m.d.caja().innerHTML.indexOf('<img') < 0, 'el nombre del otro pedido va escapado');
    ok(m.d.caja().innerHTML.indexOf('&lt;img') > 0, 'se ve como texto, que es lo que es');
  }
  {
    // El oyente se engancha UNA vez. Si `pintar` se quedara con el id del
    // primer pedido, al abrir otro excluiría al equivocado — y avisaría de
    // que la guía está repetida consigo misma.
    const lista = [ped('p1', '82037653'), ped('p2', '82037653')];
    const m = montar(lista, 'fShalomGuia', '82037653');
    m.G.vigilar('fShalomGuia', 'p1');
    m.d.input._ev.input();
    const primero = m.d.caja().innerHTML;
    m.G.vigilar('fShalomGuia', 'p2');
    // Se dispara POR EL OYENTE, no llamando a vigilar otra vez. Ahí está el
    // fallo: vigilar crea un `pintar` nuevo cada vez, pero el oyente se
    // enganchó una sola vez y conserva el PRIMERO. Comprobarlo con la llamada
    // directa lo deja pasar — me pasó, y esta prueba nació de eso.
    m.d.input._ev.input();
    const segundo = m.d.caja().innerHTML;
    ok(primero.indexOf('Cliente p2') > 0, 'editando p1, el otro es p2');
    ok(segundo.indexOf('Cliente p1') > 0,
       'y editando p2, el otro es p1: el oyente no se queda con el primer id');
    ok(segundo.indexOf('Cliente p2') < 0,
       'y sobre todo: p2 no se avisa a sí mismo de estar repetido');
  }
  {
    const m = montar([], 'fShalomGuia', '');
    m.G.vigilar('fShalomGuia', '');
    m.G.vigilar('fShalomGuia', '');
    ok(m.d.input._guiasEnganchado === true,
       'engancharlo dos veces no duplica el oyente: el formulario se abre muchas veces');
  }
  {
    const win = {document: null, S: {shipments: []}};
    E.cargar('guias.js', win);
    let reventó = false;
    try { win.Guias.vigilar('noExiste', ''); } catch (e) { reventó = true; }
    ok(!reventó, 'sin DOM o sin el campo, no revienta: es un aviso, no puede tumbar nada');
  }

  bloque('Está enganchado en los DOS sitios donde se escribe una guía');

  const cfg = E.leer('config.js');
  const trk = E.leer('tracking.js');
  ok(/Guias\.vigilar\('fShalomGuia'/.test(cfg),
     'en el formulario del pedido');
  ok(/Guias\.vigilar\('trkOrdNum'/.test(trk),
     'y en el modal de seguimiento — si solo estuviera en uno, se colaría por el otro');
  ok(E.leer('index.html').indexOf('guias.js?v=') > 0, 'y el archivo se carga');
};
