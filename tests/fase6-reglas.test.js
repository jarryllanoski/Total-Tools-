/**
 * tests/fase6-reglas.test.js — una regla, un archivo
 * ===================================================
 * Fase 6 (11/11/2026). Dos reglas que estaban escritas en varios sitios y
 * divergían, ahora en uno:
 *   · functions/shalomEstado.js — qué etapa es cada texto de Shalom (panel,
 *     servidor y seguimiento del cliente). Antes «En reparto» movía la
 *     etiqueta a LLEGÓ A DESTINO y al cliente le decía «en camino».
 *   · functions/codigoSeguimiento.js — el «#123456» del WhatsApp, del link y
 *     de la etiqueta. Antes un pedido antiguo sin fecha salía con 6 dígitos
 *     en el link y con 4 en la etiqueta impresa.
 * Y que NADIE vuelva a escribir una copia en otro archivo.
 */
'use strict';
const E = require('./_entorno.js');
const fs = require('fs');
const path = require('path');
const SE = require('../functions/shalomEstado.js');
const ET = require('../functions/etiquetas.js');
const CS = require('../functions/codigoSeguimiento.js');

module.exports = async ({bloque, ok}) => {

  bloque('Qué etapa es cada texto de Shalom');

  const CASOS = [
    // [texto, rango (mueve etiquetas), fase.idx (lo que ve el cliente), demora]
    ['En origen', 0, 0], ['En tránsito', 1, 1], ['En destino', 2, 2],
    ['En reparto', 2, 2], ['Entregado', 3, 3],
    ['Demora de envíos', null, 1, true], ['Retraso en ruta', null, 1, true],
    ['Recibido en agencia de origen', 0, 0], ['Llegó a destino', 2, 2],
    ['En camino a destino', 1, 1], ['Registrado', 0, 0],
    ['Recibido por el destinatario', 3, 3], ['Disponible para recojo', 2, 2],
    ['', null, -1], ['algo raro', null, -1],
  ];
  CASOS.forEach(([t, r, f, dem]) => {
    ok(SE.rango(t) === r && SE.fase(t).idx === f && SE.fase(t).demora === !!dem,
       '«' + t + '» → etapa ' + r + ', se ve ' + f + (dem ? ' (con demora)' : ''));
  });

  bloque('Panel, servidor y cliente dicen LO MISMO');

  {
    // El seguimiento del cliente, ejecutado con la regla compartida.
    const src = E.trozoCliente('var _FASE_VISTA = [', 'function _shalomTrackingBlock(');
    // eslint-disable-next-line no-new-func
    const fase = new Function('window', src + ';return _shalomFase;')({ShalomEstado: SE});
    CASOS.forEach(([t]) => {
      ok(ET.rangoDeTexto(t) === SE.rango(t), 'etiquetas (panel y barrido) = la regla: «' + t + '»');
      ok(fase(t).idx === SE.fase(t).idx, 'seguimiento del cliente = la regla: «' + t + '»');
    });
    ok(fase('En reparto').idx === 2 && /reparto/.test(fase('En reparto').sub),
       '⚠️ «En reparto»: el cliente ya no ve «en camino» (era la divergencia)');
    const p = {status: 'ENVIADO', cost: '0'};
    ok(ET.etiquetaDeRango(ET.rangoDeTexto('En reparto'), p) === 'LLEGÓ A DESTINO', 'y el panel lo lleva a LLEGÓ A DESTINO: coinciden');
    ok(fase('Demora de envíos').idx === 1 && /demora/.test(fase('Demora de envíos').sub),
       'una demora se ve «sigue en camino» y no mueve etiquetas');
    const b = E.leer('functions/barrido.js');
    ok(/shalomEstado\.rango\(p\.trackingStatus\) === 3/.test(b) && !/ENTREGAD/.test(b.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')),
       'el barrido pregunta «¿entregado?» a la misma regla');
  }

  bloque('Ningún otro archivo interpreta los textos de Shalom');

  {
    const archivos = [];
    const recorrer = (d) => fs.readdirSync(path.join(E.RAIZ, d), {withFileTypes: true}).forEach((x) => {
      const r = path.join(d, x.name);
      if (x.isDirectory()) { if (!/^(node_modules|tests|\.git|data|docs|shalom-local)$/.test(x.name)) recorrer(r); }
      else if (/\.(js|html)$/.test(x.name)) archivos.push(r);
    });
    recorrer('.');
    const copias = archivos.filter((f) => !/shalomEstado\.js$/.test(f)).filter((f) => {
      const sinComentarios = E.leerReal(f).replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/.*$/gm, '$1');
      return /TRANSIT|REPART|ENTREG\|/.test(sinComentarios) && /\/[^/\n]*(TRANSIT|REPART)[^/\n]*\//.test(sinComentarios);
    });
    ok(copias.length === 0, 'sin expresiones propias para TRANSITO/REPARTO fuera de shalomEstado.js' +
       (copias.length ? ': ' + copias.join(', ') : ''));
  }

  bloque('El código de seguimiento: uno solo');

  {
    ok(CS.de('id_1762790123456', '2026-11-10T10:00:00Z') === '123456', 'desde el 2026-08-08: 6 dígitos');
    ok(CS.de('id_1752000009ABC', '2026-07-01') === '9ABC', 'antes: los 4 últimos (las etiquetas impresas no cambian)');
    ok(CS.de('id_1752000001234', '') === '1234', '⚠️ sin fecha (solo pasa en los antiguos): 4, igual que la etiqueta');
    ok(CS.de('', 'x') === '', 'sin id: nada');
    // Las tres caras usan la misma: link/WhatsApp (comun.js) y etiqueta (print.js).
    const c = E.leerReal('cliente/comun.js');
    const pr = E.leer('print.js');
    // eslint-disable-next-line no-new-func
    const cseg = new Function('window', c.slice(c.indexOf('function codigoSeg('), c.indexOf('/* El TIPO de envío')) +
        ';return codigoSeg;')({CodigoSeguimiento: CS});
    // eslint-disable-next-line no-new-func
    const base = new Function('window', pr.slice(pr.indexOf('function _codigoBase(s){'), pr.indexOf('/* ★ ¿SE IMPRIMIÓ?')) +
        ';return _codigoBase;')({CodigoSeguimiento: CS});
    [['id_1762790123456', '2026-11-10'], ['id_1752000009ABC', '2026-07-01'], ['id_1752000001234', '']].forEach(([id, f]) => {
      ok(cseg(id, f) === base({id, createdAt: f}), 'link y etiqueta dan el mismo código: ' + id + ' (' + (f || 'sin fecha') + ')');
    });
    ok(/codigoSeg\(order\.id, order\.createdAt \|\| new Date\(\)\.toISOString\(\)\)/.test(E.leerReal('cliente/form-enviar.js')),
       'el pedido recién creado (sin fecha aún) es de hoy: 6 dígitos');
    const todo = ['cliente/comun.js', 'print.js', 'cliente/seguimiento.js', 'cliente/form-enviar.js'].map(E.leerReal).join('\n')
        .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    ok(!/2026-08-08|slice\(-6\)/.test(todo), 'ni la fecha de corte ni el «últimos 6» se repiten en otro archivo');
  }

  bloque('Las páginas cargan las reglas antes de usarlas');

  {
    const ix = E.leerReal('index.html');
    const i = (h, f) => h.indexOf('<script src="' + f);
    ok(i(ix, 'functions/shalomEstado.js') > 0 && i(ix, 'functions/shalomEstado.js') < i(ix, 'functions/etiquetas.js'),
       'panel: shalomEstado.js antes que etiquetas.js (que la usa)');
    ok(i(ix, 'functions/codigoSeguimiento.js') > 0 && i(ix, 'functions/codigoSeguimiento.js') < i(ix, 'print.js'), 'panel: el código antes que print.js');
    ['formulario.html', 'seguimiento.html'].forEach((h) => {
      const t = E.leerReal(h);
      ok(i(t, 'functions/codigoSeguimiento.js') > 0 && i(t, 'functions/codigoSeguimiento.js') < i(t, 'cliente/comun.js'),
         h + ': el código antes que comun.js');
    });
    const se = E.leerReal('seguimiento.html');
    ok(i(se, 'functions/shalomEstado.js') > 0 && i(se, 'functions/shalomEstado.js') < i(se, 'cliente/seguimiento.js'),
       'seguimiento.html: la regla de estados antes que el seguimiento');
  }
};
