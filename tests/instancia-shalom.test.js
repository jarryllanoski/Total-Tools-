/**
 * tests/instancia-shalom.test.js — conectar la cuenta sin dejar basura
 * ======================================================================
 * EL DUEÑO PIDIO DOS COSAS EL 3/10/2026: «que pueda generar instancia de mi
 * panel UNA SOLA VEZ» y «que no se caiga al refrescar». Las dos tiran de la
 * misma operacion, y las dos tienen una forma de salir mal:
 *
 *   crear de mas  → con el plan nuevo caben 900 instancias y ya no hay 403
 *                   que te pare. Un boton que crea acaba creando de mas: la
 *                   otra aplicacion del dueño tiene uno y ya lo demostro.
 *   no entrar     → de su documentacion: «hace auto-login cuando expira, SI
 *                   GUARDASTE CREDENCIALES». Una instancia creada y nunca
 *                   logueada se cae y no se levanta sola. Ese es el 401 que
 *                   ellos mismos llaman «el fallo mas repetido de esta API».
 *
 * Por eso conectar = buscar · crear SOLO si no hay · entrar SIEMPRE ·
 * comprobar. Idempotente: pulsarla dos veces no crea dos.
 */
'use strict';
const I = require('../functions/instanciaShalom.js');
const E = require('./_entorno.js');

const CRED = {usuario: 'yo@totaltools', clave: 'la-que-sea'};
const MIA = 'Totaltools@gmail.com';

/* Un mundo de mentira: ninguna de las cuatro llamadas toca la red. */
function mundo(op) {
  op = op || {};
  const visto = {listadas: 0, creadas: 0, entradas: 0, estados: 0,
    nombreCreado: null, idEntrado: null, credenciales: null};
  const deps = {
    listar: async () => {
      visto.listadas++;
      return op.lista === undefined ?
        {ok: true, instancias: []} : op.lista;
    },
    crear: async (nombre) => {
      visto.creadas++; visto.nombreCreado = nombre;
      return op.crear === undefined ?
        {ok: true, json: {instanceId: 'nueva-uuid'}} : op.crear;
    },
    entrar: async (id, u, c) => {
      visto.entradas++; visto.idEntrado = id;
      visto.credenciales = {u: u, c: c};
      return op.entrar === undefined ? {ok: true, json: {success: true}} : op.entrar;
    },
    estado: async () => {
      visto.estados++;
      return op.estado === undefined ?
        {ok: true, sesion: {conectada: true, usuario: MIA}} : op.estado;
    }
  };
  return {deps, visto};
}
const conOpc = (extra) => Object.assign(
    {correo: MIA, nombre: 'Total Tools Panel'}, CRED, extra || {});

module.exports = async ({bloque, ok}) => {

  bloque('Cual es la nuestra: por correo, y por nombre solo si es huerfana');

  {
    const L = [
      {id: 'mia', nombre: 'Como sea', usuario: MIA},
      {id: 'ajena', nombre: 'Total', usuario: 'otro@gmail.com'}
    ];
    const r = I.cual(L, MIA, 'Total Tools Panel');
    ok(r.estado === 'una' && r.instancia.id === 'mia',
       'el correo la encuentra aunque se llame cualquier cosa');
  }
  {
    /* ⚠️ EL HUERFANO. Un intento anterior creo la instancia y fallo al
       entrar: existe, tiene nuestro nombre y NO tiene correo todavia
       —`username` solo aparece cuando entra—. Sin reconocerla, el siguiente
       intento crearia otra al lado, y otra, y otra. */
    const r = I.cual([{id: 'huerfana', nombre: 'Total Tools Panel',
      usuario: ''}], MIA, 'Total Tools Panel');
    ok(r.estado === 'una' && r.instancia.id === 'huerfana',
       'una creada y nunca logueada se reutiliza, no se duplica');
  }
  {
    /* Pero con OTRO correo no es nuestra por mucho que se llame igual. */
    const r = I.cual([{id: 'x', nombre: 'Total Tools Panel',
      usuario: 'otro@gmail.com'}], MIA, 'Total Tools Panel');
    ok(r.estado === 'ninguna',
       'con el nombre nuestro pero otro correo, NO es nuestra');
  }
  {
    const r = I.cual([{id: 'a', usuario: MIA}, {id: 'b', usuario: MIA}],
        MIA, 'Total Tools Panel');
    ok(r.estado === 'varias',
       'dos con el mismo correo: la regla del dueño se rompio, no se elige');
  }

  bloque('⚠️ Crear SOLO si no hay — «una sola vez» por construccion');

  {
    const {deps, visto} = mundo({lista: {ok: true,
      instancias: [{id: 'ya-existe', nombre: 'Total Tools Panel', usuario: MIA}]}});
    const r = await I.conectar(deps, conOpc());
    ok(r.ok === true && r.id === 'ya-existe', 'encuentra la que ya tenias');
    ok(visto.creadas === 0,
       'y NO crea otra. Con 900 slots ya no hay 403 que pare a un boton que ' +
       'crea; lo que para es no llamar a crear');
    ok(r.creada === false, 'y se dice que no se creo nada');
  }
  {
    const {deps, visto} = mundo();
    const r = await I.conectar(deps, conOpc());
    ok(r.ok === true && r.creada === true && r.id === 'nueva-uuid',
       'sin ninguna, la crea');
    ok(visto.nombreCreado === 'Total Tools Panel',
       'con el nombre declarado en el codigo, no uno escrito a mano');
    ok(visto.creadas === 1, 'una vez');
  }
  {
    /* Idempotencia de verdad: la segunda vuelta ya la encuentra. */
    let lista = {ok: true, instancias: []};
    const visto = {creadas: 0};
    const deps = {
      listar: async () => lista,
      crear: async (n) => { visto.creadas++;
        lista = {ok: true, instancias: [{id: 'u1', nombre: n, usuario: MIA}]};
        return {ok: true, json: {instanceId: 'u1'}}; },
      entrar: async () => ({ok: true, json: {}}),
      estado: async () => ({ok: true, sesion: {conectada: true}})
    };
    await I.conectar(deps, conOpc());
    await I.conectar(deps, conOpc());
    await I.conectar(deps, conOpc());
    ok(visto.creadas === 1,
       'pulsarla tres veces crea UNA instancia: eso es «una sola vez»');
  }

  bloque('⚠️ Entrar SIEMPRE — es lo que evita que la sesion se caiga');

  {
    const {deps, visto} = mundo({lista: {ok: true, instancias:
      [{id: 'viva', usuario: MIA}]}, estado: {ok: true,
      sesion: {conectada: true, usuario: MIA}}});
    const r = await I.conectar(deps, conOpc());
    ok(visto.entradas === 1,
       'aunque la cuenta ya figure conectada, se entra igual: entrar es lo ' +
       'que deja las credenciales GUARDADAS, y sin ellas no hay auto-login');
    ok(visto.idEntrado === 'viva', 'y se entra en la nuestra, no en otra');
    ok(r.conectada === true, 'y se comprueba despues, que es lo unico que ' +
       'demuestra algo');
    ok(visto.estados === 1, 'con una comprobacion, no con fe');
  }
  {
    const {deps, visto} = mundo();
    await I.conectar(deps, conOpc());
    ok(visto.credenciales.u === CRED.usuario &&
       visto.credenciales.c === CRED.clave,
       'las credenciales llegan al login — pero desde el servidor, nunca ' +
       'del navegador: la operacion es soloServidor');
  }

  bloque('Lo que puede salir mal, y que no deje basura');

  {
    const {deps, visto} = mundo({usuario: ''});
    const r = await I.conectar(deps, conOpc({usuario: '', clave: ''}));
    ok(r.ok === false && r.motivo === 'SIN_CREDENCIALES',
       'sin credenciales en Secret Manager, se dice y se dice como ponerlas');
    ok(visto.creadas === 0 && visto.listadas === 0,
       '⚠️ y NO se crea nada: crear sin poder entrar deja una instancia ' +
       'muerta en la cuenta, que es lo contrario de lo que se pidio');
  }
  {
    const {deps, visto} = mundo({entrar: {ok: false, motivo: 'BLOQUEADO'}});
    const r = await I.conectar(deps, conOpc());
    ok(r.ok === false && r.motivo === 'BLOQUEADO', 'si el login falla, se dice');
    ok(r.id === 'nueva-uuid' && r.creada === true,
       'y se devuelve el id de la que SI se creo, para no perderla');
    ok(/no se va a crear otra/i.test(r.detalle),
       'diciendo que la proxima vez se reutiliza, no se duplica');
    ok(visto.creadas === 1, 'y no se reintenta creando otra');
  }
  {
    /* Shalom contesto al crear pero no reconocemos el id. Pudo crearse
       igual: decirlo es mas barato que crear otra encima. */
    const {deps} = mundo({crear: {ok: true, json: {vaya: 'cosa rara'}}});
    const r = await I.conectar(deps, conOpc());
    ok(r.ok === false && r.motivo === 'FORMATO_DESCONOCIDO',
       'si no se reconoce el id de la creada, se para');
    ok(Array.isArray(r.forma) && r.forma.indexOf('vaya') >= 0,
       'y se devuelven los NOMBRES de lo que contesto, sin un solo valor');
  }
  {
    const {deps, visto} = mundo({lista: {ok: false, motivo: 'SIN_RED'}});
    const r = await I.conectar(deps, conOpc());
    ok(r.ok === false && visto.creadas === 0,
       'si no se puede ni leer la lista, NO se crea a ciegas: seria crear ' +
       'una segunda sin saber si ya habia una');
  }
  {
    const {deps, visto} = mundo({lista: {ok: true, instancias:
      [{id: 'a', usuario: MIA}, {id: 'b', usuario: MIA}]}});
    const r = await I.conectar(deps, conOpc());
    ok(r.ok === false && r.motivo === 'VARIAS_INSTANCIAS' && visto.creadas === 0,
       'con dos candidatas no se elige ni se crea una tercera: se pregunta');
  }

  bloque('El id de la creada, aunque venga con otro nombre');

  {
    ok(I.idDe({instanceId: 'a'}) === 'a', 'instanceId');
    ok(I.idDe({data: {id: 'b'}}) === 'b', 'anidado bajo data');
    ok(I.idDe({instance_id: 'c'}) === 'c', 'con guion bajo');
    ok(I.idDe({nada: 1}) === '', 'y si no esta, cadena vacia — no se inventa');
    ok(I.idDe(null) === '' && I.idDe('texto') === '', 'ni revienta con basura');
  }

  bloque('⚠️ La identidad declarada no puede divergir entre panel y servidor');

  {
    /* El servidor decide con `instanciaShalom.DECLARADA` y el panel con
       `Shalom.INSTANCIA_PREFERIDA`. Si dijeran cosas distintas, el panel
       elegiria una cuenta y el servidor conectaria otra — y el dueño veria
       «conectada» mientras los envios salen de otro sitio. */
    const win = {}; E.cargar('shalom.js', win);
    const P = win.Shalom.INSTANCIA_PREFERIDA;
    ok(String(P.correo).toLowerCase() ===
       String(I.DECLARADA.correo).toLowerCase(),
       'el correo declarado es el mismo en los dos lados');
    ok(String(P.nombre).trim() === String(I.DECLARADA.nombre).trim(),
       'y el nombre tambien');
  }
};
