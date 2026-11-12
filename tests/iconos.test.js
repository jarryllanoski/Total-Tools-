'use strict';
const fs = require('fs');
const path = require('path');
const E = require('./_entorno.js');

const TIPOGRAFICOS = new Set(['→', '←', '↑', '↓', '↕', '↗', '↩', '↪', '↺', '↻', '➜', '✓', '✕', '★', '●',
  '▾', '▲', '▼', '◀', '☰', '⌫', '▦', '☐', '◎', '○']);
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{25A0}-\u{25FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/gu;

function sinComentarios(t) {
  return t;
}

module.exports = async ({bloque, ok}) => {
  const fuente = E.leerReal('panel/pantalla/iconos.js');
  const M = JSON.parse((/var M = (\{[\s\S]*?\});/.exec(fuente) || [])[1] || '{}');
  const D = JSON.parse((/var D = (\{[\s\S]*?\});\n/.exec(fuente) || [])[1] || '{}');

  bloque('Cada emoji de la interfaz tiene su icono');
  {
    const raiz = E.RAIZ;
    const archivos = ['index.html', 'formulario.html', 'seguimiento.html', 'auth.js', 'loading-screen.js']
        .concat(E.modulosPanel())
        .concat(fs.readdirSync(path.join(raiz, 'cliente')).filter((f) => f.endsWith('.js')).map((f) => 'cliente/' + f))
        .concat(fs.readdirSync(path.join(raiz, 'narrador')).filter((f) => f.endsWith('.js')).map((f) => 'narrador/' + f))
        .filter((f) => f !== 'panel/pantalla/iconos.js');
    const faltan = new Set();
    archivos.forEach((f) => {
      (sinComentarios(E.leerReal(f)).match(EMOJI) || []).forEach((c) => {
        if (!TIPOGRAFICOS.has(c) && !M[c]) faltan.add(c + ' (' + f + ')');
      });
    });
    ok(faltan.size === 0, 'ningun emoji sin icono' + (faltan.size ? ': ' + [...faltan].slice(0, 12).join(', ') : ''));
    ok(Object.values(M).every((v) => D[v[0]]), 'cada icono asignado esta dibujado');
    ok(Object.keys(D).length >= 90, 'solo los iconos usados (' + Object.keys(D).length + ')');
  }

  bloque('Rapido: un elemento plano por icono');
  {
    ok(/mask-image/.test(fuente) && !/createElementNS/.test(fuente) && !/<use /.test(fuente),
       'mascara CSS, sin <svg><use> (que crea un arbol interno por icono)');
    ok(/molde\[k\]\.cloneNode\(false\)/.test(fuente), 'cada icono se clona de un molde');
    ok(/if\(!RE\.test\(raiz\.textContent\)\) return;/.test(fuente), 'no recorre lo que no tiene emojis');
    ok(/p\.closest\(SALTAR\)/.test(fuente) && /textarea/.test(fuente), 'no toca campos de texto ni lo editable');
    ok(/if\(p\.nodeName === 'OPTION'\)\{ n\.nodeValue = sinEmojis\(v\); return; \}/.test(fuente),
       'en las listas desplegables el emoji se quita');
    ok(/\['alert', 'confirm', 'prompt'\]/.test(fuente), 'y en los mensajes del navegador');
  }

  bloque('Cargado en las tres paginas');
  {
    const idx = E.leerCrudo('index.html');
    ok(idx.indexOf('auth.js') < idx.indexOf('panel/pantalla/iconos.js') &&
       idx.indexOf('panel/pantalla/iconos.js') < idx.indexOf('appcheck.js'), 'en el panel, justo despues del login');
    ['formulario.html', 'seguimiento.html'].forEach((f) =>
      ok(/<script defer src="panel\/pantalla\/iconos\.js\?v=\d+"><\/script>\n<\/body>/.test(E.leerCrudo(f)), f + ' lo carga al final'));
    ok(/\.ic\{[^}]*mask:no-repeat center\/contain/.test(E.leerReal('panel.css')), 'estilo en panel.css');
    ok(/\.ic\{[^}]*mask:no-repeat center\/contain/.test(E.leerReal('cliente/cliente.css')), 'estilo en cliente.css');
    ok(/\.chip \.ic,\.as-courier-chip \.ic\{margin-right:5px\}/.test(E.leerReal('panel.css')), 'separado del texto en los chips');
    ok(!/class="ic"/.test(idx), 'nadie mas usa la clase ic');
  }

  bloque('El codigo que leia el texto de los botones sigue funcionando');
  {
    ok(/Iconos\.textoOriginal\(chip\)/.test(E.leerReal('panel/pantalla/floatpanel.js')), 'panel flotante: su icono sale del original');
    ok(/var txt = btn \? btn\.innerHTML : '';/.test(E.leerReal('panel/shalom/ticket.js')), 'ticket: el boton vuelve con su icono');
    ok(/const antes = btn\.innerHTML;/.test(E.leerReal('panel/shalom/shalom-ajustes.js')), 'correr ahora: igual');
  }
};
