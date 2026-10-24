/**
 * tests/respaldo.test.js — el respaldo guarda lo que hay, y restaura sin romper
 * ===============================================================================
 * Se carga respaldo.js REAL y se le dan un DOM, un FileReader y un confirm de
 * mentira: lo que se comprueba es lo que el modulo hace con el estado `S`, no
 * lo que dice su fuente.
 *
 * Tres fallos que habia el 24/10/2026:
 *   1. el respaldo guardaba 9 de los 13 campos de la configuracion: ni los
 *      recursos ni la agencia de origen;
 *   2. restaurar antes de sincronizar DECIA «✅ restaurado» y no restauraba
 *      nada — la nube llegaba y lo reemplazaba todo;
 *   3. y añadir los campos sin cuidado habria hecho que restaurar un
 *      respaldo VIEJO borrara los recursos actuales.
 */
'use strict';
const E = require('./_entorno.js');

const ACTUAL = () => ({
  shipments: [{id: 'p1', name: 'Pedido de hoy'}],
  suppliers: [], couriers: ['SHALOM'], courierActive: {}, labels: ['NUEVO PEDIDO'],
  msgTemplates: {}, extraFields: [], dispatch: {}, statusPin: '1234', trash: [],
  config: {name: 'Total Tools', phone: '933724178'},
  recursos: [{id: 'r1', titulo: 'Catalogo octubre'}],
  agenciaOrigen: {agenciaId: '100', agenciaNombre: 'AREQUIPA'},
  shalomInstancia: {id: 'cuenta-viva'},
  shalomRegistroSimulacro: true,
});

function montar(op) {
  op = op || {};
  const toasts = [];
  const guardados = [];
  const win = {
    S: op.S || ACTUAL(),
    _nubeLista: op.nubeLista !== false,
    toast: (t) => toasts.push(t),
    save: (x) => guardados.push(x === undefined ? 'todo' : x),
    confirm: () => true,
  };
  const doc = {readyState: 'complete', getElementById: () => null,
    createElement: () => ({click() {}, remove() {}}), body: {appendChild() {}, removeChild() {}}};
  function FR() {}
  FR.prototype.readAsText = function(f) { this.onload({target: {result: f.texto}}); };
  E.cargar('respaldo.js', win, {document: doc, FileReader: FR,
    console: {warn() {}, error() {}}, localStorage: {getItem() { return null; }, setItem() {}}});
  const restaurar = (data) => {
    const input = {files: [{texto: JSON.stringify(data)}], value: 'x'};
    win.Respaldo.restaurarDesdeArchivo(input);
    return input;
  };
  return {win, toasts, guardados, restaurar};
}

const RESPALDO = (extra) => Object.assign({
  _meta: {app: 'Total Tools', formato: 2, fechaLegible: 'hoy'},
  shipments: [{id: 'r-p1', name: 'Pedido restaurado'}],
  suppliers: [], couriers: ['SHALOM'], courierActive: {}, labels: ['NUEVO PEDIDO'],
  msgTemplates: {}, extraFields: [], dispatch: {}, statusPin: '1234', trash: [],
  config: {name: 'Total Tools', phone: '933724178'},
}, extra || {});

module.exports = async ({bloque, ok}) => {

  bloque('⚠️ El respaldo guarda lo que antes se le escapaba');

  {
    const src = E.leer('respaldo.js');
    const i = src.indexOf('function _construirRespaldo');
    const cuerpo = src.slice(i, src.indexOf('function _validar', i));
    ok(/recursos:/.test(cuerpo),
       '⚠️ guarda los RECURSOS — tus enlaces a Drive. Antes no estaban, y el ' +
       'dia que hiciera falta el respaldo no los habria devuelto');
    ok(/agenciaOrigen:/.test(cuerpo), 'y la agencia de origen');
    ok(/shalomInstancia:/.test(cuerpo),
       'y la cuenta de Shalom, para que quede constancia');
    ok(!/shalomRegistroSimulacro/.test(cuerpo.replace(/\/\*[\s\S]*?\*\//g, '')),
       '⚠️ pero NO el simulacro: es un interruptor de seguridad, no un dato');
    ok(/var FORMATO_VERSION = 2;/.test(src), 'formato 2');
  }

  bloque('⚠️ Restaurar antes de sincronizar se bloquea');

  {
    const m = montar({nubeLista: false});
    const antes = JSON.stringify(m.win.S);
    m.restaurar(RESPALDO());
    ok(JSON.stringify(m.win.S) === antes,
       '⚠️ con la nube sin contestar, NO se toca nada. Antes se restauraba, ' +
       'la nube llegaba, lo reemplazaba todo — y el aviso ya habia dicho ' +
       '«✅ restaurado»');
    ok(m.toasts.some((t) => /sincronice/.test(t)),
       'y se dice por que, con la salida: esperar y volver a intentar');
    ok(m.guardados.length === 0, 'ni se intenta guardar');
  }
  {
    const m = montar();
    m.restaurar(RESPALDO());
    ok(m.win.S.shipments[0].id === 'r-p1',
       'con la nube cargada, se restaura como siempre');
    ok(m.guardados.indexOf('todo') >= 0, 'y se guarda completo');
  }

  bloque('⚠️ Un respaldo VIEJO no borra lo que no trae');

  {
    /* Un respaldo de formato 1 —de los que ya hay descargados— no tiene
       `recursos` ni `agenciaOrigen`. Con `S.recursos = data.recursos || []`
       restaurarlo BORRARIA los actuales. «No existe» no es «esta vacio». */
    const viejo = RESPALDO({_meta: {app: 'Total Tools', formato: 1}});
    const m = montar();
    m.restaurar(viejo);
    ok(m.win.S.recursos.length === 1 && m.win.S.recursos[0].id === 'r1',
       '⚠️ restaurar un respaldo de formato 1 deja tus recursos ACTUALES: no ' +
       'los trae, y lo que no se trae no se borra');
    ok(m.win.S.agenciaOrigen && m.win.S.agenciaOrigen.agenciaId === '100',
       'y la agencia de origen tambien se queda');
    ok(m.win.S.shipments[0].id === 'r-p1',
       'mientras que lo que SI trae —los pedidos— se restaura');
  }
  {
    const m = montar();
    m.restaurar(RESPALDO({recursos: [{id: 'r9', titulo: 'Del respaldo'}],
      agenciaOrigen: {agenciaId: '777'}}));
    ok(m.win.S.recursos[0].id === 'r9' && m.win.S.agenciaOrigen.agenciaId === '777',
       'un respaldo NUEVO si los restaura');
  }
  {
    const m = montar();
    m.restaurar(RESPALDO({recursos: []}));
    ok(m.win.S.recursos.length === 0,
       'y si el respaldo los trae VACIOS, se vacian: borrarlos tambien fue ' +
       'una decision que el respaldo recuerda');
  }

  bloque('⚠️ Nunca pisa la cuenta de Shalom ni el simulacro');

  {
    const m = montar();
    m.restaurar(RESPALDO({shalomInstancia: {id: 'cuenta-muerta'},
      shalomRegistroSimulacro: false}));
    ok(m.win.S.shalomInstancia.id === 'cuenta-viva',
       '⚠️ la cuenta de Shalom se queda la ACTUAL: ya murieron dos, y ' +
       'restaurar un id viejo romperia el registro sin explicacion');
    ok(m.win.S.shalomRegistroSimulacro === true,
       '⚠️ y el simulacro sigue encendido: con el apagado, registrar COBRA, ' +
       'y un respaldo viejo no puede tener poder para eso');
    ok(m.toasts.some((t) => /Conectar/.test(t)),
       'y si la cuenta del respaldo era otra, se dice: «pulsa Conectar»');
  }
  {
    const m = montar();
    m.restaurar(RESPALDO({shalomInstancia: {id: 'cuenta-viva'}}));
    ok(!m.toasts.some((t) => /Conectar/.test(t)),
       'si era la misma cuenta, no se avisa de nada que no haga falta');
  }
};
