/**
 * tests/fecha-pedido.test.js — búsqueda avanzada por fecha de envío o de registro
 * ===============================================================================
 * Desde el 26/10/2026 el rango de fechas puede mirar la fecha de ENVÍO (como
 * siempre, y por defecto) o la de REGISTRO, y «Hoy» enseña los registrados
 * hoy.
 *
 * ⚠️ `createdAt` está en hora universal: un pedido de las 8:00 p. m. de Lima
 * se guarda con fecha del día siguiente. Y la importación de Excel guarda
 * «T00:00:00.000Z», que en Lima es el día ANTERIOR. Las dos trampas se
 * prueban aquí.
 */
'use strict';
const F = require('../functions/fechaPedido.js');
const DP = require('../functions/dniPedido.js');
const N = require('../functions/nroComprobante.js');
const E = require('./_entorno.js');

module.exports = async ({bloque, ok}) => {

  bloque('El día de registro, en hora de Lima');

  {
    ok(F.registro({createdAt: '2026-10-27T01:00:00.000Z'}) === '2026-10-26',
       '⚠️ registrado a las 8:00 p. m. de Lima → cuenta para ESE día, no el siguiente');
    ok(F.registro({createdAt: '2026-10-26T15:30:00.000Z'}) === '2026-10-26',
       'a media tarde, su día');
    ok(F.registro({createdAt: '2026-10-27T04:59:59.000Z'}) === '2026-10-26' &&
       F.registro({createdAt: '2026-10-27T05:00:00.000Z'}) === '2026-10-27',
       'el día cambia a la medianoche de Lima (05:00 UTC), no a la de Londres');
    ok(F.registro({createdAt: '2026-10-20T00:00:00.000Z'}) === '2026-10-20',
       '⚠️ importado de Excel (sin hora): su día, no el anterior');
    ok(F.registro({createdAt: '2026-10-20'}) === '2026-10-20', 'un día suelto, tal cual');
    ok(F.registro({}) === '' && F.registro({createdAt: 'basura'}) === '',
       'sin fecha o con basura: sin día');
    ok(F.hoyLima(new Date('2026-10-27T03:00:00Z')) === '2026-10-26',
       '«hoy» es el de Lima: a las 10:00 p. m. del 26 sigue siendo 26');
    ok(F.envio({date: '2026-10-28'}) === '2026-10-28' && F.envio({}) === '',
       'el día de envío, tal cual está guardado');
  }

  bloque('El rango');

  {
    const p = {date: '2026-10-28', createdAt: '2026-10-27T01:00:00.000Z'};
    ok(F.enRango(p, 'envio', '2026-10-28', '2026-10-28'), 'por envío: el 28');
    ok(!F.enRango(p, 'envio', '2026-10-26', '2026-10-26'), 'por envío no es del 26');
    ok(F.enRango(p, 'registro', '2026-10-26', '2026-10-26'),
       'por registro sí es del 26 (hora de Lima)');
    ok(!F.enRango(p, 'registro', '2026-10-27', ''), 'y no del 27');
    ok(F.enRango(p, 'registro', '', ''), 'sin límites, todo entra');
    ok(!F.enRango({date: '2026-10-28'}, 'registro', '2026-10-01', ''),
       'sin `createdAt` no entra al filtrar por registro');
    ok(F.enRango({date: '2026-10-28'}, 'otra-cosa', '2026-10-28', ''),
       'un campo desconocido cae a envío');
  }

  bloque('El filtro real del panel');

  {
    const src = E.trozo('index.html', 'function visibleShipments(){', '/* ══════');
    const S = {shipments: [
      {id: 'a', name: 'A', phone: '1', address: '', courier: 'X', status: 'NUEVO PEDIDO',
        date: '2026-10-28', createdAt: '2026-10-27T01:00:00.000Z'},
      {id: 'b', name: 'B', phone: '2', address: '', courier: 'X', status: 'NUEVO PEDIDO',
        date: '2026-10-26', createdAt: '2026-10-25T14:00:00.000Z'},
      {id: 'c', name: 'C', phone: '3', address: '', courier: 'X', status: 'NUEVO PEDIDO',
        date: '2026-10-26', createdAt: '2026-10-26T16:00:00.000Z'},
      {id: 'd', name: 'D', phone: '4', address: '', courier: 'X', status: 'NUEVO PEDIDO',
        date: '', createdAt: '2026-10-20T00:00:00.000Z'},
    ]};
    const adv = {campo: 'envio', dateFrom: '', dateTo: '', couriers: [], costMin: '',
      costMax: '', doc: 'any', sort: 'newest'};
    const correr = (conModulo) => {
      // eslint-disable-next-line no-new-func
      return new Function('S', '$', '_dniDe', 'NroComprobante', '_adv', 'FechaPedido',
          'let _filt="",_advActive=true;function _soloActivos(){return false}' + src +
          ';return visibleShipments;',
      )(S, () => ({value: ''}), DP.de, N, adv, conModulo ? F : undefined);
    };
    const vis = correr(true);
    const viejo = correr(false);   // el código de antes (sin el módulo)
    const ids = (l) => l.map((x) => x.id).join(',');

    // Fecha de envío: mismo resultado que el código de antes, en varios rangos.
    const rangos = [['2026-10-26', '2026-10-26'], ['2026-10-27', ''], ['', '2026-10-26'],
      ['2026-10-01', '2026-10-31'], ['', '']];
    const iguales = rangos.every(([d, h]) => {
      adv.campo = 'envio'; adv.dateFrom = d; adv.dateTo = h;
      return ids(vis()) === ids(viejo());
    });
    ok(iguales, '⚠️ con «Fecha de envío» da EXACTAMENTE lo mismo que antes');

    adv.campo = 'registro'; adv.dateFrom = '2026-10-26'; adv.dateTo = '2026-10-26';
    ok(ids(vis()) === 'a,c',
       'con «Fecha de registro» del 26: el de las 8 p. m. y el de la tarde');
    adv.dateFrom = '2026-10-20'; adv.dateTo = '2026-10-20';
    ok(ids(vis()) === 'd', 'el importado de Excel, en su día');
  }

  bloque('Los botones: envío · registro · hoy');

  {
    const src = E.trozo('index.html', 'function _advVacio(){', 'function updateAdvBar(){') +
      E.trozo('index.html', 'function updateAdvBar(){', '/* BULK STATUS CHANGE */');
    const campos = {};
    const nodo = (id) => campos[id] || (campos[id] = {id, value: '', innerHTML: '',
      style: {}, _c: new Set(),
      classList: {toggle: (c, on) => { const n = campos[id]; on ? n._c.add(c) : n._c.delete(c); },
        add: (c) => campos[id]._c.add(c), remove: (c) => campos[id]._c.delete(c)}});
    const FF = Object.assign({}, F, {hoyLima: () => '2026-10-26'});
    let pintados = 0;
    // eslint-disable-next-line no-new-func
    const api = new Function('$', 'S', 'render', 'openOverlay', 'closeOverlay', 'FechaPedido',
        src.replace('let _adv=_advVacio();', 'var _adv=_advVacio();') +
        ';return {asHoy, setAsCampo, applyAdvSearch, clearAdvSearch, openAdvSearch,' +
        ' updateAdvBar, adv: () => _adv, activo: () => _advActive};',
    )(nodo, {couriers: []}, () => { pintados++; }, () => {}, () => {}, FF);

    api.openAdvSearch();
    ok(campos.asCampoEnvio._c.has('active') && !campos.asCampoRegistro._c.has('active'),
       'por defecto, «Fecha de envío» (la búsqueda de siempre)');
    api.asHoy();
    ok(campos.asDateFrom.value === '2026-10-26' && campos.asDateTo.value === '2026-10-26',
       '«Hoy» rellena Desde y Hasta con hoy, a la vista');
    ok(api.adv().campo === 'registro' && campos.asCampoHoy._c.has('active') &&
       !campos.asCampoRegistro._c.has('active'), 'y pasa a fecha de registro');
    api.applyAdvSearch();
    api.updateAdvBar();
    ok(/Registrados hoy/.test(campos.activeFiltersBar.innerHTML),
       'el chip del filtro dice «Registrados hoy»');
    api.setAsCampo('envio');
    api.applyAdvSearch(); api.updateAdvBar();
    ok(/Envío: 2026-10-26 → 2026-10-26/.test(campos.activeFiltersBar.innerHTML),
       'y dice qué fecha se usa cuando no es «hoy»');
    api.clearAdvSearch();
    ok(api.adv().campo === 'envio' && campos.asDateFrom.value === '' && !api.activo(),
       '«Limpiar todo» vuelve a fecha de envío y vacía las fechas');

    const ord = E.trozo('index.html', '// Ordenamiento (los filtros avanzados', '} else {');
    ok(/_adv\.campo==='registro' && \(_adv\.sort==='oldest'\|\|_adv\.sort==='newest'\)/.test(ord),
       'con fecha de registro, más reciente/antiguo ordena por cuándo entró');
    ok(/functions\/fechaPedido\.js/.test(E.leer('index.html')), 'el panel carga el módulo');
  }
};
