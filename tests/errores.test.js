/**
 * El registro de errores.
 *
 * Existe porque varios vendedores usan el panel desde equipos distintos y hoy,
 * si a uno se le rompe algo, nadie más se entera nunca.
 *
 * Lo que más se prueba aquí no es que funcione: es que NO HAGA DAÑO. Un
 * registro de errores es código que corre justo cuando algo ya va mal, así que
 * si reventara o escribiera sin freno, convertiría un fallo en una avería.
 */
'use strict';
const E = require('./_entorno.js');

module.exports = (t) => {
  const {ok, bloque} = t;

  function montar() {
    const escritos = [];
    const oyentes = {};
    const win = {
      addEventListener: (ev, fn) => { oyentes[ev] = fn; },
      _fbEscribirError: (id, doc) => escritos.push({id, doc}),
      FBConfig: {VERSION: 'test'},
      location: {hash: '#envios'},
      screen: {width: 390, height: 844}
    };
    E.cargar('errores.js', win, {
      navigator: {userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)', onLine: true},
      localStorage: {getItem: (k) => (k === 'tt_email' ? 'vendedor@totaltools.com' : null)}
    });
    return {Errores: win.Errores, escritos, oyentes};
  }

  bloque('Anota lo que hace falta');
  {
    const {Errores, escritos} = montar();
    Errores.anotar('render', new Error('algo se rompió'));
    ok(escritos.length === 1, 'escribe un documento');
    const d = escritos[0].doc;
    ok(d.donde === 'render' && d.mensaje === 'algo se rompió', 'el dónde y el qué');
    ok(typeof d.pila === 'string' && d.pila.length > 0, 'unas líneas de la pila');
    ok(d.quien === 'vendedor@totaltools.com', 'de qué vendedor');
    ok(d.equipo.movil === true, 'y que fue en un teléfono');
    ok(typeof d.cuando === 'string' && d.cuando.indexOf('T') > 0, 'con la hora en ISO');
  }

  bloque('No filtra datos de clientes');
  {
    const {Errores, escritos} = montar();
    Errores.anotar('guardar', new Error('x'), {
      pedidoId: 'id123',
      // Lo que NUNCA debe acabar en un registro que nadie revisa:
      cliente: {nombre: 'Ana Pérez', telefono: '987654321', dni: '12345678'},
      lista: ['Ana Pérez', 'Luis Gómez']
    });
    const extra = escritos[0].doc.extra;
    ok(extra.pedidoId === 'id123', 'los valores simples sí pasan');
    ok(extra.cliente === undefined, '★ un objeto anidado NO pasa — ahí viajaría el cliente entero');
    ok(extra.lista === undefined, '★ una lista tampoco');
    ok(JSON.stringify(escritos[0].doc).indexOf('Ana Pérez') < 0,
        '★ el nombre del cliente no aparece por ningún lado del documento');
  }

  bloque('Tres frenos, porque un bucle de errores cuesta dinero');
  {
    const {Errores, escritos} = montar();
    for (let i = 0; i < 50; i++) Errores.anotar('bucle', new Error('el mismo fallo'));
    ok(escritos.length === 1, 'el mismo error 50 veces se escribe UNA');
    ok(Errores.resumen().distintos === 1, 'y se cuenta como uno solo');

    const b = montar();
    for (let i = 0; i < 50; i++) b.Errores.anotar('d' + i, new Error('distinto ' + i));
    ok(b.escritos.length === 20, '50 errores DISTINTOS se cortan en el tope de 20');
    ok(b.Errores.resumen().escritos === 20, 'y el resumen lo dice');
  }

  bloque('Nunca puede romper nada');
  {
    const {Errores} = montar();
    let reventó = false;
    try {
      Errores.anotar('x', null);
      Errores.anotar('x', undefined);
      Errores.anotar(null, 'texto suelto');
      Errores.anotar('x', {sin: 'message'});
      const circular = {}; circular.yo = circular;
      Errores.anotar('x', new Error('ok'), circular);
    } catch (_) { reventó = true; }
    ok(!reventó, 'con basura de entrada no lanza');

    // Y si la escritura falla —que es cuando más probable es que falle—
    // tampoco puede propagar.
    const roto = montar();
    roto.Errores.anotar('x', new Error('a'));
    let reventó2 = false;
    try {
      const w2 = {addEventListener: () => {},
        _fbEscribirError: () => { throw new Error('Firestore caído'); }};
      E.cargar('errores.js', w2, {navigator: {}, localStorage: {getItem: () => null}});
      w2.Errores.anotar('x', new Error('b'));
    } catch (_) { reventó2 = true; }
    ok(!reventó2, '★ si Firestore está caído, se calla — no propaga el fallo');
  }

  bloque('Atrapa lo que nadie envolvió en try/catch');
  {
    const {oyentes, escritos} = montar();
    ok(typeof oyentes['error'] === 'function', 'engancha window.onerror');
    ok(typeof oyentes['unhandledrejection'] === 'function', 'y las promesas sin atrapar');
    oyentes['error']({error: new Error('boom'), filename: 'https://x/config.js', lineno: 42});
    ok(escritos.length === 1 && escritos[0].doc.extra.archivo === 'config.js',
        'del archivo guarda solo el nombre, no la URL entera');
    oyentes['unhandledrejection']({reason: new Error('promesa rota')});
    ok(escritos.length === 2 && escritos[1].doc.mensaje === 'promesa rota',
        'y la razón de la promesa');
  }

  bloque('Está enganchado en el panel');
  {
    const idx = E.leer('index.html');
    ok(/<script src="errores\.js\?v=\d+"><\/script>/.test(idx), 'se carga');
    ok(idx.indexOf('errores.js') < idx.indexOf('auth.js'),
        'y PRONTO: cuanto antes cargue, más fallos atrapa');
    ok(/window\._fbEscribirError = \(id, doc\) => \{\s*\n\s*fsPatch\(erroresPath\(id\), doc\)\.catch\(\(\) => \{\}\);/.test(idx),
        'la escritura no reintenta ni avisa — reintentar cuando algo va mal es hacer una tormenta');
  }
};
