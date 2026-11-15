import {execSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {transform} from 'esbuild';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = path.resolve(RAIZ, process.argv[2] || 'dist');
const SITIO_FUENTE = 'https://jarryllanoski.github.io/Total-Tools-/';
const SITIO = process.argv[3] || SITIO_FUENTE;
if (!/^https:\/\/[a-z0-9.-]+\/([A-Za-z0-9_-]+\/)?$/.test(SITIO)) throw new Error('Sitio invalido: ' + SITIO);
const PAGINAS = ['index.html', 'formulario.html', 'seguimiento.html'];
const FUERA_CARPETAS = ['tests/', 'docs/', 'herramientas/', '.github/', 'shalom-local/', 'functions/'];
const FUERA_ARCHIVOS = new Set(['medir-registro.js', 'firebase.json', 'firestore.rules', 'storage.rules',
  'firestore.indexes.json', '.firebaserc', '.gitignore', '.gitattributes']);

const leer = (f) => fs.readFileSync(path.join(RAIZ, f));
const huella = (b) => createHash('sha256').update(b).digest('hex').slice(0, 10);

function referencias() {
  const usadas = new Set();
  for (const p of PAGINAS) {
    const t = leer(p).toString('utf8');
    for (const m of t.matchAll(/(?:src|href)="([^"?#]+)(?:\?[^"]*)?"/g)) {
      if (!/^(https?:|data:|mailto:|tel:)/.test(m[1])) usadas.add(m[1]);
    }
  }
  return usadas;
}

function publicables(usadas) {
  const todos = execSync('git ls-files', {cwd: RAIZ}).toString().split('\n').filter(Boolean);
  return todos.filter((f) => {
    if (FUERA_ARCHIVOS.has(f) || /(^|\/)node_modules\//.test(f) || /\.md$/.test(f) || /(^|\/)package(-lock)?\.json$/.test(f)) return false;
    if (f.startsWith('functions/')) return usadas.has(f);
    return !FUERA_CARPETAS.some((c) => f.startsWith(c));
  });
}

const RECURSO = /(["'])([A-Za-z0-9_][A-Za-z0-9_./-]*\.(?:webp|png|jpe?g|svg|gif))(\?v=[A-Za-z0-9]+)?(?=["'?])/g;

function recursoPublicado(f, nombre, publicados) {
  const candidatos = [path.posix.join(path.posix.dirname(f), nombre), path.posix.normalize(nombre.replace(/^\.\//, ''))];
  return candidatos.find((c) => publicados.has(c)) || '';
}

function versionarRecursos(f, texto, publicados, sinVersion) {
  return texto.replace(RECURSO, (m, comilla, nombre, version) => {
    const real = recursoPublicado(f, nombre, publicados);
    if (!real) return m;
    if (!version) {
      sinVersion.push(f + ': ' + nombre);
      return m;
    }
    return comilla + nombre + '?v=' + huella(leer(real));
  });
}

async function procesar(f, publicados, sinVersion) {
  const b = leer(f);
  if (f.endsWith('.js')) {
    const fuente = versionarRecursos(f, b.toString('utf8'), publicados, sinVersion);
    const r = await transform(fuente, {loader: 'js', minify: true, legalComments: 'none', charset: 'utf8'});
    return Buffer.from(r.code);
  }
  if (f.endsWith('.css')) {
    const r = await transform(b.toString('utf8'), {loader: 'css', minify: true, legalComments: 'none', charset: 'utf8'});
    return Buffer.from(r.code);
  }
  return b;
}

async function construir() {
  fs.rmSync(SALIDA, {recursive: true, force: true});
  const usadas = referencias();
  const lista = publicables(usadas);
  const sinVersion = [];
  for (const p of PAGINAS) {
    const t = leer(p).toString('utf8');
    for (const m of t.matchAll(/(?:src|href)="([^"#]+\.(?:js|css))(\?[^"]*)?"/g)) {
      if (!/^https?:/.test(m[1]) && !/[?&]v=/.test(m[2] || '')) sinVersion.push(p + ': ' + m[1]);
    }
  }
  if (sinVersion.length) throw new Error('Scripts o estilos sin ?v= (quedarian un año en cache): ' + sinVersion.join(', '));
  const faltan = [...usadas].filter((u) => !lista.includes(u));
  if (faltan.length) throw new Error('Las paginas usan archivos que no se publican: ' + faltan.join(', '));
  const hechos = new Map();
  const publicados = new Set(lista);
  const recursosSinVersion = [];
  let antes = 0, despues = 0;
  for (const f of lista) {
    if (PAGINAS.includes(f)) continue;
    const out = await procesar(f, publicados, recursosSinVersion);
    hechos.set(f, out);
    if (/\.(js|css)$/.test(f)) {
      antes += leer(f).length;
      despues += out.length;
    }
  }
  if (recursosSinVersion.length) throw new Error('Imagenes sin ?v= en los scripts (quedarian 7 dias en cache): ' + recursosSinVersion.join(', '));
  for (const p of PAGINAS) {
    const t = leer(p).toString('utf8').replace(/((?:src|href)=")([^"?#]+)\?v=[^"]*"/g, (m, a, f) =>
      hechos.has(f) ? a + f + '?v=' + huella(hechos.get(f)) + '"' : m);
    hechos.set(p, Buffer.from(t.split(SITIO_FUENTE).join(SITIO)));
  }
  for (const [f, b] of hechos) {
    const destino = path.join(SALIDA, f);
    fs.mkdirSync(path.dirname(destino), {recursive: true});
    fs.writeFileSync(destino, b);
  }
  fs.writeFileSync(path.join(SALIDA, '.nojekyll'), '');
  console.log(hechos.size + ' archivos en ' + path.relative(RAIZ, SALIDA) + ' · JS y CSS: ' +
    Math.round(antes / 1024) + ' KB → ' + Math.round(despues / 1024) + ' KB');
}

construir().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
