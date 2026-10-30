/**
 * tests/link-un-dato.test.js — Link personalizado: basta UN dato (30/10/2026)
 * Antes había que poner nombre o teléfono. Ahora vale cualquiera de los seis.
 */
'use strict';
const E = require('./_entorno.js');
const vm = require('vm');

module.exports = async ({bloque, ok}) => {
  const cfg = E.leer('config.js');
  bloque('Link personalizado: un solo dato obligatorio');
  {
    const src = cfg.slice(cfg.indexOf('function _tokAlgunDato('), cfg.indexOf('var _TOK_FALTA'));
    const campos = {};
    const ctx = vm.createContext({$: (id) => campos[id] || null});
    vm.runInContext(src + ';this.F=_tokAlgunDato;', ctx);
    const con = (id, v) => { Object.keys(campos).forEach((k) => delete campos[k]);
      ['tokName', 'tokPhone', 'tokMonto', 'tokAdelanto', 'tokLink', 'tokComprobante'].forEach((k) => { campos[k] = {value: ''}; });
      if (id) campos[id].value = v; return ctx.F(); };
    ok(con(null) === false, 'todo vacío: no se genera');
    ok(con('tokName', '   ') === false, 'solo espacios no cuentan');
    ['tokName', 'tokPhone', 'tokMonto', 'tokAdelanto', 'tokLink', 'tokComprobante'].forEach((k) =>
      ok(con(k, 'x') === true, 'basta ' + k));
    const usos = (cfg.match(/if\(!_tokAlgunDato\(\)\)/g) || []).length;
    ok(usos === 2 && !/Escribe el nombre o teléfono del cliente/.test(cfg), 'la MISMA regla en el botón y al guardar');
    ok(/'📦 Hola'\+\(tok\.name\?' '\+tok\.name:''\)/.test(cfg), 'sin nombre, el mensaje no queda «Hola ,»');
  }
};
