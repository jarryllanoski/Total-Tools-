'use strict';
const vm = require('vm');
const E = require('./_entorno.js');

module.exports = async ({bloque, ok}) => {
  const src = E.trozoCliente('var _SEG_PASOS = {', 'function _segMostrar(cual){');
  const ctx = vm.createContext({esc: (x) => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')});
  vm.runInContext(src + ';this.V=_vistaPedido;this.P=_pasosHtml;', ctx);
  const V = (status, tipo, sh, extra) => ctx.V(Object.assign({status}, extra || {}), tipo || 'agencia', sh === undefined ? -1 : sh);

  bloque('Seguimiento: los 4 pasos salen del estado del panel');
  {
    ok(V('NUEVO PEDIDO').paso === 0 && V('EN PROCESO').paso === 0 && V('').paso === 0, 'nuevo o en proceso: Recibido');
    ok(V('POR ALISTAR').paso === 1 && V('ALISTADO').paso === 1, 'por alistar o alistado: Preparando');
    ok(/Shalom/.test(V('ALISTADO', 'agencia', -1, {shalomGuia: '104201894'}).sub), 'alistado con guía de Shalom: lo dice, sin adelantar el paso');
    ok(V('ENVIADO').paso === 2 && V('ENVIADO').titulo === '¡Tu pedido va en camino!', 'enviado: En camino');
    ok(V('LLEGÓ A DESTINO').paso === 2 && /destino/.test(V('LLEGÓ A DESTINO').titulo), 'llegó a destino: sigue en camino, con su mensaje');
    ok(V('PENDIENTE DE PAGO').paso === 2 && V('PENDIENTE DE PAGO').tono === 'aviso', 'pendiente de pago: en camino y aviso de pago');
    ok(V('FINALIZADO').paso === 3 && V('ENTREGADO').paso === 3 && V('FINALIZADO').tono === 'ok', 'finalizado o entregado: Entregado');
    ok(V('CANCELADO').paso === -1 && ctx.P(V('CANCELADO')) === '', 'cancelado: sin barra de pasos');
    ok(/motorizado/.test(V('ENVIADO', 'delivery').sub), 'delivery: habla del motorizado');
  }

  bloque('Seguimiento: ya en Shalom, manda el estado de Shalom');
  {
    ok(V('ALISTADO', 'agencia', 0).paso === 2 && V('ALISTADO', 'agencia', 1).paso === 2, 'Shalom ya lo recibió o lo lleva: En camino aunque el panel diga ALISTADO');
    ok(V('ENVIADO', 'agencia', 3).paso === 3, 'Shalom dice entregado: Entregado');
    ok(V('ENVIADO', 'agencia', 2).titulo === '¡Tu pedido va en camino!', 'en destino de Shalom: el detalle lo da el cuadro de Shalom');
  }

  bloque('Seguimiento: retiro en tienda');
  {
    ok(V('ALISTADO', 'retiro').paso === 2 && V('ALISTADO', 'retiro').pill === 'Listo', 'alistado: Listo para recoger');
    ok(V('FINALIZADO', 'retiro').pill === 'Recogido', 'finalizado: Recogido');
    ok(V('ALISTADO', 'retiro').pasos.join() === 'Recibido,Preparando,Listo,Recogido', 'con sus propios pasos');
  }

  bloque('Seguimiento: la barra de pasos');
  {
    const h = ctx.P(V('ENVIADO'));
    ok((h.match(/class="hecho"/g) || []).length === 2 && /class="ahora" aria-current="step"/.test(h), 'dos hechos y el actual marcado (también para lectores de pantalla)');
    const f = ctx.P(V('FINALIZADO'));
    ok((f.match(/class="hecho"/g) || []).length === 4 && !/ahora/.test(f), 'entregado: los cuatro con ✓');
  }

  bloque('Seguimiento: estructura de la pantalla');
  {
    const r = E.trozoCliente('function renderTrackResult(ship, code){', 'function init(){');
    ok(/data-vista="inicio"/.test(r) && /data-vista="docs" hidden/.test(r) && /_segNavHtml\(\)/.test(r), 'Inicio y Documentos, con menú abajo');
    ok(/abrirAyudaTrack\(\)/.test(E.trozoCliente('function _segNavHtml(){', 'function renderTrackResult(')), 'Ayuda abre la misma ayuda de siempre (Toby y estados)');
    ok(/_segMostrar\(window\._segVista === 'docs'/.test(r), 'la actualización automática no cambia de sección ni salta arriba');
    ok(/class="seg-codigo" onclick="_copyTrack\(this\.getAttribute\('data-c'\), this\)" data-c="\$\{esc\(tc\)\}"/.test(r), 'el número de boleta o código se copia con un toque');
    const css = E.leerReal('cliente/cliente.css');
    ok(/\.seg-shalom\{--bg:#080810;--card:#0f0f1a;[^}]*--purple:#a78bfa/.test(css), 'el cuadro de Shalom conserva sus colores de siempre');
    ok(/body\.seg #tt-narr\{bottom:calc\(74px/.test(css), 'Delfi y Heavy no tapan el menú');
    ok(/body\.seg\{[^}]*--marca:#02787c/.test(css) && /<meta name="theme-color" content="#f3f6f7">/.test(E.leerCrudo('seguimiento.html')), 'colores de la marca, solo en el seguimiento');
    ok(/document\.body\.classList\.add\('seg'\)/.test(E.leerReal('cliente/seguimiento.js')), 'el tema claro se aplica solo en esta página');
  }

  bloque('Panel: documentos en el orden del formulario');
  {
    const l = E.leerReal('panel/pantalla/lista.js');
    const a = l.indexOf('doc-lbl">BOLETA'), b = l.indexOf('doc-lbl">EMBALADO'), c = l.indexOf('doc-lbl">GUÍA');
    ok(a > 0 && a < b && b < c, 'Boleta / Factura · Embalado · Guía / Ticket');
  }
};
