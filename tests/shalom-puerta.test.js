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
const E = require('./_entorno.js');
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
  /* Lo que hay que vigilar NO es el nombre, es el MÉTODO. `GET /instances`
     solo lista; `DELETE /instances` borra la instancia y mata el auto-login.
     Son la misma palabra y cosas opuestas: una lista de nombres prohibidos
     habría dejado pasar el peligroso o —como pasó— bloqueado el inofensivo. */
  {
    const claves = Object.keys(P.PERMITIDAS);
    const metodos = claves.map((k) => P.PERMITIDAS[k].metodo);
    const rutas = claves.map((k) => P.PERMITIDAS[k].ruta);
    ok(metodos.every((m) => m === 'GET' || m === 'POST'),
       'ni un DELETE ni un PUT en la lista: la puerta no puede borrar nada, ' +
       'y eso no depende de acordarse de un nombre');
    ok(rutas.every((r) => !/logout|login|subscriptions|webhooks/i.test(r)),
       'ni cerrar sesión, ni entrar, ni tocar webhooks o suscripciones');
    ok(!P.PERMITIDAS['instances/logout'] && !P.PERMITIDAS['webhooks'] &&
       !P.PERMITIDAS['tracking/subscriptions'],
       'y los destructivos siguen fuera por su nombre también');
  }
  ok(Object.keys(P.PERMITIDAS).join(',') ===
     'validate,track,instances,agencies',
     'hoy hay cuatro, y en el orden en que se reconstruyen');
  ok(!P.PERMITIDAS.track.soloMedir,
     'track ya no es solo medible: su forma se midió y se tradujo');
  ok(P.PERMITIDAS.instances.metodo === 'GET' &&
     P.PERMITIDAS.instances.ruta === '/instances',
     'instances entra SOLO como GET');
  ok(!P.PERMITIDAS.instances.soloMedir,
     'y ya no es solo medible: su forma se midió contra la API real el ' +
     '22/09/2026 y se tradujo');

  {
    /* El catálogo de agencias va por la variante PÚBLICA: misma estructura y
       NO CONSUME CUOTA, así que refrescarlo sale gratis. Y a un endpoint
       público no se le manda la clave — una credencial no viaja donde no
       hace falta, ni siquiera a un sitio de confianza. */
    const a = P.PERMITIDAS.agencies;
    ok(a.ruta === '/public/agencies',
       'agencias va por la ruta pública: no consume cuota');
    ok(a.publico === true, 'y marcada como pública');
    ok(!a.soloMedir,
       'y ya no es solo medible: su forma se midió el 24/09/2026 y se tradujo');

    const f = conFetch(resp(200, {data: []}));
    await P.llamar('agencies', 'sk_la_clave_secreta');
    const cab = (f.opciones && f.opciones.headers) || {};
    f.restaurar();
    ok(cab['x-api-key'] === undefined,
       'y la clave NO viaja en la petición, aunque la puerta la tenga');

    const f2 = conFetch(resp(200, {data: []}));
    const r2 = await P.llamar('agencies', '');
    f2.restaurar();
    ok(r2.ok === true,
       'y sin clave configurada igual se puede consultar: un endpoint público ' +
       'no se bloquea por una credencial que no necesita');

    const f3 = conFetch(resp(200, {valid: true}));
    await P.llamar('validate', 'sk_la_clave_secreta');
    const cab3 = (f3.opciones && f3.opciones.headers) || {};
    f3.restaurar();
    ok(cab3['x-api-key'] === 'sk_la_clave_secreta',
       'pero a los que SÍ la necesitan se les sigue mandando');
  }

  bloque('Cada endpoint por su traductor, nunca por el de otro');

  ok(P.traducir('validate', {valid: true, limit: 5, currentUsage: 1,
    remaining: 4}).ok === true, 'validate por el suyo');
  ok(P.traducir('track', {statuses: {data: {origen: {fecha: 'x'}}}}).estado ===
     'En origen', 'track por el suyo');
  ok(P.traducir('inventado', {}).motivo === 'SIN_TRADUCTOR',
     'y uno sin traductor no devuelve su JSON crudo: eso es como una forma mal ' +
     'entendida llega a la pantalla haciéndose pasar por un dato bueno');

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

  const ADMINS = ['jarryllanoski@gmail.com', 'redbolima@gmail.com'];
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
      legado: op.legado,
      verificar: async (t) => {
        visto.verificaciones++;
        if (op.tokenMalo) throw new Error('invalido');
        return {
          email: 'correo' in op ? op.correo : 'jarryllanoski@gmail.com',
          // Google siempre verifica. Un registro con contraseña, no.
          email_verified: op.verificado === undefined ? true : op.verificado
        };
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
  ok((await pasar({correo: 'JARRYLlanoski@Gmail.com'})).ok === true,
     'el correo no distingue mayúsculas: nadie se bloquea a sí mismo por eso');
  ok((await pasar({admins: ['JARRYLLANOSKI@GMAIL.COM']})).ok === true,
     'la lista tampoco');

  {
    /* ⚠️ LA PROPIEDAD MÁS IMPORTANTE DE TODO ESTE ARCHIVO.
       Firebase deja que cualquiera cree una cuenta con CUALQUIER correo sin
       comprobar que sea suyo. Si el correo valiera por sí solo, alguien que
       sepa el del dueño se registra con él, pone su propia contraseña, y
       entra. Sin hackear nada. `email_verified` solo llega en true cuando el
       proveedor confirmó la identidad — Google siempre lo hace; un registro
       con contraseña, nunca. */
    const r = await pasar({correo: 'jarryllanoski@gmail.com', verificado: false});
    ok(motivo(r) === 'SIN_PERMISO',
       'un correo de la lista SIN VERIFICAR no entra: registrarse con el ' +
       'correo de otro no puede ser una forma de entrar');
    ok(P.esAdminDe({email: 'jarryllanoski@gmail.com'}, ADMINS) === false,
       'ni cuando el token no trae el dato: ausente se trata como no verificado');
    ok(P.esAdminDe({email: 'jarryllanoski@gmail.com', email_verified: 'true'},
        ADMINS) === false, 'ni con un "true" de texto, que parece verdadero');
    ok(P.esAdminDe({email: 'jarryllanoski@gmail.com', email_verified: true},
        ADMINS) === true, 'verificado y en la lista: pasa');
  }
  {
    /* NO HAY EXCEPCIONES, y esto se prueba a propósito.
       Hubo una —admin@totaltools.com, creada a mano desde la consola, sin
       correo verificado— y se retiró el 20 sep 2026 junto con la cuenta. Una
       contraseña de un buzón que no existe no se puede cambiar ni recuperar:
       no era una llave de emergencia, era una llave perdida esperando a que
       alguien la encontrara. */
    ok(P.esAdminDe({email: 'admin@totaltools.com', email_verified: false},
        ADMINS) === false, 'la cuenta vieja ya no entra');
    ok(P.esAdminDe({email: 'admin@totaltools.com', email_verified: true},
        ADMINS) === false, 'ni aunque llegara verificada: no está en la lista');
    ok(P.esAdminDe.length === 2,
       'y la función ya no acepta un tercer parámetro de excepción: quitar la ' +
       'puerta es quitarla, no dejarla desactivada esperando');
    const idx = E.leer('functions/index.js');
    ok(idx.indexOf('admin@totaltools.com') < 0,
       'el correo viejo no aparece en ningún sitio del backend');
    const reglas = E.leer('firestore.rules');
    const activo = reglas.split('\n').filter((l) => l.indexOf('//') < 0).join('\n');
    ok(activo.indexOf('admin@totaltools.com') < 0,
       'ni en las reglas — solo en el comentario que explica por qué se fue');
    ok(/email_verified == true/.test(activo),
       'y las reglas siguen exigiendo el correo verificado');
  }

  ok(P.esAdminDe(null, ADMINS) === false && P.esAdminDe({}, ADMINS) === false,
     'sin usuario o sin correo, no');

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
  {
    const r = await pasar({cuerpo: {op: 'track'}});
    ok(r.ok === true && r.destino === 'track', 'track ya pasa como operación normal');
  }
  {
    const r = await pasar({cuerpo: {op: 'esquema', de: 'validate'}});
    ok(r.ok === true && r.destino === 'validate' && r.diagnostico === true,
       'el diagnóstico pasa por la misma lista blanca');
  }
  ok(motivo(await pasar({cuerpo: {op: 'esquema', de: 'instances/logout'}})) ===
     'NO_PERMITIDO',
     'y no sirve para asomarse a un endpoint que no está permitido');
  {
    const r = await pasar({cuerpo: {op: 'instances'}});
    ok(r.ok === true && r.destino === 'instances',
       'instances ya pasa como operación normal');
    const d = await pasar({cuerpo: {op: 'esquema', de: 'instances'}});
    ok(d.ok === true && d.diagnostico === true,
       'y se le puede seguir mirando la forma, por si Shalom la cambia');
  }
  {
    /* La guarda de `soloMedir` no se prueba con un endpoint ya conectado: se
       prueba con uno que lo esté de verdad, o deja de probarse el día que
       todos se conecten. Se monta uno de mentira. */
    const falso = {metodo: 'GET', ruta: '/nada', soloMedir: true};
    P.PERMITIDAS.__prueba = falso;
    ok(motivo(await pasar({cuerpo: {op: '__prueba'}})) === 'SIN_TRADUCTOR',
       'un endpoint en `soloMedir` NO se puede usar: sin traductor devolvería ' +
       'su JSON crudo por la puerta de otro, que es justo cómo una forma mal ' +
       'entendida llega a la pantalla como si fuera un dato bueno');
    const d = await pasar({cuerpo: {op: 'esquema', de: '__prueba'}});
    ok(d.ok === true && d.diagnostico === true,
       '…pero MIRARLE la forma sí: medir antes de traducir, siempre');
    delete P.PERMITIDAS.__prueba;
  }

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

  bloque('Traducir /track — el árbol de 7 ramas');

  const tt = P.traducirTrack;
  // La forma REAL, tal como la midió `esquema` contra la API el 13 sep 2026.
  const arbolReal = (extra) => ({statuses: {success: true, message: 'ok',
    data: Object.assign({
      registrado: {fecha: '2026-09-05 10:00'},
      origen: {fecha: '2026-09-05 12:00'},
      transito: {fecha: '2026-09-06 08:00', carguero: 'X', completo: true,
        cargueros: ['a', 'b']},
      destino: {fecha: '2026-09-07 09:00'},
      reparto: null,
      entregado: {fecha: '2026-09-08 15:30', completo: true,
        cliente: {nombre: 'Ana', documento: '12345678'}},
      demora: null
    }, extra || {})}});

  {
    const r = tt(arbolReal());
    ok(r.ok === true && r.estado === 'Entregado' && r.pasos === 3,
       'gana el paso más avanzado que tenga fecha');
    ok(r.fecha === '2026-09-08 15:30',
       'la fecha se devuelve TAL CUAL: parsear un formato sin medir es como se ' +
       'ordenan mal los historiales');
    ok(r.recibio && r.recibio.nombre === 'Ana' && r.recibio.documento === '12345678',
       'y quién recibió el paquete, que es lo que le dices al cliente que reclama');
    ok(Object.keys(r.arbol).length === 5,
       'el árbol completo queda para el historial, sin las ramas que no pasaron');
  }

  {
    // LA PRUEBA QUE EXISTE POR EL BUG MÁS CARO DE ESTE PROYECTO.
    // Un paquete ENTREGADO se mostraba como "Demora de envíos": el envío
    // desandaba el camino y había que explicárselo al cliente.
    const r = tt(arbolReal({demora: {fecha: '2026-09-06 20:00'}}));
    ok(r.estado === 'Entregado',
       'con demora Y entregado, el estado sigue siendo Entregado');
    ok(r.demora && r.demora.fecha === '2026-09-06 20:00',
       'la demora no se pierde: viaja aparte, como bandera');
    ok(P.PASOS.every((p) => p.clave !== 'demora'),
       'y demora NO está en la lista de pasos — no es que el bug esté ' +
       'arreglado, es que no se puede escribir');
  }
  {
    const r = tt(arbolReal({entregado: null, destino: null, reparto: null,
      demora: {fecha: '2026-09-06 20:00'}}));
    ok(r.estado === 'En tránsito' && r.pasos === 1,
       'sin entregar, la demora tampoco reemplaza al paso real');
    ok(r.demora !== null, 'pero se avisa igual');
  }

  {
    const r = tt(arbolReal({entregado: null, reparto: {fecha: '2026-09-08 08:00'}}));
    ok(r.estado === 'En reparto' && r.pasos === 2,
       'reparto va DESPUÉS de destino aunque compartan paso: manda el orden, ' +
       'no el número');
  }
  {
    const r = tt(arbolReal({entregado: null, reparto: null}));
    ok(r.estado === 'En destino', 'sin reparto se queda en destino');
  }
  {
    const r = tt({statuses: {success: true, data: {registrado: {fecha: 'x'},
      origen: null, transito: null, destino: null, reparto: null,
      entregado: null, demora: null}}});
    ok(r.estado === 'En origen' && r.pasos === 0, 'una guía recién registrada');
  }

  bloque('/track — jamás ok:true sin dato real');

  ok(tt({statuses: {success: true, data: {registrado: null, origen: null,
    transito: null, destino: null, reparto: null, entregado: null,
    demora: null}}}).motivo === 'SIN_DATO',
     'el árbol entero en null no es un éxito: es una guía que Shalom no registró');
  ok(tt({statuses: {success: true, data: {origen: {fecha: '   '}}}}).motivo ===
     'SIN_DATO', 'una fecha en blanco tampoco cuenta como paso');
  ok(tt({statuses: {success: false, message: 'no existe'}}).motivo ===
     'NO_ENCONTRADO', 'success:false es una guía que no existe');
  {
    /* LA FORMA REAL de una guía sin seguimiento, medida con 94578959 (un
       retorno a origen): statuses viene null y search solo trae message y
       success, sin data. */
    const r = tt({search: {message: 'No se encontró información', success: false},
      statuses: null});
    ok(r.motivo === 'NO_ENCONTRADO',
       'statuses:null es "no tengo seguimiento de esa guía", no una respuesta rara');
    ok(r.motivo !== 'FORMATO_DESCONOCIDO',
       'y la diferencia importa: uno manda a revisar la guía, el otro la integración');
    ok(r.detalle === 'No se encontró información',
       'con lo que dijo Shalom, que es lo que le explicas al cliente');
    ok(r.ok === false, 'y sin estado: nada que escribir encima de lo que ya había');
  }
  ok(tt({search: {message: 'x', success: false}}).motivo === 'NO_ENCONTRADO',
     'igual si statuses ni siquiera viene');
  ok(tt({statuses: {success: true, data: null, message: 'sin datos'}}).motivo ===
     'NO_ENCONTRADO', 'y si falta el árbol un nivel más abajo');
  ok(tt({statuses: 'raro'}).motivo === 'FORMATO_DESCONOCIDO',
     'pero un statuses que es TEXTO sí es no entender la respuesta');
  ok(tt({statuses: {success: true, data: 'raro'}}).motivo === 'FORMATO_DESCONOCIDO',
     'y un árbol que es texto también');
  ok(tt({}).motivo === 'FORMATO_DESCONOCIDO',
     'un cuerpo vacío no dice "no encontrado": no dice nada, y afirmarlo sería inventar');
  ok(tt({statuses: [{}]}).motivo === 'FORMATO_DESCONOCIDO',
     'y si llegara como ARRAY —que es lo que dice la documentación— tampoco: ' +
     'lo medido es un objeto, y aceptar las dos formas es adivinar');
  ok(tt(null).motivo === 'FORMATO_DESCONOCIDO', 'ni con null');
  {
    const r = tt(arbolReal({entregado: {fecha: '2026-09-08 15:30'}}));
    ok(r.ok === true && r.recibio === null,
       'entregado sin datos del cliente: se entregó, pero no se inventa quién');
  }
  {
    const r = tt(arbolReal({entregado: null}));
    ok(r.recibio === null, 'y si no se entregó, no hay quién recibió');
  }

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
  {
    // El formato de fecha decide si se puede ordenar y mostrar bien, y no está
    // documentado. Se destapa la FORMA tapando los dígitos — sin pedir un
    // valor real, o sea sin que un dato de un cliente pase por el chat.
    const f = P.forma({fecha: '2026-09-08 15:30', nombre: 'Ana Perez',
      monto: '45.50', guia: '82037653', cod: 'TT9C',
      direccion: 'Av. Bayovar 311'});
    ok(f.fecha === 'string(####-##-## ##:##)', 'una fecha revela su formato');
    ok(f.monto === 'string(##.##)', 'y un monto también');
    ok(f.nombre === 'string' && f.direccion === 'string',
       'pero un nombre o una dirección NO: cualquier texto con letras sale a secas');
    ok(f.cod === 'string', 'ni un código que empieza por letra');
    ok(JSON.stringify(f).indexOf('Ana') < 0 &&
       JSON.stringify(f).indexOf('Bayovar') < 0, 'no se escapa ni una palabra');
  }
  ok(P.forma({x: '1'.repeat(60)}).x === 'string',
     'un texto larguísimo de puros dígitos no se destapa: no es una fecha');

  ok(JSON.stringify(P.forma({a: {b: {c: {d: {e: {f: {g: {h: {i: 1}}}}}}}}}))
      .indexOf('objeto') > 0, 'pero tiene fondo: no se hunde para siempre');

  bloque('Traducir GET /instances — "encendida" no es "con sesión"');

  {
    /* FORMA REAL, medida el 22/09/2026 contra la API desplegada. La
       documentación la pinta PLANA; viene envuelta en `instances`. Una vez
       más la doc y la realidad no coincidieron — la séptima. */
    const real = {instances: [{
      id: '3524c6ef-99ad-4988-b62d-8f85d000aaaa',
      name: 'Jarlyn Total',
      username: 'cuenta@ejemplo.com',
      createdAt: '2026-08-30T14:02:11.000Z',
      isLoggedIn: true
    }]};
    const ti = P.traducirInstancias;

    {
      const r = ti(real);
      ok(r.ok === true && r.sesion.conocido === true,
         'la forma medida se traduce');
      ok(r.sesion.conectada === true, 'y dice que la sesión está viva');
      ok(r.sesion.usuario === 'cuenta@ejemplo.com',
         'con qué cuenta está dentro');
      ok(r.sesion.id === '3524c6ef-99ad-4988-b62d-8f85d000aaaa',
         'y el instanceId, que es la llave que van a necesitar el ticket y el ' +
         'registro de envíos');
      ok(r.sesion.url === null,
         'la url va en null: este endpoint NO la da (solo el POST /status), y ' +
         'el panel prefiere no pintar el enlace antes que inventarse una ' +
         'dirección');
    }

    {
      const fuera = JSON.parse(JSON.stringify(real));
      fuera.instances[0].isLoggedIn = false;
      fuera.instances[0].username = null;
      const r = ti(fuera);
      ok(r.ok === true && r.sesion.conectada === false,
         'y cuando la cuenta se deslogueó, lo dice');
      ok(r.sesion.usuario === null, 'sin inventar un nombre de cuenta');
    }

    /* EL ERROR CARO DE ESTE ENDPOINT. La pantalla de Instancias de Shalom
       puede decir "Conectado" —el robot corre— mientras `isLoggedIn` es
       false: corre, pero parado en el login. Registrar envíos así falla, y
       falla sin decir por qué. */
    {
      const trampa = {instances: [{id: 'x', name: 'n', username: null,
        createdAt: '2026-08-30T14:02:11.000Z', isLoggedIn: false,
        status: 'CONNECTED', estado: 'Conectado'}]};
      ok(ti(trampa).sesion.conectada === false,
         'un "Conectado" en cualquier otro campo NO cuenta: lo único que ' +
         'decide si un registro va a funcionar es isLoggedIn');
    }

    bloque('…y jamás afirma nada que no haya medido');

    ok(ti(null).motivo === 'FORMATO_DESCONOCIDO', 'sin respuesta, no se afirma');
    ok(ti('hola').motivo === 'FORMATO_DESCONOCIDO', 'un texto tampoco');
    ok(ti([]).motivo === 'FORMATO_DESCONOCIDO',
       'ni un array suelto: la forma medida es un objeto con `instances` dentro');
    ok(ti({}).motivo === 'FORMATO_DESCONOCIDO', 'ni un objeto vacío');
    ok(ti({instances: 'nada'}).motivo === 'FORMATO_DESCONOCIDO',
       'si `instances` deja de ser una lista, no se entiende y se dice');
    ok(ti({instances: [{id: 'x', isLoggedIn: 'true'}]}).motivo ===
       'FORMATO_DESCONOCIDO',
       'un "true" de TEXTO no es un booleano. Sin esta línea, el día que ' +
       'Shalom mande la cadena "false" el panel diría "conectada" —porque un ' +
       'texto no vacío es verdadero— y los registros fallarían en fila');
    ok(ti({instances: [{id: 'x'}]}).motivo === 'FORMATO_DESCONOCIDO',
       'si falta isLoggedIn, no hay nada que afirmar');
    ok(ti({instances: [null]}).motivo === 'FORMATO_DESCONOCIDO',
       'ni con un hueco en la lista');
    ok(ti(real).ok === true && ti({instances: [Object.assign(
        {campoNuevo: 1}, real.instances[0])]}).ok === true,
       'y un campo nuevo que Shalom añada mañana no lo rompe: lo que no se ' +
       'reconoce se ignora');

    bloque('Cero instancias y varias no son "la sesión está caída"');

    ok(ti({instances: []}).motivo === 'SIN_INSTANCIA',
       'sin ninguna cuenta de Shalom Pro no hay sesión que consultar, y eso ' +
       'NO es lo mismo que una sesión caída: se arregla creando la instancia');
    ok(ti({instances: []}).ok === false, 'y no se afirma nada');
    {
      const dos = {instances: [real.instances[0],
        Object.assign({}, real.instances[0], {id: 'y', isLoggedIn: false})]};
      ok(ti(dos).motivo === 'VARIAS_INSTANCIAS',
         'con dos instancias no se elige la primera: si una está dentro y la ' +
         'otra fuera, afirmar por la primera es una mentira que se paga con ' +
         'un lote entero de registros fallidos');
      ok(ti(dos).ok === false, 'adivinar cuál usa el panel no es una opción');
    }
    ok(P.traducir('instances', real).sesion.conectada === true,
       'y el despachador manda instances a SU traductor');
  }

  bloque('Los motivos nuevos tienen palabras en el panel');
  {
    /* Un motivo sin traducción sale como código en la pantalla, y
       "VARIAS_INSTANCIAS" no le dice nada a nadie. */
    const html = E.leer('index.html');
    ok(/SIN_INSTANCIA:'[^']+'/.test(html), 'SIN_INSTANCIA se explica');
    ok(/VARIAS_INSTANCIAS:'[^']+'/.test(html), 'VARIAS_INSTANCIAS también');
  }

  bloque('Traducir GET /public/agencies — el catálogo, sin sorpresas');

  {
    /* FORMA REAL, medida el 24/09/2026 contra la API desplegada: 34 campos
       por agencia, NO los 48 que la documentación promete para `/agencies`.
       Faltan `hora_domingo` y `referencia` — contradicción nº 8. Se comprobó
       que no las usa nadie antes de aceptar la pérdida. */
    const cruda = {
      success: true, message: 'ok', total: 2, query: null,
      data: [
        {ter_id: 3, ter_abrebiatura: 'CHA', zona: 'CHACHAPOYAS',
          ter_zona: 'CHACHAPOYAS', provincia: 'CHACHAPOYAS',
          departamento: 'AMAZONAS', lugar: null,
          latitud: '-6.238673', longitud: '-77.868008', sp: '1',
          direccion: 'JR. DOS DE MAYO CDRA. 15 S/N',
          telefono: '(01) 500 7878',
          hora_atencion: 'LUNES A VIERNES - 8AM A 8PM',
          nombre: 'AMAZONAS / CHACHAPOYAS / CHACHAPOYAS / CO DOS DE MAYO',
          lugar_over: 'CHACHAPOYAS', estadoAgencia: 'ACTIVO', ter_aereo: 0},
        {ter_id: 671, zona: 'VENTANILLA', provincia: 'CALLAO',
          departamento: 'CALLAO', nombre: 'CALLAO / CALLAO / VENTANILLA',
          direccion: 'AV. X 100', telefono: '', hora_atencion: '',
          latitud: '', longitud: ''}
      ]
    };
    const ta = P.traducirAgencias;

    {
      const r = ta(cruda);
      ok(r.ok === true && r.total === 2, 'la forma medida se traduce');

      /* EL DETALLE QUE FALLARÍA EN SILENCIO. La API manda `ter_id` como
         NÚMERO; el catálogo guardado lo tiene como TEXTO ("3"). El día que se
         verifique la agencia antes de registrar, `3 !== "3"` dejaría pasar un
         envío sin verificar — pagado, y quizá a otra ciudad. */
      ok(r.agencias[0].ter_id === '3',
         'el ter_id se normaliza a TEXTO: llega como número y el catálogo lo ' +
         'guarda como texto, y 3 !== "3" no avisa, simplemente falla');
      ok(typeof r.agencias[1].ter_id === 'string', 'todos, no solo el primero');

      // La API no manda `distrito`: manda `zona`. Mismo mapeo que el navegador.
      ok(r.agencias[0].distrito === 'CHACHAPOYAS',
         'el distrito sale de `zona`, que es como lo manda esta API');
      ok(r.agencias[0].horario === 'LUNES A VIERNES - 8AM A 8PM',
         'y el horario de `hora_atencion`, que es el que el formulario ya lee');
      ok(r.agencias[0].referencia === '' && r.agencias[0].horarioDom === '',
         'lo que la variante pública NO manda queda vacío, no inventado');
      ok(r.agencias[0].nombre.indexOf('CO DOS DE MAYO') > 0,
         'el nombre completo, que es el que guarda el catálogo');
    }

    {
      /* Que la traducción NO rompa el buscador: el esquema tiene que ser
         exactamente el del catálogo que el formulario ya lee. Se compara
         contra el archivo REAL del repositorio, no contra una lista escrita
         a mano que se desfasaría. */
      const real = JSON.parse(E.leer('data/agencias-shalom.json'));
      const esperados = Object.keys(real.agencias[0]).sort().join(',');
      const salen = Object.keys(ta(cruda).agencias[0]).sort().join(',');
      ok(salen === esperados,
         'el esquema traducido es IDÉNTICO al del catálogo en uso — si no, el ' +
         'buscador del formulario dejaría de encontrar campos' +
         (salen === esperados ? '' : ('\n      espera: ' + esperados +
           '\n      sale  : ' + salen)));
    }

    {
      // El extractor busca la lista por unos nombres concretos; `lista` no
      // está entre ellos y `agencias` sí. Se afirma el nombre, no se confía.
      const ext = E.leer('agencias-extractor.js');
      const claves = /var claves = \[([^\]]+)\]/.exec(ext);
      ok(claves && claves[1].indexOf("'agencias'") >= 0,
         'la clave `agencias` es de las que el extractor sabe buscar');
      ok(ta(cruda).agencias !== undefined,
         'y el traductor la devuelve con ese nombre, no con otro');
    }

    bloque('…y el catálogo no se reemplaza con basura');

    ok(ta(null).motivo === 'FORMATO_DESCONOCIDO', 'sin respuesta, nada');
    ok(ta([]).motivo === 'FORMATO_DESCONOCIDO', 'un array suelto tampoco');
    ok(ta({data: [{ter_id: 1, nombre: 'X'}]}).motivo === 'FORMATO_DESCONOCIDO',
       'sin `success: true` no se afirma nada, aunque vengan agencias');
    ok(ta({success: true, data: 'nada'}).motivo === 'FORMATO_DESCONOCIDO',
       'si `data` deja de ser una lista, se dice');
    ok(ta({success: true, data: []}).motivo === 'FORMATO_DESCONOCIDO',
       '554 agencias que se vuelven 0 NO es un catálogo vacío: es que cambió ' +
       'la forma. Reemplazar el catálogo con eso lo dejaría inservible');

    {
      const cojo = {success: true, data: [
        {ter_id: 3, nombre: 'BUENA', zona: 'Z'},
        {nombre: 'SIN ID'}, {ter_id: null, nombre: 'NULA'}, null, 'texto'
      ]};
      const r = ta(cojo);
      ok(r.ok === true && r.total === 1,
         'una agencia sin id no entra: no sirve para registrar y ensucia el ' +
         'catálogo');
      ok(r.sinId === 4,
         'y cuántas se descartaron se DICE, no se calla — 4 de 5 en silencio ' +
         'sería un catálogo roto que parece bueno');
    }

    ok(ta({success: true, data: [Object.assign({campoNuevo: 1},
        cruda.data[0])]}).ok === true,
       'un campo que Shalom añada mañana no rompe nada: lo que no se reconoce ' +
       'se ignora');
    ok(P.traducir('agencies', cruda).total === 2,
       'y el despachador manda agencies a SU traductor');
  }
};
