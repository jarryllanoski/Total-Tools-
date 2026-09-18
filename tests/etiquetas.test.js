/**
 * tests/etiquetas.test.js — qué etiqueta le toca a un pedido
 * ===========================================================
 * La fórmula del negocio, y sobre todo las tres cosas que impiden que un
 * barrido automático haga daño de madrugada sin nadie delante:
 *
 *   1. un envío no desanda el camino;
 *   2. una etiqueta que no está en la escalera NO SE TOCA (RECLAMOS,
 *      AVISAR CUANDO LLEGUE, RETORNO A ORIGEN… son decisiones del operador);
 *   3. con saldo pendiente no se cierra un pedido, ni en modo automático.
 *
 * Y la línea del manual que NO se copió literal: «Demora de envíos → ENVIADO».
 * Esa es la que hacía saltar hacia atrás a un pedido ya en destino.
 */
'use strict';
const path = require('path');
const E = require(path.join(__dirname, '..', 'functions', 'etiquetas.js'));

const shalom = (pasos, estado) => ({ok: true, pasos, estado: estado || ''});
const decidir = (pedido, res, modo) => E.decidirEtiqueta(pedido, res, modo || 'auto');
const nueva = (pedido, res, modo) => {
  const d = decidir(pedido, res, modo);
  return d ? d.nueva : null;
};

module.exports = async ({bloque, ok}) => {

  bloque('La escalera');

  ok(E.ESCALERA.length === 8, 'son las 8 etiquetas fijas del panel');
  ok(E.ESCALERA[0] === 'NUEVO PEDIDO' && E.ESCALERA[7] === 'FINALIZADO',
     'y su orden es el recorrido real: de nuevo pedido a finalizado');
  ok(E.escalon('ENVIADO') < E.escalon('LLEGÓ A DESTINO'),
     'enviado va antes que llegó a destino');
  ok(E.escalon('LLEGÓ A DESTINO') < E.escalon('PENDIENTE DE PAGO'),
     'y pendiente de pago después de llegar: primero llega, luego se cobra');
  ok(E.escalon('enviado') === E.escalon('ENVIADO'), 'no distingue mayúsculas');
  ok(E.escalon('RECLAMOS, DEVOLUCIONES, GARANT') === -1,
     'una etiqueta tuya no está en la escalera, y eso es un dato, no un fallo');

  bloque('La fórmula');

  ok(nueva({status: 'NUEVO PEDIDO'}, shalom(0, 'En origen')) === 'ENVIADO',
     'la guía existe en Shalom → ENVIADO');
  ok(nueva({status: 'NUEVO PEDIDO'}, shalom(1, 'En tránsito')) === 'ENVIADO',
     'en tránsito → ENVIADO');
  ok(nueva({status: 'ENVIADO'}, shalom(2, 'En destino')) === 'LLEGÓ A DESTINO',
     'en destino → LLEGÓ A DESTINO');
  ok(nueva({status: 'ENVIADO'}, shalom(2, 'En reparto')) === 'LLEGÓ A DESTINO',
     'en reparto también: está en la ciudad de destino');
  ok(nueva({status: 'LLEGÓ A DESTINO'}, shalom(3, 'Entregado')) === 'FINALIZADO',
     'entregado → FINALIZADO');

  bloque('El saldo pendiente manda');

  ok(nueva({status: 'ENVIADO', cost: '249'}, shalom(2, 'En destino')) ===
     'PENDIENTE DE PAGO', 'llegó y te deben → PENDIENTE DE PAGO');
  ok(nueva({status: 'LLEGÓ A DESTINO', cost: '249'}, shalom(3, 'Entregado')) ===
     'PENDIENTE DE PAGO',
     'ENTREGADO CON SALDO NO SE CIERRA: Shalom entregó, a ti no te pagaron');
  ok(nueva({status: 'LLEGÓ A DESTINO', cost: '249'}, shalom(3), 'auto') !==
     'FINALIZADO', 'ni siquiera en modo automático — es un error de negocio');
  ok(nueva({status: 'ENVIADO', cost: '0'}, shalom(2)) === 'LLEGÓ A DESTINO',
     'cost en 0 no es saldo');
  ok(nueva({status: 'ENVIADO', cost: ''}, shalom(2)) === 'LLEGÓ A DESTINO',
     'ni vacío');
  ok(E.haySaldo({monto: '300', adelanto: '100'}) === true,
     'si no hay cost, se recalcula de monto y adelanto');
  ok(E.haySaldo({monto: '300', adelanto: '300'}) === false, 'pagado del todo');
  ok(E.haySaldo({cost: 'abc'}) === false,
     'un cost corrupto no inventa una deuda');
  ok(E.haySaldo({}) === false && E.haySaldo(null) === false,
     'sin datos no hay saldo');

  bloque('La demora avisa, no mueve — la línea que no se copió del manual');

  {
    /* El manual decía «Demora de envíos → ENVIADO». Aplicado a un pedido ya en
       destino, eso lo mandaba HACIA ATRÁS. Es el bug que costó días. */
    const conDemora = {ok: true, pasos: 2, estado: 'En destino',
      demora: {fecha: '2026-09-06 20:00'}};
    ok(nueva({status: 'LLEGÓ A DESTINO'}, conDemora) === null,
       'un pedido en destino que se demora NO vuelve a ENVIADO');
    ok(nueva({status: 'ENVIADO'}, conDemora) === 'LLEGÓ A DESTINO',
       'la etiqueta sigue al paso REAL, no a la demora');
    ok(E.rangoDeTexto('Demora de envíos') === null,
       'y una demora no se puede ubicar en el recorrido: no adelanta ni atrasa');
    ok(E.rangoDeTexto('RETRASO EN RUTA') === null, 'ni escrita de otra forma');
  }

  bloque('Un envío no desanda el camino');

  ok(nueva({status: 'FINALIZADO'}, shalom(1, 'En tránsito')) === null,
     'un FINALIZADO no vuelve a ENVIADO pase lo que pase');
  ok(nueva({status: 'LLEGÓ A DESTINO'}, shalom(1)) === null, 'ni destino a tránsito');
  ok(nueva({status: 'ENVIADO'}, shalom(1)) === null,
     'y si ya está donde le toca, no se escribe por escribir');
  ok(nueva({status: 'PENDIENTE DE PAGO'}, shalom(2, 'En destino')) === null,
     'quien ya está en pendiente de pago no retrocede a llegó a destino');
  ok(nueva({status: 'ALISTADO'}, shalom(1)) === 'ENVIADO',
     'pero avanzar sí: de alistado a enviado');

  bloque('Las etiquetas tuyas no se tocan NUNCA');

  ['RECLAMOS, DEVOLUCIONES, GARANT', 'AVISAR CUANDO LLEGUE',
    'RETORNO A ORIGEN', 'ALGO QUE INVENTES MAÑANA'].forEach((etq) => {
    ok(nueva({status: etq}, shalom(3, 'Entregado')) === null,
       '"' + etq + '" se queda como está: si no se puede ubicar en la ' +
       'escalera, no se sabe si moverla sería avanzar o retroceder');
  });
  ok(nueva({status: ''}, shalom(2)) === null, 'un pedido sin etiqueta tampoco');

  bloque('Los tres modos');

  ok(nueva({status: 'ENVIADO'}, shalom(2), 'apagado') === null,
     'apagado: no mueve nada, ni lo evidente');
  ok(nueva({status: 'LLEGÓ A DESTINO'}, shalom(3), 'apagado') === null,
     'ni siquiera un entregado');
  ok(nueva({status: 'LLEGÓ A DESTINO'}, shalom(3), 'semi') === null,
     'semiautomática: FINALIZADO lo cierras tú');
  {
    /* LO ENCONTRÓ EL SIMULACRO, y por eso existe el simulacro.
       "Semiautomática" no es "si toca FINALIZADO, no muevas nada": es
       "muévelo hasta donde pueda llegar sin cerrarlo". Con la lectura mala,
       tres pedidos que Shalom daba por entregados se quedaban en ENVIADO. Y no
       era solo feo: en cuanto se guarda trackingStatus "Entregado" el barrido
       deja de consultarlos, así que habrían quedado en ENVIADO para siempre. */
    ok(nueva({status: 'ENVIADO'}, shalom(3, 'Entregado'), 'semi') ===
       'LLEGÓ A DESTINO',
       'un entregado avanza al menos a LLEGÓ A DESTINO: si se entregó, llegó');
    ok(nueva({status: 'ALISTADO'}, shalom(3, 'Entregado'), 'semi') ===
       'LLEGÓ A DESTINO', 'venga de donde venga');
    ok(nueva({status: 'ENVIADO', cost: '249'}, shalom(3), 'semi') ===
       'PENDIENTE DE PAGO', 'y con saldo, a pendiente de pago');
    ok(nueva({status: 'PENDIENTE DE PAGO'}, shalom(3), 'semi') === null,
       'pero nunca hacia atrás: quien ya está en pendiente de pago se queda');
    ok(nueva({status: 'LLEGÓ A DESTINO'}, shalom(3), 'auto') === 'FINALIZADO',
       'y en automática sigue cerrando, que para eso está');
  }
  ok(nueva({status: 'ENVIADO'}, shalom(2), 'semi') === 'LLEGÓ A DESTINO',
     'pero el resto sí se mueve');
  ok(nueva({status: 'ENVIADO', cost: '50'}, shalom(3), 'semi') ===
     'PENDIENTE DE PAGO',
     'y un entregado con saldo llega a pendiente de pago, que no es cerrar');
  ok(nueva({status: 'LLEGÓ A DESTINO'}, shalom(3), 'auto') === 'FINALIZADO',
     'automática: cierra');
  ok(nueva({status: 'ENVIADO'}, shalom(2), 'MODO_QUE_NO_EXISTE') !== null,
     'un modo desconocido no apaga el sistema en silencio');

  bloque('Sin dato real no se mueve nada');

  ok(decidir({status: 'ENVIADO'}, {ok: false, motivo: 'SIN_RED'}) === null,
     'una consulta fallida no mueve etiquetas');
  ok(decidir({status: 'ENVIADO'}, null) === null, 'ni una respuesta vacía');
  ok(decidir({status: 'ENVIADO'}, {ok: true}) === null,
     'ni una respuesta sin paso ni estado');
  ok(decidir({status: 'ENVIADO'}, {ok: true, estado: 'algo rarísimo'}) === null,
     'ni un texto que no se sabe clasificar');
  ok(decidir(null, shalom(2)) === null, 'ni sin pedido');

  bloque('Cuando no hay `pasos`, se lee el texto');

  ok(nueva({status: 'ENVIADO'}, {ok: true, estado: 'En destino'}) ===
     'LLEGÓ A DESTINO',
     'el estado puesto a mano desde el modal también decide etiqueta');
  ok(E.rangoDeTexto('Llegó a destino') === 2, 'con o sin tildes');
  ok(E.rangoDeTexto('ENTREGADO') === 3 && E.rangoDeTexto('En tránsito') === 1,
     'y los demás peldaños');
  ok(E.rangoDeTexto('') === null && E.rangoDeTexto(null) === null,
     'vacío no es un peldaño');
};
