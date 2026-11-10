/**
 * tests/fase2-paginas.test.js — el seguimiento en su propia página
 * ================================================================
 * Fase 2 (10/11/2026): formulario.html y seguimiento.html comparten
 * cliente/comun.js y cliente/cliente.css. Lo que no se puede romper:
 *   · los links VIEJOS (formulario.html?seg=…) siguen abriendo;
 *   · cada página carga solo lo suyo;
 *   · los links NUEVOS (panel y WhatsApp) apuntan a seguimiento.html;
 *   · lo que se llama desde un onclick existe en `window`.
 */
'use strict';
const E = require('./_entorno.js');
const vm = require('vm');

module.exports = async ({bloque, ok}) => {
  const fo = E.leer('formulario.html');
  const se = E.leer('seguimiento.html');
  const sj = E.leer('cliente/seguimiento.js');
  const cj = E.leer('cliente/comun.js');

  bloque('Los links viejos siguen abriendo');

  {
    const head = fo.slice(0, fo.indexOf('</head>'));
    const primero = head.indexOf('<script>');
    ok(primero > 0 && primero < head.indexOf('<link') && primero < head.indexOf('<script src'),
       'la redirección es lo PRIMERO del <head>: antes de bajar CSS o scripts del formulario');
    const red = head.slice(primero + 8, head.indexOf('</script>', primero));
    const correr = (search, hash) => {
      let fue = null;
      vm.runInNewContext(red, {URLSearchParams, location: {search, hash: hash || '',
        replace: (u) => { fue = u; }}});
      return fue;
    };
    ok(correr('?seg=AbC123') === 'seguimiento.html?seg=AbC123', 'formulario.html?seg=… → seguimiento.html?seg=…');
    ok(correr('?cfg=x&seg=id_1', '#a') === 'seguimiento.html?cfg=x&seg=id_1#a', 'conserva todo lo demás del link');
    ok(correr('?t=tok') === null && correr('') === null, 'sin ?seg= el formulario sigue como siempre');
    ok(/location\.replace\('seguimiento\.html\?seg=' \+ encodeURIComponent\(o\.trackToken\)\)/.test(fo),
       'el «último pedido de este celular» también va al seguimiento');
  }

  bloque('Cada página carga solo lo suyo');

  {
    ok(!/renderTrackResult|_shalomTrackingBlock|loading-screen\.js/.test(fo), 'el formulario ya no trae el seguimiento');
    ok(!/appcheck\.js|firebase-config\.js|agencias\.js|narrador\/loader\.js|narrador\/etiqueta\.js/.test(se),
       'el seguimiento no trae App Check (reCAPTCHA), ni el buscador de sedes, ni el telón del formulario');
    ok(/<script src="loading-screen\.js\?v=1"><\/script>\s*<div class="container" id="app">/.test(se),
       'su telón de carga va síncrono, antes del contenido');
    const orden = ['cliente/comun.js', 'cliente/seguimiento.js'].map((f) => se.indexOf('<script src="' + f));
    ok(orden[0] > se.indexOf('id="app"') && orden[0] < orden[1], 'comun.js después de #app y antes de seguimiento.js');
    const cf = fo.indexOf('<script src="cliente/comun.js');
    ok(cf > fo.indexOf('id="app"') && cf < fo.indexOf('cliente/form-base.js'),
       'en el formulario, comun.js también antes de su script');
    ok(/<link rel="stylesheet" href="cliente\/cliente\.css\?v=1">/.test(fo) && /<link rel="stylesheet" href="cliente\/cliente\.css\?v=1">/.test(se),
       'el CSS es el mismo archivo (el navegador lo guarda una vez)');
    ok(!/<style>/.test(fo), 'y ya no va repetido dentro del formulario');
  }

  bloque('Lo compartido existe una sola vez');

  {
    ['_api', 'esc', 'headerHtml', 'brandFooterHtml', 'codigoSeg', '_tipoEnvioDe', '_toby', '_ayudaHoja'].forEach((n) => {
      const def = new RegExp('\\nfunction ' + n.replace('$', '\\$') + '\\(|\\nasync function ' + n + '\\(');
      ok(def.test(cj) && !def.test(fo) && !def.test(sj), n + ': en comun.js, y solo ahí');
    });
    ok(/\nlet CFG\s+= null;/.test(cj) && !/\nlet CFG\b/.test(fo), 'CFG se declara una vez (comun.js) y la asigna cada página');
  }

  bloque('Lo que llama un onclick existe en window');

  {
    ['buscarPedido', 'abrirAyudaTrack', '_copyGuia', 'cerrarAyudaForm'].forEach((n) =>
      ok(new RegExp('window\\.' + n + '\\s*= ' + n + ';').test(sj), 'seguimiento: ' + n));
    ok(/onclick="_copyGuia\(this\)"/.test(sj), '⚠️ el botón «Copiar» de la guía ya tiene a quién llamar (antes no hacía nada)');
    ok(!/window\.(buscarPedido|goToTracking|clearOrderAndReset|nuevoRegistro|abrirAyudaTrack)\s*=/.test(fo),
       'el formulario ya no exporta lo que no tiene (sería un ReferenceError al cargar)');
  }

  bloque('Los links nuevos apuntan a seguimiento.html');

  {
    const c = E.leer('config.js');
    ok(/function getSeguimientoLink\(\)\{\s*return getFormLink\(\)\.replace\(\/formulario\\\.html\$\/, 'seguimiento\.html'\);/.test(c),
       'el panel tiene UNA regla para el link de seguimiento');
    ok(/getSeguimientoLink\(\):window\.location\.origin/.test(E.leer('index.html')), 'copiar link desde la tarjeta');
    ok(/typeof getSeguimientoLink === 'function' \? getSeguimientoLink\(\)/.test(E.leer('tracking.js')), 'y desde el seguimiento del panel');
    ok(/location\.pathname\.replace\(\/\[\^\/\]\*\$\/, 'seguimiento\.html'\)\}\?seg=\$\{trackToken\}/.test(fo),
       'el link que el cliente recibe por WhatsApp');
    // La regla, ejecutada.
    const src = c.slice(c.indexOf('function getFormLink(){'), c.indexOf('function updateShareLink(){'));
    const out = vm.runInNewContext(src + ';getSeguimientoLink()',
        {window: {location: {origin: 'https://x.github.io', pathname: '/Total-Tools-/index.html'}}});
    ok(out === 'https://x.github.io/Total-Tools-/seguimiento.html', 'da ' + out);
  }

  bloque('Sin token, el seguimiento manda al formulario');

  {
    ok(/if\(segTok\)\{ loadCfgThenTrack\(segTok\); return; \}\s*location\.replace\('formulario\.html' \+ location\.hash\);/.test(sj),
       'seguimiento.html sin ?seg= → formulario.html');
  }

  bloque('Delfi habla cuando el pedido ya está en Shalom (11/11/2026)');

  {
    // El narrador real, con una página mínima: la tarjeta del seguimiento.
    const card = {attrs: {}, getAttribute(k) { return this.attrs[k] == null ? null : String(this.attrs[k]); }};
    const app = {textContent: '', querySelector: (sel) => {
      if (sel === '.status-badge') return null;   // ya en Shalom: sin etiqueta del panel
      const m = sel.match(/^\.track-card\[(data-[\w-]+)\]$/);
      return m && card.attrs[m[1]] != null ? card : null;
    }, querySelectorAll: () => []};
    const win = {addEventListener() {}};
    const ctx = vm.createContext({window: win, navigator: {}, MutationObserver: function() { this.observe = () => {}; },
      document: {getElementById: (id) => (id === 'app' ? app : null), currentScript: null, readyState: 'loading',
        addEventListener() {}}, setTimeout: () => 0, clearTimeout() {}});
    vm.runInContext(E.leer('narrador/narrador.js'), ctx);
    const N = win.__ttNarrador;
    card.attrs = {'data-en-shalom': '1'};
    const e1 = N.estadoATexto();
    ok(e1 && e1.registrado && /registrado en Shalom/.test(N.mensajeDelfi(e1, 'agencia', {})),
       'con guía y sin estado de Shalom aún: «Tu envío ya está registrado en Shalom»');
    card.attrs = {'data-en-shalom': '1', 'data-shalom-st': '2', 'data-shalom-fase': '0'};
    ok(/agencia de salida/.test(N.mensajeDelfi(N.estadoATexto(), 'agencia', {shalom: true})), '«En origen»: lo recibieron en la agencia de salida');
    card.attrs = {'data-en-shalom': '1', 'data-shalom-st': '3', 'data-shalom-fase': '2'};
    ok(/llegó a la agencia/.test(N.mensajeDelfi(N.estadoATexto(), 'agencia', {shalom: true})), '«En destino»: acércate a recogerlo');
    card.attrs = {};
    ok(N.estadoATexto() === null, 'sin etiqueta y sin Shalom: no inventa nada');
    ok(/data-en-shalom="1"/.test(sj) && /data-shalom-fase=/.test(sj), 'el seguimiento le publica a Delfi que ya está en Shalom');
  }
};

