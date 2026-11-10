/**
 * tests/_entorno.js — lo que hace falta para probar código de navegador en Node
 * ============================================================================
 * El panel son <script> clásicos, sin build ni módulos. No se pueden `require`.
 * Estas ayudas los cargan igual que lo haría el navegador —evaluándolos contra
 * un `window` de mentira— para poder probar EL CÓDIGO QUE SE DESPLIEGA y no una
 * copia que se desincroniza.
 *
 * Sin dependencias a propósito: la raíz del proyecto no tiene package.json ni
 * node_modules. Una prueba que necesita `npm install` es una prueba que un día
 * deja de correr.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');

/** Lee un archivo del proyecto, tal cual está en disco. */
function leerReal(rel) {
  return fs.readFileSync(path.join(RAIZ, rel), 'utf8');
}

/* ★ EL PANEL EN MÓDULOS (Fase 3, 10/11/2026). El código que vivía dentro de
   index.html y en config.js pasó a panel/*.js, SIN cambiar una línea. Para
   las pruebas, esos dos nombres siguen significando lo que ejecuta el
   navegador:
     · index.html → el HTML con cada <script src="panel/…"> puesto EN LÍNEA,
       en su sitio (el mismo orden de ejecución);
     · config.js  → sus diez módulos, uno detrás de otro.
   Así las pruebas siguen apuntando al código de verdad, y una prueba que
   quiera el HTML real usa `leerReal('index.html')`. */
// Fase 7 (11/11/2026): los módulos del panel van en carpetas por capa.
const CONFIG_JS = ['pedidos/pin-papelera', 'pedidos/pedido-docs', 'pedidos/pedido-form',
  'shalom/shalom-registro', 'shalom/shalom-origen', 'pedidos/pedido-reniec',
  'pedidos/pedido-guardar', 'compartir/excel', 'compartir/links-tokens',
  'config/configuracion'].map((n) => 'panel/' + n + '.js');
/** Todos los módulos del panel ('panel/capa/x.js'), en cualquier carpeta. */
function modulosPanel() {
  const out = [];
  const ir = (d) => fs.readdirSync(path.join(RAIZ, d), {withFileTypes: true}).forEach((x) => {
    if (x.isDirectory()) ir(d + '/' + x.name);
    else if (/\.js$/.test(x.name)) out.push(d + '/' + x.name);
  });
  ir('panel');
  return out.sort();
}
function leer(rel) {
  if (rel === 'config.js') return CONFIG_JS.map(leerReal).join('\n');
  const t = leerReal(rel);
  // formulario.html: sus módulos (cliente/form-*.js, Fase 5) vuelven a su sitio.
  if (rel === 'formulario.html') {
    return t.replace(/<script src="(cliente\/form-[\w-]+\.js)\?v=\d+"><\/script>/g,
        (m, f) => '<script>\n' + leerReal(f) + '\n</script>');
  }
  if (rel !== 'index.html') return t;
  return t.replace(/<script src="(panel\/[\w/-]+\.js)\?v=\d+"><\/script>/g,
      (m, f) => '<script>\n' + leerReal(f) + '\n</script>');
}

/** ¿Existe? */
function existe(rel) {
  return fs.existsSync(path.join(RAIZ, rel));
}

/* Un DOM mínimo: solo lo que el panel toca de verdad. No es jsdom —es medio
   megabyte de dependencia para lo que aquí son cuarenta líneas— y obliga a
   declarar qué se está usando, que es información útil en sí misma. */
function domFalso(opciones) {
  opciones = opciones || {};
  const porId = {};
  const tarjetas = {};

  function nodo(id) {
    const n = {
      id, style: {}, textContent: '', disabled: false, _clases: new Set(),
      _hijos: [],
      classList: {
        add: (c) => n._clases.add(c),
        remove: (c) => n._clases.delete(c),
        toggle: (c, on) => { if (on === undefined) on = !n._clases.has(c);
                             on ? n._clases.add(c) : n._clases.delete(c); return on; },
        contains: (c) => n._clases.has(c)
      },
      appendChild: (h) => { n._hijos.push(h); return h; },
      setAttribute: (k, v) => { n['attr_' + k] = v; },
      getAttribute: (k) => (k === 'data-id' ? n.id : n['attr_' + k]),
      querySelector: () => null,
      addEventListener: () => {},
      getBoundingClientRect: () => n._rect || {left:0, right:0, top:0, bottom:0, width:0, height:0},
      get innerHTML() { return n._html || ''; },
      set innerHTML(v) {
        n._html = v;
        // Los nodos que el HTML declara con id="…" pasan a existir, como en el
        // navegador. Sin esto, el código que pinta y luego busca su propio
        // <span id> no se podría probar.
        (String(v).match(/id="([^"]+)"/g) || []).forEach((m) => {
          const hid = m.slice(4, -1);
          if (!porId[hid]) porId[hid] = nodo(hid);
          porId[hid].textContent = '';
        });
      }
    };
    return n;
  }

  (opciones.ids || []).forEach((id) => { porId[id] = nodo(id); });
  (opciones.tarjetas || []).forEach((id) => {
    const chk = nodo('chk_' + id);
    const card = nodo(id);
    card.querySelector = (sel) => (String(sel).indexOf('.chk') >= 0 ? chk : null);
    tarjetas[id] = card;
  });

  const doc = {
    getElementById: (id) => porId[id] || null,
    querySelector: (sel) => {
      const m = /\.card\[data-id="(.*)"\]$/.exec(String(sel));
      if (m) return tarjetas[m[1].replace(/\\(.)/g, '$1')] || null;
      return null;
    },
    querySelectorAll: (sel) => (String(sel).indexOf('.card') >= 0
      ? Object.values(tarjetas) : []),
    createElement: () => nodo('creado'),
    addEventListener: () => {},
    body: { appendChild: () => {}, removeChild: () => {} },
    readyState: 'complete'
  };
  return { doc, porId, tarjetas, nodo };
}

/* Evalúa un archivo del proyecto contra un `window` dado.
   `extra` inyecta variables adicionales en el ámbito del archivo (para los que
   dependen de globales que en el navegador declara index.html). */
function cargar(rel, win, extra) {
  extra = extra || {};
  const nombres = ['window'].concat(Object.keys(extra));
  const valores = [win].concat(Object.keys(extra).map((k) => extra[k]));
  // eslint-disable-next-line no-new-func
  new Function(...nombres, leer(rel))(...valores);
  return win;
}

/* Saca un trozo de código de un archivo, entre dos marcas. Se usa para probar
   funciones que viven dentro de index.html: se extrae EL TEXTO REAL del
   archivo desplegado, así que una prueba no puede quedar verde contra una
   copia vieja. */
function trozo(rel, desde, hasta) {
  const t = leer(rel);
  const i = t.indexOf(desde);
  if (i < 0) throw new Error('no se encontró el inicio "' + desde + '" en ' + rel);
  const j = hasta ? t.indexOf(hasta, i) : t.length;
  if (hasta && j < 0) throw new Error('no se encontró el final "' + hasta + '" en ' + rel);
  return t.slice(i, hasta ? j : undefined);
}

/* ★ TODO EL CÓDIGO DEL CLIENTE (Fase 2, 10/11/2026). El formulario y el
   seguimiento se separaron en formulario.html, seguimiento.html y cliente/*
   (CSS y JS compartidos). Las pruebas que miran «lo que corre en la página
   del cliente» leen esto: el texto de todos, uno detrás de otro. */
// En el orden en que el navegador los ejecuta: comun.js va antes que el
// código de cada página (lo usan las dos).
const CLIENTE = ['cliente/comun.js', 'formulario.html', 'seguimiento.html',
  'cliente/seguimiento.js', 'cliente/cliente.css'];
function cliente() {
  return CLIENTE.map((f) => '\n/* ==== ' + f + ' ==== */\n' + leer(f)).join('\n');
}
function trozoCliente(desde, hasta) {
  for (const f of CLIENTE) {
    const t = leer(f);
    const i = t.indexOf(desde);
    if (i < 0) continue;
    const j = hasta ? t.indexOf(hasta, i) : t.length;
    if (hasta && j < 0) throw new Error('no se encontró el final "' + hasta + '" en ' + f);
    return t.slice(i, hasta ? j : undefined);
  }
  throw new Error('no se encontró el inicio "' + desde + '" en el código del cliente');
}

/* Los bloques <script> sin src de un .html, concatenados. */
function scriptsEnLinea(rel) {
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  const t = leer(rel);
  let m, out = '';
  while ((m = re.exec(t))) out += m[1] + '\n';
  return out;
}

module.exports = {cliente, trozoCliente, CLIENTE, leerReal, CONFIG_JS, modulosPanel, RAIZ, leer, existe, cargar, trozo, scriptsEnLinea, domFalso };
