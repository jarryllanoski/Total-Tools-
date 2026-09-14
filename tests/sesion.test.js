/**
 * tests/sesion.test.js — la sesión y lo que se lleva por delante al cerrarse
 * ==========================================================================
 * De un caso real: la sesión venció a las 12 h con el panel abierto, Firestore
 * empezó a responder 403 y el panel dijo "Sin conexión a Firebase". A revisar
 * el internet por un problema de permisos.
 *
 * Y el otro lado del mismo problema: cerrar sesión BORRA el respaldo local
 * —incluidos los cambios que no alcanzaron a subir— y lo hacía en silencio.
 */
'use strict';
const E = require('./_entorno.js');

/* auth.js construye su pantalla de login al cargar, así que necesita un
   document que sepa crear nodos. Sigue siendo mucho menos que jsdom, y obliga
   a declarar qué se usa de verdad. */
function domAuth() {
  const nodos = {};
  const crear = () => {
    const n = {
      style: {}, innerHTML: '', textContent: '', value: '', className: '',
      _hijos: [], _ev: {},
      appendChild(h) { n._hijos.push(h); return h; },
      remove() {}, focus() {}, setAttribute() {}, getAttribute() { return null; },
      addEventListener(ev, fn) { n._ev[ev] = fn; },
      querySelector() { return null; },
      classList: {add() {}, remove() {}, contains() { return false; }}
    };
    return n;
  };
  return {
    nodos,
    doc: {
      readyState: 'complete',
      getElementById: (id) => nodos[id] || null,
      createElement: crear,
      querySelector: () => null,
      addEventListener: () => {},
      body: crear(),
      head: crear()
    }
  };
}

function montar(op) {
  op = op || {};
  const d = domAuth();
  const guardado = Object.assign({}, op.almacen || {});
  const visto = {recargas: 0, preguntas: []};
  const ls = {
    getItem: (k) => (k in guardado ? guardado[k] : null),
    setItem: (k, v) => { guardado[k] = String(v); },
    removeItem: (k) => { delete guardado[k]; }
  };
  const win = {
    document: d.doc,
    localStorage: ls,
    location: {reload: () => { visto.recargas++; }},
    navigator: {onLine: true},
    confirm: (m) => { visto.preguntas.push(m); return op.confirma !== false; },
    fetch: async () => ({ok: false, status: 400, json: async () => ({})}),
    setTimeout: () => {},
    console: {warn() {}, log() {}, error() {}}
  };
  E.cargar('auth.js', win, {
    document: d.doc, localStorage: ls, location: win.location,
    navigator: win.navigator, fetch: win.fetch, console: win.console,
    setTimeout: win.setTimeout, confirm: win.confirm
  });
  return {win, guardado, visto, nodos: d.nodos};
}

const sucios = (ids) => JSON.stringify({all: false, s: ids, p: []});

module.exports = async ({bloque, ok}) => {

  bloque('Cerrar sesión avisa antes de llevarse lo que no subió');

  {
    const m = montar({almacen: {dpanel: '{}', dpanel_dirty: sucios(['a', 'b'])}});
    m.win.AuthModule.logout();
    ok(m.visto.preguntas.length === 1, 'con cambios sin subir, pregunta antes');
    ok(m.visto.preguntas[0].indexOf('2 cambios') > 0, 'y dice cuántos son');
    ok(m.visto.preguntas[0].indexOf('SE PIERDEN') > 0,
       'sin rodeos: cerrar sesión los borra');
  }
  {
    const m = montar({almacen: {dpanel: '{}', dpanel_dirty: sucios(['a'])},
      confirma: false});
    m.win.AuthModule.logout();
    ok(m.visto.recargas === 0, 'si dices que no, no cierra');
    ok(m.guardado.dpanel === '{}', 'y no borra nada');
    ok(m.guardado.dpanel_dirty, 'los cambios siguen ahí');
  }
  {
    const m = montar({almacen: {dpanel: '{}', dpanel_dirty: sucios(['a'])}});
    m.win.AuthModule.logout();
    ok(m.guardado.dpanel === undefined,
       'si dices que sí, se borra igual: es tu decisión, no una sorpresa');
    ok(m.visto.recargas === 1, 'y se cierra');
  }
  {
    const m = montar({almacen: {dpanel: '{}'}});
    m.win.AuthModule.logout();
    ok(m.visto.preguntas.length === 0,
       'sin nada pendiente no pregunta: un aviso que sale siempre deja de leerse');
    ok(m.guardado.dpanel === undefined, 'y borra los datos, como debe');
  }
  {
    const m = montar({almacen: {dpanel: '{}',
      dpanel_dirty: JSON.stringify({all: true, s: [], p: []})}});
    m.win.AuthModule.logout();
    ok(m.visto.preguntas.length === 1,
       '"subir todo" pendiente también avisa, aunque no se pueda contar');
    ok(m.visto.preguntas[0].indexOf('Hay cambios') === 0,
       'y no inventa un número');
  }
  {
    const m = montar({almacen: {dpanel: '{}', dpanel_dirty: '{{{roto'}});
    m.win.AuthModule.logout();
    ok(m.visto.preguntas.length === 0 && m.visto.recargas === 1,
       'un registro corrupto no deja a nadie encerrado sin poder salir');
  }

  bloque('Vencer no es lo mismo que cerrar sesión');

  {
    const m = montar({almacen: {dpanel: '{"x":1}', dpanel_dirty: sucios(['a']),
      tt_id_token: 'T', tt_auth_inicio: '123'}});
    m.win._authExpulsar('Tu sesión venció. Ingresa de nuevo.');
    ok(m.guardado.tt_id_token === undefined, 'el token se borra');
    ok(m.guardado.dpanel === '{"x":1}',
       'pero el respaldo NO: la misma persona va a volver a entrar en diez ' +
       'segundos y su cambio sin subir no puede desaparecer por un accidente');
    ok(m.guardado.dpanel_dirty, 'ni el registro de lo que falta subir');
    ok(m.visto.preguntas.length === 0, 'y no pregunta nada: no fue una decisión');
  }
  {
    const m = montar({almacen: {dpanel: '{"x":1}', tt_id_token: 'T'}});
    m.win._authExpulsar();
    ok(m.guardado.dpanel === undefined,
       'sin nada pendiente sí se borra: son una copia, y dejarla es exponer ' +
       'nombres y DNI de clientes a quien se siente en la PC');
  }
  ok(typeof montar({}).win._authExpulsar === 'function',
     'y la puerta existe para que index.html la llame ante un 403');
};
