/**
 * tests/reniec-publico.test.js — abrir RENIEC al publico, y cerrarlo bien
 * =========================================================================
 * El dueño pidio que al escribir su DNI el cliente vea su nombre oficial.
 * Para el negocio es claro: un nombre a mano llega con faltas, sin tildes o
 * con el apellido delante, y eso es lo que Shalom rechaza al registrar.
 *
 * ⚠️ PERO ESO ABRE UN BUSCADOR DE NOMBRES POR DNI EN INTERNET, PAGADO CON SU
 * CLAVE. Hasta hoy la consulta vivia detras de `shalomPuerta`, que exige
 * token de Firebase Y estar en la lista de administradores. Eso no era un
 * descuido: era la barrera. Lo que se prueba aqui es lo que la sustituye.
 */
'use strict';
const R = require('../functions/reniecPublico.js');
const E = require('./_entorno.js');

const OK = {dni: '44049239', appCheck: true, consultasHoy: 0, ahora: 1e12};

module.exports = async ({bloque, ok}) => {

  bloque('⚠️ App Check se exige ANTES de mirar la cache');

  {
    const r = R.decidir(Object.assign({}, OK, {appCheck: false}));
    ok(r.accion === 'rechazar' && r.motivo === 'SIN_APPCHECK',
       'sin la prueba de que viene de la pagina real, no se contesta');
  }
  {
    /* ⚠️ Y EL ORDEN IMPORTA, no es estetica. Al reves, un robot sin App
       Check podria ir preguntando DNIs y quedarse con todos los que alguna
       vez consulto un cliente de verdad: la cache se convertiria en la
       lista de clientes del negocio, servida gratis y sin coste para el
       atacante, porque de la cache no se paga. */
    const cache = {nombres: 'JOSE', apePaterno: 'LINO', cuando: 1e12};
    const r = R.decidir(Object.assign({}, OK, {appCheck: false, cache}));
    ok(r.accion === 'rechazar' && r.motivo === 'SIN_APPCHECK',
       '⚠️ ni siquiera lo YA GUARDADO sale sin App Check: la cache es la ' +
       'lista de clientes del negocio, y de la cache no se paga — seria el ' +
       'dato mas barato de robar');
  }

  bloque('El tope diario: lo unico que de verdad acota el daño');

  {
    ok(R.decidir(Object.assign({}, OK, {consultasHoy: R.LIMITE_DIA - 1}))
        .accion === 'consultar', 'justo debajo del tope, se consulta');
    const r = R.decidir(Object.assign({}, OK, {consultasHoy: R.LIMITE_DIA}));
    ok(r.accion === 'rechazar' && r.motivo === 'TOPE_DIA',
       'en el tope, no');
    ok(/escribe tu nombre/i.test(r.detalle),
       '⚠️ y se DEGRADA, no se rompe: al cliente se le pide que escriba su ' +
       'nombre, que es lo que hacia ayer. Un tope que deja a la gente sin ' +
       'poder pedir protege la factura y hunde el negocio');
  }
  {
    /* Un tope que se alcanza un martes cualquiera no protege nada: se apaga
       solo y nadie se entera de por que dejo de funcionar. */
    ok(R.LIMITE_DIA >= 100 && R.LIMITE_DIA <= 500,
       'el tope deja sitio a un dia bueno, a los que escriben mal el DNI y ' +
       'lo corrigen, y a los que abandonan a medias — salio: ' + R.LIMITE_DIA);
  }
  {
    // Lo cacheado NO gasta tope: no cuesta nada y no es una consulta.
    const cache = {nombres: 'JOSE', apePaterno: 'LINO', cuando: 1e12};
    const r = R.decidir(Object.assign({}, OK,
        {cache, consultasHoy: R.LIMITE_DIA + 50}));
    ok(r.accion === 'cache',
       'con el tope pasado, lo ya guardado se sigue sirviendo: no cuesta ' +
       'nada, asi que negarlo seria castigar al cliente por nada');
  }

  bloque('⚠️ El dia se cuenta en hora de Lima, no en UTC');

  {
    /* En UTC el dia cambia a las 7 de la tarde de Peru: el tope se
       reiniciaria en mitad de la tarde —las horas de mas pedidos— y se
       agotaria a media mañana. Un tope diario tiene que partir la NOCHE. */
    ok(R.diaDe(Date.parse('2026-10-15T03:00:00Z')) === '2026-10-14',
       'las 22:00 del 14 en Lima son del dia 14, aunque en UTC ya sea 15');
    ok(R.diaDe(Date.parse('2026-10-15T05:30:00Z')) === '2026-10-15',
       'y las 00:30 del 15 en Lima, del 15');
  }

  bloque('La cache: un DNI ya consultado no vuelve a costar');

  {
    const ahora = 1e12;
    ok(R.cacheVale({nombres: 'A', cuando: ahora - 1000}, ahora),
       'lo recien guardado vale');
    ok(!R.cacheVale({nombres: 'A', cuando: ahora - 400 * 86400000}, ahora),
       'lo de hace mas de un año, no — no caduca porque el nombre cambie, ' +
       'sino para que un dato mal guardado no se quede para siempre');
    ok(!R.cacheVale({cuando: ahora}, ahora), 'sin nombre no vale');
    ok(!R.cacheVale(null, ahora) && !R.cacheVale({}, 0), 'ni la basura');
  }
  {
    ok(R.normalizar('4404-9239') === '44049239', 'se limpia el DNI');
    ok(R.normalizar('123') === '' && R.normalizar('123456789') === '',
       'y lo que no son 8 digitos no es un DNI');
    ok(R.decidir({dni: 'x', appCheck: true}).motivo === 'DNI_NO_VALIDO',
       'que se rechaza antes de tocar nada');
  }

  bloque('⚠️ Solo el nombre cruza la frontera');

  {
    /* Nada de la respuesta cruda de Shalom pasa. Lo que no se copia a mano
       no se escapa el dia que ellos añadan un campo —una direccion, una
       fecha de nacimiento— que nadie pidio. */
    const g = R.guardable({nombres: 'JOSE LINO', apePaterno: 'CORDOVA',
      apeMaterno: 'MORETO', dni: '44049239', direccion: 'SU CASA 123',
      nacimiento: '1990-01-01'}, 1e12);
    ok(g.completo === 'JOSE LINO CORDOVA MORETO', 'se arma el nombre entero');
    const txt = JSON.stringify(g);
    ok(txt.indexOf('SU CASA') < 0 && txt.indexOf('1990') < 0,
       '⚠️ y NO viaja nada mas: ni direccion, ni fecha de nacimiento, ni un ' +
       'campo que Shalom añada mañana');
    ok(R.guardable({apePaterno: 'SOLO APELLIDO'}, 1e12) === null,
       'sin nombres no hay nada que guardar: medio nombre no es un nombre');
  }
  {
    const src = E.leer('functions/index.js');
    const i = src.indexOf('function _reniecFuera');
    const fn = src.slice(i, i + 500);
    ok(fn.indexOf('cuando') < 0,
       'lo que sale al navegador no lleva `cuando`: diria si ese documento ' +
       'ya habia pasado por aqui, y eso no le hace falta a nadie en pantalla');
  }

  bloque('⚠️ El navegador NO puede decir de quien es un DNI');

  {
    /* Si el formulario pudiera mandar `reniec: {...}` junto al pedido,
       cualquiera pondria el nombre que quisiera EN UNA ETIQUETA DE ENVIO
       REAL. El navegador pregunta; el servidor consulto, guardo, y se
       acuerda. */
    const src = E.leer('functions/index.js');
    const lista = src.slice(src.indexOf('const ORDER_FIELDS'),
        src.indexOf('const ORDER_FIELDS') + 900);
    ok(lista.indexOf('"reniec"') < 0,
       '⚠️ `reniec` NO esta en ORDER_FIELDS: lo que mande el navegador con ' +
       'ese nombre se tira antes de llegar a Firestore');
    const cr = src.slice(src.indexOf('async function handleCreate'),
        src.indexOf('async function handleToken'));
    ok(/panel\/reniec\/items\//.test(cr),
       'y el nombre oficial lo pone el SERVIDOR, leyendo su propia cache');
    ok(/normalizar\(orderToSave\.dni\)/.test(cr),
       '⚠️ y solo el que corresponde al DNI DEL PEDIDO: el cliente puede ' +
       'consultar un documento y escribir otro, y pegar el primero seria ' +
       'darle a Shalom el nombre de otra persona');
  }

  bloque('Que nada de esto pueda apagar el panel');

  {
    /* `_porLaPuerta` apunta los fallos y cierra el paso tras cinco
       seguidos. Correcto para el panel; peligroso aqui: una racha desde la
       pagina publica dejaria al dueño sin poder REGISTRAR ENVIOS. */
    const src = E.leer('functions/index.js');
    const fn = src.slice(src.indexOf('async function handleReniec'),
        src.indexOf('function _reniecFuera'));
    ok(fn.indexOf('_porLaPuerta') < 0,
       '⚠️ la consulta publica NO pasa por el interruptor: una racha de ' +
       'fallos desde la pagina del cliente no puede dejar al dueño sin ' +
       'poder registrar envios');
    ok(/shalomPuerta\.llamar\("dni"/.test(fn),
       'llama a la puerta directo, con la misma lista blanca de siempre');
  }
  {
    const src = E.leer('functions/index.js');
    const fn = src.slice(src.indexOf('async function handleReniec'),
        src.indexOf('function _reniecFuera'));
    const cuenta = fn.indexOf('FieldValue.increment(1)');
    const llama = fn.indexOf('shalomPuerta.llamar');
    ok(cuenta > 0 && llama > 0 && cuenta < llama,
       '⚠️ se CUENTA antes de llamar, no despues de acertar: contar solo ' +
       'los aciertos deja el gasto sin tope el dia que Shalom conteste mal ' +
       'a todo — cada fallo gratis para el contador y caro para la factura');
  }
  {
    const src = E.leer('functions/index.js');
    ok(/formApi_reniec:\s*\{windowMs:\s*60000,\s*max:\s*(\d+)\}/.test(src),
       'hay freno por IP para la accion nueva');
    const max = Number((src.match(/formApi_reniec:[^}]*max:\s*(\d+)/)||[])[1]);
    ok(max > 0 && max <= 20,
       'y es mas apretado que el de `client` (20), porque esta cuesta ' +
       'dinero de verdad y la otra solo una lectura — salio: ' + max);
  }

  bloque('⚠️ La marca se RECALCULA; no se recuerda');

  {
    /* Antes esto era un recuadro verde con el nombre dentro, justo encima
       del campo que ya tenia ese mismo nombre: el dato dos veces a dos
       dedos de distancia. Y peor — se pintaba UNA vez, al consultar, asi
       que si el cliente corregia su nombre despues, el recuadro seguia en
       pantalla afirmando algo que ya no era cierto.

       Es la misma clase de mentira en pantalla que costo la etiqueta con
       el DNI de otra persona: algo pintado en un momento y nunca revisado.

       Se ejecuta de verdad, con un DOM de mentira: lo que se comprueba es
       lo que PINTA, no lo que dice el fuente. */
    const form = E.leer('formulario.html');
    const src = form.slice(form.indexOf('function _nrmNom'),
        form.indexOf('function onDniInput'));
    const campos = {};
    const el = (v) => ({value: v, style: {}, innerHTML: '',
      classList: {remove: () => {}, add: () => {}, toggle: () => {}}});
    campos['f_name'] = el('');
    campos['dniMarca'] = el('');
    campos['err_name'] = el('');
    const M = new Function('$', 'esc', '_dniOficial', '_dniPuesto',
        src + ';return {marca:_dniMarca, usar:usarNombreDni, ' +
        'oficial:()=>_dniOficial, nom:_nrmNom};');
    const monta = (oficial, escrito) => {
      campos['f_name'] = el(escrito);
      campos['dniMarca'] = el('');
      const api = M((id) => campos[id] || null, (x) => String(x),
          oficial, '');
      api.marca();
      return campos['dniMarca'];
    };

    const igual = monta('JARLYN LLANOS ARTEAGA', 'JARLYN LLANOS ARTEAGA');
    ok(/Nombre según tu DNI/.test(igual.innerHTML),
       'coincide → una MARCA (y el campo se ilumina), no un recuadro');
    ok(igual.innerHTML.indexOf('JARLYN') < 0,
       '⚠️ y la marca NO repite el nombre: esta dos dedos mas arriba, en su ' +
       'campo. Decirlo dos veces es lo que pidio quitar el dueño');

    const tildes = monta('JOSÉ  LINO', 'jose lino');
    ok(/Nombre según tu DNI/.test(tildes.innerHTML),
       'las tildes, las mayusculas y los dobles espacios no son una ' +
       'discrepancia: un aviso que salta donde no hay problema es el que ' +
       'nadie lee cuando si lo hay');

    const distinto = monta('JARLYN LLANOS ARTEAGA', 'Jarlyn');
    ok(/(Según tu DNI|Completa tu nombre como en tu DNI)/.test(distinto.innerHTML) &&
       distinto.innerHTML.indexOf('JARLYN LLANOS ARTEAGA') > 0,
       '⚠️ y si NO coincide, ahi si se dice el nombre entero: es el dato ' +
       'que falta en pantalla, y el cliente puede tener razon');
    ok(/usarNombreDni\(\)/.test(distinto.innerHTML),
       'con un toque para usar el del documento — se le enseña y se le ' +
       'ofrece, no se le pisa');

    const vacio = monta('JARLYN LLANOS ARTEAGA', '');
    ok(vacio.style.display === 'none',
       'con el nombre vacio no se marca nada');
    const sinConsulta = monta('', 'LO QUE SEA');
    ok(sinConsulta.style.display === 'none',
       'y sin consulta tampoco: no se afirma lo que no se sabe');
  }
  {
    const form = E.leer('formulario.html');
    ok(/id="f_name"[\s\S]{0,120}oninput="onNombreInput\(this\)"/.test(form) &&
       /function onNombreInput\(el\)\{[\s\S]{0,500}_dniMarca\(\);/.test(form),
       '⚠️ la marca se repinta al ESCRIBIR en el nombre. Sin esto, corregir ' +
       'el nombre deja un ✅ en pantalla afirmando algo que ya no es cierto');
    const i = form.indexOf('function onDniInput');
    const fn = form.slice(i, i + 3000);
    ok(/_dniOficial=''/.test(fn),
       'y al cambiar el DNI se olvida lo oficial del anterior');
    ok(/_dniOficial=comp;\s*\n\s*_callar\(\);/.test(fn) && /_dniMarca\(\);\s+\/\/ había un nombre/.test(fn),
       'cuando sale bien, el aviso bajo el DNI se CALLA y habla la marca: ' +
       'el recuadro verde con el nombre dentro ya no existe');
  }

  bloque('En la pagina: nunca se pisa lo que escribio el cliente');

  {
    const form = E.leer('formulario.html');
    const i = form.indexOf('function onDniInput');
    const fn = form.slice(i, i + 2600);
    /* La regla se SIMPLIFICO al poner la marca: antes decia «vacio O lo que
       puso una consulta anterior», porque una consulta nueva tenia que
       poder pisar a la vieja. Ya no hace falta — al cambiar el DNI, el
       nombre automatico se borra arriba del todo, asi que si al llegar
       aqui el campo tiene algo, lo escribio el cliente. Y lo del cliente no
       se pisa: se le enseña la discrepancia y se le ofrece cambiarla. */
    ok(/if\(nm && !nm\.value\.trim\(\)\)\{/.test(fn),
       '⚠️ solo se rellena si el campo esta VACIO. Un formulario que deshace ' +
       'lo que acabas de escribir es un formulario del que te vas');
    ok(/_dniPuesto\s*=\s*''/.test(fn) || /nm\.value=''/.test(fn),
       'y al cambiar el DNI se borra el nombre automatico: un nombre pegado ' +
       'a otro documento es el nombre de otra persona');
    ok(/value\.replace\(\/\\D\/g,''\)!==dni\) return/.test(fn),
       '⚠️ y si el DNI cambio MIENTRAS se consultaba, lo que vuelve se tira: ' +
       'es la respuesta de otro documento');
    ok(/_decir\(_dniMensajeFalla\(r && r\.motivo\)\)/.test(fn) &&
       /escribe tu nombre completo/i.test(form.slice(form.indexOf('function _dniMensajeFalla('), form.indexOf('function dniReintentar('))),
       'si falla, se pide el nombre a mano — jamas se bloquea el pedido');
  }
};
