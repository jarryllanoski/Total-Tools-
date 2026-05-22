/**
 * shalom.js — Módulo de integración Shalom API
 * =============================================
 * Documentación real: shalom-api.lat
 *
 * MODOS DE OPERACIÓN (configura MODE abajo):
 *
 *   'github'   → Llama directo a shalom-api.lat con la key en el JS.
 *                Solo para pruebas en GitHub Pages. NO para producción.
 *
 *   'firebase' → Llama a tus Firebase Functions como proxy.
 *                La key vive en el servidor, no se expone en el cliente.
 *                Ideal para producción.
 *
 * ─── ENDPOINTS REALES USADOS ────────────────────────────────
 *  Header: x-api-key: {KEY}   (NO usar Authorization Bearer)
 *
 *  GET  /api/buscar?q={texto}          → sugerencias de agencias
 *  GET  /api/agencia?q={texto}         → agencias completas
 *  GET  /api/agencia-minimal?q={texto} → agencias ligeras
 *  GET  /api/listar                    → todas las agencias
 *  POST /api/track                     → tracking de guía
 *       Body: { orderNumber, orderCode }
 *
 * Campos de agencia: ter_id, lugar_over, direccion, zona,
 *   provincia, departamento, telefono, hora_atencion,
 *   hora_domingo, latitud, longitud
 * ─────────────────────────────────────────────────────────────
 */

(function (global) {
  'use strict';

  /* ══════════════════════════════════════════════════════════
     CONFIGURACIÓN — edita aquí
  ══════════════════════════════════════════════════════════ */
  var CFG = {
    // ── Modo de operación ──────────────────────────────────
    // 'github'   → directo a shalom-api.lat  (pruebas)
    // 'firebase' → proxy via Firebase Functions (producción)
    MODE: 'github',

    // ── Credenciales (solo usadas en MODE: 'github') ───────
    API_KEY:  'sk_mpgcq745_iuo6illh79h',
    BASE_URL: 'https://shalom-api.lat',

    // ── Firebase Functions URL (solo usadas en MODE: 'firebase') ──
    // Después de hacer deploy, reemplaza con tu URL real:
    // https://us-central1-TU_PROYECTO.cloudfunctions.net/shalom
    FIREBASE_URL: 'https://us-central1-TUPROYECTO.cloudfunctions.net/shalom',

    // ── Comportamiento ──────────────────────────────────────
    DEBOUNCE_MS: 350,    // ms de espera al escribir
    MIN_CHARS:   2,      // mínimo de caracteres para buscar
    MAX_RESULTS: 8,      // máximo de sugerencias
  };

  /* ══════════════════════════════════════════════════════════
     CAPA DE TRANSPORTE
     En modo 'github': llama directo a shalom-api.lat
     En modo 'firebase': llama a tus Cloud Functions como proxy
  ══════════════════════════════════════════════════════════ */
  var Transport = {

    // Construye la URL y headers según el modo
    _resolve: function (endpoint, params) {
      if (CFG.MODE === 'firebase') {
        // El proxy recibe: POST { endpoint, params }
        return {
          url:    CFG.FIREBASE_URL,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body:   JSON.stringify({ endpoint: endpoint, params: params || {} }),
        };
      }
      // Modo github: directo
      return {
        url:    CFG.BASE_URL + endpoint,
        method: params && params._method === 'POST' ? 'POST' : 'GET',
        headers: { 'x-api-key': CFG.API_KEY, 'Content-Type': 'application/json' },
        body:   params && params._body ? JSON.stringify(params._body) : undefined,
      };
    },

    get: async function (endpoint, query) {
      var url = (CFG.MODE === 'firebase')
        ? CFG.FIREBASE_URL
        : CFG.BASE_URL + endpoint + (query ? '?q=' + encodeURIComponent(query) : '');

      if (CFG.MODE === 'firebase') {
        var r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: endpoint, q: query || '' }),
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }

      var r = await fetch(url, { headers: { 'x-api-key': CFG.API_KEY } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    },

    post: async function (endpoint, body) {
      var url = CFG.MODE === 'firebase' ? CFG.FIREBASE_URL : CFG.BASE_URL + endpoint;
      var payload = CFG.MODE === 'firebase'
        ? { endpoint: endpoint, body: body }
        : body;

      var r = await fetch(url, {
        method:  'POST',
        headers: CFG.MODE === 'firebase'
          ? { 'Content-Type': 'application/json' }
          : { 'x-api-key': CFG.API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    },
  };

  /* ══════════════════════════════════════════════════════════
     ADAPTADORES — mapea la respuesta real de la API
     a los campos que usa el resto del módulo.
     Edita aquí si la API cambia algún campo.
  ══════════════════════════════════════════════════════════ */
  function adaptAgencia(raw) {
    return {
      id:           raw.ter_id          || '',
      nombre:       raw.lugar_over      || raw.nombre || '—',
      direccion:    raw.direccion       || '—',
      zona:         raw.zona            || '',
      provincia:    raw.provincia       || '',
      departamento: raw.departamento    || '',
      telefono:     raw.telefono        || '',
      horario:      raw.hora_atencion   || '',
      horarioDom:   raw.hora_domingo    || '',
      lat:          raw.latitud         || null,
      lng:          raw.longitud        || null,
      // texto amigable para mostrar en la card
      textoCompleto: [
        raw.lugar_over,
        raw.direccion,
        raw.zona ? raw.zona + ', ' + (raw.provincia || '') : raw.provincia,
        raw.departamento,
      ].filter(Boolean).join(' · '),
    };
  }

  function adaptTracking(raw) {
    // La API puede devolver el objeto en distintas envolturas
    var d = raw.data || raw.result || raw.tracking || raw;
    var hist = d.historial || d.history || d.estados || d.events || [];
    return {
      guia:           d.orderNumber   || d.guia          || d.nro_guia  || '—',
      codigo:         d.orderCode     || d.codigo        || '',
      estado:         d.estado        || d.status        || d.estado_actual || '—',
      descripcion:    d.descripcion   || d.description   || '',
      origen:         d.origen        || d.ciudad_origen || d.from       || '—',
      destino:        d.destino       || d.ciudad_destino|| d.to         || '—',
      remitente:      d.remitente     || d.sender        || '—',
      destinatario:   d.destinatario  || d.recipient     || '—',
      peso:           d.peso          || d.weight        || '',
      fecha_envio:    d.fecha_envio   || d.created_at    || '',
      fecha_estimada: d.fecha_estimada|| d.eta           || '',
      historial: hist.map(function (e) {
        return {
          estado: e.estado  || e.status || e.descripcion || e.event  || '',
          fecha:  e.fecha   || e.date   || e.datetime    || e.hora   || '',
          lugar:  e.lugar   || e.location || e.ciudad    || '',
        };
      }),
    };
  }

  /* ══════════════════════════════════════════════════════════
     API PÚBLICA
  ══════════════════════════════════════════════════════════ */
  var ShalomAPI = {
    _mode: function () { return CFG.MODE; },
    _setMode: function (m) { CFG.MODE = m; },
  };

  /** Busca agencias por texto (ciudad, distrito, dirección) */
  ShalomAPI.buscarAgencias = async function (texto) {
    if (!texto || texto.trim().length < CFG.MIN_CHARS) return [];
    try {
      var json = await Transport.get('/api/buscar', texto.trim());
      var lista = json.data || json.agencias || json.results || json || [];
      if (!Array.isArray(lista)) lista = [];
      return lista.slice(0, CFG.MAX_RESULTS).map(adaptAgencia);
    } catch (e) {
      console.warn('[ShalomAPI] buscarAgencias:', e.message);
      return [];
    }
  };

  /** Busca agencias completas (más detalle que /buscar) */
  ShalomAPI.buscarAgenciasCompletas = async function (texto) {
    if (!texto || texto.trim().length < CFG.MIN_CHARS) return [];
    try {
      var json = await Transport.get('/api/agencia', texto.trim());
      var lista = json.data || json.agencias || json.results || json || [];
      if (!Array.isArray(lista)) lista = [];
      return lista.slice(0, CFG.MAX_RESULTS).map(adaptAgencia);
    } catch (e) {
      console.warn('[ShalomAPI] buscarAgenciasCompletas:', e.message);
      return [];
    }
  };

  /** Consulta el estado de un envío Shalom */
  ShalomAPI.trackingGuia = async function (orderNumber, orderCode) {
    if (!orderNumber) return null;
    try {
      var json = await Transport.post('/api/track', {
        orderNumber: String(orderNumber).trim(),
        orderCode:   String(orderCode || '').trim(),
      });
      if (json.error || json.message === 'not found') {
        return { error: 'no_encontrada', guia: orderNumber };
      }
      return adaptTracking(json);
    } catch (e) {
      console.warn('[ShalomAPI] trackingGuia:', e.message);
      return { error: 'conexion', guia: orderNumber };
    }
  };

  /* ══════════════════════════════════════════════════════════
     ESTILOS COMPARTIDOS
  ══════════════════════════════════════════════════════════ */
  function injectCSS(id, css) {
    if (!document.getElementById(id)) {
      var s = document.createElement('style');
      s.id = id;
      s.textContent = css;
      document.head.appendChild(s);
    }
  }

  var BASE_CSS = [
    '@keyframes shalomSpin{to{transform:rotate(360deg)}}',
    '@keyframes shalomSpinCenter{to{transform:translateY(-50%) rotate(360deg)}}',
    '.shalom-spin{animation:shalomSpin .7s linear infinite}',
    '.shalom-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;',
    '  border-radius:20px;font-size:11px;font-weight:700;border:1px solid;',
    '  cursor:pointer;transition:opacity .15s;white-space:nowrap}',
    '.shalom-chip:active{opacity:.7}',
    '.sc-nuevo   {background:rgba(245,158,11,.1); border-color:rgba(245,158,11,.35); color:#f59e0b}',
    '.sc-transito{background:rgba(79,142,247,.1); border-color:rgba(79,142,247,.35); color:#4f8ef7}',
    '.sc-agencia {background:rgba(163,113,247,.1);border-color:rgba(163,113,247,.35);color:#a78bfa}',
    '.sc-entregado{background:rgba(34,197,94,.1); border-color:rgba(34,197,94,.35); color:#22c55e}',
    '.sc-error   {background:rgba(248,113,113,.1);border-color:rgba(248,113,113,.35);color:#f87171}',
    '.sc-cargando{background:rgba(107,114,128,.1);border-color:rgba(107,114,128,.35);color:#6b7280}',
  ].join('');

  /* ══════════════════════════════════════════════════════════
     HELPERS COMPARTIDOS
  ══════════════════════════════════════════════════════════ */
  function esc(s) {
    return String(s || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var a = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, a); }, ms);
    };
  }

  function estadoCSS(e) {
    if (!e) return 'sc-cargando';
    var u = e.toUpperCase();
    if (u.includes('ENTREGADO') || u.includes('DELIVERED')) return 'sc-entregado';
    if (u.includes('AGENCIA')   || u.includes('DESTINO'))   return 'sc-agencia';
    if (u.includes('TRANSITO')  || u.includes('TRÁNSITO') || u.includes('VIAJE')) return 'sc-transito';
    if (u.includes('ERROR')     || u.includes('NO ENCONTR')) return 'sc-error';
    return 'sc-nuevo';
  }

  function estadoIco(e) {
    if (!e) return '⟳';
    var u = e.toUpperCase();
    if (u.includes('ENTREGADO'))                               return '✅';
    if (u.includes('AGENCIA')   || u.includes('DESTINO'))     return '🏢';
    if (u.includes('TRANSITO')  || u.includes('TRÁNSITO'))    return '🚌';
    return '📦';
  }

  function infoRow(ico, label, val) {
    if (!val || val === '—') return '';
    return '<div style="display:flex;gap:10px;padding:9px 13px;border-bottom:1px solid rgba(255,255,255,.06)">' +
      '<span style="font-size:14px;flex-shrink:0">' + ico + '</span>' +
      '<div style="min-width:0"><div style="font-size:10px;font-weight:700;color:#8b949e;letter-spacing:.5px">' + esc(label) + '</div>' +
      '<div style="font-size:13px;color:#e6edf3;margin-top:2px;word-break:break-word">' + esc(String(val)) + '</div></div></div>';
  }

  /* ══════════════════════════════════════════════════════════
     MÓDULO 1 — BUSCADOR DE AGENCIAS (formulario.html)
     Reemplaza la cascada Dept→Prov→Dist cuando el cliente
     elige SHALOM. Campo de texto con sugerencias en tiempo real.
  ══════════════════════════════════════════════════════════ */
  ShalomAPI.initBuscadorFormulario = function () {
    injectCSS('shalom-base-css', BASE_CSS);
    injectCSS('shalom-form-css', [
      '.shalom-dropdown{display:none;position:absolute;left:0;right:0;top:calc(100% + 6px);',
      '  background:#0f0f1a;border:1.5px solid #1e1e30;border-radius:12px;',
      '  overflow:hidden;z-index:60;box-shadow:0 8px 32px rgba(0,0,0,.7)}',
      '.shalom-ag-item{padding:12px 15px;cursor:pointer;border-bottom:1px solid #1a1a2a;',
      '  transition:background .12s}',
      '.shalom-ag-item:last-child{border-bottom:none}',
      '.shalom-ag-item:hover,.shalom-ag-item:active{background:rgba(79,142,247,.08)}',
      '.shalom-sel-badge{display:none;margin-top:8px;background:rgba(34,197,94,.07);',
      '  border:1.5px solid rgba(34,197,94,.22);border-radius:10px;padding:11px 14px}',
      '.shalom-mode-badge{display:inline-flex;align-items:center;gap:5px;',
      '  background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.25);',
      '  border-radius:6px;padding:3px 8px;font-size:10px;font-weight:700;color:#f59e0b;',
      '  margin-bottom:8px}',
    ].join(''));

    function init() {
      var box = document.getElementById('agencyBox');
      if (!box) return;

      // Badge de modo (solo visible en modo github como aviso)
      var modeBadge = CFG.MODE === 'github'
        ? '<div class="shalom-mode-badge">⚠ MODO PRUEBA — key expuesta</div>'
        : '';

      box.innerHTML = [
        modeBadge,
        '<span class="slabel" style="margin-top:4px;display:block">',
        '  AGENCIA SHALOM</span>',
        '<div id="shalomSearchWrap" style="position:relative;margin-top:6px">',
        '  <input id="shalomAgInput" class="fi"',
        '    placeholder="Escribe tu ciudad o distrito (ej: Miraflores, Chiclayo...)"',
        '    autocomplete="off" autocorrect="off" spellcheck="false">',
        '  <div id="shalomSpinner" style="display:none;position:absolute;right:12px;top:50%;',
        '    transform:translateY(-50%);width:16px;height:16px;border:2px solid #1e1e30;',
        '    border-top-color:#4f8ef7;border-radius:50%;animation:shalomSpinCenter .7s linear infinite"></div>',
        '  <div class="shalom-dropdown" id="shalomDropdown"></div>',
        '</div>',
        '<div class="shalom-sel-badge" id="shalomSelBadge">',
        '  <div style="font-size:10px;font-weight:800;color:#22c55e;letter-spacing:.8px;margin-bottom:5px">✅ AGENCIA SELECCIONADA</div>',
        '  <div id="shalomSelTxt" style="font-size:12px;color:#f0f0f8;line-height:1.6"></div>',
        '  <button onclick="ShalomAPI._resetAgencia()"',
        '    style="background:none;border:none;color:#6b7280;font-size:11px;',
        '    cursor:pointer;font-family:inherit;margin-top:5px;padding:0">',
        '    ✕ Cambiar agencia</button>',
        '</div>',
      ].join('');

      var input    = document.getElementById('shalomAgInput');
      var dropdown = document.getElementById('shalomDropdown');
      var spinner  = document.getElementById('shalomSpinner');
      var badge    = document.getElementById('shalomSelBadge');
      var selTxt   = document.getElementById('shalomSelTxt');

      // Cache de agencias para la selección
      ShalomAPI._agCache = [];

      // Expone globalmente para el botón onclick inline
      ShalomAPI._resetAgencia = function () {
        window._shalomAgencia = null;
        badge.style.display  = 'none';
        input.value          = '';
        dropdown.style.display = 'none';
        dropdown.innerHTML   = '';
        input.focus();
      };

      ShalomAPI._selAgencia = function (i) {
        var ag = ShalomAPI._agCache[i];
        if (!ag) return;
        window._shalomAgencia = ag;
        // Construye texto del badge
        var partes = [ag.nombre];
        if (ag.direccion && ag.direccion !== '—') partes.push(ag.direccion);
        var geo = [ag.zona, ag.provincia, ag.departamento].filter(Boolean).join(', ');
        if (geo) partes.push(geo);
        if (ag.telefono) partes.push('📞 ' + ag.telefono);
        if (ag.horario)  partes.push('🕐 ' + ag.horario);
        selTxt.innerHTML = partes.map(function (p) {
          return '<div>' + esc(p) + '</div>';
        }).join('');
        badge.style.display    = 'block';
        dropdown.style.display = 'none';
        dropdown.innerHTML     = '';
        input.value = ag.nombre + (ag.zona ? ' — ' + ag.zona : '');
      };

      function renderDropdown(agencias) {
        dropdown.innerHTML = '';
        if (!agencias.length) {
          dropdown.innerHTML = '<div style="padding:15px 16px;font-size:13px;' +
            'color:#6b7280;text-align:center">Sin resultados — intenta con otro término</div>';
          dropdown.style.display = 'block';
          return;
        }
        ShalomAPI._agCache = agencias;
        agencias.forEach(function (ag, i) {
          var el = document.createElement('div');
          el.className = 'shalom-ag-item';
          var geo = [ag.zona, ag.provincia, ag.departamento].filter(Boolean).join(' · ');
          el.innerHTML = [
            '<div style="font-size:13px;font-weight:700;color:#f0f0f8">' + esc(ag.nombre) + '</div>',
            '<div style="font-size:11px;color:#6b7280;margin-top:2px">' + esc(ag.direccion) + '</div>',
            geo ? '<div style="font-size:10px;color:#4f8ef7;margin-top:2px">' + esc(geo) + '</div>' : '',
            ag.horario ? '<div style="font-size:10px;color:#6b7280;margin-top:1px">🕐 ' + esc(ag.horario) + '</div>' : '',
          ].join('');
          el.addEventListener('click', function () { ShalomAPI._selAgencia(i); });
          dropdown.appendChild(el);
        });
        // Footer
        var foot = document.createElement('div');
        foot.style.cssText = 'padding:5px 14px;font-size:9px;color:#30363d;text-align:right;border-top:1px solid #1a1a2a';
        foot.textContent = 'shalom-api.lat';
        dropdown.appendChild(foot);
        dropdown.style.display = 'block';
      }

      var buscar = debounce(async function (val) {
        if (val.length < CFG.MIN_CHARS) {
          dropdown.style.display = 'none';
          spinner.style.display  = 'none';
          return;
        }
        spinner.style.display = 'block';
        var ags = await ShalomAPI.buscarAgencias(val);
        spinner.style.display = 'none';
        renderDropdown(ags);
      }, CFG.DEBOUNCE_MS);

      input.addEventListener('input', function () {
        // Al escribir, limpia la agencia seleccionada
        window._shalomAgencia = null;
        badge.style.display   = 'none';
        buscar(this.value);
      });

      input.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          dropdown.style.display = 'none';
          dropdown.innerHTML = '';
        }
      });

      document.addEventListener('click', function (e) {
        var wrap = document.getElementById('shalomSearchWrap');
        if (wrap && !wrap.contains(e.target)) {
          dropdown.style.display = 'none';
        }
      });

      console.log('[ShalomAPI] Buscador agencias listo | modo:', CFG.MODE);
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  };

  /* ══════════════════════════════════════════════════════════
     MÓDULO 2 — TRACKING EN PANEL (index.html)
     Campo "N° Guía + Código" en el form de envíos.
     Badge de color en cada card con estado en tiempo real.
     Sheet de detalle con historial al tocar el badge.
  ══════════════════════════════════════════════════════════ */
  ShalomAPI.initTrackingPanel = function () {
    injectCSS('shalom-base-css', BASE_CSS);
    injectCSS('shalom-panel-css', [
      '#shalomOv{display:none;position:fixed;inset:0;background:rgba(0,0,0,.85);',
      '  z-index:800;align-items:flex-end;justify-content:center}',
      '#shalomOv.open{display:flex}',
      '#shalomSheet{background:#161b22;border-radius:16px 16px 0 0;padding:20px;',
      '  width:100%;max-width:480px;border:1px solid #30363d;',
      '  animation:shalomUp .22s ease;max-height:88vh;overflow-y:auto}',
      '@keyframes shalomUp{from{transform:translateY(100%)}to{transform:translateY(0)}}',
      '.sh-hist-row{display:flex;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05)}',
      '.sh-hist-row:last-child{border-bottom:none}',
      '.sh-hist-dot{width:8px;height:8px;border-radius:50%;background:#4f8ef7;',
      '  flex-shrink:0;margin-top:5px}',
      '.shalom-guia-wrap{background:rgba(56,139,253,.06);border:1px solid rgba(56,139,253,.15);',
      '  border-radius:8px;padding:8px 10px;margin-top:7px;display:flex;flex-direction:column;gap:5px}',
    ].join(''));

    // Overlay de detalle
    if (!document.getElementById('shalomOv')) {
      var ov = document.createElement('div');
      ov.id = 'shalomOv';
      ov.innerHTML = [
        '<div id="shalomSheet">',
        '  <div id="shalomSheetContent"></div>',
        '  <button onclick="ShalomAPI.cerrarSheet()" style="width:100%;margin-top:14px;',
        '    padding:12px;background:#1c2333;border:1px solid #30363d;border-radius:10px;',
        '    color:#8b949e;font-size:13px;cursor:pointer;font-family:inherit">Cerrar</button>',
        '</div>',
      ].join('');
      ov.addEventListener('click', function (e) {
        if (e.target === ov) ShalomAPI.cerrarSheet();
      });
      document.body.appendChild(ov);
    }

    ShalomAPI.cerrarSheet = function () {
      var ov = document.getElementById('shalomOv');
      if (ov) ov.classList.remove('open');
    };

    /**
     * Renderiza el bloque de guía Shalom dentro de una card.
     * Uso en cardHTML(s): ${ShalomAPI.renderBadgeCard(s)}
     */
    ShalomAPI.renderBadgeCard = function (s) {
      if (!s.shalomGuia) return '';

      var badgeHTML;
      if (!s.shalomEstado) {
        // Nunca consultado
        badgeHTML = '<span class="shalom-chip sc-cargando" ' +
          'onclick="ShalomAPI.consultarEstado(\'' + esc(s.id) + '\')">' +
          '⟳ Consultar estado Shalom</span>';
      } else if (s.shalomEstado === 'error_conexion') {
        badgeHTML = '<span class="shalom-chip sc-error" ' +
          'onclick="ShalomAPI.consultarEstado(\'' + esc(s.id) + '\')">' +
          '⚠ Sin conexión — reintentar</span>';
      } else if (s.shalomEstado === 'no_encontrada') {
        badgeHTML = '<span class="shalom-chip sc-error" ' +
          'onclick="ShalomAPI.consultarEstado(\'' + esc(s.id) + '\')">' +
          '❌ Guía no encontrada</span>';
      } else {
        var cls = estadoCSS(s.shalomEstado);
        var ico = estadoIco(s.shalomEstado);
        badgeHTML = '<span class="shalom-chip ' + cls + '" ' +
          'onclick="ShalomAPI.verDetalle(\'' + esc(s.id) + '\')">' +
          ico + ' ' + esc(s.shalomEstado) +
          ' <span style="opacity:.55;font-size:9px;margin-left:2px">↗ detalle</span></span>';
      }

      return '<div class="shalom-guia-wrap">' +
        '<div style="font-size:10px;color:#8b949e">🚌 Guía Shalom: ' +
        '<b style="color:#e6edf3;font-family:monospace">' + esc(s.shalomGuia) + '</b>' +
        (s.shalomCodigo ? ' · Código: <b style="color:#e6edf3;font-family:monospace">' + esc(s.shalomCodigo) + '</b>' : '') +
        '</div>' +
        badgeHTML +
        '</div>';
    };

    /**
     * Consulta el estado y actualiza el badge en la card.
     * Llama a window.S (estado global del panel) para actualizar el shipment.
     */
    ShalomAPI.consultarEstado = async function (shipId) {
      // Accede al estado global del panel
      if (typeof window.S === 'undefined' || !window.S.shipments) {
        console.warn('[ShalomAPI] No se encontró window.S — verifica que el panel esté cargado');
        return;
      }
      var ship = window.S.shipments.find(function (x) { return x.id === shipId; });
      if (!ship || !ship.shalomGuia) return;

      // Marca como cargando y re-renderiza
      ship.shalomEstado = 'cargando';
      if (typeof window.render === 'function') window.render();

      var result = await ShalomAPI.trackingGuia(ship.shalomGuia, ship.shalomCodigo);

      if (!result) {
        ship.shalomEstado = 'error_conexion';
      } else if (result.error) {
        ship.shalomEstado = result.error === 'no_encontrada' ? 'no_encontrada' : 'error_conexion';
      } else {
        ship.shalomEstado     = result.estado;
        ship.shalomTracking   = result; // guarda el resultado completo
      }

      // Guarda localmente + Firebase
      if (typeof window.save === 'function') window.save();
      if (typeof window.render === 'function') window.render();
    };

    /**
     * Muestra el sheet de detalle con historial.
     */
    ShalomAPI.verDetalle = async function (shipId) {
      var ov  = document.getElementById('shalomOv');
      var cnt = document.getElementById('shalomSheetContent');
      if (!ov || !cnt) return;

      // Si ya tiene datos guardados, muestra de inmediato
      var ship = window.S && window.S.shipments
        ? window.S.shipments.find(function (x) { return x.id === shipId; })
        : null;

      cnt.innerHTML = _spinnerHTML('Consultando estado actual...');
      ov.classList.add('open');

      var result;
      if (ship && ship.shalomTracking) {
        result = ship.shalomTracking;
      } else {
        result = ship
          ? await ShalomAPI.trackingGuia(ship.shalomGuia, ship.shalomCodigo)
          : null;
      }

      _renderSheetTracking(cnt, result, ship ? ship.shalomGuia : '?');
    };

    function _spinnerHTML(msg) {
      return '<div style="text-align:center;padding:32px 16px">' +
        '<div style="width:32px;height:32px;border:2.5px solid #30363d;border-top-color:#4f8ef7;' +
        'border-radius:50%;animation:shalomSpin .7s linear infinite;margin:0 auto 12px"></div>' +
        '<div style="font-size:13px;color:#8b949e">' + esc(msg) + '</div></div>';
    }

    function _renderSheetTracking(cnt, result, guia) {
      if (!result || result.error === 'conexion') {
        cnt.innerHTML = '<div style="text-align:center;padding:28px">' +
          '<div style="font-size:36px;margin-bottom:10px">⚠️</div>' +
          '<div style="font-size:15px;font-weight:700;color:#f87171">Sin conexión</div>' +
          '<div style="font-size:12px;color:#8b949e;margin-top:6px">Verifica tu internet e intenta de nuevo.</div></div>';
        return;
      }
      if (result.error === 'no_encontrada') {
        cnt.innerHTML = '<div style="text-align:center;padding:28px">' +
          '<div style="font-size:36px;margin-bottom:10px">❌</div>' +
          '<div style="font-size:15px;font-weight:700;color:#f87171">Guía no encontrada</div>' +
          '<div style="font-size:12px;color:#8b949e;margin-top:6px">Número: <b style="color:#e6edf3">' +
          esc(guia) + '</b></div></div>';
        return;
      }

      var cls  = estadoCSS(result.estado);
      var ico  = estadoIco(result.estado);
      var hist = result.historial || [];

      cnt.innerHTML = [
        // Encabezado
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">',
        '  <div style="font-family:Syne,sans-serif;font-weight:800;font-size:17px">🚌 Estado Shalom</div>',
        '  <div style="font-size:11px;color:#8b949e;background:#1c2333;border:1px solid #30363d;',
        '    border-radius:6px;padding:3px 9px;font-family:monospace">' + esc(result.guia) + '</div>',
        '</div>',
        // Badge de estado
        '<div class="shalom-chip ' + cls + '" style="font-size:14px;padding:11px 16px;',
        '  border-radius:10px;width:100%;justify-content:center;cursor:default;',
        '  margin-bottom:14px;box-sizing:border-box">',
        ico + ' ' + esc(result.estado),
        '</div>',
        // Info
        '<div style="background:#1c2333;border:1px solid #30363d;border-radius:10px;overflow:hidden;margin-bottom:14px">',
        infoRow('📦', 'Guía',          result.guia),
        infoRow('🔑', 'Código',        result.codigo),
        infoRow('🏙', 'Origen',        result.origen),
        infoRow('📍', 'Destino',       result.destino),
        infoRow('👤', 'Remitente',     result.remitente),
        infoRow('🙋', 'Destinatario',  result.destinatario),
        infoRow('⚖', 'Peso',          result.peso),
        infoRow('📅', 'Fecha envío',   result.fecha_envio),
        infoRow('🎯', 'Fecha estimada',result.fecha_estimada),
        result.descripcion ? infoRow('📝', 'Detalle', result.descripcion) : '',
        '</div>',
        // Historial
        hist.length ? [
          '<div style="font-size:10px;font-weight:800;color:#8b949e;letter-spacing:.8px;margin-bottom:8px">HISTORIAL</div>',
          '<div style="background:#1c2333;border:1px solid #30363d;border-radius:10px;padding:4px 14px">',
          hist.map(function (h) {
            return '<div class="sh-hist-row">' +
              '<div class="sh-hist-dot"></div>' +
              '<div style="min-width:0"><div style="font-size:12px;font-weight:700;color:#e6edf3">' + esc(h.estado) + '</div>' +
              (h.fecha ? '<div style="font-size:10px;color:#8b949e;margin-top:1px">' + esc(h.fecha) +
              (h.lugar ? ' · ' + esc(h.lugar) : '') + '</div>' : '') +
              '</div></div>';
          }).join(''),
          '</div>',
        ].join('') : '',
      ].join('');
    }

    /**
     * Agrega los campos Guía + Código Shalom al form del panel.
     * Llama una vez que el DOM del form esté listo.
     */
    ShalomAPI.patchFormPanel = function () {
      var fNotes = document.getElementById('fNotes');
      if (!fNotes || document.getElementById('fShalomGuia')) return;

      var wrap = document.createElement('div');
      wrap.innerHTML = [
        '<div style="background:rgba(56,139,253,.06);border:1px solid rgba(56,139,253,.15);',
        '  border-radius:10px;padding:12px;margin-bottom:11px">',
        '  <div style="font-size:10px;font-weight:700;color:#388bfd;letter-spacing:.8px;',
        '    text-transform:uppercase;margin-bottom:10px">🚌 Guía Shalom (opcional)</div>',
        '  <div style="display:flex;gap:8px">',
        '    <div style="flex:2"><label class="fl">Número de guía</label>',
        '      <input class="fi" id="fShalomGuia" placeholder="Ej: 66479331"',
        '        style="font-family:monospace" inputmode="numeric"></div>',
        '    <div style="flex:1"><label class="fl">Código</label>',
        '      <input class="fi" id="fShalomCodigo" placeholder="Ej: 3KTH"',
        '        style="font-family:monospace;text-transform:uppercase"',
        '        oninput="this.value=this.value.toUpperCase()" maxlength="6"></div>',
        '  </div>',
        '</div>',
      ].join('');
      fNotes.parentNode.insertBefore(wrap, fNotes.nextSibling);
      console.log('[ShalomAPI] Campos guía+código agregados al form ✓');
    };

    console.log('[ShalomAPI] Módulo panel listo | modo:', CFG.MODE);
  };

  /* ══════════════════════════════════════════════════════════
     MÓDULO 3 — TRACKING EN FORMULARIO (formulario.html)
     Sección de rastreo de guía Shalom para el cliente.
     Se agrega debajo del buscador de pedido existente.
  ══════════════════════════════════════════════════════════ */
  ShalomAPI.initTrackingFormulario = function () {
    injectCSS('shalom-base-css', BASE_CSS);

    function init() {
      var trackSearch = document.getElementById('trackSearch');
      if (!trackSearch || document.getElementById('shalomTrackSection')) return;

      var sec = document.createElement('div');
      sec.id = 'shalomTrackSection';
      sec.innerHTML = [
        '<div style="height:1px;background:#1e1e30;margin:20px 0 16px"></div>',
        '<div style="font-size:10px;font-weight:800;color:#6b7280;letter-spacing:1px;margin-bottom:10px">',
        '🚌 RASTREAR GUÍA SHALOM</div>',
        '<div style="display:flex;gap:8px;margin-bottom:6px">',
        '  <input id="shalomTrkNum" class="fi"',
        '    placeholder="Número de guía (Ej: 66479331)"',
        '    style="flex:2;font-family:monospace;font-size:14px;font-weight:700"',
        '    inputmode="numeric" maxlength="15">',
        '  <input id="shalomTrkCode" class="fi"',
        '    placeholder="Código"',
        '    style="flex:1;font-family:monospace;font-size:14px;font-weight:700;text-transform:uppercase"',
        '    oninput="this.value=this.value.toUpperCase()" maxlength="6">',
        '</div>',
        '<button onclick="ShalomAPI._buscarTrkFormulario()"',
        '  style="width:100%;background:#4f8ef7;border:none;border-radius:12px;padding:13px;',
        '  color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:Outfit,sans-serif;',
        '  margin-bottom:8px">Rastrear envío Shalom</button>',
        '<div id="shalomTrkErr" style="font-size:12px;color:#f87171;padding:4px 2px;display:none">',
        '❌ Guía no encontrada. Verifica el número e intenta de nuevo.</div>',
        '<div id="shalomTrkResult" style="margin-top:10px"></div>',
      ].join('');
      trackSearch.appendChild(sec);

      // Enter en cualquier campo busca
      ['shalomTrkNum','shalomTrkCode'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') ShalomAPI._buscarTrkFormulario();
        });
      });

      console.log('[ShalomAPI] Tracking formulario listo | modo:', CFG.MODE);
    }

    ShalomAPI._buscarTrkFormulario = async function () {
      var numEl  = document.getElementById('shalomTrkNum');
      var codeEl = document.getElementById('shalomTrkCode');
      var errEl  = document.getElementById('shalomTrkErr');
      var resEl  = document.getElementById('shalomTrkResult');
      if (!numEl || !resEl) return;

      var num  = numEl.value.trim();
      var code = codeEl ? codeEl.value.trim() : '';
      if (!num) { numEl.focus(); return; }

      errEl.style.display = 'none';
      resEl.innerHTML = [
        '<div style="text-align:center;padding:24px;color:#6b7280">',
        '  <div style="width:28px;height:28px;border:2px solid #1e1e30;border-top-color:#4f8ef7;',
        '    border-radius:50%;animation:shalomSpin .7s linear infinite;margin:0 auto 10px"></div>',
        '  <div style="font-size:12px">Consultando guía <b style="color:#f0f0f8">' + esc(num) + '</b>...</div>',
        '</div>',
      ].join('');

      var result = await ShalomAPI.trackingGuia(num, code);

      if (!result || result.error === 'no_encontrada') {
        resEl.innerHTML = '';
        errEl.style.display = 'block';
        return;
      }
      if (result.error === 'conexion') {
        resEl.innerHTML = '<div style="text-align:center;padding:16px;font-size:12px;color:#f87171">' +
          '⚠️ Sin conexión — verifica tu internet</div>';
        return;
      }

      var STEPS = ['Registrado','En proceso','En tránsito','En agencia','Entregado'];
      var eu  = (result.estado || '').toUpperCase();
      var step = eu.includes('ENTREGADO') ? 4
               : eu.includes('AGENCIA')   ? 3
               : eu.includes('TRANSITO')  ? 2
               : eu.includes('PROCESO')   ? 1 : 0;
      var clr = estadoCSS(result.estado);
      var clrMap = {
        'sc-nuevo':'#f59e0b','sc-transito':'#4f8ef7',
        'sc-agencia':'#a78bfa','sc-entregado':'#22c55e','sc-error':'#f87171','sc-cargando':'#6b7280',
      };
      var color = clrMap[clr] || '#4f8ef7';
      var hist  = result.historial || [];

      resEl.innerHTML = [
        '<div style="background:#0f0f1a;border:1.5px solid #1e1e30;border-radius:14px;overflow:hidden">',
        // Estado
        '<div style="padding:14px 16px;border-bottom:1px solid #1e1e30">',
        '  <div style="font-size:10px;font-weight:800;color:#6b7280;letter-spacing:.8px;margin-bottom:8px">ESTADO</div>',
        '  <div class="shalom-chip ' + clr + '" style="font-size:14px;padding:11px 16px;',
        '    border-radius:10px;width:100%;justify-content:center;cursor:default;box-sizing:border-box">',
        estadoIco(result.estado) + ' ' + esc(result.estado),
        '  </div>',
        '</div>',
        // Barra de progreso
        '<div style="padding:12px 16px;border-bottom:1px solid #1e1e30">',
        '  <div style="display:flex;gap:4px;margin-bottom:5px">',
        STEPS.map(function (_, i) {
          return '<div style="flex:1;height:4px;border-radius:2px;background:' +
            (i <= step ? color : '#1e1e30') + '"></div>';
        }).join(''),
        '  </div>',
        '  <div style="font-size:11px;color:#6b7280">Paso ' + (step + 1) + ' de ' +
        STEPS.length + ': ' + esc(result.estado) + '</div>',
        '</div>',
        // Detalles
        '<div style="padding:4px 0;border-bottom:1px solid #1e1e30">',
        infoRow('📦', 'Guía',          result.guia),
        infoRow('🔑', 'Código',        result.codigo),
        infoRow('🏙', 'Origen',        result.origen),
        infoRow('📍', 'Destino',       result.destino),
        infoRow('👤', 'Remitente',     result.remitente),
        infoRow('🙋', 'Destinatario',  result.destinatario),
        infoRow('📅', 'Fecha envío',   result.fecha_envio),
        infoRow('🎯', 'Fecha estimada',result.fecha_estimada),
        '</div>',
        // Historial
        hist.length ? [
          '<div style="padding:12px 16px">',
          '<div style="font-size:10px;font-weight:800;color:#6b7280;letter-spacing:.8px;margin-bottom:8px">HISTORIAL</div>',
          hist.map(function (h) {
            return '<div style="display:flex;gap:8px;padding:7px 0;border-bottom:1px solid #1a1a2a">' +
              '<div style="width:6px;height:6px;border-radius:50%;background:#4f8ef7;flex-shrink:0;margin-top:5px"></div>' +
              '<div><div style="font-size:12px;font-weight:600;color:#f0f0f8">' + esc(h.estado) + '</div>' +
              (h.fecha ? '<div style="font-size:10px;color:#6b7280;margin-top:1px">' + esc(h.fecha) +
              (h.lugar ? ' · ' + esc(h.lugar) : '') + '</div>' : '') +
              '</div></div>';
          }).join(''),
          '</div>',
        ].join('') : '',
        '</div>',
        '<button onclick="ShalomAPI._resetTrkFormulario()"',
        '  style="width:100%;background:transparent;border:none;color:#6b7280;',
        '  font-size:12px;cursor:pointer;font-family:Outfit,sans-serif;padding:12px 0;margin-top:2px">',
        '← Buscar otra guía</button>',
      ].join('');
    };

    ShalomAPI._resetTrkFormulario = function () {
      var num = document.getElementById('shalomTrkNum');
      var cod = document.getElementById('shalomTrkCode');
      var err = document.getElementById('shalomTrkErr');
      var res = document.getElementById('shalomTrkResult');
      if (num) num.value = '';
      if (cod) cod.value = '';
      if (err) err.style.display = 'none';
      if (res) res.innerHTML = '';
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      setTimeout(init, 200);
    }
  };

  /* ══════════════════════════════════════════════════════════
     FIREBASE FUNCTIONS — código de referencia
     Copia esto en functions/index.js de tu proyecto Firebase.
     Instala: npm install firebase-functions firebase-admin node-fetch
  ══════════════════════════════════════════════════════════

  const functions = require('firebase-functions');
  const fetch     = require('node-fetch');

  const SHALOM_KEY = functions.config().shalom.key;
  // Para guardar la key: firebase functions:config:set shalom.key="sk_mpgcq745_iuo6illh79h"

  exports.shalom = functions.https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin',  '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST')    { res.status(405).send('Method Not Allowed'); return; }

    const { endpoint, q, body } = req.body;
    const ALLOWED = ['/api/buscar','/api/agencia','/api/agencia-minimal','/api/listar','/api/track'];
    if (!ALLOWED.includes(endpoint)) { res.status(400).send('Endpoint no permitido'); return; }

    try {
      const isPost = endpoint === '/api/track';
      const url = 'https://shalom-api.lat' + endpoint + (!isPost && q ? '?q=' + encodeURIComponent(q) : '');
      const r = await fetch(url, {
        method:  isPost ? 'POST' : 'GET',
        headers: { 'x-api-key': SHALOM_KEY, 'Content-Type': 'application/json' },
        body:    isPost ? JSON.stringify(body) : undefined,
      });
      const data = await r.json();
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  ══════════════════════════════════════════════════════════ */

  // Exponer globalmente
  global.ShalomAPI = ShalomAPI;

})(window);
