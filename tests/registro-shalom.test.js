/**
 * tests/registro-shalom.test.js — REGISTRAR UN ENVIO EN SHALOM
 * =============================================================
 * ⚠️ ESTA ES LA UNICA OPERACION DEL PROYECTO QUE CUESTA DINERO Y NO SE
 * PUEDE DESHACER. `POST /account/register` crea un envio de verdad, Shalom
 * NO tiene endpoint para anularlo, y NO tiene clave de idempotencia: dos
 * llamadas son dos envios y dos cobros.
 *
 * Por eso toda la decision vive aqui, en codigo puro y probado, y no
 * repartida entre la pantalla y el servidor. El navegador decide si habilita
 * el boton; el servidor decide si manda. LOS DOS PREGUNTAN A ESTE ARCHIVO:
 * si cada uno tuviera su propia regla, el dia que divergieran se registraria
 * un envio que la pantalla creia bloqueado.
 */
'use strict';
const path = require('path');
const E = require('./_entorno.js');
const R = require(path.join(__dirname, '..', 'functions', 'registroShalom.js'));

/* Un pedido completo y una config completa: el caso que SI debe registrar.
   Cada prueba de abajo le quita UNA cosa y comprueba que se niegue. */
const PEDIDO_OK = {
  id: 'id_1', status: 'POR ALISTAR', courier: 'SHALOM',
  agenciaId: '499', agenciaCourier: 'SHALOM',
  dni: '73483547', phone: '918642656',
  shalomClave: '5773',
  pkgLargo: 30, pkgAncho: 20, pkgAlto: 12, pkgPeso: 1.5,
  reniec: {nombres: 'JARLYN', apePaterno: 'LLANOS', apeMaterno: 'ARTEAGA'}
};
const CFG_OK = {
  agenciaOrigen: {agenciaId: '576', agenciaCourier: 'SHALOM'},
  instanceId: 'd14b120a-983d-4369-b519-c9d6bcf70d6a'
};
const sin = (campo) => {
  const p = JSON.parse(JSON.stringify(PEDIDO_OK));
  delete p[campo];
  return p;
};

module.exports = async ({bloque, ok}) => {

  /* Un mundo de mentira. Todo lo que toca disco o red se inyecta, asi que la
     orquestacion ENTERA se prueba sin Firestore y sin llamar a Shalom. */
  const mundo = (op) => {
    op = op || {};
    const visto = {llamadas: 0, cuerpo: null, guardado: null, pendientes: 0};
    return {
      visto,
      deps: {
        leerPedido: async () => (op.pedido === undefined ? PEDIDO_OK : op.pedido),
        leerConfig: async () => (op.cfg === undefined ? CFG_OK : op.cfg),
        llamar: async (c) => {
          visto.llamadas++; visto.cuerpo = c;
          return op.respuesta || {ok: true, json: {guia: '98014733',
            codigo: 'MCHN', quote: 12.5}};
        },
        pendientes: async () => { visto.pendientes++; return op.pendientes || []; },
        guardar: async (campos) => { visto.guardado = campos; },
        // Reloj sustituible: una prueba que dependa de la hora real falla
        // sola algún martes, y a nadie se le ocurre mirar el calendario.
        ahora: op.ahora || (() => Date.parse('2026-10-02T21:28:00Z'))
      }
    };
  };


  bloque('El sello de hora — de donde sale el plazo de 24 h');

  {
    const {visto, deps} = mundo();
    await R.orquestar({pedidoId: 'p1'}, deps, {simulacro: false});
    ok(visto.guardado.shalomRegistradoEn === '2026-10-02T21:28:00.000Z',
       'un alta sella la hora: antes el registro no guardaba NINGUNA, asi ' +
       'que no habia desde donde contar las 24 h');
    ok(visto.guardado.status === 'ALISTADO' &&
       visto.guardado.shalomEstado === 'REGISTRADO',
       'y lo demas sigue igual: el sello no cambia lo que ya funcionaba');
  }
  {
    /* Un alta que se corta a medio camino y se encuentra en pendientes nacio
       hace segundos: su hora SI se puede afirmar. */
    const {visto, deps} = mundo({
      respuesta: {ok: false, motivo: 'SIN_RED'},
      pendientes: [{code_val: '5773', destination_station: {ter_id: 499},
        service_order_guia_empresarial: '98014733',
        code_service_order_empresarial: 'MCHN'}]
    });
    const r = await R.orquestar({pedidoId: 'p1'}, deps, {simulacro: false});
    ok(r.recuperado === true && visto.guardado.shalomGuia === '98014733',
       'el envio se encontro entre los pendientes');
    ok(visto.guardado.shalomRegistradoEn === '2026-10-02T21:28:00.000Z',
       'y tambien se sella: se acaba de crear');
  }
  {
    /* ⚠️ LA RECUPERACION NO SELLA, Y ESO ES LO CORRECTO.
       `recuperarEnvio` lo corres cuando te da la gana —horas despues— y no
       hay forma de saber cuando nacio la guia. Poner "ahora" regalaria 24 h
       de plazo que ya se consumieron, y te dejaria tranquilo mientras el
       envio se vence. Sin sello no hay cuenta atras: eso es honesto. */
    const {visto, deps} = mundo({
      pendientes: [{code_val: '5773', destination_station: {ter_id: 499},
        service_order_guia_empresarial: '98014733',
        code_service_order_empresarial: 'MCHN'}]
    });
    const r = await R.recuperarEnvio({pedidoId: 'p1'}, deps);
    ok(r.ok === true && r.recuperado === true, 'la recuperacion encuentra el envio');
    ok(visto.guardado.shalomRegistradoEn === undefined,
       'y NO inventa una hora de nacimiento que no conoce');
  }

  bloque('Que falta para poder registrar — y se dice CUAL, no "no se puede"');

  {
    ok(R.faltantes(PEDIDO_OK, CFG_OK).length === 0,
       'un pedido completo no tiene pegas — faltan: ' +
       R.faltantes(PEDIDO_OK, CFG_OK).join(' / '));

    /* Cada falta se nombra. Un "faltan datos" a secas obliga a ir campo por
       campo adivinando cual, y eso con un boton que cuesta dinero es peor. */
    const casos = [
      ['dni', /dni/i], ['phone', /tel/i], ['shalomClave', /clave/i],
      ['agenciaId', /agencia.*destino|destino/i],
      ['pkgLargo', /medida|largo/i], ['pkgPeso', /peso/i]
    ];
    casos.forEach(([campo, re]) => {
      const f = R.faltantes(sin(campo), CFG_OK);
      ok(f.length > 0, 'sin ' + campo + ' no se registra');
      ok(f.some((t) => re.test(t)),
         'y se dice que falta ' + campo + ' — dijo: ' + f.join(' / '));
    });
  }

  {
    /* LA PUERTA DEL ESTADO. El dueño lo pidio asi: solo se registra lo que
       esta POR ALISTAR. Un pedido recien tomado todavia puede cambiar. */
    ['NUEVO PEDIDO', 'EN PROCESO', 'ALISTADO', 'ENVIADO', 'FINALIZADO']
        .forEach((st) => {
          const p = Object.assign({}, PEDIDO_OK, {status: st});
          ok(R.faltantes(p, CFG_OK).some((t) => /por alistar/i.test(t)),
             st + ' no se registra: solo POR ALISTAR');
        });
    ok(R.faltantes(Object.assign({}, PEDIDO_OK, {status: 'POR ALISTAR'}),
        CFG_OK).length === 0, 'y POR ALISTAR si');
  }

  {
    /* ⚠️ CANDADO 4: un pedido que YA TIENE GUIA no se registra otra vez.
       Shalom no anula y no tiene idempotencia: el segundo registro es un
       segundo envio y un segundo cobro. En la otra aplicacion del dueño este
       candado NO existe —su pedido #1 tiene guia 98014733 y el boton
       "Registrar envio Shalom" sigue ahi—, y por eso se escribe aqui. */
    const conGuia = Object.assign({}, PEDIDO_OK, {shalomGuia: '98014733'});
    ok(R.faltantes(conGuia, CFG_OK).some((t) => /ya.*registrad|ya tiene gu/i.test(t)),
       'con guia ya puesta, NO se registra de nuevo');
  }

  {
    /* La config del negocio tambien puede faltar, y se dice igual. */
    ok(R.faltantes(PEDIDO_OK, {instanceId: 'x'}).some((t) => /origen/i.test(t)),
       'sin agencia de origen en Config, se dice');
    ok(R.faltantes(PEDIDO_OK, {agenciaOrigen: CFG_OK.agenciaOrigen})
        .some((t) => /cuenta|instancia/i.test(t)),
    'sin cuenta de Shalom Pro, se dice');
    ok(R.faltantes(PEDIDO_OK, null).length >= 2,
       'y sin config, se dicen las dos');
  }

  {
    /* El nombre: RENIEC lo da partido. Si no hay RENIEC no se inventa
       partiendo a ojo — que es lo que hace la otra app y lo que manda el
       mismo valor en `name` y `firstname` cuando el nombre es de una sola
       palabra. */
    const p = sin('reniec');
    ok(R.faltantes(p, CFG_OK).some((t) => /nombre|reniec/i.test(t)),
       'sin el nombre de RENIEC no se registra: partirlo a ojo es adivinar');

    /* Pero UN solo apellido SI alcanza. `apeMaterno` llego vacio al medir
       RENIEC con un DNI ajeno; bloquear a esa persona seria inventar un
       requisito que no existe. */
    const unApellido = Object.assign({}, PEDIDO_OK, {
      reniec: {nombres: 'ANA', apePaterno: 'TORRES', apeMaterno: ''}
    });
    ok(R.faltantes(unApellido, CFG_OK).length === 0,
       'con un solo apellido se registra: hay personas sin apellido materno');
  }

  bloque('Un envio ya registrado se CONGELA: la clave no se toca');

  {
    /* ⚠️ LA CLAVE YA ESTA EN SHALOM. Cambiarla en el panel le daria al
       cliente cuatro digitos que no abren nada, y el paquete se queda en la
       agencia. `_claveAuto` ya lo respetaba, pero el boton 🎲 no: podia
       regenerarla sobre un envio registrado. Lo vio el dueño.

       Y la AGENCIA DE DESTINO igual: Shalom ya la tiene. Cambiarla aqui
       haria que la etiqueta diga una cosa y el paquete vaya a otra. */
    ok(R.estaRegistrado({shalomGuia: '98173469'}) === true,
       'con guia, el envio esta registrado');
    ok(R.estaRegistrado({shalomGuia: ''}) === false, 'sin guia, no');
    ok(R.estaRegistrado({}) === false && R.estaRegistrado(null) === false,
       'y sin pedido tampoco');

    /* LA MISMA REGLA que usa el candado del registro: si fueran dos, el dia
       que divergieran una congelaria y la otra dejaria registrar. */
    const conGuia = Object.assign({}, PEDIDO_OK, {shalomGuia: '98173469'});
    ok(R.faltantes(conGuia, CFG_OK).length > 0 &&
       R.estaRegistrado(conGuia) === true,
    'el candado del registro y el congelado usan la MISMA regla');
  }

  {
    const cfg = E.leer('config.js');
    const fn = cfg.slice(cfg.indexOf('function regenClaveRecojo'),
        cfg.indexOf('function regenClaveRecojo') + 700);
    ok(/estaRegistrado|shalomGuia/.test(fn),
       'el boton de regenerar comprueba si ya esta registrado');
    ok(/toast/.test(fn),
       'y si lo esta, lo DICE en vez de no hacer nada en silencio');
  }

  bloque('El cuerpo que se manda, campo por campo');

  {
    const c = R.cuerpo(PEDIDO_OK, CFG_OK);
    ok(c && typeof c === 'object', 'un pedido completo produce cuerpo');
    ok(c.instanceId === CFG_OK.instanceId, 'va la cuenta declarada');
    ok(c.documento === '73483547', 'el DNI');
    ok(c.name === 'JARLYN' && c.firstname === 'LLANOS' &&
       c.lastname === 'ARTEAGA',
    'y el nombre YA PARTIDO por RENIEC, no a ojo');
    ok(c.phone === '918642656', 'el telefono');
    ok(c.clave === '5773', 'la clave de recojo');
    ok(c.content === 'PAQUETE S',
       '30x20x12 y 1.5 kg es la caja S — salio: ' + c.content);
    ok(c.cantidad === 1, 'un bulto por defecto');
    ok(c.declaracion_jurada === '',
       'declaracion jurada vacia: medido en la otra app, funciona asi');
  }

  {
    /* ⚠️ ORIGEN Y DESTINO VAN COMO NUMERO, Y ESO EVITA UN FALLO CARO.
       La documentacion: `destino` (ter_id, o "052" CON PREFIJO 0 = AEREO).
       La otra aplicacion del dueño hace `String(id).padStart(3,'0')`, asi que
       convierte el ter_id 7 (Arequipa) en "007" y lo registra como AEREO sin
       que nadie lo pida. 66 de las 552 agencias tienen ter_id de 1 o 2
       digitos: uno de cada ocho envios.
       Un NUMERO no puede llevar cero delante. El fallo se vuelve imposible
       por construccion, no por acordarse. */
    const c = R.cuerpo(PEDIDO_OK, CFG_OK);
    ok(typeof c.destino === 'number' && c.destino === 499,
       'destino es NUMERO, no texto con ceros — salio: ' +
       JSON.stringify(c.destino));
    ok(typeof c.origen === 'number' && c.origen === 576, 'origen tambien');

    const aArequipa = Object.assign({}, PEDIDO_OK, {agenciaId: '7'});
    const c2 = R.cuerpo(aArequipa, CFG_OK);
    ok(c2.destino === 7 && String(c2.destino) === '7',
       'el ter_id 7 va como 7, NUNCA como "007" (que seria aereo)');
  }

  {
    ok(R.cuerpo(sin('dni'), CFG_OK) === null,
       'un pedido incompleto NO produce cuerpo: no se manda a medias');
    ok(R.cuerpo(Object.assign({}, PEDIDO_OK, {shalomGuia: '9'}), CFG_OK) === null,
       'y uno ya registrado tampoco');
  }

  bloque('La caja sale de las medidas Y DEL PESO');

  {
    /* Le dije al dueño que el peso no servia para nada. Me equivoque: el
       catalogo tiene tope de peso por caja, asi que un paquete que CABE en
       XS pero pesa 3 kg se va a M. Sin el peso elegiriamos una caja mas
       chica de la que corresponde y Shalom lo cobraria distinto. */
    ok(R.contenidoDe({pkgLargo: 20, pkgAncho: 15, pkgAlto: 12, pkgPeso: 0.4}) ===
       'PAQUETE XS', '20x15x12 con 0.4 kg es XS');
    ok(R.contenidoDe({pkgLargo: 20, pkgAncho: 15, pkgAlto: 12, pkgPeso: 3}) ===
       'PAQUETE M',
    'LAS MISMAS MEDIDAS con 3 kg se van a M: el peso manda — salio: ' +
       R.contenidoDe({pkgLargo: 20, pkgAncho: 15, pkgAlto: 12, pkgPeso: 3}));
    ok(R.contenidoDe({pkgLargo: 200, pkgAncho: 200, pkgAlto: 200, pkgPeso: 50}) ===
       null, 'lo que no entra en ninguna caja no inventa una');
    ok(R.contenidoDe({pkgLargo: 30, pkgAncho: 20}) === null,
       'y sin las cuatro medidas, tampoco');
  }

  {
    /* Lo que sale de aqui tiene que ser algo que Shalom acepte. */
    const c = R.contenidoDe({pkgLargo: 30, pkgAncho: 24, pkgAlto: 20, pkgPeso: 4});
    ok(R.CONTENIDOS.indexOf(c) >= 0,
       'el contenido siempre es uno de los que Shalom acepta — salio: ' + c);
  }

  bloque('UN SOLO extractor de guia — dos reglas costaron un envio real');

  {
    /* ⚠️ FALLO REAL, 02/10/2026, con dinero de por medio.
       `resultado()` buscaba la guia en cinco sitios, INCLUIDO `json.data`.
       La orquestacion la buscaba en TRES, sin `data`. Shalom la devuelve
       anidada en `data`, asi que:
         · resultado() la encontro  -> dijo "exito"
         · orquestar()  no la vio   -> guardo shalomGuia: ""
       El envio se creo y se pago, el pedido quedo marcado REGISTRADO sin
       guia, y el candado de "ya tiene guia" —que mira justo ese campo—
       quedo desarmado. Lo que salvo el cobro doble fue la OTRA reja: el
       pedido paso a ALISTADO y el registro exige POR ALISTAR.

       Dos sitios con la misma regla escrita distinta. Es lo que este
       proyecto lleva semanas castigando, y lo escribi yo. Ahora hay UNO. */
    const anidada = {data: {guia: '98014733', codigo: 'MCHN', quote: 12.5}};
    const g = R.guiaDe(anidada);
    ok(g.guia === '98014733', 'la guia se encuentra dentro de `data`');
    ok(g.codigo === 'MCHN', 'y el codigo');
    ok(g.monto === 12.5, 'y el monto');

    ok(R.guiaDe({guia: '1', codigo: 'A'}).guia === '1',
       'y tambien al primer nivel, por si cambia');
    ok(R.guiaDe({orderNumber: '2', orderCode: 'B'}).guia === '2',
       'y con los nombres del rastreo');
    ok(R.guiaDe({data: {orderNumber: '3'}}).guia === '3',
       'anidados tambien');
    ok(R.guiaDe({}).guia === '', 'sin guia devuelve vacio, no inventa');
    ok(R.guiaDe(null).guia === '', 'y con basura tampoco');
  }

  {
    /* Y LOS DOS CAMINOS USAN EL MISMO. Es la unica forma de que no vuelvan
       a divergir: no hay dos listas que mantener sincronizadas. */
    const r = R.resultado({ok: true, json: {data: {guia: '98014733'}}});
    ok(r === 'exito', 'resultado() ve la guia anidada');

    const m2 = mundo({respuesta: {ok: true,
      json: {data: {guia: '98014733', codigo: 'MCHN', quote: 12.5}}}});
    const o = await R.orquestar({pedidoId: 'id_1'}, m2.deps, {simulacro: false});
    ok(o.estado === 'exito', 'y la orquestacion tambien');
    ok(m2.visto.guardado.shalomGuia === '98014733',
       '⚠️ Y LA GUARDA — esto es lo que fallo: salio "" — ahora: ' +
       m2.visto.guardado.shalomGuia);
    ok(m2.visto.guardado.shalomCodigo === 'MCHN', 'con su codigo');
    ok(m2.visto.guardado.shalomMonto === 12.5, 'y su monto');
  }

  {
    /* ⚠️ Y SI LA GUIA SALE VACIA, NO SE ESCRIBE NADA. Un pedido marcado
       REGISTRADO sin guia es lo peor de los dos mundos: el candado de "ya
       tiene guia" queda desarmado y el cliente no tiene nada que rastrear.
       Antes que eso, se dice duda y se consulta pendientes. */
    const m3 = mundo({respuesta: {ok: true, json: {mensaje: 'creado'}},
      pendientes: []});
    const o = await R.orquestar({pedidoId: 'id_1'}, m3.deps, {simulacro: false});
    ok(o.estado === 'duda',
       'un ok sin guia NO es exito — salio: ' + o.estado);
    ok(m3.visto.guardado === null,
       'y no se marca REGISTRADO sin guia: eso desarma el candado');
  }

  {
    /* Que la proxima vez SE APRENDA la forma. Con `forma: true` no se
       aprendia nada; ahora vuelven los NOMBRES de los campos, sin un solo
       valor, que es lo que hacia falta para cerrar el traductor. */
    const m4 = mundo({respuesta: {ok: true,
      json: {ok: 1, data: {guia: '9', codigo: 'X'}}}});
    const o = await R.orquestar({pedidoId: 'id_1'}, m4.deps, {simulacro: false});
    ok(Array.isArray(o.forma) && o.forma.indexOf('data.guia') >= 0,
       'la respuesta dice que CAMPOS trajo Shalom — salio: ' +
       JSON.stringify(o.forma));
    ok(JSON.stringify(o.forma).indexOf('98014733') < 0 &&
       JSON.stringify(o.forma).indexOf('"9"') < 0,
    'solo los nombres, ni un valor: se puede pegar en el chat');
  }

  bloque('TRES resultados, no dos — y el del medio es el caro');

  {
    /* Shalom no anula y no tiene idempotencia. Decir "fallo" cuando en
       realidad no sabemos invita a volver a pulsar, y eso son dos envios y
       dos cobros. Asi que hay un tercer resultado y no se puede juntar con
       ninguno de los otros dos. */
    ok(R.resultado({ok: true, json: {guia: '98014733'}}) === 'exito',
       'una respuesta buena es exito');
    ok(R.resultado({ok: false, motivo: 'SIN_DATO', http: 400}) === 'fallo',
       'un 400 es un NO de Shalom: fallo de verdad');
    ok(R.resultado({ok: false, motivo: 'BLOQUEADO', http: 403}) === 'fallo',
       'un 403 tambien');

    ok(R.resultado({ok: false, motivo: 'SIN_RED'}) === 'duda',
       'SIN RED no es fallo: NO SABEMOS si llego a crearse');
    ok(R.resultado({ok: false, motivo: 'ERROR_SHALOM', http: 500}) === 'duda',
       'un 500 tampoco: el envio pudo crearse igual');
    ok(R.resultado({ok: false, motivo: 'ERROR_SHALOM'}) === 'duda',
       'ni un corte por tiempo');
    ok(R.resultado(null) === 'duda',
       'y si no hay respuesta, la duda es lo unico honesto');
  }

  {
    /* Que NUNCA devuelva otra cosa: quien llama hace tres caminos. */
    [undefined, {}, {ok: true}, {ok: 'si'}, 'x', 0].forEach((raro) => {
      const r = R.resultado(raro);
      ok(['exito', 'fallo', 'duda'].indexOf(r) >= 0,
         'siempre uno de los tres, nunca vacio: ' + JSON.stringify(raro) +
         ' -> ' + r);
    });
    ok(R.resultado({ok: true, json: {}}) === 'duda',
       'un "ok" sin guia es duda, no exito: sin guia no hay envio que mostrar');
  }

  bloque('El nombre de RENIEC se GUARDA en el pedido, o no sirve de nada');

  {
    /* ⚠️ BLOQUEANTE QUE CASI DEJA EL REGISTRO INUTIL.
       `_dniReniec` consulta RENIEC, deja la persona en `window._dniUltima`
       —memoria volatil— y rellena el campo de nombre con el nombre
       COMPLETO. El nombre PARTIDO nunca llegaba al pedido.

       Y el registro lo necesita partido en tres: `name`, `firstname`,
       `lastname`. Sin guardarlo, la reja habria dicho "falta el nombre de
       RENIEC" en TODOS los pedidos, con el DNI consultado y el nombre a la
       vista. Se habria leido como un fallo del registro cuando el fallo
       estaba tres pasos antes. */
    const cfg = E.leer('config.js');
    ok(/data\.reniec\s*=/.test(cfg),
       'al guardar un pedido se guarda tambien el nombre partido de RENIEC');
    ok(/RegistroShalom\.reniecDe\(/.test(cfg),
       'y la regla la decide el modulo probado, no la pantalla');

    /* ⚠️ DE COMPORTAMIENTO. Mi primera version comprobaba que apareciera la
       palabra `dni` cerca, y la mutacion que QUITABA la comprobacion
       sobrevivio: `dni` aparecia igual en `data.dni`. Enesima vez. La regla
       se movio al modulo justo para poder EJECUTARLA. */
    const persona = {dni: '73483547', nombres: 'JARLYN',
      apePaterno: 'LLANOS', apeMaterno: 'ARTEAGA'};
    const r1 = R.reniecDe(persona, '73483547');
    ok(r1 && r1.nombres === 'JARLYN' && r1.apePaterno === 'LLANOS',
       'con el DNI que coincide, se guarda el nombre partido');
    ok(R.reniecDe(persona, '71613965') === null,
       '⚠️ con OTRO DNI no se guarda: seria darle a Shalom el nombre de otra ' +
       'persona, y un envio a nombre de quien no es no lo recoge nadie');
    ok(R.reniecDe(null, '73483547') === null, 'sin consulta, nada');
    ok(R.reniecDe(persona, '') === null, 'sin DNI, nada');
    ok(R.reniecDe({dni: '73483547', nombres: ''}, '73483547') === null,
       'y una consulta sin nombre tampoco sirve');
    ok(R.reniecDe({dni: '73483547', nombres: 'ANA', apePaterno: 'TORRES',
      apeMaterno: ''}, '73483547').apeMaterno === '',
    'un apellido materno vacio se guarda vacio, no se inventa');
  }

  bloque('Lo que el panel RESUELVE, el servidor tiene que poder LEERLO');

  {
    /* ⚠️ DOS FALLOS DE DISEÑO MIOS, los dos destapados por el primer
       simulacro de verdad.

       1 · La cuenta de Shalom "Total" esta DECLARADA en shalom.js, que es
           codigo de navegador. El panel la resuelve y la enseña conectada,
           pero la Cloud Function lee Firestore y ahi no hay nada: decia
           "falta la cuenta de Shalom Pro" con la cuenta a la vista.
           RESOLVER NO ES GUARDAR, y confundirlos deja al servidor ciego.

       2 · El nombre de RENIEC no se vuelve a consultar al abrir un pedido,
           asi que un pedido guardado antes nunca gana el campo aunque
           tenga el DNI puesto y el nombre en pantalla. */
    const idx = E.leer('index.html');
    const fn = idx.slice(idx.indexOf('function verificarInstanciaShalom'),
        idx.indexOf('function _pintarElectorInstancia'));
    ok(/S\.shalomInstancia\s*=/.test(fn),
       'al resolver la cuenta, se GUARDA para que el servidor la vea');
    ok(/declarada|una/.test(fn),
       'y solo cuando se resolvio sola (declarada o unica), nunca ante duda');

    const cfg = E.leer('config.js');
    ok(/_dniReniec\s*\(/.test(cfg.slice(cfg.indexOf('$(\'fDni\').value=s.dni'),
        cfg.indexOf('$(\'fDni\').value=s.dni') + 600)) ||
       /abrirDni|_dniAlAbrir/.test(cfg),
    'al abrir un pedido con DNI, se consulta RENIEC (la cache lo hace gratis)');
  }

  bloque('El interruptor del simulacro llega a Firestore');

  {
    /* Mismo fallo que con la cuenta de Shalom, y lo busque a proposito en
       vez de esperar a tropezarlo: el subidor de config lleva una lista
       EXPLICITA de campos. Si el interruptor no esta en ella, apagarlo en
       el panel no lo apaga en el servidor — y el registro real se quedaria
       en simulacro para siempre, sin que nada lo explicara. */
    const idx = E.leer('index.html');
    const i = idx.indexOf('agenciaOrigen:data.agenciaOrigen');
    const subida = idx.slice(i - 1400, i + 2000);
    ok(/shalomRegistroSimulacro\s*:/.test(subida),
       'el interruptor del simulacro viaja a Firestore');

    /* Y el DEFECTO es simulacro: solo se apaga si vale exactamente false.
       Un campo ausente, nulo o con basura deja el simulacro puesto. */
    const fidx = E.leer('functions/index.js');
    ok(/shalomRegistroSimulacro !== false/.test(fidx),
       'y solo se apaga con un false explicito: ausente o raro = simulacro');
  }

  bloque('La orquestacion: el navegador manda un id, el servidor hace todo');

  {
    const m = mundo();
    const r = await R.orquestar({pedidoId: 'id_1'}, m.deps, {simulacro: false});
    ok(r.ok === true && r.estado === 'exito', 'un registro bueno sale exito');
    ok(m.visto.llamadas === 1, 'y llama a Shalom UNA sola vez');
    ok(m.visto.cuerpo.destino === 499, 'con el cuerpo que arma el servidor');
    ok(m.visto.guardado && m.visto.guardado.shalomGuia === '98014733',
       'se guarda la guia');
    ok(m.visto.guardado.shalomEstado === 'REGISTRADO',
       'y el estado de Shalom, aparte del estado del pedido');
    ok(m.visto.guardado.status === 'ALISTADO',
       'y el pedido pasa a ALISTADO, como pidio el dueño');
  }

  {
    /* ⚠️ EL SIMULACRO ES EL ESTADO POR DEFECTO. Una operacion que cuesta
       dinero y no se deshace no puede estar encendida porque si. */
    const m = mundo();
    const r = await R.orquestar({pedidoId: 'id_1'}, m.deps, {});
    ok(r.ok === true && r.simulacro === true,
       'sin decir nada, SIMULACRO — salio: ' + JSON.stringify(r.simulacro));
    ok(m.visto.llamadas === 0, 'y NO se llama a Shalom');
    ok(m.visto.guardado === null, 'ni se escribe nada');
    ok(r.cuerpo && r.cuerpo.destino === 499 && r.cuerpo.clave === '5773',
       'pero se devuelve el cuerpo EXACTO, para poder revisarlo antes');
  }

  {
    /* Lo que falta se dice antes de llamar a nadie. */
    const m = mundo({pedido: sin('shalomClave')});
    const r = await R.orquestar({pedidoId: 'id_1'}, m.deps, {simulacro: false});
    ok(r.ok === false && Array.isArray(r.faltan) && r.faltan.length > 0,
       'con datos incompletos se para y se dice que falta');
    ok(m.visto.llamadas === 0, 'sin llamar a Shalom');
  }

  {
    const m = mundo({pedido: null});
    const r = await R.orquestar({pedidoId: 'id_x'}, m.deps, {simulacro: false});
    ok(r.ok === false && r.motivo === 'NO_ENCONTRADO',
       'un pedido que no existe no se inventa');
    ok(m.visto.llamadas === 0, 'y no se llama a nadie');
  }

  bloque('⚠️ ANTE DUDA NO SE REINTENTA: SE CONSULTA');

  {
    /* El caso caro. Se corto la red DESPUES de que Shalom pudo crear el
       envio. Reintentar seria un segundo envio y un segundo cobro que nadie
       puede anular. Asi que se consulta `pending-shipments` y se busca. */
    const m = mundo({
      respuesta: {ok: false, motivo: 'SIN_RED'},
      pendientes: [{
        code_val: '5773',
        destination_station: {ter_id: 499},
        service_order_guia_empresarial: '98014733',
        code_service_order_empresarial: 'MCHN',
        quote: 12.5
      }]
    });
    const r = await R.orquestar({pedidoId: 'id_1'}, m.deps, {simulacro: false});
    ok(m.visto.llamadas === 1, 'se llamo UNA vez, no dos');
    ok(m.visto.pendientes === 1, 'y ante la duda se CONSULTO pendientes');
    ok(r.estado === 'exito' && r.recuperado === true,
       'el envio SI se habia creado: se recupera, no se duplica — salio: ' +
       r.estado);
    ok(m.visto.guardado && m.visto.guardado.shalomGuia === '98014733',
       'y se guarda la guia que ya existia');
  }

  {
    /* Y si al consultar NO aparece, tampoco se afirma que fallo: se dice
       que no se sabe, y NO se reintenta solo. */
    const m = mundo({respuesta: {ok: false, motivo: 'SIN_RED'}, pendientes: []});
    const r = await R.orquestar({pedidoId: 'id_1'}, m.deps, {simulacro: false});
    ok(r.ok === false && r.estado === 'duda',
       'si no aparece en pendientes, sigue siendo DUDA, no fallo');
    ok(m.visto.guardado === null,
       'y NO se escribe nada: no se da por registrado lo que no se vio');
    ok(/no sab|verific|comprob/i.test(String(r.detalle || '')),
       'y el texto lo dice con todas las letras — dijo: ' + r.detalle);
  }

  {
    /* Un NO de Shalom si es un fallo, y se dice una vez. */
    const m = mundo({respuesta: {ok: false, motivo: 'SIN_DATO', http: 400,
      detalle: "body must have required property 'origen'"}});
    const r = await R.orquestar({pedidoId: 'id_1'}, m.deps, {simulacro: false});
    ok(r.ok === false && r.estado === 'fallo', 'un 400 es fallo de verdad');
    ok(m.visto.pendientes === 0,
       'y NO se consulta pendientes: Shalom dijo que no creo nada');
    ok(m.visto.guardado === null, 'ni se escribe nada');
    ok(/origen/.test(String(r.detalle || '')),
       'y se enseña lo que dijo Shalom, no un error generico');
  }

  bloque('Recuperar una guia perdida — sin registrar nada');

  {
    /* ⚠️ EXISTE POR UN ENVIO REAL QUE SE QUEDO SIN GUIA (02/10/2026).
       Shalom lo creo y se pago, pero mi fallo guardo `shalomGuia: ""`.
       El pedido quedo marcado REGISTRADO sin guia: ni el cliente tiene que
       rastrear ni el candado de "ya tiene guia" protege.

       Esto SOLO LEE: consulta pendientes, busca por clave Y destino, y
       rellena. Nunca llama a `register`. Es la operacion que uno quiere
       tener cuando algo salio a medias, y tenerla evita la tentacion de
       "registrar otra vez a ver si ahora si". */
    const visto = {registros: 0, guardado: null};
    const deps = {
      leerPedido: async () => Object.assign({}, PEDIDO_OK,
          {status: 'ALISTADO', shalomEstado: 'REGISTRADO'}),
      leerConfig: async () => CFG_OK,
      llamar: async () => { visto.registros++; return {ok: true}; },
      pendientes: async () => ({'0': {
        code_val: '5773',
        destination_station: {ter_id: 499},
        service_order_guia_empresarial: '98014733',
        code_service_order_empresarial: 'MCHN',
        quote: 12.5
      }}),
      guardar: async (c) => { visto.guardado = c; }
    };
    const r = await R.recuperarEnvio({pedidoId: 'id_1'}, deps);
    ok(visto.registros === 0,
       '⚠️ NO llama a register: solo lee — llamadas: ' + visto.registros);
    ok(r.ok === true && visto.guardado.shalomGuia === '98014733',
       'y rellena la guia que ya existia en Shalom');
    ok(visto.guardado.shalomCodigo === 'MCHN', 'con su codigo');
    ok(visto.guardado.shalomMonto === 12.5, 'y el monto que se pago');
  }

  {
    /* Si no aparece, no se inventa ni se marca nada. */
    const visto = {guardado: null};
    const r = await R.recuperarEnvio({pedidoId: 'id_1'}, {
      leerPedido: async () => PEDIDO_OK,
      leerConfig: async () => CFG_OK,
      llamar: async () => ({ok: true}),
      pendientes: async () => ({}),
      guardar: async (c) => { visto.guardado = c; }
    });
    ok(r.ok === false && /no apar|no se encontr/i.test(String(r.detalle||'')),
       'si no esta en pendientes se dice, no se inventa — ' + r.detalle);
    ok(visto.guardado === null, 'y no se escribe nada');
  }

  bloque('Buscar en pendientes: por clave Y destino, nunca por parecido');

  {
    const mios = [
      {code_val: '1111', destination_station: {ter_id: 499},
        service_order_guia_empresarial: '1'},
      {code_val: '5773', destination_station: {ter_id: 111},
        service_order_guia_empresarial: '2'},
      {code_val: '5773', destination_station: {ter_id: 499},
        service_order_guia_empresarial: '3'}
    ];
    const c = {clave: '5773', destino: 499};
    ok(R.buscarEnPendientes(mios, c).service_order_guia_empresarial === '3',
       'encuentra el que coincide en clave Y destino');
    ok(R.buscarEnPendientes(mios, {clave: '9999', destino: 499}) === null,
       'y si no esta, devuelve null — no el mas parecido');
    ok(R.buscarEnPendientes([], c) === null, 'una lista vacia no inventa');
    ok(R.buscarEnPendientes(null, c) === null, 'ni una lista que no es lista');

    /* ⚠️ DOS IGUALES = NO SE ELIGE. Si hubiera dos envios con la misma clave
       al mismo destino, quedarse con uno seria adivinar cual — y aqui
       adivinar significa darle al cliente la guia de otro paquete. */
    const dobles = [
      {code_val: '5773', destination_station: {ter_id: 499},
        service_order_guia_empresarial: 'a'},
      {code_val: '5773', destination_station: {ter_id: 499},
        service_order_guia_empresarial: 'b'}
    ];
    ok(R.buscarEnPendientes(dobles, c) === null,
       'con dos candidatos identicos NO se elige: seria darle al cliente la ' +
       'guia de otro paquete');
  }

  {
    /* `pending-shipments` llega como OBJETO con claves "0","1","2", no como
       array — medido el 01/10/2026. Un `.filter` directo habria devuelto
       vacio SIEMPRE y habriamos creido que el envio no se creo. */
    const comoObjeto = {
      '0': {code_val: '1111', destination_station: {ter_id: 1},
        service_order_guia_empresarial: 'x'},
      '1': {code_val: '5773', destination_station: {ter_id: 499},
        service_order_guia_empresarial: 'y'}
    };
    ok(R.buscarEnPendientes(comoObjeto, {clave: '5773', destino: 499})
        .service_order_guia_empresarial === 'y',
    'tambien funciona con el OBJETO {"0":…,"1":…} que devuelve Shalom');
  }

  bloque('Desde el panel solo viaja el ID — nada mas');

  {
    /* Si el navegador mandara el cuerpo, podria falsificar el destino, la
       clave o saltarse el candado de "ya tiene guia" editandolo en la
       consola. Manda el id y punto; el servidor lee la verdad de Firestore. */
    const red = {cuerpo: null};
    const win = {_authEnsureToken: async () => true};
    E.cargar('shalom.js', win, {
      localStorage: {getItem: () => 'TOKEN123'},
      fetch: async (url, o) => {
        red.cuerpo = JSON.parse(o.body);
        return {status: 200, json: async () => ({ok: true})};
      }
    });
    await win.Shalom.registrarEnvio('id_1790817830666');
    ok(red.cuerpo.op === 'registrarEnvio', 'pide la orquestacion');
    ok(JSON.stringify(red.cuerpo.datos) ===
       JSON.stringify({pedidoId: 'id_1790817830666'}),
    'y manda SOLO el id del pedido — salio: ' +
       JSON.stringify(red.cuerpo.datos));
  }

  {
    /* Y la funcion lee la cuenta y el origen de Firestore, no del navegador. */
    const fidx = E.leer('functions/index.js');
    const i = fidx.indexOf('paso.orquestar === "registrarEnvio"');
    const orq = fidx.slice(i, i + 2200);
    ok(i > 0, 'la orquestacion esta conectada en la funcion');
    ok(/cfgDoc\.agenciaOrigen/.test(orq),
       'la agencia de origen sale de Firestore');
    ok(/cfgDoc\.shalomInstancia/.test(orq),
       'y la cuenta de Shalom tambien');
    ok(/shalomRegistroSimulacro !== false/.test(orq),
       'y el simulacro esta encendido salvo que Config diga lo contrario');
    ok(/estado: "duda"/.test(orq),
       'y si algo revienta a mitad se dice DUDA, no fallo: el envio pudo crearse');
  }
};
