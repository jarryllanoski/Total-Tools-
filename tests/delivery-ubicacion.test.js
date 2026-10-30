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
    ok(/EnlaceMapa\.de\(_gpsLat\+','\+_gpsLon\)/.test(form) && !/maps\.google\.com\/\?q=/.test(form),
       'el chip «Ver mapa» usa la misma función (ya no el formato viejo)');
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

  bloque('El punto: se ve, se confirma o se ajusta; la dirección escrita manda');

  {
    const pt = trozo('function _dlvPunto(', 'function _dlvReset(');
    ok(/_gpsLat=\+Number\(la\)\.toFixed\(6\); _gpsLon=\+Number\(lo\)\.toFixed\(6\);/.test(pt), 'UNA función pone el punto (GPS o ajuste)');
    const sg = trozo('function _dlvSugerirDireccion(', 'function _dlvPintar(');
    ok(/if\(!ta \|\| ta\.value\.trim\(\)\) return;/.test(sg), '⚠️ solo sugiere texto si el cuadro está vacío: lo del cliente manda');
    ok(/_gpsLat===la && _gpsLon===lo/.test(sg), 'y solo si el punto sigue siendo el mismo');
    const pv = trozo('function _dlvPintar(', 'function _dlvEstado(');
    ok(/dragging:false, touchZoom:false, scrollWheelZoom:false/.test(pv), 'la vista previa es quieta: no atrapa la página');
    ok(/onclick="dlvAjustar\(\)" role="button"/.test(form), 'tocarla abre el ajuste');
    const es = trozo('function _dlvEstado(', 'function dlvConfirmar(');
    ok(/¿Es aquí tu casa\?/.test(es) && /✓ Sí, es aquí/.test(es) && /✓ ¡Listo! Te lo llevamos aquí/.test(es), '«¿Es aquí tu casa?» y «¡Listo!»');
    const aj = trozo('function dlvAjustar(', 'function dlvAjusteCerrar(');
    ok(/hay\?\[_gpsLat,_gpsLon\]:_DLV_LIMA/.test(aj), 'sin punto previo, el ajuste empieza en Lima');
    ok(/L\.map\('dlvAjMapa',\{zoomControl:true/.test(aj) && !/dragging:false/.test(aj), 'a pantalla completa SÍ se arrastra con un dedo');
    ok(/document\.body\.classList\.add\('dlv-ajustando'\)/.test(aj) && /body\.dlv-ajustando #tt-narr\{display:none!important\}/.test(form),
       'durante el ajuste no se desplaza la página ni estorba Heavy');
    const ok2 = trozo('function dlvAjusteOk(', 'var EnlaceMapa');
    ok(/var c=m\.getCenter\(\);/.test(ok2) && /_dlvPunto\(c\.lat, c\.lng, \{confirmado:true, salta:true\}\)/.test(ok2), 'el punto es el centro (donde está el pin)');
  }

  bloque('Nada queda colgado al cambiar de courier o quitar el punto');

  {
    ok(/_gpsLat=null; _gpsLon=null; _dlvReset\(\);/.test(form), 'cambiar de courier borra el punto y su vista');
    ok(/function quitarPin\(\)\{ _gpsLat=null; _gpsLon=null; _pinChip\(\); _dlvReset\(\); \}/.test(form), 'quitar el chip también');
    const r = trozo('function _dlvReset(', 'function _dlvSugerirDireccion(');
    ok(/_pinChip\(\);/.test(r) && /_dlvToken\+\+/.test(r), 'sin chip viejo y sin respuestas tardías de un pedido anterior');
    ok(/var dlv  = selCourierType==='delivery';/.test(form) && /'Continuar con esta dirección →'/.test(form),
       'Continuar dice el estado también en delivery');
  }

  bloque('Mapa base compartido');

  {
    ok((form.match(/_mapaCapa\(/g) || []).length >= 4, 'una sola definición de teselas, usada por los tres mapas');
    ok((form.match(/tile\.openstreetmap\.org/g) || []).length === 1, 'la URL de teselas existe UNA vez');
  }
};
