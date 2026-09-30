/**
 * tests/pedido-publico.test.js — qué ve el cliente de su pedido
 * ==============================================================
 * El link de seguimiento es público: quien tenga la dirección ve lo que
 * `functions/pedidoPublico.js` decida, y solo eso.
 *
 * Existe por un fallo real. `handleTrack` copiaba el pedido ENTERO y borraba
 * una lista de campos prohibidos, así que **cada campo nuevo nacía público**:
 * la clave de recojo se añadió al pedido y empezó a salir en la respuesta sin
 * que nada avisara. Es OWASP API3:2023 —Broken Object Property Level
 * Authorization— y su remedio documentado es enumerar lo permitido.
 */
'use strict';
const path = require('path');
const E = require('./_entorno.js');
const P = require(path.join(__dirname, '..', 'functions', 'pedidoPublico.js'));

module.exports = async ({bloque, ok}) => {

  bloque('Solo sale lo que está en la lista. Lo demás, no existe');

  {
    /* Un pedido con TODO lo que puede llevar hoy, inventado a mano para que
       incluya lo peligroso y también un campo que nadie previó. */
    const pedido = {
      id: 'id_1790', name: 'Ana', address: 'Av. X 100', status: 'ENVIADO',
      shalomGuia: '82037653', trackingStatus: 'En tránsito',
      // Lo que NO puede salir:
      shalomClave: '4821', agenciaId: '671', agenciaGeo: 'CALLAO|X|Y',
      phone: '999888777', cost: '350', privateNote: 'debe S/100',
      docGuia: {d: 'https://…'}, _dlvFirma: 'data:image…',
      _dlvDriverPhone: '911', gpsCoords: '-12,-77', cotizItems: [{}],
      statusPin: '1234', trackingWebRawStatus: 'x',
      campoQueNadiePrevio: 'esto es de dentro'
    };
    const r = P.proyectar(pedido, {code: '1790', frozen: false});

    ok(r.shalomClave === undefined,
       'LA CLAVE DE RECOJO NO SALE. Es lo único que separa el paquete de ' +
       'quien no debe llevárselo, y un link se reenvía, se queda en un ' +
       'historial y no caduca');
    ok(r.agenciaId === undefined && r.agenciaGeo === undefined,
       'ni los campos de agencia: el cliente no los necesita');
    ok(r.phone === undefined && r.cost === undefined &&
       r.privateNote === undefined && r.gpsCoords === undefined,
       'ni teléfono, costo, nota privada o GPS');
    ok(r.docGuia === undefined && r._dlvFirma === undefined &&
       r._dlvDriverPhone === undefined,
       'ni documentos, firmas ni datos del motorizado');
    ok(r.statusPin === undefined, 'ni la clave del panel, que no pinta nada aquí');
    ok(r.campoQueNadiePrevio === undefined,
       'y UN CAMPO QUE NADIE PREVIÓ tampoco sale. Ese es todo el punto: con ' +
       'lista negra habría salido, porque nadie se acuerda de prohibir algo ' +
       'que aún no existe');

    ok(r.name === 'Ana' && r.address === 'Av. X 100' && r.status === 'ENVIADO',
       'y lo que el cliente sí necesita, sale');
    ok(r.code === '1790' && r.frozen === false,
       'con lo que calcula el endpoint');
    ok(Object.keys(r).every((k) => P.CAMPOS.indexOf(k) >= 0),
       'ni una clave de más: todo lo devuelto está declarado');
  }

  bloque('Y hacen falta DOS equivocaciones para que se escape un secreto');

  {
    /* La segunda reja: aunque alguien meta un secreto en la lista blanca,
       `SECRETOS` lo quita igual. */
    const antes = P.CAMPOS.slice();
    P.CAMPOS.push('shalomClave');           // el error humano
    const r = P.proyectar({shalomClave: '4821', name: 'Ana'}, {});
    P.CAMPOS.length = 0; antes.forEach((x) => P.CAMPOS.push(x));

    ok(r.shalomClave === undefined,
       'metida a mano en la lista blanca, la clave SIGUE sin salir: una sola ' +
       'equivocación no basta para filtrarla');
    ok(P.secretosEn(r).length === 0, 'y se puede afirmar, no suponer');
    ok(P.secretosEn({shalomClave: 'x'}).length === 1,
       'el detector detecta de verdad — si no, la prueba de arriba no valdría');
  }

  bloque('La lista no se puede quedar corta sin que salte');

  {
    /* La prueba que impide romperle la pantalla al cliente: se leen los
       campos que `formulario.html` usa DE VERDAD y se exige que estén
       permitidos. Si mañana la página lee uno nuevo y nadie lo añade aquí,
       esto falla — en vez de que el cliente vea un hueco en blanco. */
    const pub = E.leer('formulario.html');
    const leidos = [...new Set((pub.match(/\bship\.[a-zA-Z_]+/g) || [])
        .map((x) => x.slice(5)))];
    ok(leidos.length > 10, 'se encontraron los campos que lee la página (' +
       leidos.length + ')');
    const faltan = leidos.filter((k) => P.CAMPOS.indexOf(k) < 0);
    ok(faltan.length === 0,
       'todos los campos que el link del cliente lee están permitidos — si no, ' +
       'el cliente vería huecos en blanco' +
       (faltan.length ? '\n      faltan: ' + faltan.join(', ') : ''));

    // Y al revés: ningún secreto puede estar en la lista blanca.
    const colados = P.SECRETOS.filter((k) => P.CAMPOS.indexOf(k) >= 0);
    ok(colados.length === 0,
       'y ningún secreto está declarado como público' +
       (colados.length ? ': ' + colados.join(', ') : ''));
  }

  bloque('El DNI sale recortado: 5 digitos, el resto tapado');

  {
    /* Tercera reja. Las dos primeras deciden QUE CAMPOS salen; esta decide
       CUANTO de un campo sale. El dueño pidio que el cliente siguiera viendo
       su DNI —lo necesita para recoger— pero no entero.

       LIMITE HONESTO, escrito aqui para que nadie lo olvide: enseñar 5 de 8
       digitos deja 1000 combinaciones. Quien tenga el link puede deducir el
       resto probando. Esto NO convierte el DNI en un secreto; reduce lo que
       se regala de un vistazo —una captura reenviada, alguien mirando la
       pantalla—. Lo que de verdad protege el dato es que el link no se pueda
       adivinar, y eso es otro paso. */
    const r = P.proyectar({
      dni: '75162882', dniRecoger: '75162882', dniDestinatario: '71613965',
      name: 'Ana'
    }, {});

    ok(r.dni === '75162***',
       'el DNI sale con 5 digitos y 3 tapados, no entero — salio: ' + r.dni);
    ok(r.dniRecoger === '75162***',
       'el DNI para recoger, igual — salio: ' + r.dniRecoger);
    ok(r.dniDestinatario === '71613***',
       'y el del destinatario, igual — salio: ' + r.dniDestinatario);

    const json = JSON.stringify(r);
    ok(json.indexOf('75162882') < 0 && json.indexOf('71613965') < 0,
       'y NINGUN documento entero aparece en la respuesta, en ningun campo');
  }

  {
    /* Se tapan SIEMPRE al menos 3. Sin esta regla, un documento corto —un
       carne mal escrito, un campo a medio llenar— saldria completo justo por
       ser corto, que es cuando menos hay que perder. */
    ok(P.proyectar({dni: '1234'}, {}).dni === '1***',
       'un documento de 4 sale con 3 tapados, no entero');
    ok(P.proyectar({dni: '123'}, {}).dni === '***',
       'uno de 3 sale entero tapado');
    ok(P.proyectar({dni: '712345678'}, {}).dni === '71234****',
       'uno de 9 —carne de extranjeria— enseña 5 y tapa 4');
  }

  {
    /* Lo que no hay, no se inventa. Un campo ausente que saliera como '***'
       le diria al cliente que hay un dato donde no lo hay, y a la pagina que
       pinte una fila vacia. */
    const sin = P.proyectar({name: 'Ana'}, {});
    ok(!('dni' in sin), 'un pedido sin DNI no gana un campo dni');
    ok(P.proyectar({dni: ''}, {}).dni === '',
       'y un DNI vacio sigue vacio, no se convierte en asteriscos');
    ok(P.proyectar({dni: null}, {}).dni === null,
       'un DNI nulo se queda nulo: enmascarar no es inventar');
  }

  {
    /* La reja vive en UN solo sitio. Si mañana otro camino de salida copia el
       pedido sin pasar por aqui, el DNI vuelve a salir entero y nadie se
       entera —que es exactamente como empezo lo de la clave de recojo. */
    const usos = ['functions/index.js', 'formulario.html', 'index.html',
      'print.js', 'respaldo.js', 'tracking.js']
        .filter((f) => E.existe(f))
        .filter((f) => /proyectar\s*\(/.test(E.leer(f)));
    ok(usos.length === 1 && usos[0] === 'functions/index.js',
       'solo `functions/index.js` proyecta; el resto no toca la reja' +
       (usos.length !== 1 ? ' — tambien: ' + usos.join(', ') : ''));
  }

  bloque('El endpoint usa la lista blanca, y solo esa');

  {
    const fidx = E.leer('functions/index.js');
    const track = fidx.slice(fidx.indexOf('async function handleTrack'),
        fidx.indexOf('// ── Rate limit'));
    ok(/pedidoPublico\.proyectar\(order, \{code, frozen\}\)/.test(track),
       '`handleTrack` proyecta con la lista blanca');
    ok(!/Object\.assign\(\{\}, order/.test(track),
       'y YA NO copia el pedido entero: ese era el fallo, no un detalle');
    ok(!/\.forEach\(\(k\) => delete safe\[k\]\);/.test(track) ||
       track.indexOf('trackingStatus", "trackingMessage"') > 0,
       'el único borrado que queda es el del estado de Shalom, que depende ' +
       'de un interruptor del operador — no es una lista de prohibidos');
  }
};
