/**
 * tests/agencias.test.js — la agencia de destino, identificada
 * =============================================================
 * Aquí se prueba lo único que impide que un envío PAGADO salga a la ciudad
 * equivocada. Dos reglas, y las dos vienen de medir, no de suponer:
 *
 *   1. El id y el texto de la dirección no pueden divergir. Tocar la
 *      dirección a mano borra el id.
 *   2. Un `ter_id` guardado no es una promesa: se verifica antes de gastar.
 *
 * El caso del id 671 es REAL, comparando las extracciones del 19 jul y el
 * 5 sep de 2026: pasó de CALLAO/VENTANILLA ("POR DEFINIR") a
 * AREQUIPA/SACHACA. Shalom recicla los ids de los huecos.
 */
'use strict';
const E = require('./_entorno.js');

module.exports = async ({bloque, ok}) => {
  /* Vive en functions/ porque lo comparten el panel, el formulario público y
     la Cloud Function que recibe los pedidos. Una copia por lado divergiría,
     y divergir aquí es aceptar en un sitio lo que el otro rechaza. */
  const A = require(require('path').join(__dirname, '..', 'functions', 'agencias.js'));

  const AG = {ter_id: '671', nombre: 'CALLAO / CALLAO / VENTANILLA / POR DEFINIR',
    lugar_over: 'VENTANILLA', departamento: 'CALLAO', provincia: 'CALLAO',
    distrito: 'VENTANILLA'};
  // El MISMO id, dos meses después, en otro departamento.
  const AG_MUDADA = {ter_id: '671', nombre: 'AREQUIPA / AREQUIPA / SACHACA / VARIANTE UCHUMAYO CO',
    lugar_over: 'VARIANTE UCHUMAYO', departamento: 'AREQUIPA', provincia: 'AREQUIPA',
    distrito: 'SACHACA'};

  bloque('El id solo se guarda cuando de verdad se conoce');

  {
    const e = A.elegida(AG, 'SHALOM');
    ok(e && e.agenciaId === '671', 'elegir de la lista guarda el ter_id');
    ok(e.agenciaCourier === 'SHALOM',
       'y de qué catálogo es: el 3 de Olva no es el 3 de Shalom, y mezclarlos ' +
       'manda el paquete a otro sitio');
    ok(e.agenciaGeo === 'CALLAO|CALLAO|VENTANILLA',
       'y la ubicación, que es lo que se compara después');
    ok(e.agenciaNombre === 'VENTANILLA', 'y el nombre, para enseñarlo');

    ok(A.elegida(AG, 'OLVA COURIER').agenciaCourier === 'OLVA', 'Olva también');
    ok(A.elegida(AG, 'DELIVERY') === null,
       'pero con un courier que no tiene catálogo, NADA: un id sin saber de ' +
       'quién es no significa nada');
    ok(A.elegida({ter_id: '', nombre: 'x'}, 'SHALOM') === null,
       'y una agencia sin id tampoco se guarda a medias');
    ok(A.elegida(null, 'SHALOM') === null && A.elegida('x', 'SHALOM') === null,
       'ni con basura');
  }

  bloque('Un ter_id es solo dígitos');

  ok(A.idValido('671') && A.idValido('3'), 'los de verdad pasan');
  ok(A.idValido(671), 'un número también: la API los manda así y el catálogo ' +
     'como texto, y esa diferencia no puede decidir nada');
  ok(!A.idValido('671a') && !A.idValido('../x') && !A.idValido('6 71'),
     'lo que no es un número, no');
  ok(!A.idValido('') && !A.idValido(null) && !A.idValido(undefined),
     'ni vacío');
  ok(!A.idValido('12345678901'), 'ni uno absurdamente largo');

  bloque('⚠️ El caso 671: el mismo id, otra ciudad');

  {
    /* Un pedido guardado en julio apuntando a Ventanilla, verificado contra
       el catálogo de septiembre. Sin esta comprobación, el envío salía
       PAGADO rumbo a Arequipa y nada chillaba. */
    const pedido = A.elegida(AG, 'SHALOM');
    const hoy = [AG_MUDADA];

    const v = A.verificar(pedido, hoy);
    ok(v.ok === false, 'NO pasa: el id ya no apunta a donde creíamos');
    ok(v.motivo === 'SE_MUDO', 'y se dice por qué');
    ok(v.de === 'CALLAO|CALLAO|VENTANILLA' && v.a === 'AREQUIPA|AREQUIPA|SACHACA',
       'con el de dónde a dónde, para que el aviso sirva de algo');

    ok(A.verificar(pedido, [AG]).ok === true,
       'y contra el catálogo de su época, pasa sin molestar');
  }

  bloque('…pero un retoque del nombre NO es una mudanza');

  {
    /* Entre julio y septiembre 13 agencias cambiaron de nombre sin moverse
       ("HUARAZ" → "HUARAZ CO") y 17 cambiaron de calle dentro del mismo
       distrito. Verificar por NOMBRE daría 13 falsas alarmas y el aviso
       dejaría de leerse. Por eso se compara el distrito. */
    const pedido = A.elegida({ter_id: '125', lugar_over: 'HUARAZ',
      departamento: 'ANCASH', provincia: 'HUARAZ', distrito: 'HUARAZ'}, 'SHALOM');
    const renombrada = [{ter_id: '125', lugar_over: 'HUARAZ CO',
      departamento: 'ANCASH', provincia: 'HUARAZ', distrito: 'HUARAZ'}];
    ok(A.verificar(pedido, renombrada).ok === true,
       'le cambiaron el nombre y sigue siendo la misma agencia: no se molesta ' +
       'al operador');

    const mudadaDeCalle = [{ter_id: '125', lugar_over: 'HUARAZ',
      departamento: 'ANCASH', provincia: 'HUARAZ', distrito: 'HUARAZ',
      direccion: 'OTRA CALLE 999'}];
    ok(A.verificar(pedido, mudadaDeCalle).ok === true,
       'y cambiar de local dentro del mismo distrito tampoco: el ter_id sigue ' +
       'siendo correcto, Shalom sabe dónde está su propia agencia');

    const conTildes = [{ter_id: '125', lugar_over: 'Huaraz',
      departamento: 'Áncash', provincia: 'Huaraz', distrito: 'huaraz'}];
    ok(A.verificar(A.elegida({ter_id: '125', departamento: 'ANCASH',
      provincia: 'HUARAZ', distrito: 'HUARAZ'}, 'SHALOM'), conTildes).ok === true,
       'y las tildes y mayúsculas no cuentan como mudanza');
  }

  bloque('La ubicación se lee venga como venga');

  {
    /* El catálogo guardado dice `distrito`; la respuesta cruda de la API dice
       `zona`. Este módulo lo comparten el panel, el formulario público y el
       servidor, y no todos reciben la misma forma. Si una se leyera vacía, la
       verificación no tendría nada que comparar y dejaría pasar cualquier
       mudanza. */
    ok(A.geoDe({departamento: 'LIMA', provincia: 'LIMA', distrito: 'COMAS'}) ===
       'LIMA|LIMA|COMAS', 'con `distrito`, la del catálogo guardado');
    ok(A.geoDe({departamento: 'LIMA', provincia: 'LIMA', zona: 'COMAS'}) ===
       'LIMA|LIMA|COMAS', 'y con `zona`, la de la API — misma respuesta');
    ok(A.geoDe({departamento: 'LIMA', provincia: 'LIMA',
      distrito: 'COMAS', zona: 'OTRA'}) === 'LIMA|LIMA|COMAS',
       'si vienen las dos manda `distrito`: es la del catálogo con el que se ' +
       'va a comparar');
    ok(A.geoDe(null) === '' && A.geoDe('x') === '', 'y con basura, vacío');
  }

  bloque('Un id que desapareció del catálogo no se registra');

  {
    /* Seis ids se fueron entre julio y septiembre. Un id que ya no existe no
       se puede verificar, y lo que no se verifica no se registra. */
    const pedido = A.elegida(AG, 'SHALOM');
    const v = A.verificar(pedido, [{ter_id: '999', departamento: 'X'}]);
    ok(v.ok === false && v.motivo === 'NO_ESTA',
       'el id ya no está en el catálogo: se para y se dice');
    ok(A.verificar(pedido, []).motivo === 'NO_ESTA', 'con catálogo vacío igual');
    ok(A.verificar(pedido, null).motivo === 'NO_ESTA', 'y sin catálogo tampoco pasa');
  }

  bloque('Sin agencia identificada no se registra: no se adivina');

  ok(A.verificar({}, [AG]).motivo === 'SIN_AGENCIA', 'un pedido sin id no pasa');
  ok(A.verificar({agenciaId: '671'}, [AG]).motivo === 'SIN_AGENCIA',
     'ni con id pero sin saber de qué catálogo');
  ok(A.verificar(null, [AG]).motivo === 'SIN_AGENCIA', 'ni con nada');
  ok(!A.identificada({}) && !A.identificada(null), 'y `identificada` dice que no');
  ok(A.identificada(A.elegida(AG, 'SHALOM')), 'con los cuatro campos, sí');

  bloque('Abrir un pedido antiguo y guardarlo NO le añade campos');

  {
    /* Esto es lo que el dueño pidió con todas las letras: los cambios de hoy
       no tocan lo de antes. Si `limpiar` devolviera nulls siempre, cada
       pedido viejo que se abriera ganaría cuatro campos vacíos en la nube. */
    ok(Object.keys(A.limpiar({name: 'Ana', address: 'x'})).length === 0,
       'un pedido que nunca tuvo agencia no gana NI UN campo al guardarse');
    ok(Object.keys(A.limpiar({})).length === 0, 'ni uno vacío');
    ok(Object.keys(A.limpiar(null)).length === 0, 'ni con nada');
    ok(Object.keys(A.limpiar({agenciaId: null, agenciaNombre: ''})).length === 0,
       'ni uno que ya los tenía en blanco: borrar lo ya borrado es una ' +
       'escritura de más');

    const l = A.limpiar(A.elegida(AG, 'SHALOM'));
    ok(Object.keys(l).length === 4 && l.agenciaId === null,
       'pero uno que SÍ tenía id se limpia con nulls — así el borrado viaja a ' +
       'la nube, que es lo que impide que un id viejo quede pegado a una ' +
       'dirección nueva');
    ok(A.CAMPOS.every((k) => k in l), 'los cuatro, ninguno a medias');
  }

  bloque('Contra el catálogo REAL del repositorio');

  {
    /* No contra agencias inventadas: contra las 552 que el panel usa hoy. */
    const cat = JSON.parse(E.leer('data/agencias-shalom.json')).agencias;
    ok(cat.every((a) => A.idValido(a.ter_id)),
       'las 552 del catálogo tienen un ter_id que este módulo acepta');
    ok(cat.every((a) => A.geoDe(a).split('|').length === 3 &&
        A.geoDe(a).split('|').every((x) => x.length > 0)),
       'y las 552 dan una ubicación completa: si alguna viniera sin distrito, ' +
       'su verificación no podría comparar nada');
    const real = cat[0];
    ok(A.verificar(A.elegida(real, 'SHALOM'), cat).ok === true,
       'y elegir una de verdad y verificarla contra el mismo catálogo, pasa');
  }

  bloque('Los siete caminos por los que entra una dirección');

  {
    const cfg  = E.leer('config.js');
    const html = E.leer('index.html');
    const pub  = E.leer('formulario.html');
    const fidx = E.leer('functions/index.js');

    /* 1-4 · EL PANEL. La regla no se cuelga de eventos: se compara el TEXTO.
       `fAddr` dispara `onAddrInput` también AL RECIBIR EL FOCO, así que
       escuchar eventos habría borrado el id por solo tocar el campo. */
    ok(/oninput="onAddrInput\(this\.value\)" onfocus="onAddrInput\(this\.value\)"/
        .test(html),
       'el campo de dirección sigue disparando también al recibir el foco — ' +
       'por eso la regla NO puede colgarse de eventos');
    ok(/if\(txt !== _agTexto \|\| cur !== _agElegida\.agenciaCourier\)/.test(cfg),
       'y se compara el texto exacto Y el courier: con eso quedan cubiertos ' +
       'escribir, pegar, el relleno de WhatsApp y cualquier cambio por código');
    ok(/_agTexto = \$\('fAddr'\)\.value;/.test(cfg),
       'al elegir se guarda el texto contra el que se comparará');
    ok(/Agencias\.elegida\(ag, \(\$\('fCourier'\)\|\|\{value:''\}\)\.value\)/.test(cfg),
       '`pickShalomAgency` ya no tira el ter_id: lo guarda');
    ok(/\$\('fCourier'\)\.onchange = function\(\)\{ _showShalomBlock\(\); _agPintar\(\); \}/
        .test(cfg),
       'cambiar de courier repinta: el id de Olva no vale para Shalom');

    /* Lo que el dueño pidió con todas las letras: no tocar lo antiguo. */
    ok(/Object\.assign\(data, Agencias\.limpiar\(/.test(cfg),
       'al guardar sin agencia vigente se usa `limpiar()`, que devuelve {} si ' +
       'el pedido nunca tuvo una: abrir y guardar un pedido antiguo NO le ' +
       'añade campos');
    ok(/_agTexto = _s0\.address\|\|'';/.test(cfg),
       'y al abrir un pedido que SÍ la tenía, el texto de referencia es el ' +
       'suyo: si no lo tocas, el id sobrevive');

    /* 5-7 · EL LINK — y con él el rápido y el personalizado, que caen en el
       mismo formulario. */
    ok(/window\._agIdent = \(window\.Agencias \? Agencias\.elegida\(ag, key\) : null\)/
        .test(pub),
       'el formulario del cliente guarda el ter_id que ya capturaba y tiraba');
    ok((pub.match(/window\._agIdent = null;/g) || []).length === 3,
       'y lo suelta en los TRES caminos que rompen la correspondencia: ' +
       'escribir a mano, la ✕ y la entrada manual de Olva');
    ok(/window\._agIdentTxt === finalAddress/.test(pub),
       'y al enviar se compara el texto, igual que en el panel: entre elegir ' +
       'y enviar puede haber pasado cualquier cosa');
    ok(/agenciaId:      _agOk \? _agOk\.agenciaId      : ''/.test(pub),
       'los campos viajan en el pedido');

    /* EL SERVIDOR — el filtro que los habría tirado en silencio. */
    ok(/"agenciaId", "agenciaNombre", "agenciaGeo", "agenciaCourier",/.test(fidx),
       'la lista blanca del servidor los deja pasar. Sin esto se descartarían ' +
       'sin dar error: los mandas, no falla nada, y no llegan');
    ok(/agenciaId: 10, agenciaNombre: 120/.test(fidx), 'con su tope de tamaño');
    ok(/if \(!agencias\.idValido\(out\.agenciaId\) \|\|/.test(fidx),
       'y se VALIDAN, no solo se recortan: `agenciaId: "../x"` recortado ' +
       'sigue siendo basura');
    ok(/agencias\.CAMPOS\.forEach\(\(k\) => delete out\[k\]\);/.test(fidx),
       'y se limpian los CUATRO: tres campos sin el cuarto harían que el ' +
       'panel dijera "identificada" sobre algo que no se puede registrar');
    ok(/require\("\.\/agencias"\)/.test(fidx),
       'con el MISMO módulo que el panel, no con una copia que se ' +
       'desincronice');
  }

  bloque('Un archivo, tres consumidores');

  {
    /* Vive en functions/ por lo mismo que etiquetas.js: lo comparten el
       panel, el formulario público y la Cloud Function. */
    ok(E.existe('functions/agencias.js'), 'el módulo vive en functions/');
    ok(!E.existe('agencias.js'), 'y no hay copia en la raíz');
    ok(/<script src="functions\/agencias\.js/.test(E.leer('index.html')),
       'el panel lo carga');
    ok(/<script src="functions\/agencias\.js/.test(E.leer('formulario.html')),
       'el formulario público también');
    ok(/require\("\.\/agencias"\)/.test(E.leer('functions/index.js')),
       'y el servidor');
  }
};
