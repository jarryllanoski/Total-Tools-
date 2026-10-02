/**
 * tests/enlace.test.js — EL LINK DE SEGUIMIENTO NO SE ADIVINA
 * ============================================================
 * El token del link era `id_` + el reloj en milisegundos. O sea: no era un
 * secreto. Quien tuviera UN link sabia aproximadamente cuando se crearon los
 * demas, y `handleTrack` no tenia freno de peticiones — asi que nada impedia
 * probar millones de valores hasta dar con pedidos ajenos, cada uno con
 * nombre, direccion y documento.
 *
 * ⚠️ LA REGLA QUE MANDA SOBRE TODO ESTE ARCHIVO
 * Los links YA ENVIADOS por WhatsApp tienen que seguir abriendo. Para
 * siempre. Un cliente no tiene por que enterarse de que cambiamos nada, y a
 * ningun pedido antiguo se le escribe un solo campo.
 */
'use strict';
const path = require('path');
const E = require('./_entorno.js');
const L = require(path.join(__dirname, '..', 'functions', 'enlaceSeguimiento.js'));

module.exports = async ({bloque, ok}) => {

  bloque('Los links de ayer siguen abriendo. Eso manda');

  {
    ok(L.tipoDe('id_1790617556159') === 'legado',
       'un token del reloj —los links ya enviados— se reconoce como legado');
    ok(L.tipoDe('id_1') === 'legado',
       'y uno corto tambien: el formato viejo no se le exige a nadie');

    /* ★ LAS DOS FAMILIAS DE ID, MEDIDAS SOBRE LOS 1197 PEDIDOS REALES
       (30 sep 2026, contadas en el panel antes de escribir esta reja):

           id_#############          879  (73%)  `id_` + el reloj
           id_#############_xxxx     318  (27%)  ...y CUATRO caracteres mas

       MEDIR ESTO NO FUE UN TRAMITE. Mi primer instinto fue exigir `id_` + 13
       digitos, que es lo que produce `Date.now()`. Habria rechazado las 318
       del segundo grupo: el 27% de los clientes con su link muerto, y sin
       enterarnos hasta que alguno llamara. La reja se escribio ANCHA a
       proposito —solo exige el prefijo `id_`— porque aqui el error caro es
       rechazar de mas: lo que pase esta reja todavia tiene que EXISTIR en la
       base de datos, asi que aceptar de mas no abre ninguna puerta. */
    ok(L.LEGADO.test('id_1790617556159'),
       'familia 1: `id_` + el reloj, los que crea el panel');
    ok(L.LEGADO.test('xl_1783091211461_2r83'),
       'familia 2: `xl_`, los IMPORTADOS DE EXCEL — estos SI se rompieron');
    ok(L.LEGADO.test('id_1790617556159_a3f2'),
       'y los que llevan sufijo de cuatro');

    /* ★ EL FALLO QUE PAGO ESTA REJA, escrito para no repetirlo.
       Pedi medir los ids reales antes de escribir esto, y estuvo bien. Pero
       el script que escribi reemplazaba las letras por `a`, asi que `id_` y
       `xl_` salian LOS DOS como `aa_`: la medicion destruyo exactamente el
       dato que la decision necesitaba. La tabla decia "dos familias" cuando
       en realidad eran cuatro, y yo exigi `id_`. Los pedidos de Excel
       dejaron de abrir su link.

       La leccion NO es "añadir xl_". Es que enumerar prefijos es apostar a
       haberlos visto todos — y medir mal da la misma confianza que medir
       bien. Esta reja ya no mira prefijos: solo impide lo que de verdad
       tiene que impedir. */
    ['xl_1783091211461_2r83', 'id_1790617556159', 'ped_99', 'A1', '7',
      'loquesea_2026_abc']
        .forEach((real) => {
          ok(L.tipoDe(real) === 'legado',
             'cualquier prefijo historico pasa: ' + real);
        });
    ok(L.tipoDe('id_1790617556159_a3f2') === 'legado',
       'y se enruta como legado, no como basura');

    ['id_1790617556159_aaaa', 'id_1790617556159_9999',
      'id_1790617556159_a1b2', 'id_1790617556159_1a2b']
        .forEach((real) => {
          ok(L.tipoDe(real) === 'legado',
             'todas las mezclas de letra y numero del sufijo: ' + real);
        });
  }

  bloque('El linter no tumba el despliegue');

  {
    /* `firebase deploy` corre `eslint .` ANTES de subir nada, asi que un
       error de estilo no es cosmetico: PARA EL DESPLIEGUE EN SECO. Me paso
       con este mismo archivo — declare `btoa` y `Buffer` en el comentario de
       globales y ESLint los rechazo con `no-redeclare`, porque ya los conoce.
       Jarry se comio el error en su terminal por mi culpa.

       Los modulos de functions/ que llevan meses pasando el linter declaran
       EXACTAMENTE dos globales. Esta prueba exige lo mismo de los nuevos. */
    const YA_CONOCIDOS = ['btoa', 'atob', 'Buffer', 'console', 'process',
      'URL', 'TextEncoder', 'TextDecoder', 'setTimeout', 'require', 'module'];
    ['enlaceSeguimiento', 'pedidoPublico', 'agencias', 'etiquetas']
        .forEach((nombre) => {
          const src = E.leer('functions/' + nombre + '.js');
          const m = src.match(/\/\* global ([^*]*)\*\//);
          if (!m) return;
          const listados = m[1].split(',').map((x) => x.trim()).filter(Boolean);
          const malos = listados.filter((g) => YA_CONOCIDOS.indexOf(g) >= 0);
          ok(malos.length === 0,
             nombre + '.js no redeclara globales que ESLint ya conoce' +
             (malos.length ? ' — tumbaria el despliegue: ' + malos.join(', ') : ''));
        });
  }

  {
    /* Y el largo de linea, que es la otra regla que corta despliegues.
       Google pone el tope en 80 CARACTERES — contados en caracteres, no en
       bytes: las tildes y los `─` de los titulos ocupan 2 y 3 bytes, asi que
       medirlo con herramientas de bytes da falsos positivos. */
    ['enlaceSeguimiento', 'pedidoPublico'].forEach((nombre) => {
      const largas = E.leer('functions/' + nombre + '.js')
          .split('\n').map((l, i) => [i + 1, l.length])
          .filter((x) => x[1] > 80);
      ok(largas.length === 0,
         nombre + '.js no pasa de 80 caracteres por linea' +
         (largas.length ? ' — lineas: ' +
           largas.slice(0, 4).map((x) => x[0]).join(', ') : ''));
    });
  }

  bloque('Un token nuevo no se adivina, y nunca se confunde con uno viejo');

  {
    const t = L.generar();
    ok(/^t1_[A-Za-z0-9_-]{22}$/.test(t),
       'el token nuevo lleva marca de version y 22 caracteres al azar — salio: ' + t);
    ok(L.tipoDe(t) === 'nuevo', 'y se reconoce como nuevo');

    /* POR QUE LLEVA PREFIJO `t1_` Y NO ES AL AZAR A SECAS.
       Sin prefijo, un token al azar podria empezar por "id_" de casualidad
       —una vez cada 262.144—. El servidor lo tomaria por un id viejo,
       buscaria un documento que no existe, y el cliente veria "link no
       disponible" sin que nadie entendiera por que. Un fallo asi aparece
       meses despues y es imposible de reproducir. El prefijo lo hace
       imposible por construccion, no improbable. */
    const mil = [];
    for (let i = 0; i < 1000; i++) mil.push(L.generar());
    ok(mil.every((x) => L.tipoDe(x) === 'nuevo'),
       'mil tokens seguidos: NINGUNO se confunde con un id viejo');
    ok(new Set(mil).size === 1000, 'y los mil son distintos entre si');
  }

  bloque('Sale del generador criptografico, o no sale');

  {
    /* Esta prueba es de COMPORTAMIENTO, no de leer el codigo. Ya me paso una
       vez: comprobe que el archivo mencionaba `getRandomValues` y la
       mencion seguia ahi, en una rama muerta, mientras el codigo caia a
       `Math.random()`. Un texto en el fuente no prueba nada. */
    let llamado = 0;
    const real = L._crypto();
    L._crypto({getRandomValues: (a) => { llamado++; return real.getRandomValues(a); }});
    L.generar();
    L._crypto(real);
    ok(llamado === 1, 'generar() pide bytes al generador criptografico');
  }

  {
    /* Y si no hay generador, SE PARA. No se inventa uno peor.
       `Math.random()` produce una secuencia deducible a partir de las
       anteriores: un token asi seria adivinable, que es justo el fallo que
       estamos cerrando. Fallar ruidosamente es la unica opcion honesta. */
    const real = L._crypto();
    L._crypto(null);
    let exploto = false;
    try { L.generar(); } catch (e) { exploto = true; }
    L._crypto(real);
    ok(exploto, 'sin generador criptografico, generar() LANZA — no cae a Math.random()');
  }

  bloque('Lo que no tiene forma de token no toca la base de datos');

  {
    /* Lo que se rechaza es lo que NO PUEDE ser un id de documento: vacio,
       con espacios, con barras, o absurdamente largo. Un texto corto y
       limpio como `basura` SI pasa la forma — y debe pasar: rechazarlo
       exigiria saber que prefijos existen, que es el error que ya cometi.
       No cuesta nada: tiene que existir en la base de datos igual. */
    ['', '   ', ' ', 'x'.repeat(200), 'id_1790 ', 'id 1790',
      '_empieza_mal', '-tampoco']
        .forEach((malo) => {
          ok(L.tipoDe(malo) === 'invalido',
             'rechazado antes de consultar nada: ' + JSON.stringify(malo));
        });

    [null, undefined, 0, {}, [], true].forEach((malo) => {
      ok(L.tipoDe(malo) === 'invalido',
         'y lo que ni siquiera es texto: ' + JSON.stringify(malo));
    });
  }

  {
    /* El token se pega a una RUTA de Firestore: `panel/shipments/items/X`.
       Una barra dentro del token cambia la ruta. Hoy no se puede llegar a
       `panel/config` —esta en dos segmentos y aqui se parte de tres— asi
       que no era una fuga; pero concatenar texto de fuera a una ruta de base
       de datos sin validarlo es como empiezan las que si lo son. */
    ['a/b', '../config', 'id_1/x', 'panel/config', 'id_1790/../../config']
        .forEach((malo) => {
          ok(L.tipoDe(malo) === 'invalido',
             'una barra o un salto de carpeta nunca llega a la ruta: ' + malo);
        });
  }

  bloque('LA PUERTA TRASERA: un pedido nuevo no se abre por su id');

  {
    /* Casi se me escapa, y habria dejado el arreglo en nada.
       Un pedido nuevo guarda un token al azar... pero su ID DE DOCUMENTO
       sigue siendo `id_` + el reloj, porque cambiarlo obligaria a tocar el
       panel entero. Si `handleTrack` sigue aceptando el id para todo el
       mundo, entonces el pedido nuevo se puede abrir por su id adivinable
       IGUAL QUE ANTES — el token al azar seria decoracion.

       La regla: un pedido que YA TIENE token nuevo solo se abre por el
       token. Uno que no lo tiene —los de ayer— se sigue abriendo por su id,
       para siempre. */
    ok(L.aceptaLegado({name: 'Ana'}) === true,
       'un pedido de ayer, sin token, SE ABRE por su id de siempre');
    ok(L.aceptaLegado({name: 'Ana', trackToken: 't1_aaaaaaaaaaaaaaaaaaaaaa'}) === false,
       'pero uno nuevo, con token, NO se abre por su id: ahi estaba la puerta trasera');
    ok(L.aceptaLegado({name: 'Ana', trackToken: ''}) === true,
       'un token vacio no cuenta como token: el pedido sigue siendo de los viejos');
    ok(L.aceptaLegado({}) === true && L.aceptaLegado(null) === true,
       'y ante la duda se ABRE: dejar a un cliente sin ver su pedido es peor ' +
       'que aceptar un id que de todas formas ya era publico ayer');
  }

  {
    const fidx = E.leer('functions/index.js');
    const track = fidx.slice(fidx.indexOf('async function handleTrack'),
        fidx.indexOf('// ── Rate limit'));
    ok(/aceptaLegado/.test(track),
       'y handleTrack USA esa regla — sin esto, todo lo demas es decoracion');
  }

  bloque('Los dos caminos de creacion ponen token. Si falta uno, la mitad queda sin proteger');

  {
    /* Un pedido se crea por DOS sitios: el panel escribe directo a Firestore
       (`config.js`) y el formulario publico pasa por la Cloud Function. Si
       solo uno pone token, la mitad de los pedidos nuevos nace con link
       adivinable — y nadie lo notaria, porque los dos funcionan igual. */
    const cfg = E.leer('config.js');
    ok(/trackToken/.test(cfg),
       'el panel pone trackToken al crear (config.js)');

    /* ⚠️ SI EL MODULO NO CARGA, SE AVISA. No se crea el pedido con link
       adivinable en silencio.
       El pedido SI se crea igual —el negocio no se para porque falle un
       <script>, y sin token el link viejo funciona exactamente como ayer—
       pero Jarry tiene que enterarse. Crear pedidos con proteccion de menos
       durante semanas sin que nada avise es el patron que este proyecto
       existe para cazar. */
    const bloque = cfg.slice(cfg.indexOf("data.id='id_'+Date.now()") - 400,
        cfg.indexOf("data.id='id_'+Date.now()") + 900);
    ok(/toast\(/.test(bloque) && /link/i.test(bloque),
       'y si no puede generarlo, AVISA con un toast — no lo crea en silencio');
    /* MUTACION QUE SOBREVIVIO: cambiar la llamada por `"t1_" + Date.now()`
       y la prueba seguia en verde, porque la palabra `enlaceSeguimiento`
       aparecia... en un comentario de al lado. Un texto en el fuente no
       prueba nada; hay que exigir LA LLAMADA. */
    ok(/EnlaceSeguimiento\.generar\(\)/.test(cfg),
       'y lo genera LLAMANDO al modulo compartido, no con el reloj disfrazado');
    ok(!/trackToken\s*=\s*['"`]t1_['"`]\s*\+/.test(cfg),
       'y no se fabrica un token a mano en ningun sitio');
    const fidx = E.leer('functions/index.js');
    ok(/enlace\.generar\(\)/.test(fidx),
       'y la Cloud Function tambien lo genera de verdad — la palabra ' +
       '`trackToken` ya estaba antes y no probaba nada');
  }

  bloque('El link se arma con el token nuevo, o el arreglo no sirve de nada');

  {
    /* Generar tokens que nadie usa seria trabajo perdido: el panel seguiria
       mandando `?seg=id_...` y el link seguiria siendo adivinable. */
    ok(L.tokenDe({id: 'id_1790', trackToken: 't1_aaaaaaaaaaaaaaaaaaaaaa'}) ===
       't1_aaaaaaaaaaaaaaaaaaaaaa',
       'un pedido nuevo arma su link con el token al azar');
    ok(L.tokenDe({id: 'id_1790617556159'}) === 'id_1790617556159',
       'y uno de ayer, con su id de siempre — el link que ya mandaste sigue valiendo');
    ok(L.tokenDe({id: 'id_1790', trackToken: ''}) === 'id_1790',
       'un token vacio no se usa: se cae al id');
    ok(L.tokenDe(null) === '' && L.tokenDe({}) === '',
       'y sin pedido no se inventa un link');
  }

  {
    /* LOS DOS SITIOS QUE COPIAN LINKS TIENEN QUE USAR LA MISMA REGLA.
       Son dos botones distintos —la tarjeta del panel y la vista de
       seguimiento— y si uno se queda con el id, la mitad de los links que
       mandes seguiran siendo adivinables sin que nada lo indique. */
    ['index.html', 'tracking.js'].forEach((f) => {
      const src = E.leer(f);
      const trozo = src.slice(src.indexOf('?seg=') - 500, src.indexOf('?seg=') + 200);
      ok(/tokenDe/.test(trozo),
         f + ' arma el link con EnlaceSeguimiento.tokenDe, no con el id pelado');
    });
  }

  {
    /* Y el cliente no puede elegir su propio token. Si pudiera, podria
       ponerse el de OTRO pedido: la busqueda por igualdad devolveria el
       primero que encuentre y le enseñaria el nombre, la direccion y el
       documento de un desconocido. Hoy no pasa porque `trackToken` no esta
       en la lista de campos que el formulario puede mandar — y esta prueba
       existe para que siga sin estarlo. */
    const fidx = E.leer('functions/index.js');
    const lista = fidx.slice(fidx.indexOf('const ORDER_FIELDS'),
        fidx.indexOf('const FIELD_MAX'));
    ok(!/["']trackToken["']/.test(lista),
       'el cliente NO puede mandar su propio trackToken: no esta en ORDER_FIELDS');
  }

  bloque('El token LLEGA a la nube, o el link nuevo no abre');

  {
    /* Escenario que casi se me pasa y habria sido invisible: el panel guarda
       el pedido en memoria y lo sube por `slimShipment`. Si eso fuera una
       LISTA BLANCA, el trackToken se quedaria en el navegador, Firestore no
       lo tendria, y la busqueda por token devolveria "no encontrado" — el
       cliente con un link roto y nosotros sin entender por que, porque en el
       panel el pedido se veria perfecto.

       Hoy es lista negra (quita `sel` y sube el resto), asi que viaja. Esta
       prueba existe para que nadie lo invierta sin enterarse. */
    const src = E.leer('index.html');
    const fn = src.slice(src.indexOf('function slimShipment'),
        src.indexOf('function slimSupplier'));
    ok(/\.\.\.limpio/.test(fn),
       'slimShipment sube TODO el pedido menos lo que quita a mano');
    ok(!/trackToken/.test(fn),
       'y no quita el trackToken: si lo quitara, el link nuevo no abriria');

    /* Y al reves: el respaldo local tambien lo lleva. Un pedido restaurado
       de un respaldo sin token perderia su link para siempre. */
    ok(/shipments\.map\(slimShipment\)/.test(src),
       'el respaldo local usa el mismo serializador, asi que tambien lo guarda');
  }

  bloque('El freno: que nadie pueda probar millones de tokens');

  {
    const fidx = E.leer('functions/index.js');
    ok(/formApi_track:\s*\{/.test(fidx),
       '`track` tiene freno por IP, como sus hermanos');

    const m = fidx.match(/formApi_track:\s*\{windowMs:\s*(\d+),\s*max:\s*(\d+)\}/);
    ok(!!m, 'y el freno esta escrito donde se puede leer de un vistazo');
    if (m) {
      /* 120/min y no 30. La pagina de seguimiento se refresca sola cada 30 s
         —2 peticiones por minuto por pestaña abierta— y en Peru Claro y
         Movistar meten miles de usuarios detras de una misma IP publica
         (CGNAT). Un freno bajo bloquearia CLIENTES REALES, que es peor que
         el problema que resuelve. */
      ok(Number(m[2]) >= 60,
         'el tope deja sitio al CGNAT peruano y al refresco de 30 s: ' + m[2] + '/min');
      ok(Number(m[2]) <= 200,
         'pero sigue siendo un tope de verdad: ' + m[2] + '/min');
    }

    const track = fidx.slice(fidx.indexOf('async function handleTrack'),
        fidx.indexOf('// ── Rate limit'));
    ok(/checkRateLimit\("formApi_track"/.test(track),
       'y handleTrack lo USA (no basta con declararlo)');

    /* ORDEN: primero la forma, despues el freno, y solo entonces la base de
       datos. Al reves, la basura costaria una transaccion de Firestore por
       intento — se pagaria el ataque en vez de frenarlo. */
    const iForma = track.indexOf('tipoDe');
    const iFreno = track.indexOf('checkRateLimit');
    const iLeer  = track.indexOf('db.doc');
    ok(iForma > 0 && iFreno > iForma && iLeer > iFreno,
       'la forma se mira ANTES del freno, y el freno ANTES de leer nada');
  }

  bloque('El sondeo no corre con la pestaña escondida');

  {
    /* La pagina de seguimiento se refresca sola cada 30 s. Una pestaña
       olvidada en segundo plano hace 2.880 peticiones al dia — cada una una
       invocacion de Cloud Function y una lectura de Firestore— para enseñar
       algo que nadie esta mirando. Y encima come del freno por IP: con
       CGNAT, pestañas olvidadas de varios clientes podrian empujar a los
       que si estan mirando contra el tope.

       Parar con la pestaña escondida y actualizar al volver da EL MISMO
       servicio: cuando el cliente mira, el dato esta fresco. */
    const f = E.leer('formulario.html');
    ok(/visibilitychange/.test(f),
       'la pagina escucha cuando la pestaña se esconde o vuelve');
    ok(/document\.hidden/.test(f),
       'y comprueba si esta escondida antes de consultar');

    /* MUTACION QUE SOBREVIVIO: borrar el `if(document.hidden) return;` de
       dentro del setInterval y la prueba seguia verde, porque encontraba el
       `document.hidden` del OTRO sitio —el listener— a pocas lineas. Hay
       que mirar dentro del intervalo, no cerca de el. */
    const iInt = f.indexOf('trackRefreshId = setInterval(');
    const intervalo = f.slice(iInt, f.indexOf('}, 30000)', iInt));
    ok(iInt > 0 && /document\.hidden/.test(intervalo),
       'el SONDEO MISMO se salta el tiro si nadie esta mirando');
    ok(/return/.test(intervalo),
       'y se salta de verdad: sale sin consultar');
  }

  bloque('Ninguna variable se usa antes de existir');

  {
    /* ⚠️ ESTO ROMPIO EL FORMULARIO PUBLICO EN PRODUCCION, por mi culpa.
       Declare `let _trackTokenActivo` DEBAJO de `clearTrackRefresh()`, que
       la asigna. `init()` corre al evaluar el script y llama a
       `renderForm()` -> `clearTrackRefresh()`, asi que la asignacion ocurria
       con el `let` todavia sin inicializar: ReferenceError, y el formulario
       de pedidos no pintaba NADA.

       Por que no lo vi: en la pagina de SEGUIMIENTO hay un `await` antes de
       llegar ahi, asi que para entonces la variable ya existe. Probe el
       seguimiento, lo vi perfecto, y di por bueno el cambio. Las dos
       paginas salen del mismo archivo y una iba bien.

       Esta prueba recorre las declaraciones de nivel superior y exige que
       NADA las mencione antes de su linea. */
    const f = E.leer('formulario.html');
    const lineas = f.split('\n');
    const fallos = [];
    lineas.forEach((l, i) => {
      const m2 = l.match(/^(let|const)\s+([A-Za-z_$][\w$]*)\s*=/);
      if (!m2) return;
      const nombre = m2[2];
      const antes = lineas.slice(0, i).join('\n');
      const usoAntes = new RegExp('(^|[^\\w$.])' + nombre + '\\s*=[^=]')
          .test(antes);
      if (usoAntes) fallos.push('linea ' + (i + 1) + ': ' + nombre);
    });
    ok(fallos.length === 0,
       'ninguna variable de nivel superior se asigna antes de declararse' +
       (fallos.length ? ' — ' + fallos.join('; ') : ''));
  }

  bloque('Si cambia un archivo, cambia su numero de version');

  {
    /* EL OTRO FALLO DE HOY. Toque `config.js` y `tracking.js` pero no subi
       su `?v=`, asi que el navegador siguio sirviendo los viejos de cache:
       el panel no generaba el token nuevo y parecia que el codigo no
       funcionaba. Un Ctrl+Shift+R lo tapa en MI pantalla, pero no en la de
       nadie mas — y ese es justo el fallo que no se ve.

       Aqui se fija el numero que corresponde a la version actual del
       codigo. Si alguien vuelve a tocar estos archivos sin subirlo, esta
       prueba se lo recuerda. */
    const idx = E.leer('index.html');
    [['config.js', 39], ['tracking.js', 20], ['notify.js', 5], ['shalom.js', 24],
      ['functions/enlaceSeguimiento.js', 1]].forEach((par) => {
      /* `src="` delante a proposito: sin eso, `config.js` casa dentro de
         `firebase-config.js` y la prueba lee la version del archivo
         equivocado. Me acaba de pasar. */
      const re = new RegExp('src="' + par[0].replace(/[./]/g, '\\$&') +
          '\\?v=(\\d+)"');
      const m3 = idx.match(re);
      ok(!!m3 && Number(m3[1]) >= par[1],
         par[0] + ' va con su numero de version al dia (v' + par[1] + ')' +
         (m3 ? ' — esta en v' + m3[1] : ' — NO LO CARGA'));
    });
  }

  bloque('Si el freno actua, se dice la verdad');

  {
    /* Un cliente frenado NO puede ver "link no disponible": eso lo manda a
       buscar el problema donde no esta —revisar el link, escribir por
       WhatsApp, pensar que perdio su pedido— cuando lo unico que pasa es
       que hay que esperar un minuto. Es la misma regla de
       `Shalom.textoMotivo()`: ningun motivo se calla y ninguno miente. */
    /* MUTACION QUE SOBREVIVIO: cambiar la condicion por `if(false)` y la
       prueba seguia verde, porque `rate_limited` aparecia igual en `_api` y
       en un comentario. Hay que exigir LA RAMA, no la palabra. */
    const f = E.leer('formulario.html');
    ok(/if\s*\(\s*r\.status\s*===\s*429\s*\)/.test(f),
       '`_api` no revienta con un 429: el cuerpo trae el motivo en palabras');
    ok(/resp\s*&&\s*resp\.status\s*===\s*['"`]rate_limited['"`]/.test(f),
       'y buscarPedido RAMIFICA de verdad sobre el freno');

    const iRama = f.search(/resp\s*&&\s*resp\.status\s*===\s*['"`]rate_limited['"`]/);
    const rama = iRama > 0 ? f.slice(iRama, iRama + 700) : '';
    ok(/[Ee]spera/.test(rama),
       'y en esa rama le dice que espere, no que su link no existe');
    ok(/link está bien|link esta bien/i.test(rama),
       'y le dice explicitamente que su link esta bien: la duda es el daño');
  }

  bloque('A ningun pedido antiguo se le escribe nada');

  {
    const fidx = E.leer('functions/index.js');
    const track = fidx.slice(fidx.indexOf('async function handleTrack'),
        fidx.indexOf('// ── Rate limit'));
    ok(!/\.set\(|\.update\(|\.create\(/.test(track),
       'handleTrack no escribe NADA: mirar un pedido no lo modifica, ni para ' +
       'ponerle un token que no tenia');
  }
};
