/**
 * tests/shalom-puerta.test.js — la puerta del servidor hacia Shalom
 * ==================================================================
 * `functions/shalomPuerta.js` es un módulo de Node normal, así que se prueba
 * directo: sin navegador, sin emulador y sin gastar una sola llamada del plan.
 *
 * Lo que se cuida aquí son las tres cosas que ya costaron caro una vez:
 *   · que la clave no salga NUNCA hacia el navegador, ni dentro de un error;
 *   · que solo se pueda pedir lo que está en la lista blanca;
 *   · que nunca se declare éxito sin dato real (el éxito falso ocultó días
 *     de fallo).
 */
'use strict';
const path = require('path');
const P = require(path.join(__dirname, '..', 'functions', 'shalomPuerta.js'));

/* Un `fetch` de mentira. Guarda con qué se le llamó y responde a voluntad. */
function conFetch(respuesta) {
  const visto = {llamadas: 0, url: null, opciones: null};
  const antes = global.fetch;
  global.fetch = async (url, opciones) => {
    visto.llamadas++; visto.url = url; visto.opciones = opciones;
    if (typeof respuesta === 'function') return respuesta();
    return respuesta;
  };
  visto.restaurar = () => { global.fetch = antes; };
  return visto;
}
const resp = (status, cuerpo) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo))
});

module.exports = async ({bloque, ok}) => {

  bloque('La clave no sale de aquí ni dentro de un error');

  ok(P.sanear('falló con sk_live_ABCdef123456 dentro') ===
     'falló con sk_*** dentro', 'una clave en un texto se tapa antes de salir');
  ok(P.sanear('dos: sk_aaaaaaaa y sk_bbbbbbbb').indexOf('sk_aaaa') < 0 &&
     P.sanear('dos: sk_aaaaaaaa y sk_bbbbbbbb').indexOf('sk_bbbb') < 0,
     'todas, no solo la primera');
  ok(P.sanear(null) === '' && P.sanear(undefined) === '',
     'y no revienta con lo que no es texto');
  ok(P.sanear('x'.repeat(5000)).length <= 300,
     'los textos larguísimos se recortan: un volcado entero no ayuda a nadie');

  {
    const f = conFetch(resp(403, {message: 'clave sk_live_SECRETA123 vencida'}));
    const r = await P.llamar('validate', 'sk_live_SECRETA123');
    f.restaurar();
    ok(r.detalle.indexOf('sk_live_SECRETA123') < 0,
       'si Shalom devolviera la clave en su mensaje de error, tampoco sale');
  }

  bloque('Solo se puede pedir lo de la lista blanca');

  {
    const f = conFetch(resp(200, {valid: true}));
    const r = await P.llamar('instances/logout', 'k');
    f.restaurar();
    ok(r.ok === false && r.motivo === 'NO_PERMITIDO', 'lo que no está, no se pide');
    ok(f.llamadas === 0, 'y ni siquiera se llama a Shalom: no es un proxy ciego');
  }
  ok(!P.PERMITIDAS['instances'] && !P.PERMITIDAS['webhooks'] &&
     !P.PERMITIDAS['tracking/subscriptions'],
     'ninguno de los endpoints destructivos está en la lista');
  ok(Object.keys(P.PERMITIDAS).join(',') === 'validate,track',
     'hoy hay dos, y en el orden en que se reconstruyen');
  ok(P.PERMITIDAS.track.soloMedir === true,
     'track está marcado soloMedir: se puede medir pero todavía no usar');
  ok(!P.PERMITIDAS.validate.soloMedir, 'validate sí está conectado del todo');

  bloque('Medible no es lo mismo que conectado');

  ok(P.traducir('validate', {valid: true, limit: 5, currentUsage: 1,
    remaining: 4}).ok === true, 'validate tiene traductor');
  ok(P.traducir('track', {lo: 'que sea'}).motivo === 'SIN_TRADUCTOR',
     'track NO: su JSON crudo no sale por la puerta de otro traductor');
  ok(P.traducir('inventado', {}).motivo === 'SIN_TRADUCTOR',
     'ni ningún otro que no lo tenga');

  {
    const f = conFetch(resp(200, {valid: true}));
    const r = await P.llamar('validate', '');
    f.restaurar();
    ok(r.ok === false && r.motivo === 'BLOQUEADO', 'sin clave no se intenta');
    ok(f.llamadas === 0, 'tampoco se gasta una llamada del plan');
  }

  bloque('Cómo se pide');

  {
    const f = conFetch(resp(200, {valid: true}));
    await P.llamar('validate', 'sk_x');
    f.restaurar();
    ok(f.url === 'https://api.shalom-api.lat/validate', 'la URL es la documentada');
    ok(f.opciones.method === 'GET', 'y el método');
    ok(f.opciones.headers['x-api-key'] === 'sk_x',
       'la clave viaja en x-api-key, no en la URL: una URL queda en los registros');
    ok(!!f.opciones.signal, 'con corte por tiempo: Shalom colgado no cuelga la función');
  }

  {
    const f = conFetch(resp(200, {search: {}, statuses: {}}));
    await P.llamar('track', 'sk_x', {orderNumber: '82037653', orderCode: 'TT9C'});
    f.restaurar();
    ok(f.url === 'https://api.shalom-api.lat/track', 'track va a su propia ruta');
    ok(f.opciones.method === 'POST', 'y es POST, no GET');
    ok(f.opciones.headers['Content-Type'] === 'application/json',
       'con su Content-Type: sin él, Shalom no lee el cuerpo');
    ok(JSON.parse(f.opciones.body).orderNumber === '82037653',
       'y los datos viajan en el cuerpo');
  }

  bloque('Cada fallo de Shalom con su nombre');

  const motivoDe = async (status) => {
    const f = conFetch(resp(status, {message: 'no'}));
    const r = await P.llamar('validate', 'k');
    f.restaurar();
    return r.motivo;
  };
  ok(await motivoDe(401) === 'BLOQUEADO', '401 es la clave, no un error suyo');
  ok(await motivoDe(403) === 'BLOQUEADO', '403 también');
  ok(await motivoDe(429) === 'LIMITE', '429 es cuota agotada, no clave inválida');
  ok(await motivoDe(404) === 'NO_ENCONTRADO', '404 es el dato');
  ok(await motivoDe(500) === 'ERROR_SHALOM', '500 es un tropiezo suyo');
  ok(await motivoDe(503) === 'ERROR_SHALOM', '503 también');

  {
    const f = conFetch(() => { throw Object.assign(new Error('down'), {name: 'x'}); });
    const r = await P.llamar('validate', 'k');
    f.restaurar();
    ok(r.motivo === 'SIN_RED', 'sin red es del panel, no de Shalom');
  }
  {
    const f = conFetch(() => {
      throw Object.assign(new Error('t'), {name: 'TimeoutError'});
    });
    const r = await P.llamar('validate', 'k');
    f.restaurar();
    ok(r.motivo === 'ERROR_SHALOM', 'un corte por tiempo sí es de Shalom');
  }
  {
    const f = conFetch(resp(200, '<html>error</html>'));
    const r = await P.llamar('validate', 'k');
    f.restaurar();
    ok(r.ok === false && r.motivo === 'FORMATO_DESCONOCIDO',
       'un 200 que no es JSON no es un éxito');
  }

  bloque('Las cuatro barreras, y en ese orden');

  const ADMINS = ['admin@totaltools.com'];
  // Si el corte no llega, la prueba tiene que FALLAR diciéndolo, no reventar
  // y llevarse por delante las que vienen detrás.
  const motivo = (r) => (r && r.corte ? r.corte.motivo : 'NO CORTÓ');
  const http = (r) => (r && r.corte ? r.corte.http : 0);

  const pasar = (op) => {
    op = op || {};
    const visto = {verificaciones: 0};
    return P.barreras({
      metodo: op.metodo || 'POST',
      authorization: 'token' in op ? op.token : 'Bearer T',
      cuerpo: op.cuerpo || {op: 'validate'}
    }, {
      admins: op.admins || ADMINS,
      verificar: async (t) => {
        visto.verificaciones++;
        if (op.tokenMalo) throw new Error('invalido');
        return {email: 'correo' in op ? op.correo : 'admin@totaltools.com'};
      }
    }).then((r) => Object.assign(r, {visto: visto}));
  };

  ok(http(await pasar({metodo: 'GET'})) === 405, 'GET no entra');
  ok(motivo(await pasar({token: null})) === 'SIN_SESION',
     'sin cabecera de sesión: SIN_SESION');
  ok(motivo(await pasar({token: 'Basic abc'})) === 'SIN_SESION',
     'una cabecera que no es Bearer tampoco vale');
  ok(http(await pasar({tokenMalo: true})) === 401,
     'un token que no verifica: 401');
  ok(motivo(await pasar({correo: 'otro@gmail.com'})) === 'SIN_PERMISO',
     'con sesión pero fuera de la lista de admins: SIN_PERMISO');
  ok(motivo(await pasar({correo: ''})) === 'SIN_PERMISO',
     'un token sin correo tampoco pasa');
  ok((await pasar({correo: 'ADMIN@TotalTools.com'})).ok === true,
     'el correo no distingue mayúsculas: nadie se bloquea a sí mismo por eso');
  ok((await pasar({admins: ['ADMIN@TOTALTOOLS.COM']})).ok === true,
     'la lista tampoco');

  {
    // EL ORDEN IMPORTA. Sin sesión, la respuesta es SIN_SESION — nunca
    // NO_PERMITIDO: eso último le confirmaría a un desconocido qué
    // operaciones existen y cuáles no.
    const r = await pasar({token: null, cuerpo: {op: 'instances/logout'}});
    ok(motivo(r) === 'SIN_SESION', 'sin sesión no se llega a mirar la operación');
    ok(r.visto.verificaciones === 0, 'y sin Bearer ni se intenta verificar nada');
  }
  {
    const r = await pasar({correo: 'otro@gmail.com', cuerpo: {op: 'validate'}});
    ok(motivo(r) === 'SIN_PERMISO' && !r.destino,
       'un no-admin no obtiene destino: la clave no se acerca a él');
  }

  {
    // El caso que distingue el orden de la barrera 2 y la 3. Si la lista
    // blanca se mirara primero, a un desconocido se le respondería
    // NO_PERMITIDO — y eso le confirma qué operaciones existen y cuáles no.
    // Un no-admin siempre se topa con SIN_PERMISO, diga lo que diga.
    const r = await pasar({correo: 'otro@gmail.com',
      cuerpo: {op: 'instances/logout'}});
    ok(motivo(r) === 'SIN_PERMISO',
       'a un no-admin no se le dice si la operación existe: siempre SIN_PERMISO');
  }
  {
    const r = await pasar({correo: 'otro@gmail.com', cuerpo: {op: 'inventada'}});
    ok(motivo(r) === 'SIN_PERMISO',
       'ni con una operación inventada: la lista blanca no se filtra por ahí');
  }

  ok(motivo(await pasar({cuerpo: {op: 'instances/logout'}})) === 'NO_PERMITIDO',
     'ni siendo admin se puede pedir algo fuera de la lista');
  ok(motivo(await pasar({cuerpo: {op: ''}})) === 'NO_PERMITIDO',
     'una operación vacía tampoco');
  ok(motivo(await pasar({cuerpo: {op: 'toString'}})) === 'NO_PERMITIDO',
     'ni un nombre heredado de Object: la lista se consulta con hasOwnProperty');

  {
    const r = await pasar({cuerpo: {op: 'validate'}});
    ok(r.ok === true && r.destino === 'validate' && r.diagnostico === false,
       'admin + operación de la lista: pasa');
  }
  ok(motivo(await pasar({cuerpo: {op: 'track'}})) === 'SIN_TRADUCTOR',
     'pedir track como operación normal se corta: aún no está traducido');
  {
    const r = await pasar({cuerpo: {op: 'esquema', de: 'track'}});
    ok(r.ok === true && r.destino === 'track',
       'pero medirlo sí se puede: es como se averigua su forma');
  }
  {
    const r = await pasar({cuerpo: {op: 'esquema', de: 'validate'}});
    ok(r.ok === true && r.destino === 'validate' && r.diagnostico === true,
       'el diagnóstico pasa por la misma lista blanca');
  }
  ok(motivo(await pasar({cuerpo: {op: 'esquema', de: 'instances'}})) ===
     'NO_PERMITIDO',
     'y no sirve para asomarse a un endpoint que no está permitido');

  bloque('Traducir /validate — jamás ok:true sin dato real');

  const tv = P.traducirValidate;
  ok(tv({valid: true, limit: 1000, currentUsage: 137, remaining: 863}).ok === true,
     'la respuesta documentada se traduce');
  ok(tv({valid: true, limit: 1000, currentUsage: 137, remaining: 863}).restante === 863,
     'y trae el consumo');
  ok(tv({valid: false}).ok === false && tv({valid: false}).motivo === 'BLOQUEADO',
     'una clave rechazada es BLOQUEADO, no un éxito con valida:false');
  ok(tv({}).motivo === 'FORMATO_DESCONOCIDO', 'sin `valid` no sabemos qué nos dijeron');
  ok(tv({valid: 'true'}).motivo === 'FORMATO_DESCONOCIDO',
     'un "true" de texto tampoco: parece verdadero y no lo es');
  ok(tv(null).motivo === 'FORMATO_DESCONOCIDO' &&
     tv([]).motivo === 'FORMATO_DESCONOCIDO', 'ni null ni un array');

  {
    // Contradicción 5 de docs/SHALOM-API.md: la doc muestra limit:1000, pero
    // con plan ilimitado llega null. Convertirlo a 0 diría justo lo contrario.
    const r = tv({valid: true, limit: null, currentUsage: 137, remaining: null});
    ok(r.ok === true && r.limite === null && r.ilimitado === true,
       'limit:null es PLAN ILIMITADO, y se dice con una bandera aparte');
    ok(r.limite !== 0, 'nunca se traduce a 0, que se leería como "sin cuota"');
    ok(r.usado === 137, 'y el consumo se conserva igual');
  }

  {
    // LA FORMA REAL, medida contra la API el 13 sep 2026. Son SEIS campos, no
    // los cuatro de la documentación: userId y message no aparecen en ella.
    const real = {valid: true, userId: 'u_123', limit: null,
      currentUsage: 0, remaining: null, message: 'API key válida'};
    const r = tv(real);
    ok(r.ok === true, 'la respuesta REAL de la API se traduce');
    ok(r.mensaje === 'API key válida',
       'se devuelve lo que Shalom dice de la clave: sus palabras antes que las mías');
    ok(!('userId' in r),
       'userId NO viaja al navegador: ninguna pantalla lo necesita');
    ok(r.usado === 0 && r.ilimitado === true, 'y el resto sale bien');
  }
  ok(tv({valid: true, campoNuevo: 1, limit: 5, currentUsage: 1,
    remaining: 4}).ok === true,
     'un campo que Shalom añada mañana no rompe nada: lo desconocido se ignora');
  ok(tv({valid: true, limit: 5, currentUsage: 1, remaining: 4}).mensaje === null,
     'y si no manda message, se dice null en vez de inventar un texto');

  bloque('El esquema describe la forma, sin un solo valor');

  {
    const f = P.forma({valid: true, limit: null, nombre: 'Jarry',
      lista: [{guia: '94578959', costo: 12.5}]});
    const texto = JSON.stringify(f);
    ok(texto.indexOf('Jarry') < 0 && texto.indexOf('94578959') < 0,
       'ni un nombre ni una guía aparecen en el esquema');
    ok(f.valid === 'boolean' && f.limit === 'null' && f.nombre === 'string',
       'sí los tipos');
    ok(String(f.lista).indexOf('array[1]') === 0, 'y cuántos elementos hay');
  }
  {
    // Baja lo suficiente: con el corte anterior (4), la rama
    // `statuses.data.entregado.cliente` de /track salía como "objeto" a secas
    // — y ahí es donde vive quién recibió el paquete.
    const hondo = {statuses: {data: {entregado: {cliente: {nombre: 'x',
      documento: '123'}}}}};
    const f = JSON.stringify(P.forma(hondo));
    ok(f.indexOf('nombre') > 0 && f.indexOf('documento') > 0,
       'llega hasta statuses.data.entregado.cliente, que es donde hacía falta');
    ok(f.indexOf('123') < 0 && f.indexOf('"x"') < 0, 'y sigue sin traer valores');
  }
  ok(JSON.stringify(P.forma({a: {b: {c: {d: {e: {f: {g: {h: {i: 1}}}}}}}}}))
      .indexOf('objeto') > 0, 'pero tiene fondo: no se hunde para siempre');
};
