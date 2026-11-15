'use strict';
const {execSync} = require('child_process');
const E = require('./_entorno.js');

const PAGINAS = ['index.html', 'formulario.html', 'seguimiento.html'];

function politica(html) {
  const m = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html);
  if (!m) return null;
  const out = {};
  m[1].split(';').map((x) => x.trim()).filter(Boolean).forEach((d) => {
    const [k, ...v] = d.split(/\s+/);
    out[k] = v;
  });
  return out;
}

function permite(lista, url) {
  const u = new URL(url);
  return (lista || []).some((f) => {
    if (f === "'self'" || f.startsWith("'")) return false;
    const m = /^(https?:)\/\/(\*\.)?([^/]+)$/.exec(f);
    if (!m || m[1] !== u.protocol) return false;
    return m[2] ? u.hostname.endsWith('.' + m[3]) : u.hostname === m[3];
  });
}

module.exports = async ({bloque, ok}) => {
  const pols = PAGINAS.map((f) => [f, E.leerCrudo(f)]);
  const P = politica(pols[0][1]);

  bloque('CSP: la misma regla en las tres paginas, antes que todo');
  {
    pols.forEach(([f, h]) => {
      ok(!!politica(h), f + ' tiene CSP');
      ok(h.indexOf('Content-Security-Policy') < h.indexOf('<script') && h.indexOf('Content-Security-Policy') < h.indexOf('<link') &&
         /<meta charset="UTF-8">\n<meta http-equiv="Content-Security-Policy"/.test(h), f + ': va justo despues del charset, antes de cualquier script o estilo');
      ok(JSON.stringify(politica(h)) === JSON.stringify(P), f + ': identica a la del panel');
    });
  }

  bloque('CSP: lo que bloquea');
  {
    ok(P['object-src'].join() === "'none'" && P['base-uri'].join() === "'self'" && P['form-action'].join() === "'self'", 'sin plugins, sin cambiar la direccion base, formularios solo al propio sitio');
    ok(P['default-src'].join() === "'self'", 'todo lo no listado: solo el propio sitio');
    const todas = Object.values(P).flat();
    ok(!todas.includes('*') && !todas.some((x) => /^http:/.test(x)) && !todas.includes('https:') && !todas.includes("'unsafe-eval'"),
       'sin comodines totales, sin http inseguro, sin «cualquier https» y sin eval');
    ok(P['script-src'].includes("'wasm-unsafe-eval'"), 'WebAssembly permitido (lector de texto de las guias), eval no');
    ok(!P['connect-src'].some((x) => /\*/.test(x)), '⚠️ las conexiones van solo a servidores con nombre exacto: los datos no pueden salir a otro lado');
    const fb = JSON.parse(E.leerReal('firebase.json'));
    const todo = (fb.hosting.headers.find((h) => h.source === '**') || {}).headers || [];
    ok(todo.some((h) => h.key === 'Content-Security-Policy' && h.value === "frame-ancestors 'none'"), 'Firebase: nadie puede meter las paginas en un marco (frame-ancestors)');
  }

  bloque('CSP: cada servicio externo que usa el codigo esta en la lista');
  {
    const archivos = execSync('git ls-files', {cwd: E.RAIZ}).toString().split('\n')
        .filter((f) => /\.(js|html|css)$/.test(f) && !/^(tests|functions|herramientas|docs)\//.test(f) && f !== 'medir-registro.js');
    const usos = {connect: new Set(), script: new Set(), img: new Set()};
    archivos.forEach((f) => {
      const t = E.leerReal(f).replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/g, '');
      for (const m of t.matchAll(/fetch\(\s*['"`](https:\/\/[^'"`$?]+)/g)) usos.connect.add(m[1]);
      for (const m of t.matchAll(/\b(?:const|var|let)\s+\w*(?:URL|BASE|API|URL_\w+|SRC|WORKER)\w*\s*=\s*['"`](https:\/\/[^'"`$]+)/g)) {
        (/\.js$/.test(m[1]) || /firebasejs|cdnjs|jsdelivr/.test(m[1]) ? usos.script : usos.connect).add(m[1]);
      }
      for (const m of t.matchAll(/\.src\s*=\s*['"`](https:\/\/[^'"`$]+)/g)) usos.script.add(m[1]);
      for (const m of t.matchAll(/return 'https:\/\/(img\.youtube\.com|drive\.google\.com)[^']*'/g)) usos.img.add('https://' + m[1] + '/x');
      for (const m of t.matchAll(/const qrUrl = v => `(https:\/\/[^`$]+)/g)) usos.img.add(m[1]);
    });
    const listas = [['connect', 'connect-src'], ['script', 'script-src'], ['img', 'img-src']];
    listas.forEach(([k, dir]) => {
      const faltan = [...usos[k]].filter((u) => !permite(P[dir], u.replace('{s}', 'a')));
      ok(usos[k].size > 0 && faltan.length === 0, dir + ': ' + usos[k].size + ' direcciones del codigo, todas permitidas' + (faltan.length ? ' — FALTAN: ' + faltan.join(', ') : ''));
    });
    ok(permite(P['img-src'], 'https://a.tile.openstreetmap.org/1/1/1.png') && permite(P['img-src'], 'https://lh3.googleusercontent.com/x'),
       'mapas y miniaturas de Drive (que redirigen a googleusercontent)');
    ok(permite(P['connect-src'], 'https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz') && P['worker-src'].includes('blob:'),
       'el lector de texto (Tesseract) baja su idioma y corre en un worker');
    ok(['https://accounts.google.com', 'https://www.google.com', 'https://recaptcha.google.com'].every((o) => P['frame-src'].includes(o)),
       'boton de Google y reCAPTCHA en sus marcos');
    ok(!permite(P['connect-src'], 'https://evil.example/x') && !permite(P['script-src'], 'https://evil.example/x.js') && !permite(P['img-src'], 'https://evil.example/p.gif'),
       'un dominio extraño no entra por ningun lado');
  }
};
