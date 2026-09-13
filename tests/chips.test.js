/**
 * Las flechas ‹ › de la fila de etiquetas cambian la ETIQUETA activa, una por
 * toque — no desplazan la fila. La fila se mueve como consecuencia.
 *
 * Antes movían 120 px fijos, un número sin relación con el ancho de ninguna
 * etiqueta (van de ~60 px a ~230 px), así que dejaban medias etiquetas
 * cortadas. Ver docs/ARQUITECTURA.md.
 */
'use strict';
const E = require('./_entorno.js');

module.exports = (t) => {
  const {ok, bloque} = t;
  const html = E.leer('index.html');
  const fp = E.leer('floatpanel.js');
  const src = E.trozo('index.html', 'function _secuenciaFiltros()', 'function openChipSort(label){');

  const ETIQUETAS = ['NUEVO PEDIDO', 'EN PROCESO', 'POR ALISTAR', 'ALISTADO', 'ENVIADO',
    'LLEGÓ A DESTINO', 'PENDIENTE DE PAGO', 'FINALIZADO',
    'RECLAMOS, DEVOLUCIONES, GARANT', 'RETORNO A ORIGEN', 'AVISAR CUANDO LLEGUE'];

  function montar(etiquetas, qrEncendido) {
    const reg = {chips: 0, listas: 0, pendiente: null};
    const api = new Function('allStatuses', 'renderChips', 'render', '_qrMove',
        '_qrMoveClearTimer', 'window', 'setTimeout', 'clearTimeout',
        'let _filt="";' + src +
        ';return {nav:navFiltro, puede:filtroPuedeIr, sec:_secuenciaFiltros,' +
        ' get:()=>_filt, set:(v)=>{_filt=v;}, qr:_qrMove};'
    )(() => etiquetas, () => reg.chips++, () => reg.listas++,
        {on: !!qrEncendido, status: 'ALISTADO'}, () => {},
        {ChipsNav: {actualizarFlechas() {}}},
        (fn) => { reg.pendiente = fn; return 1; }, () => { reg.pendiente = null; });
    api.reg = reg;
    api.soltar = () => { if (reg.pendiente) { reg.pendiente(); reg.pendiente = null; } };
    return api;
  }

  bloque('Una etiqueta por toque');
  {
    const A = montar(ETIQUETAS);
    A.set(''); A.nav(1);
    ok(A.get() === 'NUEVO PEDIDO', 'en TODOS, › → NUEVO PEDIDO');
    const camino = [];
    for (let k = 0; k < 4; k++) { A.nav(1); camino.push(A.get()); }
    ok(camino.join(' → ') === 'EN PROCESO → POR ALISTAR → ALISTADO → ENVIADO',
        '› repetido va en orden');
    A.set('ENVIADO'); A.nav(-1);
    ok(A.get() === 'ALISTADO', 'en ENVIADO, ‹ → ALISTADO (la anterior real)');
  }

  bloque('Los extremos, sin dar la vuelta');
  {
    const A = montar(ETIQUETAS);
    A.set(''); A.nav(-1);
    ok(A.get() === '', 'en TODOS, ‹ no hace nada');
    A.set(ETIQUETAS[ETIQUETAS.length - 1]); A.nav(1);
    ok(A.get() === ETIQUETAS[ETIQUETAS.length - 1], 'en la última, › tampoco');
    A.set('');
    ok(A.puede(-1) === false && A.puede(1) === true, 'en TODOS solo se ve ›');
    A.set(ETIQUETAS[ETIQUETAS.length - 1]);
    ok(A.puede(1) === false && A.puede(-1) === true, 'en la última solo se ve ‹');
  }

  bloque('Tres toques rápidos montan UNA sola lista');
  {
    const B = montar(ETIQUETAS); B.set('');
    B.nav(1); B.nav(1); B.nav(1);
    ok(B.get() === 'POR ALISTAR', 'avanza 3 etiquetas');
    ok(B.reg.chips === 3, 'los chips se repintan en cada toque (respuesta inmediata)');
    ok(B.reg.listas === 0, '★ y la lista todavía no se montó ni una vez');
    B.soltar();
    ok(B.reg.listas === 1, 'al soltar, se monta UNA sola vez');
  }

  bloque('El mundo real');
  {
    const A = montar(ETIQUETAS);
    ok(A.sec()[0] === '', 'TODOS es la primera posición del recorrido');
    ok(A.sec().length === ETIQUETAS.length + 1, 'el recorrido son TODOS + las 11 etiquetas');

    const C = montar(['NUEVO PEDIDO', 'ENVIADO']);
    C.set('ETIQUETA QUE YA NO EXISTE');
    ok(C.puede(1) === true && C.puede(-1) === false,
        'una etiqueta borrada en Config cuenta como TODOS');
    C.nav(1);
    ok(C.get() === 'NUEVO PEDIDO', 'y avanzar desde ahí no se rompe');

    const D = montar(['NUEVO PEDIDO', 'ENVIADO', 'NUEVA']);
    D.set('ENVIADO'); D.nav(1);
    ok(D.get() === 'NUEVA', 'una etiqueta nueva entra en el recorrido sola');

    const F = montar([]); F.set('');
    ok(F.puede(1) === false && F.puede(-1) === false, 'sin etiquetas, ninguna flecha');

    const G = montar(ETIQUETAS, true); G.nav(1);
    ok(G.qr.on === false, 'cambiar de etiqueta apaga el modo QR, igual que setFilt');
  }

  bloque('El código desplegado');
  {
    ok(/window\.navFiltro\(dir\)/.test(fp), 'las flechas llaman a navFiltro');
    ok(/puede\(-1\) \? 'flex' : 'none'/.test(fp),
        'se ocultan según haya etiqueta, no según el scroll');
    ok(!/_destinoDesde/.test(fp) && !/scrollLeft -= 120/.test(fp),
        'el cálculo por píxeles quedó borrado — sin código muerto');
    ok(/nav\.id = 'chipsNav'/.test(fp), 'las flechas van sobre el carrusel, no tapan TODOS');
    ok(/if\(document\.getElementById\('chipsNav'\)\) return;/.test(fp),
        'guarda contra flechas duplicadas');
    ok(/new MutationObserver/.test(fp), 'se re-evalúan al cambiar las etiquetas');
    ok(/prefers-reduced-motion/.test(fp), 'respeta prefers-reduced-motion');
    ok(/if\(window\.ChipsNav\) window\.ChipsNav\.verActivo\(\);/.test(html),
        'renderChips trae el chip activo a la vista');
    const css = E.leer('panel.css');
    ok(/scroll-snap-type:x proximity/.test(css) && !/x mandatory/.test(css),
        'scroll snap en proximity — mandatory atraparía la etiqueta más ancha que la pantalla');
  }
};
