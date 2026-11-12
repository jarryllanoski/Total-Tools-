'use strict';
const E = require('./_entorno.js');

module.exports = async ({bloque, ok}) => {
  const html = E.leerCrudo('index.html');
  const scripts = html.match(/<script\b[^>]*>/g) || [];

  bloque('Panel: nada bloquea el primer pintado');
  {
    const locales = scripts.filter((t) => /src="(?!https?:)/.test(t));
    ok(locales.length > 50 && locales.every((t) => /\bdefer\b/.test(t)),
       'todos los scripts locales del panel van con defer (' + locales.length + ')');
    ok(!/xlsx\.full\.min\.js/.test(html), 'la libreria de Excel no se descarga al abrir');
    ok(!/@import/.test(E.leerReal('panel.css')), 'panel.css no encadena las fuentes con @import');
    ok(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]+media="print" onload="this\.media='all'">/.test(html),
       'las fuentes cargan sin bloquear');
    ok(/display=optional/.test(html), 'y sin saltos de diseño cuando llegan');
  }

  bloque('Panel: el login aparece primero');
  {
    const orden = scripts.filter((t) => /src="(?!https?:)/.test(t)).map((t) => (/src="([^"?]+)/.exec(t) || [])[1]);
    ok(orden[0] === 'panel/datos/errores.js' && orden[1] === 'firebase-config.js' && orden[2] === 'auth.js',
       'errores.js, firebase-config.js y auth.js van primero');
    ok(scripts.slice(0, 3).every((t) => /fetchpriority="high"/.test(t)), 'y con prioridad alta');
    ok(/<div id="arranque"[^>]*>[\s\S]*TOTAL TOOLS/.test(html), 'pantalla de arranque estatica con la marca');
    const auth = E.leerReal('auth.js');
    ok(/function _quitarArranque\(\)/.test(auth) && /\.then\(_quitarArranque\)/.test(auth), 'auth.js la quita al decidir');
    ok(/if\(!_haySesionGuardada\(\) \|\| document\.readyState === 'complete'\)\{\s*_arrancar\(\);/.test(auth),
       'sin sesion guardada, el login sale sin esperar al resto');
    ok(/function _alEntrar\(\)\{\s*_listo\.then\(/.test(auth), 'entrar antes de terminar la carga espera a que todo este listo');
  }

  bloque('Los modulos siguen arrancando despues de todos los scripts');
  {
    const conInit = ['panel/datos/storage.js', 'panel/pedidos/print.js', 'panel/pedidos/notify.js',
      'panel/pantalla/floatpanel.js', 'panel/pedidos/delivery.js', 'panel/shalom/qrtracking.js',
      'panel/shalom/ticket.js', 'panel/shalom/agencias-extractor.js', 'panel/datos/respaldo.js',
      'panel/pantalla/dashboard.js', 'panel/pantalla/voz.js'];
    conInit.forEach((f) => {
      const t = E.leerReal(f);
      ok(/document\.readyState\s*!==\s*'complete'/.test(t) && !/document\.readyState\s*===\s*'loading'/.test(t),
         f + ': espera a DOMContentLoaded como antes');
    });
  }

  bloque('Excel bajo demanda');
  {
    const x = E.leerReal('panel/compartir/xlsx.js');
    ok(/xlsx\/0\.18\.5\/xlsx\.full\.min\.js/.test(x), 'misma version de la libreria');
    ok(/window\.cargarXLSX = cargarXLSX/.test(x) && /window\.conXLSX = conXLSX/.test(x), 'expone cargarXLSX y conXLSX');
    ok(html.indexOf('panel/compartir/xlsx.js') < html.indexOf('panel/compartir/excel.js'), 'se carga antes que excel.js');
    ok(/if\(!conXLSX\(exportExcel\)\) return;/.test(E.leerReal('panel/compartir/excel.js')), 'exportar la pide');
    ok(/if\(!conXLSX\(function\(\)\{ importExcel\(input\); \}/.test(E.leerReal('panel/compartir/excel.js')), 'importar la pide');
    ok(/conXLSX\(function\(\)\{ self\._onStock\(input\); \}/.test(E.leerReal('panel/config/cotizacion.js')), 'cotizacion la pide');
    ok(/conXLSX\(function\(\)\{ loadSuppStock\(input\); \}/.test(E.leerReal('panel/config/proveedores.js')), 'proveedores la pide');
    ok(!/typeof XLSX==='undefined'/.test(E.modulosPanel().map(E.leerReal).join('\n')), 'nadie la da por cargada');
  }

  bloque('Sin aviso de sesion encima del login');
  {
    ok(/try\{ if\(document\.getElementById\('authOverlay'\)\) return; \}catch\(e\)\{\}/.test(E.leerReal('panel/datos/nube.js')),
       'con el login en pantalla no sale «Tu sesion vencio»');
  }
  bloque('Fase 2: accesibilidad y buenas practicas');
  {
    ok(/<meta name="viewport" content="width=device-width, initial-scale=1\.0">/.test(html), 'el zoom esta permitido');
    const css = E.leerReal('panel.css');
    ok(/@supports \(-webkit-touch-callout:none\)\{input,select,textarea\{font-size:16px\}\}/.test(css),
       'en iPhone los campos no hacen zoom solos al tocarlos');
    ok(/--blue-fill:#1f6feb/.test(css) && !/background:var\(--blue\)/.test(css), 'botones azules con texto blanco legible');
    ok(!/background:var\(--blue\)/.test(E.modulosPanel().map(E.leerReal).join('\n')), 'tambien en los estilos en linea');
    ok(/background:#1f6feb/.test(E.leerReal('auth.js')), 'y el boton del login');
    ok(/\.powered\{[^}]*color:var\(--text2\)/.test(css), 'el pie se lee');
    ['index.html', 'formulario.html', 'seguimiento.html'].forEach((f) =>
      ok(/<link rel="icon" href="icono\.svg"/.test(E.leerCrudo(f)), f + ' tiene icono (sin 404)'));
    ok(E.existe('icono.svg'), 'el icono existe');
    ok(/body:has\(#authOverlay\)>:not\(#authOverlay\):not\(#arranque\)\{visibility:hidden\}|body:has\(#authOverlay\)>:not\(#authOverlay\):not\(#arranque\)\{/.test(html),
       'el panel no se ve detras del login');
  }

  bloque('Fase 2: nada pesado de terceros en el login');
  {
    const ac = E.leerReal('appcheck.js');
    ok(/if \(!_enLogin\(\)\) _cuandoLibre\(_init\);/.test(ac) && !/^\s*_init\(\);\s*$/m.test(ac),
       'App Check (reCAPTCHA) no se descarga mientras se muestra el login');
    const auth = E.leerReal('auth.js');
    ok(/var poner = function\(\)\{ document\.head\.appendChild\(s\); \};[\s\S]{0,120}requestIdleCallback\(poner/.test(auth),
       'el boton de Google carga cuando el navegador esta libre');
    ok(/id="authGoogleBtn" style="min-height:44px"/.test(auth), 'con su espacio reservado (sin saltos)');
  }
};
