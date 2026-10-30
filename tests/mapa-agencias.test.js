/**
 * tests/mapa-agencias.test.js — el mapa de sedes
 * ================================================
 * El dueño quiso ver las agencias en un mapa, como en la aplicacion que me
 * enseño. Lo que se prueba aqui es que el mapa NO se convierta en una
 * segunda forma de elegir.
 *
 * ⚠️ UNA PUERTA. Tocar un pin llama a `_agElegir(key, ag)` — la MISMA funcion
 * que tocar una fila (`agSel(key, i)` → `_agElegir`). Dos
 * caminos para elegir agencia serian dos caminos para perder el `ter_id`, y
 * sin ese id el pedido NO SE PUEDE REGISTRAR en Shalom: `POST
 * /account/register` lo exige, y despues solo queda el texto, que es
 * adivinar.
 */
'use strict';
const E = require('./_entorno.js');
const fs = require('fs');
const path = require('path');

module.exports = async ({bloque, ok}) => {
  const form = E.leer('formulario.html');

  bloque('⚠️ El mapa elige por la MISMA puerta que la lista');

  {
    /* Se corta EN `agSel`, no a 3000 caracteres a ojo: pasada esa funcion
       el texto ya es de quien SI debe tocar `_agIdent`, y la prueba se
       pondria roja por leer de mas. Primera version mia, y fallo asi. */
    const i = form.indexOf('async function agMapaPintar');
    const fn = form.slice(i, form.indexOf('function agSel(key, i)', i));
    ok(i > 0 && fn.length > 500, 'existe el pintor del mapa');
    ok(/m\.on\('click', function\(\)\{ _agElegir\(key, g\.ag\); \}\)/.test(fn),
       '⚠️ el pin llama a `_agElegir` con la SEDE (no un índice que cambia al ' +
       'reordenar la lista) — la MISMA puerta que la fila. Un segundo camino ' +
       'para elegir seria un segundo camino para perder el ter_id');
    ok(!/_agIdent\s*=/.test(fn),
       'y el mapa NO toca `_agIdent` por su cuenta: quien identifica la ' +
       'agencia es `_agElegir`, en un solo sitio');
    const sel = form.slice(form.indexOf('function agSel(key, i)'), form.indexOf('function _agElegir(key, ag)'));
    ok(/if\(ag\) _agElegir\(key, ag\);/.test(sel), 'y la fila de la lista entra por la misma puerta');
  }
  {
    // Se pinta con la lista que YA se mostro, no con otra consulta.
    const i = form.indexOf('drop.style.display=\'block\';\n  agMapaPintar(key, lista, {});');
    ok(i > 0,
       'el mapa se pinta justo despues de la lista y con las MISMAS ' +
       'agencias: si enseñaran cosas distintas, el indice de un marcador ' +
       'apuntaria a otra sede');
  }
  {
    /* ★ EL MAPA VA ARRIBA DEL TODO. Estaba entre el buscador y la lista, y
       ahi SEPARABA el buscador de sus propios resultados. El mapa es
       contexto —donde estoy, que hay cerca— y el contexto va antes de los
       controles. */
    const caja = form.slice(form.indexOf('agBox.innerHTML = `<div class="agc-box">'),
        form.indexOf('agPrecargar(agKey);'));
    /* 31/10/2026: arriba la ACCIÓN principal (usar mi ubicación), luego el
       mapa (contexto), y el buscador pegado a su lista. */
    const pt = caja.indexOf('Elige tu sede');
    const pu = caja.indexOf('id="agUbicCaja"');
    const pm = caja.indexOf('id="shalomMapaWrap"');
    const pb = caja.indexOf('id="shalomAgInput"');
    const pl = caja.indexOf('id="shalomDrop"');
    ok(pm > 0 && pt > 0 && pu > 0 && pb > 0 && pl > 0,
       'estan los cinco: titulo, ubicacion, mapa, buscador y lista');
    /* 30/10/2026: los DOS caminos juntos arriba (ubicación y lupa), los
       resultados justo debajo del buscador (con el teclado abierto se ven)
       y el mapa al final, como apoyo. */
    ok(pt < pu && pu < pb && pb < pl && pl < pm,
       '⚠️ en ese orden: «Elige tu sede», usar mi ubicación, buscador, lista, mapa ' +
       '(el buscador sigue pegado a sus resultados)');
  }

  bloque('⚠️ La lista manda: sin mapa se puede pedir igual');

  {
    const i = form.indexOf('function agMapaCargar');
    const fn = form.slice(i, i + 1400);
    ok(/js\.onerror=function\(\)\{ res\(false\); \}/.test(fn),
       'si el CDN no responde se sigue sin mapa, no se revienta');
    ok(/try\{/.test(fn) && /catch\(e\)\{ res\(false\); \}/.test(fn),
       'y cualquier otro fallo tambien acaba en «sin mapa»');
  }
  {
    const i = form.indexOf('async function agMapaPintar');
    const fn = form.slice(i, form.indexOf('function agSel(key, i)', i));
    ok(/if\(!conGeo\.length\)\{ wrap\.style\.display='none'; return; \}/
        .test(fn),
       'sin coordenadas que enseñar, el mapa no aparece — y la lista sigue');
    ok(/if\(!ok \|\| !window\.L\)\{ wrap\.style\.display='none'; return; \}/
        .test(fn),
       'sin Leaflet, tampoco');
    ok(/catch\(e\)\{[\s\S]{0,200}wrap\.style\.display='none';/.test(fn),
       '⚠️ y si el mapa revienta a mitad se esconde: un mapa roto no puede ' +
       'llevarse por delante el formulario de pedidos');
  }
  {
    /* Perezoso: quien pide a domicilio nunca llega a este paso y no tiene
       por que pagar la descarga ni los mosaicos. */
    ok(!/<script[^>]+leaflet/i.test(form),
       '⚠️ Leaflet NO se carga en la pagina: se pide solo cuando se abre el ' +
       'paso de la agencia. Un cliente de delivery no paga por un mapa que ' +
       'no va a ver');
    /* ⚠️ SE MIRAN TODAS LAS URL, NO UNA. Mi primera version buscaba
       «leaflet/1.9.4/» en todo el archivo y daba por buena una mutacion que
       cambiaba el JS a «latest»: la encontraba en la linea del CSS. Una
       prueba que se conforma con UNA coincidencia no comprueba las demas —
       y la mala habria sido justo la otra. */
    const urls = form.match(/libs\/leaflet\/[^/'"]+\//g) || [];
    ok(urls.length >= 2,
       'se cargan el CSS y el JS de Leaflet — ' + urls.length + ' URL');
    const sueltas = urls.filter((u) => !/\/\d+\.\d+\.\d+\//.test(u));
    ok(sueltas.length === 0,
       '⚠️ y TODAS llevan una version exacta, ninguna «latest»: una ' +
       'libreria que cambia sola es un cambio que nadie reviso, y en la ' +
       'pagina por la que entran los pedidos. Sueltas: ' + sueltas.join(' '));
    ok(new Set(urls).size === 1,
       'y es la MISMA en las dos: un CSS de una version con el JS de otra ' +
       'se rompe en silencio, con el mapa a medio pintar — ' +
       [...new Set(urls)].join(' '));
  }

  bloque('Las coordenadas ya estaban: esto no cuesta una llamada');

  {
    const j = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'data', 'agencias-shalom.json'), 'utf8'));
    const L = j.agencias || j.data || j;
    ok(Array.isArray(L) && L.length > 400,
       'el catalogo local tiene ' + L.length + ' sedes');
    const con = L.filter((a) => {
      const la = parseFloat(a.latitud); const lo = parseFloat(a.longitud);
      return isFinite(la) && isFinite(lo);
    });
    ok(con.length > L.length * 0.9,
       con.length + ' de ' + L.length + ' traen latitud y longitud: el mapa ' +
       'sale del JSON que ya se descarga y se cachea 24 h, sin una sola ' +
       'llamada nueva');
    const fuera = con.filter((a) => {
      const la = parseFloat(a.latitud); const lo = parseFloat(a.longitud);
      return la < -19 || la > 0 || lo < -82 || lo > -68;
    });
    ok(fuera.length === 0,
       'y ninguna cae fuera del Peru hoy — pero el filtro se queda igual: ' +
       'un cero o un signo cambiado mandaria el mapa al Atlantico y ' +
       'escorderia todo lo demas');
  }
  {
    const i = form.indexOf('function _agCoords');
    const fn = form.slice(i, i + 600);
    ok(/la<-19\|\|la>0\|\|lo<-82\|\|lo>-68/.test(fn),
       'el filtro del Peru esta puesto en el codigo, no solo en los datos');
    ok(/if\(!isFinite\(la\)\|\|!isFinite\(lo\)\) return null/.test(fn),
       'y una coordenada vacia o rota se descarta, no se dibuja en el 0,0');
  }

  bloque('«cerca de mi»: lo que GANA el cliente, y para los DOS couriers');

  {
    /* El boton decia «Buscando tu ubicacion…». Al cliente no le interesa
       que le localicemos —eso es el medio— sino lo que consigue con ello.
       Un boton que habla de lo que hace el programa en vez de lo que gana
       quien lo pulsa se lee como una pega, y esa pega es pedir permiso de
       ubicacion justo en el paso donde la gente abandona.

       Se EJECUTA la funcion contra un DOM de mentira: lo que se comprueba
       es el texto que acaba en el boton, no el que esta en el fuente. */
    // Desde la constante: el texto vive UNA vez y lo comparten los dos botones.
    const src = form.slice(form.indexOf('var _AG_BUSCANDO'),
        form.indexOf('function _agUbicFallo'));
    const txt = {textContent: ''};
    const btn = {style: {}, disabled: false,
      querySelector: () => txt};
    const M = new Function('document', '$',
        src + ';return _cercaBtnBuscando;')(
        {getElementById: () => btn}, () => null);
    M(true);
    ok(/sedes cerca de ti/i.test(txt.textContent),
       '⚠️ buscando → «Buscando sedes cerca de ti…», no «tu ubicacion»: se ' +
       'dice lo que gana quien pulsa, no lo que hace el programa — salio: ' +
       txt.textContent);
    ok(!/ubicaci/i.test(txt.textContent),
       'y la palabra «ubicacion» ya no sale en el boton');
    M(false);
    ok(txt.textContent === 'Usar mi ubicación', 'y al acabar vuelve a su sitio');
  }
  {
    /* ⚠️ UNO SOLO PARA LOS DOS COURIERS. Si hubiera dos botones o dos
       textos, el dia que se cambie uno el otro se queda atras — y nadie
       mira Olva hasta que un cliente se queja. */
    /* Sin comentarios: dos de ellos CITAN el texto para explicarlo, y
       contar una cita como una copia es confundir hablar con hacer. Me
       paso ya con print.js esta misma semana. */
    const codigo = form.replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');
    const n = (codigo.match(/Buscando sedes cerca de ti/g) || []).length;
    ok(n === 1,
       'el texto esta escrito UNA vez: Shalom y Olva comparten plantilla, ' +
       'boton y funcion — salio ' + n + ' veces');
    const plant = (form.match(/id="shalomCercaBtn"/g) || []).length;
    ok(plant === 1,
       'y el boton tambien es uno — el id dice «shalom» por historia, pero ' +
       'lo pinta la rama compartida de AGENCY_SOURCES');
    ok(/SHALOM:\s*\{[\s\S]{0,400}OLVA:\s*\{/.test(form),
       'y ahi estan los dos couriers con catalogo');
  }
  {
    /* El mapa tambien sirve a los dos: el catalogo de Olva trae las mismas
       columnas de coordenadas. */
    const j = JSON.parse(fs.readFileSync(
        path.join(__dirname, '..', 'data', 'agencias-olva.json'), 'utf8'));
    const L = j.agencias || j.data || j;
    const con = L.filter((a) => isFinite(parseFloat(a.latitud)) &&
        isFinite(parseFloat(a.longitud)));
    ok(con.length > L.length * 0.9,
       'Olva trae coordenadas en ' + con.length + ' de ' + L.length +
       ' sedes: el mapa no es «el mapa de Shalom», es el de quien tenga ' +
       'catalogo');
  }

  bloque('Que el mapa no atrape al cliente dentro');

  {
    const i = form.indexOf('async function agMapaPintar');
    const fn = form.slice(i, form.indexOf('function agSel(key, i)', i));
    ok(/scrollWheelZoom:false/.test(fn),
       '⚠️ sin zoom de rueda: dentro de una pagina que se desplaza, la rueda ' +
       'se come el scroll y el cliente queda atrapado en el mapa');
    ok(/invalidateSize/.test(fn),
       'y se remide al mostrarlo: Leaflet mide mal lo que nace oculto, y ' +
       'sale un mapa gris cortado');
    const alto = (form.match(/\.ag-mapa\{height:(\d+)px/) || [])[1];
    const altoPc = (form.match(/@media\(min-width:700px\)\{\.ag-mapa\{height:(\d+)px\}\}/) || [])[1];
    ok(Number(alto) > 100 && Number(alto) < 300 && Number(altoPc) > 100 && Number(altoPc) < 320,
       'alto fijo y contenido (' + alto + 'px celular, ' + altoPc + 'px PC): un mapa a pantalla ' +
       'completa en el paso 3 de 4 esconde el boton de continuar');
    ok(/dragging:!_tactil/.test(fn), 'en la PC se arrastra con el mouse (en celular, dos dedos)');
    ok(/_mapa\.on\('click focus', function\(\)\{ try\{ _mapa\.scrollWheelZoom\.enable\(\); \}catch\(e\)\{\} \}\);/.test(fn) &&
       /_mapa\.on\('mouseout blur', function\(\)\{ try\{ _mapa\.scrollWheelZoom\.disable\(\); \}catch\(e\)\{\} \}\);/.test(fn),
       'y la rueda hace zoom SOLO tras hacer clic en el mapa; al salir se apaga');
  }
  {
    /* ⚠️ ESTA PRUEBA AFIRMABA LO CONTRARIO, Y ERA MIA.
       El 14/10 escribi que al elegir el mapa debia esconderse: «un mapa de
       sedes debajo de la sede ya elegida invita a tocar algo ya decidido».
       El dueño propuso que se quedara con la elegida marcada, y tiene
       razon — cambia lo que el mapa SIGNIFICA: deja de ser una lista de
       opciones y pasa a ser la confirmacion de adonde va el paquete.
       Y el riesgo que yo temia no lo era: un toque de mas vuelve a pasar
       por `agSel` y simplemente cambia de sede.
       Se invierte a conciencia, no se borra: lo que estaba escrito era una
       decision, y dejarla sin contar seria perder por que cambio. */
    const i = form.indexOf('function agSel(key, i)');
    const fn = form.slice(i, form.indexOf('function agManual', i));
    ok(!/shalomMapaWrap/.test(fn),
       '⚠️ al elegir, el mapa SE QUEDA — con la elegida señalada es una ' +
       'confirmacion, no una invitacion');
    /* 31/10/2026: y al borrar la eleccion TAMBIEN se queda. Antes se
       escondia («no hay nada que confirmar»), pero ahora el mapa es lo que
       ayuda a volver a elegir: tocar tu zona o un pin. */
    const r = form.indexOf('function agReset');
    ok(!/_mw\.style\.display='none'/.test(form.slice(r, r + 900)) && /_agElegidaK = '';/.test(form.slice(r, r + 900)),
       'al borrar la eleccion el mapa se queda (sirve para volver a elegir) y la marca se suelta');
  }

  bloque('⚠️ Al llegar NO se abre el teclado');

  {
    /* El buscador llevaba `data-wz-focus`, asi que el asistente lo enfocaba
       al llegar y Android abria el teclado encima del mapa y de la lista.
       Y la lista dice, dos dedos mas abajo, «👇 Toca tu sede — no hace
       falta escribir»: la pantalla se contradecia a si misma. */
    const caja = form.slice(
        form.indexOf('agBox.innerHTML = `<div class="agc-box">'),
        form.indexOf('agPrecargar(agKey);'));
    ok(caja.indexOf('id="shalomAgInput"') > 0, 'el buscador sigue ahi');
    ok(!/id="shalomAgInput"[^>]*data-wz-focus/.test(caja),
       '⚠️ y YA NO se enfoca solo: aqui hay un mapa y una lista que se ' +
       'tocan, y abrir el teclado los tapa justo cuando se dice «no hace ' +
       'falta escribir»');
  }
  {
    /* Pero SOLO aqui. Donde escribir es lo unico que se puede hacer, el
       teclado ayuda y el foco se queda. */
    const quedan = ['agcManualInput', 'f_ciudad', 'addrManualInput', 'f_dni'];
    quedan.forEach((id) => {
      const i = form.indexOf('id="' + id + '"');
      ok(i > 0 && /data-wz-focus/.test(form.slice(i - 220, i + 260)),
         id + ' SI se sigue enfocando: ahi escribir es lo unico que hay');
    });
  }

  bloque('Donde estoy: un PUNTO, no un pin');

  {
    const i = form.indexOf('async function agMapaPintar');
    const fn = form.slice(i, form.indexOf('function agMapaMarcar', i));
    ok(/_miUbic/.test(fn) && /circleMarker/.test(fn),
       'la posicion del cliente se pinta como circulo, no como marcador');
    ok(/interactive:false/.test(fn),
       '⚠️ y NO se puede tocar: los pines de aqui son sedes que se eligen, ' +
       'y tu posicion no se elige. Un pin ahi invita a elegirse');
    ok(/if\(_miUbic\)\{/.test(fn),
       'solo se pinta si hay ubicacion — NO se pide permiso para dibujar ' +
       'un punto');
  }
  {
    const i = form.indexOf('async function agUbicarme');
    const fn = form.slice(i, form.indexOf('function agCerca(key)', i));
    ok(/_miUbic=\{la:la, lo:lo\}/.test(fn),
       'la ubicacion se guarda donde YA se tenia: se usaba para ordenar por ' +
       'distancia y se tiraba al salir de la funcion');
    ok(fn.indexOf('fetch(') < 0 && fn.indexOf('_api(') < 0,
       '⚠️ y no sale del navegador: esta funcion no la manda a ningun sitio');
  }

  bloque('⚠️ La sede elegida se SEÑALA — el mapa pasa a ser confirmacion');

  {
    /* Ayer hice que el mapa se escondiera al elegir. El dueño propuso lo
       contrario y tiene razon: con la elegida marcada, el mapa deja de ser
       una invitacion y pasa a ser la confirmacion de adonde va el paquete.
       Y un toque de mas no es un problema — vuelve a pasar por `agSel`. */
    const i = form.indexOf('function _agElegir(key, ag)');
    const fn = form.slice(i, form.indexOf('function agManual', i));
    ok(/agMostrar\(key, lista, ''\);/.test(fn),
       'al elegir se repinta la lista (la elegida ARRIBA) y con ella el mapa');
    ok(!/shalomMapaWrap[\s\S]{0,60}display='none'/.test(fn),
       '⚠️ y el mapa YA NO se esconde al elegir: es donde se ve adonde va ' +
       'tu paquete');
  }
  {
    const i = form.indexOf('async function agMapaPintar');
    const fn = form.slice(i, form.indexOf('function agMapaMarcar', i));
    ok(/icon:_agIcono\(sel\), zIndexOffset: sel\?1000:0/.test(fn),
       'la elegida: pin GRANDE y delante de las demás');
    ok(/setView\(elegida\.m\.getLatLng\(\)/.test(fn), 'y el mapa se mueve hasta ella');
    ok(/catch\(e\)\{[\s\S]{0,200}wrap\.style\.display='none';/.test(fn),
       '⚠️ y todo va en try/catch: el mapa NUNCA puede romper la eleccion');
  }
  {
    const i = form.indexOf('function agReset');
    const fn = form.slice(i, i + 900);
    ok(/agMapaDesmarcar\(\)/.test(fn),
       'la ✕ del recuadro desatenua los pines: si no, quedarian apagados ' +
       'sin que nada este elegido');
  }
  {
    /* Tocar una FILA de la lista tambien marca el mapa, porque las dos
       pasan por `agSel` con el mismo indice. Una sola puerta, otra vez. */
    const i = form.indexOf('function _agElegir(key, ag)');
    const fn = form.slice(i, form.indexOf('function agManual', i));
    const marca = fn.indexOf('agMostrar(key, lista');
    const guarda = fn.indexOf('window._agIdent');
    ok(marca > 0 && guarda > 0 && guarda < marca,
       'primero se guarda la eleccion y DESPUES se pinta: si el mapa ' +
       'reventara, la sede ya estaria elegida');
  }
};
