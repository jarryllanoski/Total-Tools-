/**
 * tests/registro-panel.test.js — el botón que cuesta dinero
 * ==========================================================
 * Hasta hoy registrar en Shalom solo se podía desde la consola. Esta es su
 * cara, y la cara de una operación que NO SE PUEDE DESHACER tiene reglas
 * propias: Shalom no anula envíos y no tiene clave de idempotencia, así que
 * cualquier camino que lleve a una segunda llamada es un segundo paquete y
 * un segundo cobro.
 *
 * Lo que se prueba aquí no es que se vea bonito: es que no haya ningún
 * camino —ni un doble clic, ni un reintento, ni un dato viejo— que pueda
 * cobrarle dos veces al dueño.
 */
'use strict';
const E = require('./_entorno.js');
const R = require('../functions/registroShalom.js');

const FUENTE = E.trozo('config.js',
    '/* ── 🚚 REGISTRAR EN SHALOM, DESDE EL PEDIDO',
    '\nfunction _claveAuto(){');

const PEDIDO = () => ({
  id: 'id_1', name: 'Ana Pérez', status: 'POR ALISTAR', courier: 'SHALOM',
  agenciaId: '499', agenciaCourier: 'SHALOM', agenciaNombre: 'Lima Centro',
  dni: '73483547', phone: '918642656', shalomClave: '5773',
  pkgLargo: 30, pkgAncho: 20, pkgAlto: 12, pkgPeso: 1.5,
  reniec: {nombres: 'ANA', apePaterno: 'PEREZ', apeMaterno: 'GOMEZ'}
});

/* Monta el bloque con un mundo controlado. `op` decide el escenario. */
function montar(op) {
  op = op || {};
  const ped = op.pedido === undefined ? PEDIDO() : op.pedido;
  const dom = E.domFalso({ids: ['shalomRegBlock', 'regShalomSalida',
    'btnRegistrarShalom', 'regOrigenCaja', 'regOrigenInput']});
  const visto = {toasts: [], guardados: [], renders: 0, confirmado: null,
    llamadas: 0, recuperaciones: 0, programados: []};

  const S = {
    shipments: ped ? [ped] : [],
    agenciaOrigen: op.sinOrigen ? null :
      {agenciaId: '576', agenciaCourier: 'SHALOM', agenciaNombre: 'Arequipa'},
    shalomInstancia: op.sinCuenta ? null : {id: 'abc', nombre: 'Total'},
    shalomRegistroSimulacro: op.simulacro === undefined ? true : op.simulacro
  };
  const win = {
    RegistroShalom: R,
    Shalom: {
      registrarEnvio: async () => { visto.llamadas++; return op.respuesta || null; },
      recuperarEnvio: async () => { visto.recuperaciones++; return op.recupera || null; },
      estadoSesion: async () => op.sesion || {ok: true},
      textoMotivo: (m) => 'texto:' + m
    }
  };
  const ctx = {
    window: win, document: dom.doc,
    $: (id) => dom.porId[id] || null,
    S: S,
    _editId: op.sinEditar ? null : 'id_1',
    _dirtyShips: new Set(op.sinSubir ? ['id_1'] : []),
    escH: (s) => (s == null ? '' : String(s)),
    toast: (t) => visto.toasts.push(t),
    save: (id) => visto.guardados.push(id),
    render: () => { visto.renders++; },
    confirmar: (o) => { visto.confirmado = o; },
    console: {log: () => {}},
    _congelarSiRegistrado: () => {},
    _pintarOrigen: () => {},
    setTimeout: (fn, ms) => { visto.programados.push(ms); return 1; },
    clearTimeout: () => {},
    salida: {}
  };
  const n = Object.keys(ctx);
  // eslint-disable-next-line no-new-func
  new Function(...n, FUENTE +
      '\nsalida.pintar = _pintarRegistroShalom;' +
      '\nsalida.registrar = registrarEnvioPanel;' +
      '\nsalida.recuperar = recuperarEnvioPanel;' +
      '\nsalida.toggle = regToggleSimulacro;')(...n.map((k) => ctx[k]));
  return {api: ctx.salida, dom, visto, S, ped, sucios: ctx._dirtyShips,
    html: () => dom.porId.shalomRegBlock.innerHTML};
}

module.exports = async ({bloque, ok}) => {

  bloque('Un pedido ya registrado no tiene botón — no existe, no es que esté gris');

  {
    /* ⚠️ EL CANDADO CARO. Un botón deshabilitado se puede volver a habilitar
       desde la consola, o por un repintado mal hecho. Uno que no está en el
       HTML no se puede pulsar de ninguna forma. */
    const m = montar({pedido: Object.assign(PEDIDO(),
      {shalomGuia: '98173469', shalomCodigo: 'WKKH', shalomMonto: 12,
        status: 'ALISTADO'})});
    m.api.pintar();
    ok(!/btnRegistrarShalom/.test(m.html()),
       'con guía ya puesta, el botón de registrar NO está en el HTML');
    ok(/98173469/.test(m.html()) && /WKKH/.test(m.html()),
       'y se ve la guía y el código que ya tiene');
    ok(/12\.00/.test(m.html()), 'y el monto cuando Shalom lo devolvió');
  }

  bloque('Lo que falta se dice en palabras, y por el mismo archivo que el servidor');

  {
    const m = montar({pedido: Object.assign(PEDIDO(), {shalomClave: ''})});
    m.api.pintar();
    ok(/clave de recojo/i.test(m.html()),
       'falta la clave → lo dice con las palabras del servidor');
    ok(!/btnRegistrarShalom/.test(m.html()), 'y no hay botón que pulsar');
  }
  {
    const m = montar({sinOrigen: true});
    m.api.pintar();
    ok(/agencia de origen/i.test(m.html()), 'sin agencia de origen, lo dice');
    ok(!/btnRegistrarShalom/.test(m.html()), 'y tampoco hay botón');
  }
  {
    const m = montar({sinCuenta: true});
    m.api.pintar();
    ok(/cuenta de Shalom/i.test(m.html()), 'sin cuenta de Shalom Pro, lo dice');
  }
  {
    const m = montar({pedido: Object.assign(PEDIDO(), {status: 'ALISTADO'})});
    m.api.pintar();
    ok(/POR ALISTAR/.test(m.html()),
       'y fuera de POR ALISTAR se explica por qué no se puede');
  }

  bloque('El dato viejo: Shalom lee la nube, no tu pantalla');

  {
    /* Si el pedido no se ha subido todavía, el servidor registraría con los
       datos ANTERIORES: caja equivocada, o "faltan medidas" con las medidas
       delante. El botón no aparece hasta que la nube esté al día. */
    const m = montar({sinSubir: true});
    m.api.pintar();
    ok(!/btnRegistrarShalom/.test(m.html()),
       'con cambios sin subir no hay botón');
    ok(/Subiendo cambios/i.test(m.html()),
       'y se dice lo que de verdad pasa, no "guarda primero" cuando ya guardaste');
  }

  {
    /* ⚠️ EL BUCLE QUE ME COMÍ AL ESCRIBIR ESTO. La primera versión del
       repintado se reprogramaba sola sin límite mientras la subida no
       terminara: sin red, el panel repintaba cada 1,2 s para siempre. Lo
       cazó la propia suite —el proceso de pruebas no terminaba nunca— y por
       eso hay un tope. Un reintento sin final no es paciencia, es un bucle. */
    const m = montar({sinSubir: true});
    m.api.pintar();
    ok(m.visto.programados.length === 1,
       'mientras sube, se vuelve a mirar dentro de un momento');

    const t = montar({sinSubir: true});
    t.api.pintar(15);
    ok(t.visto.programados.length === 0,
       'pero no para siempre: al llegar al tope deja de reprogramarse');
    ok(/Comprobar de nuevo/.test(t.html()),
       'y entonces te da un botón, en vez de fingir que sigue en camino');
    ok(/comprueba tu conexi/i.test(t.html()),
       'diciendo lo que de verdad puede estar pasando');
  }

  bloque('La pantalla dice la verdad sobre si el próximo clic cuesta dinero');

  {
    const sim = montar({simulacro: true});
    sim.api.pintar();
    ok(/btnRegistrarShalom/.test(sim.html()) && /no cuesta/i.test(sim.html()),
       'en simulacro el botón avisa de que no cuesta');

    const real = montar({simulacro: false});
    real.api.pintar();
    ok(/env.o real/i.test(real.html()),
       'con el simulacro apagado, el botón dice que crea un envío real');
  }
  {
    /* El interruptor no existía: solo se podía cambiar subiendo un archivo de
       configuración. Lo único que decide si un clic cuesta S/ 12 era invisible. */
    const m = montar({simulacro: true});
    m.api.pintar();
    m.api.toggle();
    ok(m.S.shalomRegistroSimulacro === false,
       'se puede apagar el simulacro desde el panel');
    ok(m.visto.guardados.indexOf('config') >= 0,
       'y se guarda, porque lo lee el servidor');
    m.api.toggle();
    ok(m.S.shalomRegistroSimulacro === true,
       'y volver a encenderlo guarda `true` EXPLÍCITO: el servidor solo apaga ' +
       'el simulacro con un false explícito, así que dejarlo ausente mentiría');
  }

  bloque('⚠️ EL DOBLE COBRO — ningún camino puede llamar dos veces');

  {
    const m = montar({simulacro: false,
      respuesta: {ok: true, estado: 'exito',
        campos: {shalomGuia: '123', shalomCodigo: 'AB', status: 'ALISTADO'}}});
    m.api.pintar();
    const btn = m.dom.porId.btnRegistrarShalom;
    await m.api.registrar();
    ok(m.visto.confirmado, 'antes de llamar se pide confirmación');
    ok(/env.o real/i.test(m.visto.confirmado.html),
       'y la confirmación avisa de que se cobra');
    ok(m.visto.llamadas === 0, 'y hasta confirmar NO se ha llamado a Shalom');

    await m.visto.confirmado.alConfirmar();
    ok(m.visto.llamadas === 1, 'al confirmar se llama UNA vez');
    ok(btn.disabled === true, 'y el botón queda apagado');
    ok(btn.onclick === null,
       'sin onclick: un botón deshabilitado se puede rehabilitar, uno sin ' +
       'manejador no hace nada aunque alguien lo rehabilite');
  }
  {
    /* `confirmar` vuelve a habilitar SU botón cuando `alConfirmar` lanza, y
       ofrece reintentar. Aquí eso sería un segundo envío, así que esta
       función no puede lanzar NUNCA — ni con Shalom reventando. */
    const m = montar({simulacro: false, respuesta: null});
    m.api.pintar();
    await m.api.registrar();
    let lanzo = false;
    try { await m.visto.confirmado.alConfirmar(); } catch (e) { lanzo = true; }
    ok(!lanzo, 'una respuesta vacía no hace que alConfirmar lance');
    ok(m.visto.guardados.length === 0, 'y no se escribe nada que no haya pasado');
  }
  {
    const m = montar({simulacro: false, pedido: Object.assign(PEDIDO(),
      {shalomGuia: '98173469'})});
    m.api.pintar();
    await m.api.registrar();
    ok(!m.visto.confirmado && m.visto.llamadas === 0,
       'un pedido que ya tiene guía no llega ni a pedir confirmación');
    /* ⚠️ QUÉ candado lo paró, no solo que algo lo parara. Hay DOS a
       propósito —`estaRegistrado` aquí y, debajo, `faltantes`, que también
       lo comprueba— y sin mirar el aviso no se distingue cuál actuó: quitar
       uno de los dos no cambiaría nada visible, y el día que el de abajo se
       rompa nadie se enteraría de que estaba solo. Esta defensa en capas ya
       salvó un cobro doble: cuando falló el candado de la guía, lo paró el
       del estado. */
    ok(/ya tiene guía/i.test(m.visto.toasts.join(' ')),
       'y lo para el candado de la guía, no el de "falta algo"');
  }
  {
    /* Entre pintar y pulsar pueden pasar cosas: otra pestaña, el barrido, o
       tú mismo. Lo pintado es un aviso; lo que manda es la comprobación de
       este instante. */
    const m = montar({simulacro: false});
    m.api.pintar();
    m.ped.shalomClave = '';            // deja de estar listo DESPUÉS de pintar
    await m.api.registrar();
    ok(!m.visto.confirmado && m.visto.llamadas === 0,
       'se vuelve a comprobar todo justo antes de llamar');
  }

  {
    /* ⚠️ EL CANDADO QUE NO ES REDUNDANTE. El pintor esconde el botón cuando
       hay cambios sin subir, pero eso solo vale en el instante de pintar: si
       el botón ya estaba en pantalla y el pedido se ensucia después —lo tocas
       en otra pestaña, entra un cambio— el único que queda es este. Mi
       primera versión de esta prueba miraba el HTML pintado, así que quitar
       el candado del clic no la ponía roja. Ahora se pulsa de verdad. */
    const m = montar({simulacro: false});
    m.api.pintar();
    ok(/btnRegistrarShalom/.test(m.html()), 'el botón estaba pintado y listo');
    m.sucios.add('id_1');                  // se ensucia DESPUÉS de pintar
    await m.api.registrar();
    ok(!m.visto.confirmado && m.visto.llamadas === 0,
       'con cambios sin subir, el clic no llama a Shalom aunque el botón esté ahí');
    ok(/Guarda los cambios/i.test(m.visto.toasts.join(' ')),
       'y dice por qué: Shalom leería de la nube unos datos que no son los tuyos');
  }

  bloque('Los tres finales — y la duda no es un fallo');

  {
    const m = montar({simulacro: false,
      respuesta: {ok: true, estado: 'exito', campos: {shalomGuia: '98173469',
        shalomCodigo: 'WKKH', shalomEstado: 'REGISTRADO', status: 'ALISTADO'}}});
    m.api.pintar();
    await m.api.registrar();
    await m.visto.confirmado.alConfirmar();
    ok(m.ped.shalomGuia === '98173469' && m.ped.status === 'ALISTADO',
       'el éxito escribe la guía y el estado en el pedido');
    ok(m.visto.guardados.indexOf('id_1') >= 0, 'y lo guarda');
    ok(!/btnRegistrarShalom/.test(m.html()),
       'y al repintar ya no hay botón: el pedido pasó a estar registrado');
  }
  {
    const m = montar({simulacro: true, respuesta: {ok: true, simulacro: true,
      cuerpo: {}}});
    m.api.pintar();
    await m.api.registrar();
    await m.visto.confirmado.alConfirmar();
    ok(m.ped.shalomGuia === undefined,
       'un simulacro NO escribe nada en el pedido');
    ok(m.visto.guardados.length === 0, 'ni guarda');
    /* Y SE DICE QUE FUE UN SIMULACRO. Sin esto, quitar la rama del simulacro
       no rompía ninguna prueba: una respuesta de simulacro no trae `campos`,
       así que caía al camino de fallo y tampoco escribía nada — el pedido
       quedaba igual, pero en pantalla ponía "no se registró" en rojo después
       de una prueba que había salido perfecta. El candado es redundante para
       los datos; para lo que lees, no. */
    ok(/Simulacro correcto/i.test(m.dom.porId.regShalomSalida.innerHTML),
       'y en pantalla se dice que fue un simulacro, no que fallara');
    ok(/no se cre/i.test(m.visto.toasts.join(' ')),
       'y que no se creó nada');
  }
  {
    /* ⚠️ LA DUDA. Se cortó y no sabemos si el envío se creó. Ofrecer
       "reintentar" aquí es ofrecer pagar dos veces. Se ofrece RECUPERAR, que
       solo lee. */
    const m = montar({simulacro: false,
      respuesta: {ok: false, estado: 'duda', motivo: 'SIN_RED',
        detalle: 'Se cortó la conexión'}});
    m.api.pintar();
    await m.api.registrar();
    await m.visto.confirmado.alConfirmar();
    const salida = m.dom.porId.regShalomSalida.innerHTML;
    ok(/recuperarEnvioPanel/.test(salida),
       'en duda se ofrece recuperar, que solo lee');
    ok(!/reintent/i.test(salida) && !/registrarEnvioPanel/.test(salida),
       'y JAMÁS reintentar: Shalom no anula y no tiene clave de idempotencia');
    ok(m.ped.shalomGuia === undefined, 'y no se inventa una guía');
  }
  {
    const m = montar({simulacro: false,
      respuesta: {ok: false, estado: 'fallo', motivo: 'BLOQUEADO'}});
    m.api.pintar();
    await m.api.registrar();
    await m.visto.confirmado.alConfirmar();
    const salida = m.dom.porId.regShalomSalida.innerHTML;
    ok(/texto:BLOQUEADO/.test(salida), 'el fallo se dice con sus palabras');
    ok(!/registrarEnvioPanel/.test(salida) && !/reintent/i.test(salida),
       'y tampoco invita a volver a intentarlo a ciegas');
  }

  bloque('Recuperar solo lee');

  {
    const m = montar({recupera: {ok: true, recuperado: true,
      campos: {shalomGuia: '98173469', shalomCodigo: 'WKKH'}}});
    m.api.pintar();
    await m.api.recuperar();
    ok(m.visto.llamadas === 0, 'recuperar NUNCA llama a registrar');
    ok(m.ped.shalomGuia === '98173469', 'y rellena la guía que encontró');
  }
  {
    const m = montar({recupera: {ok: false, motivo: 'NO_ENCONTRADO'}});
    m.api.pintar();
    await m.api.recuperar();
    ok(m.ped.shalomGuia === undefined,
       'si no lo encuentra no escribe nada, y no ofrece registrar de nuevo');
  }

  bloque('Un pedido sin guardar todavía no se puede registrar');

  {
    const m = montar({sinEditar: true});
    m.api.pintar();
    ok(/Guarda el pedido/i.test(m.html()),
       'en un pedido nuevo se pide guardarlo primero: el servidor lo lee de ' +
       'Firestore por su id, y todavía no tiene');
    ok(!/btnRegistrarShalom/.test(m.html()), 'y no hay botón');
  }
};
