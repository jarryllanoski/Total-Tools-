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
  const mods = fs.readdirSync(path.join(E.RAIZ, 'panel')).filter((f) => /\.js$/.test(f));
  const pos = (f) => html.indexOf('<script src="panel/' + f + '?v=');

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
    const i = fo.indexOf('<script src="cliente/comun.js?v=');
    ok(i > 0 && i < fo.indexOf('<script src="cliente/formulario.js?v='), 'comun.js antes que formulario.js');
    ok(/^\/\*\*\n \* cliente\/formulario\.js — /.test(E.leerReal('cliente/formulario.js')) &&
       /\(function\(\)\{\n'use strict';/.test(E.leerReal('cliente/formulario.js')),
       'formulario.js conserva su envoltura: sus variables siguen siendo privadas');
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
    const ini = E.leerReal('panel/inicio.js');
    const est = E.leerReal('panel/estado.js');
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
    const archivos = mods.map((f) => 'panel/' + f);
    const def = {};
    const dup = [];
    archivos.forEach((f) => {
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
};
