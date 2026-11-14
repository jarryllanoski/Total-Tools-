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

  bloque('Firebase desde GitHub: sin claves y solo si las pruebas pasan');
  {
    const fw = E.leerReal('.github/workflows/firebase.yml');
    const i = (t) => fw.indexOf(t);
    ok(/id-token: write/.test(fw) && /contents: read/.test(fw) && !/contents: write/.test(fw), 'permisos minimos: leer el codigo y pedir identidad');
    ok(/google-github-actions\/auth@v2/.test(fw) && /workload_identity_provider: projects\/256086864182\/locations\/global\/workloadIdentityPools\/github\/providers\/total-tools/.test(fw),
       'identidad por Workload Identity Federation');
    ok(!/credentials_json|secrets\./.test(fw), '⚠️ ninguna clave guardada en GitHub: no hay nada que robar');
    ok(i('node tests/correr.js') > 0 && i('node tests/correr.js') < i('google-github-actions/auth'),
       'las pruebas corren antes de pedir permisos: si fallan, no se toca Google');
    ok(i('--only hosting') < i('--only functions'), 'primero la web, despues el servidor');
    ok(/firebase-tools@\d+\.\d+\.\d+/.test(fw), 'Firebase CLI con version fija');
    ok(!/--force/.test(fw), '⚠️ sin --force: nunca borra funciones ni cambia nada sin preguntar');
    ok((fw.match(/--project total-tools-24ce8 --non-interactive/g) || []).length === 2, 'proyecto explicito y sin preguntas');
    ok(/on:\n  push:\n    branches: \[main\]\n  workflow_dispatch:/.test(fw), 'publica sola con cada push a main (y a mano si hace falta)');
    ok((fw.match(/if: steps\.cambios\.outputs\.servidor == 'true'/g) || []).length === 2, 'el servidor solo si toca');
    ok(/fetch-depth: 0/.test(fw), 'trae la historia para comparar que cambio');
    ok(!/run: \|[\s\S]*\$\{\{/.test(fw.slice(fw.indexOf('- name: Que cambio'), fw.indexOf('- uses: actions/setup-node'))),
       'el script no mezcla expresiones de GitHub: los datos llegan por variables de entorno');
    ok(/group: firebase/.test(fw) && /cancel-in-progress: false/.test(fw), 'nunca dos publicaciones a la vez, y ninguna se corta a medias');
  }

  bloque('Firebase desde GitHub: el servidor se publica solo cuando cambia functions/');
  {
    const {execFileSync} = require('child_process');
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const fw = E.leerReal('.github/workflows/firebase.yml');
    const trozo = fw.slice(fw.indexOf('- name: Que cambio'), fw.indexOf('- uses: actions/setup-node'));
    const guion = trozo.slice(trozo.indexOf('run: |') + 7).split('\n')
        .map((l) => l.replace(/^ {10}/, '')).join('\n');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cambios-'));
    const git = (...a) => execFileSync('git', a, {cwd: dir, stdio: 'pipe'}).toString().trim();
    git('init', '-q');
    git('config', 'user.email', 'prueba@example.com');
    git('config', 'user.name', 'prueba');
    const confirmar = (archivo) => {
      fs.mkdirSync(path.dirname(path.join(dir, archivo)), {recursive: true});
      fs.writeFileSync(path.join(dir, archivo), String(Math.random()));
      git('add', '-A');
      git('commit', '-q', '-m', archivo);
      return git('rev-parse', 'HEAD');
    };
    const correr = (env) => {
      const salida = path.join(dir, '.salida');
      fs.writeFileSync(salida, '');
      execFileSync('bash', ['-c', guion], {cwd: dir, stdio: 'pipe',
        env: Object.assign({PATH: process.env.PATH, GITHUB_OUTPUT: salida, EVENTO: 'push', MANUAL: '', ANTES: ''}, env)});
      return (/servidor=(\w*)/.exec(fs.readFileSync(salida, 'utf8')) || [])[1];
    };
    const c0 = confirmar('index.html');
    confirmar('cliente/form-base.js');
    ok(correr({ANTES: c0}) === 'false', 'push que solo cambia la web: el servidor NO se publica');
    const c1 = git('rev-parse', 'HEAD');
    confirmar('functions/index.js');
    ok(correr({ANTES: c1}) === 'true', 'push que cambia functions/: el servidor SI se publica');
    const c2 = git('rev-parse', 'HEAD');
    confirmar('docs/nota.md');
    confirmar('functions/barrido.js');
    confirmar('index.html');
    ok(correr({ANTES: c2}) === 'true', 'varios commits en un push, uno toca functions/: se publica');
    ok(correr({ANTES: '0000000000000000000000000000000000000000'}) === 'true', 'rama nueva o historia desconocida: se publica por si acaso');
    ok(correr({ANTES: 'deadbeef'}) === 'true', 'un commit que no existe: se publica por si acaso');
    ok(correr({EVENTO: 'workflow_dispatch', MANUAL: 'true'}) === 'true' &&
       correr({EVENTO: 'workflow_dispatch', MANUAL: 'false'}) === 'false', 'a mano: lo que marques');
    fs.rmSync(dir, {recursive: true, force: true});
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
