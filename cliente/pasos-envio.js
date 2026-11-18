'use strict';

(function(raiz, fabrica){
  if(typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.PasosEnvio = fabrica();
})(typeof globalThis !== 'undefined' ? globalThis : window, function(){
  var PASOS = {
    agencia:    ['Recibido', 'Preparando', 'En camino', 'En destino', 'Recogido'],
    encomienda: ['Recibido', 'Preparando', 'En camino', 'En destino', 'Recogido'],
    delivery:   ['Recibido', 'Preparando', 'En reparto', 'Entregado'],
    retiro:     ['Recibido', 'Preparando', 'Listo para recoger', 'Recogido']
  };

  var FINAL = ['FINALIZADO', 'ENTREGADO'];
  var EN_RUTA = ['ENVIADO', 'LLEGÓ A DESTINO', 'PENDIENTE DE PAGO'];

  var TEXTO = {
    recibido: ['¡Recibimos tu pedido!', 'Lo estamos revisando. Te avisaremos en cada avance.', 'recibimos tu pedido'],
    preparando: ['Estamos preparando tu pedido', 'Lo estamos empacando con cuidado para enviártelo.', 'empezamos a preparar tu pedido'],
    preparandoShalom: ['Estamos preparando tu pedido', 'Ya lo registramos en Shalom Pro. Pronto lo dejamos en la agencia.', 'registramos tu envío en Shalom Pro'],
    camino: ['¡Tu pedido va en camino!', 'Ya salió de nuestra tienda y viaja hacia tu ciudad.', 'el pedido fue enviado'],
    destino: ['¡Tu pedido llegó a destino!', 'Ya está en la agencia de destino. Recógelo con el DNI del destinatario.', 'llegó a la agencia de destino'],
    reparto: ['¡Tu pedido va en reparto!', 'Salió con nuestro motorizado hacia tu dirección. Ten tu DNI a la mano.', 'salió con el motorizado'],
    repartoLlega: ['¡El motorizado está llegando!', 'Ten tu DNI a la mano y revisa tu pedido al recibirlo.', 'el motorizado está llegando'],
    listo: ['¡Tu pedido está listo!', 'Ya puedes pasar a recogerlo a nuestra tienda. Trae tu DNI.', 'quedó listo para recoger'],
    entregado: ['¡Tu pedido fue entregado!', 'Gracias por tu compra. Esperamos que lo disfrutes.', 'tu pedido fue entregado'],
    recogido: ['¡Recogiste tu pedido!', 'Gracias por tu compra. Esperamos que lo disfrutes.', 'recogiste tu pedido'],
    cancelado: ['Pedido cancelado', 'Si tienes alguna duda, escríbenos y te ayudamos.', '']
  };

  function pasosDe(tipo){
    return PASOS[tipo] || PASOS.agencia;
  }

  function _armar(tipo, paso, clave, tono, aviso){
    var pasos = pasosDe(tipo);
    var t = TEXTO[clave];
    return {modo: 'pasos', tipo: PASOS[tipo] ? tipo : 'agencia', pasos: pasos, paso: paso,
      pill: paso >= 0 ? pasos[paso] : 'Cancelado', titulo: t[0], sub: t[1], ultimo: t[2],
      tono: tono || (paso === pasos.length - 1 ? 'ok' : 'marca'), aviso: aviso || ''};
  }

  function vista(pedido, tipo, shalom){
    var p = pedido || {};
    var st = String(p.status || '').trim().toUpperCase();
    var sh = shalom || {};
    var t = PASOS[tipo] ? tipo : 'agencia';
    var porPagar = st === 'PENDIENTE DE PAGO';
    var aviso = porPagar ? (t === 'delivery' ? 'Falta completar el pago: págalo al recibir tu pedido.'
      : 'Falta completar el pago para poder ' + (t === 'retiro' ? 'recogerlo en tienda.' : 'recogerlo.')) : '';

    if(st === 'CANCELADO') return _armar(t, -1, 'cancelado', 'gris');
    if(sh.esShalom && typeof sh.idx === 'number' && sh.idx >= 0 && FINAL.indexOf(st) < 0){
      return {modo: 'shalom', tipo: t, aviso: aviso, enShalom: true};
    }
    var ultimo = pasosDe(t).length - 1;
    if(FINAL.indexOf(st) >= 0) return _armar(t, ultimo, t === 'delivery' ? 'entregado' : 'recogido', 'ok');

    if(t === 'retiro'){
      if(st === 'ALISTADO' || EN_RUTA.indexOf(st) >= 0) return _armar(t, 2, 'listo', porPagar ? 'aviso' : 'marca', aviso);
      if(st === 'POR ALISTAR') return _armar(t, 1, 'preparando');
      return _armar(t, 0, 'recibido');
    }
    if(t === 'delivery'){
      if(st === 'LLEGÓ A DESTINO') return _armar(t, 2, 'repartoLlega');
      if(EN_RUTA.indexOf(st) >= 0) return _armar(t, 2, 'reparto', porPagar ? 'aviso' : 'marca', aviso);
      if(st === 'POR ALISTAR' || st === 'ALISTADO') return _armar(t, 1, 'preparando');
      return _armar(t, 0, 'recibido');
    }
    if(st === 'LLEGÓ A DESTINO' || porPagar) return _armar(t, 3, 'destino', porPagar ? 'aviso' : 'marca', aviso);
    if(st === 'ENVIADO') return _armar(t, 2, 'camino');
    if(st === 'POR ALISTAR' || st === 'ALISTADO') return _armar(t, 1, sh.esShalom && sh.registrado ? 'preparandoShalom' : 'preparando');
    return _armar(t, 0, 'recibido');
  }

  return {PASOS: PASOS, TEXTO: TEXTO, pasosDe: pasosDe, vista: vista};
});
