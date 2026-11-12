/**
 * tests/confirmacion.test.js — confirmar sin telón, el sello y WhatsApp
 * =====================================================================
 * 30/10/2026. Al confirmar ya no se tapa la pantalla: el botón avanza, la
 * etiqueta «se imprime», cae el sello «✓ REGISTRADO» y abajo queda
 * WhatsApp con la verdad (barra «falta 1 toque», burbuja con lo que se
 * enviará, recordatorio si vuelve sin enviarlo). Y el formulario carga
 * menos: sin loading-screen.js ni el selector viejo de agencias.
 */
'use strict';
const E = require('./_entorno.js');
const vm = require('vm');

module.exports = async ({bloque, ok}) => {
  const form = E.cliente();
  const trozo = (desde, hasta) => form.slice(form.indexOf(desde), form.indexOf(hasta, form.indexOf(desde)));

  bloque('Confirmar sin telón: el botón avanza y la etiqueta «se imprime»');

  {
    ok(!/showOverlay/.test(form) && !/id="loadOverlay"/.test(form), 'ya no existe el telón de carga');
    const sub = trozo('async function submitOrder(', 'function _confEmpezar(btn){');
    ok(/const t0=_confEmpezar\(btn\);/.test(sub), 'al confirmar: botón en progreso + etiqueta imprimiéndose');
    ok(/Math\.max\(0, 900-\(Date\.now\(\)-t0\)\)/.test(sub), 'la impresión se ve al menos 0,9 s');
    ok(/_confFallo\(btn\);/.test(sub), 'si falla, todo vuelve a su sitio (con el error)');
    const emp = trozo('function _confEmpezar(', 'function _confFallo(');
    ok(/btn\.disabled=true/.test(emp), '⚠️ doble toque: el botón se desactiva (un solo pedido)');
    const fal = trozo('function _confFallo(', 'function _confSello(codigo){');
    ok(/btn\.disabled=false/.test(fal) && /classList\.remove\('tt-imprimiendo'\)/.test(fal), 'el fallo devuelve el botón y quita la impresión');
  }

  bloque('El pico: sello «✓ REGISTRADO» con el código, confeti y vibración');

  {
    const se = trozo('function _confSello(', 'function _confConfeti(');
    ok(/<b>✓ REGISTRADO<\/b>/.test(se) && /<small>'\+esc\(codigo\)\+'<\/small>/.test(se), 'el sello lleva el código (escapado)');
    ok(/navigator\.vibrate\(\[15,40,15\]\)/.test(se), 'vibración del sello');
    const cf = trozo('function _confConfeti(', 'var _waToco');
    ok(/prefers-reduced-motion: reduce\)'\)\.matches\) return;/.test(cf), 'con «reducir movimiento» no hay confeti');
    ok(/setTimeout\(function\(\)\{ c\.remove\(\); \}, 2200\)/.test(cf), 'el confeti se limpia solo');
    ok(/@media\(prefers-reduced-motion:reduce\)\{\.tt-wa-vuelta\.tt-asoma,\.tt-dedo,\.tt-sello,#tt-lbl \.card\.tt-tiembla/.test(form), 'sin animaciones si lo pidió');
    const sc = trozo('function showInlineConfirmed(', 'function _waAbierto(');
    ok(/order\.nroComprobante \? String\(order\.nroComprobante\) : '#'\+trackCode/.test(sc), 'con factura, el código es la factura');
    ok(/className='tt-confirmed'/.test(sc), 'conserva la marca que lee el narrador (despedida de Heavy)');
  }

  bloque('WhatsApp con la verdad: meta, sin burbuja, el dedo al instante');

  {
    const sc = trozo('function showInlineConfirmed(', 'function _waAbierto(');
    ok(/falta 1 toque/.test(sc) && /Envíanos tu pedido por WhatsApp/.test(sc), 'barra de meta «falta 1 toque»');
    ok(!/tt-burbuja/.test(sc) && !/\.tt-burbuja\{/.test(form), 'sin la burbuja: repetía lo que ya dice la etiqueta');
    ok(/if\(waHref\) setTimeout\(function\(\)\{ if\(!_waToco\) _waRecordar\(true\); \}, 1000\);/.test(sc),
       'lo amarillo entra 1 s después que lo demás');
    const rc = trozo('function _waRecordar(', 'try{ document.addEventListener(\'visibilitychange\', function(){');
    ok(/Solo falta este paso/.test(rc) && /Te falta enviarlo/.test(rc), 'primero meta cercana; el recordatorio, pérdida');
    ok(/class="tt-dedo"/.test(rc) && /@keyframes ttDedo/.test(form) && /classList\.add\('tt-asoma'\)/.test(rc),
       'entra con animación y la mano 👆 señala el botón');
    ok(/reduce\)\{\.tt-wa-vuelta\.tt-asoma,\.tt-dedo,/.test(form), 'sin animación si pidió reducir movimiento');
    ok(/Al enviarlo recibes tu <b>link de seguimiento<\/b>/.test(sc), 'beneficio verdadero');
    ok(!/no podremos procesarlo/i.test(form) && !/se cancelar/i.test(sc), '⚠️ sin mentir: el pedido ya está registrado');
    ok(/onclick="_waAbierto\(\)"/.test(sc), 'se sabe si tocó el botón (solo en este navegador)');
    ok(/_waRecordatorio=setTimeout\(function\(\)\{ if\(!_waToco\) _waRecordar\(\); \}, 25000\);/.test(sc), 'recordatorio suave a los 25 s, una vez');
    const vu = trozo("try{ document.addEventListener('visibilitychange', function(){\n  if(document.hidden || !$('ttWaBtn')", 'function waYaEnviado(');
    ok(/if\(!_waToco\)\{ _waRecordar\(\); return; \}/.test(vu), 'vuelve sin enviarlo → recordatorio');
    ok(/¿Ya lo enviaste\?/.test(vu) && /✓ Sí, ya lo envié/.test(vu) && /Abrir otra vez/.test(vu), 'lo tocó y vuelve → «¿Ya lo enviaste?»');
    ok(/Te falta enviarlo para recibir tu link de seguimiento/.test(form), 'el recordatorio dice la verdad');
    const ya = trozo('function waYaEnviado(', '\n}\n');
    ok(/●●●●● · <b>¡completo!<\/b>/.test(ya) && /¡Gracias! 🙌/.test(ya), '«Sí» completa la barra y agradece');
  }

  bloque('El mensaje: en retiro en tienda no dice «Dirección: —»');

  {
    const src = trozo('function _construirWaMsg(', 'function _construirWaHref(');
    const correr = (tipo) => {
      const c = vm.createContext({EnlaceMapa: {de: () => ''}, CFG: {config: {name: 'TT'}}, selCourierType: tipo, selDateLbl: '',
        location: {origin: 'https://x', pathname: '/f'}});
      vm.runInContext(src + ';this.F=_construirWaMsg;', c);
      return c.F({name: 'ANA', phone: '9', address: '', courier: 'RETIRO EN TIENDA', date: '', dni: '1'}, 'AB12', 't1_x');
    };
    const m = correr('retiro');
    ok(/🏪 \*Retiro en tienda\*/.test(m) && m.indexOf('Dirección: —') < 0 && m.indexOf('*Dirección:* —') < 0, 'retiro: «🏪 Retiro en tienda»');
    ok(/🏠 \*Dirección:\* —/.test(correr('delivery')), 'delivery sin dirección sigue igual');
  }

  bloque('Carga más liviana');

  {
    // Fase 2: el seguimiento tiene su propia página; el formulario no lo carga.
    const fo = E.leer('formulario.html'), se = E.leer('seguimiento.html');
    ok(!/loading-screen\.js/.test(fo) && /<script src="loading-screen\.js\?v=\d+"><\/script>/.test(se),
       'loading-screen.js solo en el seguimiento (y síncrono, sin carrera con TTLoader)');
    ok(/<link rel="preconnect" href="https:\/\/us-central1-total-tools-24ce8\.cloudfunctions\.net" crossorigin>/.test(form),
       'preconnect al servidor de pedidos');
    ok(!/const AD = \{/.test(form) && !/getAgencyData/.test(form) && !/function onDept/.test(form) && !/\.cascade\{/.test(form),
       'fuera el selector viejo de agencias (inalcanzable)');
  }
};
