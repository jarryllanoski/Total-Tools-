/**
 * tests/sesion.test.js — la sesión y lo que se lleva por delante al cerrarse
 * ==========================================================================
 * De un caso real: la sesión venció a las 12 h con el panel abierto, Firestore
 * empezó a responder 403 y el panel dijo "Sin conexión a Firebase". A revisar
 * el internet por un problema de permisos.
 *
 * Y el otro lado del mismo problema: cerrar sesión BORRA el respaldo local
 * —incluidos los cambios que no alcanzaron a subir— y lo hacía en silencio.
 */
'use strict';
const E = require('./_entorno.js');

/* auth.js construye su pantalla de login al cargar, así que necesita un
   document que sepa crear nodos. Sigue siendo mucho menos que jsdom, y obliga
   a declarar qué se usa de verdad. */
function domAuth() {
  const body = {_hijos: []};
  const crear = () => {
    const n = {
      id: '', style: {}, innerHTML: '', textContent: '', value: '',
      _hijos: [], _ev: {}, _padre: null,
      appendChild(h) { h._padre = n; n._hijos.push(h); return h; },
      remove() {
        const p = n._padre;
        if (!p) return;
        p._hijos = p._hijos.filter((x) => x !== n);
        n._padre = null;
      },
      focus() {}, setAttribute() {}, getAttribute() { return null; },
      addEventListener(ev, fn) { n._ev[ev] = fn; },
      querySelector() { return null; },
      classList: {add() {}, remove() {}, contains() { return false; }}
    };
    return n;
  };
  body.appendChild = (h) => { h._padre = body; body._hijos.push(h); return h; };
  const porId = (id) => body._hijos.filter((h) => h.id === id);
  /* Los campos del formulario viven dentro del innerHTML de la pantalla, no
     como nodos. Se sirven aparte para poder probar el camino de entrar. */
  const campos = {};
  ['authEmail', 'authPass', 'authBtn', 'authErr', 'authLoading'].forEach((id) => {
    campos[id] = crear();
    campos[id].id = id;
  });
  return {
    body,
    campos,
    overlays: () => porId('authOverlay'),
    doc: {
      readyState: 'complete',
      getElementById: (id) => porId(id)[0] || campos[id] || null,
      querySelectorAll: (sel) => porId(String(sel).replace('#', '')),
      createElement: crear,
      querySelector: () => null,
      addEventListener: () => {},
      body,
      head: crear()
    }
  };
}

function montar(op) {
  op = op || {};
  const d = domAuth();
  const guardado = Object.assign({}, op.almacen || {});
  const visto = {recargas: 0, preguntas: []};
  const ls = {
    getItem: (k) => (k in guardado ? guardado[k] : null),
    setItem: (k, v) => { guardado[k] = String(v); },
    removeItem: (k) => { delete guardado[k]; }
  };
  const win = {
    document: d.doc,
    localStorage: ls,
    location: {reload: () => { visto.recargas++; }},
    navigator: {onLine: op.onLine !== false},
    confirm: (m) => { visto.preguntas.push(m); return op.confirma !== false; },
    fetch: op.fetch || (async () => (op.loginOk ?
      {ok: true, status: 200, json: async () => ({
        idToken: 'ID', refreshToken: 'REF', expiresIn: '3600'})} :
      {ok: false, status: 400, json: async () => ({})})),
    setTimeout: () => {},
    console: {warn() {}, log() {}, error() {}}
  };
  E.cargar('auth.js', win, {
    document: d.doc, localStorage: ls, location: win.location,
    navigator: win.navigator, fetch: win.fetch, console: win.console,
    setTimeout: win.setTimeout, confirm: win.confirm
  });
  return {win, guardado, visto, dom: d};
}

const sucios = (ids) => JSON.stringify({all: false, s: ids, p: []});

/* `AuthModule.init()` es async: pregunta por el token antes de decidir si
   dibuja el login. Sin esperarle, la prueba mira la pantalla antes de que
   exista. */
const asentar = () => new Promise((r) => setTimeout(r, 0));

module.exports = async ({bloque, ok}) => {

  bloque('Cerrar sesión avisa antes de llevarse lo que no subió');

  {
    const m = montar({almacen: {dpanel: '{}', dpanel_dirty: sucios(['a', 'b'])}});
    m.win.AuthModule.logout();
    ok(m.visto.preguntas.length === 1, 'con cambios sin subir, pregunta antes');
    ok(m.visto.preguntas[0].indexOf('2 cambios') > 0, 'y dice cuántos son');
    ok(m.visto.preguntas[0].indexOf('SE PIERDEN') > 0,
       'sin rodeos: cerrar sesión los borra');
  }
  {
    const m = montar({almacen: {dpanel: '{}', dpanel_dirty: sucios(['a'])},
      confirma: false});
    m.win.AuthModule.logout();
    ok(m.visto.recargas === 0, 'si dices que no, no cierra');
    ok(m.guardado.dpanel === '{}', 'y no borra nada');
    ok(m.guardado.dpanel_dirty, 'los cambios siguen ahí');
  }
  {
    const m = montar({almacen: {dpanel: '{}', dpanel_dirty: sucios(['a'])}});
    m.win.AuthModule.logout();
    ok(m.guardado.dpanel === undefined,
       'si dices que sí, se borra igual: es tu decisión, no una sorpresa');
    ok(m.visto.recargas === 1, 'y se cierra');
  }
  {
    const m = montar({almacen: {dpanel: '{}'}});
    m.win.AuthModule.logout();
    ok(m.visto.preguntas.length === 0,
       'sin nada pendiente no pregunta: un aviso que sale siempre deja de leerse');
    ok(m.guardado.dpanel === undefined, 'y borra los datos, como debe');
  }
  {
    const m = montar({almacen: {dpanel: '{}',
      dpanel_dirty: JSON.stringify({all: true, s: [], p: []})}});
    m.win.AuthModule.logout();
    ok(m.visto.preguntas.length === 1,
       '"subir todo" pendiente también avisa, aunque no se pueda contar');
    ok(m.visto.preguntas[0].indexOf('Hay cambios') === 0,
       'y no inventa un número');
  }
  {
    const m = montar({almacen: {dpanel: '{}', dpanel_dirty: '{{{roto'}});
    m.win.AuthModule.logout();
    ok(m.visto.preguntas.length === 0 && m.visto.recargas === 1,
       'un registro corrupto no deja a nadie encerrado sin poder salir');
  }

  bloque('Vencer no es lo mismo que cerrar sesión');

  {
    const m = montar({almacen: {dpanel: '{"x":1}', dpanel_dirty: sucios(['a']),
      tt_id_token: 'T', tt_auth_inicio: '123'}});
    m.win._authExpulsar('Tu sesión venció. Ingresa de nuevo.');
    ok(m.guardado.tt_id_token === undefined, 'el token se borra');
    ok(m.guardado.dpanel === '{"x":1}',
       'pero el respaldo NO: la misma persona va a volver a entrar en diez ' +
       'segundos y su cambio sin subir no puede desaparecer por un accidente');
    ok(m.guardado.dpanel_dirty, 'ni el registro de lo que falta subir');
    ok(m.visto.preguntas.length === 0, 'y no pregunta nada: no fue una decisión');
  }
  {
    const m = montar({almacen: {dpanel: '{"x":1}', tt_id_token: 'T'}});
    m.win._authExpulsar();
    ok(m.guardado.dpanel === undefined,
       'sin nada pendiente sí se borra: son una copia, y dejarla es exponer ' +
       'nombres y DNI de clientes a quien se siente en la PC');
  }
  ok(typeof montar({}).win._authExpulsar === 'function',
     'y la puerta existe para que index.html la llame ante un 403');

  bloque('Una sola pantalla de login, pase lo que pase');
  {
    /* EL BUG: `_initFirebase` pide datos antes de que nadie inicie sesión, así
       que recibe un 403 —que es lo NORMAL de quien aún no entró—. Al tratarlo
       como "sesión vencida" se dibujaba una SEGUNDA pantalla de login encima.
       Al entrar, `_hideOverlay` quitaba solo la primera y el usuario seguía
       mirando la otra, tecleando su contraseña sin entender por qué. */
    const m = montar({});
    await asentar();
    ok(m.dom.overlays().length === 1, 'al arrancar sin sesión hay una pantalla');
    m.win._authExpulsar('Tu sesión venció.');
    ok(m.dom.overlays().length === 1,
       'y sigue habiendo UNA aunque algo vuelva a pedirla: _showLogin borra la anterior');
    m.win._authExpulsar('otra vez');
    m.win._authExpulsar('y otra');
    ok(m.dom.overlays().length === 1, 'ni con tres llamadas seguidas');
  }
  {
    const m = montar({});
    await asentar();
    m.win._authExpulsar('x');
    m.win._authExpulsar('y');
    // Lo que hace login() al entrar bien.
    m.dom.doc.querySelectorAll('#authOverlay').forEach((o) => o.remove());
    ok(m.dom.overlays().length === 0,
       'y al entrar no queda ninguna escondida detrás');
  }

  bloque('¿Había sesión? Es lo que convierte un 403 en diagnóstico');
  {
    const sin = montar({});
    ok(sin.win._authHaySesion() === false, 'sin token, no había sesión');
    const con = montar({almacen: {tt_id_token: 'T'}});
    ok(con.win._authHaySesion() === true, 'con token, sí la había');
  }

  bloque('Entrar limpia la pantalla — todas, no la primera');
  {
    /* Cinturón y tirantes. Que _showLogin sea idempotente ya impide que haya
       dos; esto cubre el caso de que alguna vez vuelva a haberlas por otro
       camino. `getElementById` devuelve SOLO la primera, y dejar una segunda
       escondida detrás fue exactamente el bug. */
    const m = montar({loginOk: true});
    await asentar();
    m.dom.campos.authEmail.value = 'admin@totaltools.com';
    m.dom.campos.authPass.value = 'x';

    const intrusa = m.dom.doc.createElement();
    intrusa.id = 'authOverlay';
    m.dom.body.appendChild(intrusa);
    ok(m.dom.overlays().length === 2, 'con dos pantallas en pantalla…');

    await m.win.AuthModule.login();
    ok(m.dom.overlays().length === 0,
       '…entrar las quita TODAS: ninguna se queda escondida detrás');
    ok(m.guardado.tt_id_token === 'ID', 'y la sesión queda guardada');
  }

  bloque('El botón de Google está encendido');
  {
    const cfg = E.leer('firebase-config.js');
    ok(/GOOGLE_CLIENT_ID:\s*'[^']*\.apps\.googleusercontent\.com'/.test(cfg),
       'hay un ID de cliente configurado, así que el botón se muestra');
    ok(!/CLIENT_SECRET|client_secret|Secreto de cliente/i.test(cfg),
       'y el SECRETO no está en el repositorio: el ID es público, el secreto no');
    const auth = E.leer('auth.js');
    ok(/if\(!GOOGLE_CLIENT_ID\) return;/.test(auth),
       'sin ID el botón no se dibuja — activarlo nunca puede dejar a nadie fuera');
    ok(/accounts\.google\.com\/gsi\/client/.test(auth),
       'y el botón lo dibuja Google, no nosotros: la contraseña nunca pasa por aquí');
  }

  bloque('La puerta del token: o da el token, o se niega — nunca "bueno, igual"');

  {
    /* El hallazgo 13 de la auditoría, el que estaba marcado como "el más
       grave": cuando no había token, cada sitio mandaba la petición IGUAL,
       sin identificarse. Las reglas exigen sesión, así que Firestore
       respondía 403 a todo lo que escribieras durante esa hora — y el único
       aviso era el mismo punto rojo que significa "mal internet". */
    const ahora = Date.now();
    const viva = () => ({
      tt_auth_token: 'REF',
      tt_auth_expiry: String(ahora + 60 * 60 * 1000),
      tt_id_token: 'ID-BUENO'
    });

    {
      const m = montar({almacen: viva()});
      await asentar();
      const tok = await m.win._authToken();
      ok(tok === 'ID-BUENO', 'con sesión sana devuelve el token, sin ceremonia');
      ok((await m.win._authEnsureToken()) === true,
         'y el contrato booleano de antes sigue igual: tiene 5 consumidores');
    }

    {
      /* El caso más sutil y el que nadie mira: la sesión dice estar viva
         —fecha de vencimiento en el futuro— pero el idToken no está. Antes
         eso salía como petición anónima igual que los demás. */
      const a = viva();
      delete a.tt_id_token;
      const m = montar({almacen: a});
      await asentar();
      let lanzo = null;
      try { await m.win._authToken(); } catch (e) { lanzo = e; }
      ok(lanzo, 'sin idToken guardado se NIEGA, aunque la sesión parezca viva');
      ok(lanzo && lanzo.auth === 'sin_token', 'y dice que el motivo es ese');
    }

    {
      /* Las 12 h cumplidas: no se renueva más, y se dice por qué.
         Sin red a propósito: con red, `init()` expulsa la sesión al arrancar
         —que es lo correcto— y entonces lo que se estaría midiendo es la
         expulsión, no la puerta. Sin red no expulsa (no podría volver a
         entrar), y es justo el caso en que la puerta tiene que hablar. */
      const a = viva();
      a.tt_auth_inicio = String(ahora - 13 * 60 * 60 * 1000);
      const m = montar({almacen: a, onLine: false});
      await asentar();
      let lanzo = null;
      try { await m.win._authToken(); } catch (e) { lanzo = e; }
      ok(lanzo && lanzo.auth === 'vencida', 'sesión de más de 12 h: "vencida"');
    }

    {
      /* Sin red, con el token por vencer. Es el caso que NO debe confundirse
         con el de abajo: acá se espera a que vuelva internet; abajo hay que
         volver a entrar. */
      const a = viva();
      a.tt_auth_expiry = String(ahora + 1000); // dentro del margen de 5 min
      const m = montar({almacen: a, fetch: async () => { throw new Error('red'); }});
      await asentar();
      let lanzo = null;
      try { await m.win._authToken(); } catch (e) { lanzo = e; }
      ok(lanzo && lanzo.auth === 'sin_red', 'un corte de red se llama "sin_red"');
      ok((await m.win._authEnsureToken()) === false,
         'y el booleano dice false: un texto no vacío habría pasado por "renovado"');
    }

    {
      // El servidor rechaza el token: la sesión murió de verdad.
      const a = viva();
      a.tt_auth_expiry = String(ahora + 1000);
      const m = montar({almacen: a,
        fetch: async () => ({ok: false, status: 400, json: async () => ({})})});
      await asentar();
      let lanzo = null;
      try { await m.win._authToken(); } catch (e) { lanzo = e; }
      ok(lanzo && lanzo.auth === 'rechazado', 'un token rechazado se llama "rechazado"');
    }

    {
      // Lo que jamás puede pasar, en una sola prueba.
      const m = montar({almacen: {}});
      await asentar();
      let dio = 'NO LANZO';
      try { dio = await m.win._authToken(); } catch (e) { dio = null; }
      ok(dio === null,
         'sin nada de sesión NO devuelve cadena vacía: lanza. Devolver "" era ' +
         'exactamente lo que dejaba salir la petición sin identificar');
    }
  }

  bloque('Las palabras del motivo las decide un solo sitio');

  {
    const m = montar({almacen: {}});
    await asentar();
    const t = m.win._authTextoMotivo;
    ok(typeof t === 'function', 'auth.js traduce el motivo a palabras');
    ok(t({auth: 'sin_red'}).indexOf('conexión') > 0,
       'sin red habla de conexión');
    ok(t({auth: 'rechazado'}).indexOf('sesión') > 0 &&
       t({auth: 'rechazado'}).indexOf('conexión') < 0,
       'y una sesión muerta NO habla de conexión: mandar a revisar el internet ' +
       'por un problema de permisos es lo que hace perder una tarde');
    ok(t({auth: 'vencida'}).indexOf('ingresa de nuevo') > 0,
       'y dice qué hacer, no solo qué pasó');
    ok(t(new Error('cualquier otra cosa')) === '' && t(null) === '',
       'y si el error no es de sesión devuelve vacío, para que quien llama ' +
       'use su propio mensaje sin tener que saber de motivos');
  }

  bloque('Nadie se fabrica la cabecera por su cuenta');

  {
    /* Había CUATRO sitios armando el `Authorization` a mano, cada uno con su
       propia versión de "si hay token lo pongo, y si no, mando igual". Basta
       con que uno degrade para tener el agujero entero. */

    const idx = E.leer('index.html');
    const puerta = idx.slice(idx.indexOf('async function _authHeaders('),
        idx.indexOf('// ── REST helpers'));
    ok(/headers\['Authorization'\] = 'Bearer ' \+ tok;/.test(puerta),
       'la cabecera se pone SIEMPRE, no dentro de un "si hay token"');
    ok(/throw/.test(puerta),
       'y si no hay token se lanza: devolver {} era mandar la petición como anónimo');
    ok(puerta.indexOf('if(ok){') < 0,
       'ya no queda el "si salió bien pongo la cabecera, y si no, paciencia"');

    const st = E.leer('storage.js');
    ok((st.match(/await window\._authToken\(\)/g) || []).length === 2,
       'storage.js pasa por la puerta al subir Y al borrar');
    ok(!/if \(_idTok\) _uploadHdrs/.test(st),
       'y ya no sube con la cabecera puesta solo "si había token": un 403 ahí ' +
       'dejaba el pedido con la etiqueta movida, sin archivo y sin aviso');
    ok(!/_idTok \? \{ 'Authorization'/.test(st),
       'ni borra sin identificarse, que es un 403 silencioso: el archivo sigue ' +
       'ahí y el panel cree que ya no está');

    const cot = E.leer('cotizacion.js');
    ok(/return window\._authToken\(\);/.test(cot),
       'cotizacion.js también pasa por la puerta');
    ok(cot.indexOf("localStorage.getItem('tt_id_token')") < 0,
       'y ya no lee el token a mano para mandar la llamada con la cabecera vacía');

    const sh = E.leer('shalom.js');
    ok(/if \(!tok\) return \{ok: false, motivo: 'SIN_SESION'\};/.test(sh),
       'shalom.js ya se negaba solo, y se queda como está: lo que funciona no ' +
       'se toca para que se parezca al resto');
  }
};
