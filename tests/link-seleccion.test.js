/**
 * tests/link-seleccion.test.js — cada link con sus dias y sus couriers
 * ======================================================================
 * Cada link ya congelaba su configuracion al generarse (la «foto»), pero la
 * sacaba de la configuracion GLOBAL. Para un link solo con Shalom habia que
 * cambiar Config, guardar, generar y deshacer — y otra PC generando a la vez
 * se llevaba el cambio a medias.
 *
 * Ahora la seleccion vive en ESTE navegador y la foto sale de ella. Se
 * ejecuta el codigo real de config.js con un localStorage y un S de mentira.
 */
'use strict';
const E = require('./_entorno.js');

const SRC = E.trozo('config.js', "const _LINK_SEL_KEY = 'tt_link_sel';",
    '/* ── LINKS RÁPIDOS');

function montar(op) {
  op = op || {};
  const almacen = Object.assign({}, op.almacen || {});
  const fotos = [];
  const S = op.S || {
    couriers: ['SHALOM', 'OLVA COURIER', 'DELIVERY'],
    courierActive: {'OLVA COURIER': false},
    dispatch: {days: [4, 5], cutHour: '11:30', anticipation: 0},
    config: {name: 'Total Tools', phone: '933724178', city: 'Lima'},
    extraFields: [],
  };
  const win = {_fbSaveFormConfig: op.sinGuardar ? undefined :
    async (id, snap) => { fotos.push({id, snap}); }};
  const ctx = {
    S, window: win, toast: () => {},
    $: () => null,
    escH: (x) => String(x), escJs: (x) => String(x),
    localStorage: {
      getItem: (k) => (k in almacen ? almacen[k] : null),
      setItem: (k, v) => { almacen[k] = String(v); },
      removeItem: (k) => { delete almacen[k]; },
    },
    salida: {},
  };
  const n = Object.keys(ctx);
  new Function(...n, SRC + `
    salida.sel = _linkSel; salida.dia = linkSelDia; salida.cur = linkSelCourier;
    salida.reset = linkSelComoConfig; salida.falta = _linkSelFalta;
    salida.foto = _snapshotFormConfig;`)(...n.map((k) => ctx[k]));
  return {api: ctx.salida, S, almacen, fotos};
}

module.exports = async ({bloque, ok}) => {

  bloque('La primera vez, arranca como Config');

  {
    const m = montar();
    const s = m.api.sel();
    ok(JSON.stringify(s.days) === '[4,5]', 'los dias de Config');
    ok(s.couriers.SHALOM === true && s.couriers['OLVA COURIER'] === false &&
       s.couriers.DELIVERY === true,
       'y los couriers como esten en Config — apagado alli, apagado aqui');
  }

  bloque('⚠️ Tocar aqui NO toca Config');

  {
    const m = montar();
    const antes = JSON.stringify(m.S);
    m.api.cur('DELIVERY');
    m.api.dia(1);
    ok(JSON.stringify(m.S) === antes,
       '⚠️ la configuracion global queda IDENTICA: no hay ningun documento ' +
       'compartido que dos PCs puedan pisarse');
    ok(m.almacen.tt_link_sel && /DELIVERY":false/.test(m.almacen.tt_link_sel),
       'la seleccion se guarda en ESTE navegador');
    const s = m.api.sel();
    ok(s.couriers.DELIVERY === false && s.days.indexOf(1) >= 0,
       'y se recuerda la proxima vez');
  }
  {
    const m = montar({almacen: {tt_link_sel: JSON.stringify(
        {days: [2], couriers: {SHALOM: false}})}});
    m.api.reset();
    ok(!('tt_link_sel' in m.almacen), '↺ como en Config borra la memoria…');
    ok(JSON.stringify(m.api.sel().days) === '[4,5]', '…y vuelve a los de Config');
  }

  bloque('⚠️ La foto del link sale de lo marcado aqui');

  {
    const m = montar();
    m.api.cur('DELIVERY');              // apagar Delivery para este link
    m.api.dia(4);                        // quitar el jueves
    const id = await m.api.foto();
    ok(typeof id === 'string' && id.length > 6, 'la foto tiene id');
    const f = m.fotos[0].snap;
    ok(f.courierActive.DELIVERY === false && f.courierActive.SHALOM === true,
       '⚠️ la foto lleva los couriers de ESTE link, no los de Config');
    ok(JSON.stringify(f.dispatch.days) === '[5]',
       'y los dias de este link');
    ok(f.dispatch.cutHour === '11:30',
       'mientras la hora de corte sigue saliendo de Config, como se dijo');
    ok(f.courierActive['OLVA COURIER'] === false,
       'y TODOS los couriers van con un valor explicito: el formulario trata ' +
       '«sin valor» como encendido, y un hueco ofreceria uno apagado');
  }
  {
    const m = montar({sinGuardar: true});
    let fallo = false;
    try { await m.api.foto(); } catch (e) { fallo = true; }
    ok(fallo,
       '⚠️ sin la funcion de guardar, NO devuelve id: antes lo devolvia igual ' +
       'y el link apuntaba a una foto que nunca se escribio');
  }

  bloque('Cuadrada contra los couriers de HOY');

  {
    const m = montar({almacen: {tt_link_sel: JSON.stringify(
        {days: [4], couriers: {SHALOM: true, 'BORRADO': true}})}});
    m.S.couriers.push('MARVISUR');
    const s = m.api.sel();
    ok(!('BORRADO' in s.couriers),
       'un courier borrado en Config desaparece: no queda un fantasma');
    ok(s.couriers.MARVISUR === true,
       'uno nuevo entra con el valor de Config');
    ok(s.couriers.SHALOM === true, 'y lo elegido se respeta');
  }

  bloque('No deja generar un link inservible');

  {
    const m = montar({almacen: {tt_link_sel: JSON.stringify({days: []})}});
    ok(/día/.test(m.api.falta()), 'sin dias, avisa');
    const m2 = montar({almacen: {tt_link_sel: JSON.stringify(
        {days: [4], couriers: {SHALOM: false, 'OLVA COURIER': false, DELIVERY: false}})}});
    ok(/envío/.test(m2.api.falta()), 'sin couriers, avisa');
    ok(montar().api.falta() === '', 'con todo bien, deja');
  }

  bloque('⚠️ El id de la foto viaja en el token');

  {
    const cfg = E.leer('config.js');
    [['async function _genTokenDo', 'function genToken('],
      ['async function _genQuickDo', 'function genQuickToken(']].forEach(([a, b]) => {
      const f = cfg.slice(cfg.indexOf(a), cfg.indexOf(b));
      const foto = f.indexOf('_snapshotFormConfig()');
      const guarda = f.indexOf('_fbSaveTok(tok)');
      ok(foto > 0 && guarda > foto && /tok\.cfgId=cfgId/.test(f),
         a.replace('async function ', '') + ': foto PRIMERO, su id dentro del ' +
         'token, y despues se guarda el token');
      ok(/if\(!cfgId\)\{/.test(f),
         'y sin foto no hay link: caer a Config ofreceria lo que desmarcaste');
    });
  }
  {
    const srv = E.leer('functions/index.js');
    const h = srv.slice(srv.indexOf('async function handleToken'),
        srv.indexOf('async function handleConfig'));
    ok(/cfgId: cfgId/.test(h), 'el servidor devuelve el id con el token');
    const re = /\/\^\[A-Za-z0-9_-\]\{6,40\}\$\//;
    ok(re.test(h), 'validando su forma');
    const valida = (x) => /^[A-Za-z0-9_-]{6,40}$/.test(x);
    ok(valida('abc1234xyz') && !valida('../../x') && !valida('a b'),
       'y esa forma no deja pasar una ruta ni basura');
    const form = E.leer('formulario.html');
    ok(/const cfgId = _tokCfgId \|\| new URLSearchParams/.test(form),
       '⚠️ el formulario PREFIERE el del token: la URL la puede editar el ' +
       'cliente, el token no');
  }

  bloque('Las pestañas se quedan fijas, sin tapar a nadie');

  {
    const css = E.leer('panel.css');
    ok(/\.tabs\{[^}]*position:sticky;top:var\(--hdr-h/.test(css),
       'las pestañas se pegan debajo de la barra');
    ok(/\.cgroup-hdr\{[^}]*top:calc\(var\(--hdr-h,60px\) \+ var\(--tabs-h/.test(css),
       '⚠️ y el encabezado de courier baja para quedar debajo de LAS DOS: si ' +
       'no, las pestañas lo taparian al desplazarse');
    ok(/--tabs-h/.test(E.leer('index.html')),
       'la altura de las pestañas se MIDE, no se pone a mano');
  }
};
