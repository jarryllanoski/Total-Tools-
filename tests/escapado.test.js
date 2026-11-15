'use strict';
const vm = require('vm');
const E = require('./_entorno.js');

module.exports = async ({bloque, ok}) => {
  const lista = E.leerReal('panel/pantalla/lista.js');
  const ctx = vm.createContext({});
  vm.runInContext([/function escH\(s\)\{.*\}/, /function escJs\(s\)\{.*\}/, /function escU\(u\)\{.*\}/]
      .map((r) => (r.exec(lista) || [''])[0]).join('\n'), ctx);

  bloque('escJs: seguro dentro de onclick="…(\'…\')"');
  {
    const malos = ['x\'); alert(1); (\'', 'x"><img src=x onerror=alert(1)>', 'a\\b', 'línea\nnueva', '</script><script>alert(1)</script>', '&#39;); alert(1);//'];
    malos.forEach((m) => {
      const e = ctx.escJs(m);
      ok(!/['"<>&\n]/.test(e), 'sin comillas, < > & ni saltos crudos: ' + JSON.stringify(m.slice(0, 20)));
      ok(vm.runInNewContext('\'' + e + '\'') === m, 'y JavaScript lo lee igual al original: ' + JSON.stringify(m.slice(0, 20)));
    });
  }

  bloque('escU: solo links que no ejecutan codigo');
  {
    const si = ['https://firebasestorage.googleapis.com/x', 'http://x.example', 'blob:https://total-tools-24ce8.web.app/1', 'data:image/jpeg;base64,AA', 'data:application/pdf;base64,AA'];
    const no = ['javascript:alert(1)', '  JavaScript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:x', 'blob:null/1', '//evil.example', 'data:image/svg+xml,<svg onload=alert(1)>'];
    ok(si.every((u) => ctx.escU(u) !== '#'), 'https, http, blob propio, imagenes y PDF: si');
    ok(no.every((u) => ctx.escU(u) === '#'), '⚠️ javascript:, HTML, vbscript, blob ajeno, sin protocolo y SVG (puede llevar codigo): no');
    ok(ctx.escU('https://x.example/"onmouseover="alert(1)') === 'https://x.example/&quot;onmouseover=&quot;alert(1)', 'y escapa comillas dentro del link');
  }

  bloque('Los puntos que el ataque simulado encontro, cerrados');
  {
    ok(/onclick="QRTracking\.abrir\(\\''\+escJs\(guia\)\+'\\'\)"/.test(E.leerReal('panel/shalom/qrtracking.js')),
       '⚠️ el boton QR de la guia de Shalom (ejecutaba codigo)');
    ok(/copyPhone\('\$\{escJs\(s\.phone\)\}'\)/.test(lista), 'copiar telefono');
    ok(/printGroup\('\$\{escJs\(courier\)\}'\)/.test(lista), 'imprimir por courier');
    ok(/quitarAsignacion\('\$\{escJs\(it\.pedidoId\)\}','\$\{escJs\(/.test(E.leerReal('panel/config/proveedores.js')), 'quitar asignacion en proveedores');
    const docs = E.leerReal('panel/pedidos/pedido-docs.js');
    ok(!/(src|href)="\$\{doc\.d\}"/.test(docs) && (docs.match(/escU\(doc\.d\)/g) || []).length >= 3, 'documentos del pedido: imagen y descarga con escU');
    ok(/const phone='51'\+String\(s\.phone\|\|''\)\.replace\(\/\\D\/g,''\);/.test(docs), 'el link de WhatsApp lleva solo digitos');
    ok(/function _docUrl\(d\)/.test(docs) && /if\(!_docUrl\(doc&&doc\.d\)\)\{toast\(/.test(docs) && /a\.href=_docUrl\(doc\.d\)/.test(docs),
       'abrir o descargar un documento valida el link antes');
    ok(/<a href="\$\{escU\(l\.u\)\}" target="_blank"/.test(docs), 'links del formulario de edicion');
    ok(/'<a href="' \+ escU\(n\.link\) \+ '"/.test(E.leerReal('panel/pedidos/notify.js')), 'links en notificaciones');
    ok(/ship\.links\.filter\(l=>l&&\/\^https:\\\/\\\/\/i\.test/.test(E.leerReal('cliente/seguimiento.js')), 'seguimiento del cliente: solo links https');
  }

  bloque('Todos los limpiadores escapan comillas y apostrofos');
  {
    const prueba = '<a href="x" title=\'y\'>&';
    const fuentes = [
      ['panel/pedidos/print.js', /function esc\(s\)\{[\s\S]*?\n\}/],
      ['panel/pedidos/notify.js', /function _esc\(s\)\{[\s\S]*?\n {2}\}/],
      ['panel/pantalla/ayuda.js', /function _esc\(s\)\{[\s\S]*?\n {2}\}/],
      ['panel/pantalla/dashboard.js', /function _esc\(str\)\{[\s\S]*?\n\}/],
      ['panel/pantalla/voz.js', /function esc\(s\) \{[\s\S]*?\n {2}\}/],
      ['panel/pantalla/floatpanel.js', /function _esc\(s\)\{[\s\S]*?\n {2}\}/],
      ['panel/shalom/guias.js', /function _escapar\(t\) \{[\s\S]*?\n {2}\}/],
      ['panel/shalom/tracking.js', /function _esc\(s\)\{.*\}/],
      ['panel/pedidos/delivery.js', /function _esc\(s\)\{.*\}/],
      ['narrador/narrador.js', /var esc = function\(t\)\{.*\};/],
      ['narrador/etiqueta.js', /var esc=function\(s\)\{.*\};/],
      ['cliente/comun.js', /function esc\(s\)\{.*\}/],
    ];
    fuentes.forEach(([f, re]) => {
      const src = (re.exec(E.leerReal(f)) || [''])[0];
      const nombre = (/(?:function|var) (\w+)/.exec(src) || [])[1];
      let salida = '';
      try { salida = vm.runInNewContext(src + ';' + nombre + '(' + JSON.stringify(prueba) + ')'); } catch (e) { salida = 'ERROR ' + e.message; }
      ok(salida === '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;', f + ' (' + nombre + ')');
    });
  }
};
