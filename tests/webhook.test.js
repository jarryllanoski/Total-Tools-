/**
 * tests/webhook.test.js — la única puerta pública del sistema
 * ============================================================
 * Cualquiera en internet puede llamar a esta función. Lo único que separa un
 * aviso de Shalom de uno inventado es la firma — así que aquí se prueba sobre
 * todo lo que NO debe pasar.
 *
 * Y una prueba existe por una lección concreta: firmamos solo el cuerpo
 * durante días. La firma es sobre `"<momento>.<cuerpo crudo>"`. Un cuerpo
 * reparseado y vuelto a serializar tiene otros bytes, y entonces no cuadra
 * nunca — pero el síntoma es el mismo que una firma mal calculada.
 */
'use strict';
const crypto = require('crypto');
const path = require('path');
const E = require('./_entorno.js');
const W = require(path.join(__dirname, '..', 'functions', 'webhook.js'));

const SECRETO = 'whsec_esto_es_de_prueba';
const CUERPO = '{"orderNumber":"82037653","status":"IN_TRANSIT"}';

const firmar = (cuerpo, t, secreto) => crypto
    .createHmac('sha256', secreto || SECRETO)
    .update(t + '.' + cuerpo).digest('hex');
const cab = (t, v1) => 't=' + t + ',v1=' + v1;
const ahora = () => Math.floor(Date.now() / 1000);

module.exports = async ({bloque, ok}) => {

  bloque('Un aviso de verdad entra');

  {
    const t = ahora();
    const r = W.verificarFirma(cab(t, firmar(CUERPO, t)), CUERPO, SECRETO, Date.now());
    ok(r.ok === true, 'firma correcta sobre "momento.cuerpo"');
    ok(r.t === t, 'y devuelve el momento que venía firmado');
  }
  {
    const t = ahora();
    const buf = Buffer.from(CUERPO, 'utf8');
    ok(W.verificarFirma(cab(t, firmar(CUERPO, t)), buf, SECRETO, Date.now()).ok,
       'funciona con el cuerpo como Buffer, que es como llega de verdad');
  }
  {
    const t = ahora();
    const f = firmar(CUERPO, t).toUpperCase();
    ok(W.verificarFirma(cab(t, f), CUERPO, SECRETO, Date.now()).ok,
       'y la firma en mayúsculas también: el hexadecimal no distingue');
  }

  bloque('LA LECCIÓN QUE COSTÓ DÍAS: se firma momento + cuerpo');

  {
    /* Durante días firmamos SOLO el cuerpo. El síntoma es idéntico al de una
       firma mal calculada, así que se busca en el sitio equivocado. */
    const t = ahora();
    const soloCuerpo = crypto.createHmac('sha256', SECRETO)
        .update(CUERPO).digest('hex');
    ok(W.verificarFirma(cab(t, soloCuerpo), CUERPO, SECRETO, Date.now()).ok === false,
       'una firma hecha SOLO sobre el cuerpo se rechaza');
  }
  {
    /* Y el cuerpo tiene que ser el CRUDO. Reparsear el JSON y volver a
       serializarlo da los mismos datos y OTROS bytes. */
    const t = ahora();
    const bueno = firmar(CUERPO, t);
    const conEspacio = '{ "orderNumber":"82037653","status":"IN_TRANSIT"}';
    ok(W.verificarFirma(cab(t, bueno), conEspacio, SECRETO, Date.now()).ok === false,
       'un byte distinto en el cuerpo invalida la firma — por eso se usa el crudo');
  }

  bloque('Lo que NO debe pasar');

  {
    const t = ahora();
    const r = W.verificarFirma(cab(t, '0'.repeat(64)), CUERPO, SECRETO, Date.now());
    ok(r.motivo === 'FIRMA_INVALIDA', 'una firma inventada no pasa');
  }
  {
    const t = ahora();
    const bueno = firmar(CUERPO, t);
    const alterado = '{"orderNumber":"82037653","status":"DELIVERED"}';
    ok(W.verificarFirma(cab(t, bueno), alterado, SECRETO, Date.now()).ok === false,
       'cambiar el estado por el camino invalida la firma — nadie puede ' +
       'inventar que tu pedido llegó');
  }
  {
    const t = ahora();
    ok(W.verificarFirma(cab(t, firmar(CUERPO, t, 'otro_secreto')), CUERPO,
        SECRETO, Date.now()).motivo === 'FIRMA_INVALIDA',
       'firmado con otro secreto, tampoco');
  }
  {
    const viejo = ahora() - (W.TOLERANCIA_S + 60);
    ok(W.verificarFirma(cab(viejo, firmar(CUERPO, viejo)), CUERPO, SECRETO,
        Date.now()).motivo === 'FIRMA_VENCIDA',
       'un aviso viejo REPETIDO no vale: sin esto, quien grabe una llamada ' +
       'válida puede reenviarla para siempre');
  }
  {
    const futuro = ahora() + (W.TOLERANCIA_S + 60);
    ok(W.verificarFirma(cab(futuro, firmar(CUERPO, futuro)), CUERPO, SECRETO,
        Date.now()).motivo === 'FIRMA_VENCIDA', 'ni uno del futuro');
  }
  {
    const t = ahora();
    ok(W.verificarFirma(cab(t, firmar(CUERPO, t)), CUERPO, '', Date.now())
        .motivo === 'SIN_SECRETO',
       'sin secreto configurado NO se acepta nada — ni para probar');
  }
  {
    const t = ahora();
    const enorme = 'x'.repeat(W.CUERPO_MAX + 10);
    ok(W.verificarFirma(cab(t, firmar(enorme, t)), enorme, SECRETO, Date.now())
        .motivo === 'CUERPO_ENORME',
       'un cuerpo gigante se corta antes de calcular nada');
  }
  ['', 'basura', 't=123', 'v1=abc', 't=abc,v1=' + '0'.repeat(64),
    't=123,v1=corta', 't=123,v1=' + 'z'.repeat(64)].forEach((c) => {
    ok(W.verificarFirma(c, CUERPO, SECRETO, Date.now()).motivo ===
       'FIRMA_MAL_FORMADA', 'cabecera "' + c + '" se descarta sin más');
  });

  {
    /* La comparación no se puede probar por comportamiento: `===` y
       `timingSafeEqual` devuelven lo mismo. La diferencia es CUÁNTO TARDAN —
       `===` se rinde en el primer byte distinto, y midiendo esos tiempos se
       puede reconstruir la firma byte a byte. Así que se comprueba el código. */
    const src = E.leer('functions/webhook.js');
    ok(/crypto\.timingSafeEqual/.test(src),
       'la firma se compara en tiempo constante, no con ===');
    ok(!/v1 === esperada|esperada === /.test(src),
       'y no hay una comparación directa escondida al lado');
  }

  bloque('El mismo aviso no se aplica dos veces');

  {
    const t = ahora();
    const c1 = cab(t, firmar(CUERPO, t));
    ok(W.idDeEvento(c1) === W.idDeEvento(c1),
       'el mismo aviso da el mismo identificador — Shalom reintenta, y aplicar ' +
       'dos veces duplica historiales');
    const otro = '{"orderNumber":"82037653","status":"DELIVERED"}';
    ok(W.idDeEvento(cab(t, firmar(otro, t))) !== W.idDeEvento(c1),
       'dos avisos distintos dan identificadores distintos');
    ok(W.idDeEvento(cab(t + 1, firmar(CUERPO, t + 1))) !== W.idDeEvento(c1),
       'y el mismo cuerpo en otro momento, también');
    ok(/^[A-Za-z0-9_]+$/.test(W.idDeEvento(c1)),
       'y sirve como nombre de documento en Firestore');
    ok(W.idDeEvento('basura') === null, 'una cabecera rota no genera id');
  }

  bloque('Se mide el vocabulario sin guardar datos de nadie');

  {
    const evento = {
      status: 'IN_TRANSIT',
      orderNumber: '82037653',
      client: {name: 'Ana Pérez', address: 'Av. Bayovar 311'},
      history: [{code: 'PICKED_UP'}, {code: 'IN_TRANSIT'}]
    };
    const c = W.codigos(evento);
    const texto = JSON.stringify(c);
    ok(c.status === 'IN_TRANSIT', 'se anota el código de estado, que es lo que hay que medir');
    ok(c['history[0].code'] === 'PICKED_UP', 'y los que vengan anidados o en listas');
    ok(texto.indexOf('Ana') < 0 && texto.indexOf('Bayovar') < 0,
       'pero NI el nombre NI la dirección del cliente: solo se anota lo que ' +
       'está en MAYÚSCULAS, que nunca es una persona');
    ok(texto.indexOf('82037653') < 0, 'ni la guía, que no es vocabulario');
  }
  ok(Object.keys(W.codigos(null)).length === 0 &&
     Object.keys(W.codigos('hola')).length === 0,
     'sin evento, nada que anotar');
  ok(W.codigos({a: 'SI'}).a === undefined, 'un código de dos letras no cuenta');

  bloque('No se escribe nada antes de verificar');

  {
    const idx = E.leer('functions/index.js');
    const fn = idx.slice(idx.indexOf('const _shalomWebhook = onRequest'),
        idx.indexOf('exports.barridoShalom'));
    const antes = fn.slice(0, fn.indexOf('if (!v.ok)'));
    ok(antes.indexOf('db.doc') < 0 && antes.indexOf('.set(') < 0,
       'antes de comprobar la firma no se toca la base de datos');
    ok(/create\(\{recibido/.test(fn),
       'el descarte de repetidos usa create(): mirar y marcar en UNA operación, ' +
       'sin hueco entre medio para un segundo intento');
    const rechazo = fn.slice(fn.indexOf('if (!v.ok)'), fn.indexOf('const id ='));
    ok(rechazo.indexOf('crudo') < 0,
       'y de un aviso sin firma no se guarda el cuerpo: si no está firmado, no ' +
       'hay razón para creer nada de lo que trae');
    ok(/res\.status\(401\)\.send\("no"\)/.test(rechazo),
       'se responde corto y sin detalle: decir QUÉ falló ayuda a quien prueba');
  }

  bloque('Aparcado de verdad: no basta con borrar el despliegue');

  {
    /* 22/09/2026. Se retiro el despliegue de `shalomWebhook` porque era una
       puerta publica abierta que no recibia nada —Shalom nunca llego a
       registrar la URL— y cada peticion rechazada costaba una escritura.
       Pero borrar la funcion desplegada NO borra el `exports`: el siguiente
       `firebase deploy --only functions` la habria vuelto a crear sola, y la
       puerta reaparecia sin que nadie se enterara. De ahi el interruptor. */
    const idx = E.leer('functions/index.js');
    const m = /const WEBHOOK_ACTIVO = (true|false);/.exec(idx);
    ok(m, 'el webhook tiene un interruptor explicito, no un despliegue ' +
       'borrado a mano que nadie recuerda');
    ok(/\n *if \(WEBHOOK_ACTIVO\) exports\.shalomWebhook = _shalomWebhook;/
        .test(idx),
       'y el export cuelga de el: con false, `firebase deploy` ni ve la funcion');
    ok(!/^exports\.shalomWebhook/m.test(idx),
       'no queda ningun export suelto que se despliegue por su cuenta');

    if (m && m[1] === 'true') {
      /* Si alguien vuelve a encenderlo, que no reviva tambien el agujero de
         costo: un contador que escribe en CADA golpe convierte la puerta
         publica en una factura. */
      const fn = idx.slice(idx.indexOf('const _shalomWebhook = onRequest'),
          idx.indexOf('exports.barridoShalom'));
      const rechazo = fn.slice(fn.indexOf('if (!v.ok)'), fn.indexOf('const id ='));
      ok(rechazo.indexOf('rechazados: FieldValue.increment(1)') < 0,
         'y antes de encenderlo hay que arreglar el contador de rechazos: ' +
         'una escritura por cada peticion invalida la paga el dueno');
    }
  }
};
