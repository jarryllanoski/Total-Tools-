'use strict';
const PF = require('../functions/pedidoForm.js');

module.exports = async ({bloque, ok}) => {
  bloque('Servidor: cada campo del formulario se limpia segun su tipo');
  {
    ok(PF.texto('<img src=x onerror=alert(1)>Ana', 120) === 'img src=x onerror=alert(1)Ana', 'sin < ni >: ningun texto puede abrir una etiqueta HTML');
    ok(PF.texto('Av. Lima 123\r\nfrente al parque', 600) === 'Av. Lima 123\nfrente al parque', 'conserva los saltos de linea de la direccion');
    ok(PF.texto('Ana\u0000\u0007\u001b Lopez\u007f', 120) === 'Ana Lopez', 'quita los caracteres de control invisibles');
    ok(PF.texto('  Ana    Lopez \t ', 120) === 'Ana Lopez', 'espacios de mas fuera');
    ok(PF.texto('x'.repeat(900), 600).length === 600 && PF.texto(123, 10) === '' && PF.texto({a: 1}, 10) === '', 'tope de largo, y lo que no es texto queda vacio');
    ok(PF.texto('María José Ñahui O\'Higgins "La Casa"', 120) === 'María José Ñahui O\'Higgins "La Casa"', 'tildes, ñ, apostrofos y comillas de una direccion real se respetan');

    ok(PF.celular('+51 987-654-321') === '987654321' && PF.celular('987654321') === '987654321', 'celular: solo los 9 digitos');
    ok(PF.celular('9876') === '' && PF.celular('<script>') === '' && PF.celular(null) === '', 'un celular incompleto o con codigo queda vacio');
    ok(PF.digitos('7654-3210', 12) === '76543210' && PF.digitos('<b>1</b>', 12) === '1', 'documentos: solo digitos');

    const L = (o) => PF.limpiar(o);
    ok(L({courier: 'OLVA COURIER'}).courier === 'OLVA COURIER' && L({courier: 'RECOJO EN TIENDA (LIMA)'}).courier === 'RECOJO EN TIENDA (LIMA)', 'courier normal intacto');
    ok(L({courier: '<script>alert(1)</script>'}).courier === 'scriptalert(1)/script' && !/["'<>]/.test(L({courier: 'A"B\'C<D>'}).courier),
       'courier con codigo: sin < > ni comillas (la / se permite: «LIMA / PROVINCIA»)');
    ok(L({date: '2026-11-16'}).date === '2026-11-16' && !('date' in L({date: '16/11 <b>'})), 'fecha solo AAAA-MM-DD');
    ok(L({gpsCoords: '-11.8732,-77.0712'}).gpsCoords === '-11.8732,-77.0712' && !('gpsCoords' in L({gpsCoords: 'javascript:1'})), 'coordenadas solo numeros');
    ok(Object.keys(L({extra: Object.fromEntries(Array.from({length: 30}, (_, i) => ['campo' + i, 'v' + i]))}).extra).length === 20, 'campos extra: maximo 20');
    ok(L({extra: {'<b>Talla</b>': '<i>M</i>', n: 5}}).extra['bTalla/b'] === 'iM/i' && L({extra: {'<b>Talla</b>': 'M', n: 5}}).extra.n === '',
       'campos extra: claves y valores limpios, lo que no es texto vacio');
    ok(!('extra' in L({extra: ['a', 'b']})) && !('extra' in L({extra: 'texto'})), 'extra que no es un objeto: nada');

    const peligrosos = {status: 'FINALIZADO', cost: '0', monto: '1', adelanto: '1', docGuia: {d: 'javascript:x'}, docEmbalado: {}, docComprobante: {},
      links: [{u: 'javascript:alert(1)'}], sel: true, chkGuia: true, createdAt: '2020-01-01', fromForm: false, id: 'id_pirata',
      trackToken: 't1_pirata', alertas: [], trackLegado: true, nroComprobante: 'F001-1', privateNote: 'x', reniec: {}};
    const r = L(Object.assign({name: 'Ana', phone: '987654321'}, peligrosos));
    ok(Object.keys(peligrosos).every((k) => !(k in r)),
       '⚠️ el cliente no puede mandar estado, montos, documentos, links, marcas, fechas, ids ni notas privadas: solo sus datos');
  }

  bloque('Servidor: links seguros');
  {
    ok(PF.linkSeguro('https://drive.google.com/file/d/abc').u === 'https://drive.google.com/file/d/abc', 'https: si');
    ok(PF.linkSeguro('javascript:alert(1)') === null && PF.linkSeguro('http://inseguro.example') === null &&
       PF.linkSeguro('https://x.example/"onerror=1') === null && PF.linkSeguro('data:text/html,x') === null && PF.linkSeguro(5) === null,
       'javascript:, http, comillas, data: o algo que no es texto: no');
    ok(PF.linkSeguro('https://x.example/' + 'a'.repeat(40)).n.endsWith('…'), 'el nombre visible se acorta');
  }
};
