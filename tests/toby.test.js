/**
 * tests/toby.test.js — Toby en TODAS las ayudas (formulario, seguimiento, panel)
 * =============================================================================
 * 30/10/2026: una sola pieza (narrador/toby.js) para las tres; personalizado
 * con lo que ya está en pantalla (cero lecturas); la imagen solo al abrir;
 * y las ayudas del panel al día con lo que hace el código hoy.
 */
'use strict';
const E = require('./_entorno.js');
const vm = require('vm');

module.exports = async ({bloque, ok}) => {
  const form = E.leer('formulario.html');
  const panel = E.leer('index.html');
  const tb = E.leer('narrador/toby.js');
  const ay = E.leer('ayuda.js');

  bloque('Una sola pieza de Toby para las tres ayudas');

  {
    const estilos = [];
    const ctx = vm.createContext({document: {currentScript: {src: 'https://x/narrador/toby.js'}, getElementById: (id) => estilos.indexOf(id) >= 0,
      createElement: () => ({}), head: {appendChild: (e) => estilos.push('tobyCss')}}, window: {}});
    vm.runInContext(tb, ctx);
    const T = ctx.window.Toby;
    const h = T.globo('Hola <b>Ana</b>', 'Guía del panel');
    ok(/class="toby"/.test(h) && /Toby · Guía del panel/.test(h) && /Hola <b>Ana<\/b>/.test(h), 'el globo con su rol y el texto');
    ok(/src="https:\/\/x\/narrador\/toby\.webp\?v=1"/.test(h), 'la imagen sale junto al script (sirve en el formulario y en el panel)');
    T.globo('otra vez');
    ok(estilos.length === 1, 'el CSS se pone UNA vez');
    ok(/narrador\/toby\.js/.test(form) && /<script src="narrador\/toby\.js\?v=1"><\/script>\n<script src="ayuda\.js/.test(panel),
       'lo cargan el formulario y el panel (antes de ayuda.js)');
    ok(!/class="tb-av"/.test(form) && !/#ayudaFormOv \.tb\{/.test(form), 'sin la copia vieja de Toby dentro del formulario');
    ok(!/new Image|fetch\(/.test(tb), 'no pide nada por su cuenta: la imagen solo al pintar el globo (al abrir una ayuda)');
  }

  bloque('Seguimiento: Toby habla del estado REAL de ese pedido');

  {
    const i = form.indexOf('function _ayudaTrackContenido(');
    const src = form.slice(i, form.indexOf('function abrirAyudaTrack(', i));
    const hn = form.slice(form.indexOf('function _holaNombre('), form.indexOf('/* La hoja de ayuda'));
    const ctx = vm.createContext({esc: (x) => String(x).replace(/</g, '&lt;')});
    vm.runInContext(hn + src + ';this.C=_ayudaTrackContenido;', ctx);
    const C = ctx.C;
    const r1 = C('agencia', true, 'Av X', 'POR ALISTAR', 'MARIA ARIAS');
    ok(/¡Hola, Maria! Tu pedido: <b>POR ALISTAR<\/b>\. Estamos empacando/.test(r1.toby), 'saluda por su nombre y dice el estado actual');
    ok(r1.estados[r1.actual].k.indexOf('POR ALISTAR') >= 0, '«ESTÁS AQUÍ» en la fila del estado actual');
    const r2 = C('retiro', false, 'Av Primavera 123', 'ALISTADO', '');
    ok(/Ya puedes pasar a recogerlo a nuestra tienda en <b>Av Primavera 123<\/b>/.test(r2.toby), 'retiro listo: dónde recoger');
    const r3 = C('delivery', false, '', 'ENVIADO', '<img>');
    ok(r3.toby.indexOf('<img>') < 0, 'el nombre va escapado');
    ok(C('agencia', true, '', 'RARO', '').actual === -1, 'un estado desconocido no marca nada');
    const todo = JSON.stringify([r1, r2, r3]);
    ok(!/clave de recojo|shalomClave/i.test(todo.replace(/LA CLAVE DE RECOJO NO SE MENCIONA/g, '')), '⚠️ nunca menciona la clave de recojo');
    ok(/window\._trackEstado = ship\.status\|\|'';/.test(form) && /window\._trackNombre = ship\.name\|\|'';/.test(form),
       'usa lo que ya llegó al abrir el seguimiento (cero lecturas)');
    const ab = form.slice(form.indexOf('function abrirAyudaTrack('), form.indexOf('function _courierLabel('));
    ok(/_toby\(c\.toby, 'Guía de seguimiento'\)/.test(ab) && /ESTÁS AQUÍ/.test(ab), 'la ayuda del seguimiento lleva a Toby y marca el estado');
  }

  bloque('Formulario: saluda por el nombre escrito');

  {
    const ab = form.slice(form.indexOf('function abrirAyudaForm('), form.indexOf('/* ─── Ayuda de la vista de SEGUIMIENTO'));
    ok(/_toby\(\(window\._ttFrozen \? '' : _holaNombre\(\(\$\('f_name'\)\|\|\{value:''\}\)\.value\)\) \+ c\.toby, 'Guía de pedidos'\)/.test(ab),
       'con el nombre ya escrito: «¡Hola, Jarlyn!»');
  }

  bloque('Panel: Toby en cada sección, con el negocio y el consejo clave');

  {
    ok(/html \+= window\.Toby\.globo\('¡Hola'\+\(neg\?', '\+_esc\(neg\):''\)\+'! 👋 '\+_fmt\(dice\), 'Guía del panel'\);/.test(ay),
       'saluda con el nombre del negocio (escapado) y dice el consejo de la sección');
    ok(/var dice = doc\.toby \|\| \(doc\.tips && doc\.tips\[0\]\)/.test(ay), 'si una sección no tiene consejo propio, usa su primer tip');
    ['envios', 'tracking', 'config', 'documentos', 'cambioEtiquetaQR', 'linkPersonalizado', 'respaldo', 'shalomConfig', 'registroShalom'].forEach((k) => {
      const i = ay.indexOf('    ' + k + ': {');
      ok(i > 0 && /toby: '/.test(ay.slice(i, i + 400)), k + ': tiene su consejo de Toby');
    });
  }

  bloque('Ayudas del panel al día con el código');

  {
    ok(!/autoEstadoDoc: \{/.test(ay), 'fuera «Auto-avanzar estado» (la función se retiró)');
    const doc = ay.slice(ay.indexOf('    documentos: {'), ay.indexOf('    cambioEtiquetaQR: {'));
    ok(!/Al subirlo, pasa a/.test(doc) && /El estado ya no se mueve solo al subir documentos/.test(doc), 'Documentos: subir no cambia el estado');
    ok(/espera <b>1 minuto<\/b>/.test(doc), 'Jalar ticket: espera de 1 minuto');
    const lp = ay.slice(ay.indexOf('    linkPersonalizado: {'), ay.indexOf('    importExport: {'));
    ok(/Cuando el cliente <b>confirma su pedido<\/b>/.test(lp) && !/se bloquea después de abrirse una vez/.test(lp),
       'Link personalizado: se gasta al CONFIRMAR, no al abrir');
    ok(/Este link/.test(lp) && /un solo<\/b> envío/.test(lp), 'Link personalizado: «Este link» y un solo envío');
    const sc = ay.slice(ay.indexOf('    shalomConfig: {'), ay.indexOf('    registroShalom: {'));
    ok(!/en reconstrucción/.test(sc) && /Puerta a Shalom/.test(sc) && /Seguimiento automático/.test(sc) && /Mover etiquetas/.test(sc),
       'Configuración Shalom: Puerta, Seguimiento automático y Mover etiquetas (ya no «en reconstrucción»)');
    const tr = ay.slice(ay.indexOf('    tracking: {'), ay.indexOf('    nuevoPedido: {'));
    ok(!/cada <b>12 horas<\/b>/.test(tr) && /08:00, 11:30, 16:30 y 19:00/.test(tr), 'Tracking: horarios del seguimiento automático');
    ok(/var ACTUALIZADO = '2026-10-30';/.test(ay) && /ayuda\.js\?v=9/.test(panel), 'fecha y versión nuevas');
  }
};
