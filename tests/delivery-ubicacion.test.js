/**
 * tests/delivery-ubicacion.test.js — Delivery con la arquitectura de las sedes
 * ===========================================================================
 * 30/10/2026. Delivery usa la MISMA tubería de ubicación que Shalom y Olva
 * (botón nativo + el de siempre, mensajes por causa, reintento) y añade un
 * mapa para VER y CORREGIR el punto. El WhatsApp lleva la puerta en un
 * enlace oficial de Google Maps, sacado de gpsCoords (una sola verdad).
 */
'use strict';
const E = require('./_entorno.js');
const vm = require('vm');

module.exports = async ({bloque, ok}) => {
  const form = E.leer('formulario.html');

  /* El código que se despliega, cortado del formulario. */
  const trozo = (desde, hasta) => form.slice(form.indexOf(desde), form.indexOf(hasta, form.indexOf(desde)));
  const ctx = vm.createContext({});
  vm.runInContext(trozo('var EnlaceMapa = {', '\n};\n') + '\n};\nthis.M=EnlaceMapa;', ctx);
  const M = ctx.M;

  bloque('El enlace de mapa: UNA forma, la oficial de Google Maps');

  {
    ok(M.de('-11.861234,-77.074567') === 'https://www.google.com/maps/search/?api=1&query=-11.861234%2C-77.074567',
       'formato oficial (api=1) con la coma codificada (%2C)');
    ok(M.de('-11.8612345678,-77.07') === 'https://www.google.com/maps/search/?api=1&query=-11.861235%2C-77.070000',
       '6 decimales (≈10 cm), siempre iguales');
    ok(M.de('') === '' && M.de(null) === '' && M.de(undefined) === '', 'sin ubicación → sin enlace');
    ok(M.de('abc,def') === '' && M.de('-12') === '' && M.de(',') === '' && M.de('-12,-77,1') === '', 'basura → sin enlace');
    ok(M.de('40.4,-3.7') === '' && M.de('0,0') === '', 'fuera del Perú → sin enlace');
    ok(!/maps\.google\.com\/\?q=/.test(form) && (form.match(/google\.com\/maps\/search/g) || []).length === 1,
       'el formato de enlace existe UNA vez (el viejo ya no está)');
  }

  bloque('El WhatsApp lleva la puerta, tocable (solo delivery con punto)');

  {
    const src = trozo('function _construirWaMsg(', 'function _construirWaHref(');
    const correr = (tipo, gps) => {
      const c = vm.createContext({EnlaceMapa: M, CFG: {config: {name: 'TT'}}, selCourierType: tipo, selDateLbl: '',
        location: {origin: 'https://x', pathname: '/f'}});
      vm.runInContext(src + ';this.F=_construirWaMsg;', c);
      return c.F({name: 'ANA', phone: '9', address: 'Av. Los Álamos 123', referencia: 'frente al mercado',
        courier: tipo === 'delivery' ? 'DELIVERY' : 'SHALOM', date: '', gpsCoords: gps, dni: '1'}, 'AB12', 't1_x');
    };
    const conPunto = correr('delivery', '-11.861234,-77.074567');
    ok(conPunto.indexOf('🗺️ *Ubicación exacta:* https://www.google.com/maps/search/?api=1&query=-11.861234%2C-77.074567') > 0,
       'delivery con punto: «🗺️ Ubicación exacta» con el enlace');
    ok(conPunto.indexOf('🗺️') > conPunto.indexOf('*Referencia:*') && conPunto.indexOf('🗺️') < conPunto.indexOf('*DNI'),
       'justo debajo de la dirección y la referencia');
    ok(correr('delivery', null).indexOf('Ubicación exacta') < 0, 'sin punto: el mensaje de siempre');
    ok(correr('agencia', '-11.861234,-77.074567').indexOf('Ubicación exacta') < 0, 'en sedes no va (la dirección es la de la agencia)');
    ok(/EnlaceMapa\.de\(order\.gpsCoords\)/.test(src), '⚠️ sale de order.gpsCoords: lo MISMO que guarda el pedido');
  }

  bloque('Delivery usa la MISMA tubería de ubicación que las sedes');

  {
    const t = form.slice(form.indexOf('<geolocation id="dlvGeoNativo"'), form.indexOf('</geolocation>', form.indexOf('<geolocation id="dlvGeoNativo"')));
    ok(/accuracymode="precise"/.test(t) && /id="addrGpsBtn"/.test(t), 'botón nativo con precisión fina, y el de siempre dentro');
    const c = trozo('function _dlvConectar(', 'function _dlvExito(');
    ok(/_ubicNativo\(g, \{/.test(c) && /invalido: function\(\)\{ usarMiUbicacion\(\); \}/.test(c), 'conectado a _ubicNativo (compartido)');
    ok(/if\(!g \|\| g\._conectado\) return;/.test(c), 'se conecta UNA vez');
    const er = trozo('function _dlvError(', 'function _dlvPunto(');
    ok(/_ubicCasoDe\(codigo, estado\|\|''\)/.test(er) && /_ubicMensaje\(caso, '<a role="button" onclick="dlvAjustar\(\)">marca tu casa en el mapa<\/a>'/.test(er),
       'mismos mensajes por causa; la alternativa es marcar en el mapa');
    ok(/_ubicTrasFallo\(caso, function\(\)\{ if\(selCourierType==='delivery'/.test(er), 'y el mismo reintento al arreglarlo');
    const ex = trozo('function _dlvExito(', 'function _dlvError(');
    ok(/if\(acc>100\) dlvAjustar\(\{aviso:acc\}\);/.test(ex), '⚠️ precisión mala (>100 m): se abre el ajuste');
    ok(/if\(!AgLista\.coords\(/.test(ex), 'fuera del Perú no se usa');
  }

  bloque('Los datos: dirección escrita y punto, cada uno en su sitio');

  {
    const pt = trozo('function _dlvPunto(', 'function quitarPin(');
    ok(/_gpsLat=\+Number\(la\)\.toFixed\(6\); _gpsLon=\+Number\(lo\)\.toFixed\(6\);/.test(pt), 'UNA función pone el punto (GPS o ajuste)');
    // _dirDeNominatim ejecutada
    const c2 = vm.createContext({});
    vm.runInContext(trozo('function _dirDeNominatim(', 'function _dlvSugerirDireccion(') + ';this.D=_dirDeNominatim;', c2);
    const D = c2.D;
    const barrio = D({address: {suburb: 'Zapallal', city: 'Puente Piedra'}});
    ok(barrio.calle === '' && barrio.zona === 'Zapallal, Puente Piedra', 'solo barrio: sin calle (no parece una dirección)');
    const calle = D({address: {road: 'Avenida Primavera', suburb: 'Zapallal', city: 'Puente Piedra'}});
    ok(calle.calle === 'Avenida Primavera' && calle.numero === false, 'calle sin número');
    ok(D({address: {road: 'Av. Los Álamos', house_number: '123'}}).numero === true, 'calle con número');
    ok(D(null).calle === '' && D({}).zona === '', 'respuesta vacía no revienta');
    const sg = trozo('function _dlvSugerirDireccion(', '/* ── EL mapa de delivery');
    ok(/if\(ta\.value\.trim\(\) \|\| !x\.calle\) return;/.test(sg),
       '⚠️ solo escribe si el cuadro está vacío Y hay calle: un barrio suelto no se escribe como dirección');
    ok(/ta\.placeholder=_DLV_PLACEHOLDER\+\(x\.zona\?' · cerca de '\+x\.zona:''\)/.test(sg), 'el barrio queda como pista en el placeholder');
    ok(/_dlvPista\(!x\.numero\);/.test(sg) && /✏️ Agrega el número, Mz\/Lt o dpto\./.test(form), 'calle sin número: pide el número');
    ok(/if\(_gpsLat!==la \|\| _gpsLon!==lo\) return;/.test(sg), 'una respuesta de otro punto se descarta');
    ok(/if\(_dlvGeoMemo\[k\]\)\{ usar\(_dlvGeoMemo\[k\]\); return; \}/.test(sg), 'UNA consulta por punto (recordada)');
    ok(/ta\.addEventListener\('input', function\(\)\{ _dlvPista\(false\); \}\);/.test(form), 'al escribir el cliente, la pista se va');
    ok(!/addrPinChip/.test(form) && !/function _pinChip/.test(form), 'sin chip duplicado: el punto se ve en el mapa');
  }

  bloque('UN mapa, dos modos: MIRAR no mueve el punto; AJUSTAR solo con su botón');

  {
    ok(/<div id="dlvPrev" class="dlv-prev" style="display:none"><\/div>/.test(form), '⚠️ tocar el mapa NO abre el ajuste');
    const ml = trozo('function _dlvMapaListo(', '/* MIRAR:');
    ok(/dragging:!_dlvTactil\(\), touchZoom:true/.test(ml), 'mirar: PC con mouse, celular con dos dedos');
    ok(/_mapaDosDedos\(_dlvMapa, \$\('dlvDedos'\)\)/.test(ml), 'aviso «Usa dos dedos» (compartido con sedes)');
    const pin = trozo('function _dlvPintar(', '/* Cambiar de modo');
    ok(/_dlvMarca=L\.marker\(c,\{icon:_agIcono\(true, salta\), interactive:false/.test(pin), 'el pin está en el punto y no se toca');
    const md = trozo('function _dlvModo(', '/* «◎ Volver');
    ok(/if\(aj \|\| !_dlvTactil\(\)\) _dlvMapa\.dragging\.enable\(\); else _dlvMapa\.dragging\.disable\(\);/.test(md),
       'ajustar: se arrastra con un dedo; al volver a mirar, en celular otra vez dos dedos');
    ok(/_dlvMarcasVisibles\(!aj\);/.test(md) && /if\(_dlvCirculo\) _dlvCirculo\.setStyle\(/.test(form),
       'ajustar: solo el pin del centro (el del punto y su círculo se ocultan)');
    ok(/if\(dd\) dd\.classList\.remove\('on'\);/.test(md), 'el aviso de dos dedos no queda encima del ajuste');
    ok(/\.dlv-prev\{position:relative;height:230px;/.test(form) && /@media\(min-width:700px\)\{\.dlv-prev\{height:280px\}\}/.test(form),
       'mismo tamaño que el mapa de sedes');
    ok(/@media\(pointer:coarse\)\{\n  \.dlv-prev\.ajustando\{position:fixed;inset:0;/.test(form),
       '⚠️ PC: ajusta en el mismo recuadro; celular: pantalla completa');
    ok(/body\.dlv-ajustando #tt-narr\{display:none!important\}/.test(form), 'durante el ajuste no estorba Heavy');
    ok(/onclick="dlvVolver\(\)">◎ Volver a mi punto/.test(form), '«Volver a mi punto» si la vista se alejó');
    const aj = trozo('function dlvAjustar(', 'function dlvAjusteCerrar(');
    ok(/hay\?\[_gpsLat,_gpsLon\]:_DLV_LIMA/.test(aj), 'sin punto previo, el ajuste empieza en Lima');
    const okf = trozo('function dlvAjusteOk(', '/* ★ ENLACE DE MAPA');
    ok(/var c=m\.getCenter\(\);/.test(okf) && /_dlvPunto\(c\.lat, c\.lng, \{confirmado:true, salta:true\}\)/.test(okf), 'Entregar aquí: el centro (donde está el pin)');
    ok(/✓ Entregar aquí/.test(form), 'el botón dice lo que gana el cliente');
    const es = trozo('function _dlvEstado(', 'function dlvConfirmar(');
    ok(/¿Es aquí tu casa\?/.test(es) && /✓ Sí, es aquí/.test(es) && /✓ ¡Listo! Te lo llevamos aquí/.test(es) && /onclick="quitarPin\(\)">Quitar punto/.test(es),
       '«¿Es aquí tu casa?», «¡Listo!» y «Quitar punto»');
  }

  bloque('Nada queda colgado al cambiar de courier o quitar el punto');

  {
    ok(/_gpsLat=null; _gpsLon=null; _dlvReset\(\);/.test(form), 'cambiar de courier borra el punto y su vista');
    ok(/function quitarPin\(\)\{ _gpsLat=null; _gpsLon=null; _dlvReset\(\); \}/.test(form), 'quitar el punto (no toca la dirección escrita)');
    const r = trozo('function _dlvReset(', 'function _dlvPista(');
    ok(/_dlvModo\('mirar'\);/.test(r) && /_dlvToken\+\+/.test(r) && /ta\.placeholder=_DLV_PLACEHOLDER;/.test(r),
       'sale del ajuste, sin respuestas tardías y placeholder limpio');
    ok(/var dlv  = selCourierType==='delivery';/.test(form) && /'Continuar con esta dirección →'/.test(form),
       'Continuar dice el estado también en delivery');
  }

  bloque('Estilos de la tarjeta de confirmación presentes');

  {
    ['.dlv-confirma{', '.dlv-q{', '.dlv-btns{', '.dlv-si{', '.dlv-aj{', '.dlv-link{', '.dlv-aviso{'].forEach((c) =>
      ok(form.indexOf(c) > 0, 'existe ' + c));
  }

  bloque('Mapa base compartido');

  {
    ok((form.match(/_mapaCapa\(/g) || []).length >= 3, 'una sola definición de teselas, usada por los dos mapas');
    ok((form.match(/function _mapaDosDedos\(/g) || []).length === 1 && (form.match(/_mapaDosDedos\(/g) || []).length >= 3,
       'una sola función de «dos dedos», usada por sedes y delivery');
    ok((form.match(/tile\.openstreetmap\.org/g) || []).length === 1, 'la URL de teselas existe UNA vez');
  }
};
