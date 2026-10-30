/**
 * tests/ayuda-seguridad.test.js — Toby en la Ayuda y el blindaje del 30/10/2026
 * =============================================================================
 *   1. La Ayuda dice la VERDAD del formulario (y sale del estado real).
 *   2. Sin fuga por celular, config en lista blanca, ids con forma.
 *   3. El freno del seguimiento ya no escribe en Firestore.
 *   4. `init()` corre al final: ninguna variable antes de existir.
 *   5. Pistas visuales (punto que late, lupa, efecto al tocar).
 * El alta en transacción se prueba contra Firestore en alta-emulador.test.js.
 */
'use strict';
const E = require('./_entorno.js');
const vm = require('vm');

module.exports = async ({bloque, ok}) => {
  const form = E.leer('formulario.html');
  const srv = E.leer('functions/index.js');

  bloque('La Ayuda: Toby dice lo que el formulario hace de verdad');

  {
    const i = form.indexOf('function _ayudaFormContenido(');
    const fn = form.slice(i, form.indexOf('function cerrarAyudaForm', i));
    const ctx = vm.createContext({});
    vm.runInContext('function esc(t){return String(t).replace(/</g,"&lt;")}' + fn +
        ';this.C=_ayudaFormContenido;', ctx);
    const C = ctx.C;
    ok(!/no podremos procesarlo/.test(form), '⚠️ ya no dice «si no envías el WhatsApp no lo procesamos» (era falso)');
    ok(/Tu pedido queda registrado al instante/.test(fn), 'dice que el pedido queda registrado al confirmar');
    ok(C({paso: 1}).pasos.length === 4 && C({tipo: 'retiro', paso: 1}).pasos.length === 3,
       'retiro en tienda no tiene paso de destino: 3 pasos');
    ok(/DNI/.test(C({paso: 2}).pasos[1].d), 'el paso 2 empieza por el DNI, como en pantalla');
    ok(/lupa/.test(C({tipo: 'agencia', paso: 3, mapa: true}).toby) && /botón azul de <b>ubicación/.test(C({tipo: 'agencia', paso: 3, mapa: true}).toby), 'en el paso de la sede Toby señala los dos caminos: ubicación y lupa');
    ok(!/pin rojo|ubicación/.test(C({tipo: 'agencia', paso: 3, mapa: false}).toby), 'sin mapa (Olva manual) no habla de pines ni ubicación');
    ok(/motorizado/.test(C({tipo: 'delivery', paso: 3}).toby), 'en delivery habla de la ubicación para el motorizado');
    ok(/ya está registrado/.test(C({confirmado: true}).toby), 'confirmado: «ya está registrado» + Ir a WhatsApp');
    const r = C({tipo: 'retiro', paso: 1, tiendaDir: '<b>Av X</b>'});
    ok(r.faq.some((f) => /Av X/.test(f.a) && !/<b>/.test(f.a)), 'retiro: dice dónde recoger, escapado');
    ok(/body\.tt-ayuda-on #tt-narr\{display:none!important\}/.test(form), 'Heavy se esconde mientras la Ayuda está abierta');
    ok(/narrador\/toby\.webp/.test(form) && E.existe('narrador/toby.webp'), 'Toby tiene su imagen');
    ok(/onerror="this\.parentNode\.style\.display='none'"/.test(form), 'si la imagen falla, queda el globo de texto');
    ok(/e\.key==='Escape'/.test(form) && /role','dialog'/.test(form), 'se cierra con Esc y se anuncia como diálogo');
  }

  bloque('⚠️ Sin fuga de datos por celular');

  {
    const cl = srv.slice(srv.indexOf('async function handleClient'), srv.indexOf('async function appCheckOk'));
    ok(/if \(await _tokenDeEseCelular\(req\.query\.t, phone\)\) return res\.json\(cli\);/.test(cl),
       'nombre completo y dirección SOLO si el link personalizado es de ese mismo celular');
    ok(/split\(\/\\s\+\/\)\[0\][\s\S]{0,40}parcial: true/.test(cl), 'si no, solo el primer nombre');
    const tk = srv.slice(srv.indexOf('async function _tokenDeEseCelular'), srv.indexOf('// ── action=client'));
    ok(/if \(d\.used\) return false;/.test(tk) && /tp === phone/.test(tk), 'un link ya usado o de otro número no abre nada');
    ok(/\{phone: phone, t: currentToken\}/.test(form), 'el formulario manda el link junto al celular');
    ok(/&&!_knownClient\.parcial\) nameEl\.value/.test(form), 'con solo el primer nombre no rellena el campo');
  }

  bloque('Configuración pública en lista blanca e ids con forma');

  {
    ok(/const CONFIG_PUBLICA = \["name", "phone", "city"\];/.test(srv), 'de config solo salen nombre, celular y ciudad');
    ok(/res\.json\(soloCampos\(snap\.data\(\), FORMCFG_PUBLICO\)\)/.test(srv), 'la «foto» del link también pasa por lista blanca');
    const ID = new RegExp(srv.match(/const ID_RE = \/(.+)\/;/)[1]);
    ok(ID.test('Ab3dEf9hIj0kLmNoPqRs') && !ID.test('a/b') && !ID.test('') && !ID.test('x'.repeat(65)),
       'forma de id: letras, números, - y _; nada de «/»');
    const tok = srv.slice(srv.indexOf('async function handleToken'), srv.indexOf('async function handleConfig'));
    ok(tok.indexOf('ID_RE.test(tokenId)') > 0 && tok.indexOf('ID_RE.test(tokenId)') < tok.indexOf('db.doc'), 'el link se valida ANTES de leer la base');
    const fc = srv.slice(srv.indexOf('async function handleFormCfg'), srv.indexOf('const CONFIG_PUBLICA'));
    ok(fc.indexOf('ID_RE.test(id)') > 0 && fc.indexOf('ID_RE.test(id)') < fc.indexOf('db.doc'), 'la foto también');
  }

  bloque('El alta: transacción, create y link de un solo uso');

  {
    const cr = srv.slice(srv.indexOf('async function handleCreate'), srv.indexOf('// ── action=token'));
    ok(/db\.runTransaction/.test(cr) && /tx\.create\(shipRef/.test(cr), 'transacción con create (falla si el id existe)');
    ok(!/batch\.set\(db\.doc\(`\$\{SHIP_COL\}/.test(cr), 'ya no hay set que pise un pedido');
    ok(/ts\.data\(\)\.used\)\) return "usado"/.test(cr), 'el link se mira y se marca en la MISMA operación');
  }

  bloque('El freno del seguimiento: en memoria, gratis');

  {
    ok(/formApi_track: \{windowMs: 60000, max: 120, memoria: true\}/.test(srv), 'track cuenta en memoria');
    ok(/if \(cfg\.memoria\) return _frenoMemoria\(/.test(srv), 'y checkRateLimit lo respeta');
    ok(/rlExpira: new Date\(windowStart \+ 3600 \* 1000\)/.test(srv), 'los registros del freno llevan vencimiento (TTL)');
    // El freno en memoria, ejecutado.
    const f = srv.slice(srv.indexOf('const _frenoMem = new Map();'), srv.indexOf('/**\n * Devuelve false si la IP'));
    const ctx = vm.createContext({Map});
    vm.runInContext(f + ';this.F=_frenoMemoria;', ctx);
    let pasa = 0;
    for (let i = 0; i < 125; i++) if (ctx.F('t|1.1.1.1', 60000, 120)) pasa++;
    ok(pasa === 120, 'deja pasar 120 por minuto y frena el resto');
    ok(ctx.F('t|2.2.2.2', 60000, 120), 'otra IP no se ve afectada');
    ok(ctx.F('t|1.1.1.1', 120000, 120), 'al cambiar de minuto se reinicia (y la memoria se vacía)');
  }

  bloque('init() al final: nada se usa antes de existir');

  {
    ok(/\nfunction init\(\)\{/.test(form) && !/\(function init\(\)\{/.test(form), 'init se declara, no se autoejecuta arriba');
    const fin = form.slice(form.lastIndexOf('window._notesCount'));
    ok(/\ninit\(\);\n\n\}\)\(\);/.test(fin), 'y se llama al FINAL del script');
  }

  bloque('Pistas visuales: punto que late, lupa, efecto al tocar');

  {
    ok(/className:'ag-yo-halo'/.test(form) && /@keyframes agHalo/.test(form), 'tu ubicación late (halo azul)');
    ok(/class="ag-lupa"/.test(form) && /\.ag-buscar\.quieto \.ag-lupa\{animation:none/.test(form),
       'la lupa late y se queda quieta al buscar o elegir');
    ok(/_agLupa\(false\);/.test(form.slice(form.indexOf('function _agElegir('))), 'elegir la detiene');
    ok(/\.cour-card\.tocando\{transform:translateY\(-2px\)/.test(form) && /\.date-opt\.tocando\{transform:translateY\(-2px\)/.test(form),
       'envíos y días se elevan («estoy encima»)');
    ok(/\.ag-item\.tocando:not\(\.ag-item-sel\)\{background:/.test(form), 'las sedes también reaccionan');
    ok(!/:hover\{transform/.test(form) && !/\.cour-card:active|\.date-opt:active|\.c-opt/.test(form),
       'UN estilo: sin reglas duplicadas por :hover / :active (ni el CSS viejo de .c-opt)');
    ok(/prefers-reduced-motion:reduce\)\{\.ag-yo-halo,\.ag-lupa\{animation:none\}/.test(form),
       'quien pidió «reducir movimiento» no ve animaciones');
  }
};
