/**
 * tests/situacion-guia.test.js — ¿se puede consultar esta guía? UNA verdad
 * ========================================================================
 * El caso (11/11/2026): dos pedidos en POR ALISTAR con guía creada por el
 * panel en Shalom Pro (envío PENDIENTE: el paquete aún no está en la
 * agencia). «Consultar» decía «Shalom tuvo un error (Shalom buscar API
 * returned status 403)», «Jalar ticket» decía «no encontró esa guía», y la
 * consulta por horarios contaba esos «errores» hasta PAUSAR la puerta para
 * todos los pedidos. A la misma hora, una guía ya dejada respondía bien.
 *
 * La regla única vive en functions/registroShalom.js → situacion(), y la
 * usan el botón, el masivo, el ticket y los horarios. Datos inventados.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const R = require('../functions/registroShalom.js');
const P = require('../functions/shalomPuerta.js');
const B = require('../functions/barrido.js');
const I = require('../functions/interruptor.js');
const T = require('../functions/ticketShalom.js');

const H = 3600000;
const AHORA = Date.parse('2026-11-11T18:00:00Z');
const hace = (h) => new Date(AHORA - h * H).toISOString();

/* Los pedidos de cada escenario. */
const aMano = {id: 'p1', courier: 'Shalom', status: 'POR ALISTAR', shalomGuia: '10333333', trackingOrderNumber: '10333333',
  trackingOrderCode: 'AB12', shalomCodigo: 'AB12'};
const aManoEnCamino = Object.assign({}, aMano, {id: 'p2', status: 'ENVIADO', trackingStatus: 'En tránsito'});
const delPanel = (h, extra) => Object.assign({id: 'p3', courier: 'Shalom', status: 'ALISTADO', shalomGuia: '103373623',
  shalomCodigo: 'JHWJ', trackingOrderNumber: '', shalomPor: 'pro', shalomRegistradoEn: hace(h)}, extra || {});

/* El panel: registroShalom + tracking.js de verdad, con Shalom de mentira. */
function panel(respuesta, pedidos) {
  const toasts = [];
  const consultas = [];
  const win = {
    toast: (t) => toasts.push(t), save() {}, render() {}, _fbSaveShipmentNow() {},
    S: {shipments: pedidos},
    Shalom: {consultarGuia: async (g, c) => { consultas.push(g); return respuesta; }},
    console: console,
  };
  win.window = win;
  win.document = {getElementById: () => null, querySelectorAll: () => [], addEventListener() {}};
  win.setTimeout = (f) => { f(); return 0; };
  win.Date = class extends Date {
    constructor(...a) { if (a.length) super(...a); else super(AHORA); }
    static now() { return AHORA; }
  };
  const ctx = vm.createContext(win);
  ctx.globalThis = ctx;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'functions', 'registroShalom.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'panel', 'shalom', 'tracking.js'), 'utf8'), ctx);
  return {T: ctx.Tracking, toasts, consultas};
}

module.exports = async ({bloque, ok}) => {

  bloque('La regla: cuatro situaciones');

  {
    ok(R.situacion({}, AHORA).tipo === 'sinGuia', 'sin número: sinGuia');
    ok(R.situacion(aMano, AHORA).tipo === 'normal', 'escrita a mano en POR ALISTAR: normal (se consulta)');
    ok(R.situacion(Object.assign({}, aMano, {status: 'ENVIADO'}), AHORA).tipo === 'normal', 'a mano en cualquier etiqueta: normal');
    const s = R.situacion(delPanel(2), AHORA);
    ok(s.tipo === 'porDejar' && Math.round(s.venceEn / H) === 22, 'del panel, sin movimiento, hace 2 h: porDejar · vence en 22 h');
    ok(R.situacion(delPanel(30), AHORA).tipo === 'porDejar' && R.situacion(delPanel(30), AHORA).venceEn < 0,
       'pasadas las 24 h sigue porDejar (aún se mira), con el plazo ya vencido');
    ok(R.situacion(delPanel(73), AHORA).tipo === 'vencida', 'pasadas 72 h sin movimiento: vencida');
    ok(R.situacion(delPanel(73, {trackingStatus: 'En origen'}), AHORA).tipo === 'normal',
       'del panel y Shalom ya la movió: normal, aunque sea vieja');
    ok(R.situacion(delPanel(5, {shalomPor: '', shalomRegistradoEn: ''}), AHORA).tipo === 'normal',
       'guía del panel cambiada a mano (sin marca): normal');
    ok(R.situacion(delPanel(0, {shalomRegistradoEn: ''}), AHORA).tipo === 'porDejar' &&
       R.situacion(delPanel(0, {shalomRegistradoEn: ''}), AHORA).venceEn === null,
       'del panel sin hora (recuperada): porDejar, sin inventar cuenta atrás');
    ok(B.VENCIDA_H * H === R.VENCIDA_MS, 'los horarios usan el MISMO plazo (no hay un segundo número)');
  }

  bloque('«Shalom no conoce la guía» ya no es «Shalom caído»');

  {
    ok(P.motivoDeHttp(502, 'Shalom buscar API returned status 403') === 'NO_ENCONTRADO', 'el 403 de buscar (lo real) → NO_ENCONTRADO');
    ok(P.motivoDeHttp(500, 'Shalom buscar API returned status 404') === 'NO_ENCONTRADO', 'el 404 de buscar, igual');
    ok(P.motivoDeHttp(502, 'Bad gateway') === 'ERROR_SHALOM', 'un 502 de verdad sigue siendo ERROR_SHALOM');
    ok(P.motivoDeHttp(403, 'Invalid API Key') === 'BLOQUEADO', 'una clave rechazada sigue siendo BLOQUEADO');
    ok(P.motivoDeHttp(403, 'Invalid API Key or instance access') === 'SIN_INSTANCIA_VALIDA', 'y la instancia mala, igual que antes');
    ok(I.tras({fallos: 4}, {ok: false, motivo: 'NO_ENCONTRADO'}, AHORA, false) === null,
       '⚠️ no suma fallos: cinco guías por dejar ya no pausan la puerta');
  }

  bloque('Consulta por horarios: misma regla');

  {
    const sel = B.aConsultar([aMano, aManoEnCamino, delPanel(2), Object.assign(delPanel(80), {id: 'p4'})], AHORA);
    const ids = sel.consultar.map((x) => x.id).join();
    ok(ids === 'p1,p2,p3', 'consulta a mano, en camino y por dejar (así se entera cuando lo dejas)');
    ok(sel.saltados.vencidas === 1, 'salta la vencida (72 h)');
    const pd = sel.consultar.find((x) => x.id === 'p3');
    const cm = sel.consultar.find((x) => x.id === 'p2');
    ok(pd.porDejar === true && pd.conMovimiento === false, 'la por dejar va marcada');
    ok(cm.porDejar === false && cm.conMovimiento === true, 'la que ya se movía va marcada con movimiento');
    ok(sel.consultar.find((x) => x.id === 'p3').guia === '103373623', 'la del panel se consulta por shalomGuia');

    const idx = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');
    const loop = idx.slice(idx.indexOf('const sel = barrido.aConsultar'), idx.indexOf('// 4 · escribir'));
    ok(/sinRastro && \(item\.porDejar \|\|\s*await _esPendiente\(item\.guia, memoPend\) === true\)\)\s*\{\s*porDejar\+\+;[\s\S]*?continue;/.test(loop),
       'por dejar (del panel, o hallada en tus pendientes) + «no la conoce»: aparte, NO como fallida');
    ok(/const memoPend = \{\}/.test(idx), 'la lista de pendientes se pide UNA vez por corrida');
    ok(/sinRastro && item\.conMovimiento\) await _contarFalloDeServicio\(\)/.test(loop),
       '⚠️ con movimiento + «no la conoce»: SÍ cuenta para el interruptor (caída real disfrazada)');
    ok(/porDejar: porDejar/.test(idx), 'el informe dice cuántas están por dejar');
    ok(/u\.porDejar/.test(fs.readFileSync(path.join(__dirname, '..', 'panel', 'shalom', 'shalom-ajustes.js'), 'utf8')),
       'y Config lo muestra');
  }

  bloque('Jalar ticket: misma regla, sin gastar la llamada');

  {
    const mundo = (pedido) => {
      const v = {descargas: 0};
      const deps = {
        leerPedido: async () => pedido, instancia: async () => 'inst-1', ahora: () => AHORA,
        descargar: async () => { v.descargas++; return {ok: true, bytes: Buffer.from('x'), tipo: 'image/png'}; },
        subir: async () => 'https://x/guia.png', guardar: async () => {},
      };
      return {deps, v};
    };
    let m = mundo(delPanel(2));
    let r = await T.jalar({pedidoId: 'p3', orderNumber: '103373623', orderCode: 'JHWJ'}, m.deps);
    ok(!r.ok && r.motivo === 'POR_DEJAR' && m.v.descargas === 0, 'por dejar: «sale cuando lo dejes», sin llamar a Shalom');
    m = mundo(Object.assign(delPanel(80), {id: 'p4'}));
    r = await T.jalar({pedidoId: 'p4', orderNumber: '103373623', orderCode: 'JHWJ'}, m.deps);
    ok(!r.ok && r.motivo === 'VENCIDA' && m.v.descargas === 0, 'vencida: lo dice, sin llamar');
    m = mundo(aMano);
    r = await T.jalar({pedidoId: 'p1', orderNumber: '10333333', orderCode: 'AB12'}, m.deps);
    ok(r.ok && m.v.descargas === 1, 'a mano (aunque esté en POR ALISTAR): se jala normal');
    m = mundo(delPanel(2, {trackingStatus: 'En origen'}));
    r = await T.jalar({pedidoId: 'p3', orderNumber: '103373623', orderCode: 'JHWJ'}, m.deps);
    ok(r.ok && m.v.descargas === 1, 'del panel ya dejada: se jala normal');
    m = mundo(delPanel(2));
    r = await T.jalar({pedidoId: 'p3', orderNumber: '10999999', orderCode: 'ZZ99'}, m.deps);
    ok(r.ok && m.v.descargas === 1, 'otra guía escrita en el formulario (sin guardar): es tuya a mano, se jala');
    const tk = fs.readFileSync(path.join(__dirname, '..', 'panel', 'shalom', 'ticket.js'), 'utf8');
    ok(/POR_DEJAR'\) return '📦 El comprobante sale cuando dejes el paquete/.test(tk) && /VENCIDA'\)/.test(tk),
       'el panel lo dice en palabras');
  }

  bloque('El botón Consultar y el masivo, en el panel de verdad');

  {
    const noConoce = {ok: false, motivo: 'NO_ENCONTRADO', detalle: 'Shalom buscar API returned status 403'};
    let p = panel(noConoce, [delPanel(2)]);
    await p.T.consultarAhora('p3');
    ok(p.consultas.join() === '103373623', 'por dejar: SÍ consulta (para enterarse cuando lo dejas)');
    ok(/📦 Registrado — aún no entra a la agencia · vence en 22 h/.test(p.toasts.join('|')) && !/error/i.test(p.toasts.join('|')),
       'y dice «Registrado — aún no entra a la agencia · vence en 22 h», no «error»');
    p = panel(noConoce, [delPanel(30)]);
    await p.T.consultarAhora('p3');
    ok(/el plazo de 24 h ya pasó: regístrala de nuevo/.test(p.toasts.join('|')), 'pasado el plazo: lo dice');
    p = panel(noConoce, [aMano]);
    await p.T.consultarAhora('p1');
    ok(p.consultas.length === 1 && /Shalom aún no tiene esta guía en su rastreo/.test(p.toasts.join('|')),
       'a mano y Shalom no la conoce: consulta y lo explica sin alarma');
    p = panel(noConoce, [Object.assign(delPanel(80), {id: 'p4'})]);
    await p.T.consultarAhora('p4');
    ok(p.consultas.length === 0 && /venció sin dejar el paquete/.test(p.toasts.join('|')), 'vencida: no gasta la consulta');
    p = panel({ok: false, motivo: 'ERROR_SHALOM', detalle: 'Bad gateway'}, [aMano]);
    await p.T.consultarAhora('p1');
    ok(/Shalom tuvo un error/.test(p.toasts.join('|')), 'un error de verdad se sigue diciendo como error');

    p = panel(noConoce, [aManoEnCamino, delPanel(2), Object.assign(delPanel(80), {id: 'p4'})]);
    await p.T.bulkTrack(['p2', 'p3', 'p4']);
    ok(p.consultas.length === 2, 'masivo: salta la vencida');
    ok(/📦 1 por dejar en agencia/.test(p.toasts.join('|')) && /1 sin dato/.test(p.toasts.join('|')),
       'masivo: la por dejar se cuenta aparte, no como «sin dato»');
  }

  bloque('Renovar a las 24 h: el 403 de buscar ya no lo bloquea');

  {
    const r = await R.puedeRenovar(delPanel(30), {ahora: () => AHORA, rastrear: async () => ({ok: false, motivo: P.motivoDeHttp(502, 'Shalom buscar API returned status 403')})});
    ok(r.ok === true, 'Shalom no la conoce + 24 h pasadas → se puede registrar de nuevo');
  }
  bloque('Guía escrita a mano pero PENDIENTE en tu Shalom Pro (el caso 103375443)');

  {
    const lista = {'0': {service_order_guia_empresarial: '103375443', code_val: '1234'},
      '1': {service_order_guia_empresarial: '103376505'}};
    ok(R.enPendientes(lista, '103375443') === true, 'la encuentra en la lista (llega como objeto {"0":…})');
    ok(R.enPendientes([{guia: '103375443'}], 103375443) === true, 'también como array y con número');
    ok(R.enPendientes({data: [{orderNumber: '103375443'}]}, '103375443') === true, 'y envuelta en data');
    ok(R.enPendientes(lista, '10337544') === false, 'por el número EXACTO, no por parecido');
    ok(R.enPendientes(null, '103375443') === false && R.enPendientes(lista, '') === false, 'sin lista o sin guía: no');

    const idx = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');
    const gen = idx.slice(idx.indexOf('const r = await _porLaPuerta(destino, paso.datos, diagnostico);'));
    ok(/destino === "track" && !diagnostico &&\s*r\.motivo === "NO_ENCONTRADO"[\s\S]{0,200}_esPendiente\(g\)[\s\S]{0,120}motivo: "PENDIENTE"/.test(gen),
       'Consultar: «no la conoce» → busca en tus pendientes → PENDIENTE');
    ok(/revisoPendientes: pend === false/.test(gen), 'si miró y no está, lo dice (revisoPendientes)');
    ok(/esPendiente: \(g\) => _esPendiente\(g\)/.test(idx), 'el ticket también mira tus pendientes');

    const aManoAlistado = Object.assign({}, aMano, {id: 'p5', status: 'ALISTADO', shalomGuia: '103375443', trackingOrderNumber: '103375443'});
    let p = panel({ok: false, motivo: 'PENDIENTE'}, [aManoAlistado]);
    await p.T.consultarAhora('p5');
    ok(/Registrada en tu Shalom Pro — pendiente: falta dejar el paquete en la agencia/.test(p.toasts.join('|')),
       'a mano + pendiente en tu cuenta: «Registrada en tu Shalom Pro — pendiente…»');
    p = panel({ok: false, motivo: 'NO_ENCONTRADO', revisoPendientes: true}, [aManoAlistado]);
    await p.T.consultarAhora('p5');
    ok(/ni en su rastreo ni en tus pendientes/.test(p.toasts.join('|')), 'ni pública ni pendiente: «revisa número y código», sin «es normal»');
    p = panel({ok: false, motivo: 'PENDIENTE'}, [aManoAlistado]);
    await p.T.bulkTrack(['p5']);
    ok(/📦 1 por dejar en agencia/.test(p.toasts.join('|')), 'masivo: la pendiente cuenta como «por dejar»');

    const v = {d: 0};
    const deps = {leerPedido: async () => aManoAlistado, instancia: async () => 'inst-1', ahora: () => AHORA,
      descargar: async () => { v.d++; return {ok: false, motivo: 'NO_ENCONTRADO'}; },
      esPendiente: async (g) => g === '103375443', subir: async () => '', guardar: async () => {}};
    const rt = await T.jalar({pedidoId: 'p5', orderNumber: '103375443', orderCode: 'JPHN'}, deps);
    ok(!rt.ok && rt.motivo === 'POR_DEJAR', 'ticket de una guía a mano pendiente: «sale cuando dejes el paquete»');
    deps.esPendiente = async () => false;
    const rt2 = await T.jalar({pedidoId: 'p5', orderNumber: '103375443', orderCode: 'JPHN'}, deps);
    ok(!rt2.ok && rt2.motivo === 'NO_ENCONTRADO', 'y si no está en pendientes, sigue siendo «no encontró»');
  }
};
