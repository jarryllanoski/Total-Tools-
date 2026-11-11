/**
 * tests/fase3-modulos.test.js — las reglas del monolito modular
 * ==============================================================
 * Fase 3 (10/11/2026): el panel pasó de index.html (5.500 líneas) +
 * config.js (3.600) a módulos en panel/. Estas pruebas cuidan las reglas
 * que hacen que partirlo NO cambie nada:
 *   · index.html es solo HTML: ni un script en línea;
 *   · cada módulo se carga con su ?v= y en el orden que necesita;
 *   · ningún nombre global se define dos veces (el segundo pisaría al
 *     primero EN SILENCIO — con scripts clásicos no hay error que avise);
 *   · el arranque de la nube corre cuando la lista ya existe.
 */
'use strict';
const E = require('./_entorno.js');
const fs = require('fs');
const path = require('path');

module.exports = async ({bloque, ok}) => {
  const html = E.leerReal('index.html');
  // Fase 7: en carpetas por capa → 'datos/nube.js'. Las pruebas de abajo
  // nombran el archivo ('nube.js') y aquí se busca su carpeta.
  const mods = E.modulosPanel().map((f) => f.replace('panel/', ''));
  const RUTA = {};
  mods.forEach((m) => { RUTA[m.split('/').pop()] = m; });
  const pos = (f) => html.indexOf('<script src="panel/' + (RUTA[f] || f) + '?v=');

  bloque('index.html es solo HTML');

  {
    ok(!/<script>/.test(html), 'ni un <script> en línea: todo el código vive en módulos');
    ok(!E.existe('config.js'), 'config.js ya no existe (son diez módulos de panel/)');
    ok(html.split('\n').length < 1200, 'index.html: ' + html.split('\n').length + ' líneas (antes 5.569)');
  }

  bloque('formulario.html también es solo HTML');

  {
    const fo = E.leerReal('formulario.html');
    const enLinea = fo.match(/<script>[\s\S]*?<\/script>/g) || [];
    ok(enLinea.length === 1 && /location\.replace\('seguimiento\.html'/.test(enLinea[0]),
       'su único script en línea es la redirección de los links viejos (tiene que ir primero en el <head>)');
    // Fase 5: el formulario en módulos cliente/form-*.js, en este orden.
    const ORDEN = ['comun', 'form-base', 'form-datos', 'form-courier', 'form-delivery', 'form-fecha', 'form-enviar',
      'form-agencias', 'form-ubicacion', 'form-sedes-mapa', 'form-asistente', 'form-arranque'];
    const p = ORDEN.map((n) => fo.indexOf('<script src="cliente/' + n + '.js?v='));
    ok(p.every((x, k) => x > 0 && (k === 0 || x > p[k - 1])), 'los módulos del formulario se cargan todos y en orden (comun.js primero)');
    const fm = fs.readdirSync(path.join(E.RAIZ, 'cliente')).filter((f) => /^form-.*\.js$/.test(f));
    ok(fm.length === ORDEN.length - 1, 'no sobra ni falta ningún módulo form-*.js (' + fm.length + ')');
    fm.forEach((f) => ok(new RegExp('^/\\*\\*\\n \\* cliente/' + f.replace('.', '\\.') + ' — ').test(E.leerReal('cliente/' + f)),
      f + ' dice qué es en su cabecera'));
    const arr = E.leerReal('cliente/form-arranque.js');
    ok(/\ninit\(\);\s*$/.test(arr), 'init() corre al final del último módulo, cuando ya existe todo');
    ok(fm.filter((f) => f !== 'form-arranque.js').every((f) => !/^window\.[\w$]+\s*=\s*[\w$]+;/m.test(E.leerReal('cliente/' + f))),
       'los window.X = X (los botones) se asignan todos en form-arranque.js, cuando ya existen las funciones');
    // Ningún nombre global repetido entre comun.js y los módulos del formulario.
    const def = {}; const dup = [];
    ['comun.js'].concat(fm).forEach((f) => {
      const re = /^(?:async function|function|let|const|var|class)\s+([A-Za-z_$][\w$]*)/gm; let m;
      const t = E.leerReal('cliente/' + f);
      while ((m = re.exec(t))) { if (def[m[1]] && def[m[1]] !== f) dup.push(m[1]); def[m[1]] = def[m[1]] || f; }
    });
    ok(dup.length === 0, 'formulario: ningún nombre global repetido' + (dup.length ? ': ' + dup : ''));
  }

  bloque('Cada módulo: cargado, con cabecera, y en su orden');

  {
    mods.forEach((f) => {
      ok(pos(f) > 0, f + ' se carga');
      const t = E.leerReal('panel/' + f);
      ok(new RegExp('^/\\*\\*\\n \\* panel/' + f.replace('.', '\\.') + ' — ').test(t), f + ' dice qué es en su cabecera');
    });
    const orden = (a, b) => ok(pos(a) > 0 && pos(a) < pos(b), a + ' antes que ' + b);
    orden('nube.js', 'estado.js');            // estado.js usa _fbSave/_fbLoad
    ['navegacion.js', 'lista.js', 'shalom-ajustes.js', 'recursos-ui.js', 'acciones.js',
      'proveedores.js', 'estados-papelera.js', 'escaner.js'].forEach((m) => {
      orden('estado.js', m); orden(m, 'inicio.js');
    });
    // Los de Config, después de inicio.js: exactamente donde iba config.js.
    E.CONFIG_JS.forEach((f) => orden('inicio.js', f.replace('panel/', '')));
    ok(pos('pedido-ui.js') > html.indexOf('cotizacion.js'), 'pedido-ui.js al final (llama a updateShareLink de links-tokens.js)');
    ok(html.indexOf('auth.js') < pos('estado.js') && html.indexOf('xlsx.full.min.js') < pos('estado.js'),
       'auth.js y la librería de Excel, antes del estado (como siempre)');
  }

  bloque('El arranque de la nube, cuando la lista ya existe');

  {
    const ini = E.leerReal('panel/pantalla/inicio.js');
    const est = E.leerReal('panel/datos/estado.js');
    ok(/if\(window\._fbReady\) \{\s*_initFirebase\(\);/.test(ini) && !/if\(window\._fbReady\) \{/.test(est),
       'arranca en inicio.js (último del panel), no en estado.js');
    ok(ini.indexOf('_initFirebase();') < ini.indexOf('pintarEncabezado();\nrenderChips();\nrender();'),
       'y justo antes del primer pintado, en el mismo orden de siempre');
    ok(/const _initFirebase = async \(intento\) =>/.test(est) && /window\._trasEntrar = function\(\)\{/.test(est),
       'la función y el «al entrar» siguen en estado.js');
  }

  bloque('Ningún nombre global se define dos veces');

  {
    // Todos los scripts clásicos que comparten el ámbito global del panel.
    /* Un archivo ENCAPSULADO —todo su código dentro de `(function(){ … })()`—
       no define nombres globales: lo de dentro es privado y no choca con
       nadie (dashboard.js y delivery.js pueden tener cada uno su `_esc`).
       Solo cuentan los módulos de nivel superior. */
    const encapsulado = (t) => {
      const codigo = t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
          .replace(/^\s*['"]use strict['"];?\s*$/m, '').trim();
      return /^;?\s*\(\s*function\s*\(/.test(codigo) && /\}\s*\)\s*\([^)]*\)\s*;?\s*$/.test(codigo);
    };
    const archivos = mods.map((f) => 'panel/' + f);
    const def = {};
    const dup = [];
    const enc = archivos.filter((f) => encapsulado(E.leerReal(f)));
    ok(enc.indexOf('panel/pedidos/print.js') >= 0 && enc.indexOf('panel/datos/estado.js') < 0,
       'reconoce cuáles van encapsulados (print.js sí, estado.js no)');
    archivos.filter((f) => enc.indexOf(f) < 0).forEach((f) => {
      const t = E.leerReal(f);
      const re = /^(?:async function|function|let|const|var|class)\s+([A-Za-z_$][\w$]*)/gm;
      let m;
      while ((m = re.exec(t))) {
        const n = m[1];
        if (def[n] && def[n] !== f) dup.push(n + ' (' + def[n] + ' y ' + f + ')');
        def[n] = def[n] || f;
      }
    });
    ok(dup.length === 0, 'sin duplicados' + (dup.length ? ': ' + dup.join(', ') : '') +
       ' — un nombre repetido pisaría al otro sin error');
    ok(Object.keys(def).length > 400, Object.keys(def).length + ' nombres repartidos en ' + archivos.length + ' módulos');
  }

  bloque('Fase 7: el panel en carpetas por capa');

  {
    const CAPAS = {datos: ['nube.js', 'estado.js', 'storage.js', 'fotos.js', 'respaldo.js', 'mezclaConfig.js', 'errores.js', 'copia-local.js'],
      pantalla: ['navegacion.js', 'lista.js', 'acciones.js', 'escaner.js', 'inicio.js', 'whatsapp.js',
        'floatpanel.js', 'seleccion.js', 'voz.js', 'dashboard.js', 'ayuda.js'],
      pedidos: ['pedido-form.js', 'pedido-docs.js', 'pedido-reniec.js', 'pedido-guardar.js', 'pedido-ui.js',
        'estados-papelera.js', 'pin-papelera.js', 'print.js', 'notify.js', 'delivery.js'],
      shalom: ['shalom-registro.js', 'shalom-origen.js', 'shalom-ajustes.js', 'shalom.js', 'tracking.js',
        'qrtracking.js', 'ticket.js', 'guias.js', 'agencias-extractor.js'],
      compartir: ['links-tokens.js', 'excel.js'],
      config: ['configuracion.js', 'recursos-ui.js', 'proveedores.js', 'recursos.js', 'cotizacion.js']};
    ok(fs.readdirSync(E.RAIZ).filter((f) => /\.js$/.test(f)).sort().join() ===
       'appcheck.js,auth.js,firebase-config.js,loading-screen.js,medir-registro.js',
       'en la raíz solo quedan los compartidos con las páginas del cliente y la infraestructura');
    ok(fs.readdirSync(path.join(E.RAIZ, 'panel')).every((f) => fs.statSync(path.join(E.RAIZ, 'panel', f)).isDirectory()),
       'ningún módulo suelto en panel/: cada uno en su carpeta');
    const esperado = Object.keys(CAPAS).flatMap((c) => CAPAS[c].map((f) => c + '/' + f)).sort();
    ok(JSON.stringify(mods.slice().sort()) === JSON.stringify(esperado),
       'cada módulo en la carpeta de su capa (si agregas uno, decide su capa aquí)');
    /* La capa de datos (nube.js) NO llama hacia arriba: avisa con un evento
       y la pantalla repinta. */
    const nube = E.leerReal('panel/datos/nube.js').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    ok(!/\b(render|renderChips|loadCfgUI|recRender|openForm|goPage)\(/.test(nube),
       'datos/nube.js no llama a la pantalla (ni render, ni loadCfgUI, ni recRender…)');
    ok(/dispatchEvent\(new Event\('tt:config-cambiada'\)\)/.test(nube) &&
       /addEventListener\('tt:config-cambiada'/.test(E.leerReal('panel/pantalla/inicio.js')),
       'avisa «configuración cambiada» y pantalla/inicio.js repinta');
    // estado.js tampoco pinta (Fase 7, punto 1): avisa y la pantalla pinta.
    const est = E.leerReal('panel/datos/estado.js').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    ok(!/\b(render|renderChips|toast|loadCfgUI|recRender|pintarEncabezado|_liberarPantallasNube)\(/.test(est),
       'datos/estado.js no llama a la pantalla (ni render, ni toast, ni encabezado…)');
    const ini = E.leerReal('panel/pantalla/inicio.js');
    ['tt:aviso', 'tt:nube-sincronizada', 'tt:nube-lista'].forEach((ev) =>
      ok(ini.indexOf("addEventListener('" + ev + "'") >= 0 && ini.indexOf("addEventListener('" + ev + "'") < ini.indexOf('_initFirebase();'),
         'pantalla escucha «' + ev + '» ANTES de arrancar la nube'));
    // La cola: lo avisado antes de que la pantalla escuche no se pierde.
    const src = est.slice(est.indexOf('function _avisar('), est.indexOf('\n}\n', est.indexOf('function _avisar(')) + 3);
    const win = {recibidos: [], dispatchEvent(e) { this.recibidos.push(e.type + ':' + (e.detail || '')); }};
    // eslint-disable-next-line no-new-func
    const av = new Function('window', 'CustomEvent', src + ';return _avisar;')(win,
        function(t, o) { this.type = t; this.detail = o && o.detail; });
    av('tt:aviso', 'antes');
    ok(win.recibidos.length === 0 && win._avisosPendientes.length === 1, 'antes de que la pantalla escuche: queda en cola');
    win._pantallaLista = true; av('tt:aviso', 'después');
    ok(win.recibidos.join() === 'tt:aviso:después', 'después: se entrega al instante');
    ok(/\(window\._avisosPendientes \|\| \[\]\)\.splice\(0\)\.forEach/.test(ini), 'y la pantalla entrega lo que estaba en cola al empezar a escuchar');
  }
};

