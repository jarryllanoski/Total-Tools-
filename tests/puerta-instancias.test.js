/**
 * tests/puerta-instancias.test.js — el empalme, probado contra lo MEDIDO
 * ========================================================================
 * ⚠️ POR QUE EXISTE ESTE ARCHIVO: EL FALLO DEL 11/10/2026.
 *
 * `instanciaShalom.conectar` estaba bien probado —decenas de pruebas, todas
 * verdes— y aun asi en produccion no veia ni una sola instancia. El fallo no
 * estaba en la logica: estaba en el CABLE entre la logica y la puerta, que
 * vivia suelto dentro de una funcion de 120 lineas en `index.js`.
 *
 * De los cuatro cables, dos pasaban la respuesta EN CRUDO donde `conectar`
 * espera la TRADUCIDA:
 *
 *     listar: () => _porLaPuerta('instances', {})   → {ok, json:{instances}}
 *     estado: (id) => _porLaPuerta('instanceStatus', …)
 *
 * `conectar` lee `lis.instancias` y `st.sesion.conectada`. En crudo son
 * `undefined` — y `undefined` no se queja:
 *   · `cual(undefined, …)` contesta «ninguna» → CREABA UNA INSTANCIA NUEVA
 *     EN CADA PULSACION. Con el plan viejo (1 maxima) el 403 tapaba el
 *     agujero; con 900 no lo tapa nada.
 *   · `st.sesion` undefined → `conectada:false` aunque el login fuera bien.
 *
 * Y NINGUNA PRUEBA EN ROJO, porque los dobles de `instancia-shalom.test.js`
 * devolvian la forma ya traducida:
 *
 *     listar: async () => ({ok: true, instancias: []})
 *
 * Un doble mas amable que la realidad no prueba el codigo: prueba el doble.
 *
 * Por eso AQUI el doble se pone en la unica frontera que medimos de verdad
 * —el JSON crudo que devuelve Shalom— y el traductor de verdad queda DENTRO
 * de lo que se ejecuta. Si alguien vuelve a quitar una traduccion, esto se
 * pone rojo.
 */
'use strict';
const PI = require('../functions/puertaInstancias.js');
const P = require('../functions/shalomPuerta.js');

/* JSON CRUDO, tal y como se midio contra la API desplegada:
   GET /instances        → {instances:[{id,name,username,createdAt,isLoggedIn}]}
   POST /instances/status → {isLoggedIn, username, url}                        */
const CRUDO_UNA = {instances: [{
  id: 'uuid-1', name: 'Total Tools Panel', username: 'Totaltools@gmail.com',
  createdAt: '2026-10-11T01:24:41.000Z', isLoggedIn: true
}]};
const CRUDO_VACIO = {instances: []};
const CRUDO_DOS = {instances: [
  {id: 'uuid-1', name: 'Total Tools Panel', username: 'a@b.com',
    createdAt: '2026-10-11T01:24:41.000Z', isLoggedIn: true},
  {id: 'uuid-2', name: 'Yapaitas', username: 'otro@b.com',
    createdAt: '2026-10-11T01:53:04.000Z', isLoggedIn: false}
]};

/** Una puerta de mentira que devuelve JSON CRUDO, como la de verdad. */
function puerta(respuestas) {
  const visto = {ops: [], datos: []};
  const fn = async (op, datos) => {
    visto.ops.push(op);
    visto.datos.push(datos);
    const r = respuestas[op];
    if (r === undefined) return {ok: true, json: {}};
    return typeof r === 'function' ? r(datos) : r;
  };
  return {fn, visto};
}

module.exports = async ({bloque, ok}) => {

  bloque('⚠️ listar TRADUCE — en crudo no se veia ni una instancia');

  {
    const {fn} = puerta({instances: {ok: true, json: CRUDO_UNA}});
    const d = PI.hacer(fn, P.traducir);
    const r = await d.listar();
    ok(r.ok === true, 'con una instancia, listar sale bien');
    ok(Array.isArray(r.instancias) && r.instancias.length === 1,
       '⚠️ y trae `instancias` — el campo que `conectar` lee de verdad. ' +
       'En crudo era `undefined` y por eso creaba una nueva cada vez');
    const i = r.instancias[0];
    ok(i.id === 'uuid-1' && i.nombre === 'Total Tools Panel' &&
       i.usuario === 'Totaltools@gmail.com' && i.conectada === true,
       'y en el vocabulario del panel —nombre, usuario, conectada— no en el ' +
       'de Shalom: `name`, `username`, `isLoggedIn` no cruzan esta frontera');
  }
  {
    /* EL ESTADO DE SU CUENTA EL 11/10/2026: «0 de 900 · Aun no tienes
       instancias». El traductor devuelve ok:false con SIN_INSTANCIA, pero
       TRAE la lista vacia — y para quien va a decidir eso no es un fallo:
       es exactamente la señal de crear una. */
    const {fn} = puerta({instances: {ok: true, json: CRUDO_VACIO}});
    const r = await PI.hacer(fn, P.traducir).listar();
    ok(r.ok === true && r.instancias.length === 0,
       'cuenta vacia = `ok:true` con lista vacia, NO un fallo: «ninguna» es ' +
       'la respuesta que hace que se cree una');
  }
  {
    /* Con varias, el traductor dice VARIAS_INSTANCIAS porque el no sabe
       cual es la nuestra. `cual()` SI sabe: desempata por correo. Asi que
       la lista tiene que llegarle entera. */
    const {fn} = puerta({instances: {ok: true, json: CRUDO_DOS}});
    const r = await PI.hacer(fn, P.traducir).listar();
    ok(r.ok === true && r.instancias.length === 2,
       'con varias tambien pasa la lista entera: el traductor no sabe cual ' +
       'es la nuestra, pero `cual()` desempata por correo y necesita verlas');
  }
  {
    /* ⚠️ LA LINEA QUE SEPARA «no hay ninguna» DE «no entendi la respuesta».
       Si Shalom cambia un nombre de campo y esto se tomara por cuenta
       vacia, crearíamos una instancia duplicada justo el dia en que menos
       sabemos lo que pasa. */
    const {fn} = puerta({instances: {ok: true, json: {otra_cosa: []}}});
    const r = await PI.hacer(fn, P.traducir).listar();
    ok(r.ok === false && r.motivo === 'FORMATO_DESCONOCIDO',
       'una respuesta que no entendemos es un FALLO, nunca «no hay ninguna»: ' +
       'confundirlas crearia una instancia duplicada el peor dia');
  }
  {
    const {fn} = puerta({instances: {ok: false, motivo: 'PUERTA_CERRADA'}});
    const r = await PI.hacer(fn, P.traducir).listar();
    ok(r.ok === false && r.motivo === 'PUERTA_CERRADA',
       'y si la puerta esta cerrada se dice eso, con su motivo — no se ' +
       'traduce un json que no llego');
  }

  bloque('⚠️ estado TRADUCE — en crudo el login bueno salia «no conectada»');

  {
    const {fn} = puerta({instanceStatus: {ok: true, json: {
      isLoggedIn: true, username: null,
      url: 'https://pro.shalom.pe/panel'}}});
    const r = await PI.hacer(fn, P.traducir).estado('uuid-1');
    ok(r.ok === true && r.sesion && r.sesion.conectada === true,
       '⚠️ `sesion.conectada` existe — es lo que `conectar` mira para decir ' +
       '«conectada». En crudo era undefined y SIEMPRE salia false');
    ok(r.sesion.enLogin === false,
       'y de regalo lo que solo da este endpoint: si el robot quedo parado ' +
       'en la pantalla de entrar');
  }
  {
    const {fn, visto} = puerta({instanceStatus: {ok: true, json:
      {isLoggedIn: false, username: null, url: 'https://x/login'}}});
    await PI.hacer(fn, P.traducir).estado('uuid-9');
    ok(visto.datos[0] && visto.datos[0].instanceId === 'uuid-9',
       'y el id viaja en `instanceId`, que es como lo espera la puerta');
  }
  {
    const {fn} = puerta({instanceStatus: {ok: false, motivo: 'SIN_RED'}});
    const r = await PI.hacer(fn, P.traducir).estado('uuid-1');
    ok(r.ok === false && r.motivo === 'SIN_RED',
       'sin red se dice sin red');
  }

  bloque('crear y entrar van EN CRUDO, y eso es a proposito');

  {
    /* No es un descuido simetrico: `conectar` les lee `.json` porque
       ninguna de las dos respuestas esta medida —crear y entrar tienen
       efecto, asi que medirlas no es gratis— y lo que hace con ese json es
       buscar el id entre varios nombres posibles y sacar la FORMA de los
       campos. Traducir aqui seria traducir a ciegas. */
    const {fn, visto} = puerta({
      instanceCrear: {ok: true, json: {instanceId: 'nueva'}},
      instanceLogin: {ok: true, json: {success: true}}
    });
    const d = PI.hacer(fn, P.traducir);
    const c = await d.crear('Total Tools Panel');
    ok(c.ok === true && c.json && c.json.instanceId === 'nueva',
       'crear devuelve el json tal cual: `conectar` busca el id ahi, por ' +
       'varios nombres, porque esta respuesta no esta medida');
    ok(visto.datos[0] && visto.datos[0].name === 'Total Tools Panel',
       'y el nombre viaja en `name`');

    const e = await d.entrar('uuid-1', 'yo@b.com', 'secreta');
    ok(e.ok === true && e.json.success === true, 'entrar, igual');
    const env = visto.datos[1];
    ok(env.instanceId === 'uuid-1' && env.username === 'yo@b.com' &&
       env.password === 'secreta',
       'y los tres campos viajan con los nombres que pide la puerta: ' +
       'instanceId, username, password');
  }

  bloque('⚠️ Y el empalme esta ENCHUFADO de verdad en index.js');

  {
    /* LA LLAMADA, NO LA PALABRA. Ya me paso cinco veces hoy: una prueba que
       busca un nombre en el fuente pasa aunque nadie lo llame. Aqui se
       comprueba que `conectar` recibe lo que sale de `puertaInstancias`, y
       que no han vuelto a escribirse los cuatro cables a mano. */
    const fs = require('fs');
    const src = fs.readFileSync(
        require('path').join(__dirname, '..', 'functions', 'index.js'),
        'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const hace = src.match(
        /const (\w+)\s*=\s*puertaInstancias\.hacer\(\s*\n?\s*_porLaPuerta,\s*shalomPuerta\.traducir\)/);
    ok(!!hace,
       'los cables se arman con `puertaInstancias.hacer(_porLaPuerta, ' +
       'shalomPuerta.traducir)` — con el traductor de verdad, no otro');
    ok(hace && new RegExp('instanciaShalom\\.conectar\\(' + hace[1] + ',')
        .test(src),
       'y son ESOS los que recibe `conectar`, no unos escritos a mano');
    ok(!/listar:\s*\(\)\s*=>\s*_porLaPuerta/.test(src),
       '⚠️ y NO hay un `listar:` escrito a mano con la puerta en crudo — ' +
       'eso es exactamente lo que fallo');
    ok(!/estado:\s*\(id\)\s*=>\s*_porLaPuerta/.test(src),
       'ni un `estado:` asi');
  }
};
