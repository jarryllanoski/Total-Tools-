/**
 * La puerta única de Shalom.
 *
 * La integración se rehace endpoint por endpoint: hoy `validate` está
 * conectado y los otros cinco métodos siguen dormidos. Estas pruebas cuidan
 * las dos mitades — que lo dormido siga respondiendo igual y no deje ninguna
 * pantalla muda, y que lo conectado hable SOLO con la Cloud Function, nunca
 * directo con la API (la clave es del servidor y ahí se queda).
 *
 * Ver docs/SHALOM.md.
 */
'use strict';
const E = require('./_entorno.js');

/* El cuerpo de una funcion de nivel superior, SIN comentarios.
   Preguntar por "los N caracteres siguientes" mete dentro la funcion de al
   lado, y no quitar los comentarios hace que una explicacion valga por una
   llamada. Las dos cosas me han dejado pasar mutaciones hoy. */
function cuerpoDeFuncion(src, nombre) {
  const i = src.indexOf('function ' + nombre + '(');
  if (i < 0) return '';
  const resto = src.slice(i);
  const fin = resto.search(/\n\}/);
  const cuerpo = fin < 0 ? resto : resto.slice(0, fin + 2);
  return cuerpo.replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1');
}

module.exports = async (t) => {
  const {ok, bloque} = t;

  const win = {};
  E.cargar('shalom.js', win);
  const S = win.Shalom;

  bloque('Lo que aún no se ha reconstruido responde igual a todo');
  {
    ok(S.DISPONIBLE === false,
        'DISPONIBLE sigue en false aunque consultarGuia ya funcione: el botón ' +
        '⟳ no la mira y el barrido automático sí — a mano se calibra, en masa ' +
        'se confía en un traductor sin comprobar');
    const dormidos = ['ticket', 'registrar'];
    ok(dormidos.every((m) => typeof S[m] === 'function'),
        'los 2 que faltan existen: nadie explota al llamarlos');
    // Se llaman DE VERDAD y se espera su respuesta. Comprobar solo que la
    // función existe dejaría pasar una que devuelve undefined.
    const respuestas = await Promise.all(dormidos.map((m) => S[m]()));
    const malas = dormidos.filter((m, i) => {
      const r = respuestas[i];
      return !(r && r.ok === false && r.motivo === 'DESCONECTADO');
    });
    ok(malas.length === 0,
        'los 2 devuelven {ok:false, motivo:"DESCONECTADO"}' +
        (malas.length ? ' — fallan: ' + malas.join(', ') : ''));
    ok(respuestas.every((r) => !r.ok), 'ninguno devuelve ok:true sin dato real');
  }

  bloque('validate ya está conectado — y no habla directo con Shalom');
  {
    // Un panel completo de mentira: sesión, almacenamiento y red.
    const montar = (op) => {
      op = op || {};
      const red = {llamadas: 0, url: null, cuerpo: null, cabeceras: null};
      const win = {
        _authEnsureToken: async () => op.sesion !== false
      };
      const extra = {
        localStorage: {getItem: () => (op.sesion === false ? '' : 'TOKEN123')},
        fetch: async (url, o) => {
          red.llamadas++; red.url = url;
          red.cabeceras = o.headers;
          red.cuerpo = JSON.parse(o.body);
          if (op.revienta) throw new Error('sin red');
          return {
            status: op.status || 200,
            json: async () => {
              if (op.noEsJson) throw new Error('no es json');
              return op.json || {ok: true, valida: true};
            }
          };
        }
      };
      E.cargar('shalom.js', win, extra);
      return {S: win.Shalom, red};
    };

    {
      const m = montar({});
      const r = await m.S.validar();
      ok(m.red.llamadas === 1, 'validar() llama a la puerta');
      ok(String(m.red.url).indexOf('/shalomPuerta') > 0,
          'a la Cloud Function, NUNCA a api.shalom-api.lat: la clave es del servidor');
      ok(String(m.red.url).indexOf('shalom-api.lat') < 0,
          'y no hay ni rastro del dominio de Shalom en el navegador');
      ok(m.red.cuerpo.op === 'validate', 'pidiendo la operación por nombre');
      ok(m.red.cabeceras.Authorization === 'Bearer TOKEN123',
          'con el token de sesión: la función no atiende a desconocidos');
      ok(r.ok === true, 'y devuelve lo que respondió la puerta');
    }

    {
      const m = montar({sesion: false});
      const r = await m.S.validar();
      ok(r.ok === false && r.motivo === 'SIN_SESION', 'sin sesión: SIN_SESION');
      ok(m.red.llamadas === 0,
          'y ni se intenta — SIN_SESION es del panel, no de Shalom');
    }

    {
      const m = montar({status: 401});
      ok((await m.S.validar()).motivo === 'SIN_SESION', 'un 401 es tu sesión');
    }
    {
      const m = montar({status: 403});
      ok((await m.S.validar()).motivo === 'SIN_PERMISO',
          'un 403 es tu cuenta, no la clave de Shalom: son cosas distintas');
    }
    {
      const m = montar({revienta: true});
      ok((await m.S.validar()).motivo === 'SIN_RED', 'si no hay red, se dice');
    }
    {
      const m = montar({noEsJson: true});
      ok((await m.S.validar()).motivo === 'FORMATO_DESCONOCIDO',
          'una respuesta que no se puede leer no es un éxito');
    }
    {
      const m = montar({});
      await m.S.consultarGuia('82037653', 'TT9C');
      ok(m.red.cuerpo.op === 'track', 'consultarGuia pide track');
      ok(m.red.cuerpo.datos.orderNumber === '82037653' &&
         m.red.cuerpo.datos.orderCode === 'TT9C',
          'con la guía y el código en los nombres que espera la API');
      ok(String(m.red.url).indexOf('shalom-api.lat') < 0,
          'y también por la puerta, nunca directo');
    }
    {
      const m = montar({});
      const r = await m.S.consultarGuia('  ', 'TT9C');
      ok(r.motivo === 'SIN_DATO', 'sin guía no se consulta nada');
      ok(m.red.llamadas === 0, 'ni se gasta una llamada del plan');
    }
    {
      const m = montar({});
      await m.S.consultarGuia('  82037653  ', '  tt9c  ');
      ok(m.red.cuerpo.datos.orderNumber === '82037653',
          'los espacios de un copiar-pegar no llegan a Shalom');
    }
    {
      const m = montar({});
      await m.S.esquema();
      ok(m.red.cuerpo.op === 'esquema' && m.red.cuerpo.de === 'validate',
          'el diagnóstico pide la forma de validate por defecto');
      await m.S.esquema('track');
      ok(m.red.cuerpo.de === 'track', 'o la del endpoint que se le pida');
    }
  }

  bloque('RENIEC: un cliente que vuelve no gasta otra consulta');

  {
    /* «Lo repetitivo son los mismos clientes» — palabras del dueño. Cada
       consulta a RENIEC gasta cuota del plan, así que un DNI ya preguntado no
       se vuelve a preguntar NUNCA. */
    const montarDni = (op) => {
      op = op || {};
      const red = {llamadas: 0, cuerpo: null};
      // El token de sesión hace falta: sin él, `_pedir` corta en SIN_SESION
      // antes de tocar la red y la caché no se estaría probando.
      const almacen = Object.assign({tt_id_token: 'TOKEN123'}, op.almacen || {});
      const win = {_authEnsureToken: async () => true};
      const extra = {
        localStorage: {
          getItem: (k) => (k in almacen ? almacen[k] : null),
          setItem: (k, v) => { almacen[k] = String(v); }
        },
        fetch: async (url, o) => {
          red.llamadas++;
          red.cuerpo = JSON.parse(o.body);
          if (op.revienta) throw new Error('sin red');
          return {status: 200, json: async () => (op.json || {ok: true,
            persona: {dni: '12345678', nombres: 'ANA', apePaterno: 'PEREZ',
              apeMaterno: '', completo: 'ANA PEREZ'}})};
        }
      };
      E.cargar('shalom.js', win, extra);
      return {S: win.Shalom, red, almacen};
    };

    {
      const m = montarDni({});
      const r1 = await m.S.dni('12345678');
      ok(r1.ok === true && r1.persona.nombres === 'ANA',
         'la primera vez pregunta y devuelve la persona');
      ok(m.red.llamadas === 1, 'una consulta');
      ok(m.red.cuerpo.op === 'dni' && m.red.cuerpo.datos.dni === '12345678',
         'por la puerta, con el DNI en `datos` — nunca pegado a la URL desde ' +
         'el navegador');

      const r2 = await m.S.dni('12345678');
      ok(r2.ok === true && r2.cache === true,
         'la segunda sale de la caché, y lo dice');
      ok(m.red.llamadas === 1,
         'y NO gasta otra consulta: es el ahorro, no un detalle');
      ok(r2.persona.nombres === 'ANA', 'con el mismo dato');
    }

    {
      const m = montarDni({});
      await m.S.dni('12 345 678');
      ok(m.red.cuerpo.datos.dni === '12345678',
         'los espacios de un copiar-pegar no llegan a la API');
      const r = await m.S.dni('1234567');
      ok(r.motivo === 'SIN_DATO' && m.red.llamadas === 1,
         'y con 7 dígitos no se gasta una consulta: se sabe de antemano que ' +
         'la API lo va a rechazar');
    }

    {
      /* Cachear un fallo de red convertiría un corte de diez segundos en un
         DNI que nunca más se puede consultar. */
      const m = montarDni({revienta: true});
      const r = await m.S.dni('12345678');
      ok(r.ok === false, 'sin red, falla');
      ok(!m.almacen.tt_reniec || m.almacen.tt_reniec.indexOf('12345678') < 0,
         'y NO se guarda en la caché: un corte de red no puede dejar un DNI ' +
         'envenenado para siempre');
      const m2 = montarDni({});
      await m2.S.dni('12345678');
      ok(m2.red.llamadas === 1, 'así que la próxima vez sí se pregunta');
    }

    {
      // Lo que dejó una versión anterior del panel, o algo a medias.
      const m = montarDni({almacen: {tt_reniec: '{"12345678":{"nombres":""}}'}});
      await m.S.dni('12345678');
      ok(m.red.llamadas === 1,
         'una entrada de caché sin nombre se ignora y se vuelve a preguntar: ' +
         'un nombre a medias en el formulario es peor que preguntar otra vez');
      const m2 = montarDni({almacen: {tt_reniec: 'esto no es json'}});
      const r = await m2.S.dni('12345678');
      ok(r.ok === true, 'y una caché corrupta no rompe la consulta');
    }
  }

  bloque('El autocompletado no pisa lo que escribiste');

  {
    /* El nombre con el que TÚ llamas a un cliente y el que dice su documento
       no tienen por qué ser el mismo, y el tuyo es el que usas para hablarle.
       Así que RENIEC se OFRECE con un botón; nunca reemplaza. */
    const cfg = E.leer('config.js');
    const bloqueDni = cfg.slice(cfg.indexOf('async function _dniReniec'),
        cfg.indexOf('/* ── LA AGENCIA IDENTIFICADA'));

    ok(/if\(n\.length !== 8\)/.test(bloqueDni),
       'no se pregunta hasta tener los 8 dígitos: cada consulta gasta cuota ' +
       'del plan, y disparar en cada tecla saldría carísimo');
    ok(/if\(n === _dniPedido\) return;/.test(bloqueDni),
       'y una sola vez por DNI: volver a escribir el mismo número no vuelve a ' +
       'preguntar');
    ok(/if\(!actual\)\{/.test(bloqueDni),
       'con el nombre VACÍO se rellena: no hay nada que pisar y se ahorra un toque');
    ok(/Usar este<\/button>/.test(bloqueDni),
       'pero si ya escribiste algo distinto, RENIEC se OFRECE con un botón');
    ok(bloqueDni.indexOf("$('fName').value = r.persona.completo") > 0 &&
       (bloqueDni.match(/\$\('fName'\)\.value = /g) || []).length === 1,
       'y solo hay UN sitio que escribe el nombre desde RENIEC, en el caso ' +
       'del campo vacío — el otro está detrás del botón');
    ok(/NO_ENCONTRADO/.test(bloqueDni) && /no existe en RENIEC/.test(bloqueDni),
       'un DNI que no existe se avisa AQUÍ: un envío registrado con DNI malo ' +
       'es un envío que el cliente no puede recoger');
    ok(/\.value\.replace\(\/\\D\/g,''\) !== n\) return;/.test(bloqueDni),
       'y si cambiaste el DNI mientras consultaba, el resultado viejo se ' +
       'descarta: rellenar con el nombre del DNI anterior sería peor que nada');
    ok(/escH\(r\.persona\.completo\)/.test(bloqueDni),
       'el nombre se escapa al pintarlo: viene de fuera, como todo');
  }

  bloque('Ningún motivo se calla');

  {
    /* EL FALLO QUE OBLIGA A ESTO: el aviso de RENIEC tenía un `else` que
       dejaba el mensaje en blanco cuando el motivo no estaba previsto. Salía
       "Consultando…", desaparecía, y no pasaba nada más. Pasó de verdad con
       SIN_TRADUCTOR, y es justo el patrón que este proyecto lleva semanas
       cazando: algo falla y nadie se entera. */
    const t = S.textoMotivo;
    ok(typeof t === 'function', 'los motivos tienen palabras en un solo sitio');

    const codigos = ['SIN_SESION', 'SIN_PERMISO', 'SIN_RED', 'SIN_DATO',
      'NO_ENCONTRADO', 'BLOQUEADO', 'LIMITE', 'ERROR_SHALOM', 'DESCONECTADO',
      'APAGADA', 'PUERTA_CERRADA', 'FORMATO_DESCONOCIDO', 'SIN_TRADUCTOR'];
    const mudos = codigos.filter((c) => !t(c) || t(c).length < 10);
    ok(mudos.length === 0,
       'los 13 motivos conocidos dicen algo entendible' +
       (mudos.length ? ' — mudos: ' + mudos.join(', ') : ''));

    ok(t('SIN_TRADUCTOR').indexOf('servidor') > 0,
       'y SIN_TRADUCTOR —el que provocó esto— dice lo que de verdad pasa: la ' +
       'función del servidor está desplegada a medias');

    // Lo importante no es lo que está en la lista: es lo que NO está.
    ok(t('COSA_QUE_NO_EXISTE').indexOf('COSA_QUE_NO_EXISTE') > 0,
       'un motivo desconocido sale CON SU CÓDIGO dentro. Feo, pero dice dónde ' +
       'mirar; un aviso feo vale mil veces más que uno que se desvanece');
    const vacios = ['', null, undefined, 0, {}].filter((x) => !t(x));
    ok(vacios.length === 0,
       'y NUNCA devuelve vacío, con nada: el silencio es el fallo, no el ' +
       'mensaje raro');
  }

  bloque('La clave de recojo: 4 dígitos que no se adivinan');

  {
    /* Es lo único que separa el paquete de quien no debe llevárselo. */
    const cs = [];
    for (let i = 0; i < 300; i++) cs.push(S.claveRecojo());
    ok(cs.every((c) => /^[0-9]{4}$/.test(c)),
       'siempre 4 dígitos, con sus ceros a la izquierda');
    ok(new Set(cs).size > 200,
       'y no se repiten: 300 claves dan más de 200 distintas');

    {
      /* Que el CÓDIGO mencione `getRandomValues` no prueba nada: puede estar
         en una rama muerta. Lo descubrió una mutación que sobrevivió —bastó
         poner el objeto crypto a null para caer en `Math.random()` sin que
         ninguna prueba se quejara—. Así que se comprueba que se LLAMA. */
      const w = {};
      let usos = 0;
      w.crypto = {getRandomValues: (a) => { usos++; a[0] = 424242; return a; }};
      E.cargar('shalom.js', w);
      const c = w.Shalom.claveRecojo();
      ok(usos > 0,
         'la clave se pide al generador criptográfico DE VERDAD, no solo se ' +
         'menciona en el código: `Math.random()` produce una secuencia que se ' +
         'adivina a partir de las anteriores, y aquí lo que se adivinaría es ' +
         'la clave del paquete de un cliente');
      ok(c === '4242', 'y sale de ahí: 424242 % 10000 = 4242');
    }
    {
      // El rechazo: un valor por encima del corte se descarta y se pide otro.
      const w = {};
      const cola = [4294967000, 1234];
      let i = 0;
      w.crypto = {getRandomValues: (a) => { a[0] = cola[i++]; return a; }};
      E.cargar('shalom.js', w);
      ok(w.Shalom.claveRecojo() === '1234',
         'un valor por encima del corte se DESCARTA y se pide otro: sin eso, ' +
         'del 0000 al 7295 saldrían más a menudo que el resto');
      ok(i === 2, 'y hubo que pedir dos veces, que es el rechazo funcionando');
    }
  }

  bloque('Lo local sigue vivo sin conexión');
  {
    ok(JSON.stringify(S.clasificarPaquete(25, 15, 10, 1.5)) ===
       '{"tipo":"S","etiqueta":"Paquete S"}', 'el clasificador de cajas no habla con nadie');
    ok(S.clasificarPaquete(200, 200, 200, 50).tipo === 'OTRA', 'lo que no entra en ninguna caja');
    ok(S.clasificarPaquete(0, 10, 10, 1) === null, 'medidas incompletas → null, no un error');
    ok(S.clasificarPaquete('a', 'b', 'c', 'd') === null, 'basura → null');
    ok(Array.isArray(S.CATALOGO_CAJAS) && S.CATALOGO_CAJAS.length === 5,
        'las 5 cajas oficiales siguen ahí');
    // La caja se elige por dónde ENTRA el paquete, no por su medida mayor:
    // una caja no distingue de qué lado la acuestas.
    ok(S.clasificarPaquete(10, 12, 20, 0.4).tipo === 'XS',
        'da igual el orden de las medidas: entra en XS igual');
  }

  bloque('Nadie llama a la API saltándose la puerta');
  {
    const archivos = ['shalom.js', 'ticket.js', 'tracking.js', 'agencias-extractor.js',
      'config.js', 'index.html', 'delivery.js', 'print.js', 'qrtracking.js'];
    const culpables = archivos.filter((a) => {
      if (!E.existe(a)) return false;
      const codigo = E.leer(a)
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^\s*\/\/.*$/gm, '')
          .replace(/<!--[\s\S]*?-->/g, '');
      return /shalom-api\.lat|api\.shalom|cloudfunctions\.net\/shalom/.test(codigo);
    });
    ok(culpables.length === 0,
        'ningún archivo tiene una URL de Shalom en su código' +
        (culpables.length ? ': ' + culpables.join(', ') : ''));
    ok(!/x-api-key/.test(E.leer('ticket.js')),
        'ticket.js no manda una clave desde el navegador (hubo una rama que lo hacía)');
    ok(!E.existe('functions/shalomApi.js'), 'el cliente del backend sigue borrado');
    const fidx = E.leer('functions/index.js');
    ok(!/exports\.shalomApi\b/.test(fidx),
        'el proxy ciego `shalomApi` sigue fuera y no vuelve: lo reemplazó ' +
        '`shalomPuerta`, con lista blanca y cuatro barreras');
    /* `shalomWebhook` SÍ volvió (22 sep 2026), y por eso se comprueba en qué
       se diferencia del que se retiró: el viejo era un endpoint público que
       escribía; el nuevo no toca la base de datos hasta verificar la firma. */
    ok(/exports\.shalomWebhook/.test(fidx), 'el webhook está de vuelta');
    const wh = fidx.slice(fidx.indexOf('const _shalomWebhook = onRequest'),
        fidx.indexOf('exports.barridoShalom'));
    ok(/verificarFirma/.test(wh), 'y lo primero que hace es verificar la firma');
    ok(wh.indexOf('req.rawBody') > 0,
        'sobre el cuerpo CRUDO: reparsear el JSON cambia los bytes y la firma ' +
        'deja de cuadrar');
  }

  bloque('Cada pantalla dice algo honesto');
  {
    ok(/case 'DESCONECTADO':\s*return '🔧 Rastreo Shalom en reconstrucción'/.test(E.leer('tracking.js')),
        'el botón ⟳');
    ok(/Jalar ticket en reconstrucción/.test(E.leer('ticket.js')), 'el botón 🧾');
    ok(/Extraer agencias de Shalom está en reconstrucción/.test(E.leer('agencias-extractor.js')),
        'el extractor, y aclara que el catálogo actual sigue sirviendo');
    ok(/La integración con Shalom se está rehaciendo/.test(E.leer('index.html')),
        'el verificador de sesión');
  }

  bloque('El conocimiento medido no se perdió');
  {
    const doc = E.leer('docs/SHALOM.md');
    ok(/El envoltorio del recorrido se llama \*\*`statuses`\*\*/.test(doc),
        'la trampa del nombre del envoltorio de /track sigue escrita');
    ok(/isLoggedIn/.test(doc), 'y la forma medida de /instances/status');
    ok(/El plan de reconstrucción/.test(doc), 'está el plan endpoint por endpoint');
    const api = E.leer('docs/SHALOM-API.md');
    ok(/X-Shalom-Signature: t=<unix>,v1=<hex>/.test(api), 'la firma del webhook, literal');
    ok(/HMAC-SHA256\("<t>\.<rawBody>"/.test(api), 'y cómo se construye el payload firmado');
    ok(/máximo 50/.test(api) || /MÁXIMO 50/i.test(api), 'el límite del batch');
    ok(/1000 peticiones/.test(api), 'el rate limit');
  }

  bloque('El catálogo offline de agencias');
  {
    ok(E.existe('data/agencias-shalom.json'), 'sigue en data/');
    const ag = JSON.parse(E.leer('data/agencias-shalom.json'));
    const lista = ag.agencias || ag;
    ok(lista.length > 500, 'con sus ' + lista.length + ' sedes');
    ok(lista.every((a) => a && a.nombre), 'todas tienen nombre');
    const con00 = lista.filter((a) => String(a.lat) === '0' && String(a.lng) === '0');
    ok(con00.length === 0, 'ninguna con coordenadas 0,0 (eso mandaba al Golfo de Guinea)');
  }

  bloque('El interruptor, visto desde el panel');
  {
    const T = 1700000000000;
    const tp = (e, ahora) => S.textoPuerta(e, ahora === undefined ? T : ahora);

    ok(tp({}).icono === '🟢', 'sin nada guardado, la puerta está abierta');
    ok(tp(null).icono === '🟢',
        'y un documento que no existe tampoco deja al negocio sin rastreo');
    ok(tp({encendida: true, cerradaHasta: 0}).texto.indexOf('funciona') > 0,
        'abierta se dice en positivo: "funciona", no "sin errores"');

    const apagada = tp({encendida: false});
    ok(apagada.icono === '🔌' && apagada.texto.indexOf('por ti') > 0,
        'apagada dice que la apagaste TÚ');

    const pausada = tp({encendida: true, cerradaHasta: T + 7 * 60000});
    ok(pausada.icono === '⏸️', 'pausada sola tiene su propio icono');
    ok(pausada.texto.indexOf('sola') > 0, 'y dice que la decidió la puerta');
    ok(/Reintenta en \d+ min/.test(pausada.texto),
        'con la hora: "se pausó" sin decir hasta cuándo se lee como "se rompió"');
    ok(pausada.texto !== apagada.texto,
        'y los dos NO dicen lo mismo — una la decidiste tú y la otra la máquina');

    ok(tp({encendida: true, cerradaHasta: T - 1000}).icono === '🟢',
        'un descanso ya cumplido no se muestra como pausa');
    ok(tp({encendida: false, cerradaHasta: T + 60000}).icono === '🔌',
        'apagada a mano manda sobre la pausa automática, igual que en el motor');
  }

  bloque('El panel no le pisa la mano al motor');
  {
    const html = E.leer('index.html');
    ok(/_fbEncenderPuerta = \(on\) =>[\s\S]{0,160}encendida/.test(html),
        'encender y apagar escribe `encendida`');
    const escritura = html.slice(html.indexOf('_fbEncenderPuerta'),
        html.indexOf('_fbEncenderPuerta') + 220);
    ok(escritura.indexOf('fallos') < 0 && escritura.indexOf('cerradaHasta') < 0,
        'y NO toca fallos ni cerradaHasta: eso es del servidor, y escribirlo ' +
        'desde el navegador sería pisarle la mano');
    ok(html.indexOf('id="tglShalomPuerta"') > 0, 'el interruptor está en Config');
    ok(html.indexOf('id="shalomPuertaEstado"') > 0,
        'y debajo el estado REAL, que no siempre coincide con el interruptor');
  }

  bloque('estadoSesion: pide por la puerta y manda el instanceId');

  {
    /* Que el metodo exista no basta: tiene que MANDAR el id. Sin el, Shalom
       responde 403 y el panel lo leeria como "la clave no sirve" — mandando
       a revisar justo donde no esta el problema. Medido: con un instanceId
       inventado llega 403 "Invalid API Key or instance access". */
    const red = {url: null, cuerpo: null};
    const win = {_authEnsureToken: async () => true};
    E.cargar('shalom.js', win, {
      localStorage: {getItem: () => 'TOKEN123'},
      fetch: async (url, o) => {
        red.url = url; red.cuerpo = JSON.parse(o.body);
        return {status: 200, json: async () => ({ok: true})};
      }
    });
    await win.Shalom.estadoSesion('inst-abc');
    ok(red.cuerpo && red.cuerpo.op === 'instanceStatus',
       'pide la operacion correcta — salio: ' +
       JSON.stringify(red.cuerpo && red.cuerpo.op));
    ok(red.cuerpo && red.cuerpo.datos &&
       red.cuerpo.datos.instanceId === 'inst-abc',
       'y manda el instanceId dentro de `datos`');
    ok(String(red.url).indexOf('api.shalom-api.lat') < 0,
       'y NO habla directo con Shalom: va por la puerta unica, como todo');
  }

  {
    /* Ningun motivo se calla, y el nuevo tampoco. */
    const win2 = {};
    E.cargar('shalom.js', win2);
    const t = win2.Shalom.textoMotivo('SIN_INSTANCIA_VALIDA');
    ok(t && t.length > 10, 'SIN_INSTANCIA_VALIDA tiene palabras, no un codigo');
    ok(/instancia/i.test(t), 'y nombra la instancia, que es lo que falla');
    ok(!/^No se pudo consultar/.test(t),
       'y no cae en el texto generico: ese manda a buscar a ciegas');
  }

  bloque('Elegir instancia: NUNCA por su cuenta');

  {
    /* ⚠️ POR QUE ESTO EXISTE, con nombres reales (01/10/2026).
       La cuenta del dueño devuelve DOS instancias y LAS DOS CONECTADAS:
           Total     — Totaltools@gmail.com
           Yapaitas  — ramossuyin@gmail.com
       Son dos negocios distintos. Elegir "la primera" o "la que esta
       conectada" habria acertado o no AL AZAR, y el dia que fallara habria
       registrado el envio de un cliente en la cuenta del otro negocio,
       cobrado a ellos, sin que nadie se enterara hasta que el paquete no
       apareciera. Por eso aqui no se adivina nunca. */
    const win = {}; E.cargar('shalom.js', win);
    const S = win.Shalom;
    const dos = [
      {id: 'd14b120a', nombre: 'Total', usuario: 'Totaltools@gmail.com',
        conectada: true},
      {id: '29bf1b07', nombre: 'Yapaitas', usuario: 'ramossuyin@gmail.com',
        conectada: true}
    ];

    const r = S.elegirInstancia(dos, '');
    ok(r.estado === 'falta_elegir',
       'con dos y sin elegir, se PIDE elegir — salio: ' + r.estado);
    ok(r.instancia === null, 'y no se devuelve ninguna por defecto');
    ok(r.instancias.length === 2, 'pero si la lista, para poder elegir');

    const b = S.elegirInstancia(dos, 'd14b120a');
    ok(b.estado === 'elegida' && b.instancia.nombre === 'Total',
       'con eleccion guardada, se usa ESA');

    /* Y si la guardada ya no existe, SE DICE. No se cae a la otra: caer a
       la otra es registrar en el negocio equivocado en silencio, que es
       exactamente el fallo que esto evita. */
    const c = S.elegirInstancia(dos, 'borrada-hace-meses');
    ok(c.estado === 'elegida_no_existe',
       'una eleccion que ya no existe se dice, no se sustituye — salio: ' +
       c.estado);
    ok(c.instancia === null, 'y NO se cae a la otra instancia');
  }

  {
    /* Con UNA sola, el comportamiento es el de siempre: no se molesta a
       nadie con una eleccion que no existe. */
    const win = {}; E.cargar('shalom.js', win);
    const S = win.Shalom;
    const una = [{id: 'i1', nombre: 'Total', usuario: 'a@b', conectada: true}];
    const r = S.elegirInstancia(una, '');
    ok(r.estado === 'una' && r.instancia.id === 'i1',
       'con una sola se usa, sin preguntar nada');

    ok(S.elegirInstancia([], '').estado === 'ninguna',
       'sin ninguna, se dice que no hay cuenta — no es lo mismo que caida');

    /* Caso fino: tenia dos, eligio Yapaitas, borraron Yapaitas y queda Total.
       Quedarse callado y usar Total seria cambiarle el negocio sin avisar. */
    const d = S.elegirInstancia(una, 'yapaitas-borrada');
    ok(d.estado === 'elegida_no_existe',
       'si tu eleccion desaparecio, se avisa AUNQUE quede solo una — ' +
       'usarla en silencio seria cambiarte de negocio sin decirlo');
  }

  {
    /* Entradas rotas no inventan una instancia. */
    [null, undefined, 'x', {}].forEach((malo) => {
      ok(S0().elegirInstancia(malo, '').estado === 'ninguna',
         'una lista que no es lista no produce una eleccion: ' +
         JSON.stringify(malo));
    });
    function S0() { const w = {}; E.cargar('shalom.js', w); return w.Shalom; }
  }

  {
    /* El motivo tiene palabras, como todos. */
    const win = {}; E.cargar('shalom.js', win);
    ['VARIAS_INSTANCIAS', 'INSTANCIA_NO_EXISTE'].forEach((m) => {
      const t = win.Shalom.textoMotivo(m);
      ok(t && !/^No se pudo consultar/.test(t),
         m + ' tiene texto propio, no el generico');
    });
  }

  bloque('La cuenta declarada: se usa sola, SIN pulsar nada');

  {
    /* ⚠️ LA DISTINCION QUE ME FALTABA, y es la clave de todo este archivo.
         ADIVINAR  = el codigo elige entre varias cuando no sabe cual.
                     Eso registraria el envio de un cliente en el negocio
                     equivocado. Prohibido.
         CONFIGURAR = el dueño declara UNA VEZ cual es la suya, y el codigo
                     la respeta sin preguntar mas.
       Le monte un selector cuando lo que necesitaba era configuracion. Su
       panel es el de Total Tools y su cuenta se llama `Total`: eso no lo
       supongo yo, me lo dijo el. */
    const win = {}; E.cargar('shalom.js', win);
    const S = win.Shalom;
    const dos = [
      {id: 'd14b', nombre: 'Total', usuario: 'Totaltools@gmail.com',
        conectada: true},
      {id: '29bf', nombre: 'Yapaitas', usuario: 'ramossuyin@gmail.com',
        conectada: false}
    ];

    const r = S.elegirInstancia(dos, '', {id: 'd14b', nombre: 'Total'});
    ok(r.estado === 'declarada' && r.instancia.id === 'd14b',
       'con la cuenta declarada se usa SOLA, sin pulsar — salio: ' + r.estado);

    /* POR ID, que es lo que el dueño dio (d14b120a-983d-…). El id no cambia
       si renombra la cuenta, y no choca si algun dia hay dos con el mismo
       nombre. El nombre se declara tambien, pero para poder decir CUAL
       cuando algo falle: un UUID en un aviso no le dice nada a nadie. */
    ok(S.elegirInstancia(dos, '', {id: 'd14b', nombre: 'Renombrada'})
        .instancia.id === 'd14b',
       'el id manda: renombrar la cuenta en Shalom no rompe nada');

    ok(S.elegirInstancia(dos, '', {id: 'ya-no-existe', nombre: 'Total'})
        .instancia.id === 'd14b',
       'y si el id cambio porque se rehizo la instancia, el nombre declarado ' +
       'la vuelve a encontrar');

    /* EL ID TAMBIEN EXACTO. Una mutacion que lo casaba por prefijo
       sobrevivio porque mis ids de prueba eran cortos y coincidian enteros.
       Con UUIDs reales, un prefijo casa varias: los de Shalom empiezan por
       el mismo bloque mas veces de lo que uno cree, y "casi el id correcto"
       es el otro negocio. */
    const uuids = [
      {id: 'd14b120a-983d-4369-b519-c9d6bcf70d6a', nombre: 'Total'},
      {id: 'd14b120a-983d-4369-b519-ffffffffffff', nombre: 'Otra'}
    ];
    ok(S.elegirInstancia(uuids, '', {id: 'd14b120a-983d'}).estado ===
       'falta_elegir',
       'un id a medias NO casa: con UUIDs, medio id apunta a dos sitios');

    /* EL CASO QUE DE VERDAD SEPARA exacto de prefijo, y que se me escapo a
       la primera: un id truncado que casa con UNA SOLA. Es justo lo que
       pasa si alguien copia el id del panel de Shalom, que lo muestra
       cortado ("d14b120a-983d-4369-b519-c9d6b…"). Con prefijo resolveria y
       parecería que funciona; con exacto se para y se pregunta, que es lo
       correcto: un id a medias no es el id. */
    const dosDistintos = [
      {id: 'd14b120a-983d-4369-b519-c9d6bcf70d6a', nombre: 'Total'},
      {id: '29bf1b07-a3b0-4e29-a01f-5c7bc0000000', nombre: 'Yapaitas'}
    ];
    ok(S.elegirInstancia(dosDistintos, '', {id: 'd14b120a-983d-4369-b519-c9d6b'})
        .estado === 'falta_elegir',
    'un id CORTADO no resuelve aunque solo pudiera ser uno: a medias no es el id');
    ok(S.elegirInstancia(uuids, '',
        {id: 'd14b120a-983d-4369-b519-c9d6bcf70d6a'}).instancia.nombre ===
        'Total',
    'y el id entero si, aunque compartan prefijo');

    ok(S.elegirInstancia(dos, '', {nombre: ' total '}).instancia.id === 'd14b',
       'el nombre no se pierde por mayusculas ni espacios');
    ok(S.elegirInstancia(dos, '', {nombre: 'Tot'}).estado === 'falta_elegir',
       'pero EXACTO: un trozo no vale, o "Tot" cazaria "Total 2"');
    ok(S.elegirInstancia(dos, '', 'Total').instancia.id === 'd14b',
       'y un texto suelto se sigue aceptando como nombre');
  }

  {
    const win = {}; E.cargar('shalom.js', win);
    const S = win.Shalom;
    /* ⚠️ Y LA NEGATIVA SIGUE DONDE DEBE: si la declarada no esta, o si hay
       DOS con el mismo nombre, no se elige. Configurar no es adivinar, y
       esta frontera es la que no se puede mover. */
    const dos = [
      {id: 'a', nombre: 'Total', conectada: true},
      {id: 'b', nombre: 'Yapaitas', conectada: true}
    ];
    ok(S.elegirInstancia(dos, '', {id: 'x', nombre: 'NoExiste'}).estado ===
       'falta_elegir',
       'una declarada que no esta NO se sustituye por otra: se pide elegir');

    const repes = [
      {id: 'a', nombre: 'Total', conectada: true},
      {id: 'b', nombre: 'Total', conectada: false}
    ];
    ok(S.elegirInstancia(repes, '', {nombre: 'Total'}).estado === 'falta_elegir',
       'y con DOS llamadas igual tampoco: ahi el nombre ya no identifica nada');

    /* ★ EL CASO REAL DEL 02/10/2026, y el que destapo un fallo mio.
       La cuenta paso a tener TRES instancias y DOS SE LLAMAN "Total":
         Total     d14b120a…  Totaltools@gmail.com   conectada
         Total     d0fd86da…  (sin usuario)          requiere login
         Yapaitas  29bf1b07…  ramossuyin@gmail.com   conectada
       La segunda la creo su otra aplicacion con un boton "Obtener
       instancia" que en realidad CREA.

       Yo habia declarado id y nombre como ALTERNATIVAS (id === X O
       nombre === "Total"). Con dos filas llamadas igual, el nombre casaba
       una segunda fila, saltaba mi guardia de ambiguedad, y el panel volvia
       a pedir elegir — justo lo que el dueño pidio quitar.

       La guardia estaba bien; LA PRECEDENCIA estaba mal. El id es el dato
       mas especifico: si resuelve UNA, no hay nada que preguntar. El nombre
       es el plan B, para cuando el id ya no exista. */
    const tres = [
      {id: 'd14b120a', nombre: 'Total', usuario: 'Totaltools@gmail.com',
        conectada: true},
      {id: 'd0fd86da', nombre: 'Total', usuario: null, conectada: false},
      {id: '29bf1b07', nombre: 'Yapaitas', usuario: 'ramossuyin@gmail.com',
        conectada: true}
    ];
    const real = S.elegirInstancia(tres, '', {id: 'd14b120a', nombre: 'Total'});
    ok(real.estado === 'declarada' && real.instancia.id === 'd14b120a',
       'con DOS llamadas "Total", el id declarado manda y no se pregunta — ' +
       'salio: ' + real.estado);
    ok(real.instancia.conectada === true,
       'y es la conectada, no la que quedo sin usuario');

    /* Defensivo: dos filas con el MISMO id no deberian existir —Shalom no
       repite ids— pero si llegaran, elegir "la primera" seria volver a
       adivinar. La guardia se sostiene igual, y por eso se prueba. */
    ok(S.elegirInstancia([
      {id: 'mismo', nombre: 'A', conectada: true},
      {id: 'mismo', nombre: 'B', conectada: false}
    ], '', {id: 'mismo', nombre: 'A'}).estado === 'declarada',
    'con ids repetidos, el nombre desempata');
    ok(S.elegirInstancia([
      {id: 'mismo', nombre: 'A', conectada: true},
      {id: 'mismo', nombre: 'A', conectada: false}
    ], '', {id: 'mismo', nombre: 'A'}).estado === 'falta_elegir',
    'y si ni el id ni el nombre desempatan, se pregunta — nunca la primera');

    /* El nombre sigue siendo el plan B — pero solo si el id NO esta. */
    ok(S.elegirInstancia(tres, '', {id: 'borrada', nombre: 'Yapaitas'})
        .instancia.id === '29bf1b07',
    'si el id declarado desaparecio, el nombre lo vuelve a encontrar');
    ok(S.elegirInstancia(tres, '', {id: 'borrada', nombre: 'Total'}).estado ===
       'falta_elegir',
    'pero si el nombre casa DOS y el id ya no esta, se pregunta: ahi el ' +
    'nombre de verdad no identifica nada');

    ok(S.elegirInstancia(dos, 'b', {id: 'd14b', nombre: 'Total'})
        .instancia.id === 'b',
       'lo que elegiste a mano MANDA sobre lo declarado: es mas reciente y ' +
       'mas explicito');
  }

  {
    const win = {}; E.cargar('shalom.js', win);
    const S = win.Shalom;
    const D = S.INSTANCIA_PREFERIDA;
    ok(D && typeof D === 'object' && D.id && D.nombre,
       'la cuenta declarada vive en UN sitio, con id Y nombre');
    ok(/^[0-9a-f-]{36}$/.test(D.id),
       'y su id es el UUID real que dio el dueño, no un hueco por rellenar');
    ok(S.elegirInstancia([{id: 'x', nombre: 'Otra'}], '', D).estado === 'una',
       'con una sola instancia da igual como se llame: se usa, como siempre');
    ok(S.elegirInstancia([], '', D).estado === 'ninguna',
       'y sin ninguna no se inventa');
  }

  {
    /* El panel tiene que PASARLE la preferida, o no sirve de nada. */
    /* LA LLAMADA, no la palabra. Una mutacion que quitaba el tercer
       argumento sobrevivio porque la linea de arriba —`const preferida =
       ...`— seguia mencionando INSTANCIA_PREFERIDA. Quinta vez hoy que
       confundo un nombre en el fuente con una llamada. */
    const idx = E.leer('index.html').replace(/\/\*[\s\S]*?\*\//g, '');
    const llamada = idx.match(/Shalom\.elegirInstancia\(([^;]*?)\)\s*\n?\s*:/);
    ok(!!llamada, 'la pantalla llama a `elegirInstancia`');
    const args = llamada ? llamada[1].split(',').length : 0;
    ok(args === 3,
       'y le pasa TRES argumentos: lista, elegida y declarada — pasa ' + args);
    ok(llamada && /preferida/.test(llamada[1]),
       'y el tercero es la cuenta declarada');
  }

  bloque('EL ORDEN de verificar: la cuenta declarada manda sobre el aviso');

  {
    /* ⚠️ FALLO REAL EN PRODUCCION (02/10/2026), y de los que no se ven
       leyendo el fuente por encima.
       Con dos instancias, el servidor responde {ok:false,
       motivo:'VARIAS_INSTANCIAS', instancias:[…]} — la negativa es correcta,
       porque el servidor no sabe cual quiere el dueño. El NAVEGADOR si lo
       sabe: la tiene declarada. Pero yo deje el aviso de VARIAS_INSTANCIAS
       ANTES de resolver la declarada, asi que salia el aviso y la resolucion
       no llegaba a ejecutarse nunca.

       No era cache —el diagnostico lo confirmo: shalom.js v22 cargado y la
       cuenta declarada en memoria—, era orden. Se prueba EJECUTANDO la
       funcion, porque leyendo el fuente yo mismo no lo vi. */
    const codigo = E.trozo('index.html', 'function verificarInstanciaShalom(',
        '/* La lista de cuentas de Shalom Pro');
    const pintado = {sesion: null, elector: null, crudo: null, html: ''};
    const caja = {set innerHTML(v) { pintado.html = String(v); },
      get innerHTML() { return pintado.html; }, style: {}};
    const btn = {style: {}, disabled: false, textContent: ''};
    const doc = {getElementById: (id) =>
      (id === 'shalomInstBtn' ? btn : (id === 'shalomInstEstado' ? caja : null))};

    const dos = [
      {id: 'd14b120a-983d-4369-b519-c9d6bcf70d6a', nombre: 'Total',
        usuario: 'Totaltools@gmail.com', conectada: true},
      {id: '29bf1b07-a3b0-4e29-a01f-5c7bc0000000', nombre: 'Yapaitas',
        usuario: 'ramossuyin@gmail.com', conectada: false}
    ];
    const winS = {};
    E.cargar('shalom.js', winS);
    const win = {
      S: {},
      Shalom: {
        INSTANCIA_PREFERIDA: winS.Shalom.INSTANCIA_PREFERIDA,
        elegirInstancia: winS.Shalom.elegirInstancia,
        // Lo que responde el servidor con DOS instancias: se niega a elegir,
        // pero entrega la lista.
        estadoInstancia: () => Promise.resolve(
            {ok: false, motivo: 'VARIAS_INSTANCIAS', instancias: dos})
      }
    };
    // eslint-disable-next-line no-new-func
    const fn = new Function('window', 'document', 'S', 'Shalom', 'esc',
        '_pintarSesionShalom', '_pintarElectorInstancia',
        '_pintarRespuestaCruda',
        codigo + '\n; return verificarInstanciaShalom;')(
        win, doc, win.S, win.Shalom, (x) => String(x),
        (c, ses) => { pintado.sesion = ses; },
        (c, l, a, t) => { pintado.elector = {lista: l, titulo: t}; },
        (c, r, t) => { pintado.crudo = r; });

    await fn();

    ok(pintado.sesion !== null,
       'con la cuenta declarada, se PINTA LA SESION — no el aviso de varias');
    ok(pintado.sesion && pintado.sesion.nombre === 'Total',
       'y es Total, la declarada — salio: ' +
       (pintado.sesion && pintado.sesion.nombre));
    ok(pintado.elector === null,
       'y no se le pide elegir nada: ya esta configurado');
    ok(!/mas de una cuenta|más de una cuenta/i.test(pintado.html),
       'y NO sale el aviso de "tienes mas de una cuenta": ese era el fallo');
  }

  {
    /* Y si la declarada NO esta en la lista, el aviso SI tiene que salir:
       arreglar un caso rompiendo el otro no es arreglar. */
    const codigo = E.trozo('index.html', 'function verificarInstanciaShalom(',
        '/* La lista de cuentas de Shalom Pro');
    const pintado = {sesion: null, elector: null, html: ''};
    const caja = {set innerHTML(v) { pintado.html = String(v); },
      get innerHTML() { return pintado.html; }, style: {}};
    const btn = {style: {}, disabled: false, textContent: ''};
    const doc = {getElementById: (id) =>
      (id === 'shalomInstBtn' ? btn : (id === 'shalomInstEstado' ? caja : null))};
    const otras = [
      {id: 'aaa', nombre: 'Yapaitas', conectada: true},
      {id: 'bbb', nombre: 'Tercera', conectada: true}
    ];
    const winS = {}; E.cargar('shalom.js', winS);
    const win = {S: {}, Shalom: {
      INSTANCIA_PREFERIDA: winS.Shalom.INSTANCIA_PREFERIDA,
      elegirInstancia: winS.Shalom.elegirInstancia,
      estadoInstancia: () => Promise.resolve(
          {ok: false, motivo: 'VARIAS_INSTANCIAS', instancias: otras})
    }};
    // eslint-disable-next-line no-new-func
    const fn = new Function('window', 'document', 'S', 'Shalom', 'esc',
        '_pintarSesionShalom', '_pintarElectorInstancia',
        '_pintarRespuestaCruda',
        codigo + '\n; return verificarInstanciaShalom;')(
        win, doc, win.S, win.Shalom, (x) => String(x),
        (c, ses) => { pintado.sesion = ses; },
        (c, l, a, t) => { pintado.elector = {lista: l, titulo: t}; },
        () => {});
    await fn();
    ok(pintado.elector !== null,
       'si la declarada no esta, SE PIDE ELEGIR — no se usa otra');
    ok(pintado.sesion === null, 'y no se afirma ninguna sesion');
  }

  bloque('La cuenta elegida LLEGA a la nube, o el servidor no la ve');

  {
    /* ⚠️ FALLO MIO, invisible hasta que el servidor la necesito.
       `elegirInstanciaShalom` hace `S.shalomInstancia = {...}` y
       `save('config')`. Pero el subidor de config NO manda el estado
       entero: arma un objeto con una lista EXPLICITA de campos
       —config, trash, recursos, agenciaOrigen, ts—. `shalomInstancia` no
       estaba, asi que vivia en memoria y en el respaldo local y NUNCA
       llegaba a Firestore.

       Se veia bien: el panel la recordaba. Pero no sincronizaba a otro
       dispositivo, y sobre todo la Cloud Function —que es quien registra el
       envio— no podia leerla. Habria fallado el dia del primer registro,
       diciendo "falta la cuenta de Shalom Pro" con la cuenta elegida. */
    const idx = E.leer('index.html');
    const i = idx.indexOf('agenciaOrigen:data.agenciaOrigen');
    const bloqueSubida = idx.slice(i - 1200, i + 600);
    ok(/shalomInstancia\s*:/.test(bloqueSubida),
       'shalomInstancia viaja a Firestore con los demas campos de config');
    ok(/agenciaOrigen\s*:/.test(bloqueSubida),
       'y la agencia de origen tambien, como ya hacia');
  }

  bloque('El selector en Config: guarda tu eleccion, y no elige solo');

  {
    /* La decision ya esta probada arriba (`elegirInstancia`). Lo que se
       prueba aqui es que la pantalla la USE y no se invente la suya: dos
       sitios decidiendo lo mismo divergen, y divergir AQUI significa
       registrar en el negocio equivocado. */
    const idx = E.leer('index.html');
    const fn = idx.slice(idx.indexOf('function verificarInstanciaShalom'),
        idx.indexOf('function _pintarSesionShalom'));
    ok(/Shalom\.elegirInstancia\(/.test(fn),
       'la pantalla pregunta a `Shalom.elegirInstancia`, no decide por su cuenta');
    ok(/instancias/.test(fn),
       'y le pasa la lista que ahora devuelve el traductor');
  }

  {
    /* Guardar la eleccion: en Config, como la agencia de origen. */
    /* ⚠️ EL CUERPO EXACTO, Y SIN COMENTARIOS.
       Dos mutaciones se me escaparon aqui por mirar "los 900 caracteres
       siguientes": el trozo se metia en la funcion de al lado —que tambien
       llama a save('config')— y encima incluia mis propios comentarios, que
       mencionan las palabras que la prueba buscaba. Cuarta vez hoy con el
       mismo error: confundir texto cercano con codigo de esta funcion. */
    const cfg = E.leer('config.js');
    ok(/function elegirInstanciaShalom/.test(cfg),
       'existe el guardado de la eleccion');
    const fn = cuerpoDeFuncion(cfg, 'elegirInstanciaShalom');
    ok(fn.length > 0, 'y se puede aislar su cuerpo');
    ok(/S\.shalomInstancia\s*=/.test(fn), 'se guarda en S.shalomInstancia');
    ok(/save\(\s*['"`]config['"`]\s*\)/.test(fn),
       "y se persiste con save('config'), igual que la agencia de origen");
    ok(/nombre\s*:/.test(fn),
       'se guarda tambien el nombre: un UUID suelto no le dice nada a nadie ' +
       'el dia que esa cuenta desaparezca y haya que avisar de cual era');
  }

  {
    /* ⚠️ Y NADIE GUARDA UNA ELECCION SIN QUE LA HAGAS. Si el panel
       autoguardara "la primera" o "la unica conectada" al verificar,
       habriamos vuelto al problema de raiz pero escondido en otra capa. */
    const idx = E.leer('index.html');
    const fn = idx.slice(idx.indexOf('function verificarInstanciaShalom'),
        idx.indexOf('function _pintarSesionShalom'));
    ok(!/S\.shalomInstancia\s*=/.test(fn),
       'verificar NO guarda ninguna eleccion: solo la hace el dueño al pulsar');
  }
};
