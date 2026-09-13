/**
 * El chip de estado, la guarda de no-retroceso y los avisos.
 *
 * Dos fallos reales dieron origen a estas pruebas:
 *   · una guía Entregada que el panel mostraba como "Demora de envíos"
 *   · una guía En destino que el panel dejaba en "En tránsito"
 * Los dos venían de dejar que un texto pisara al recorrido, y de que el texto
 * del tracking —a diferencia de la etiqueta— no tuviera guarda de retroceso.
 *
 * Ver docs/INVARIANTES.md § 2 bis.
 */
'use strict';
const E = require('./_entorno.js');

module.exports = (t) => {
  const {ok, bloque} = t;

  // tracking.js es un IIFE: el puente se inyecta DENTRO, junto al export real,
  // para no depender de cómo esté envuelto el archivo.
  const src = E.leer('tracking.js');
  const puente = src.replace('global.Tracking = Tracking;',
      'global.Tracking = Tracking;\n' +
      'global.__t={_aplicarEstadoShalom:_aplicarEstadoShalom,_estadoChip:_estadoChip,' +
      '_rangoDeTexto:_rangoDeTexto,_avisoConsulta:_avisoConsulta,_motivoTexto:_motivoTexto};');
  if (puente === src) throw new Error('no se pudo inyectar el puente de pruebas en tracking.js');

  const dom = E.domFalso({});
  const win = {};
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', 'localStorage', 'setTimeout', 'clearTimeout', 'console',
      puente)(win, dom.doc, {getItem: () => null, setItem() {}}, setTimeout, clearTimeout, console);
  const T = win.__t;

  bloque('El chip muestra la fecha del cambio, siempre');
  {
    let chip = T._estadoChip({id: '1', trackingStatus: 'En tránsito',
      trackingLastUpdate: '2026-09-03T16:36:00', trackingLastAutoCheck: Date.now()});
    ok(/>3\/9, 04:36 p\. m\.</.test(chip), 'formato es-PE exacto: 3/9, 04:36 p. m.');
    ok(!/visto/.test(chip),
        'aunque la consulta sea de recién, NO dice "visto" — eso tapaba el dato con el que se trabaja');
    chip = T._estadoChip({id: '1', trackingStatus: 'En tránsito', trackingLastUpdate: ''});
    ok(!/opacity:\.5/.test(chip), 'sin fecha guardada, chip sin sello');
    chip = T._estadoChip({id: '1', trackingStatus: 'En tránsito', trackingLastUpdate: 'basura'});
    ok(!/Invalid/i.test(chip), 'una fecha corrupta no imprime "Invalid Date"');
    ok(/Sin consultas aún/.test(T._estadoChip({id: '1', trackingStatus: ''})),
        'sin estado, el texto de siempre');
  }

  bloque('Un envío no desanda el camino');
  {
    let s = {trackingStatus: 'Entregado'};
    let r = T._aplicarEstadoShalom(s, {ok: true, estado: 'En destino', pasos: 2});
    ok(r.retroceso === true, 'Entregado → En destino se bloquea');
    ok(s.trackingStatus === 'Entregado', 'y el pedido NO se modificó');

    s = {trackingStatus: 'En tránsito'};
    r = T._aplicarEstadoShalom(s, {ok: true, estado: 'En destino', pasos: 2});
    ok(s.trackingStatus === 'En destino' && r.avanzo === true, 'hacia adelante sí pasa');

    s = {trackingStatus: 'Demora de envíos'};
    T._aplicarEstadoShalom(s, {ok: true, estado: 'Entregado', pasos: 3});
    ok(s.trackingStatus === 'Entregado',
        '★ un pedido hoy mal guardado SÍ se puede corregir — por eso lo desconocido nunca bloquea');

    s = {trackingStatus: 'Entregado'};
    T._aplicarEstadoShalom(s, {ok: true, estado: 'En destino', pasos: 2}, 'manual');
    ok(s.trackingStatus === 'En destino', 'a mano manda el operador: la guarda no lo ata');

    s = {trackingStatus: 'Cosa que nadie reconoce'};
    T._aplicarEstadoShalom(s, {ok: true, estado: 'En origen', pasos: 0});
    ok(s.trackingStatus === 'En origen', 'un texto no clasificable nunca bloquea');

    s = {trackingStatus: 'En destino'};
    T._aplicarEstadoShalom(s, {ok: true, estado: 'En reparto', pasos: 2});
    ok(s.trackingStatus === 'En reparto', 'mismo tramo con otro texto: pasa');
  }

  bloque('Una consulta fallida no toca nada');
  {
    const original = {trackingStatus: 'Entregado', trackingLastUpdate: '2026-08-01T10:00:00',
      trackingHistory: [{date: '2026-08-01T10:00:00', status: 'Entregado'}]};
    const antes = JSON.stringify(original);
    T._aplicarEstadoShalom(original, {ok: false, motivo: 'SIN_RED'});
    ok(JSON.stringify(original) === antes, 'no toca NADA del pedido');
    ok(original.trackingLastAutoCheck === undefined,
        'ni marca "visto" — antes lo hacía aunque fallara');

    const viejo = {trackingStatus: 'Entregado', trackingLastUpdate: '2026-08-01T10:00:00',
      trackingHistory: [{date: '2026-08-01T10:00:00', status: 'Entregado'}]};
    T._aplicarEstadoShalom(viejo, {ok: true, estado: 'En destino', pasos: 2});
    ok(viejo.trackingHistory.length === 1, 'un retroceso bloqueado no agrega al historial');
    ok(viejo.trackingLastUpdate === '2026-08-01T10:00:00', 'ni mueve la fecha del cambio');
  }

  bloque('El aviso dice lo que sabe');
  {
    ok(/Llegó a destino/.test(T._avisoConsulta({trackingStatus: 'En destino'},
        {cambio: true, escribio: false, avanzo: true, resultado: 'EN_DESTINO'})),
    '★ avanzó a destino con el mismo texto → lo anuncia, ya no dice "sin cambios"');
    ok(/Avanzó/.test(T._avisoConsulta({trackingStatus: 'En destino'},
        {cambio: true, escribio: false, avanzo: true, resultado: 'ok'})),
    'un avance sin resultado especial también se nota');
    ok(/Sin cambios/.test(T._avisoConsulta({trackingStatus: 'En tránsito'},
        {cambio: true, escribio: false, avanzo: false, resultado: 'ok'})),
    'de verdad sin novedad → "sin cambios"');
    const av = T._avisoConsulta({trackingStatus: 'Entregado'},
        {cambio: true, retroceso: true, intento: 'En destino'});
    ok(/Sigue Entregado/.test(av) && /En destino/.test(av),
        'un retroceso bloqueado se explica, no se calla');
  }

  bloque('Cada causa manda a su arreglo');
  {
    const sesion = T._motivoTexto('SIN_SESION');
    ok(/sesión/i.test(sesion) && /vuelve a entrar/i.test(sesion), 'sesión vencida: volver a entrar');
    ok(!/clave|plan|API/i.test(sesion),
        '★ NO menciona la clave ni el plan — mandaba a revisar la factura de Shalom');
    const permiso = T._motivoTexto('SIN_PERMISO');
    ok(/autorizada/i.test(permiso) && !/plan|venció/i.test(permiso), 'sin permiso: habla de autorización');
    const bloq = T._motivoTexto('BLOQUEADO', 'Invalid API key');
    ok(/clave|plan/i.test(bloq) && bloq.includes('Invalid API key'),
        'la clave de Shalom: repite la razón real que dio Shalom');
    ok(!/vuelve a entrar/i.test(bloq), 'y no manda a volver a entrar al panel');
    ok(new Set([sesion, permiso, bloq]).size === 3, 'los tres avisos son distintos entre sí');
    ok(!T._motivoTexto('BLOQUEADO').includes('()'), 'sin detalle no deja paréntesis vacíos');
    const largo = T._motivoTexto('ERROR_SHALOM', 'x'.repeat(400));
    ok(largo.length < 160 && largo.includes('…'), 'un detalle enorme se recorta y se nota');
    ok(!T._motivoTexto('ERROR_SHALOM', '<img src=x onerror=alert(1)>').includes('<img'),
        'el texto de afuera se limpia de HTML');
  }

  bloque('El vocabulario del recorrido');
  {
    [['Entregado', 3], ['En destino', 2], ['En reparto', 2], ['En tránsito', 1],
      ['En origen', 0], ['Registrado', 0], ['Demora de envíos', null], ['bla', null], ['', null]
    ].forEach(([txt, esp]) => {
      ok(T._rangoDeTexto(txt) === esp, '"' + txt + '" → ' + esp);
    });
    ok(T._rangoDeTexto('EN TRANSITO') === 1, 'sin acentos y en mayúsculas, igual');
  }
};
