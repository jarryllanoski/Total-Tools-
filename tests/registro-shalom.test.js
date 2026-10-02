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
};
