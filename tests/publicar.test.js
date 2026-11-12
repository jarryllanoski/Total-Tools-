'use strict';
const E = require('./_entorno.js');

module.exports = async ({bloque, ok}) => {
  const wf = E.leerReal('.github/workflows/publicar.yml');
  const cons = E.leerReal('herramientas/construir.mjs');

  bloque('Publicar: pruebas, construir, revisar y recien publicar');
  {
    const i = (t) => wf.indexOf(t);
    ok(i('node tests/correr.js') > 0 && i('node tests/correr.js') < i('node herramientas/construir.mjs dist'),
       'las pruebas van antes de construir: si fallan, no se publica');
    ok(i('node --check') > i('construir.mjs') && i('node --check') < i('upload-pages-artifact'), 'la sintaxis se revisa antes de subir');
    ok(/needs: construir/.test(wf) && /actions\/deploy-pages@v4/.test(wf), 'publicar solo si construir salio bien');
    ok(/branches: \[main\]/.test(wf) && /pages: write/.test(wf) && /id-token: write/.test(wf), 'en cada push a main, con los permisos de Pages');
    ok(/"esbuild": "0\.24\.0"/.test(E.leerReal('herramientas/package.json')) && E.existe('herramientas/package-lock.json'),
       'esbuild con version fija y lockfile (npm ci)');
  }

  bloque('Construir: que se publica y como');
  {
    ok(/minify: true/.test(cons) && /legalComments: 'none'/.test(cons), 'JS y CSS minificados');
    ok(!/format:|bundle:/.test(cons), 'sin empaquetar ni cambiar el formato: los scripts clasicos siguen compartiendo sus globales');
    ok(/'\?v=' \+ huella\(hechos\.get\(f\)\)/.test(cons), 'la version de cada archivo es la huella de su contenido');
    ok(/if \(f\.startsWith\('functions\/'\)\) return usadas\.has\(f\);/.test(cons),
       'de functions/ solo se publica lo que cargan las paginas (el codigo del servidor no)');
    ok(/'tests\/', 'docs\/', 'herramientas\/', '\.github\/', 'shalom-local\/'/.test(cons), 'pruebas, docs y herramientas no se publican');
    ok(/firestore\.rules/.test(cons) && /storage\.rules/.test(cons) && /firebase\.json/.test(cons), 'ni la configuracion de Firebase');
    ok(/Las paginas usan archivos que no se publican/.test(cons), 'si una pagina pide algo que no se publica, la construccion falla');
    ok(/git ls-files/.test(cons), 'solo lo que esta en git (nada suelto de una PC)');
  }
};
