/**
 * tests/barrido.test.js — a quién consulta el barrido, y cuándo
 * ==============================================================
 * Corre en el servidor, cuatro veces al día, sin nadie mirando. Así que lo
 * que se prueba aquí es sobre todo a quién NO consulta:
 *
 *   · lo que Shalom ya dio por ENTREGADO — es la última rama del árbol;
 *   · lo FINALIZADO;
 *   · las guías mal escritas — se sabe que van a fallar;
 *   · lo consultado hace un momento — defensa contra un disparo repetido.
 *
 * Y que el reloj no se equivoque: "8am" tiene que ser 8am en Perú.
 */
'use strict';
const path = require('path');
const B = require(path.join(__dirname, '..', 'functions', 'barrido.js'));

const ped = (extra) => Object.assign({
  id: 'p' + Math.random().toString(36).slice(2, 8),
  name: 'Cliente', courier: 'SHALOM', status: 'ENVIADO',
  trackingOrderNumber: '82037653', trackingOrderCode: 'TT9C'
}, extra || null);

module.exports = async ({bloque, ok}) => {

  bloque('El reloj — "8am" es 8am en Perú');

  ok(B.ZONA === 'America/Lima', 'la zona es fija, no la del servidor');
  ok(B.horaLocal(new Date('2026-09-18T13:00:00Z')) === '08:00',
     '13:00 UTC son las 08:00 en Lima');
  ok(B.horaLocal(new Date('2026-09-18T00:00:00Z')) === '19:00',
     'y medianoche UTC son las 19:00 del día anterior');
  ok(B.horaLocal(new Date('2026-01-15T13:00:00Z')) === '08:00',
     'en enero también: Perú no cambia la hora, y eso es lo que evita ' +
     'que el barrido se corra una hora medio año');
  ok(B.horaLocal(new Date('2026-09-18T05:00:00Z')) === '00:00',
     'medianoche local se dice 00:00, nunca 24:00');

  bloque('Solo en punto y y media — lo demás se ajusta, no se pierde');

  ok(B.aSlot('08:00') === '08:00' && B.aSlot('11:30') === '11:30',
     'las ranuras buenas pasan tal cual');
  ok(B.aSlot('8') === '08:00', 'una hora suelta vale');
  ok(B.aSlot('8:5') === null, 'pero no un minuto a medias');
  ok(B.aSlot('08:10') === '08:00', '08:10 baja a las 8 en punto');
  ok(B.aSlot('08:20') === '08:30' && B.aSlot('08:44') === '08:30',
     'y de 15 a 44 sube a y media');
  ok(B.aSlot('08:45') === '09:00', 'de 45 en adelante, a la hora siguiente');
  ok(B.aSlot('23:50') === '00:00', 'y a fin de día da la vuelta');
  ok(B.aSlot('25:00') === null && B.aSlot('08:99') === null &&
     B.aSlot('hola') === null && B.aSlot('') === null,
     'lo que no es una hora se descarta');

  bloque('Las horas de Config');

  ok(B.parseHoras('08:00, 11:30, 16:30, 19:00').join(' ') ===
     '08:00 11:30 16:30 19:00', 'se leen las cuatro');
  ok(B.parseHoras('19:00 08:00  11:30').join(' ') === '08:00 11:30 19:00',
     'se ordenan solas: escribirlas desordenadas no puede romper nada');
  ok(B.parseHoras('08:00, 08:00, 8').join(' ') === '08:00',
     'y las repetidas cuentan una vez — no se consulta dos veces');
  ok(B.parseHoras('8am, 11:30pm').length > 0, 'texto raro no revienta');
  {
    /* Si un error de tipeo dejara la lista vacía, el barrido se apagaría SIN
       QUE NADIE LO DECIDIERA y nadie se enteraría hasta que un cliente
       reclamara. Ante una lista inservible se vuelve a las de fábrica. */
    ok(B.parseHoras('').join(' ') === B.HORAS_POR_DEFECTO.join(' '),
       'una lista vacía cae en las de fábrica, no apaga el barrido');
    ok(B.parseHoras('basura pura').join(' ') === B.HORAS_POR_DEFECTO.join(' '),
       'y una lista sin ninguna hora válida, igual');
    ok(B.parseHoras(null).join(' ') === B.HORAS_POR_DEFECTO.join(' '),
       'ni siquiera con null');
  }

  bloque('De las 48 ranuras del día, corren exactamente 4');

  {
    const horas = B.parseHoras('08:00, 11:30, 16:30, 19:00');
    let corren = 0;
    for (let h = 0; h < 24; h++) {
      for (const m of ['00', '30']) {
        const t = String(h).padStart(2, '0') + ':' + m;
        if (B.tocaAhora(horas, t)) corren++;
      }
    }
    ok(corren === 4, 'cuatro veces al día, ni una más');
    ok(B.tocaAhora(horas, '08:00') && B.tocaAhora(horas, '19:00'),
       'y son las tuyas');
    ok(!B.tocaAhora(horas, '03:00') && !B.tocaAhora(horas, '12:00'),
       'de madrugada y a mediodía no se gasta ni una consulta');
    ok(!B.tocaAhora(horas, 'hola') && !B.tocaAhora([], '08:00'),
       'sin hora válida o sin lista, no corre');
  }

  bloque('A quién NO se consulta');

  {
    const lista = [
      ped({id: 'a', status: 'ENVIADO'}),
      ped({id: 'b', status: 'FINALIZADO'}),
      ped({id: 'c', trackingStatus: 'Entregado'}),
      ped({id: 'd', trackingStatus: 'ENTREGADO'}),
      ped({id: 'e', courier: 'DELIVERY'}),
      ped({id: 'f', trackingOrderNumber: '', shalomGuia: ''}),
      ped({id: 'g', trackingOrderNumber: '939726661'}),
      ped({id: 'h', trackingLastAutoCheck: Date.now() - 5 * 60000}),
      ped({id: 'i', trackingLastAutoCheck: Date.now() - 6 * 3600000})
    ];
    const r = B.aConsultar(lista, Date.now());
    const ids = r.consultar.map((x) => x.id).sort().join(',');
    ok(ids === 'a,i', 'solo quedan los que de verdad pueden traer algo nuevo');
    ok(r.saltados.finalizados === 1, 'un FINALIZADO está cerrado');
    ok(r.saltados.yaEntregados === 2,
       'lo que Shalom ya dio por entregado no se pregunta más: es la última ' +
       'rama del árbol, no hay nada después');
    ok(r.saltados.noShalom === 1, 'los de otro courier no son de Shalom');
    ok(r.saltados.sinGuia === 1, 'sin guía no hay qué consultar');
    ok(r.saltados.recien === 1,
       'y lo consultado hace un momento se salta: si el Scheduler dispara ' +
       'dos veces la misma ranura, no se consulta todo por duplicado');
    ok(r.guiasMalas.length === 1 && r.guiasMalas[0].guia === '939726661',
       'la guía mal escrita NO se consulta — se sabe que va a fallar');
    ok(r.guiasMalas[0].nombre !== undefined,
       'y se lista con su pedido, para poder corregirla');
    ok(r.consultar.map((x) => x.id).indexOf('g') < 0,
       'no se gastan 4 consultas diarias en un número que no existe');
  }
  {
    const r = B.aConsultar([ped({shalomGuia: '82037653',
      trackingOrderNumber: ''})], Date.now());
    ok(r.consultar.length === 1, 'también sirve la guía en el campo viejo');
    ok(r.consultar[0].codigo === 'TT9C', 'y viaja con su código');
  }
  {
    const r = B.aConsultar([ped({courier: 'shalom courier'})], Date.now());
    ok(r.consultar.length === 1, 'el courier no distingue mayúsculas');
  }
  {
    const r = B.aConsultar([null, {}, ped({id: null})], Date.now());
    ok(r.consultar.length === 0, 'basura en la lista no revienta el barrido');
  }
  {
    const r = B.aConsultar([], Date.now());
    ok(r.consultar.length === 0 && r.guiasMalas.length === 0,
       'sin pedidos, nada que hacer');
  }

  bloque('Qué escribe el barrido — y qué no');

  const res = (pasos, estado, extra) => Object.assign(
      {ok: true, pasos, estado, fecha: '2026-09-18 10:00'}, extra || null);

  {
    const p = ped({status: 'ENVIADO', trackingStatus: 'En tránsito',
      trackingHistory: []});
    const c = B.cambiosDe(p, res(2, 'En destino'), 'semi');
    ok(c.campos.trackingStatus === 'En destino', 'escribe el estado de Shalom');
    ok(c.campos.status === 'LLEGÓ A DESTINO', 'y mueve la etiqueta');
    ok(c.campos.trackingHistory.length === 1, 'y deja entrada en el historial');
    const h = c.campos.trackingHistory[0];
    ok(h.date && h.status && h.message && h.source === 'shalom',
       'con el MISMO formato que escribe el panel — un tercer formato de ' +
       'historial haría ilegible la mitad de las entradas');
    ok(c.campos.trackingLastUpdate === '2026-09-18 10:00',
       'con la fecha que dio Shalom, no la del servidor');
  }
  {
    const p = ped({status: 'LLEGÓ A DESTINO', trackingStatus: 'En destino'});
    ok(B.cambiosDe(p, res(2, 'En destino'), 'semi') === null,
       'si nada cambió no se escribe NADA, ni la hora de la consulta: ' +
       'estampar "te miré y no había novedad" 284 veces al día es pagar por ' +
       'no-noticias');
  }
  {
    // La misma guarda que el panel: una respuesta peor no pisa a una buena.
    const p = ped({status: 'LLEGÓ A DESTINO', trackingStatus: 'En destino',
      trackingHistory: []});
    const c = B.cambiosDe(p, res(1, 'En tránsito'), 'auto');
    ok(c === null || c.campos.trackingStatus === undefined,
       'un estado ANTERIOR no pisa al que ya había');
    ok(!c || c.campos.status === undefined, 'ni mueve la etiqueta hacia atrás');
  }
  {
    const p = ped({status: 'ENVIADO', trackingStatus: 'En tránsito',
      trackingHistory: []});
    const c = B.cambiosDe(p, res(2, 'En destino'), 'apagado');
    ok(c && c.campos.trackingStatus === 'En destino',
       'en modo apagado el SEGUIMIENTO se sigue registrando');
    ok(c.campos.status === undefined,
       'pero la etiqueta no se toca: "apagado" es sobre las etiquetas');
    ok(c.etiqueta === null, 'y el informe dirá que no movió nada');
  }
  {
    const p = ped({status: 'ENVIADO', trackingStatus: 'En tránsito',
      trackingHistory: [{date: 'x', status: 'En origen', source: 'shalom'}]});
    const c = B.cambiosDe(p, res(2, 'En destino'), 'semi');
    ok(c.campos.trackingHistory.length === 2, 'el historial se acumula');
    ok(c.campos.trackingHistory[0].status === 'En origen',
       'y lo que ya había no se pierde');
    ok(p.trackingHistory.length === 1,
       'sin modificar el pedido original: decidir no puede tener efectos');
  }
  ok(B.cambiosDe(ped({}), {ok: false, motivo: 'SIN_RED'}, 'auto') === null,
     'una consulta fallida no escribe nada');
  ok(B.cambiosDe(ped({}), {ok: true, estado: ''}, 'auto') === null,
     'ni una respuesta sin estado');
  ok(B.cambiosDe(null, res(2, 'En destino'), 'auto') === null,
     'ni sin pedido');
  {
    const p = ped({status: 'RECLAMOS, DEVOLUCIONES, GARANT',
      trackingStatus: '', trackingHistory: []});
    const c = B.cambiosDe(p, res(3, 'Entregado'), 'auto');
    ok(c && c.campos.trackingStatus === 'Entregado',
       'a una etiqueta tuya sí se le registra lo que dice Shalom');
    ok(c.campos.status === undefined,
       'pero la etiqueta no se toca ni en automático: es una decisión tuya');
  }
};
