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
};
