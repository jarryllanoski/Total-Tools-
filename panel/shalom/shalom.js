(function (global) {
  'use strict';

  var OFF = {ok: false, motivo: 'DESCONECTADO'};
  function _off() { return Promise.resolve(OFF); }

  var FUNCION = 'https://us-central1-total-tools-24ce8.cloudfunctions.net/' +
                'shalomPuerta';

  function _token() {
    try {
      if (typeof global._authEnsureToken === 'function') {
        return global._authEnsureToken().then(function (vale) {
          return vale ? (localStorage.getItem('tt_id_token') || '') : '';
        }).catch(function () { return ''; });
      }
      return Promise.resolve(localStorage.getItem('tt_id_token') || '');
    } catch (e) {
      return Promise.resolve('');
    }
  }

  var DNI_KEY = 'tt_reniec';
  var DNI_TOPE = 400;

  function _dniLeer() {
    try {
      var x = JSON.parse(localStorage.getItem(DNI_KEY) || '{}');
      return (x && typeof x === 'object' && !Array.isArray(x)) ? x : {};
    } catch (e) { return {}; }
  }
  function _dniCache(n) {
    var p = _dniLeer()[n];
    return (p && typeof p === 'object' && p.nombres) ? p : null;
  }
  function _dniGuardar(n, persona) {
    try {
      var todo = _dniLeer();
      todo[n] = persona;
      var claves = Object.keys(todo);
      if (claves.length > DNI_TOPE) {
        claves.slice(0, claves.length - DNI_TOPE).forEach(function (k) {
          delete todo[k];
        });
      }
      localStorage.setItem(DNI_KEY, JSON.stringify(todo));
    } catch (e) {  }
  }

  function _pedir(cuerpo) {
    return _token().then(function (tok) {
      if (!tok) return {ok: false, motivo: 'SIN_SESION'};
      return fetch(FUNCION, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + tok
        },
        body: JSON.stringify(cuerpo)
      }).then(function (r) {
        if (r.status === 401) return {ok: false, motivo: 'SIN_SESION'};
        if (r.status === 403) return {ok: false, motivo: 'SIN_PERMISO'};
        if (r.status === 405) return {ok: false, motivo: 'NO_PERMITIDO'};
        return r.json().catch(function () {
          return {ok: false, motivo: 'FORMATO_DESCONOCIDO'};
        });
      }).catch(function () {
        return {ok: false, motivo: 'SIN_RED'};
      });
    });
  }

  var Shalom = {

    DISPONIBLE: false,

    consultarGuia: function (guia, codigo) {
      var g = String(guia || '').trim();
      if (!g) return Promise.resolve({ok: false, motivo: 'SIN_DATO'});
      return _pedir({op: 'track', datos: {
        orderNumber: g,
        orderCode: String(codigo || '').trim()
      }});
    },

    ticket: function (pedidoId, guia, codigo) {
      var id = String(pedidoId || '').trim();
      if (!id || !String(guia || '').trim() || !String(codigo || '').trim()) {
        return Promise.resolve({ok: false, motivo: 'SIN_DATO'});
      }
      return _pedir({op: 'jalarTicket', datos: {pedidoId: id,
        orderNumber: String(guia).trim(), orderCode: String(codigo).trim()}});
    },
    registrar: _off,

    agencias: function () { return _pedir({op: 'agencies'}); },

    registrarEnvio: function (pedidoId, opc) {
      var d = {pedidoId: pedidoId};
      if (opc && opc.renovar === true) d.renovar = true;
      return _pedir({op: 'registrarEnvio', datos: d});
    },

    recuperarEnvio: function (pedidoId) {
      return _pedir({op: 'recuperarEnvio', datos: {pedidoId: pedidoId}});
    },

    conectar: function (usuario, clave) {
      var d = {};
      if (usuario && clave) { d.usuario = usuario; d.clave = clave; }
      return _pedir({op: 'conectarShalom', datos: d});
    },
    estadoCuenta: function () { return _pedir({op: 'estadoShalom'}); },

    validar: function () { return _pedir({op: 'validate'}); },

    dni: function (numero) {
      var n = String(numero || '').replace(/\D/g, '');
      if (n.length !== 8) return Promise.resolve({ok: false, motivo: 'SIN_DATO'});
      var enCache = _dniCache(n);
      if (enCache) return Promise.resolve({ok: true, persona: enCache, cache: true});
      return _pedir({op: 'dni', datos: {dni: n}}).then(function (r) {
        if (r && r.ok && r.persona) _dniGuardar(n, r.persona);
        return r;
      });
    },

    textoMotivo: function (m) {
      var k = String(m || '').toUpperCase();
      var T = {
        SIN_SESION:    'Tu sesión venció — ingresa de nuevo.',
        SIN_PERMISO:   'Tu cuenta no está autorizada para esto.',
        SIN_RED:       'Sin conexión. Reintenta en un momento.',
        SIN_DATO:      'Faltan datos.',
        NO_ENCONTRADO: 'Shalom no encontró ese dato.',
        SHALOM_SIN_RESPUESTA: 'Shalom-API no pudo leer esta guía en Shalom ahora (falla de su lado). Reintenta más tarde.',
        SOLO_REGISTRADO: 'Registrado en Shalom, pero el paquete todavía no entró a la agencia. Déjalo allí: el plazo es de 24 horas.',
        NO_VENCIDA:    'La guía todavía no venció: déjala en la agencia con esa misma guía.',
        YA_EN_AGENCIA: 'Shalom ya recibió este paquete: no se registra de nuevo.',
        NO_VERIFICADO: 'No pudimos confirmar con Shalom que la guía venció. No se registró nada.',
        BLOQUEADO:     'Shalom rechazó la clave de la API, o el plan venció.',
        VARIAS_INSTANCIAS: 'Hay más de una instancia con tu correo en tu panel de Shalom API. Deja una sola y vuelve a pulsar Conectar.',
        PLAN_LLENO: 'Tu plan de Shalom API llegó al límite de instancias. Libera una en tu panel de Shalom API y vuelve a pulsar Conectar.',
        SIN_SESION_SHALOM: 'Entró, pero Shalom aún no confirma la sesión. Espera un minuto.',
        NO_ENCONTRADO_PEDIDO: 'Ese pedido ya no está en la base de datos.',
        SIN_CREDENCIALES: 'Falta conectar tu cuenta de Shalom Pro: escribe tu correo y contraseña en ⚙️ Config → Shalom y pulsa Conectar.',
        CREDENCIALES_MALAS: 'Shalom Pro no aceptó ese correo o esa contraseña (los de pro.shalom.pe). Escríbelos de nuevo en Config.',
        ERROR_SECRETOS: 'No se pudieron leer las credenciales de Secret Manager. El detalle de abajo trae el motivo exacto de Google.',
        SIN_PERMISO_SECRETOS: 'La función no tiene permiso para escribir en Secret Manager. Hay que darle el rol `roles/secretmanager.admin` a su cuenta de servicio, una sola vez.',
        SIN_INSTANCIA_VALIDA: 'La cuenta de Shalom Pro guardada ya no existe. Pulsa Conectar en ⚙️ Config.',
        LIMITE:        'Se agotó la cuota del plan de Shalom.',
        ERROR_SHALOM:  'Shalom respondió con un error. Reintenta en unos minutos.',
        DESCONECTADO:  'Esa parte de la integración todavía no está conectada.',
        APAGADA:       'La puerta a Shalom está apagada en Config.',
        PUERTA_CERRADA: 'La puerta se pausó sola tras varios fallos seguidos. Vuelve a intentar en unos minutos.',
        FORMATO_DESCONOCIDO: 'Shalom respondió algo que no se reconoce. No se va a adivinar.',
        SIN_TRADUCTOR: 'Esa operación está desplegada a medias: falta actualizar la función del servidor.'
      };
      if (T[k]) return T[k];
      return 'No se pudo consultar' + (k ? ' (' + k + ')' : '') + '.';
    },

    claveRecojo: function () {
      try {
        var c = global.crypto || (global.msCrypto);
        if (c && c.getRandomValues) {
          var a = new Uint32Array(1);
          do { c.getRandomValues(a); } while (a[0] >= 4294960000);
          return String(a[0] % 10000).padStart(4, '0');
        }
      } catch (e) {  }
      return String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    },

    esquema: function (de, datos) {
      return _pedir({op: 'esquema', de: de || 'validate', datos: datos});
    },

    textoPuerta: function (estado, ahora) {
      var e = estado || {};
      var t = Number(ahora) || Date.now();
      if (e.encendida === false) {
        return {icono: '🔌', color: '#8b949e',
          texto: 'Apagada por ti — no se consulta nada a Shalom'};
      }
      var hasta = Number(e.cerradaHasta) || 0;
      if (hasta > t) {
        var min = Math.max(1, Math.round((hasta - t) / 60000));
        return {icono: '⏸️', color: '#d29922',
          texto: 'Pausada sola: Shalom falló varias veces seguidas. ' +
                 'Reintenta en ' + min + ' min.'};
      }
      return {icono: '🟢', color: '#2ea043',
        texto: 'Abierta — el rastreo de Shalom funciona'};
    },

    CATALOGO_CAJAS: [
      {tipo: 'XXS', dims: [15, 10, 10], pesoMaxKg: 0.25},
      {tipo: 'XS',  dims: [20, 15, 12], pesoMaxKg: 0.5},
      {tipo: 'S',   dims: [30, 20, 12], pesoMaxKg: 2},
      {tipo: 'M',   dims: [30, 24, 20], pesoMaxKg: 5},
      {tipo: 'L',   dims: [42, 30, 23], pesoMaxKg: 10}
    ],

    clasificarPaquete: function (largo, ancho, alto, peso) {
      var l = parseFloat(largo), a = parseFloat(ancho),
          h = parseFloat(alto), p = parseFloat(peso);
      if (!(l > 0) || !(a > 0) || !(h > 0) || !(p > 0)) return null;
      var dims = [l, a, h].sort(function (x, y) { return y - x; });
      var cajas = this.CATALOGO_CAJAS;
      for (var i = 0; i < cajas.length; i++) {
        var c = cajas[i];
        if (dims[0] <= c.dims[0] && dims[1] <= c.dims[1] &&
            dims[2] <= c.dims[2] && p <= c.pesoMaxKg) {
          return {tipo: c.tipo, etiqueta: 'Paquete ' + c.tipo};
        }
      }
      return {tipo: 'OTRA', etiqueta: 'Otra Medida'};
    }
  };

  global.Shalom = Shalom;

})(window);
