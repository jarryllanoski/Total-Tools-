/**
 * tests/links-generados.test.js — «Links generados» sin bajar la colección entera
 * ===============================================================================
 * Hasta el 26/10/2026 cada apertura de Compartir, cada 🔄 y CADA VEZ QUE UN
 * CLIENTE USABA UN LINK se leían todos los tokens desde el primero. Ahora:
 *   · al entrar: los por usar + los usados desde el inicio de AYER (Lima);
 *   · «Cargar anteriores»: de 50 en 50, a pedido;
 *   · «Cargar todo»: la descarga completa de antes, solo si se pulsa;
 *   · si la consulta falla: la descarga completa, para no dejar la pantalla
 *     vacía.
 */
'use strict';
const F = require('../functions/fechaPedido.js');
const E = require('./_entorno.js');

/* La capa de datos real (fsQuery + las dos funciones de tokens) contra un
   fetch de mentira que apunta qué se pidió. */
function capaDatos(respuestas) {
  const pedidos = [];
  const src = E.trozo('index.html', 'async function fsQuery(padre', '  // Latido de salud') +
    E.trozo('index.html', '  const _tokConId', '  window._fbDelTok = ');
  const fromFs = (v) => ('stringValue' in v) ? v.stringValue :
    ('booleanValue' in v) ? v.booleanValue : null;
  const fetch = async (url, op) => {
    const cuerpo = JSON.parse(op.body);
    pedidos.push({url, cuerpo});
    const docs = respuestas(cuerpo.structuredQuery) || [];
    return {ok: true, json: async () => docs.map((d) => ({document: {
      name: 'projects/p/databases/(default)/documents/panel/tokens/items/' + d.id,
      fields: Object.keys(d).reduce((o, k) => {
        o[k] = typeof d[k] === 'boolean' ? {booleanValue: d[k]} : {stringValue: String(d[k])};
        return o;
      }, {}),
    }})).concat([{readTime: 'x'}])};
  };
  const win = {};
  // eslint-disable-next-line no-new-func
  new Function('window', 'fetch', 'BASE', 'KEY', 'RAIZ', '_authHeaders', '_errorFs', 'fromFs',
      src)(win, fetch, 'https://fs/documents', 'K', 'panel', async () => ({}),
      (r, t) => new Error(t), fromFs);
  return {win, pedidos};
}

module.exports = async ({bloque, ok}) => {

  bloque('El corte: desde el inicio de AYER, hora de Lima');

  {
    ok(F.inicioDiaLimaISO('2026-10-25') === '2026-10-25T05:00:00.000Z',
       'medianoche de Lima son las 05:00 UTC (Perú no cambia de hora)');
    ok(F.sumarDias('2026-10-26', -1) === '2026-10-25', 'ayer');
    ok(F.sumarDias('2026-11-01', -1) === '2026-10-31' &&
       F.sumarDias('2027-01-01', -1) === '2026-12-31', 'cruzando mes y año');
    ok(F.sumarDias('basura', -1) === '' && F.inicioDiaLimaISO('') === '', 'basura → ""');
    // Un link usado ayer a las 11 p. m. de Lima (04:00 UTC de hoy) entra; uno
    // de anteayer a las 11 p. m. (04:00 UTC de ayer) no.
    const corte = F.inicioDiaLimaISO(F.sumarDias('2026-10-26', -1));
    ok('2026-10-26T04:00:00.000Z' >= corte && !('2026-10-25T04:00:00.000Z' >= corte),
       'ayer 11 p. m. entra; anteayer 11 p. m. no');
  }

  bloque('Al entrar: dos consultas pequeñas, no la colección entera');

  {
    const {win, pedidos} = capaDatos((q) => {
      const f = q.where.fieldFilter;
      if (f.field.fieldPath === 'used') {
        return [{id: 'p1', used: false, createdAt: '2026-09-01T10:00:00Z'},
          {id: 'x', used: false}];
      }
      // 'x' se usó entre las dos consultas: sale también aquí.
      return [{id: 'u1', used: true, usedAt: '2026-10-26T15:00:00.000Z'},
        {id: 'x', used: true, usedAt: '2026-10-26T16:00:00.000Z'}];
    });
    const r = await win._fbListToksRecientes('2026-10-25T05:00:00.000Z');
    ok(pedidos.length === 2 && pedidos.every((p) => /panel\/tokens:runQuery\?key=K$/.test(p.url)),
       'dos consultas runQuery sobre panel/tokens');
    const filtros = pedidos.map((p) => p.cuerpo.structuredQuery.where.fieldFilter);
    ok(filtros.some((f) => f.field.fieldPath === 'used' && f.op === 'EQUAL' &&
       f.value.booleanValue === false), 'una: los por usar (used == false)');
    ok(filtros.some((f) => f.field.fieldPath === 'usedAt' && f.op === 'GREATER_THAN_OR_EQUAL' &&
       f.value.stringValue === '2026-10-25T05:00:00.000Z'), 'otra: los usados desde el corte');
    ok(pedidos.every((p) => p.cuerpo.structuredQuery.from[0].collectionId === 'items'),
       'sobre la colección de links');
    ok(r.map((d) => d.id).sort().join(',') === 'p1,u1,x',
       'un link usado entre las dos consultas sale UNA sola vez');
    ok(r.every((d) => d._name && d.id), 'cada uno con su id y su ruta (para paginar)');
  }

  bloque('«Cargar anteriores»: de 50 en 50, sin saltarse ninguno');

  {
    const {win, pedidos} = capaDatos(() => [{id: 'a1', used: true, usedAt: '2026-10-20T10:00:00.000Z'}]);
    await win._fbListToksAnteriores('2026-10-25T05:00:00.000Z', null, 50);
    let q = pedidos[0].cuerpo.structuredQuery;
    ok(q.where.fieldFilter.op === 'LESS_THAN' && q.where.fieldFilter.field.fieldPath === 'usedAt',
       'los usados ANTES del corte');
    ok(q.orderBy[0].field.fieldPath === 'usedAt' && q.orderBy[0].direction === 'DESCENDING',
       'del más reciente al más viejo');
    ok(q.limit === 50 && !q.startAt, 'la primera página: 50, sin cursor');
    await win._fbListToksAnteriores('2026-10-25T05:00:00.000Z',
        {usedAt: '2026-10-20T10:00:00.000Z', name: 'projects/p/.../items/a1'}, 50);
    q = pedidos[1].cuerpo.structuredQuery;
    ok(q.startAt && q.startAt.before === false &&
       q.startAt.values[0].stringValue === '2026-10-20T10:00:00.000Z' &&
       q.startAt.values[1].referenceValue === 'projects/p/.../items/a1',
       'la siguiente sigue DESPUÉS del último (fecha + ruta: dos en el mismo ms no se saltan)');
  }

  bloque('El panel: qué pide, qué conserva, y el respaldo');

  {
    const cfg = E.leer('config.js');
    const desde = cfg.indexOf('let _tokRecientes');
    const hasta = cfg.indexOf('// Pinta la lista desde _tokCache');
    const src = cfg.slice(desde, hasta);
    const llamadas = {rec: 0, ant: [], todo: 0};
    let fallaRec = false;
    let paginas = [];
    const win = {
      FechaPedido: Object.assign({}, F, {hoyLima: () => '2026-10-26'}),
      _fbListToksRecientes: async (desde) => {
        llamadas.rec++; llamadas.corte = desde;
        if (fallaRec) throw new Error('índice');
        return [{id: 'r1', used: false, createdAt: '2026-10-26T10:00:00Z'}];
      },
      _fbListToksAnteriores: async (antes, cursor, lim) => {
        llamadas.ant.push({antes, cursor, lim}); return paginas.shift() || [];
      },
      _fbListToks: async () => { llamadas.todo++; return [{id: 'viejo', used: true}]; },
    };
    const list = {innerHTML: ''};
    // eslint-disable-next-line no-new-func
    const api = new Function('window', '$', 'toast', '_renderTokList',
        'let _tokCache=[];' + src +
        ';return {_revalidateTokens, tokCargarAnteriores, tokCargarTodo, _tokPie,' +
        ' cache: () => _tokCache, estado: () => ({todo:_tokTodo, fin:_tokFin, ant:_tokAnteriores})};',
    )(win, () => list, () => {}, () => {});

    await api._revalidateTokens(true);
    ok(llamadas.rec === 1 && llamadas.todo === 0,
       '⚠️ al entrar NO se baja la colección entera');
    ok(llamadas.corte === '2026-10-25T05:00:00.000Z', 'el corte es el inicio de ayer en Lima');
    ok(/data-act="anteriores"/.test(api._tokPie()), 'abajo, «Cargar anteriores»');

    const pag1 = Array.from({length: 50}, (_, i) => ({id: 'a' + i, used: true,
      usedAt: '2026-10-2' + (i % 3) + 'T10:00:00.000Z', _name: 'n/a' + i}));
    paginas = [pag1, [{id: 'z', used: true, usedAt: '2026-10-01T10:00:00.000Z', _name: 'n/z'}]];
    await api.tokCargarAnteriores(null);
    ok(llamadas.ant[0].lim === 50 && llamadas.ant[0].cursor === null, 'primera página de 50');
    ok(api.cache().length === 51 && !api.estado().fin, 'se suman, y puede haber más');
    await api.tokCargarAnteriores(null);
    ok(llamadas.ant[1].cursor.name === 'n/a49', 'la segunda sigue desde el último');
    ok(api.estado().fin && /No hay más links/.test(api._tokPie()) &&
       /data-act="todo"/.test(api._tokPie()),
       'al final: «No hay más» y «Cargar todo (incluye los muy antiguos)»');

    await api._revalidateTokens(false);
    ok(llamadas.rec === 2 && llamadas.ant.length === 2 && api.cache().length === 52,
       'un refresco rehace SOLO los recientes y conserva los anteriores ya pagados');

    await api.tokCargarTodo(null);
    ok(llamadas.todo === 1 && api.estado().todo && api._tokPie() === '',
       '«Cargar todo» hace la descarga completa, solo al pulsarlo');

    // Respaldo: si la consulta parcial falla, la lista completa.
    const api2 = new Function('window', '$', 'toast', '_renderTokList',
        'let _tokCache=[];' + src + ';return {_revalidateTokens, cache: () => _tokCache};',
    )(win, () => list, () => {}, () => {});
    fallaRec = true;
    await api2._revalidateTokens(true);
    ok(llamadas.todo === 2 && api2.cache().length === 1,
       'si la consulta falla, se baja la lista completa: la pantalla nunca queda vacía');
  }

  bloque('Lo demás sigue igual');

  {
    const cfg = E.leer('config.js');
    ok(/_tokAnteriores = _tokAnteriores\.filter/.test(cfg.slice(cfg.indexOf('await window._fbDelTok(id)'))),
       'borrar un link anterior también lo quita de lo cargado');
    ok(/if\(act==='anteriores'\)\{ tokCargarAnteriores\(btn\)/.test(cfg) &&
       /if\(act==='todo'\)\{\s+tokCargarTodo\(btn\)/.test(cfg),
       'los botones están enganchados');
    ok(/window\._fbListToks = async/.test(E.leer('index.html')),
       'la lista completa sigue existiendo para «Cargar todo» y el respaldo');
  }
};
