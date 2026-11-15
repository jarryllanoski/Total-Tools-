'use strict';
const E = require('./_entorno.js');

module.exports = async ({bloque, ok}) => {
  const fb = JSON.parse(E.leerReal('firebase.json'));
  const h = fb.hosting || {};
  const cab = (src) => ((h.headers || []).find((x) => x.source === src) || {}).headers || [];
  const val = (src, k) => (cab(src).find((x) => x.key === k) || {}).value || '';

  bloque('Firebase Hosting publica solo el sitio construido');
  {
    ok(h.public === 'dist', 'publica dist/ (lo construido), no el repositorio');
    ok(JSON.stringify(h.predeploy) === JSON.stringify(['npm --prefix herramientas ci', 'npm --prefix herramientas run sitio-firebase']),
       'antes de publicar instala y construye');
    const pk = JSON.parse(E.leerReal('herramientas/package.json'));
    ok(pk.scripts['sitio-firebase'] === 'node construir.mjs dist https://total-tools-24ce8.web.app/',
       'la direccion del sitio vive en el script de npm');
    ok(/const SALIDA = path\.resolve\(RAIZ, process\.argv\[2\] \|\| 'dist'\);/.test(E.leerReal('herramientas/construir.mjs')),
       'dist sale en la raiz del proyecto aunque npm lo corra desde herramientas/');
  }

  bloque('Publicar desde Windows: Firebase trata cada comando previo como una ruta');
  {
    const win = require('path').win32;
    const previos = [].concat(h.predeploy || [], ...[].concat(fb.functions || []).map((f) => f.predeploy || []));
    ok(previos.length >= 3, 'se revisan los comandos previos de hosting y de functions (' + previos.length + ')');
    previos.forEach((c) => {
      const conVariables = c.replace(/\$(\w+)|\$\{(\w+)\}/g, (m, a, b2) => '%' + (a || b2) + '%');
      ok(win.normalize(conVariables) === conVariables,
         '⚠️ «' + c + '» llega a Windows sin cambios (sin barras ni «:»; si no, sale «.\\node no se reconoce»)');
    });
    ok(win.normalize('node herramientas/construir.mjs dist https://total-tools-24ce8.web.app/').indexOf('.\\node') === 0,
       'la prueba reconoce el comando que fallo el 14/11');
    ok(/dist\//.test(E.leerReal('.gitignore')), 'dist/ no se sube a git');
  }

  bloque('Cache: rapido sin servir nada viejo');
  {
    ok(val('**/*.@(js|css)', 'Cache-Control') === 'public, max-age=31536000, immutable', 'JS y CSS: un ano (llevan huella de version)');
    ok(val('**/*.@(html|webmanifest)', 'Cache-Control') === 'no-cache', 'HTML: siempre la version nueva');
    ok(/max-age=604800/.test(val('**/*.@(png|svg|webp|jpg|jpeg|gif|ico|woff2)', 'Cache-Control')), 'imagenes: 7 dias');
    ok(/max-age=3600/.test(val('data/**', 'Cache-Control')), 'datos: 1 hora');
    ok(/Scripts o estilos sin \?v=/.test(E.leerReal('herramientas/construir.mjs')), 'construir falla si un script o estilo no lleva version');
  }

  bloque('Nada se queda viejo en cache: imagenes y catalogos con version');
  {
    const {execSync} = require('child_process');
    const fs = require('fs');
    const pathm = require('path');
    const publicados = new Set(execSync('git ls-files', {cwd: E.RAIZ}).toString().split('\n').filter(Boolean));
    const scripts = [...publicados].filter((f) => f.endsWith('.js') && !/^(tests|functions|herramientas|docs)\//.test(f));
    const re = /(["'])([A-Za-z0-9_][A-Za-z0-9_./-]*\.(?:webp|png|jpe?g|svg|gif))(\?v=[A-Za-z0-9]+)?(?=["'?])/g;
    const sinVersion = [];
    let conVersion = 0;
    scripts.forEach((f) => {
      for (const m of E.leerReal(f).matchAll(re)) {
        const real = [pathm.posix.join(pathm.posix.dirname(f), m[2]), pathm.posix.normalize(m[2].replace(/^\.\//, ''))].find((c) => publicados.has(c));
        if (!real) continue;
        if (m[3]) conVersion++; else sinVersion.push(f + ': ' + m[2]);
      }
    });
    ok(sinVersion.length === 0 && conVersion >= 9,
       'cada imagen que carga un script lleva ?v= (' + conVersion + ')' + (sinVersion.length ? ': faltan ' + sinVersion.join(', ') : ''));
    const c = E.leerReal('herramientas/construir.mjs');
    ok(/return comilla \+ nombre \+ '\?v=' \+ huella\(leer\(real\)\);/.test(c), 'al publicar, la version de cada imagen es la huella de su contenido');
    ok(/Imagenes sin \?v= en los scripts/.test(c), 'y la construccion falla si alguna no la lleva');
    ok(/var LOGOS=\['load-heavy\.webp\?v=\d+'/.test(E.leerReal('narrador/loader.js')) && !/pick\+'\?v=/.test(E.leerReal('narrador/loader.js')),
       'cada personaje del cargador con su propia version');

    const fa = E.leerReal('cliente/form-agencias.js');
    [['SHALOM', 'data/agencias-shalom.json'], ['OLVA', 'data/agencias-olva.json']].forEach(([k, archivo]) => {
      const v = (new RegExp(k + ": \\{[\\s\\S]*?version: '([0-9-]+)'").exec(fa) || [])[1];
      const generado = String((JSON.parse(fs.readFileSync(pathm.join(E.RAIZ, archivo), 'utf8')).meta || {}).generado || '').slice(0, 10);
      ok(v && v === generado, k + ': la version del catalogo (' + v + ') es la fecha del archivo (' + generado + '); si actualizas el catalogo sin cambiarla, esta prueba falla');
    });
    const vs = (/version: '([0-9-]+)',\s*jsonPath: '\.\/data\/agencias-shalom\.json'/.exec(fa) || [])[1];
    ok(new RegExp("const SHALOM_CATALOGO_V='" + vs + "';").test(E.leerReal('panel/pedidos/pedido-form.js')), 'el panel usa la misma version de Shalom que el formulario');
  }

  bloque('Cabeceras de seguridad en todo');
  {
    ok(/max-age=31536000/.test(val('**', 'Strict-Transport-Security')), 'HSTS: siempre HTTPS');
    ok(val('**', 'X-Content-Type-Options') === 'nosniff', 'nosniff');
    ok(val('**', 'X-Frame-Options') === 'DENY', 'nadie puede meter las paginas dentro de otra (clickjacking)');
    ok(val('**', 'Referrer-Policy') === 'strict-origin-when-cross-origin', 'los links con codigo no se filtran a otros sitios');
    ok(val('**', 'Cross-Origin-Opener-Policy') === 'same-origin-allow-popups', 'aislamiento, sin romper el inicio con Google');
    const pp = val('**', 'Permissions-Policy');
    ok(/camera=\(self\)/.test(pp) && /microphone=\(self\)/.test(pp) && /geolocation=\(self\)/.test(pp) && /payment=\(\)/.test(pp),
       'camara, microfono y ubicacion solo para la propia pagina; pagos, ninguno');
  }

  bloque('El servidor ya acepta la direccion nueva');
  {
    ok(/"https:\/\/total-tools-24ce8\.web\.app"/.test(E.leerReal('functions/index.js')), 'web.app en la lista de origenes');
  }

  bloque('Vista previa: cada sitio con su propia imagen (tarjeta grande en WhatsApp)');
  {
    const c = E.leerReal('herramientas/construir.mjs');
    ok(/const SITIO = process\.argv\[3\] \|\| SITIO_FUENTE;/.test(c) && /t\.split\(SITIO_FUENTE\)\.join\(SITIO\)/.test(c),
       'construir cambia la direccion de la vista previa por la del sitio que se publica');
    ['formulario.html', 'seguimiento.html'].forEach((f) => {
      const t = E.leerCrudo(f);
      ok(/<meta property="og:url" content="https:\/\/jarryllanoski\.github\.io\/Total-Tools-\//.test(t) &&
         /og:image:secure_url/.test(t) && /<meta property="og:image:type" content="image\/png">/.test(t),
         f + ': og:url, secure_url y tipo de imagen');
    });
  }
};
