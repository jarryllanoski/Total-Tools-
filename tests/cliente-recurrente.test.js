/**
 * tests/cliente-recurrente.test.js — el mismo cliente, otra vez
 * ===============================================================
 * Cuando un cliente que ya compró vuelve a pedir, el panel ofrece rellenar
 * sus datos del historial. Lo que se prueba aquí es QUÉ se copia, y sobre
 * todo A QUIÉN se copia.
 *
 * ⚠️ EL TELÉFONO NO ES LA PERSONA. En los datos reales del dueño, el número
 * 940703156 pertenece a DOS personas distintas: DUBER GARCIA PEÑA (DNI
 * 76307875) y JOSE LINO CORDOVA MORETO (44049239). Escribir ese número
 * rellenaba los datos de una de las dos EN SILENCIO, eligiendo «la más
 * reciente» — y la etiqueta salía con el documento de otra persona, por el
 * mismo camino que ya costó arreglar una vez.
 *
 * Es la regla que el proyecto ya aplica a las instancias y a las agencias:
 *   · Adivinar  = elegir entre varias cuando no se sabe cuál. Prohibido.
 *   · Preguntar = enseñarlas y que elija el dueño. Eso sí.
 */
'use strict';
const E = require('./_entorno.js');
const DP = require('../functions/dniPedido.js');

/* El trozo de verdad de config.js, aislado y EJECUTADO. `_dniDe` se inyecta
   con la regla real —la del módulo compartido— y no con una sustituta: un
   doble más simple que el original es por donde se cuela un fallo. */
const src = E.trozo('config.js', 'function _norm9', 'function _clienteBuscar');
const M = new Function('_dniDe',
    src + ';return {elegir:_clienteElegir, copia:CLIENTE_COPIA, norm9:_norm9};'
)(DP.de);

const DUBER = {id: 'a', name: 'DUBER GARCIA PEÑA', phone: '940703156',
  dni: '76307875', createdAt: '2026-09-01'};
const JOSE = {id: 'b', name: 'JOSE LINO CORDOVA MORETO', phone: '940703156',
  dni: '44049239', createdAt: '2026-10-10'};

module.exports = async ({bloque, ok}) => {

  bloque('⚠️ Un telefono, dos personas: NO se elige sola');

  {
    const r = M.elegir([DUBER, JOSE], '940703156', '');
    ok(r.estado === 'varios',
       '⚠️ EL CASO REAL DEL DUEÑO: 940703156 son DOS clientes, y se dice. ' +
       'Antes se cogia «el mas reciente» en silencio y el DNI de uno acababa ' +
       'en el paquete del otro — salio: ' + r.estado);
    ok(r.varios.length === 2, 'y se ofrecen las dos, no una');
    const dnis = r.varios.map((x) => x.dni).sort().join(',');
    ok(dnis === '44049239,76307875',
       'cada una con SU documento a la vista, para poder distinguirlas: ' +
       dnis);
  }
  {
    /* EL DNI ES LA PERSONA, y por eso no hay ambiguedad posible cuando se
       escribe: es exacto y no se comparte. */
    const r = M.elegir([DUBER, JOSE], '940703156', '44049239');
    ok(r.estado === 'uno' && r.uno.id === 'b',
       '⚠️ pero si escribes el DNI, manda el DNI aunque el telefono sea de ' +
       'dos: el documento identifica a la persona, el numero solo la ' +
       'localiza');
  }
  {
    const r = M.elegir([DUBER, JOSE], '', '76307875');
    ok(r.estado === 'uno' && r.uno.id === 'a', 'y el otro DNI, al otro');
  }

  bloque('Un cliente de verdad repetido: se rellena sin preguntar');

  {
    const viejo = Object.assign({}, JOSE, {id: 'v', address: 'vieja',
      createdAt: '2026-09-01'});
    const nuevo = Object.assign({}, JOSE, {id: 'n', address: 'nueva',
      createdAt: '2026-10-01'});
    const r = M.elegir([viejo, nuevo], '940703156', '');
    ok(r.estado === 'uno',
       'dos pedidos del MISMO DNI son una sola persona, no dos: un pedido ' +
       'repetido no es una contradiccion');
    ok(r.uno.id === 'n', 'y se ofrece el mas reciente');
  }
  {
    /* ★ EL MAS RECIENTEMENTE CORREGIDO, no el mas reciente. Si corriges un
       pedido viejo, lo corregido es lo bueno — aunque naciera antes. */
    const viejo = Object.assign({}, JOSE, {id: 'v', address: 'CORREGIDA',
      createdAt: '2026-09-01', updatedAt: '2026-10-13T20:00:00Z'});
    const nuevo = Object.assign({}, JOSE, {id: 'n', address: 'sin tocar',
      createdAt: '2026-10-01'});
    const r = M.elegir([viejo, nuevo], '940703156', '');
    ok(r.uno.id === 'v',
       '⚠️ gana el CORREGIDO, no el mas nuevo: «los ultimos datos ' +
       'guardados» es lo que pidio el dueño, y nacer antes no los hace ' +
       'viejos — salio: ' + r.uno.id);
  }
  {
    // Sin DNI en ninguno, lo unico que distingue a dos personas es el nombre.
    const a = {id: 'a', name: 'ANA', phone: '940703156'};
    const b = {id: 'b', name: 'BETO', phone: '940703156'};
    ok(M.elegir([a, b], '940703156', '').estado === 'varios',
       'sin DNI, dos nombres distintos tambien se preguntan');
    const a2 = Object.assign({}, a, {id: 'a2', address: 'otra'});
    ok(M.elegir([a, a2], '940703156', '').estado === 'uno',
       'pero dos pedidos del mismo nombre son uno');
  }
  {
    /* ⚠️ UN PEDIDO SIN DNI NO PARTE EN DOS A QUIEN SI LO TIENE. Seria
       preguntar por un dato que FALTA, no por una contradiccion — y
       preguntar de mas acaba en que nadie lee lo que se pregunta. */
    const sinDni = {id: 'c', name: 'JOSE LINO CORDOVA MORETO',
      phone: '940703156'};
    const r = M.elegir([JOSE, sinDni], '940703156', '');
    ok(r.estado === 'uno',
       'un pedido sin DNI no crea una segunda persona: falta un dato, no ' +
       'sobra una contradiccion');
  }
  {
    ok(M.elegir([], '940703156', '').estado === 'ninguno', 'sin historial');
    ok(M.elegir([JOSE], '999999999', '').estado === 'ninguno', 'otro numero');
    ok(M.elegir(null, '9', '').estado === 'ninguno', 'y nada no revienta');
    ok(M.norm9('51940703156') === '940703156',
       'el 51 de Peru no cuenta como parte del numero');
  }

  bloque('⚠️ Lo de Shalom NO es del cliente: es de ESE paquete');

  {
    /* La guia, el codigo, la clave de recojo y las medidas nacen y mueren
       con un paquete concreto. Copiarlos daria por REGISTRADO un pedido que
       no existe, y le daria al cliente una clave que no abre nada. */
    const prohibidos = ['shalomGuia', 'shalomCodigo', 'shalomClave',
      'trackingOrderNumber', 'trackingOrderCode', 'shalomEstado',
      'shalomMonto', 'shalomRegistradoEn', 'pkgLargo', 'pkgAncho', 'pkgAlto',
      'pkgPeso', 'pkgTipo', 'status', 'date', 'monto', 'adelanto', 'cost',
      'notes', 'links', 'reniec'];
    const sobran = prohibidos.filter((c) => M.copia.indexOf(c) >= 0);
    ok(sobran.length === 0,
       '⚠️ la lista de lo que se copia NO incluye nada de Shalom ni del ' +
       'paquete ni del dinero. Sobran: ' + sobran.join(', '));
    ok(M.copia.indexOf('name') >= 0 && M.copia.indexOf('dni') >= 0 &&
       M.copia.indexOf('address') >= 0,
       'y si lo del cliente: nombre, documento, direccion');
    ok(M.copia.indexOf('agenciaId') >= 0,
       '⚠️ y la AGENCIA IDENTIFICADA. Sin el `agenciaId` el pedido repetido ' +
       'sale «sin identificar» e IRREGISTRABLE en Shalom, y hay que volver a ' +
       'buscar la agencia a mano en cada envio');
  }
  {
    /* La lista es dato, pero quien rellena es codigo: que no se desvie. */
    const fn = E.trozo('config.js', 'function _clienteRellenar(i)',
        '/* ── PEGAR PEDIDO DE WHATSAPP')
        .replace(/\/\*[\s\S]*?\*\//g, '');
    ['fShalomGuia', 'fShalomCodigo', 'fShalomClave', 'fPkgLargo', 'fPkgPeso',
      'fStatus', 'fDate', 'fMonto'].forEach((campo) => {
      ok(fn.indexOf(campo) < 0,
         'el rellenado no toca ' + campo + ' — ni una vez');
    });
    ok(/_agElegida\s*=/.test(fn) && /_agTexto\s*=/.test(fn),
       'y si deja la agencia identificada, que es lo que la hace registrable');
    ok(/\$\('fAddr'\)\|\|\{value:''\}\)\.value === dirDe/.test(fn),
       '⚠️ pero SOLO si el texto de la direccion es el de esa agencia: un id ' +
       'pegado a una direccion que no es la suya es como se manda un paquete ' +
       'pagado a otra ciudad');
  }

  bloque('⚠️ Un formulario nuevo no enseña restos del anterior');

  {
    /* EL FALLO DEL 14/10/2026. El dueño abrio un pedido NUEVO despues de
       editar uno registrado, y la cabecera del desplegable seguia diciendo
       «PAQUETE L · CLAVE 6277 · REGISTRADO» — con el cuerpo justo debajo
       diciendo «guarda el pedido y vuelve a abrirlo». Creyo que el pedido
       nuevo habia nacido registrado. No lo estaba; pero eso no se podia
       saber mirando, y una pantalla que se contradice a dos centimetros de
       distancia da mas miedo que un error. */
    const cfg = E.leer('config.js');
    const pin = cfg.slice(cfg.indexOf('function _pintarRegistroShalom'));
    const sal = pin.indexOf('Guarda el pedido y vuelve a abrirlo');
    const antes = pin.slice(0, sal);
    ok(/_pintarResumenPaquete\(null, null, false\)/.test(antes),
       '⚠️ al abrir un pedido nuevo se limpia la CABECERA antes de salir: ' +
       'esa puerta de atras se iba sin repintarla');
  }
  {
    /* El vigilante de guias repetidas pintaba ANTES de que el campo se
       limpiara, y dejaba el aviso del pedido anterior colgado sobre un campo
       vacio. Vaciar por codigo no dispara `input`: nadie repintaba. */
    const cfg = E.leer('config.js').replace(/\/\*[\s\S]*?\*\//g, '');
    const ini = cfg.indexOf('function openForm');
    const cuerpo = cfg.slice(ini, ini + 9000);
    const limpia = cuerpo.indexOf("$('fShalomGuia').value   = ''");
    const vigila = cuerpo.indexOf("Guias.vigilar('fShalomGuia', '')");
    ok(limpia > 0 && vigila > 0, 'las dos lineas siguen ahi');
    ok(limpia < vigila,
       '⚠️ se LIMPIA el campo y DESPUES se vigila. Al reves, el vigilante ' +
       'lee la guia del pedido anterior y deja «esta guia ya esta en otro ' +
       'pedido» sobre un campo que se vacia justo despues');
  }
};
