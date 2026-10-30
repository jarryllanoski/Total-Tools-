/**
 * tests/carga-unico.test.js — pantalla de carga y un solo envío
 * =============================================================
 * 30/10/2026.
 *   · La barra de «Iniciando fábrica…» ya no se detiene en el 88 % (parecía
 *     un fallo): avanza siempre, corre al final y cambia el mensaje con el
 *     tiempo (Harrison et al. 2007 / 2010).
 *   · Logos más livianos; el delfín sin el cuadrado de fondo.
 *   · Con un solo envío configurado no se pregunta «¿Cómo quieres recibir?».
 */
'use strict';
const E = require('./_entorno.js');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

module.exports = async ({bloque, ok}) => {
  const ld = E.leer('narrador/loader.js');
  const form = E.leer('formulario.html');

  bloque('La barra de carga nunca se queda quieta');

  {
    const tick = ld.slice(ld.indexOf('  function tick(){'), ld.indexOf('  requestAnimationFrame(tick);'));
    // Se simula la barra sin servidor: 9 s a 60 cuadros por segundo.
    const ctx = vm.createContext({hidden: false, pct: 0, start: 0, Date: {now: () => ctx.t}, t: 0,
      MENSAJES: [], msg: null, bar: {style: {}}, fade() {}, raf: 0, requestAnimationFrame() {}});
    vm.runInContext(tick.replace('function tick(){', 'function tick(){') + ';this.tick=tick;', ctx);
    const anchos = [];
    for (let f = 0; f < 540; f++) { ctx.t = f * 16; ctx.tick(); if (f % 60 === 59) anchos.push(+ctx.pct.toFixed(2)); }
    ok(anchos.every((a, i) => i === 0 || a > anchos[i - 1]), '⚠️ cada segundo avanza (nunca se congela): ' + anchos.join(' → '));
    ok(anchos[anchos.length - 1] < 100, 'y no llega al 100 % sin que la página esté lista');
    ctx.hidden = true;
    let n = 0; while (ctx.pct < 99.5 && n < 60) { ctx.tick(); n++; }
    ok(n < 20, 'al estar lista, corre al 100 % en menos de 20 cuadros (' + n + ')');
    ok(/\[1200,'Preparando tus opciones de envío…'\],\[3000,'Casi listo…'\],\[6000,'Tu conexión va lenta, un momento más…'\]/.test(ld),
       'el mensaje cambia con el tiempo y dice la verdad si la conexión va lenta');
    ok(/repeating-linear-gradient\(-45deg/.test(ld) && /@keyframes ttfrayas\{from\{background-position:17px 0\}to\{background-position:0 0\}\}/.test(ld),
       'rayas que se mueven hacia atrás');
    ok(/fetchpriority="high"/.test(ld) && /\?v=3/.test(ld), 'el logo se pide con prioridad (y versión nueva)');
    ok(/setTimeout\(done, CAP\)/.test(ld), 'el tope de seguridad sigue');
    ok(/narrador\/loader\.js\?v=2/.test(form), 'el formulario pide la versión nueva del cargador');
  }

  bloque('Logos más livianos; el delfín sin fondo');

  {
    const tam = (n) => fs.statSync(path.join(__dirname, '../narrador', n)).size;
    const total = ['load-heavy.webp', 'load-super.webp', 'load-nauti.webp', 'load-toby.webp'].reduce((a, n) => a + tam(n), 0);
    ok(total < 110000, 'los 4 logos pesan ' + Math.round(total / 1024) + ' KB (antes 152 KB)');
    const delfin = fs.readFileSync(path.join(__dirname, '../narrador/load-super.webp'));
    const vp8x = delfin.indexOf('VP8X');
    ok(vp8x > 0 && (delfin[vp8x + 8] & 0x10) !== 0, '⚠️ el delfín tiene transparencia (sin el cuadrado turquesa)');
  }

  bloque('Un solo envío configurado: no se pregunta cómo recibir');

  {
    ok(/_wzUnico = active\.length===1 \? active\[0\] : '';/.test(form), 'se detecta con la lista ya filtrada (config o «foto» del link)');
    ok(/function wzSeq\(\)\{ var s=_wzNeedDest\(\)\?\[1,2,3,4\]:\[1,2,4\]; return _wzUnico \? s\.slice\(1\) : s; \}/.test(form),
       'la secuencia salta el paso 1 (y la barra cuenta bien: 1 de 3, o 1 de 2 en retiro)');
    const ini = form.slice(form.indexOf('function wzInit('), form.indexOf('/* ─── EXPOSE GLOBALS'));
    ok(ini.indexOf('if(_wzUnico) pickCourier(_wzUnico);') > 0 && ini.indexOf('if(_wzUnico) pickCourier(_wzUnico);') < ini.indexOf("cs.addEventListener('change'"),
       '⚠️ se elige ANTES de escuchar el cambio: sin auto-avance ni teclado al abrir');
    ok(/wzShow\(wzSeq\(\)\[0\]\);/.test(ini), 'empieza en el primer paso de la secuencia');
    ok(/var primero = wzSeq\(\)\[0\]===step;/.test(form) && /b\.style\.display=primero\?'none':''/.test(form), 'en el primer paso no hay «← Atrás»');
    ok(/\$\{_wzUnico\?'<div id="courierBadge" style="display:none"><\/div>':''\}/.test(form) && /Envío: \$\{esc\(lbl\)\}/.test(form),
       'arriba se dice el envío en una línea');
    ok(/if\(e\.unico\) pasos=pasos\.filter\(function\(p\)\{ return p\.n!==1; \}\);/.test(form), 'la Ayuda de Toby tampoco muestra el paso de elegir');
  }
};
