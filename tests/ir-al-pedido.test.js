/**
 * tests/ir-al-pedido.test.js — llevar a un pedido y marcarlo
 * ============================================================
 * «👁 Ver» en las notificaciones, crear un pedido y el escaneo QR usan los
 * tres la misma funcion: `irAlPedido`.
 *
 * ⚠️ EL FALLO DEL 24/10/2026, Y POR QUE LA ASIMETRIA ERA LA PISTA.
 * El dueño lo describio asi: desde OTRA etiqueta funciona; desde TODOS se
 * desplaza pero NO marca. Una sola cosa explica las dos mitades:
 *
 *   irAlPedido hacia `c.classList.add('notify-card-highlight')` sobre el
 *   elemento que encontraba. Pero esta lista se reconstruye ENTERA en cada
 *   repintado (`area.innerHTML = …`).
 *
 *     desde otra etiqueta → la tarjeta NO estaba en pantalla, habia que
 *                           esperar al repintado, y se marcaba el elemento
 *                           DEFINITIVO. Funcionaba.
 *     desde TODOS         → la tarjeta YA estaba (TODOS muestra los
 *                           activos), se marcaba al instante… y el
 *                           repintado que el propio irAlPedido acababa de
 *                           pedir la destruia.
 *
 * Encontrar la tarjeta demasiado pronto era PEOR que no encontrarla. Y el
 * scroll tampoco servia: se desplazaba dentro de TODOS y despues la lista
 * se cambiaba por la de otra etiqueta, asi que la posicion acababa
 * apuntando a cualquier otra tarjeta.
 *
 * El arreglo: la marca es ESTADO y la pinta el repintado; el scroll ocurre
 * DESPUES de escribir la lista definitiva.
 */
'use strict';
const E = require('./_entorno.js');

module.exports = async ({bloque, ok}) => {
  const html = E.leer('index.html');
  const sinCom = html.replace(/\/\*[\s\S]*?\*\//g, '');

  bloque('⚠️ La marca se DIBUJA con la tarjeta, no se pega encima');

  {
    /* El corte NO puede ser `function escH`: esa se define ANTES que
       `cardHTML`, asi que `indexOf` la encontraba arriba y la rebanada
       salia al reves —vacia— y la prueba fallaba sin que nada estuviera
       mal. Se corta por lo que viene DESPUES. */
    const ini = sinCom.indexOf('function cardHTML');
    const card = sinCom.slice(ini, sinCom.indexOf('function escU', ini) > 0
      ? sinCom.indexOf('function escU', ini) : ini + 4000);
    ok(/_pedidoMarcado === s\.id/.test(card),
       'la tarjeta se pinta ya marcada si le toca');
    ok(/class="card\$\{_marcada\}"/.test(card),
       'la clase entra en el HTML de la tarjeta, no despues');
  }
  {
    /* ⚠️ Y NADIE la pega a mano. Si vuelve un `classList.add` sobre una
       tarjeta, vuelve el fallo entero: el siguiente repintado la borra. */
    const sueltos = (sinCom.match(/classList\.add\(['"]notify-card-highlight/g)
      || []).length;
    ok(sueltos === 0,
       '⚠️ ni un `classList.add(\'notify-card-highlight\')` suelto: lo que se ' +
       'pega al DOM lo borra el siguiente repintado, y esta lista se ' +
       'reconstruye entera cada vez. Encontrados: ' + sueltos);
  }
  {
    const i = sinCom.indexOf('let _pedidoMarcado');
    const r = sinCom.indexOf('function _renderAhora');
    const c = sinCom.indexOf('function cardHTML');
    ok(i > 0 && i < r && i < c,
       '⚠️ y el estado se declara ANTES de quienes lo leen: con `let` hay ' +
       'zona muerta temporal, y declararlo abajo funcionaria solo porque ' +
       'nadie pinta durante la carga. Un milagro no es una garantia');
  }

  bloque('⚠️ El scroll, DESPUES de pintar la lista definitiva');

  {
    const iR = sinCom.indexOf('function _renderAhora');
    const ra = sinCom.slice(iR, sinCom.indexOf('function escH', iR));
    const pinta = ra.indexOf('area.innerHTML=');
    const scroll = ra.indexOf('_scrollPendiente');
    ok(pinta > 0 && scroll > pinta,
       '⚠️ se desplaza DESPUES de escribir las tarjetas. Antes se hacia ' +
       'antes, dentro de la lista vieja, y la posicion acababa apuntando a ' +
       'otra tarjeta cuando la lista se reemplazaba');
    ok(/_scrollPendiente = ''/.test(ra),
       'y se consume: un scroll pendiente que no se borra se repetiria en ' +
       'cada repintado, arrastrando la pantalla mientras trabajas');
    /* ⚠️ Y QUE EL DESPLAZAMIENTO OCURRA DE VERDAD. Mi primera version solo
       miraba que la palabra `_scrollPendiente` saliera despues de pintar:
       una mutacion que cambiaba la condicion por `if(false)` dejaba el
       texto en su sitio y SOBREVIVIO. Mirar que una palabra este escrita no
       es mirar que algo pase. */
    ok(/if\(_scrollPendiente\)\{/.test(ra),
       'el bloque esta guardado por `_scrollPendiente`, no por otra cosa');
    const bloque = ra.slice(ra.indexOf('if(_scrollPendiente){'));
    ok(/scrollIntoView/.test(bloque.slice(0, 500)),
       '⚠️ y DENTRO de ese bloque se desplaza de verdad: sin esto, el ' +
       'pedido se marca pero se queda fuera de la pantalla');
  }
  {
    const ir = sinCom.slice(sinCom.indexOf('function irAlPedido'),
        sinCom.indexOf('function _pasteClearToggle'));
    ok(ir.indexOf('requestAnimationFrame') < 0,
       '⚠️ se fueron los reintentos por fotogramas: adivinar cuando habra ' +
       'pintado el navegador es una carrera, y con 1408 pedidos se pierde');
    ok(ir.indexOf('scrollIntoView') < 0,
       'y el scroll ya no vive aqui: lo hace quien pinta, que es el unico ' +
       'que sabe cuando existe la tarjeta');
    ok(ir.indexOf('querySelector') < 0,
       'ni se busca la tarjeta a mano');
  }

  bloque('Lo que irAlPedido SI hace');

  {
    const ir = sinCom.slice(sinCom.indexOf('function irAlPedido'),
        sinCom.indexOf('function _pasteClearToggle'));
    ok(/_pedidoMarcado = id/.test(ir) && /_scrollPendiente = id/.test(ir),
       'apunta la marca y el desplazamiento…');
    ok(/setFilt\(ped\.status\)/.test(ir),
       '…y cambia a la etiqueta del pedido: desplazarse entre las 29 de un ' +
       'estado cae donde debe; entre 1408, nunca caia bien');
    const apunta = ir.indexOf('_pedidoMarcado = id');
    const filtra = ir.indexOf('setFilt(ped.status)');
    ok(apunta > 0 && apunta < filtra,
       '⚠️ y lo apunta ANTES de cambiar de etiqueta: el repintado que ' +
       'dispara `setFilt` es el que tiene que pintar la marca');
  }
  {
    const ir = sinCom.slice(sinCom.indexOf('function irAlPedido'),
        sinCom.indexOf('function _pasteClearToggle'));
    /* ⚠️ EL REPINTADO TIENE QUE ESTAR ENTRE `setFilt` Y EL APAGADO. Mi
       primera version buscaba cualquier `render()` despues de `setFilt`, y
       encontraba el del temporizador que apaga la marca tres segundos
       despues: una mutacion que borraba el repintado inmediato SOBREVIVIO.
       Un `render()` que llega tarde no es el `render()` que hace falta. */
    const filtra = ir.indexOf('setFilt(ped.status)');
    const apaga = ir.indexOf('setTimeout(');
    const medio = ir.slice(filtra, apaga > filtra ? apaga : ir.length);
    ok(apaga > filtra, 'el apagado va al final, como debe');
    ok(/render\(\);/.test(medio),
       '⚠️ y repinta aunque `setFilt` no lo haga. `setFilt` sale sin pintar ' +
       'si la etiqueta YA era esa —el caso de pulsar Ver dos veces— y la ' +
       'marca se quedaria apuntada y sin dibujar');
  }
  {
    const ir = sinCom.slice(sinCom.indexOf('function irAlPedido'),
        sinCom.indexOf('function _pasteClearToggle'));
    ok(/if\(!ped\)\{/.test(ir) && ir.indexOf('return;') > 0,
       'si el pedido ya no esta, se avisa y NO se marca: un id que no ' +
       'existe dejaria el estado encendido para siempre, esperando una ' +
       'tarjeta que no va a pintarse');
    ok(/clearTimeout\(_marcaTimer\)/.test(ir),
       'y pulsar Ver sobre otro pedido cancela el apagado del anterior: si ' +
       'no, el temporizador viejo apagaria la marca nueva a media cuenta');
    ok(/_pedidoMarcado = '';[\s\S]{0,80}render\(\)/.test(ir),
       'la marca se apaga sola, y el apagado tambien es un repintado: entra ' +
       'y sale por el mismo sitio');
  }

  bloque('Los tres caminos usan la misma funcion');

  {
    ok(/window\.irAlPedido\(id\)/.test(E.leer('notify.js')),
       'las notificaciones («👁 Ver») la llaman');
    ok(/irAlPedido\(data\.id\)/.test(E.leer('config.js')),
       'y crear un pedido tambien — ese camino tuvo su propia version, peor, ' +
       'que fallaba cuando el filtro ya estaba en el estado del pedido ' +
       'nuevo. Dos caminos para lo mismo y uno roto; ahora es uno');
  }
};
