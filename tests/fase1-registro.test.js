/**
 * tests/fase1-registro.test.js — Fase 1 (10/11/2026)
 * ===================================================
 *   · Registrar en POR ALISTAR o ALISTADO, con la caja elegida de un toque.
 *   · «Registrar al guardar»: se decide con lo que hay EN PANTALLA, y el
 *     registro va cuando el pedido ya subió.
 *   · La clave a la nota PRIVADA, y la marca de «lo registró Shalom Pro».
 *   · Guía a mano: nada de registro en el bloque (como antes).
 *   · Registrar de nuevo pasadas 24 h — con TODOS los candados en el servidor.
 *   · El link del cliente: la clave jamás; FINALIZADO no se sondea; los
 *     pedidos viejos se enseñan al mínimo; ya en Shalom, solo Shalom.
 */
'use strict';
const E = require('./_entorno.js');
const R = require('../functions/registroShalom.js');
const PP = require('../functions/pedidoPublico.js');
const vm = require('vm');

const PEDIDO_OK = () => ({
  id: 'id_1', name: 'Ana Pérez', status: 'POR ALISTAR', courier: 'SHALOM',
  agenciaId: '499', agenciaCourier: 'SHALOM', agenciaNombre: 'Lima Centro',
  dni: '73483547', phone: '918642656', shalomClave: '5773',
  pkgLargo: 30, pkgAncho: 20, pkgAlto: 12, pkgPeso: 1.5,
  reniec: {nombres: 'ANA', apePaterno: 'PEREZ', apeMaterno: 'GOMEZ'},
});
const CFG_OK = {agenciaOrigen: {agenciaId: '576', agenciaCourier: 'SHALOM'},
  instanceId: 'abc'};
const AHORA = Date.parse('2026-11-10T15:00:00.000Z');
const HACE = (h) => new Date(AHORA - h * 3600000).toISOString();

/* El servidor, con todo inyectado: cuenta cuántas veces se REGISTRA. */
function mundo(op) {
  op = op || {};
  const v = {registros: 0, rastreos: 0, guardado: null};
  const deps = {
    leerPedido: async () => op.pedido,
    leerConfig: async () => CFG_OK,
    llamar: async () => {
      v.registros++;
      return op.respuesta || {ok: true, json: {guia: '103300001', codigo: 'NUEV', quote: 12}};
    },
    pendientes: async () => op.pendientes || [],
    guardar: async (c) => { v.guardado = c; },
    ahora: () => AHORA,
    rastrear: async () => {
      v.rastreos++;
      if (op.rastreoRevienta) throw new Error('red');
      return op.rastreo;
    },
  };
  return {v, deps};
}

module.exports = async ({bloque, ok}) => {

  bloque('La puerta: POR ALISTAR o ALISTADO');

  {
    ok(R.faltantes(Object.assign(PEDIDO_OK(), {status: 'ALISTADO'}), CFG_OK).length === 0,
       'ALISTADO sin guía se puede registrar');
    ok(R.faltantes(Object.assign(PEDIDO_OK(), {status: 'ENVIADO'}), CFG_OK).length === 1,
       'ENVIADO no');
  }

  bloque('La caja de un toque (como Shalom Pro)');

  {
    const sinMedidas = Object.assign(PEDIDO_OK(), {pkgLargo: '', pkgAncho: '', pkgAlto: '', pkgPeso: ''});
    ok(R.faltantes(sinMedidas, CFG_OK).length === 2, 'sin caja ni medidas: faltan medidas y peso');
    const conCaja = Object.assign({}, sinMedidas, {pkgCaja: 'M'});
    ok(R.faltantes(conCaja, CFG_OK).length === 0, 'con la caja elegida no hace falta medir ni pesar');
    ok(R.contenidoDe(conCaja) === 'PAQUETE M', 'y se registra como esa caja');
    ok(R.contenidoDe(Object.assign({}, sinMedidas, {pkgCaja: 'XXS'})) === 'PAQUETE XS',
       'XXS va como XS (el registro no ofrece XXS)');
    ok(R.tipoElegido({pkgCaja: 'XL'}) === '' && R.tipoElegido({pkgCaja: '<b>'}) === '',
       'solo cajas del catálogo');
    ok(R.contenidoDe(Object.assign(PEDIDO_OK(), {pkgTipo: 'L'})) === 'PAQUETE S',
       '`pkgTipo` (calculado) NO manda: solo `pkgCaja`');
    const cuerpo = R.cuerpo(conCaja, CFG_OK);
    ok(cuerpo && cuerpo.content === 'PAQUETE M', 'el cuerpo que va a Shalom lleva la caja elegida');
  }

  bloque('Al registrarse: ALISTADO, marca Pro y la clave a la nota PRIVADA');

  {
    const m = mundo({pedido: Object.assign(PEDIDO_OK(), {privateNote: 'Cliente difícil', notes: 'Llamar antes'})});
    const r = await R.orquestar({pedidoId: 'id_1'}, m.deps, {simulacro: false});
    const g = m.v.guardado;
    ok(r.ok && g.status === 'ALISTADO', 'pasa a ALISTADO');
    ok(g.shalomPor === 'pro' && g.shalomRegistradoEn === new Date(AHORA).toISOString(), 'con la marca de Shalom Pro y la hora');
    ok(g.privateNote === 'Cliente difícil\n🔑 Clave Shalom: 5773 · guía 103300001',
       'la clave y la guía se AÑADEN a la nota privada, sin borrar lo que había');
    ok(!('notes' in g), '⚠️ nunca en `notes`, que la ve el cliente');
    ok(R.notaConClave(g.privateNote, '5773', '103300001') === g.privateNote, 'no se repite si ya está');
  }

  bloque('¿Lo registró Shalom Pro, o es una guía a mano?');

  {
    ok(!R.registradoPorPro({shalomGuia: '98173469'}), 'guía a mano: no');
    ok(R.registradoPorPro({shalomGuia: '98173469', shalomPor: 'pro'}), 'con la marca: sí');
    ok(R.registradoPorPro({shalomGuia: '98173469', shalomRegistradoEn: HACE(2)}),
       'los de antes de la marca: por su hora de registro');
    ok(!R.registradoPorPro({shalomPor: 'pro'}), 'sin guía no hay registro');
  }
  {
    // ⚠️ Corregir la guía A MANO sobre una de Pro: la nueva no es de Pro.
    const tk = E.leer('tracking.js');
    ok(/if \(guiaAnterior && guiaAnterior !== num\) \{[\s\S]{0,400}ship\.shalomPor          = '';\s*ship\.shalomRegistradoEn = '';/.test(tk),
       'en el seguimiento manual: guía cambiada → sin marca Pro ni hora');
    const c = E.leer('config.js');
    ok(/if\(_sGuia && _gPrev && _sGuia !== _gPrev\)\{ data\.shalomPor=''; data\.shalomRegistradoEn=''; \}/.test(c),
       'y en el formulario del pedido, igual (después de la lista que conserva campos)');
    ok(c.indexOf("data.shalomPor=''") > c.indexOf("'dniDestinatario'].forEach"),
       'el borrado va DESPUÉS de la lista que conserva, o la lista lo desharía');
  }

  bloque('⏰ Registrar de nuevo: todos los candados en el servidor');

  const VENCIDA = () => Object.assign(PEDIDO_OK(), {status: 'ALISTADO', shalomGuia: '103100000',
    shalomCodigo: 'VIEJ', shalomRegistradoEn: HACE(30), shalomPor: 'pro'});

  {
    const casos = [
      ['dentro de las 24 h', Object.assign(VENCIDA(), {shalomRegistradoEn: HACE(10)}), {}, 'NO_VENCIDA'],
      ['sin hora de registro', Object.assign(VENCIDA(), {shalomRegistradoEn: ''}), {}, 'NO_VENCIDA'],
      ['el pedido ya dice que Shalom lo movió', Object.assign(VENCIDA(), {trackingStatus: 'En origen'}), {}, 'YA_EN_AGENCIA'],
      ['Shalom dice que ya entró', VENCIDA(), {rastreo: {ok: true, estado: 'En origen'}}, 'YA_EN_AGENCIA'],
      ['sin red con Shalom', VENCIDA(), {rastreo: {ok: false, motivo: 'SIN_RED'}}, 'NO_VERIFICADO'],
      ['respuesta rara', VENCIDA(), {rastreo: {ok: false, motivo: 'FORMATO_DESCONOCIDO'}}, 'NO_VERIFICADO'],
      ['la consulta revienta', VENCIDA(), {rastreoRevienta: true}, 'NO_VERIFICADO'],
      ['sin guía', PEDIDO_OK(), {}, 'SIN_DATO'],
    ];
    for (const [nombre, ped, op, motivo] of casos) {
      const m = mundo(Object.assign({pedido: ped}, op));
      const r = await R.orquestar({pedidoId: 'id_1', renovar: true}, m.deps, {simulacro: false});
      ok(!r.ok && r.motivo === motivo && m.v.registros === 0 && m.v.guardado === null,
         nombre + ' → ' + motivo + ', y NO se registra ni se escribe nada');
    }
  }
  {
    for (const motivo of ['SOLO_REGISTRADO', 'NO_ENCONTRADO']) {
      const m = mundo({pedido: VENCIDA(), rastreo: {ok: false, motivo: motivo}});
      const r = await R.orquestar({pedidoId: 'id_1', renovar: true}, m.deps, {simulacro: false});
      const g = m.v.guardado || {};
      ok(r.ok && m.v.registros === 1 && g.shalomGuia === '103300001',
         'vencida y Shalom dice ' + motivo + ' → se registra UNA vez');
      ok(Array.isArray(g.shalomGuiasAnteriores) && g.shalomGuiasAnteriores[0].guia === '103100000' &&
         g.shalomGuiasAnteriores[0].motivo === 'vencida', 'la guía vieja queda en el historial');
      ok(g.trackingStatus === '' && g.shalomRegistradoEn === new Date(AHORA).toISOString(),
         'seguimiento limpio y nueva hora: empieza otro plazo de 24 h');
    }
  }
  {
    const m = mundo({pedido: VENCIDA(), rastreo: {ok: false, motivo: 'SOLO_REGISTRADO'}});
    const r = await R.orquestar({pedidoId: 'id_1', renovar: true}, m.deps, {simulacro: true});
    ok(r.ok && r.simulacro && m.v.registros === 0, 'en simulacro: no llama a Shalom');
  }
  {
    // ⚠️ Se corta a mitad: en pendientes SOLO está la guía VIEJA (misma clave y destino).
    const m = mundo({pedido: VENCIDA(), rastreo: {ok: false, motivo: 'SOLO_REGISTRADO'},
      respuesta: {ok: false, motivo: 'SIN_RED'},
      pendientes: [{code_val: '5773', destination_station: {ter_id: 499},
        service_order_guia_empresarial: '103100000', code_service_order_empresarial: 'VIEJ'}]});
    const r = await R.orquestar({pedidoId: 'id_1', renovar: true}, m.deps, {simulacro: false});
    ok(r.estado === 'duda' && m.v.guardado === null,
       '⚠️ en duda, la guía VIEJA no se toma por la nueva: se dice «no sabemos»');
  }
  {
    const m = mundo({pedido: VENCIDA()});
    const r = await R.orquestar({pedidoId: 'id_1'}, m.deps, {simulacro: false});
    ok(!r.ok && m.v.registros === 0 && m.v.rastreos === 0,
       'sin pedir «renovar», un pedido con guía jamás se registra otra vez');
  }
  {
    const srv = E.leer('functions/index.js');
    ok(/rastrear: async \(guia, codigo\) => \{\s*const rt = await _porLaPuerta\("track"/.test(srv),
       'el servidor le da a orquestar la consulta de la guía (solo se usa al renovar)');
    const sh = E.leer('shalom.js');
    ok(/if \(opc && opc\.renovar === true\) d\.renovar = true;/.test(sh), 'el panel pide renovar explícitamente');
  }

  bloque('🔒 La clave jamás sale por el link del cliente');

  {
    const ped = Object.assign(PEDIDO_OK(), {shalomClave: '3321', address: 'Mz D lote 3321',
      privateNote: '🔑 Clave Shalom: 3321 · guía 103300001', notes: 'Su clave de recojo es 3321',
      extra: {'Clave': '3321', 'Color': 'rojo clave: 3321'},
      shalomGuiasAnteriores: [{guia: '1', codigo: 'X'}]});
    const out = PP.proyectar(ped, {code: 'ABCD', frozen: false});
    ok(!('privateNote' in out) && !('shalomClave' in out) && !('shalomGuiasAnteriores' in out),
       'ni la nota privada, ni la clave, ni las guías viejas');
    ok(out.notes === 'Su clave de recojo es ****', 'escrita en las notas, se tapa');
    ok(out.extra.Clave === '****' && out.extra.Color === 'rojo clave: ****', 'y en los campos extra');
    ok(out.address === 'Mz D lote 3321', 'una dirección con esos números NO se toca');
    const sinDir = JSON.stringify(Object.assign({}, out, {address: ''}));
    ok(sinDir.indexOf('3321') < 0, '⚠️ fuera de la dirección, «3321» no aparece en ninguna parte');
    ok(PP.SECRETOS.indexOf('privateNote') >= 0 && PP.CAMPOS.indexOf('privateNote') < 0,
       'la nota privada está en la lista de NUNCA');
  }

  bloque('Links: FINALIZADO no se sondea, y lo viejo se enseña al mínimo');

  {
    const srv = E.leer('functions/index.js');
    ok(/\["ENTREGADO", "CANCELADO", "FINALIZADO"\]\s*\.includes\(String\(order\.status \|\| ""\)\.trim\(\)\.toUpperCase\(\)\)/.test(srv),
       'FINALIZADO congela el link: no se consulta cada 30 s');
    ok(/pedidoPublico\.minimizarViejo\(\s*pedidoPublico\.proyectar\(order, \{code, frozen\}\), order, Date\.now\(\)\)/.test(srv),
       'el link pasa por la reja del tiempo');
    ok(/if \(order\.trackingStatus && !safe\.minimo\)/.test(srv), 'y un pedido minimizado no gasta la lectura de config');
    const viejo = Object.assign(PEDIDO_OK(), {status: 'FINALIZADO', createdAt: new Date(AHORA - 61 * 86400000).toISOString(),
      address: 'Av X 123', notes: 'n', shalomGuia: '98173469'});
    const m = PP.minimizarViejo(PP.proyectar(viejo, {code: 'A', frozen: true}), viejo, AHORA);
    ok(m.minimo === true && !m.address && !m.dni && !m.notes && !m.name, 'pasados 60 días: sin dirección, DNI, notas ni nombre');
    ok(m.status === 'FINALIZADO' && m.shalomGuia === '98173469' && m.code === 'A', 'pero con estado, código y guía');
    const reciente = Object.assign({}, viejo, {createdAt: new Date(AHORA - 10 * 86400000).toISOString()});
    ok(!PP.minimizarViejo(PP.proyectar(reciente, {}), reciente, AHORA).minimo, 'uno reciente se ve completo');
    const activo = Object.assign({}, viejo, {status: 'ENVIADO'});
    ok(!PP.minimizarViejo(PP.proyectar(activo, {}), activo, AHORA).minimo, 'uno viejo pero sin terminar, también');
  }

  bloque('Seguimiento del cliente: ya en Shalom, solo Shalom');

  {
    const form = E.cliente();
    ok(/const _enShalom = narr\.esShalom && !!\(ship\.shalomGuia \|\| ship\.trackingOrderNumber\);/.test(form),
       'con guía de Shalom se reconoce «ya en Shalom»');
    ok(/\$\{_enShalom \? '' : `<div class="tk-section">\s*<div class="tk-lbl">Estado actual<\/div>/.test(form),
       'y la etiqueta del panel (Estado actual) se esconde');
    ok(/var titulo = estado \|\| 'Registrado en Shalom';/.test(form), 'sin estado de Shalom aún: «Registrado en Shalom»');
    // Toby habla de Shalom.
    const i = form.indexOf('function _ayudaTrackContenido(');
    const src = form.slice(i, form.indexOf('function abrirAyudaTrack(', i));
    const hn = form.slice(form.indexOf('function _holaNombre('), form.indexOf('/* La hoja de ayuda'));
    const ctx = vm.createContext({esc: (x) => String(x).replace(/</g, '&lt;')});
    vm.runInContext(hn + src + ';this.C=_ayudaTrackContenido;', ctx);
    const r1 = ctx.C('agencia', true, '', 'ALISTADO', 'ANA', {estado: 'En tránsito'});
    ok(/ya está en <b>Shalom<\/b>/.test(r1.toby) && /Shalom dice: <b>En tránsito<\/b>/.test(r1.toby),
       'Toby dice el estado de Shalom');
    ok(r1.estados.map((e) => e.t).join() === 'En origen,En camino,En destino,Entregado' &&
       !r1.estados.some((e) => /ALISTADO/.test(e.t)), 'y la lista explica las etapas de Shalom, no las etiquetas del panel');
    // Con la regla real de las fases, marca dónde va.
    const fx = E.trozoCliente('function _shalomFase(estado){', 'function _shalomTrackingBlock(');
    vm.runInContext(fx, ctx);
    ok(ctx.C('agencia', true, '', 'ALISTADO', '', {estado: 'En tránsito'}).actual === 1, '«En tránsito» → marca «En camino»');
    const r2 = ctx.C('agencia', true, '', 'ALISTADO', '', null);
    ok(/ALISTADO/.test(r2.toby), 'sin guía, como siempre');
    ok(/Por tu privacidad, los datos de un pedido entregado hace tiempo/.test(form), 'el link viejo explica por qué ve poco');
  }

  bloque('Panel: el bloque de registro y «Guardar y registrar»');

  const FUENTE = E.trozo('config.js', '/* ── 🚚 REGISTRAR EN SHALOM, DESDE EL PEDIDO', '\nfunction _claveAuto(){');
  function montar(op) {
    op = op || {};
    const ped = op.pedido || Object.assign(PEDIDO_OK(), {status: 'NUEVO PEDIDO'});
    const dom = E.domFalso({ids: ['shalomRegBlock', 'regShalomSalida', 'pkgResumen', 'btnGuardarEnvio', 'pkgBody']});
    const pant = Object.assign({fStatus: ped.status, fPkgLargo: ped.pkgLargo, fPkgAncho: ped.pkgAncho,
      fPkgAlto: ped.pkgAlto, fPkgPeso: ped.pkgPeso, fPkgCaja: ped.pkgCaja || '', fShalomClave: ped.shalomClave,
      fShalomGuia: ''}, op.pantalla || {});
    Object.keys(pant).forEach((k) => { dom.porId[k] = {value: String(pant[k] == null ? '' : pant[k])}; });
    const v = {toasts: [], guardados: [], confirmado: null, llamadas: [], abierto: null, guardo: 0};
    let t = AHORA;
    class FD extends Date { static now() { return (t += 500); } }
    const ctx = {
      window: {RegistroShalom: R, Shalom: {
        registrarEnvio: async (id, o) => { v.llamadas.push(o || null); return op.respuesta || null; },
        estadoSesion: async () => ({ok: true, sesion: {conectada: true}}), textoMotivo: (m) => m}},
      document: dom.doc, $: (id) => dom.porId[id] || null, Date: FD,
      S: {shipments: [ped], agenciaOrigen: {agenciaId: '576', agenciaCourier: 'SHALOM', agenciaNombre: 'Arequipa'},
        shalomInstancia: {id: 'abc'}, shalomRegistroSimulacro: false},
      _editId: 'id_1', _dirtyShips: new Set(op.noSube ? ['id_1'] : []),
      escH: (s) => (s == null ? '' : String(s)), toast: (x) => v.toasts.push(x),
      save: (id) => v.guardados.push(id), render: () => {}, confirmar: (o) => { v.confirmado = o; },
      console: {log: () => {}}, _congelarSiRegistrado: () => {}, _pintarOrigen: () => {},
      setTimeout: (fn) => { Promise.resolve().then(fn); return 1; }, clearTimeout: () => {},
      saveShipment: (c) => { v.guardo++; return op.guardaMal ? undefined : 'ok'; },
      openForm: (id) => { v.abierto = id; }, togglePkgAccordion: () => {}, salida: {},
    };
    Object.assign(ctx, op.ctx || {});
    Object.assign(ctx.window, op.win || {});
    const n = Object.keys(ctx);
    // eslint-disable-next-line no-new-func
    new Function(...n, FUENTE + '\nsalida.pintar=_pintarRegistroShalom; salida.preparar=_regPrepararForm;' +
      'salida.toggle=regAlGuardarToggle; salida.confirmarGuardar=_confirmarGuardarYRegistrar;' +
      'salida.renovar=renovarEnvioPanel; salida.alGuardar=()=>_regAlGuardar;')(...n.map((k) => ctx[k]));
    ctx.salida.preparar();
    return {api: ctx.salida, v, dom, ped, win: ctx.window, html: () => dom.porId.shalomRegBlock.innerHTML,
      resumen: () => dom.porId.pkgResumen.innerHTML, boton: () => dom.porId.btnGuardarEnvio.textContent};
  }
  const tick = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

  {
    // Guardado en NUEVO PEDIDO; en pantalla ya POR ALISTAR y caja M: se ofrece.
    const m = montar({pantalla: {fStatus: 'POR ALISTAR', fPkgCaja: 'M', fPkgLargo: '', fPkgAncho: '', fPkgAlto: '', fPkgPeso: ''}});
    m.api.pintar();
    ok(/btnRegAlGuardar/.test(m.html()) && /Registrar en Shalom al guardar/.test(m.html()) && /PAQUETE M/.test(m.html()),
       'con lo que hay EN PANTALLA ya se puede: se ofrece «Registrar en Shalom al guardar»');
    ok(!/btnRegistrarShalom/.test(m.html()), 'y no el botón directo (lo guardado aún no sirve)');
    ok(m.v.llamadas.length === 0, 'cero llamadas para decidirlo');
    m.api.toggle();
    ok(m.api.alGuardar() === true && /Guardar y registrar/.test(m.boton()), 'al marcarlo, el botón dice «Guardar y registrar»');
    m.api.confirmarGuardar();
    ok(m.v.confirmado && /envío real/.test(m.v.confirmado.html) && /ALISTADO/.test(m.v.confirmado.html),
       'antes de guardar se pide la confirmación (cuesta dinero)');
    ok(m.v.guardo === 0 && m.v.llamadas.length === 0, 'y hasta confirmar no se guarda ni se llama');
    await m.v.confirmado.alConfirmar();
    await tick();
    ok(m.v.guardo === 1 && m.v.llamadas.length === 1, 'al confirmar: se guarda y se registra UNA vez');
  }
  {
    const m = montar({noSube: true, pantalla: {fStatus: 'POR ALISTAR', fPkgCaja: 'S'}});
    m.api.pintar(); m.api.toggle(); m.api.confirmarGuardar();
    await m.v.confirmado.alConfirmar();
    for (let i = 0; i < 400 && m.v.abierto === null; i++) await tick();
    ok(m.v.llamadas.length === 0 && m.v.abierto === 'id_1',
       '⚠️ si el pedido no termina de subir, NO se registra: se reabre y se dice');
    ok(/no se registró nada/.test(m.dom.porId.regShalomSalida.innerHTML), 'con esas palabras');
  }
  {
    const m = montar({guardaMal: true, pantalla: {fStatus: 'POR ALISTAR', fPkgCaja: 'S'}});
    m.api.pintar(); m.api.toggle(); m.api.confirmarGuardar();
    await m.v.confirmado.alConfirmar(); await tick();
    ok(m.v.llamadas.length === 0, 'si el guardado no pasa (faltan nombre/teléfono), no se registra');
  }
  {
    const m = montar({pantalla: {fStatus: 'POR ALISTAR', fPkgCaja: '', fPkgPeso: ''}});
    m.api.pintar();
    ok(/faltan 1 dato/.test(m.resumen()) && !/btnRegAlGuardar/.test(m.html()), 'si falta algo en pantalla, se dice y no se ofrece');
  }
  {
    const m = montar({pantalla: {fStatus: 'POR ALISTAR', fShalomGuia: '98173469'}});
    m.api.pintar();
    ok(m.html() === '' && !/clave/.test(m.resumen()), 'con una guía escrita a mano en pantalla: nada de registro');
  }
  {
    const m = montar({pedido: Object.assign(PEDIDO_OK(), {status: 'ALISTADO', shalomGuia: '103100000',
      shalomRegistradoEn: new Date(AHORA - 30 * 3600000).toISOString(), shalomPor: 'pro'})});
    m.api.pintar();
    ok(/Esta guía venció/.test(m.html()) && /btnRenovarShalom/.test(m.html()), 'vencida: «🔁 Registrar de nuevo»');
    m.api.renovar();
    ok(/se cobra otra vez/.test(m.v.confirmado.html) && /5773/.test(m.v.confirmado.html),
       'la confirmación dice que se cobra otra vez y que la clave sigue igual');
    await m.v.confirmado.alConfirmar();
    ok(m.v.llamadas.length === 1 && m.v.llamadas[0].renovar === true, 'y pide renovar explícitamente');
  }
  {
    const m = montar({pedido: Object.assign(PEDIDO_OK(), {status: 'ALISTADO', shalomGuia: '103100000',
      shalomRegistradoEn: new Date(AHORA - 3 * 3600000).toISOString(), shalomPor: 'pro'})});
    m.api.pintar();
    ok(/quedan <b>2[01] h/.test(m.html()) && !/btnRenovarShalom/.test(m.html()), 'dentro del plazo: cuánto queda, sin botón de renovar');
  }
  {
    const m = montar({pedido: Object.assign(PEDIDO_OK(), {status: 'ALISTADO', shalomGuia: '103100000',
      shalomRegistradoEn: new Date(AHORA - 30 * 3600000).toISOString(), shalomPor: 'pro', trackingStatus: 'En origen'})});
    m.api.pintar();
    ok(!/btnRenovarShalom/.test(m.html()) && !/quedan/.test(m.html()), 'si Shalom ya lo movió, ni plazo ni renovar');
  }

  bloque('La pantalla: caja de un toque, y la ayuda adentro');

  {
    const p = E.leer('index.html');
    ['XXS', 'XS', 'S', 'M', 'L'].forEach((c) =>
      ok(new RegExp('data-caja="' + c + '" onclick="pkgElegirCaja\\(\'' + c + '\'\\)"').test(p), 'botón de caja ' + c));
    ok(/data-caja="" onclick="pkgElegirCaja\(''\)" title="Calcular por medidas"><b>📏<\/b>/.test(p), 'y 📏 para medidas propias');
    const hdr = p.slice(p.indexOf('onclick="togglePkgAccordion()"'), p.indexOf('id="pkgBody"'));
    ok(!/Ayuda/.test(hdr), 'el 📖 ya no está en la cabecera del desplegable');
    ok(/id="pkgBody">\s*<!--[^>]*-->\s*<div style="text-align:right;margin:-4px 0 8px"><span onclick="if\(window\.Ayuda\)Ayuda\.abrir\('registroShalom'\)"[^>]*>📖 Ayuda<\/span>/.test(p),
       'está adentro, como en Documentos del envío');
    const c = E.leer('config.js');
    ok(/data\.pkgCaja=\(\$\('fPkgCaja'\)\|\|\{value:''\}\)\.value\|\|'';/.test(c), 'la caja elegida se guarda con el pedido');
  }

  bloque('Escenarios del registro (11/11/2026): lo de pantalla cuenta sin guardar');

  {
    // DNI recién escrito, RENIEC ya respondió: el nombre partido cuenta YA.
    const sinRn = Object.assign(PEDIDO_OK(), {status: 'POR ALISTAR', reniec: null, dni: ''});
    const persona = {nombres: 'ANA', apePaterno: 'PEREZ', apeMaterno: 'GOMEZ', completo: 'ANA PEREZ GOMEZ', dni: '73483547'};
    const m = montar({pedido: sinRn, pantalla: {fDni: '73483547', fPkgCaja: 'S'},
      win: {_dniUltima: persona}});
    m.api.pintar();
    ok(!/RENIEC/.test(m.html()) && /btnRegAlGuardar/.test(m.html()),
       '⚠️ DNI + RENIEC en pantalla: ya no pide «guardar y volver a abrir»');
    const m2 = montar({pedido: sinRn, pantalla: {fDni: '11111111', fPkgCaja: 'S'},
      win: {_dniUltima: persona}});
    m2.api.pintar();
    ok(/RENIEC/.test(m2.html()), 'pero si el nombre de RENIEC es de OTRO DNI, no se usa (sería registrar a otra persona)');
  }
  {
    // La agencia recién elegida cuenta (la MISMA regla que al guardar).
    const sinAg = Object.assign(PEDIDO_OK(), {agenciaId: '', agenciaCourier: ''});
    const ag = {agenciaId: '499', agenciaCourier: 'SHALOM', agenciaNombre: 'Lima Centro', agenciaGeo: ''};
    const m = montar({pedido: sinAg, pantalla: {fStatus: 'POR ALISTAR', fPkgCaja: 'S'},
      ctx: {_agVigente: () => ag}, win: {Agencias: {limpiar: () => ({})}}});
    m.api.pintar();
    ok(!/agencia de destino/i.test(m.html()) && /btnRegAlGuardar/.test(m.html()), 'agencia recién elegida: lista para registrar');
    const m2 = montar({pedido: PEDIDO_OK(), pantalla: {fStatus: 'POR ALISTAR', fPkgCaja: 'S'},
      ctx: {_agVigente: () => null},
      win: {Agencias: {limpiar: () => ({agenciaId: null, agenciaNombre: null, agenciaGeo: null, agenciaCourier: null})}}});
    m2.api.pintar();
    ok(/agencia de destino/i.test(m2.html()), 'dirección cambiada a mano (la agencia ya no vale): se dice, igual que al guardar');
  }
  {
    // Servidor SIN la Fase 1: no trae marca ni nota → el panel la anota y avisa.
    const viejo = {ok: true, estado: 'exito', campos: {shalomGuia: '103307318', shalomCodigo: '9NPC', status: 'ALISTADO'}};
    const m = montar({respuesta: viejo, pantalla: {fStatus: 'POR ALISTAR', fPkgCaja: 'S'}});
    m.ped.privateNote = 'Llamar antes';
    m.api.pintar(); m.api.toggle(); m.api.confirmarGuardar();
    await m.v.confirmado.alConfirmar(); await tick(); await tick();
    ok(m.ped.privateNote === 'Llamar antes\n🔑 Clave Shalom: 5773 · guía 103307318',
       '⚠️ la clave queda en la nota privada aunque el servidor esté atrasado');
    ok(m.ped.shalomPor === 'pro' && m.v.toasts.some((t) => /firebase deploy/.test(t)),
       'y se avisa que hay que desplegar el servidor');
    const nuevo = {ok: true, estado: 'exito', campos: {shalomGuia: '1', status: 'ALISTADO', shalomPor: 'pro', privateNote: 'X'}};
    const m2 = montar({respuesta: nuevo, pantalla: {fStatus: 'POR ALISTAR', fPkgCaja: 'S'}});
    m2.api.pintar(); m2.api.toggle(); m2.api.confirmarGuardar();
    await m2.v.confirmado.alConfirmar(); await tick(); await tick();
    ok(m2.ped.privateNote === 'X' && !m2.v.toasts.some((t) => /firebase deploy/.test(t)), 'con el servidor al día, manda lo del servidor y no hay aviso');
  }
  {
    // Servidor viejo que pide medidas con una caja elegida: se dice qué hacer.
    const r = {ok: false, motivo: 'SIN_DATO', faltan: ['Faltan las medidas del paquete (largo, ancho y alto).']};
    const m = montar({respuesta: r, pantalla: {fStatus: 'POR ALISTAR', fPkgCaja: 'M'}});
    m.ped.pkgCaja = 'M'; // lo que el guardado real (saveShipment) deja en el pedido
    m.api.pintar(); m.api.toggle(); m.api.confirmarGuardar();
    await m.v.confirmado.alConfirmar(); for (let i = 0; i < 50 && m.v.abierto === null; i++) await tick();
    ok(/El servidor todavía no tiene la versión nueva/.test(m.dom.porId.regShalomSalida.innerHTML) &&
       /no se registró nada/.test(m.dom.porId.regShalomSalida.innerHTML), 'medidas pedidas con caja elegida → «despliega el servidor»');
  }

  bloque('Sobre (documentos A4), como en Shalom Pro');

  {
    const sobre = Object.assign(PEDIDO_OK(), {pkgCaja: 'SOBRE', pkgLargo: '', pkgAncho: '', pkgAlto: '', pkgPeso: ''});
    ok(R.faltantes(sobre, CFG_OK).length === 0 && R.contenidoDe(sobre) === 'SOBRE', 'el sobre no pide medidas y va como SOBRE');
    ok(R.cuerpo(sobre, CFG_OK).content === 'SOBRE' && R.CONTENIDOS.indexOf('SOBRE') >= 0, 'y es un contenido que el registro acepta');
    ok(/data-caja="SOBRE" onclick="pkgElegirCaja\('SOBRE'\)"/.test(E.leer('index.html')), 'tiene su botón ✉️');
  }

  bloque('El seguimiento automático ya no consulta guías muertas');

  {
    const B = require('../functions/barrido.js');
    const base = {courier: 'SHALOM', status: 'ALISTADO', shalomGuia: '103307318'};
    const r = B.aConsultar([
      Object.assign({id: 'a', shalomRegistradoEn: HACE(80)}, base),
      Object.assign({id: 'b', shalomRegistradoEn: HACE(30)}, base),
      Object.assign({id: 'c', shalomRegistradoEn: HACE(80), trackingStatus: 'En origen'}, base),
      Object.assign({id: 'd'}, base),
    ], AHORA);
    ok(r.saltados.vencidas === 1 && r.consultar.map((x) => x.id).join() === 'b,c,d',
       'registrada hace +72 h sin movimiento: no se consulta; recientes, movidas o puestas a mano, sí');
    ok(B.VENCIDA_H === 72, '72 h: ni dos días de cortes la dejan fuera por error');
  }
};
