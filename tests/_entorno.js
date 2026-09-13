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

/** Lee un archivo del proyecto. */
function leer(rel) {
  return fs.readFileSync(path.join(RAIZ, rel), 'utf8');
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

/* Los bloques <script> sin src de un .html, concatenados. */
function scriptsEnLinea(rel) {
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  const t = leer(rel);
  let m, out = '';
  while ((m = re.exec(t))) out += m[1] + '\n';
  return out;
}

module.exports = { RAIZ, leer, existe, cargar, trozo, scriptsEnLinea, domFalso };
