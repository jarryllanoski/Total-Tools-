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
    ok(JSON.stringify(h.predeploy) === JSON.stringify(['npm --prefix herramientas ci', 'node herramientas/construir.mjs dist https://total-tools-24ce8.web.app/']),
       'antes de publicar instala y construye');
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
