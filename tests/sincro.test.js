/**
 * tests/sincro.test.js — Fase 2: traer solo lo que cambió, SIN esconder pedidos
 * ===========================================================================
 * Antes cada cambio en la nube hacía bajar los ~1500 pedidos en cada PC.
 * Ahora cada escritura graba `_mts` (hora del SERVIDOR), borrar deja una
 * lápida, y el panel pide `_mts > marca − 60 s`. Ante la menor duda, carga
 * completa. Estas pruebas atan las tres piezas:
 *   1. la lógica pura (functions/sincro.js);
 *   2. que TODA escritura del servidor sobre pedidos grabe `_mts`;
 *   3. que el panel escriba con la hora del servidor, deje lápidas y decida
 *      bien cuándo fiarse de lo cambiado.
 * La prueba contra el emulador de Firestore está en sincro-emulador.test.js.
 */
'use strict';
const X = require('../functions/sincro.js');
const E = require('./_entorno.js');

const T0 = Date.parse('2026-10-29T15:00:00.000Z');
const marca = (ts, full) => ({v: 1, ts: ts, full: full});

module.exports = async ({bloque, ok}) => {

  bloque('Cuándo fiarse de «solo lo cambiado» — y cuándo no');

  {
    const base = {activo: true, cfg: {syncV: 1}, tieneLocal: true,
      sync: marca('2026-10-29T14:00:00.000Z', T0 - 3600e3), ahora: T0};
    ok(X.decidir(base).modo === 'cambios', 'todo en orden: solo lo cambiado');
    ok(X.decidir(Object.assign({}, base, {cfg: {}})).modo === 'completa',
       '⚠️ servidor sin desplegar (syncV ausente): completa — antes de que existan las marcas');
    ok(X.decidir(Object.assign({}, base, {cfg: {syncV: 'basura'}})).modo === 'completa',
       'syncV con basura (NaN) tampoco engaña');
    ok(X.decidir(Object.assign({}, base, {tieneLocal: false})).modo === 'completa', 'sin copia local: completa');
    ok(X.decidir(Object.assign({}, base, {sync: null})).modo === 'completa', 'sin marca: completa');
    ok(X.decidir(Object.assign({}, base, {sync: marca('ayer', T0)})).modo === 'completa', 'marca rara: completa');
    ok(X.decidir(Object.assign({}, base, {sync: {v: 9, ts: base.sync.ts, full: T0}})).modo === 'completa',
       'marca de otra versión: completa');
    ok(X.decidir(Object.assign({}, base, {sync: marca(base.sync.ts, T0 - 13 * 3600e3)})).modo === 'completa',
       'más de 12 h sin carga completa: completa (red de seguridad)');
    ok(X.decidir(Object.assign({}, base, {activo: false})).modo === 'completa', 'apagada en esta PC: completa');
    ok(X.decidir(Object.assign({}, base, {forzarCompleta: true})).modo === 'completa', '«Sincronizar todo»: completa');
  }

  bloque('La marca: solo horas del servidor, y nunca hacia atrás');

  {
    ok(X.desde({ts: '2026-10-29T15:00:00.000Z'}) === '2026-10-29T14:59:00.000Z',
       'se pide con 60 s de margen hacia atrás');
    const p = marca('2026-10-29T15:00:00.000Z', T0);
    ok(X.marcaTras(p, [{_mts: '2026-10-29T15:05:00.000Z'}, {_mts: '2026-10-29T15:01:00.000Z'}], false, T0).ts ===
       '2026-10-29T15:05:00.000Z', 'avanza al mayor _mts recibido');
    ok(X.marcaTras(p, [{_mts: '2026-10-29T14:59:30.000Z'}], false, T0).ts === p.ts,
       'lo repetido por el margen no la hace retroceder');
    ok(X.marcaTras(p, [], false, T0 + 99).ts === p.ts && X.marcaTras(p, [], false, T0 + 99).full === T0,
       'sin novedades no avanza (nunca con el reloj de la PC)');
    ok(X.marcaTras(null, [{id: 'viejo'}], true, T0).ts === '1970-01-01T00:00:00.000Z' &&
       X.marcaTras(null, [], true, T0).full === T0,
       'primera completa con pedidos sin _mts: marca en el origen (el siguiente cambio SÍ se pide)');
    ok(X.marcaTras(p, [{_mts: 'basura'}], false, T0).ts === p.ts, 'un _mts raro se ignora');
  }

  bloque('Aplicar lo cambiado: upsert, lápidas, restaurados');

  {
    const local = [{id: 'a', v: 1, _mts: '2026-10-29T10:00:00.000Z'}, {id: 'b', v: 1}, {id: 'c', v: 1}];
    const r = X.aplicar(local, [{id: 'a', v: 2, _mts: '2026-10-29T15:00:00.000Z'}, {id: 'n', v: 1, _mts: '2026-10-29T15:00:01.000Z'}],
        [{id: 'c', _mts: '2026-10-29T15:00:02.000Z'}]);
    const ids = r.map((x) => x.id).sort().join(',');
    ok(ids === 'a,b,n', 'cambiado se actualiza, nuevo se añade, borrado se quita; lo demás intacto');
    ok(r.find((x) => x.id === 'a').v === 2, 'con su versión nueva');
    const rest = X.aplicar([], [{id: 'z', _mts: '2026-10-29T15:00:05.000Z'}], [{id: 'z', _mts: '2026-10-29T15:00:01.000Z'}]);
    ok(rest.length === 1, 'borrado y luego restaurado (doc más nuevo que la lápida): EXISTE');
    const bor = X.aplicar([], [{id: 'z', _mts: '2026-10-29T15:00:01.000Z'}], [{id: 'z', _mts: '2026-10-29T15:00:05.000Z'}]);
    ok(bor.length === 0, 'restaurado y luego borrado: no existe');
    ok(X.aplicar(local, [], []).length === 3, 'sin cambios, la lista queda igual');
  }

  bloque('⚠️ Detectar una escritura SIN marca (no esconder pedidos)');

  {
    const local = {shipments: [{id: 'a', _mts: '2026-10-29T15:00:00.000Z'}, {id: 'f', _mts: '2026-10-29T15:00:05.000Z'}],
      suppliers: []};
    const repetido = {ships: [{id: 'a', _mts: '2026-10-29T15:00:00.000Z'}], supps: [],
      lapidas: [{id: 'f', col: 'shipments', _mts: '2026-10-29T15:00:01.000Z'}]};
    ok(X.total(repetido) === 2 && X.novedadTotal(local, repetido) === 0,
       '⚠️ lo repetido por el margen (y una lápida más vieja que el pedido restaurado) NO es novedad: ' +
       'así se detecta que alguien escribió sin _mts y se hace la carga completa');
    ok(X.novedadTotal(local, {ships: [{id: 'a', _mts: '2026-10-29T15:09:00.000Z'}], supps: [], lapidas: []}) === 1,
       'el mismo pedido con otra hora sí es novedad');
    ok(X.novedadTotal(local, {ships: [{id: 'nuevo', _mts: 'x'}], supps: [], lapidas: []}) === 1, 'uno que no se tenía, también');
    ok(X.novedadTotal(local, {ships: [], supps: [], lapidas: [{id: 'a', col: 'shipments', _mts: '2026-10-29T15:09:00.000Z'}]}) === 1,
       'una lápida que quita algo de aquí, también');
    ok(X.idLapida('shipments', 'id_1') === 'shipments__id_1' && X.idLapida('suppliers', 'a/b') === 'suppliers__a_b',
       'id de lápida sin barras');
  }

  bloque('⚠️ El servidor: TODA escritura sobre un pedido graba _mts');

  {
    const src = E.leer('functions/index.js');
    ok(/function _conMts\(campos\)[\s\S]{0,120}_mts: FieldValue\.serverTimestamp\(\)/.test(src),
       '_conMts pone la hora del SERVIDOR');
    const sinMarca = [];
    src.split('\n').forEach((l, i) => {
      const escribe = /\bref\.set\(|batch\.set\(db\.doc\(`\$\{SHIP_COL\}|lote\.set\(db\.doc\(SHIP_COL/.test(l);
      if (escribe && l.indexOf('_conMts(') < 0 && (src.split('\n')[i + 1] || '').indexOf('_conMts(') < 0) {
        sinMarca.push((i + 1) + ': ' + l.trim());
      }
    });
    ok(sinMarca.length === 0, 'ninguna escritura en SHIP_COL sin _conMts' + (sinMarca.length ? ' — ' + sinMarca.join(' | ') : ''));
    ok((src.match(/_conMts\(/g) || []).length >= 7, 'formulario, comprobante ×2, barrido, registro, ticket (+ la definición)');
    ok(/\{ts: now, formTs: now, syncV: SYNC_V\}/.test(src), 'el alta del formulario anuncia syncV');
    ok((src.match(/syncV: SYNC_V/g) || []).length >= 3, 'y también el barrido y el ticket');
  }

  bloque('El panel: escribe con la hora del servidor y deja lápidas');

  {
    const idx = E.leer('index.html');
    ok(/if\('timestampValue'in fv\) return fv\.timestampValue;/.test(idx), 'lee los timestamps (antes los volvía null)');
    ok(/w\.updateTransforms = \[\{ fieldPath: '_mts', setToServerValue: 'REQUEST_TIME' \}\]/.test(idx),
       'las tandas llevan la hora del servidor');
    ok(/filter\(k => !\(marca && k === '_mts'\)\)/.test(idx), 'el _mts leído no viaja como dato');
    ok(/\^panel\\\/\(shipments\|suppliers\)\\\/items\\\/\[\^\/\]\+\$/.test(idx),
       'solo pedidos y proveedores llevan marca (la config no)');
    ok(/fsBorrarConLapida\(shipPath\(id\), 'shipments', id\)/.test(idx) &&
       /fsBorrarConLapida\(suppPath\(id\), 'suppliers', id\)/.test(idx), 'borrar pedido o proveedor deja lápida');
    ok(/writes: \[\{ delete: _docName\(path\) \}, lapida\]/.test(idx), 'borrado y lápida en UNA operación');
    ok(/caer = true;/.test(idx) && /window\._syncSinMarca=true;/.test(idx),
       '⚠️ si :commit no sirve, PATCH de siempre (nunca se guarda menos que antes) y se avisa');
    ok(/items\[0\]\.obj\.syncHint = \{ts: saveTs, pedidos: items\.length > 1\}/.test(idx),
       'la pista dice si el guardado tocó pedidos');
    ok(/window\._fbLoad\(\{huboCambio: hasFormNew \|\| hasPanelNew\}\)/.test(idx), 'el latido avisa que hubo cambio');
    ok(/throw new Error\('cambio sin rastro'\)/.test(idx) && /Sincro\.novedadTotal\(/.test(idx),
       'cambio sin rastro → carga completa');
    ok(/functions\/sincro\.js/.test(idx), 'el panel carga el módulo');
    ok(/id="syncRapidaChk"/.test(idx) && /syncTodoAhora\(this\)/.test(idx), 'controles en 📦: interruptor y «Sincronizar todo»');
  }
};
