/**
 * tests/dni-experiencia.test.js — buscar el DNI como un momento satisfactorio
 * ===========================================================================
 * 30/10/2026: el DNI «escanea», el nombre aparece y se ilumina con un ding;
 * si había otro nombre, se SUGIERE el del DNI (botón grande) en vez de una
 * alarma; y el nombre empieza siempre con letra.
 */
'use strict';
const E = require('./_entorno.js');
const vm = require('vm');

module.exports = async ({bloque, ok}) => {
  const form = E.leer('formulario.html');
  const i0 = form.indexOf('function _nrmNom(');
  const src = form.slice(i0, form.indexOf('/* ★ EL DNI RELLENA EL NOMBRE', i0));

  // Un DOM mínimo para ejecutar el código real.
  const campos = {};
  const el = (v) => {
    const clases = new Set();
    return {value: v, style: {}, innerHTML: '', selectionStart: v.length, setSelectionRange() {},
      classList: {add: (c) => clases.add(c), remove: (c) => clases.delete(c), toggle: (c, s) => (s ? clases.add(c) : clases.delete(c)), has: (c) => clases.has(c)}};
  };
  const ctx = vm.createContext({$: (id) => campos[id] || null, esc: (x) => String(x).replace(/</g, '&lt;'),
    _dniOficial: '', _dniPuesto: '', window: {}, document: {hidden: false}, navigator: {},
    setInterval: () => 1, clearInterval() {}});
  vm.runInContext(src + ';this.F={valido:_nombreValido,input:onNombreInput,marca:_dniMarca,parecido:_nomParecido,mantener:dniMantener,' +
    'set:function(o){_dniOficial=o;}};', ctx);
  const F = ctx.F;

  bloque('El nombre empieza con letra');

  {
    const prueba = (escrito) => { const n = el(escrito); campos.f_name = n; campos.dniMarca = el(''); F.input(n); return n.value; };
    ok(prueba('123Juan') === 'Juan', '«123Juan» → «Juan»');
    ok(prueba('  .-Ana 2') === 'Ana 2', 'símbolos y espacios al inicio fuera; un número después se permite');
    ok(prueba('Ñandú') === 'Ñandú' && prueba('Ángel') === 'Ángel', 'letras con tilde y ñ al inicio, bien');
    ok(F.valido('Ana') && F.valido('José Luis') && !F.valido('A') && !F.valido('1Ana') && !F.valido('') && !F.valido('  '),
       'para seguir: empieza con letra y tiene al menos 2 letras');
    ok(/!_nombreValido\(name\)/.test(form.slice(form.indexOf('function wzValidate(')))
       && /chk\('f_name','err_name',!_nombreValido\(name\)\)/.test(form), 'la misma regla en el paso y al confirmar');
  }

  bloque('Si había otro nombre: sugerencia, no alarma');

  {
    const marca = (oficial, escrito) => { ctx.F.set(oficial); campos.f_name = el(escrito); campos.dniMarca = el(''); F.marca(); return campos.dniMarca; };
    const igual = marca('JARLYN LLANOS ARTEAGA', 'Jarlyn Llanos Arteaga');
    ok(/✓ Nombre según tu DNI/.test(igual.innerHTML) && campos.f_name.classList.has('nom-ok'), 'coincide: «✓ Nombre según tu DNI» y el campo se ilumina');
    const parecido = marca('JARLYN LLANOS ARTEAGA', 'Jarlyn Llanos');
    ok(/Completa tu nombre como en tu DNI/.test(parecido.innerHTML), 'parecido: «Completa tu nombre como en tu DNI»');
    const distinto = marca('EDIN DAVILA LLANOS', 'fghhjhjhj');
    ok(/Según tu DNI:/.test(distinto.innerHTML) && /EDIN DAVILA LLANOS/.test(distinto.innerHTML), 'distinto: «Según tu DNI» con el nombre');
    ok(/class="dni-sug-si" onclick="usarNombreDni\(\)">✓ Usar el nombre del DNI/.test(distinto.innerHTML), '⚠️ lo correcto es el botón grande');
    ok(/class="dni-link" onclick="dniMantener\(\)">Mantener «fghhjhjhj»/.test(distinto.innerHTML), 'mantener el propio es un enlace pequeño');
    ok(!/⚠️/.test(distinto.innerHTML), 'sin el ⚠️ amarillo que sonaba a error');
    F.mantener();
    F.marca();
    ok(/Tu DNI dice/.test(campos.dniMarca.innerHTML) && !/dni-sug-si/.test(campos.dniMarca.innerHTML), 'tras «Mantener»: una línea discreta');
    ok(marca('', 'algo').style.display === 'none' && marca('X Y', '').style.display === 'none', 'sin consulta o sin nombre: nada');
    ok(F.parecido('jose', 'JOSÉ LUIS') && !F.parecido('pedro', 'JOSÉ LUIS'), 'parecido tolera tildes y mayúsculas');
  }

  bloque('Buscando: escanea; encontrado: aparece, se ilumina y suena una vez');

  {
    const on = form.slice(form.indexOf('function onDniInput('), form.indexOf('function onDniInput(') + 3200);
    ok(/dniEl\.classList\.add\('dni-escanea'\)/.test(on) && /Buscando en RENIEC/.test(on), 'el campo del DNI «escanea» mientras busca');
    ok(/\},250\);/.test(on), 'empieza a los 0,25 s de tener los 8 dígitos');
    ok(/_dniEscribir\(nm, comp\);/.test(on), 'nombre vacío: aparece letra por letra');
    ok(/_dniPuesto\.indexOf\(nm\.value\.trim\(\)\)===0/.test(on), '⚠️ cambiar el DNI borra el nombre automático, aunque esté a medio aparecer');
    const es = form.slice(form.indexOf('function _dniEscribir('), form.indexOf('var _dniDingHecho'));
    ok(/prefers-reduced-motion: reduce\)'\)\.matches\)\{ fin\(\); return; \}/.test(es), '«reducir movimiento»: de golpe');
    ok(/nom-brilla/.test(es) && /_dniDing\(\)/.test(es), 'se ilumina y suena');
    const di = form.slice(form.indexOf('function _dniDing('), form.indexOf('/* ★ EL DNI RELLENA EL NOMBRE', form.indexOf('function _dniDing(')));
    ok(/if\(_dniDingHecho===dni \|\| document\.hidden\) return;/.test(di), 'el ding suena UNA vez por DNI y nunca en segundo plano');
    ok(/createOscillator/.test(di) && !/new Audio\(|\.mp3|\.wav/.test(di), 'lo genera el navegador: sin descargar archivos');
    ok(/exponentialRampToValueAtTime\(0\.06/.test(di), 'volumen bajo');
  }
};
