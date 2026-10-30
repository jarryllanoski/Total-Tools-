/**
 * tests/dni-reintentos.test.js — un DNI real ya no cae directo en «no encontrado»
 * ==============================================================================
 * 30/10/2026: «no encontrado» solo cuando Shalom lo dice; lo demás es temporal:
 * el servidor reintenta 1 vez y el formulario hasta 2, con mensaje por causa.
 */
'use strict';
const E = require('./_entorno.js');
const vm = require('vm');
const RP = require('../functions/reniecPublico.js');

module.exports = async ({bloque, ok}) => {

  bloque('La causa real (reniecPublico.resultado)');

  {
    const tr = (j) => (j && j.success === true ? {ok: true, persona: {nombres: 'ANA'}} : {ok: false});
    ok(RP.resultado({ok: true, json: {success: true}}, tr).ok === true, 'encontrado');
    ok(RP.resultado({ok: false, motivo: 'NO_ENCONTRADO'}, tr).motivo === 'NO_ENCONTRADO', '404 → no encontrado');
    ok(RP.resultado({ok: true, json: {success: false, message: 'DNI no encontrado'}}, tr).motivo === 'NO_ENCONTRADO',
       'Shalom DICE que no lo encontró → no encontrado');
    ok(RP.resultado({ok: true, json: {success: false, message: 'Intente más tarde'}}, tr).motivo === 'SIN_RESPUESTA',
       '⚠️ cualquier otra respuesta → SIN_RESPUESTA (temporal), ya no «no encontrado»');
    ok(RP.resultado(null, tr).motivo === 'SIN_RED', 'sin respuesta → SIN_RED');
    ok(RP.esTemporal('ERROR_SHALOM') && RP.esTemporal('SIN_APPCHECK') && RP.esTemporal('SIN_RESPUESTA'), 'temporales');
    ok(!RP.esTemporal('NO_ENCONTRADO') && !RP.esTemporal('TOPE_DIA') && !RP.esTemporal('DNI_NO_VALIDO'), 'no temporales');
  }

  bloque('Servidor: un reintento solo si la falla es temporal');

  {
    const src = E.leer('functions/index.js');
    const fn = src.slice(src.indexOf('async function handleReniec'), src.indexOf('function _reniecFuera'));
    const fuera = src.slice(src.indexOf('function _reniecFuera'), src.indexOf('\n}\n', src.indexOf('function _reniecFuera')) + 3);
    const correr = async (respuestas) => {
      let llamadas = 0, cuentas = 0, cuerpo = null;
      const db = {doc: (p) => ({get: async () => ({exists: false, data: () => ({})}),
        set: async (d) => { if (d && d.consultas) cuentas++; }})};
      const shalomPuerta = {llamar: async () => respuestas[Math.min(llamadas++, respuestas.length - 1)],
        traducir: (op, j) => (j && j.success === true ? {ok: true, persona: {nombres: 'ANA', apePaterno: 'P', apeMaterno: ''}} : {ok: false})};
      const res = {set() {}, json: (b) => { cuerpo = b; return res; }};
      // eslint-disable-next-line no-new-func
      const h = new Function('checkRateLimit', 'reniecPublico', 'db', 'appCheckOk', 'shalomPuerta', 'SHALOM_API_KEY', 'FieldValue', 'setTimeout',
          fuera + fn + ';return handleReniec;')(async () => true, RP, db, async () => true, shalomPuerta, {value: () => 'k'},
          {increment: () => 1}, (f) => f());
      await h({query: {dni: '73483547'}, get: () => ''}, res);
      return {llamadas, cuentas, cuerpo};
    };
    const a = await correr([{ok: false, motivo: 'ERROR_SHALOM'}, {ok: true, json: {success: true}}]);
    ok(a.cuerpo.ok === true && a.llamadas === 2, '⚠️ Shalom tose una vez → el reintento lo encuentra');
    ok(a.cuentas === 2, 'cada intento cuenta en el tope diario (la red de seguridad del gasto)');
    const b = await correr([{ok: false, motivo: 'NO_ENCONTRADO'}]);
    ok(b.cuerpo.motivo === 'NO_ENCONTRADO' && b.llamadas === 1, 'no encontrado claro: no se reintenta');
    const c = await correr([{ok: true, json: {success: false, message: 'error interno'}}]);
    ok(c.cuerpo.motivo === 'SIN_RESPUESTA' && c.llamadas === 2 && /No pudimos consultar ahora/.test(c.cuerpo.detalle),
       'respuesta rara dos veces → «no pudimos consultar», no «no existe»');
    const d = await correr([{ok: false, motivo: 'LIMITE'}]);
    ok(d.llamadas === 1, '«demasiadas» (429): no se insiste en el servidor');
  }

  bloque('Formulario: hasta 2 reintentos, solo si es temporal');

  {
    const form = E.leer('formulario.html');
    const src = form.slice(form.indexOf('var _DNI_TEMPORAL='), form.indexOf('/* Mensaje según la CAUSA'));
    const correr = async (respuestas, cambiarEn) => {
      let n = 0; const pasos = [];
      const campo = {value: '73483547'};
      const ctx = vm.createContext({$: () => campo, setTimeout: (f) => f(), Math,
        _api: async () => { n++; if (cambiarEn === n) campo.value = '11111111'; const r = respuestas[Math.min(n - 1, respuestas.length - 1)]; if (r === 'throw') throw new Error('red'); return r; }});
      vm.runInContext(src + ';this.F=_dniConsultar;', ctx);
      const r = await ctx.F('73483547', (i, de) => pasos.push(i + '/' + de));
      return {r, n, pasos};
    };
    const a = await correr([{ok: false, motivo: 'SIN_APPCHECK'}, 'throw', {ok: true, persona: {completo: 'ANA'}}]);
    ok(a.r.ok && a.n === 3 && a.pasos.join(',') === '2/3,3/3', '⚠️ dos fallas temporales y al tercer intento sale (con «reintentando 2/3, 3/3»)');
    const b = await correr([{ok: false, motivo: 'ERROR_SHALOM'}]);
    ok(!b.r.ok && b.n === 3, 'nunca más de 3 intentos en total');
    const c = await correr([{ok: false, motivo: 'NO_ENCONTRADO'}]);
    ok(c.n === 1, 'no encontrado: no se insiste');
    const d = await correr([{ok: false, motivo: 'SIN_RED'}, {ok: true}], 1);
    ok(d.r === null && d.n === 1, 'si el cliente cambia el DNI a mitad, se abandona');
    const m = form.slice(form.indexOf('function _dniMensajeFalla('), form.indexOf('function dniReintentar('));
    ok(/NO_ENCONTRADO'\) return .*Revisa los 8 dígitos/.test(m) && /No pudimos consultar RENIEC ahora/.test(m) && /dniReintentar\(\)/.test(m),
       'mensaje por causa, con [Reintentar]');
    ok(/reintentando '\+n\+'\/'\+de/.test(form), 'se ve que está reintentando');
  }

  bloque('App Check se recupera si falló al cargar');

  {
    const ac = E.leer('appcheck.js');
    ok(/if \(!ctx\) \{ _appCheckPromise = null; return ''; \}/.test(ac), 'la próxima vez vuelve a intentar (sin recargar la página)');
  }
};
