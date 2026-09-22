/**
 * tests/confirmar.test.js — el diálogo de confirmar no se puede trabar
 * =====================================================================
 * EL FALLO QUE LO ORIGINÓ, y por qué era del tipo peor:
 *
 * Seis pantallas —borrar pedido, borrar varios, borrar proveedor, vaciar
 * papelera, borrar link y borrar etiqueta/courier— escribían A MANO sobre el
 * mismo botón. Cada una tenía que acordarse de dejarlo limpio para las otras
 * cinco. Dos se olvidaron.
 *
 * `openDel` dejaba el botón en "Moviendo…" y DESHABILITADO al terminar bien
 * (solo lo reponía si fallaba). Y el borrado de link no reponía nada. Así que
 * borrabas un pedido y el siguiente borrado de link nacía muerto: el botón
 * decía "Moviendo…" y no respondía.
 *
 * NO FALLABA SIEMPRE. Fallaba según lo que hubieras hecho antes — que es lo
 * peor que puede hacer un fallo, porque parece que se arregló solo.
 */
'use strict';
const E = require('./_entorno.js');

const FUENTE = E.trozo('index.html', 'function confirmar(op){',
    '\nwindow.confirmar = confirmar;');

function montar() {
  const crear = (id) => ({id, textContent: '', innerHTML: '', disabled: false,
    style: {}, onclick: null});
  const nodos = {delMsg: crear('delMsg'), delYes: crear('delYes')};
  const visto = {abiertos: [], cerrados: [], toasts: []};
  const ctx = {
    $: (id) => nodos[id] || null,
    toast: (t) => visto.toasts.push(t),
    openOverlay: (id) => visto.abiertos.push(id),
    closeOverlay: (id) => visto.cerrados.push(id),
    console: {warn: () => {}},
    salida: {}
  };
  const n = Object.keys(ctx);
  // eslint-disable-next-line no-new-func
  new Function(...n, FUENTE + '\nsalida.confirmar = confirmar;')(
      ...n.map((k) => ctx[k]));
  return {confirmar: ctx.salida.confirmar, nodos, visto};
}

module.exports = async ({bloque, ok}) => {

  bloque('Abrir deja el botón listo, venga de donde venga');

  {
    const m = montar();
    m.confirmar({texto: '¿Borrar?', textoSi: 'Sí, borrar', alConfirmar: () => {}});
    ok(m.nodos.delYes.textContent === 'Sí, borrar', 'el texto es el que se pidió');
    ok(m.nodos.delYes.disabled === false, 'y el botón está habilitado');
    ok(m.nodos.delMsg.textContent === '¿Borrar?', 'con su mensaje');
    ok(m.visto.abiertos[0] === 'delOverlay', 'y se abre el diálogo');
  }
  {
    /* ESTE ES EL CASO DEL BUG. Se deja el botón como lo dejaba `openDel`:
       apagado y diciendo "Moviendo…". Abrir tiene que limpiarlo. */
    const m = montar();
    m.nodos.delYes.disabled = true;
    m.nodos.delYes.textContent = 'Moviendo...';
    m.confirmar({texto: 'x', textoSi: 'Sí, eliminar', alConfirmar: () => {}});
    ok(m.nodos.delYes.disabled === false,
       'un botón que quedó apagado se enciende al abrir — el fallo real');
    ok(m.nodos.delYes.textContent === 'Sí, eliminar',
       'y deja de decir "Moviendo…", que era de otra pantalla');
  }
  {
    const m = montar();
    m.confirmar({html: '<b>hola</b>', alConfirmar: () => {}});
    ok(m.nodos.delMsg.innerHTML === '<b>hola</b>', 'acepta mensaje con formato');
    ok(m.nodos.delYes.textContent === 'Sí, eliminar', 'y tiene texto por defecto');
  }

  bloque('Termina bien: se cierra y el botón queda como estaba');

  {
    const m = montar();
    let corrio = 0;
    m.confirmar({texto: 'x', textoSi: 'Borrar', trabajando: 'Borrando...',
      alConfirmar: async () => {
        corrio++;
        ok(m.nodos.delYes.textContent === 'Borrando...',
           'mientras trabaja, el botón lo dice');
        ok(m.nodos.delYes.disabled === true, 'y no se puede pulsar dos veces');
      }});
    await m.nodos.delYes.onclick();
    ok(corrio === 1, 'la acción se ejecutó');
    ok(m.nodos.delYes.textContent === 'Borrar',
       'y al terminar el botón vuelve a su texto — esto es lo que faltaba');
    ok(m.nodos.delYes.disabled === false, 'y se puede volver a usar');
    ok(m.visto.cerrados.indexOf('delOverlay') >= 0, 'el diálogo se cierra');
  }

  bloque('Termina mal: el botón vuelve IGUAL, y el diálogo se queda');

  {
    const m = montar();
    m.confirmar({texto: 'x', textoSi: 'Borrar', trabajando: 'Borrando...',
      siFalla: '❌ No se pudo',
      alConfirmar: async () => { throw new Error('reventó'); }});
    await m.nodos.delYes.onclick();
    ok(m.nodos.delYes.disabled === false,
       'aunque falle, el botón queda usable: si no, el siguiente nace muerto');
    ok(m.nodos.delYes.textContent === 'Borrar', 'y con su texto');
    ok(m.visto.toasts.indexOf('❌ No se pudo') >= 0, 'se avisa con el texto pedido');
    ok(m.visto.cerrados.indexOf('delOverlay') < 0,
       'y el diálogo NO se cierra: el aviso se lee con él delante y se ' +
       'puede reintentar sin volver a buscar el pedido');
  }
  {
    const m = montar();
    m.confirmar({texto: 'x', alConfirmar: () => { throw new Error('x'); }});
    await m.nodos.delYes.onclick();
    ok(m.visto.toasts.length === 1, 'sin texto propio, igual se avisa algo');
  }

  bloque('Dos usos seguidos no se contaminan');

  {
    const m = montar();
    let a = 0; let b = 0;
    m.confirmar({texto: '1', textoSi: 'Uno', alConfirmar: () => { a++; }});
    m.confirmar({texto: '2', textoSi: 'Dos', alConfirmar: () => { b++; }});
    await m.nodos.delYes.onclick();
    ok(b === 1 && a === 0,
       'se ejecuta la acción del SEGUNDO: la del primero no sobrevive');
    ok(m.nodos.delYes.textContent === 'Dos', 'y el texto es el del segundo');
  }

  bloque('Nadie más puede escribir sobre ese botón');

  {
    /* Esto es lo que hace que el fallo no vuelva. El arreglo de arriba lo
       resuelve hoy; esta prueba lo resuelve dentro de seis meses, cuando
       alguien añada una séptima pantalla y la escriba como las de antes. */
    const html = E.leer('index.html');
    const dentroDelAyudante = (html.match(/delYes/g) || []).length;
    ok(dentroDelAyudante === 2,
       'en index.html, "delYes" aparece SOLO dos veces: el botón en el HTML ' +
       'y la línea que lo toma dentro de confirmar()');
    ok(E.leer('config.js').indexOf('delYes') < 0,
       'y en config.js, ninguna: sus tres pantallas pasan por la puerta');
    ok(/window\.confirmar = confirmar;/.test(html),
       'la puerta está expuesta para que config.js la use');
  }
  {
    // Las seis pantallas migradas.
    const todo = E.leer('index.html') + E.leer('config.js');
    const usos = (todo.match(/confirmar\(\{/g) || []).length;
    ok(usos === 6,
       'las seis pantallas que borran algo pasan por la misma puerta');
  }
};
