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
  /* tracking.js delega la clasificación del recorrido y la fórmula de las
     etiquetas en functions/etiquetas.js — el MISMO archivo que usa el barrido
     del servidor. En el navegador lo carga un <script> antes; acá se trae por
     require, que es el mismo archivo por la otra puerta del módulo. */
  win.Etiquetas = require('../functions/etiquetas.js');
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

  bloque('Los motivos del interruptor se explican como lo que son');
  {
    /* Ninguno de los dos es un fallo: son el sistema protegiéndose. Y son
       distintos entre sí —uno lo decidió el operador, el otro la puerta sola—,
       así que decirlos igual mandaría a buscar el arreglo donde no está. */
    const apagada = T._motivoTexto('APAGADA', null);
    ok(apagada.indexOf('apagado') > 0, 'APAGADA dice que está apagado');
    ok(apagada.indexOf('Configuración') > 0,
        'y dónde se enciende: un aviso sin salida es una queja');

    const pausa = T._motivoTexto('PUERTA_CERRADA', Date.now() + 7 * 60000);
    ok(pausa.indexOf('pausó solo') > 0, 'PUERTA_CERRADA dice que se pausó sola');
    ok(/reintenta en \d+ min/.test(pausa),
        'y hasta cuándo: "se pausó solo" sin hora se lee como "se rompió"');
    ok(pausa.indexOf('siguen funcionando') > 0,
        'y que el resto del panel sigue vivo — que es justo lo que se teme');
    ok(pausa !== apagada, 'y los dos no dicen lo mismo');
    ok(T._motivoTexto('PUERTA_CERRADA', 0).indexOf('reintenta en') < 0,
        'sin hora válida no se inventa una');
    ok(T._motivoTexto('PUERTA_CERRADA', Date.now() - 60000)
        .indexOf('reintenta en') < 0, 'ni con una hora ya pasada');
  }

  bloque('El panel mueve la etiqueta con la MISMA fórmula que el servidor');
  {
    /* 18 sep 2026: el movimiento automático vuelve por decisión del negocio —
       es la fórmula del manual del panel. Lo que se cuida aquí es que el panel
       no tenga su propia versión: si decidiera distinto que el barrido, un
       pedido tendría una etiqueta según quién lo consultó. */
    const conModo = (modo) => { win.S = {config: {barrido: {modo}}}; };
    const shalom = (pasos, estado) => ({ok: true, pasos, estado,
      fecha: '2026-09-18 10:00'});

    conModo('semi');
    {
      const s = {id: '1', status: 'ENVIADO', trackingStatus: 'En tránsito'};
      const r = T._aplicarEstadoShalom(s, shalom(2, 'En destino'), 'shalom');
      ok(s.status === 'LLEGÓ A DESTINO', 'en destino mueve la etiqueta');
      ok(r.movio === 'LLEGÓ A DESTINO', 'y lo informa a quien llamó');
    }
    {
      const s = {id: '2', status: 'LLEGÓ A DESTINO', trackingStatus: 'En destino'};
      T._aplicarEstadoShalom(s, shalom(3, 'Entregado'), 'shalom');
      ok(s.status === 'LLEGÓ A DESTINO',
          'en semiautomática, FINALIZADO lo cierras tú');
    }
    conModo('auto');
    {
      const s = {id: '3', status: 'LLEGÓ A DESTINO', trackingStatus: 'En destino'};
      T._aplicarEstadoShalom(s, shalom(3, 'Entregado'), 'shalom');
      ok(s.status === 'FINALIZADO', 'en automática, cierra');
    }
    {
      const s = {id: '4', status: 'LLEGÓ A DESTINO', cost: '249',
        trackingStatus: 'En destino'};
      T._aplicarEstadoShalom(s, shalom(3, 'Entregado'), 'shalom');
      ok(s.status === 'PENDIENTE DE PAGO',
          'pero con saldo pendiente no cierra ni en automática');
    }
    {
      const s = {id: '5', status: 'RECLAMOS, DEVOLUCIONES, GARANT',
        trackingStatus: ''};
      T._aplicarEstadoShalom(s, shalom(3, 'Entregado'), 'shalom');
      ok(s.status === 'RECLAMOS, DEVOLUCIONES, GARANT',
          'y una etiqueta tuya no se toca ni en automática');
    }
    conModo('apagado');
    {
      const s = {id: '6', status: 'ENVIADO', trackingStatus: 'En tránsito'};
      const r = T._aplicarEstadoShalom(s, shalom(2, 'En destino'), 'shalom');
      ok(s.status === 'ENVIADO', 'apagado: la etiqueta no se mueve');
      ok(s.trackingStatus === 'En destino',
          'pero el seguimiento SÍ se registra — "apagado" es sobre etiquetas');
      ok(r.movio === null, 'y el aviso lo sabe');
    }
    win.S = undefined;
  }

  bloque('La fórmula es un solo archivo, y el panel lo carga');
  {
    const html = E.leer('index.html');
    ok(html.indexOf('functions/etiquetas.js') > 0,
        'index.html carga functions/etiquetas.js — el mismo del servidor');
    const trk = E.leer('tracking.js');
    ok(/window\.Etiquetas\.rangoDeTexto/.test(trk),
        'y tracking.js delega en él en vez de tener su copia');
    ok(/window\.Etiquetas\.decidirEtiqueta/.test(trk),
        'también para decidir la etiqueta');
    const idx = E.leer('functions/index.js');
    ok(/require\("\.\/etiquetas"\)/.test(idx),
        'y el servidor requiere EL MISMO archivo, no una copia suya');
  }

  bloque('El manual del panel dice lo que el panel hace');
  {
    /* Un manual que describe algo que el sistema ya no hace es peor que no
       tenerlo: se confía en él. Estas pruebas atan el texto al comportamiento
       que sí está probado más arriba. */
    const src = E.leer('tracking.js');
    const manual = src.slice(src.indexOf('var pasos = ['),
        src.indexOf('var pasos = [') + 3000);
    ok(manual.indexOf('12 horas') < 0 && manual.indexOf('24 horas') < 0,
        'ya no promete "cada 12 y 24 horas": ahora son horarios fijos');
    ok(/horarios que pongas/.test(manual), 'y dice que los pones tú');
    ok(/la etiqueta no se mueve/.test(manual),
        'la demora avisa sin mover — la línea vieja mandaba a un pedido en ' +
        'destino de vuelta a ENVIADO');
    ok(/saldo por cobrar/.test(manual),
        'y avisa que con saldo pendiente no se cierra');
    ok(/nunca retrocede/.test(manual), 'y que una etiqueta no retrocede');
  }
};
