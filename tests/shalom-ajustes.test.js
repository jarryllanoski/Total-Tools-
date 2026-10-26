/**
 * tests/shalom-ajustes.test.js — los ajustes de Shalom del 26/10/2026
 * ===================================================================
 * ⚠️ EL SEGUIMIENTO AUTOMÁTICO SE QUEDÓ CIEGO SIN AVISAR. Shalom numera sus
 * guías en orden y en octubre de 2026 pasó el 99.999.999: las nuevas tienen
 * 9 dígitos (100761787, 101038480…). La regla decía «8 dígitos», así que
 * cada envío nuevo caía en «mal escrita» y no se consultaba nunca. La
 * corrida de las 16:30 consultó 10 guías antiguas y apartó 20 nuevas.
 *
 * Y tres cosas más que pidió el dueño:
 *   · el «Modo simulacro» del seguimiento, fuera;
 *   · encender/apagar los ajustes de Shalom pide la clave;
 *   · con factura/boleta, el cliente ve ESE número en vez del código.
 */
'use strict';
const B = require('../functions/barrido.js');
const E = require('./_entorno.js');

/* guias.js es un <script> del panel: se carga contra un window de mentira. */
function guias() {
  const win = {document: null};
  E.cargar('guias.js', win);
  return win.Guias;
}

module.exports = async ({bloque, ok}) => {

  bloque('⚠️ Las guías de 9 dígitos de Shalom se vuelven a seguir');

  const MUESTRA = {
    // Las 20 que la corrida del 26/10 apartó como «mal escritas» (reales).
    buenas: ['100761787', '100302345', '100762025', '101038480', '101036402',
      '100885802', '101035095', '82037653', '10000000', '99999999'],
    // 939726661: el error real de un dígito de más. 8727153: le falta uno.
    malas: ['939726661', '8727153', '1007617870', '200761787', '8203765a', ''],
  };

  {
    MUESTRA.buenas.forEach((g) => ok(B.GUIA_OK.test(g), g + ' es una guía válida'));
    MUESTRA.malas.forEach((g) => ok(!B.GUIA_OK.test(g),
        '«' + g + '» sigue siendo un error de tipeo'));

    const ped = (id, guia) => ({id, courier: 'SHALOM', status: 'ENVIADO',
      trackingOrderNumber: guia, name: id});
    const r = B.aConsultar([ped('nueva', '100761787'), ped('vieja', '82037653'),
      ped('tipeo', '939726661')], Date.now());
    ok(r.consultar.map((x) => x.id).sort().join(',') === 'nueva,vieja',
       '⚠️ el seguimiento automático consulta la guía nueva de 9 dígitos');
    ok(r.guiasMalas.length === 1 && r.guiasMalas[0].guia === '939726661',
       'y sigue apartando el error de tipeo');
  }

  {
    const G = guias();
    ok(G.revisar('100761787', '', []).length === 0,
       'el aviso de «Editar» ya no dice que una guía nueva está mal');
    const a = G.revisar('939726661', '', []);
    ok(a.length === 1 && /empieza por 9/.test(a[0].texto),
       'y al error de tipeo le dice por qué: 9 dígitos que no empiezan por 1');
    const discrepan = MUESTRA.buenas.concat(MUESTRA.malas)
        .filter((g) => /^[0-9]+$/.test(g))
        .filter((g) => G.FORMATO.test(g) !== B.GUIA_OK.test(g));
    ok(discrepan.length === 0,
       '⚠️ el aviso del panel y el seguimiento del servidor usan LA MISMA ' +
       'regla: si discrepan, uno avisa de lo que el otro sí consulta');
  }

  bloque('El «Modo simulacro» del seguimiento ya no existe');

  {
    const src = E.leer('functions/index.js');
    const fn = src.slice(src.indexOf('async function _correrBarrido'),
        src.indexOf('exports.barridoShalom'));
    ok(!/simulacro/.test(fn.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')),
       'el servidor ya no lee `simulacro`: aunque quede guardado, se ignora');
    ok(/if \(escrituras\.length\) \{/.test(fn),
       'y escribe siempre lo que encuentra');
    const reg = src.slice(src.indexOf('shalomRegistroSimulacro') - 200,
        src.indexOf('shalomRegistroSimulacro') + 60);
    ok(/shalomRegistroSimulacro !== false/.test(reg),
       '⚠️ el simulacro de REGISTRAR (el que evita cobros) sigue intacto');

    const idx = E.leer('index.html');
    ok(idx.indexOf('tglBarridoSimulacro') < 0, 'el interruptor salió de Config');
    ok(!/simulacro:\s*true/.test(E.trozo('index.html', 'function _cfgBarrido(){',
        'function guardarBarrido')), 'ni vuelve como valor de fábrica');
    ok(E.leer('config.js').indexOf('tglBarridoSimulacro') < 0,
       'ni se pinta al abrir Config');
  }

  bloque('Encender, apagar o cambiar los ajustes de Shalom pide la clave');

  {
    const src = E.trozo('index.html', 'function _cfgBarrido(){',
        '/* Por qué fallaron');
    const pedidas = [];
    const guardados = [];
    const avisos = [];
    const horas = {value: ''};
    const modo = {value: ''};
    const tgl = {_on: true, classList: {
      toggle: function() { tgl._on = !tgl._on; },
      contains: () => tgl._on,
    }};
    const S = {config: {barrido: {activo: true, modo: 'semi',
      horas: '08:00, 11:30'}}};
    // eslint-disable-next-line no-new-func
    const api = new Function('S', '$', 'openPin', 'save', 'toast',
        src + ';return {guardarBarrido, toggleBarrido};',
    )(S, (id) => ({cfgBarridoHoras: horas, cfgBarridoModo: modo,
      tglBarridoActivo: tgl})[id],
    (cb, msg) => pedidas.push({cb, msg}), (q) => guardados.push(q),
    (m) => avisos.push(m));

    api.toggleBarrido('activo');
    ok(pedidas.length === 1 && S.config.barrido.activo === true && tgl._on,
       'apagar el seguimiento automático NO hace nada hasta poner la clave');
    ok(/Shalom/.test(pedidas[0].msg), 'y el teclado dice para qué es');
    pedidas[0].cb();
    ok(S.config.barrido.activo === false && guardados.length === 1,
       'con la clave, se apaga y se guarda');

    horas.value = '09:00'; modo.value = 'auto';
    api.guardarBarrido();
    ok(horas.value === '08:00, 11:30' && modo.value === 'semi' &&
       S.config.barrido.modo === 'semi',
       '⚠️ cambiar horario o modo: la casilla vuelve AL INSTANTE a lo ' +
       'guardado — si cancelas, no queda en pantalla un valor que no está puesto');
    pedidas[1].cb();
    ok(S.config.barrido.horas === '09:00' && S.config.barrido.modo === 'auto' &&
       horas.value === '09:00', 'con la clave, entra el valor nuevo');
    const n = pedidas.length;
    api.guardarBarrido();
    ok(pedidas.length === n, 'sin cambios no se pide la clave por nada');
    api.toggleBarrido('simulacro');
    ok(pedidas.length === n, 'y `simulacro` ya no es un interruptor');

    const idx = E.leer('index.html');
    ok(/function toggleShalomPuerta\(\)\{ _pinShalom\(/.test(idx),
       'la puerta a Shalom pide la clave');
    ok(/function toggleTrackingWebCliente\(\)\{ _pinShalom\(/.test(idx),
       '«Mostrar en el link del cliente» también');
    const pin = E.trozo('index.html', 'function _pinShalom(', '\n}');
    ok(/openPin\(/.test(pin) && !/['"]\d{4}['"]/.test(pin),
       '⚠️ usa la clave guardada del dueño: NINGUNA clave escrita en el ' +
       'código, que esta página es pública');
    ok(/function openPin\(cb, msg\)/.test(E.leer('config.js')),
       'el teclado de siempre, con su mensaje');
  }

  bloque('Con factura/boleta, el cliente ve ESE número en vez del código');

  {
    const src = E.trozo('formulario.html', 'function _construirWaMsg(',
        'function _construirWaHref(');
    // eslint-disable-next-line no-new-func
    const msg = new Function('CFG', 'selDateLbl', 'selCourierType', 'location',
        src + ';return _construirWaMsg;',
    )({config: {name: 'TOTAL TOOLS'}}, 'hoy', 'domicilio',
        {origin: 'https://x', pathname: '/f.html'});
    const base = {name: 'ANA', phone: '911111111', courier: 'DELIVERY',
      address: 'LIMA', date: ''};
    const con = msg(Object.assign({nroComprobante: 'B002-4355'}, base),
        '465247', 'tok');
    ok(/Factura\/Boleta:\* B002-4355/.test(con),
       'con número: el WhatsApp dice la factura/boleta');
    ok(!/Código de seguimiento/.test(con) && con.indexOf('465247') < 0,
       '⚠️ y SOLO ella: el código de 6 dígitos ya no sale');
    const sin = msg(base, '465247', 'tok');
    ok(/Código de seguimiento:\* #465247/.test(sin) && !/Factura/.test(sin),
       'sin número: el código de seguimiento de siempre');
    const raro = msg(Object.assign({nroComprobante: 'b<x>'}, base), '1', 't');
    ok(raro.indexOf('<x>') < 0, 'un número raro se filtra antes de escribirlo');

    const trk = E.trozo('formulario.html', 'const _nroTk', 'Estado actual');
    ok(/const tc\s*=\s*_nroTk \|\| codigoSeg/.test(trk),
       'la página de seguimiento usa el mismo número');
    ok(/_nroTk \? 'Factura \/ Boleta' : 'Código de seguimiento'/.test(trk),
       'y lo rotula como lo que es');
  }

  bloque('«Editar»: la casilla de factura alineada con la del DNI');

  {
    const idx = E.leer('index.html');
    ok(/class="frow frow-par">\s*<div class="fg"><label class="fl">DNI/.test(idx),
       'la fila del DNI usa la fila de etiquetas iguales');
    ok(/<label class="fl">N° Factura \/ Boleta<\/label>/.test(idx),
       'sin el emoji que tu PC dibujaba como un cuadrito');
    const css = E.leer('panel.css');
    ok(/\.frow-par \.fl\{height:14px/.test(css),
       'las dos etiquetas con la misma altura fija');
  }
};
