/**
 * Qué pedidos se ven, y quién decide repintar.
 *
 * TODOS son los pedidos ACTIVOS: 924 de 1042 están FINALIZADO, y montarlos
 * todos son nueve veces más tarjetas para ver nueve veces menos de lo que
 * importa. La excepción que hace que esto sirva —y la que se prueba con más
 * cuidado— es que BUSCAR BUSCA EN TODO.
 *
 * Ver docs/INVARIANTES.md § 2 quater.
 */
'use strict';
const E = require('./_entorno.js');

module.exports = (t) => {
  const {ok, bloque} = t;
  const html = E.leer('index.html');
  const src = E.trozo('index.html', 'function _soloActivos()', 'function render(){');

  // 1042 pedidos como los tuyos: 924 finalizados, 118 activos.
  const S = {shipments: []};
  for (let i = 0; i < 1042; i++) {
    S.shipments.push({
      id: 'id' + i, name: 'Cliente ' + i, phone: '9' + (70000000 + i),
      dni: '' + (70000000 + i), address: 'AV LIMA ' + i, courier: 'SHALOM', cost: '10',
      status: i < 924 ? 'FINALIZADO'
        : ['NUEVO PEDIDO', 'ENVIADO', 'ALISTADO', 'LLEGÓ A DESTINO'][i % 4]
    });
  }

  let busqueda = '';
  const api = new Function('S', '$', '_adv',
      'let _filt="", _advActive=false;' + src +
      ';return {vis:visibleShipments, set:(f,a)=>{_filt=f;_advActive=a;}};'
  )(S, (id) => (id === 'fSearch' ? {value: busqueda} : null),
      // Los filtros avanzados vacíos: la búsqueda avanzada se activa por el
      // flag, no por tener filtros puestos — que es justo el caso a probar.
      {dateFrom: '', dateTo: '', couriers: [], costMin: '', costMax: '', doc: 'any'});
  const ver = (filtro, texto, avanzada) => {
    busqueda = texto || ''; api.set(filtro || '', !!avanzada); return api.vis();
  };

  bloque('Qué se ve en cada vista');
  {
    let v = ver('', '', false);
    ok(v.length === 118, 'TODOS sin buscar → solo los 118 activos (de 1042)');
    ok(!v.some((x) => x.status === 'FINALIZADO'), 'y ningún finalizado');

    v = ver('', '9700000', false);   // teléfono de un pedido FINALIZADO
    ok(v.length > 0, '★ TODOS + búsqueda → SÍ encuentra');
    ok(v.every((x) => x.status === 'FINALIZADO'),
        '★ y son finalizados: buscar busca en TODO');

    ok(ver('', '', true).some((x) => x.status === 'FINALIZADO'),
        'búsqueda avanzada → también los incluye');
    ok(ver('FINALIZADO', '', false).length === 924, 'el chip FINALIZADO → sus 924');
  }

  bloque('Seleccionar todo sale gratis de la misma regla');
  {
    ok(ver('', '', false).every((x) => x.status !== 'FINALIZADO'),
        '☑️ en TODOS marcaría solo activos');
    ok(ver('FINALIZADO', '', false).length === 924, '☑️ en FINALIZADO marcaría los 924');
  }

  bloque('Se puede llegar a un pedido finalizado');
  {
    ok(ver('', '9' + (70000000 + 5), false).length === 1,
        'el escáner QR lo encuentra (deja el número en la búsqueda)');
    ok(ver('', '9' + (70000000 + 3), false).length === 1,
        'el salto desde la campana, igual');
  }

  bloque('Lo que NO debe cambiar');
  {
    ok(/\$\('sTotal'\)\.textContent=S\.shipments\.length/.test(html),
        'las estadísticas siguen contando los 1042');
    ok(/S\.shipments\.forEach\(x=>\{\s*const g=porEtiqueta/.test(html),
        'el listado de etiquetas cuenta sobre S.shipments, en UNA pasada');
    ok(/function doCSV\(\)\{[^]*?S\.shipments\.map/.test(E.leer('config.js')),
        'el CSV exporta S.shipments, no la vista');
    ok(/const sel = Seleccion\.marcados\(\)/.test(E.leer('print.js')),
        'imprimir usa la selección, no la lista');
  }

  bloque('Desaparecer sin avisar sería peor que el bug');
  {
    const av = E.trozo('index.html', 'function _avisoSaleDeActivos', 'function applyStatus');
    ok(/st==='FINALIZADO' && _soloActivos\(\)/.test(av), 'solo avisa cuando de verdad desaparece');
    ok(/sale de la lista de activos/.test(av), 'y lo dice con palabras');
    ok((html.match(/\+ _avisoSaleDeActivos\(st\)/g) || []).length === 3,
        'en los tres caminos del panel que finalizan');
    ok(/_avisoSaleDeActivos\('FINALIZADO'\)/.test(E.leer('delivery.js')),
        'y también al confirmar una entrega');
  }

  bloque('Una sola puerta para repintar');
  {
    ok(/function render\(\)\{\s*\n\s*if\(_renderPedido\) return;/.test(html),
        'render() coalesce: varias llamadas del mismo tick → una');
    ok(/requestAnimationFrame\(\(\)=>\{ _renderPedido = false; _renderAhora\(\); \}\)/.test(html),
        'y pinta en el siguiente frame');
    const sf = E.trozo('index.html', 'function setFilt(v){', 'function openChipSort');
    ok(/if\(v === _filt\) return;/.test(sf),
        'tocar el chip ya activo no repinta (el doble clic en TODOS costaba dos renders)');
    const cs = E.trozo('index.html', 'function clearSearch()', '/* FILTER CHIPS */');
    ok(/if\(!inp\.value\)\{ inp\.focus\(\); return; \}/.test(cs), 'la lupa con el campo vacío tampoco');
    ok(/clearTimeout\(_buscarTimer\)/.test(cs), 'y cancela el render pendiente del freno');
  }

  bloque('Los ocultos se anuncian');
  {
    ok(/finalizado\$\{_ocultos===1\?'':'s'\} oculto/.test(html), 'se dice cuántos hay');
    ok(/onclick="setFilt\('FINALIZADO'\)"/.test(html), 'y un toque lleva a su chip');
    ok(/Nada pendiente — todo al día/.test(html),
        'con cero activos no dice "sin envíos": dice la verdad');
  }

  bloque('El orden de carga es un contrato, no una casualidad');
  {
    /* El script en línea de index.html llama a `Seleccion._pintarBoton()` en
       cada repintado. Cuando seleccion.js se cargaba al final del body había
       una ventana real —un repintado en el primer frame, antes de que el
       archivo llegara— en la que eso lanzaba ReferenceError y abortaba el
       render entero: cero tarjetas. Pasó en una recarga forzada. */
    const html = E.leer('index.html');
    const posArchivo = html.indexOf('src="seleccion.js');
    let posUso = -1;
    const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
    let m;
    while ((m = re.exec(html))) {
      const i = m[1].indexOf('Seleccion.');
      if (i >= 0) { posUso = m.index + i; break; }
    }
    ok(posArchivo > 0, 'seleccion.js se carga');
    ok(posUso > 0, 'y el script en línea lo usa');
    ok(posArchivo < posUso,
        'se carga ANTES del script en línea que lo llama, no al final del body');
    ok(/if\(window\.Seleccion\)\s*Seleccion\._pintarBoton\(\)/.test(html),
        'y aun así la llamada va con guarda: pintar un botón no puede tumbar el render');
  }
};
