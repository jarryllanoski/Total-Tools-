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

  bloque('⚠️ Leer SIEMPRE de Secret Manager — la cache mentia');

  {
    /* ⚠️ EL FALLO DEL 11/10/2026, Y POR QUE FUE DEL PEOR TIPO.
       El dueño guardo sus credenciales, el panel dijo «Guardada ✓», y al
       pulsar «Conectar» le contesto «faltan las credenciales». Dos
       pantallas contradiciendose, ambas sinceras.

       Habia una cache de 60 s que guardaba tambien el NEGATIVO, y `guardar`
       solo la limpiaba en LA INSTANCIA que atendio el guardado. Cloud
       Functions corre varias:

         1. pulsa Conectar antes de guardar → la instancia A cachea «no hay»
         2. guarda → lo atiende la instancia B, que si escribe
         3. pulsa Conectar → cae en A otra vez → «no hay» viejo

       Una cache cuya invalidacion no cruza de instancia no es una cache: es
       un dato viejo con fecha de caducidad. Y el negativo es el peor de los
       dos, porque la accion que lo vuelve falso —guardar— es justo la que
       el dueño acaba de hacer.

       Se quita entera. Estas pruebas la mantienen fuera. */
    const g = {};
    g[C.NOMBRE_USER] = 'a@b.com';
    g[C.NOMBRE_PASS] = 'clave-buena';
    const {deps, visto} = mundo({guardado: g});
    await C.leer(deps);
    await C.leer(deps);
    await C.leer(deps);
    ok(visto.leidos === 6,
       'tres lecturas son SEIS llamadas (dos secretos cada una): no se ' +
       'cachea nada. Es un boton que se aprieta a mano unas pocas veces al ' +
       'dia — ahorrar ahi no vale poder mentir');
  }
  {
    /* EL ESCENARIO EXACTO, reproducido: leer en vacio y guardar DESPUES.
       Con la cache, esta segunda lectura devolvia null. */
    const {deps} = mundo({guardado: {}});
    ok(await C.leer(deps) === null, 'al principio no hay nada');
    const g2 = {};
    g2[C.NOMBRE_USER] = 'nuevo@b.com';
    g2[C.NOMBRE_PASS] = 'clave-nueva';
    const d2 = mundo({guardado: g2}).deps;
    const r = await C.leer(d2);
    ok(r && r.usuario === 'nuevo@b.com',
       'y en cuanto hay, se ve — sin esperar a que caduque ningun minuto');
  }
  {
    // Primer dia: los secretos no existen todavia. Eso no es un error.
    const {deps} = mundo({fallaLeer: 'NOT_FOUND'});
    ok(await C.leer(deps) === null,
       'si todavia no hay credenciales se devuelve null, no se revienta: ' +
       'quien llame dira «guardalas en el panel»');
  }
  {
    const g = {};
    g[C.NOMBRE_USER] = 'a@b.com';   // sin la clave
    const {deps} = mundo({guardado: g});
    ok(await C.leer(deps) === null,
       'con solo la mitad tampoco: media credencial no sirve para entrar');
  }
};
