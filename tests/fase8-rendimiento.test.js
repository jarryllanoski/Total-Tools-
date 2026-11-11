/**
 * tests/fase8-rendimiento.test.js — copia local en IndexedDB y lápidas viejas
 * ===========================================================================
 * Fase 8 (11/11/2026):
 *   a) la copia local de los pedidos ya no muere al llenarse localStorage
 *      (~5 MB): pasa a IndexedDB y se lee al abrir, para seguir pidiendo a
 *      la nube SOLO lo que cambió;
 *   b) las lápidas de borrado de más de 30 días se limpian solas (una vez
 *      al día), en vez de acumularse para siempre.
 * La parte del navegador real (IndexedDB de verdad) va en el bloque final.
 */
'use strict';
const E = require('./_entorno.js');
const L = require('../functions/limpieza.js');
const SI = require('../functions/sincro.js');

/* Una Firestore de mentira con lo justo: collection().where('<').limit().get()
   y batch().delete().commit(). Fechas como números (aFecha = identidad). */
function bdFalsa(mtsLista) {
  const docs = mtsLista.map((m, i) => ({id: 'd' + i, _mts: m}));
  const vivos = new Set(docs.map((d) => d.id));
  const v = {consultas: 0};
  const db = {
    collection: (ruta) => {
      v.ruta = ruta;
      let corte = null; let lim = Infinity;
      const q = {
        where: (campo, op, valor) => { v.campo = campo; v.op = op; corte = valor; return q; },
        limit: (n) => { lim = n; return q; },
        get: async () => {
          v.consultas++;
          const r = docs.filter((d) => vivos.has(d.id) && d._mts < corte).slice(0, lim)
              .map((d) => ({ref: d.id}));
          return {empty: r.length === 0, docs: r};
        },
      };
      return q;
    },
    batch: () => {
      const b = [];
      return {delete: (ref) => b.push(ref), commit: async () => b.forEach((id) => vivos.delete(id))};
    },
  };
  return {db, v, vivos};
}

module.exports = async ({bloque, ok}) => {
  const AHORA = Date.parse('2026-11-11T08:00:00Z');
  const DIA = 86400000;

  bloque('b) Lápidas: se borran solo las de más de 30 días');

  {
    ok(L.DIAS * DIA > SI.COMPLETA_CADA_MS * 10,
       '30 días ≫ 12 h: un equipo con más de 12 h sin carga completa baja TODO (no usa lápidas)');
    const viejas = Array.from({length: 600}, () => AHORA - 40 * DIA);
    const nuevas = Array.from({length: 400}, () => AHORA - 2 * DIA);
    const m = bdFalsa(viejas.concat(nuevas));
    const r = await L.limpiarLapidas(m.db, AHORA, (ms) => ms);
    ok(r.borradas === 600 && m.vivos.size === 400, 'borra las 600 viejas y deja las 400 recientes');
    ok(m.v.ruta === 'panel/borrados/items' && m.v.campo === '_mts' && m.v.op === '<', 'en la colección de lápidas, por la hora del servidor');
    ok(r.tandas === 2 && !r.quedan, 'en tandas de ' + L.TANDA + ' (Firestore admite 500 por lote)');
    const casiLimite = bdFalsa([AHORA - 29 * DIA, AHORA - 31 * DIA]);
    await L.limpiarLapidas(casiLimite.db, AHORA, (ms) => ms);
    ok(casiLimite.vivos.size === 1 && casiLimite.vivos.has('d0'), '29 días se queda, 31 se va');
    const vacia = bdFalsa([]);
    const r0 = await L.limpiarLapidas(vacia.db, AHORA, (ms) => ms);
    ok(r0.borradas === 0 && vacia.v.consultas === 1, 'sin nada que borrar: una sola consulta, ninguna escritura');
    const muchas = bdFalsa(Array.from({length: 5000}, () => AHORA - 60 * DIA));
    const rm = await L.limpiarLapidas(muchas.db, AHORA, (ms) => ms);
    ok(rm.borradas === L.TANDA * L.MAX_TANDAS && rm.quedan === true,
       'con muchísimas, se para en ' + L.MAX_TANDAS + ' tandas y sigue mañana (corrida corta)');
    const srv = E.leer('functions/index.js');
    ok(/exports\.limpiezaLapidas = onSchedule\(\{\s*schedule: "17 3 \* \* \*",\s*timeZone: barrido\.ZONA/.test(srv) &&
       /limpieza\.limpiarLapidas\(db, Date\.now\(\),\s*\(ms\) => Timestamp\.fromMillis\(ms\)\)/.test(srv),
       'corre una vez al día, 03:17 de Lima, con la hora de Firestore');
  }

  bloque('a) Copia local: localStorage mientras quepa, y siempre IndexedDB');

  {
    const est = E.leerReal('panel/datos/estado.js');
    const src = est.slice(est.indexOf('function _guardarCopiaLocal(){'), est.indexOf('window._guardarCopiaLocal ='));
    const correr = (lleno) => {
      const ls = {};
      const v = {programada: 0};
      const localStorage = {
        setItem: (k, val) => { if (lleno && k === 'dpanel') throw new Error('QuotaExceededError'); ls[k] = String(val); },
        getItem: (k) => (k in ls ? ls[k] : null),
        removeItem: (k) => { delete ls[k]; },
      };
      if (lleno) ls.dpanel = 'copia vieja';
      const win = {CopiaLocal: {programar: () => { v.programada++; }}, _slimStateForLocal: (s) => s};
      // eslint-disable-next-line no-new-func
      new Function('window', 'localStorage', 'S', '_mem', src + ';_guardarCopiaLocal();')(
          win, localStorage, {shipments: [{id: 'a'}]}, {});
      return {ls, v};
    };
    const a = correr(false);
    ok(a.ls.dpanel === '{"shipments":[{"id":"a"}]}' && !('dpanel_en_idb' in a.ls), 'cabe: en localStorage, como siempre');
    ok(a.v.programada === 1, 'y además se programa la copia en IndexedDB');
    const b = correr(true);
    ok(!('dpanel' in b.ls) && b.ls.dpanel_en_idb === '1',
       '⚠️ lleno: se libera localStorage (no queda una copia VIEJA) y se marca que la copia está en IndexedDB');
    ok(b.v.programada === 1, 'y la copia va a IndexedDB');
    const todo = E.modulosPanel().map(E.leerReal).join('\n');
    ok(!/lsSet\('dpanel'/.test(todo), 'ninguna escritura suelta de la copia: todas por _guardarCopiaLocal');
    const ini = E.leerReal('panel/pantalla/inicio.js');
    ok(/if\(window\._copiaEnIdb && window\.CopiaLocal\)\{\s*CopiaLocal\.leer\(\)/.test(ini) &&
       /\}\)\.then\(_arrancarNube, _arrancarNube\);/.test(ini),
       'al abrir, si la copia está en IndexedDB se lee ANTES de pedir a la nube (y si falla, se arranca igual)');
    ok(/!window\._nubeLista\)\{/.test(ini), 'si la nube ya contestó, la copia vieja no la pisa');
    const ix = E.leerReal('index.html');
    ok(ix.indexOf('panel/datos/copia-local.js') > 0 && ix.indexOf('panel/datos/copia-local.js') < ix.indexOf('panel/datos/estado.js'),
       'copia-local.js se carga antes que estado.js');
  }

  bloque('a) En un navegador de verdad: lleno → IndexedDB → recargar → los pedidos vuelven');

  {
    let chromium = null;
    try { chromium = require('playwright').chromium; } catch (e) { chromium = null; }
    if (!chromium) {
      ok(true, '(sin Playwright en este entorno: se omite la prueba en navegador)');
      return;
    }
    const http = require('http'); const fs = require('fs'); const path = require('path');
    const srv = http.createServer((req, res) => {
      const f = path.join(E.RAIZ, decodeURIComponent(req.url.split('?')[0]));
      if (!f.startsWith(E.RAIZ) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
      const t = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json'}[path.extname(f)] || 'application/octet-stream';
      res.writeHead(200, {'Content-Type': t + '; charset=utf-8'}); fs.createReadStream(f).pipe(res);
    });
    await new Promise((r) => srv.listen(0, r));
    const url = 'http://localhost:' + srv.address().port + '/index.html';
    const b = await chromium.launch();
    try {
      const ctx = await b.newContext();
      // localStorage «lleno»: la copia grande no entra; lo pequeño sí.
      await ctx.addInitScript(() => {
        const orig = Storage.prototype.setItem;
        Storage.prototype.setItem = function(k, v) {
          if (k === 'dpanel') throw new DOMException('lleno', 'QuotaExceededError');
          return orig.call(this, k, v);
        };
      });
      await ctx.route(/googleapis|gstatic|cloudfunctions|cdnjs|google\.com/, (r) => r.abort());
      const p = await ctx.newPage();
      const errs = []; p.on('pageerror', (e) => errs.push(e.message));
      await p.goto(url); await p.waitForTimeout(2500);
      await p.evaluate(() => {
        S.shipments = [{id: 'id_1', name: 'ANA', phone: '9', address: 'x', courier: 'SHALOM', status: 'NUEVO PEDIDO'},
          {id: 'id_2', name: 'LUIS', phone: '9', address: 'y', courier: 'DELIVERY', status: 'ENVIADO'}];
        _guardarCopiaLocal();
      });
      await p.waitForTimeout(2200); // la escritura a IndexedDB va agrupada (1,5 s)
      const marca = await p.evaluate(() => [localStorage.getItem('dpanel'), localStorage.getItem('dpanel_en_idb')]);
      ok(marca[0] === null && marca[1] === '1', 'localStorage lleno: queda la marca «en IndexedDB»');
      await p.reload(); await p.waitForTimeout(3000);
      const n = await p.evaluate(() => ({enIdb: window._copiaEnIdb, ids: (S.shipments || []).map((s) => s.id).join()}));
      ok(n.enIdb === true && n.ids === 'id_1,id_2', '⚠️ al recargar, los pedidos vuelven desde IndexedDB (antes: ninguno, a bajar todo)');
      ok(errs.length === 0, 'sin errores en la página' + (errs.length ? ': ' + errs.join(' | ') : ''));
    } finally {
      await b.close(); srv.close();
    }
  }
};
