/**
 * tests/guarda-nube.test.js — no escribir en la nube antes de que conteste
 * ==========================================================================
 * ⚠️ EL CASI-DESASTRE DEL 21/10/2026, Y LO QUE SE DESCUBRIO EL 24/10.
 *
 * El dueño abrio el panel en un navegador sin datos locales. La memoria
 * arranco con los valores por defecto —«Mi Negocio» / 999000000, solo las 8
 * etiquetas fijas, cero recursos— y durante el segundo que tarda la nube en
 * contestar, el panel podia guardar.
 *
 * Se creia que el peligro era tocar algo en Config. Era peor: `_fbSave`
 * reescribe el documento de configuracion ENTERO en CADA guardado —editar
 * un pedido, imprimir, el seguimiento automatico—. Cualquier guardado en
 * ese segundo borraba etiquetas, recursos, la cuenta de Shalom y la agencia
 * de origen.
 *
 * Tres capas, y se prueban ejecutando el codigo real de index.html.
 */
'use strict';
const E = require('./_entorno.js');

const REINTENTO = E.trozo('index.html', 'async function _fbSaveWithRetry(data, attempt){',
    '// Sin modo offline');

function montar(op) {
  op = op || {};
  const almacen = {};
  const subidas = [];
  const toasts = [];
  const win = {_nubeLista: !!op.nubeLista, _nubeNombre: op.nubeNombre,
    _fbStatus: () => {}, _authHaySesion: () => true};
  win._fbSave = op.guardar || (async (d) => { subidas.push(d); });
  const ctx = {
    window: win,
    lsSet: (k, v) => { almacen[k] = String(v); },
    lsGet: (k) => (k in almacen ? almacen[k] : null),
    console: {warn: () => {}, error: () => {}},
    setTimeout: () => {},
    toast: (t) => toasts.push(t),
    salida: {},
  };
  const n = Object.keys(ctx);
  new Function(...n, REINTENTO + '\nsalida.subir = _fbSaveWithRetry;')(
      ...n.map((k) => ctx[k]));
  return {subir: ctx.salida.subir, almacen, subidas, toasts, win};
}

module.exports = async ({bloque, ok}) => {

  bloque('⚠️ Capa 1 · nada sube antes de que la nube conteste');

  {
    const m = montar({nubeLista: false});
    await m.subir({config: {name: 'Mi Negocio'}}, 0);
    ok(m.subidas.length === 0,
       '⚠️ con la nube sin contestar, NO se sube nada — ni un pedido: ' +
       'cualquier guardado reescribe la configuracion entera');
    ok(m.almacen.dpanel_pending === '1',
       'pero queda marcado como PENDIENTE: se aplaza, no se tira. ' +
       '`_initFirebase` lo sube justo despues de cargar');
  }
  {
    const m = montar({nubeLista: true});
    await m.subir({config: {name: 'Total Tools'}}, 0);
    ok(m.subidas.length === 1,
       'con la nube cargada, se sube como siempre');
  }

  bloque('⚠️ Capa 3 · nunca escribir los valores por defecto');

  {
    /* La huella: «Mi Negocio» / 999000000 es lo que pone el codigo cuando no
       hay nada. Con esa huella en memoria y un negocio real en la nube, la
       escritura se niega aunque las capas 1 y 2 hubieran fallado. Se prueba
       el _fbSave REAL, no un doble. */
    const src = E.leer('index.html');
    const i = src.indexOf('window._fbSave = async (data) => {');
    const guarda = src.slice(i, src.indexOf('window._isSaving = true;', i));
    const fbSave = new Function('window',
        'return ' + guarda.replace('window._fbSave = ', '') + 'return "escribio"; };');
    const intenta = async (nube, cfg) => {
      try { return await fbSave({_nubeNombre: nube})({config: cfg}); }
      catch (e) { return e.bloqueadoPorDefecto ? 'bloqueado' : 'otro'; }
    };
    ok(await intenta('Total Tools', {name: 'Mi Negocio', phone: '999000000'})
        === 'bloqueado',
       '⚠️ memoria con valores por defecto + nube con negocio real → NO ' +
       'se escribe: borraria etiquetas, recursos y la cuenta de Shalom');
    ok(await intenta('Total Tools', {name: 'Total Tools', phone: '933724178'})
        === 'escribio',
       'con tus datos reales se escribe normal');
    ok(await intenta('Mi Negocio', {name: 'Mi Negocio', phone: '999000000'})
        === 'escribio',
       'si la nube TAMBIEN es «Mi Negocio» (proyecto sin configurar), no se ' +
       'bloquea: no hay nada real que proteger');
    ok(await intenta(undefined, {name: 'Mi Negocio', phone: '999000000'})
        === 'escribio',
       'y sin saber que hay en la nube, la capa 1 es la que manda');
    ok(await intenta('Total Tools', {name: 'Mi Negocio', phone: '933724178'})
        === 'escribio',
       'las DOS señales juntas, no una: renombrar el negocio a algo raro no ' +
       'debe dejarte sin poder guardar');
  }
  {
    const m = montar({nubeLista: true, guardar: async () => {
      const e = new Error('x'); e.bloqueadoPorDefecto = true; throw e;
    }});
    await m.subir({}, 0);
    ok(m.almacen.dpanel_pending === '1',
       'cuando la capa 3 bloquea, queda PENDIENTE — decir «guardado» seria ' +
       'mentir');
    ok(m.toasts.some((t) => /No se guard/.test(t)),
       'y se dice en pantalla, no solo en la consola');
  }
  {
    const src = E.leer('index.html');
    const i = src.indexOf('window._fbSave = async (data) => {');
    const cuerpo = src.slice(i, i + 3000);
    ok(cuerpo.indexOf('bloqueadoPorDefecto') < cuerpo.indexOf('_isSaving = true'),
       'la guarda va ANTES de marcar `_isSaving`: si fuera despues, una ' +
       'escritura negada dejaria esa marca puesta y el latido creeria que ' +
       'hay un guardado en curso para siempre');
  }

  bloque('⚠️ Capa 2 · Config y Recursos no se tocan hasta sincronizar');

  {
    const src = E.leer('index.html');
    ok(/const _PANTALLAS_NUBE = \['configurar', 'recursos'\]/.test(src),
       'las dos pantallas que escriben en la configuracion estan vetadas');
    const gp = src.slice(src.indexOf('function goPage(id){'),
        src.indexOf('/* OVERLAYS */'));
    ok(/_pintarEsperaNube\(\)/.test(gp),
       'el velo se decide al entrar a CUALQUIER pantalla: un solo punto, no ' +
       'una guarda en cada una de las cuarenta funciones que escriben');
    const lib = src.slice(src.indexOf('function _liberarPantallasNube'),
        src.indexOf('/* TABS */'));
    ok(/loadCfgUI\(\)/.test(lib) && /recRender\(\)/.test(lib),
       '⚠️ y al llegar la nube se REPINTAN: sin esto, Config seguia ' +
       'mostrando las 8 etiquetas fijas del arranque — lo del 21/10');
  }

  bloque('La bandera se enciende donde de verdad llegan datos');

  {
    const src = E.leer('index.html');
    const mg = src.slice(src.indexOf('window._mergeRemote = (remote) => {'),
        src.indexOf('window._mergeRemote = (remote) => {') + 1200);
    ok(/window\._nubeLista = true;/.test(mg),
       '`_mergeRemote` enciende la bandera: es el UNICO sitio por el que ' +
       'entran datos — carga inicial, latido y recarga tras registrar');
    const init = src.slice(src.indexOf('const _initFirebase'),
        src.indexOf('const _initFirebase') + 3000);
    ok(/CONFIRMÓ que está vacía[\s\S]{0,200}window\._nubeLista = true/.test(init),
       'y la nube confirmada VACIA tambien cuenta: es el primer arranque ' +
       'real, el unico en que subir lo local es correcto');
    const cat = init.slice(init.indexOf('} catch(e) {'));
    ok(!/_nubeLista = true/.test(cat.slice(0, 1500)),
       '⚠️ pero un FALLO de carga NO la enciende: un error no es una ' +
       'respuesta');
  }

  bloque('⚠️ Si la carga del arranque se rindio, se recupera sola');

  {
    /* Sin sesion la carga inicial falla, reintenta 4 veces (~37 s) y se
       rinde. Quien tardaba mas que eso en la pantalla de login se quedaba
       sin datos de la nube para siempre: el latido solo traia lo MAS NUEVO,
       y la nube era mas vieja que la hora de arranque. Con la guarda, eso
       habria dejado Config bloqueado para siempre. */
    const src = E.leer('index.html');
    ok(/const nuncaCargo = !window\._nubeLista;/.test(src) &&
       /hasFormNew \|\| hasPanelNew \|\| nuncaCargo/.test(src),
       '⚠️ el latido carga la nube si NUNCA se cargo, aunque no haya nada ' +
       '«nuevo»');
    ok(/window\._trasEntrar = function\(\)\{\s*if\(!window\._nubeLista\) _initFirebase\(0\);/
        .test(src),
       'y entrar con exito dispara la carga de inmediato');
    const auth = E.leer('auth.js');
    const llamadas = (auth.match(/window\._trasEntrar\(\)/g) || []).length;
    ok(llamadas >= 3,
       'auth.js la llama en los tres caminos de entrada —Google, correo y ' +
       'token renovado— salio en ' + llamadas);
  }
};
