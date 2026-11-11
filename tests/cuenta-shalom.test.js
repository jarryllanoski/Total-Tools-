/**
 * tests/cuenta-shalom.test.js — la cuenta de Shalom Pro, rehecha (11/11/2026)
 * ===========================================================================
 * El caso que lo provocó: la cuenta de la API tenía 14 instancias (el
 * límite del plan), varias de otros negocios (aquí, datos inventados); la del panel
 * («Total Tools Panel · totaltools@gmail.com») estaba CONECTADA, pero el
 * panel guardaba otro id. «Conectar» volvía a entrar siempre, el login
 * falló, y nunca guardaba el id bueno.
 *
 * Aquí: functions/cuentaShalom.js con el TRADUCTOR REAL de la puerta (la
 * lista llega con la forma que devuelve la API) y panel/shalom/shalom-cuenta.js.
 */
'use strict';
const E = require('./_entorno.js');
const C = require('../functions/cuentaShalom.js');
const P = require('../functions/shalomPuerta.js');

const MI = 'totaltools@gmail.com';
const CLAVE = 'Secreta-1234';
/* La lista como la devuelve GET /instances (forma de la documentación). */
const lista14 = (miaConectada) => ({instances: [
  // Otras instancias de la cuenta de la API (datos INVENTADOS): 13 ajenas.
  {id: 'ajena-01', name: 'Tienda Uno', username: null, isLoggedIn: false},
  {id: 'ajena-02', name: 'Tienda Dos', username: 'dueno.dos@ejemplo.pe', isLoggedIn: true},
  {id: 'ajena-03', name: 'Tienda Tres', username: 'dueno.tres@ejemplo.pe', isLoggedIn: true},
  {id: 'ajena-04', name: 'Tienda Prueba', username: null, isLoggedIn: false},
  {id: 'a44231bd', name: 'Total Tools Panel', username: MI, isLoggedIn: miaConectada},
  {id: 'ajena-06', name: 'Tienda Seis', username: null, isLoggedIn: false},
  {id: 'ajena-07', name: 'Tienda Siete', username: null, isLoggedIn: false},
  {id: 'ajena-08', name: 'Tienda Ocho', username: null, isLoggedIn: false},
  {id: 'ajena-09', name: 'Tienda Nueve', username: 'dueno.nueve@ejemplo.pe', isLoggedIn: true},
  {id: 'ajena-10', name: 'Tienda Diez', username: null, isLoggedIn: false},
  {id: 'ajena-11', name: 'Tienda Once', username: 'dueno.once@ejemplo.pe', isLoggedIn: true},
  {id: 'ajena-12', name: 'Tienda Doce', username: 'dueno.once@ejemplo.pe', isLoggedIn: true},
  {id: 'ajena-13', name: 'Tienda Trece', username: 'dueno.nueve@ejemplo.pe', isLoggedIn: true},
  {id: 'ajena-14', name: 'Tienda Catorce', username: 'dueno.nueve@ejemplo.pe', isLoggedIn: true},
]});

/* Las dependencias, como las arma functions/index.js, con Shalom de mentira. */
function mundo(op) {
  op = op || {};
  const v = {listar: 0, crear: [], entrar: [], estado: [], guardada: null};
  const crudo = op.lista || lista14(op.miaConectada !== false);
  const deps = {
    listar: async () => {
      v.listar++;
      if (op.listarFalla) return {ok: false, motivo: op.listarFalla};
      const t = P.traducir('instances', op.listaRara || crudo) || {};
      return Array.isArray(t.instancias) ? {ok: true, instancias: t.instancias} :
        {ok: false, motivo: t.motivo || 'FORMATO_DESCONOCIDO'};
    },
    crear: async (nombre) => {
      v.crear.push(nombre);
      return op.crear || {ok: false, motivo: 'BLOQUEADO'}; // plan lleno (403)
    },
    entrar: async (id, u, c) => { v.entrar.push(id); return op.entrar || {ok: true, json: {message: 'Login successful'}}; },
    estado: async (id) => {
      v.estado.push(id);
      return P.traducir('instanceStatus', op.status || {isLoggedIn: true, username: MI, url: 'https://pro.shalom.pe'});
    },
    guardarCuenta: async (id, usuario) => { v.guardada = {id, usuario}; },
  };
  return {deps, v};
}

module.exports = async ({bloque, ok}) => {

  bloque('Tu caso: la tuya está conectada y el panel tenía otro id');

  {
    const m = mundo();
    const r = await C.conectar(m.deps, {usuario: 'Totaltools@gmail.com', clave: CLAVE, idGuardado: 'id-viejo-que-ya-no-existe'});
    ok(r.ok && r.conectada && r.id === 'a44231bd', 'la encuentra por TU correo (sin importar mayúsculas)');
    ok(m.v.entrar.length === 0, '⚠️ ya conectada: NO vuelve a iniciar sesión (era lo que fallaba)');
    ok(m.v.crear.length === 0, 'y no crea nada');
    ok(m.v.guardada && m.v.guardada.id === 'a44231bd', '⚠️ y GUARDA el id bueno en el servidor (antes nunca llegaba a hacerlo)');
    ok(JSON.stringify(r).indexOf(CLAVE) < 0, 'la respuesta no trae la contraseña');
    ok(!/dueno\.|ajena-/.test(JSON.stringify(r)),
       '⚠️ ni correos ni ids de otras instancias');
  }

  bloque('Contraseña recién escrita: se entra para que Shalom guarde la nueva');

  {
    const m = mundo();
    const r = await C.conectar(m.deps, {usuario: MI, clave: CLAVE, recienEscritas: true});
    ok(r.ok && m.v.entrar.join() === 'a44231bd' && m.v.estado.join() === 'a44231bd', 'entra en TU instancia y confirma la sesión');
    const mal = mundo({entrar: {ok: false, motivo: 'BLOQUEADO'}});
    const r2 = await C.conectar(mal.deps, {usuario: MI, clave: 'otra', recienEscritas: true});
    ok(r2.ok && r2.conectada && /no aceptó la contraseña nueva/.test(r2.aviso),
       'si la nueva no entra pero la sesión sigue viva: sigue conectada, y avisa');
  }

  bloque('Sin sesión: entra una vez; contraseña mala: lo dice');

  {
    const m = mundo({miaConectada: false});
    const r = await C.conectar(m.deps, {usuario: MI, clave: CLAVE});
    ok(r.ok && m.v.entrar.join() === 'a44231bd' && m.v.guardada.id === 'a44231bd', 'entra en la tuya y la guarda');
    const mal = mundo({miaConectada: false, entrar: {ok: false, motivo: 'BLOQUEADO'}});
    const r2 = await C.conectar(mal.deps, {usuario: MI, clave: 'mala'});
    ok(!r2.ok && r2.motivo === 'CREDENCIALES_MALAS' && /correo o la contraseña/.test(r2.detalle),
       'un rechazo al entrar es la contraseña de pro.shalom.pe, no la clave de la API');
    const caida = mundo({miaConectada: false, entrar: {ok: false, motivo: 'ERROR_SHALOM'}});
    const r3 = await C.conectar(caida.deps, {usuario: MI, clave: CLAVE});
    ok(!r3.ok && r3.motivo === 'ERROR_SHALOM' && /no respondió/.test(r3.detalle), 'Shalom caído: se dice, sin culpar a la contraseña');
  }

  bloque('⚠️ Nunca otra instancia: ni la primera, ni la única, ni la conectada');

  {
    const sinMia = {instances: lista14(true).instances.filter((x) => x.username !== MI)};
    const m = mundo({lista: sinMia});
    const r = await C.conectar(m.deps, {usuario: MI, clave: CLAVE});
    ok(m.v.entrar.length === 0 && m.v.guardada === null, '⚠️ si la tuya no está, NO toma ninguna ajena (ni entra, ni guarda)');
    ok(m.v.crear.join() === C.NOMBRE, 'intenta crear la suya');
    ok(!r.ok && r.motivo === 'PLAN_LLENO' && /límite de instancias/.test(r.detalle), 'plan lleno (14/14): lo dice claro');
    const una = mundo({lista: {instances: [{id: 'ajena', name: 'Otra Tienda', username: 'otra@ejemplo.pe', isLoggedIn: true}]}});
    await C.conectar(una.deps, {usuario: MI, clave: CLAVE});
    ok(una.v.entrar.indexOf('ajena') < 0 && (una.v.guardada || {}).id !== 'ajena', 'aunque sea la ÚNICA de la cuenta');
    const huerf = mundo({lista: {instances: [{id: 'h1', name: C.NOMBRE, username: null, isLoggedIn: false},
      {id: 'h2', name: 'Tienda Prueba', username: null, isLoggedIn: false}]}});
    const rh = await C.conectar(huerf.deps, {usuario: MI, clave: CLAVE});
    ok(rh.ok && huerf.v.entrar.join() === 'h1' && huerf.v.crear.length === 0,
       'la que creó el panel y nunca entró (su nombre, sin correo) se reutiliza; la otra sin correo, no');
  }

  bloque('Sin la tuya y con cupo: la crea, entra y la guarda');

  {
    const vacia = mundo({lista: {instances: []}, crear: {ok: true, json: {status: 'created', instanceId: 'nueva-1'}}});
    const r = await C.conectar(vacia.deps, {usuario: MI, clave: CLAVE});
    ok(r.ok && vacia.v.crear.length === 1 && vacia.v.entrar.join() === 'nueva-1' && vacia.v.guardada.id === 'nueva-1',
       'crea UNA, entra y guarda su id');
    const sinId = mundo({lista: {instances: []}, crear: {ok: true, json: {status: 'created'}}});
    const r2 = await C.conectar(sinId.deps, {usuario: MI, clave: CLAVE});
    ok(!r2.ok && r2.motivo === 'FORMATO_DESCONOCIDO' && sinId.v.entrar.length === 0, 'si no devuelve el id, se para (no crea otra al lado)');
  }

  bloque('Varias con TU correo: manda la guardada, si no la conectada, si no se para');

  {
    const L = (a, b) => ({instances: [{id: 'x1', name: 'A', username: MI, isLoggedIn: a},
      {id: 'x2', name: 'B', username: MI, isLoggedIn: b}]});
    ok(C.mia(P.traducir('instances', L(true, true)).instancias, MI, 'x2').instancia.id === 'x2', 'la guardada');
    ok(C.mia(P.traducir('instances', L(false, true)).instancias, MI, '').instancia.id === 'x2', 'la única conectada');
    const m = mundo({lista: L(true, true)});
    const r = await C.conectar(m.deps, {usuario: MI, clave: CLAVE});
    ok(!r.ok && r.motivo === 'VARIAS_INSTANCIAS' && m.v.guardada === null, 'dos conectadas y ninguna guardada: no se adivina');
  }

  bloque('Fallos de red y de formato no se toman por «no hay ninguna»');

  {
    const red = mundo({listarFalla: 'SIN_RED'});
    const r = await C.conectar(red.deps, {usuario: MI, clave: CLAVE});
    ok(!r.ok && r.motivo === 'SIN_RED' && red.v.crear.length === 0, 'sin red: no crea nada');
    const rara = mundo({listaRara: {otraCosa: []}});
    const r2 = await C.conectar(rara.deps, {usuario: MI, clave: CLAVE});
    ok(!r2.ok && rara.v.crear.length === 0, '⚠️ respuesta rara: NO crea una duplicada');
    const sin = mundo();
    const r3 = await C.conectar(sin.deps, {usuario: '', clave: ''});
    ok(!r3.ok && r3.motivo === 'SIN_CREDENCIALES' && sin.v.listar === 0, 'sin credenciales: lo dice y no pregunta nada');
  }

  bloque('El estado: gratis, y dice qué pasa');

  {
    const m = mundo();
    const a = await C.estado(m.deps, {idGuardado: 'a44231bd', usuarioGuardado: MI, hayCredenciales: true});
    ok(a.ok && a.conectada && a.usuario === MI && a.id === 'a44231bd', 'conectada · tu correo');
    const b = await C.estado(m.deps, {idGuardado: '', hayCredenciales: false});
    ok(!b.conectada && b.motivo === 'SIN_CUENTA' && m.v.estado.length === 1, 'sin cuenta guardada: ni pregunta');
    const vieja = {deps: {estado: async () => ({ok: false, motivo: 'SIN_INSTANCIA_VALIDA'})}};
    const c = await C.estado(vieja.deps, {idGuardado: 'id-viejo', hayCredenciales: true});
    ok(!c.conectada && c.motivo === 'NO_EXISTE' && c.hayCredenciales, 'la guardada ya no existe: NO_EXISTE (y el panel se reconecta solo)');
  }

  bloque('El servidor: credenciales una vez, y el navegador solo ve lo suyo');

  {
    const srv = E.leer('functions/index.js');
    const i = srv.indexOf('if (paso.orquestar === "conectarShalom" ||');
    const blk = srv.slice(i, srv.indexOf('const destino = paso.destino;', i));
    ok(/const escritas = !!\(String\(d\.usuario \|\| ""\)\.trim\(\) && d\.clave\);/.test(blk) &&
       /credenciales\.guardar\(/.test(blk), 'si escribiste correo y contraseña, van a Secret Manager');
    ok(/credenciales\.leer\(\{leer: _leerSecreto\}\)/.test(blk), 'si no, se usan las guardadas');
    ok(!/json\([^)]*\bd\b[^.]/.test(blk.replace(/json\(await cuentaShalom/g, '')) && !/clave: d\.clave\}\)\);/.test(blk),
       'la contraseña recibida nunca se devuelve en ninguna respuesta');
    ok(!E.existe('functions/instanciaShalom.js') && !E.existe('functions/puertaInstancias.js'), 'fuera los dos módulos viejos');
    ok(P.PERMITIDAS.instances.soloServidor && P.PERMITIDAS.instanceStatus.soloServidor,
       '⚠️ la lista de instancias ya no llega al navegador');
  }

  bloque('El panel: una línea, un botón, y se reconecta solo');

  function panel(op) {
    op = op || {};
    const v = {estado: 0, conectar: [], toasts: [], pintados: 0};
    const dom = E.domFalso({ids: ['shalomCfgBloque', 'shalomCfgSalida']});
    dom.porId.credUser = {value: op.usuario || ''};
    dom.porId.credPass = {value: op.clave || ''};
    const oyentes = {};
    const win = {S: {}, addEventListener: (n, f) => { oyentes[n] = f; },
      Shalom: {
        estadoCuenta: async () => { v.estado++; return op.estado || {ok: true, conectada: true, usuario: MI, id: 'a44231bd'}; },
        conectar: async (u, c) => { v.conectar.push([u, c]); return op.conectar || {ok: true, conectada: true, usuario: MI, id: 'a44231bd'}; },
        textoMotivo: (m) => 'texto:' + m,
      }};
    const ctx = {window: win, S: win.S, $: (id) => dom.porId[id] || null, Shalom: win.Shalom,
      escH: (x) => String(x == null ? '' : x), toast: (t) => v.toasts.push(t),
      _pintarRegistroShalom: () => { v.pintados++; }, salida: {}};
    const n = Object.keys(ctx);
    // eslint-disable-next-line no-new-func
    new Function(...n, E.leerReal('panel/shalom/shalom-cuenta.js') +
      ';salida.pintar=_pintarShalomConfig;salida.conectar=cuentaShalomConectar;salida.fila=cuentaShalomFila;' +
      'salida.revisar=cuentaShalomRevisar;salida.estado=cuentaShalomEstado;')(...n.map((k) => ctx[k]));
    return {api: ctx.salida, v, dom, win, oyentes, html: () => dom.porId.shalomCfgBloque.innerHTML};
  }
  const tick = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

  {
    const p = panel();
    p.api.pintar(); await tick();
    ok(/● Conectada/.test(p.html()) && p.html().indexOf(MI) >= 0 && /cambiar cuenta/.test(p.html()),
       'conectada: «● Conectada · tu correo» y «cambiar cuenta»');
    ok(!/credPass/.test(p.html()), 'sin formulario cuando ya está conectada');
    ok(!/>comprobar<|>entrar<|Déjalos vacíos/.test(p.html()), 'sin «comprobar», sin «entrar», sin «Déjalos vacíos…»');
    ok(p.win.S.shalomInstancia && p.win.S.shalomInstancia.id === 'a44231bd', 'recuerda el id que dijo el servidor');
    p.api.pintar(); p.api.fila(); await tick();
    ok(p.v.estado === 1, 'pregunta UNA vez por sesión, no en cada repintado');
    ok(typeof p.oyentes['tt:nube-sincronizada'] === 'function', 'y al entrar al panel (con sesión) se revisa sola');
  }
  {
    const p = panel({estado: {ok: true, conectada: false, motivo: 'NO_EXISTE', hayCredenciales: true}});
    p.api.revisar(); await tick();
    ok(p.v.conectar.length === 1 && p.v.conectar[0][0] === '' && p.v.conectar[0][1] === '',
       '⚠️ se cayó y hay credenciales guardadas: se reconecta SOLA (con las guardadas)');
    ok(p.api.estado().estado === 'ok' && p.v.toasts.length === 0, 'y en silencio, si sale bien');
    p.api.revisar(); await tick();
    ok(p.v.conectar.length === 1, 'solo una vez por sesión (no en bucle)');
  }
  {
    const p = panel({estado: {ok: true, conectada: false, motivo: 'SIN_CUENTA', hayCredenciales: false}});
    p.api.pintar(); await tick();
    ok(/credUser/.test(p.html()) && /credPass/.test(p.html()) && /🔗 Conectar/.test(p.html()), 'sin cuenta: correo, contraseña y Conectar');
    ok(p.v.conectar.length === 0, 'sin credenciales guardadas no intenta conectar solo');
  }
  {
    const p = panel({usuario: MI, clave: CLAVE, estado: {ok: true, conectada: false, motivo: 'SIN_CUENTA', hayCredenciales: false},
      conectar: {ok: false, motivo: 'PLAN_LLENO', detalle: 'Tu plan llegó al límite de instancias.'}});
    p.api.revisar(); await tick();
    p.api.conectar(); await tick();
    ok(p.v.conectar.length === 1 && p.v.conectar[0][0] === MI && p.v.conectar[0][1] === CLAVE, 'Conectar manda lo escrito');
    ok(p.dom.porId.credPass.value === '', '⚠️ la contraseña se borra de la pantalla al instante');
    p.api.pintar();
    ok(/límite de instancias/.test(p.html()), 'el motivo, en palabras');
  }
  {
    const todo = E.modulosPanel().map(E.leerReal).join('\n');
    ok(!/verificarInstanciaShalom|elegirInstanciaShalom|elegirInstancia\(|estadoSesion\(|regComprobarSesion|conectarShalomUno/.test(todo),
       'nada de lo viejo queda en el panel');
    const p = panel({estado: {ok: true, conectada: false, motivo: 'NO_EXISTE', hayCredenciales: false}});
    p.api.revisar(); await tick();
    const fila = p.api.fila();
    ok(fila.ico === '⚠️' && fila.accion === 'conectar en Config', 'en el pedido: la cuenta caída se dice, con el camino a Config');
  }
};
