'use strict';
const vm = require('vm');
const crypto = require('crypto');
const E = require('./_entorno.js');

const ID_RE = /^[A-Za-z0-9_-]{2,64}$/;

function generador(conCrypto) {
  const src = E.trozo('panel/compartir/links-tokens.js', 'const _TOK_LETRAS=', 'function _tokAlgunDato(){');
  const ctx = vm.createContext({Uint8Array, crypto: conCrypto, Math: Object.create(Math)});
  vm.runInContext(src + ';this._genTokId=_genTokId;', ctx);
  return ctx;
}

function servidor(tokens, opciones) {
  const o = opciones || {};
  const src = E.leer('functions/index.js');
  const campos = src.slice(src.indexOf('function pickOrderFields(src) {'), src.indexOf('async function handleCreate(req, res) {'));
  const create = src.slice(src.indexOf('async function handleCreate'), src.indexOf('async function handleToken(req, res) {'));
  const lecturas = [];
  const escritos = [];
  const frenos = [];
  const transacciones = [];
  const db = {
    doc: (p) => ({
      _p: p,
      get: async () => {
        lecturas.push(p);
        const id = p.split('/').pop();
        const t = p.indexOf('panel/tokens/items/') === 0 ? tokens[id] : null;
        return {exists: !!t, data: () => t};
      },
    }),
    runTransaction: async (fn) => (transacciones.push(1), fn({
      get: async (ref) => {
        const id = ref._p.split('/').pop();
        const t = ref._p.indexOf('panel/tokens/items/') === 0 ? tokens[id] : null;
        return {exists: !!t, data: () => t};
      },
      create: (ref, data) => escritos.push({p: ref._p, data}),
      set: (ref, data) => {
        escritos.push({p: ref._p, data});
        const id = ref._p.split('/').pop();
        if (ref._p.indexOf('panel/tokens/items/') === 0) tokens[id] = Object.assign({}, tokens[id], data);
      },
    })),
  };
  // eslint-disable-next-line no-new-func
  const handleCreate = new Function('db', 'agencias', 'enlace', 'reniecPublico', 'nroComp',
      'checkRateLimit', 'appCheckOk', 'pedidoForm', 'TOK_COL', 'SHIP_COL', 'CFG_DOC', '_conMts', 'SYNC_V',
      campos + create + ';return handleCreate;',
  )(db, require('../functions/agencias.js'), require('../functions/enlaceSeguimiento.js'),
      {normalizar: () => ''}, require('../functions/nroComprobante.js'),
      async (n) => { frenos.push(n); return o.freno !== false; },
      async () => o.appCheck !== false, require('../functions/pedidoForm.js'),
      'panel/tokens/items', 'panel/shipments/items', 'panel/config', (x) => x, 1);
  const llamar = async (body) => {
    const r = {code: 200, body: null};
    r.status = (c) => { r.code = c; return r; };
    r.json = (b) => { r.body = b; return r; };
    await handleCreate({body}, r);
    return r;
  };
  return {llamar, lecturas, escritos, frenos, tokens, transacciones};
}

function verificador(tokens, frenar) {
  const llamadasFreno = [];
  const src = E.leer('functions/index.js');
  const tok = src.slice(src.indexOf('function _texto(v) {'), src.indexOf('function setCORS(req, res) {')) +
    src.slice(src.indexOf('async function handleToken'), src.indexOf('function telefonoDe'));
  const db = {doc: (p) => ({get: async () => {
    const id = p.split('/').pop();
    const t = p.indexOf('panel/tokens/items/') === 0 ? tokens[id] : null;
    return {exists: !!t, data: () => t};
  }})};
  // eslint-disable-next-line no-new-func
  const handleToken = new Function('db', 'ID_RE', 'TOK_COL', 'FORMCFG_COL', 'soloCampos', 'FORMCFG_PUBLICO',
      'telefonoDe', 'configViva', '_frenado', tok + ';return handleToken;',
  )(db, ID_RE, 'panel/tokens/items', 'panel/formcfg/items', (x) => x, [], () => '911', async () => ({}), async (n, rq, rs) => {
    llamadasFreno.push(n);
    if (!frenar) return false;
    rs.status(429).json({status: 'rate_limited'});
    return true;
  });
  const fn = async (t) => {
    const r = {body: null, json: (b) => { r.body = b; return r; }, status: () => r};
    await handleToken({query: {t}}, r);
    return r.body;
  };
  fn.frenos = llamadasFreno;
  return fn;
}

function formulario(opciones) {
  const o = opciones || {};
  const esc = E.trozo('cliente/comun.js', 'function esc(s){', '\n');
  const wa = E.trozo('cliente/comun.js', 'function _waNegocio(', 'function _ayudaWa(');
  const src = E.trozo('cliente/form-base.js', 'function init(){', 'var _tokCfgId');
  const caja = {innerHTML: ''};
  const estado = {pantalla: '', redirigido: '', llamadas: [], formulario: false, listo: 0};
  const ctx = vm.createContext({
    URLSearchParams, Promise, setTimeout, encodeURIComponent, String,
    location: {search: o.search || '', replace: (u) => { estado.redirigido = u; }},
    localStorage: {getItem: () => o.guardado || null},
    wsId: 'w',
    window: {TTFormLoader: {ready: () => { estado.listo++; }}},
    TTFormLoader: {ready: () => { estado.listo++; }},
    document: {getElementById: (id) => (id === 'unconfWa' ? caja : null)},
    setApp: (h) => { estado.pantalla = h; caja.innerHTML = ''; },
    _api: async (accion, params) => {
      estado.llamadas.push(accion);
      if (accion === 'config') {
        if (o.configFalla) throw new Error('sin red');
        return o.config === undefined ? {config: {phone: '987 654 321'}} : o.config;
      }
      if (accion === 'token') return o.token || {status: 'valid'};
      return {};
    },
    loadCfg: () => { estado.formulario = true; },
  });
  ctx.window.TTFormLoader = ctx.TTFormLoader;
  vm.runInContext(esc + '\n' + wa + '\n' + src, ctx);
  return {ctx, estado, caja};
}

const esperar = () => new Promise((r) => setTimeout(r, 20));

module.exports = async ({bloque, ok}) => {
  bloque('Fase 1: el token del link no se puede adivinar');
  {
    const g = generador(crypto.webcrypto);
    const muestras = Array.from({length: 20000}, () => g._genTokId());
    ok(muestras.every((t) => /^[A-Za-z0-9]{22}$/.test(t)), '22 letras y números (unos 131 bits de azar)');
    ok(muestras.every((t) => ID_RE.test(t)), 'y el servidor los acepta como siempre');
    ok(new Set(muestras).size === muestras.length, '20 000 links, ninguno repetido');
    const cuenta = {};
    muestras.join('').split('').forEach((c) => { cuenta[c] = (cuenta[c] || 0) + 1; });
    const valores = Object.values(cuenta);
    const esperado = (20000 * 22) / 62;
    ok(valores.length === 62 && Math.min(...valores) > esperado * 0.9 && Math.max(...valores) < esperado * 1.1,
       'las 62 letras salen parejo: sin letras favoritas que acorten la búsqueda');
    const fuente = E.trozo('panel/compartir/links-tokens.js', 'function _genTokId(){', 'function _tokAlgunDato(){');
    ok(!/Math\.random/.test(fuente) && /crypto\.getRandomValues\(azar\)/.test(fuente),
       '⚠️ azar criptográfico, no Math.random (que se puede predecir)');
    ok(/if\(azar\[i\]<248\)/.test(fuente), 'descarta los bytes que darían ventaja a algunas letras (248 = 62 × 4)');
    let lanzo = false;
    try { generador(undefined)._genTokId(); } catch (e) { lanzo = true; }
    ok(lanzo, 'sin criptografía en el navegador no inventa un link débil: falla y no se crea');
    const lt = E.leerReal('panel/compartir/links-tokens.js');
    ok((lt.match(/const id\s*=\s*_genTokId\(\);/g) || []).length === 2, 'lo usan el link personal y el link rápido');
  }

  bloque('Fase 1: el servidor no crea pedidos sin link');
  {
    const pedido = {name: 'CLIENTE PRUEBA', phone: '900000001'};
    let s = servidor({});
    let r = await s.llamar({order: pedido});
    ok(r.code === 400 && r.body.motivo === 'SIN_LINK', '⚠️ sin token: rechazado');
    ok(s.escritos.length === 0 && s.lecturas.length === 0 && s.frenos.length === 0,
       'sin escribir, sin leer y sin gastar el freno por IP: a un bot no le cuesta nada a tu cuenta');
    r = await (s = servidor({})).llamar({token: '   ', order: pedido});
    ok(r.code === 400 && r.body.motivo === 'SIN_LINK', 'un token de puros espacios es igual que ninguno');
    r = await (s = servidor({})).llamar({token: 12345, order: pedido});
    ok(r.code === 400 && s.escritos.length === 0, 'un token que no es texto no rompe nada');
    r = await (s = servidor({})).llamar({token: '../config', order: pedido});
    ok(r.code === 400 && /inválido/.test(r.body.error) && s.lecturas.length === 0, 'un token con rutas se rechaza sin leer la base');
    r = await (s = servidor({})).llamar({token: 'InventadoPorUnBot0001', order: pedido});
    ok(r.code === 400 && /inválido/.test(r.body.error) && s.escritos.length === 0, 'un token inventado: rechazado, nada escrito');
    r = await (s = servidor({T: {used: true}})).llamar({token: 'T0', order: pedido});
    ok(r.code === 400 && s.escritos.length === 0, 'uno que no existe, aunque se parezca a otro: rechazado');
    r = await (s = servidor({Usado001: {used: true}})).llamar({token: 'Usado001', order: pedido});
    ok(r.code === 400 && /utilizado/.test(r.body.error) && s.escritos.length === 0, 'un link usado no crea otro pedido');
    ok(s.transacciones.length === 0, 'y se descarta antes de abrir una transacción (más barato)');
    r = await (s = servidor({Vencido01: {used: false, expiresAt: '2020-01-01T00:00:00Z'}})).llamar({token: 'Vencido01', order: pedido});
    ok(r.code === 400 && /vencido/i.test(r.body.error) && s.escritos.length === 0, 'un link vencido tampoco');
    s = servidor({SinNombre01: {used: false}});
    r = await s.llamar({token: 'SinNombre01', order: {phone: '900000001'}});
    ok(r.code === 400 && s.escritos.length === 0 && s.tokens.SinNombre01.used === false,
       'si faltan datos, el link NO se gasta: el cliente corrige y envía otra vez');
    s = servidor({Freno0001: {used: false}}, {freno: false});
    r = await s.llamar({token: 'Freno0001', order: pedido});
    ok(r.code === 429 && s.escritos.length === 0, 'con link válido pero demasiados envíos seguidos: frenado');
  }

  bloque('Fase 1: los links ya enviados siguen funcionando');
  {
    const viejo = 'aB3dE5gH7jK9mN1pQ3sT';
    const nuevo = generador(crypto.webcrypto)._genTokId();
    for (const [nombre, t] of [['link de antes (20 letras)', viejo], ['link nuevo (22 letras)', nuevo]]) {
      const s = servidor({[t]: {used: false, monto: '100', adelanto: '40', nroComprobante: 'F001-9'}});
      const r = await s.llamar({token: t, order: {name: 'CLIENTE PRUEBA', phone: '900000001'}});
      const ped = s.escritos.find((w) => w.p.indexOf('panel/shipments/items/') === 0);
      ok(r.code === 200 && r.body.status === 'ok' && ped, nombre + ': crea el pedido');
      ok(ped && /^t1_/.test(ped.data.trackToken) && ped.data.cost === '60' && ped.data.nroComprobante === 'F001-9',
         nombre + ': con su seguimiento seguro, su deuda y su comprobante');
      ok(s.tokens[t].used === true && s.tokens[t].orderId === r.body.orderId, nombre + ': y queda usado con su pedido');
      const r2 = await s.llamar({token: t, order: {name: 'OTRO', phone: '900000002'}});
      ok(r2.code === 400 && /utilizado/.test(r2.body.error), nombre + ': no sirve dos veces');
      const ver = verificador({[t]: {used: false}});
      ok((await ver(t)).status === 'valid', nombre + ': al abrirlo el formulario lo reconoce');
    }
    const ver = verificador({});
    ok((await ver('noExiste12345')).status === 'invalid' && (await ver('')).status === 'invalid', 'uno inexistente o vacío: inválido');
    const frenado = verificador({LinkReal00001: {used: false}}, true);
    ok((await frenado('LinkReal00001')).status === 'rate_limited' && frenado.frenos.join() === 'formApi_token',
       'quien prueba links seguidos queda frenado (antes, cada intento era una lectura gratis para el bot)');
    ok((await frenado('no/vale')).status === 'invalid' && frenado.frenos.length === 1, 'un link con forma invalida se descarta antes, sin gastar el freno');
    ok((await ver(['aB3dE5gH7jK9mN1pQ3sT', 'x'])).status === 'invalid' && (await ver({a: 1})).status === 'invalid',
       'un parámetro que llega como lista u objeto (t[]=…) se rechaza limpio, sin error 500');
  }

  bloque('Fase 1: el formulario sin link pide el link por WhatsApp');
  {
    let f = formulario({search: ''});
    f.ctx.init();
    await esperar();
    ok(/Pide tu link para hacer tu pedido/.test(f.estado.pantalla), 'sin token: pantalla «Pide tu link»');
    ok(!f.estado.formulario, '⚠️ y el formulario NO se muestra');
    ok(f.estado.llamadas.join() === 'config', 'solo pide el celular de la tienda: no crea ni consulta nada');
    ok(/href="https:\/\/wa\.me\/51987654321\?text=Hola%2C%20quiero%20hacer%20un%20pedido/.test(f.caja.innerHTML) &&
       /Pedir mi link por WhatsApp/.test(f.caja.innerHTML), 'botón directo a tu WhatsApp con el mensaje escrito');
    ok(/target="_blank" rel="noopener"/.test(f.caja.innerHTML), 'abre WhatsApp sin dar acceso a la página');
    ok(f.estado.listo === 1, 'la pantalla de carga se quita una sola vez');

    f = formulario({search: '', config: {config: {phone: ''}}});
    f.ctx.init();
    await esperar();
    ok(/Pide tu link/.test(f.estado.pantalla) && f.caja.innerHTML === '', 'si la tienda no tiene celular: el aviso sin botón roto');
    f = formulario({search: '', configFalla: true});
    f.ctx.init();
    await esperar();
    ok(/Pide tu link/.test(f.estado.pantalla) && f.caja.innerHTML === '', 'sin internet: el aviso igual se ve');
    f = formulario({search: '', config: {config: {phone: '51987654321'}}});
    f.ctx.init();
    await esperar();
    ok(/wa\.me\/51987654321\?/.test(f.caja.innerHTML), 'celular guardado con 51 delante: no queda 5151');

    f = formulario({search: '', guardado: JSON.stringify({trackToken: 't1_AAAAAAAAAAAAAAAAAAAAAA'})});
    f.ctx.init();
    ok(f.estado.redirigido === 'seguimiento.html?seg=t1_AAAAAAAAAAAAAAAAAAAAAA', 'quien ya pidió desde ese celular va a su seguimiento, como antes');

    f = formulario({search: '?t=LinkValido001', token: {status: 'valid'}});
    f.ctx.init();
    await esperar();
    ok(f.estado.formulario && f.estado.llamadas.join() === 'token', 'con token válido: el formulario de siempre');

    const casos = [
      ['used', /Link ya utilizado/, /registrar%20otro%20pedido/],
      ['expired', /Link vencido/, /venci%C3%B3/],
      ['invalid', /Link inválido/, /no%20funciona/],
    ];
    for (const [st, titulo, texto] of casos) {
      f = formulario({search: '?t=LinkX0001', token: {status: st}});
      f.ctx.init();
      await esperar();
      ok(titulo.test(f.estado.pantalla) && !f.estado.formulario && texto.test(f.caja.innerHTML),
         'link ' + st + ': aviso claro y botón para pedir otro por WhatsApp');
    }
    const fb = E.leerReal('cliente/form-base.js');
    ok(!/Solicitá|Reintentá/.test(fb), 'textos en el español de Perú (sin «solicitá»)');
    f = formulario({search: '', config: {config: {phone: '987654321"><img src=x onerror=alert(1)>'}}});
    f.ctx.init();
    await esperar();
    ok(!/<img/.test(f.caja.innerHTML), 'un celular de tienda manipulado no puede meter código');
  }

  bloque('Fase 1: el envío sigue mandando el token');
  {
    ok(/body: JSON\.stringify\(\{ order: order, token: currentToken \|\| '', ms: Math\.round\(performance\.now\(\)\), trampa: \(\$\('f_h7'\)\|\|\{\}\)\.value \|\| '' \}\)/.test(E.leerReal('cliente/form-enviar.js')),
       'el formulario manda el token con el pedido, el tiempo desde que abrió la página y el campo trampa');
    ok(/function _ayudaWa\(texto\)\{\s*return _waNegocio\(CFG, texto\);/.test(E.leerReal('cliente/comun.js')),
       'la ayuda de Toby usa el mismo armado del enlace de WhatsApp');
  }

  bloque('Anti-bots: la IP real del cliente, aunque invente la cabecera');
  {
    const IP = require('../functions/ipCliente.js');
    const req = (xff, ip) => ({get: (k) => (k.toLowerCase() === 'x-forwarded-for' ? xff : undefined), ip});
    ok(IP.de(req('190.42.10.5')) === '190.42.10.5', 'una sola IP: esa');
    ok(IP.de(req('1.1.1.1, 190.42.10.5')) === '190.42.10.5', '⚠️ con una IP inventada a la izquierda: se usa la que agregó Google (la de la derecha)');
    ok(IP.de(req('1.1.1.1, 2.2.2.2, 190.42.10.5, 35.191.4.7')) === '190.42.10.5', 'salta el balanceador de Google');
    ok(IP.de(req('190.42.10.5, 10.8.0.3, 169.254.8.1')) === '190.42.10.5', 'salta las IPs internas');
    ok(IP.de(req('2001:db8::7')) === '2001:db8::7', 'IPv6 tambien');
    ok(IP.de(req('<script>')) === 'invalida' && IP.de(req('1.1.1.1, nada')) === 'invalida', 'basura en la cabecera: un solo cajon comun, no una clave nueva por intento');
    ok(IP.de(req('', '190.42.10.9')) === '190.42.10.9' && IP.de(req('')) === 'desconocida', 'sin cabecera: la IP de la conexion');
    const src = E.leer('functions/index.js');
    const freno = src.slice(src.indexOf('const RATE_LIMITS = {'), src.indexOf('const OLVA_STORES_URL'));
    // eslint-disable-next-line no-new-func
    const check = new Function('ipCliente', 'db', freno + ';return checkRateLimit;')(IP, null);
    let pasan = 0;
    for (let i = 0; i < 25; i++) {
      if (await check('formApi_create', req((i + 1) + '.' + i + '.0.1, 190.42.10.5'))) pasan++;
    }
    ok(pasan === 10, '⚠️ 25 envios cambiando la IP inventada en cada uno: igual solo pasan 10 por minuto (' + pasan + ')');
    ok(await check('formApi_create', req('190.42.10.6')), 'otra persona de verdad no queda frenada');
    ok(/formApi_token: \{windowMs: 60000, max: 30, memoria: true\}/.test(src) && /formApi_config: \{windowMs: 60000, max: 60, memoria: true\}/.test(src),
       'verificar link y leer configuracion tambien tienen freno (antes, ilimitado)');
    ok(/formApi_create: \{[^}]*memoria: true\}/.test(src) && /formApi_client: \{[^}]*memoria: true\}/.test(src) && /agenciasOlva: \{[^}]*memoria: true\}/.test(src),
       'los frenos van en memoria: ya no cuesta una escritura en la base por cada intento');
    ok(/formApi_reniec: \{windowMs: 60000, max: 10\}/.test(src), 'el DNI (consulta pagada) mantiene el freno exacto en la base');
  }

  bloque('Anti-bots: al enviar el pedido');
  {
    const src = E.leer('functions/index.js');
    // eslint-disable-next-line no-new-func
    const alertas = new Function(src.slice(src.indexOf('const LLENADO_MIN_MS'), src.indexOf('async function handleToken')) + ';return alertasDelAlta;')();
    ok(alertas(true, 45000).length === 0, 'persona real verificada que tardo 45 s: sin marcas');
    ok(alertas(false, 45000).join() === 'sin verificación anti-bots', 'sin App Check (bloqueador, celular viejo): entra, marcado');
    ok(alertas(true, 1800).join() === 'llenado en 2 s', 'llenado en menos de 4 s: entra, marcado');
    ok(alertas(false, undefined).join() === 'sin verificación anti-bots,sin tiempo de llenado', 'un envio directo al servidor: entra marcado con las dos');
    ok(alertas(true, '9000').join() === 'sin tiempo de llenado' && alertas(true, -5).join() === 'sin tiempo de llenado', 'un tiempo que no es numero valido no cuenta');

    const pedido = {name: 'CLIENTE PRUEBA', phone: '900000001'};
    let s = servidor({Trampa001: {used: false}});
    let r = await s.llamar({token: 'Trampa001', trampa: 'http://spam.example', ms: 30000, order: pedido});
    ok(r.code === 400 && s.escritos.length === 0 && s.tokens.Trampa001.used === false && s.lecturas.length === 0,
       '⚠️ campo trampa lleno (bot): rechazado, sin leer ni escribir y el link sigue sin usar');
    s = servidor({Normal001: {used: false}});
    r = await s.llamar({token: 'Normal001', trampa: '', ms: 52000, order: pedido});
    let ped = s.escritos.find((w) => w.p.indexOf('panel/shipments/items/') === 0);
    ok(r.code === 200 && ped && !('alertas' in ped.data), 'persona real: pedido sin marcas');
    s = servidor({Rapido001: {used: false}}, {appCheck: false});
    r = await s.llamar({token: 'Rapido001', ms: 1200, order: pedido});
    ped = s.escritos.find((w) => w.p.indexOf('panel/shipments/items/') === 0);
    ok(r.code === 200 && ped && ped.data.alertas.join() === 'sin verificación anti-bots,llenado en 1 s', 'sospechoso: el pedido entra con sus marcas (nunca se pierde una venta)');
    s = servidor({Falsa001: {used: false}});
    r = await s.llamar({token: 'Falsa001', ms: 52000, order: Object.assign({alertas: []}, pedido)});
    ped = s.escritos.find((w) => w.p.indexOf('panel/shipments/items/') === 0);
    ok(!('alertas' in ped.data), 'el cliente no puede mandar sus propias marcas (las pone solo el servidor)');
    s = servidor({Viejo0001: {used: false}});
    r = await s.llamar({token: 'Viejo0001', order: pedido});
    ok(r.code === 200, 'un formulario viejo en cache (sin trampa ni tiempo) igual registra');
  }

  bloque('Anti-bots: en el formulario y en el panel');
  {
    const fb = E.leerReal('cliente/form-base.js');
    ok(/<div class="tt-h7" aria-hidden="true"><input type="text" id="f_h7" name="h7" tabindex="-1" autocomplete="off" value=""><\/div>/.test(fb),
       'campo trampa: invisible, fuera del tabulador y sin autocompletar (ni el navegador ni el lector de pantalla lo llenan)');
    ok(/\.tt-h7\{position:absolute;left:-9999px/.test(E.leerReal('cliente/cliente.css')), 'escondido fuera de la pantalla, no con display:none (que algunos bots detectan)');
    let f = formulario({search: '?t=LinkX0001', token: {status: 'rate_limited'}});
    f.ctx.init();
    await esperar();
    ok(/Un momento, por favor/.test(f.estado.pantalla) && !f.estado.formulario, 'si el servidor frena: aviso claro, no un formulario roto');
    ok(/snap\.status !== 'rate_limited'/.test(fb) && /live\.status !== 'rate_limited'/.test(fb), 'la configuracion frenada no se confunde con una configuracion');
    ok(/if\(!currentToken\) return;/.test(E.leerReal('cliente/form-datos.js')), 'el autocompletado solo pregunta con un link');
    const lista = E.leerReal('panel/pantalla/lista.js');
    ok(/Array\.isArray\(s\.alertas\)&&s\.alertas\.length\)\?`<span class="meta" title="\$\{escH\('Revisar: '\+s\.alertas\.join\(' · '\)\)\}"/.test(lista) && /⚠️ revisar/.test(lista),
       'el panel muestra «⚠️ revisar» con el motivo al pasar el dedo o el mouse');
  }

  bloque('Alta: el servidor decide lo que no le toca al cliente');
  {
    const s = servidor({Duro0000001: {used: false, prefillLink: 'https://drive.google.com/file/d/guia'}});
    const r = await s.llamar({token: 'Duro0000001', ms: 30000, order: {name: '<b>Ana</b> Lopez', phone: '+51 987 654 321', status: 'FINALIZADO',
      createdAt: '2020-01-01T00:00:00Z', links: [{u: 'javascript:alert(1)', n: 'x'}], docGuia: {t: 'image/png', d: 'x" onerror="alert(1)'}, cost: '0'}});
    const ped = (s.escritos.find((w) => w.p.indexOf('panel/shipments/items/') === 0) || {}).data || {};
    ok(r.code === 200 && ped.status === 'NUEVO PEDIDO', 'el estado siempre nace como NUEVO PEDIDO, mande lo que mande');
    ok(ped.createdAt > '2025' && ped.phone === '987654321' && ped.name === 'bAna/b Lopez', 'fecha del servidor, celular en 9 digitos y nombre sin < >');
    ok(ped.links.length === 1 && ped.links[0].u === 'https://drive.google.com/file/d/guia', '⚠️ los links salen del link que creaste tu, no de lo que mande el cliente');
    ok(!('docGuia' in ped) && !ped.cost, 'ni documentos ni costo del cliente');
    ok(s.tokens.Duro0000001.clientName === 'bAna/b Lopez', 'el link guarda el nombre ya limpio');
    const s2 = servidor({Duro0000002: {used: false}});
    const r2 = await s2.llamar({token: 'Duro0000002', ms: 30000, order: {name: 'Ana', phone: '98765'}});
    ok(r2.code === 400 && /9 dígitos/.test(r2.body.error) && s2.tokens.Duro0000002.used === false && s2.escritos.length === 0,
       'celular incompleto: rechazado, se le dice por que, y el link no se gasta');
    const s3 = servidor({Duro0000003: {used: false, prefillLink: 'javascript:alert(1)'}});
    await s3.llamar({token: 'Duro0000003', ms: 30000, order: {name: 'Ana', phone: '987654321'}});
    const p3 = (s3.escritos.find((w) => w.p.indexOf('panel/shipments/items/') === 0) || {}).data || {};
    ok(!('links' in p3), 'un link guardado que no es https no pasa al pedido');
  }
};
