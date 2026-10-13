/**
 * tests/dni-pedido.test.js — un dato, una casa
 * ==============================================
 * ⚠️ EL FALLO DEL 13/10/2026. El dueño corrigió un pedido en el panel: el
 * destinatario pasó de DUBER GARCIA PEÑA (DNI 76307875) a JOSE LINO CORDOVA
 * MORETO (DNI 44049239). Imprimió a las 5:51 p. m. una etiqueta con el
 * nombre nuevo y el documento viejo.
 *
 * El mismo dato vivía en TRES campos —`dni`, `dniRecoger`,
 * `dniDestinatario`— y cada uno de los nueve sitios que lo leían usaba su
 * propio orden. La etiqueta pegada al paquete decía 76307875; el registro en
 * Shalom mandaba 44049239. En la agencia eso significa que no se lo entregan
 * a nadie.
 *
 * Aquí se prueba la regla, EJECUTÁNDOLA contra las seis formas reales de
 * pedido que este proyecto sabe crear.
 */
'use strict';
const D = require('../functions/dniPedido.js');
const E = require('./_entorno.js');

/* LAS SEIS FORMAS REALES. No inventadas: así las escribe el código hoy.
   formulario.html:1619-1672 · config.js saveShipment · config.js importExcel */
const FORM_AGENCIA = {dni: '44049239', dniRecoger: '44049239',
  agenciaId: '1234', name: 'JOSE LINO'};
const FORM_ENCOMIENDA = {dni: '44049239', dniDestinatario: '44049239',
  ciudadDestino: 'PIURA', encAgencia: 'Shalom Piura'};
const FORM_DELIVERY = {dni: '44049239', address: 'Av. Siempre Viva 742'};
const PANEL_NUEVO = {dni: '44049239', agenciaId: '1234'};
// EL DE HOY: nació en el formulario a nombre de DUBER, se corrigió en el panel.
const EDITADO = {dni: '44049239', dniRecoger: '76307875', name: 'JOSE LINO'};
// Antes de que existiera el campo `dni`. La clave NO ESTÁ, no está vacía.
const ANTIGUO = {dniRecoger: '76307875'};

module.exports = async ({bloque, ok}) => {

  bloque('⚠️ El fallo del 13/10: el nombre nuevo con el documento viejo');

  {
    ok(D.de(EDITADO) === '44049239',
       '⚠️ ESTE ES EL FALLO: un pedido corregido en el panel da el DNI ' +
       'NUEVO. Antes la etiqueta leia `dniRecoger || dni` y salia 76307875, ' +
       'el documento del destinatario ANTERIOR — salio: ' + D.de(EDITADO));
    ok(D.de(EDITADO) === D.de({dni: '44049239'}),
       'y da lo mismo que si nunca hubiera tenido copias: la copia vieja ya ' +
       'no pinta nada');
  }

  bloque('Las seis formas de pedido que este proyecto sabe crear');

  {
    ok(D.de(FORM_AGENCIA) === '44049239', 'formulario · agencia');
    ok(D.de(FORM_ENCOMIENDA) === '44049239', 'formulario · encomienda');
    ok(D.de(FORM_DELIVERY) === '44049239', 'formulario · delivery');
    ok(D.de(PANEL_NUEVO) === '44049239', 'panel · nuevo envio');
    ok(D.de(ANTIGUO) === '76307875',
       '⚠️ y un pedido de antes de que existiera el campo `dni` SIGUE ' +
       'imprimiendo igual que hoy: para eso existe el respaldo, y para nada ' +
       'mas');
    ok(D.de({dniDestinatario: '12345678'}) === '12345678',
       'uno importado de Excel, que solo traia la copia de encomienda');
  }

  bloque('⚠️ La bisagra: «no existe» NO es «esta vacio»');

  {
    /* LOS CINCO LECTORES ROTOS USABAN `a || b || c`, y ese encadenado no
       distingue las dos cosas. De la distincion dependen los dos casos que
       se contradicen, y uno de ellos es un fallo silencioso: con `||`,
       BORRAR un documento haria reaparecer el de otra persona. */
    ok(D.de({dni: '', dniRecoger: '76307875'}) === '',
       '⚠️ si BORRASTE el DNI, se queda borrado: no se resucita el anterior. ' +
       'Borrar es una decision, y una decision no se deshace sola');
    ok(D.de({dni: '   ', dniRecoger: '76307875'}) === '',
       'y vaciarlo a base de espacios cuenta igual');
    ok(D.de({dniRecoger: '76307875'}) === '76307875',
       'pero si la clave NO ESTA —nunca existio— si se mira la copia');
    ok(D.de({dni: null, dniRecoger: '76307875'}) === '76307875',
       'y `null` cuenta como que no esta: lo escribe quien no escribio nada');
  }
  {
    ok(D.de({}) === '' && D.de(null) === '' && D.de(undefined) === '',
       'sin pedido no se revienta');
    ok(D.de({dni: ' 44049239 '}) === '44049239', 'se recortan los espacios');
    /* Quitar lo que no fueran digitos parecia mas limpio hasta caer en el
       carne de extranjeria, que lleva letras. */
    ok(D.de({dni: 'CE-123456'}) === 'CE-123456',
       'y NO se normaliza: un carne de extranjeria lleva letras, y quitarlas ' +
       'lo destrozaria. Quien necesita 8 digitos ya los exige por su cuenta');
  }

  bloque('El rotulo sale del TIPO DE ENVIO, no de que copia este llena');

  {
    ok(D.etiqueta(FORM_ENCOMIENDA) === 'DNI destinatario', 'encomienda');
    ok(D.etiqueta(FORM_AGENCIA) === 'DNI para recoger', 'agencia');
    ok(D.etiqueta(FORM_DELIVERY) === 'DNI', 'delivery');
    ok(D.etiqueta(PANEL_NUEVO) === 'DNI para recoger',
       '⚠️ y un pedido a agencia creado DESDE EL PANEL tambien, aunque no ' +
       'tenga `dniRecoger`: antes el rotulo seguia al campo en vez de al ' +
       'hecho, y a ese cliente se le decia «DNI» a secas');
    ok(D.etiqueta({}) === 'DNI', 'y sin datos, lo neutro');
  }

  bloque('Las copias viejas: se ponen al dia, pero NO se estrenan');

  {
    ok(JSON.stringify(D.copiasAlDia(EDITADO, '44049239')) ===
       '{"dniRecoger":"44049239"}',
       'la copia que el pedido YA TENIA se pone al dia');
    ok(JSON.stringify(D.copiasAlDia(PANEL_NUEVO, '44049239')) === '{}',
       '⚠️ y al que no la tenia NO se le añade: abrir y guardar un pedido ' +
       'antiguo no le estrena campos. Lo pidio el dueño asi');
    ok(JSON.stringify(D.copiasAlDia({dniRecoger: 'x'}, '')) ===
       '{"dniRecoger":""}',
       'borrar tambien viaja: dejarla con el valor viejo es justo lo que ' +
       'imprimio el documento de otra persona');
    ok(JSON.stringify(D.copiasAlDia(FORM_ENCOMIENDA, '9')) ===
       '{"dniDestinatario":"9"}', 'la de encomienda, igual');
    ok(JSON.stringify(D.copiasAlDia(null, '9')) === '{}',
       'y sin pedido previo —un envio nuevo— no se escribe ninguna');
  }

  bloque('⚠️ Y NADIE lee las copias por su cuenta');

  {
    /* LA REGLA ESTRUCTURAL. Si un solo sitio vuelve a escribir
       `s.dniRecoger || s.dni`, el fallo vuelve entero: basta con que ESE
       sitio sea el que imprime la etiqueta. */
    const sinCom = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
    const sueltos = [];
    ['print.js', 'config.js', 'index.html', 'formulario.html'].forEach((f) => {
      const src = sinCom(E.leer(f));
      // Una lectura directa de la copia, fuera de `DniPedido` y del respaldo
      // de una linea que cada archivo tiene por si el modulo no cargo.
      const re = /\b\w+\.dniRecoger\s*\|\|/g;
      let m;
      while ((m = re.exec(src))) {
        const ctx = src.slice(Math.max(0, m.index - 120), m.index + 60);
        if (!/DniPedido/.test(ctx)) sueltos.push(f + ': ' + m[0]);
      }
    });
    ok(sueltos.length === 0,
       '⚠️ ningun archivo encadena `.dniRecoger ||` por su cuenta — ese ' +
       'encadenado ES el fallo. Sobran: ' + sueltos.join(' · '));
  }
  {
    /* Sin comentarios: el de print.js CITA el fallo —`s.dniRecoger || s.dni`—
       y contar una cita como reincidencia es confundir hablar con hacer. */
    const pr = E.leer('print.js').replace(/\/\*[\s\S]*?\*\//g, '');
    ok(/_dniDe\(s\)/.test(pr) && !/s\.dniRecoger/.test(pr),
       'la etiqueta y la lista impresa pasan las dos por el lector unico');
    const idx = E.leer('index.html');
    ok(/functions\/dniPedido\.js/.test(idx), 'el panel carga el modulo');
    ok(/functions\/dniPedido\.js/.test(E.leer('formulario.html')),
       'y el formulario publico tambien: los dos leen la MISMA regla, que es ' +
       'la razon de que viva en functions/');
  }

  bloque('Lo que se GUARDA desde hoy no deja copias atrasadas');

  {
    const cfg = E.leer('config.js');
    ok(/DniPedido\.copiasAlDia\(/.test(cfg),
       'al guardar se ponen al dia las copias que el pedido ya tenia');
    ok(/data\.updatedAt\s*=/.test(cfg),
       '⚠️ y se sella CUANDO se corrigio: sin eso, «rellenar con los ultimos ' +
       'datos» ordenaba por `createdAt` y te ofrecia el pedido mas NUEVO, no ' +
       'el ultimo que corregiste');
    const ord = cfg.slice(cfg.indexOf('cands.sort'),
        cfg.indexOf('cands.sort') + 240);
    ok(/updatedAt/.test(ord) && ord.indexOf('updatedAt') < ord.indexOf('createdAt'),
       'y el orden lo usa PRIMERO, con `createdAt` detras para los pedidos ' +
       'de antes de hoy, que no lo tienen');
  }
  {
    const cfg = E.leer('config.js');
    const imp = cfg.slice(cfg.indexOf('function importExcel'),
        cfg.indexOf('function importExcel') + 2000);
    ok(/dni:\s*\(row\['DNI'\]/.test(imp),
       '⚠️ importar Excel escribe `dni`. Antes escribia SOLO ' +
       '`dniDestinatario` y el exportador lee `dni`: exportar e importar ' +
       'perdia el documento, la etiqueta salia sin DNI, y registrar en ' +
       'Shalom contestaba «el DNI debe tener 8 digitos» con el numero ' +
       'delante en la pantalla');
  }
};
