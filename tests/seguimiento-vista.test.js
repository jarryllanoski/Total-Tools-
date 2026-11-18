'use strict';
const vm = require('vm');
const E = require('./_entorno.js');
const PE = require('../cliente/pasos-envio.js');

module.exports = async ({bloque, ok}) => {
  const V = (status, tipo, sh, extra) => PE.vista(Object.assign({status}, extra || {}), tipo, sh);
  const fila = (tipo, status) => { const v = V(status, tipo); return v.paso >= 0 ? v.pasos[v.paso] : v.pill; };

  bloque('Pasos según el tipo de envío');
  {
    ok(PE.PASOS.agencia.join() === 'Recibido,Preparando,En camino,En destino,Recogido', 'agencia (Olva, Marvisur, Dinsides…): con En destino');
    ok(PE.PASOS.encomienda.join() === PE.PASOS.agencia.join(), 'otras agencias / encomienda: igual que agencia');
    ok(PE.PASOS.delivery.join() === 'Recibido,Preparando,En reparto,Entregado', 'delivery: En reparto y Entregado');
    ok(PE.PASOS.retiro.join() === 'Recibido,Preparando,Listo para recoger,Recogido', 'retiro: Listo para recoger y Recogido');
    ok(PE.pasosDe('raro').join() === PE.PASOS.agencia.join() && V('ENVIADO', 'raro').tipo === 'agencia', 'un tipo desconocido se trata como agencia');
  }

  bloque('Cada etiqueta del panel en cada tipo');
  {
    const tabla = {
      'NUEVO PEDIDO': ['Recibido', 'Recibido', 'Recibido'],
      'EN PROCESO': ['Recibido', 'Recibido', 'Recibido'],
      'POR ALISTAR': ['Preparando', 'Preparando', 'Preparando'],
      'ALISTADO': ['Preparando', 'Preparando', 'Listo para recoger'],
      'ENVIADO': ['En camino', 'En reparto', 'Listo para recoger'],
      'LLEGÓ A DESTINO': ['En destino', 'En reparto', 'Listo para recoger'],
      'PENDIENTE DE PAGO': ['En destino', 'En reparto', 'Listo para recoger'],
      'FINALIZADO': ['Recogido', 'Entregado', 'Recogido'],
      'ENTREGADO': ['Recogido', 'Entregado', 'Recogido'],
    };
    Object.keys(tabla).forEach((st) => {
      const [a, d, r] = tabla[st];
      ok(fila('agencia', st) === a && fila('delivery', st) === d && fila('retiro', st) === r,
         st + ' → agencia «' + a + '», delivery «' + d + '», retiro «' + r + '»');
    });
    ok(V('', 'agencia').paso === 0 && V('raro', 'delivery').paso === 0, 'sin etiqueta o una desconocida: Recibido');
    ok(V('CANCELADO', 'agencia').paso === -1 && V('CANCELADO', 'agencia').tono === 'gris', 'cancelado: sin pasos');
    ok(/motorizado está llegando/.test(V('LLEGÓ A DESTINO', 'delivery').titulo), 'delivery que llegó: «el motorizado está llegando»');
    ok(/DNI del destinatario/.test(V('LLEGÓ A DESTINO', 'agencia').sub), 'agencia en destino: recoger con el DNI');
    ok(!/recog/i.test(Object.keys(tabla).map((s) => V(s, 'delivery').titulo + V(s, 'delivery').sub).join(' ')), '⚠️ delivery nunca dice «recoger»');
  }

  bloque('Subestado: falta pagar');
  {
    const a = V('PENDIENTE DE PAGO', 'agencia'), d = V('PENDIENTE DE PAGO', 'delivery'), r = V('PENDIENTE DE PAGO', 'retiro');
    ok(a.tono === 'aviso' && /recogerlo\./.test(a.aviso), 'agencia: aviso para poder recogerlo');
    ok(d.tono === 'aviso' && /al recibir/.test(d.aviso), 'delivery: se paga al recibir');
    ok(/en tienda/.test(r.aviso), 'retiro: en tienda');
    ok(V('ENVIADO', 'agencia').aviso === '', 'sin deuda, sin aviso');
  }

  bloque('Shalom: solo el cuadro de Shalom desde que entra a la agencia (A)');
  {
    ok(V('ALISTADO', 'agencia', {esShalom: true, idx: -1, registrado: true}).modo === 'pasos', 'registrado pero sin dejar: todavía los pasos');
    ok(/Shalom Pro/.test(V('ALISTADO', 'agencia', {esShalom: true, idx: -1, registrado: true}).sub), 'y dice que ya está registrado en Shalom Pro');
    [0, 1, 2, 3].forEach((i) => ok(V('ENVIADO', 'agencia', {esShalom: true, idx: i}).modo === 'shalom', 'Shalom fase ' + i + ': solo Shalom'));
    ok(V('PENDIENTE DE PAGO', 'agencia', {esShalom: true, idx: 2}).aviso !== '', 'en Shalom y debe: el aviso de pago va encima del cuadro');
    ok(V('FINALIZADO', 'agencia', {esShalom: true, idx: 2}).modo === 'pasos' && V('FINALIZADO', 'agencia', {esShalom: true, idx: 2}).pill === 'Recogido',
       'si la tienda ya lo finalizó, manda la tienda (Shalom puede tardar en actualizar)');
    ok(V('CANCELADO', 'agencia', {esShalom: true, idx: 1}).modo === 'pasos', 'cancelado manda sobre todo');
    ok(V('ENVIADO', 'agencia', {esShalom: false, idx: 1}).modo === 'pasos', 'otro courier con un dato raro no se vuelve Shalom');
  }

  const src = E.trozoCliente('function _confianzaShalom(){', 'function _segMostrar(cual){');
  const ctx = vm.createContext({esc: (x) => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')});
  vm.runInContext(src + ';this.P=_pasosHtml;this.C=_confianzaShalom;', ctx);

  bloque('Confianza: que no parezca estafa');
  {
    const c = ctx.C();
    ok(/Envío oficial con Shalom Pro/.test(c) && /nuestra cuenta empresa/.test(c), 'dice que es Shalom Pro y que es de la cuenta empresa');
    ok(/href="https:\/\/shalom\.com\.pe\/" target="_blank" rel="noopener" aria-label="Verificar en shalom\.com\.pe"/.test(c) && /Compruébalo con tu guía y código/.test(c), 'invita a verificarlo en la web oficial de Shalom');
    const r0 = E.trozoCliente('function renderTrackResult(ship, code){', 'function init(){');
    ok(/<div class="seg-shalom">\$\{shalomBlock\}<\/div>\$\{_confianzaShalom\(\)\}/.test(r0), 'primero el estado de Shalom, y debajo la verificación (junto a la guía y el código)');
    ok(/Enlace privado: solo tú lo tienes\. Por tu seguridad, tu DNI se muestra oculto\./.test(E.leerReal('cliente/seguimiento.js')), 'y explica por qué el DNI sale oculto');
  }

  bloque('La barra de pasos');
  {
    const h = ctx.P(V('ENVIADO', 'agencia'));
    ok((h.match(/class="hecho"/g) || []).length === 2 && /class="ahora" aria-current="step"/.test(h) && (h.match(/<li/g) || []).length === 5, 'agencia: 5 pasos, dos hechos y el actual');
    const f = ctx.P(V('FINALIZADO', 'delivery'));
    ok((f.match(/class="hecho"/g) || []).length === 4 && !/ahora/.test(f), 'entregado: todos con ✓');
    ok(ctx.P(V('CANCELADO', 'agencia')) === '', 'cancelado: sin barra');
  }

  bloque('Pantalla y efectos livianos');
  {
    const r = E.trozoCliente('function renderTrackResult(ship, code){', 'function init(){');
    ok(/PasosEnvio\.vista\(ship, narr\.tipo, \{esShalom: narr\.esShalom,/.test(r), 'la tarjeta usa la configuración por courier');
    ok(/data-vista="inicio"/.test(r) && /data-vista="docs" hidden/.test(r) && /_segNavHtml\(\)/.test(r), 'Inicio y Documentos, con menú abajo');
    ok(/_segMostrar\(window\._segVista === 'docs'/.test(r), 'la actualización automática no cambia de sección ni salta arriba');
    ok(/if\(primera\) setTimeout\(function\(\)\{ document\.body\.classList\.add\('seg-quieto'\); \}, 1600\);/.test(r), 'las animaciones solo al entrar, no cada 30 s');
    const css = E.leerReal('cliente/cliente.css');
    ok(/body\.seg:not\(\.seg-quieto\) \.track-card/.test(css) && /@keyframes segLatido/.test(css), 'entrada suave y el paso actual late');
    ok(/@media\(prefers-reduced-motion:reduce\)\{body\.seg \*,body\.seg \*:after\{animation:none!important\}\}/.test(css), 'sin animaciones si el celular pide menos movimiento');
    ok(/\.seg-shalom\{--bg:#080810;--card:#0f0f1a;[^}]*--purple:#a78bfa/.test(css), 'el cuadro de Shalom conserva sus colores');
    ok(/body\.seg #tt-narr\{bottom:calc\(74px/.test(css), 'Delfi y Heavy no tapan el menú');
    const se = E.leerCrudo('seguimiento.html');
    ok(se.indexOf('cliente/pasos-envio.js') > 0 && se.indexOf('cliente/pasos-envio.js') < se.indexOf('cliente/seguimiento.js'), 'el módulo carga antes del seguimiento');
  }

  bloque('Panel: documentos en el orden del formulario');
  {
    const l = E.leerReal('panel/pantalla/lista.js');
    const a = l.indexOf('doc-lbl">BOLETA'), b = l.indexOf('doc-lbl">EMBALADO'), c = l.indexOf('doc-lbl">GUÍA');
    ok(a > 0 && a < b && b < c, 'Boleta / Factura · Embalado · Guía / Ticket');
  }
};
