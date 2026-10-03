/**
 * tests/credenciales.test.js — la contraseña entra, y no vuelve a salir
 * ======================================================================
 * Shalom pide usuario y contraseña EN TEXTO PLANO para `/instances/login`:
 * no hay OAuth ni token. Y su API bloquea al navegador por CORS. Asi que
 * alguien tiene que mandarles la contraseña real — no hay truco que lo
 * evite. La pregunta no es SI viaja, sino DONDE DESCANSA y CUANTAS VECES.
 *
 *   la otra aplicacion del dueño → la guarda en su base y te la RELLENA en
 *                                  el formulario cada vez. Eso es leerla.
 *   usar y olvidar               → la escribes cada vez que la sesion cae.
 *                                  Viaja muchas veces, y de madrugada no
 *                                  hay nadie que la escriba.
 *   esto                         → una vez, a Secret Manager, y el
 *                                  servidor entra solo desde ahi.
 *
 * Lo que se prueba aqui es el trato: entra UNA vez y NO SE PUEDE SACAR.
 */
'use strict';
const C = require('../functions/credenciales.js');
const P = require('../functions/shalomPuerta.js');

const BIEN = {usuario: 'yo@totaltools.com', clave: 'la-que-sea-123'};

function mundo(op) {
  op = op || {};
  const visto = {escritos: {}, auditado: null, leidos: 0};
  const deps = {
    escribir: async (n, v) => {
      if (op.fallaEscribir) throw new Error(op.fallaEscribir);
      visto.escritos[n] = v;
    },
    leer: async (n) => {
      visto.leidos++;
      if (op.fallaLeer) throw new Error(op.fallaLeer);
      return (op.guardado || {})[n];
    },
    auditar: async (a) => { visto.auditado = a; },
    ahora: () => (op.ahora || 1000)
  };
  return {deps, visto};
}

module.exports = async ({bloque, ok}) => {
  C.olvidar();

  bloque('⚠️ Lo que entra NO se puede sacar');

  {
    /* LA REGLA CENTRAL. Si existiera una operacion de lectura, todo lo
       demas daria igual: bastaria pedirla desde la consola del navegador
       con la sesion del dueño abierta. No existe, y esta prueba es la que
       impide que aparezca un dia «para depurar». */
    const nombres = Object.keys(P.PERMITIDAS).concat(Object.keys(P.ORQUESTADAS));
    const lectoras = nombres.filter((n) =>
      /credencial|password|clave|secreto|secret/i.test(n) &&
      !/^guardar/i.test(n));
    ok(lectoras.length === 0,
       'NO hay ninguna operacion que lea credenciales — solo `guardar`. ' +
       'Sobran: ' + lectoras.join(', '));
    ok(P.ORQUESTADAS.guardarCredenciales === true,
       'y guardar es una orquestacion: el navegador manda los datos, pero ' +
       'quien decide que hacer con ellos es el servidor');
  }
  {
    const {deps, visto} = mundo();
    const r = await C.guardar(deps, BIEN);
    ok(r.ok === true, 'se guarda');
    ok(JSON.stringify(r).indexOf(BIEN.clave) < 0,
       '⚠️ y la RESPUESTA no lleva la clave — ni siquiera enmascarada: un ' +
       '«****» ya confirmaria su longitud');
    ok(r.usuario === BIEN.usuario,
       'el correo si vuelve: no es un secreto, y es lo que el panel pinta');
    ok(visto.escritos[C.NOMBRE_PASS] === BIEN.clave,
       'la clave llega entera a Secret Manager, sin recortar ni normalizar');
  }
  {
    /* La auditoria dice QUIEN y CUANDO. Guardar ahi el valor seria una
       segunda copia fuera de la caja fuerte — justo lo que se evita. */
    const {deps, visto} = mundo();
    await C.guardar(deps, BIEN);
    ok(visto.auditado && visto.auditado.usuario === BIEN.usuario,
       'se audita el correo y el momento');
    ok(JSON.stringify(visto.auditado).indexOf(BIEN.clave) < 0,
       'y NUNCA el valor: un registro con la contraseña dentro es una ' +
       'segunda copia fuera de Secret Manager');
  }
  {
    const {deps} = mundo({fallaEscribir: 'x'});
    const r = await C.guardar(deps, BIEN);
    ok(r.ok === false && JSON.stringify(r).indexOf(BIEN.clave) < 0,
       'tampoco se escapa por el camino del error');
  }

  bloque('Lo vacio se rechaza AQUI, no en Google');

  {
    /* Al dueño le paso con la terminal: pulso Enter sin escribir —el campo
       va enmascarado y no se ve nada— y Google contesto «Secret Payload
       cannot be empty». Un error de Google sobre un descuido suyo. */
    const {deps, visto} = mundo();
    const r = await C.guardar(deps, {usuario: '', clave: ''});
    ok(r.ok === false && r.motivo === 'SIN_DATO', 'vacio no se guarda');
    ok(r.faltan.length === 2, 'y se dice que faltan los DOS, no «hay error»');
    ok(Object.keys(visto.escritos).length === 0,
       'sin llegar a tocar Secret Manager: el aviso en nuestro idioma llega ' +
       'antes que el suyo');
  }
  {
    const r = C.faltantes({usuario: 'no-es-un-correo', clave: 'abcd'});
    ok(r.length === 1 && /correo/i.test(r[0]),
       'un correo sin arroba se avisa, y se dice cual es el bueno');
  }
  {
    const r = C.faltantes({usuario: 'a@b.com', clave: 'ab'});
    ok(r.length === 1 && /corta/i.test(r[0]),
       'y una clave de dos letras es casi siempre un dedo que resbalo — no ' +
       'se juzga su fuerza, que es cosa de ellos, solo que este entera');
  }
  {
    ok(C.faltantes(BIEN).length === 0, 'lo bueno pasa');
    ok(C.faltantes(null).length === 2, 'y nada tampoco revienta');
  }

  bloque('Sin permiso para escribir secretos: se dice el arreglo, no el error');

  {
    const {deps} = mundo({fallaEscribir: '7 PERMISSION_DENIED: nope'});
    const r = await C.guardar(deps, BIEN);
    ok(r.motivo === 'SIN_PERMISO_SECRETOS',
       'un PERMISSION_DENIED se reconoce');
    ok(/secretmanager\.admin/.test(r.detalle),
       'y se dice EL ROL que falta: el mensaje de Google no lo dice, y sin ' +
       'eso el dueño no sabe que pedir');
  }

  bloque('Leer: la cache no se come un cambio de cuenta');

  {
    C.olvidar();
    const g = {}; g[C.NOMBRE_USER] = 'a@b.com'; g[C.NOMBRE_PASS] = 'k1';
    const {deps, visto} = mundo({guardado: g});
    const r1 = await C.leer(deps);
    const r2 = await C.leer(deps);
    ok(r1 && r1.usuario === 'a@b.com', 'se lee');
    ok(r2 && visto.leidos === 2,
       'y la segunda sale de la cache: son dos lecturas de Secret Manager, ' +
       'no cuatro');
  }
  {
    /* ⚠️ GUARDAR TIENE QUE INVALIDAR LA CACHE. Sin esto, cambias de cuenta
       en el panel y el siguiente «Conectar» entraria con la ANTERIOR — en
       el negocio equivocado, que es el fallo que mas cuesta de esta
       integracion. */
    C.olvidar();
    const g = {}; g[C.NOMBRE_USER] = 'viejo@b.com';
    g[C.NOMBRE_PASS] = 'clave-vieja';
    const {deps} = mundo({guardado: g});
    await C.leer(deps);
    g[C.NOMBRE_USER] = 'nuevo@b.com';
    /* ⚠️ Con una clave de dos letras esto no guardaba —la rechaza la propia
       validacion— y la prueba fallaba por el fixture, no por el codigo. Se
       deja anotado: una prueba que usa datos invalidos prueba otra cosa. */
    const gu = await C.guardar(deps, {usuario: 'nuevo@b.com',
      clave: 'clave-nueva'});
    ok(gu.ok === true, 'el guardado de prueba usa datos validos de verdad');
    const r = await C.leer(deps);
    ok(r && r.usuario === 'nuevo@b.com',
       'tras guardar, lo leido es lo NUEVO — no la cuenta anterior');
  }
  {
    // Primer dia: los secretos no existen todavia. Eso no es un error.
    C.olvidar();
    const {deps} = mundo({fallaLeer: 'NOT_FOUND'});
    const r = await C.leer(deps);
    ok(r === null,
       'si todavia no hay credenciales se devuelve null, no se revienta: ' +
       'quien llame dira «guardalas en el panel»');
  }
  {
    C.olvidar();
    const g = {}; g[C.NOMBRE_USER] = 'a@b.com';   // sin la clave
    const {deps} = mundo({guardado: g});
    ok(await C.leer(deps) === null,
       'con solo la mitad tampoco: media credencial no sirve para entrar');
  }
  C.olvidar();
};
