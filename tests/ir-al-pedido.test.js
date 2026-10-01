/**
 * tests/ir-al-pedido.test.js — "llévame a ese pedido y resáltalo"
 * ================================================================
 * EL FALLO QUE ESTO CIERRA, visto en produccion el 30 sep 2026:
 * al guardar un pedido nuevo, el panel no saltaba a el ni lo resaltaba.
 *
 * La causa, y es fina. `config.js` hacia:
 *
 *     setFilt(data.status);        // esperando que repinte
 *     _highlightCard(data.id);     // y busca la tarjeta en el DOM
 *
 * Pero `setFilt` tiene una optimizacion legitima:
 *
 *     if (v === _filt) return;     // tocar el chip activo no reconstruye nada
 *
 * Si el filtro YA estaba en "NUEVO PEDIDO" —el caso normal despues de crear
 * un par de pedidos seguidos— `setFilt` se salia por ahi y NO REPINTABA. La
 * tarjeta nueva no llegaba al DOM, `querySelector` devolvia null, y
 * `_highlightCard` hacia `if(!c) return;`: se callaba. Ni scroll, ni
 * resaltado, ni tarjeta en la lista.
 *
 * El error de fondo NO es ese `return`. Es que el camino de creacion
 * dependia de un EFECTO SECUNDARIO de `setFilt` en vez de pedir el
 * repintado que necesitaba. `notify.js` ya lo hacia bien desde hace meses
 * —limpia busqueda, llama a `clearAdvSearch()` que repinta siempre, y recien
 * entonces busca la tarjeta—, asi que ahora esa logica vive en UN solo sitio
 * y la usan los dos.
 */
'use strict';
const E = require('./_entorno.js');

/* Quita comentarios para poder preguntar por el CODIGO y no por el texto.
   Sin esto, un comentario que explica "antes esto llamaba a X" hace fallar
   una prueba que busca llamadas a X — y obliga a borrar justo la
   explicacion que hace falta para entender el arreglo. */
function sinComentarios(src) {
  return String(src).replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1');
}

/** Monta `irAlPedido` tal como esta en index.html, con el mundo de mentira. */
function montar(opciones) {
  const o = opciones || {};
  const dom = E.domFalso({tarjetas: o.tarjetas || []});
  const visto = {render: 0, limpiarAvanzados: 0, filtros: [], avisos: [],
    toasts: [], scrolls: [], resaltadas: []};

  Object.keys(dom.tarjetas).forEach((id) => {
    dom.tarjetas[id].scrollIntoView = () => { visto.scrollos = true;
      visto.scrolls.push(id); };
    const cl = dom.tarjetas[id].classList;
    const addReal = cl.add;
    cl.add = (c) => { visto.resaltadas.push(id); return addReal(c); };
  });

  const win = {S: {shipments: o.pedidos || []}};
  const codigo = E.trozo('index.html', 'function irAlPedido(',
      '/* fin irAlPedido */');

  // setFilt con LA MISMA optimizacion que el de verdad: si el filtro ya es
  // ese, no repinta. Es el escenario exacto del fallo.
  let filtActual = o.filtroActual || '';
  const setFilt = (v) => {
    visto.filtros.push(v);
    if (v === filtActual) return;
    filtActual = v;
    visto.render++;
  };
  const clearAdvSearch = () => { visto.limpiarAvanzados++; visto.render++; };
  const render = () => { visto.render++; };

  // eslint-disable-next-line no-new-func
  const fn = new Function('window', 'document', 'requestAnimationFrame',
      'setTimeout', 'setFilt', 'clearAdvSearch', 'render', 'toast', 'console',
      'S', codigo + '\n; return irAlPedido;')(
      win, dom.doc, (cb) => cb(), () => 0, setFilt, clearAdvSearch, render,
      (t) => visto.toasts.push(t), {warn: (...a) => visto.avisos.push(
          a.join(' ')), log: () => {}}, win.S);

  return {fn, visto, dom};
}

module.exports = async ({bloque, ok}) => {

  bloque('EL FALLO: crear con el filtro ya puesto en ese estado');

  {
    /* El escenario exacto de produccion: el filtro YA esta en "NUEVO PEDIDO"
       y se crea un pedido "NUEVO PEDIDO". `setFilt` no repinta. */
    const m = montar({
      tarjetas: ['id_999'],
      pedidos: [{id: 'id_999', status: 'NUEVO PEDIDO'}],
      filtroActual: 'NUEVO PEDIDO'
    });
    m.fn('id_999');

    ok(m.visto.render >= 1,
       'SE REPINTA AUNQUE `setFilt` no haga nada — era justo lo que faltaba');
    ok(m.visto.scrolls.indexOf('id_999') >= 0,
       'y la tarjeta recibe el scroll: el panel te lleva a ella');
    ok(m.visto.resaltadas.indexOf('id_999') >= 0,
       'y queda resaltada');
  }

  {
    /* Y con el filtro en otro estado sigue funcionando como siempre. */
    const m = montar({
      tarjetas: ['id_999'],
      pedidos: [{id: 'id_999', status: 'NUEVO PEDIDO'}],
      filtroActual: 'TODOS'
    });
    m.fn('id_999');
    ok(m.visto.filtros.indexOf('NUEVO PEDIDO') >= 0,
       'lleva a la etiqueta del pedido');
    ok(m.visto.scrolls.indexOf('id_999') >= 0,
       'y tambien hace scroll — no se arregla un caso rompiendo el otro');
  }

  bloque('Se destraba lo que pudiera esconderlo');

  {
    /* Razon escrita en notify.js: "antes podia quedar oculto por una
       busqueda activa". Un pedido recien creado que no aparece porque hay
       texto en el buscador es el mismo fallo con otra cara. */
    const m = montar({
      tarjetas: ['id_999'],
      pedidos: [{id: 'id_999', status: 'NUEVO PEDIDO'}],
      filtroActual: 'NUEVO PEDIDO'
    });
    m.dom.porId.fSearch = m.dom.nodo('fSearch');
    m.dom.porId.fSearch.value = 'algo escrito';
    m.fn('id_999');
    ok(m.dom.porId.fSearch.value === '',
       'la busqueda se limpia: si no, el pedido nuevo puede quedar escondido');
    ok(m.visto.limpiarAvanzados === 1,
       'y los filtros avanzados tambien');
  }

  bloque('NO SE CALLA cuando no encuentra la tarjeta');

  {
    /* El fallo original era invisible: `if(!c) return;` y a otra cosa.
       Ahora, si no aparece, se dice — y se dice CUAL de los dos problemas
       es, porque tienen arreglos distintos. */
    const m = montar({
      tarjetas: [],
      pedidos: [{id: 'id_999', status: 'NUEVO PEDIDO'}],
      filtroActual: 'NUEVO PEDIDO'
    });
    m.fn('id_999');
    ok(m.visto.avisos.length > 0,
       'avisa en consola en vez de callarse');
    ok(/id_999/.test(m.visto.avisos.join(' ')),
       'y dice de QUE pedido habla');
    ok(/existe|filtro|repint/i.test(m.visto.avisos.join(' ')),
       'y que el pedido SI existe, asi que es cosa del filtro o del repintado');
    ok(m.visto.toasts.length > 0,
       'y se ve en pantalla: un aviso que solo vive en la consola no existe');
  }

  {
    const m = montar({tarjetas: [], pedidos: [], filtroActual: ''});
    m.fn('id_fantasma');
    ok(/no esta|no está/i.test(m.visto.avisos.join(' ')),
       'y si el pedido ni siquiera existe, lo dice distinto: otro problema, ' +
       'otro arreglo');
  }

  bloque('UNA sola puerta: los dos caminos usan la misma');

  {
    /* Habia DOS caminos para lo mismo y uno estaba mal. El de notify.js
       llevaba meses bien. Si vuelven a ser dos, el que no se use a diario se
       pudre sin que nadie lo note. */
    ok(/irAlPedido\(/.test(E.leer('config.js')),
       'config.js (crear un pedido) usa la puerta unica');
    /* DE COMPORTAMIENTO, no de texto. Mi primera version comprobaba que la
       palabra `irAlPedido` apareciera en notify.js — y `if(false)
       window.irAlPedido(id)` la deja aparecer igual. La mutacion sobrevivio.
       Es la tercera vez hoy que me pasa lo mismo: un nombre en el fuente no
       prueba que se llame. Se extrae la funcion REAL y se corre. */
    const cuerpo = E.trozo('notify.js', 'function _verShipment(',
        '/* ── IMPRIMIR');
    let pedido = null;
    const winFalso = {irAlPedido: (id) => { pedido = id; },
      render: () => {}, S: {shipments: []}};
    // eslint-disable-next-line no-new-func
    const correrVer = new Function('window', '_closePanel',
        cuerpo + '\n; return _verShipment;')(winFalso, () => {});
    correrVer('id_777');
    ok(pedido === 'id_777',
       'el boton Ver LLAMA de verdad a la puerta unica — salio: ' + pedido);

    /* El camino viejo tiene que estar MUERTO, no solo sin usar. Codigo
       muerto que sigue existiendo lo acaba llamando alguien.
       Y se comprueba que no se LLAME, no que no se NOMBRE: los comentarios
       que explican por que se quito mencionan el nombre a proposito, y una
       prueba que confunda las dos cosas obliga a borrar justo la
       explicacion que hace falta. Ya me paso hoy, dos veces. */
    ok(!/function _highlightCard/.test(E.leer('index.html')),
       'la funcion vieja ya no existe: codigo muerto acaba llamandose');
    ok(!/_highlightCard\s*\(/.test(sinComentarios(E.leer('config.js'))),
       'y config.js no la llama (mirando el CODIGO, no los comentarios)');

    const nj = E.leer('notify.js');
    const ver = nj.slice(nj.indexOf('function _verShipment'),
        nj.indexOf('function _verShipment') + 1400);
    ok(!/querySelector\('\.card/.test(ver) && !/querySelector\("\.card/.test(ver),
       'notify.js ya no busca la tarjeta por su cuenta: delega');
  }
};
