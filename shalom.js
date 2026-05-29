/**
 * shalom.js — Módulo de integración Shalom API
 * =============================================
 * v2.0 — Agencias locales primero, API solo para tracking
 *
 * ARQUITECTURA:
 *   Búsqueda agencias → /data/agencias-shalom.json  (local, offline)
 *                     → /api/buscar                  (fallback si falla el JSON)
 *   Tracking          → /api/track  (siempre API, datos en tiempo real)
 *
 * MODOS:
 *   MODE 'github'   → API key en proxy interno (no expuesta en el HTML)
 *                     La key solo vive en este archivo durante pruebas.
 *   MODE 'firebase' → Cloud Function como proxy. Key en servidor.
 *
 * Para pasar a producción:
 *   1. Cambia MODE a 'firebase'
 *   2. Pon tu FIREBASE_URL
 *   3. Elimina API_KEY de este archivo (la key vivirá solo en el servidor)
 */

(function (global) {
  'use strict';

  /* ══════════════════════════════════════════════════════════
     CONFIGURACIÓN
  ══════════════════════════════════════════════════════════ */
  var CFG = {
    // Modo actual: 'github' | 'firebase'
    MODE: 'github',

    // ── Solo para MODE: 'github' (pruebas GitHub Pages) ───
    // En producción: quitar esta línea y usar Firebase.
    API_KEY:  '',
    BASE_URL: 'https://shalom-api.lat',

    // ── Solo para MODE: 'firebase' ────────────────────────
    FIREBASE_URL:         'https://us-central1-total-tools-24ce8.cloudfunctions.net/agenciasShalom',
    FIREBASE_AGENCIAS_URL:'https://us-central1-total-tools-24ce8.cloudfunctions.net/agenciasShalom',

    // ── Agencias locales ─────────────────────────────────
    // Ruta al JSON generado por extraer-agencias.js
    LOCAL_JSON: './data/agencias-shalom.json',

    // Comportamiento
    DEBOUNCE_MS:   350,
    MIN_CHARS:     2,
    MAX_RESULTS:   8,
  };

  /* ══════════════════════════════════════════════════════════
     CACHE LOCAL DE AGENCIAS
     Se carga una sola vez desde el JSON local.
  ══════════════════════════════════════════════════════════ */
  var _localAgencias = null;  // null = sin cargar, [] = cargado (vacío o con datos)
  var _localPromise  = null;  // Promise singleton — evita race condition y fetches duplicados

  function cargarLocal() {
    if (_localAgencias !== null) return Promise.resolve(_localAgencias);
    if (_localPromise)           return _localPromise;  // todos los callers comparten el mismo Promise

    _localPromise = (function() {
      var ctrl  = new AbortController();
      var timer = setTimeout(function(){ ctrl.abort(); }, 8000); // 8s máximo

      return fetch(CFG.LOCAL_JSON + '?v=' + (window._shalomJSONVersion || '1'), { signal: ctrl.signal })
        .then(function(r) {
          clearTimeout(timer);
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(function(json) {
          var lista = json.agencias || json.data || json || [];
          _localAgencias = Array.isArray(lista) ? lista : [];
          return _localAgencias;
        })
        .catch(function() {
          clearTimeout(timer);
          _localAgencias = [];   // vacío = usar API como fallback
          return _localAgencias;
        });
    })();

    return _localPromise;
  }

  /* ══════════════════════════════════════════════════════════
     CAPA DE TRANSPORTE — API remota (solo tracking)
  ══════════════════════════════════════════════════════════ */
  var Transport = {
    get: async function (endpoint, query) {
      var url = CFG.MODE === 'firebase'
        ? (endpoint.includes('track') ? CFG.FIREBASE_URL : CFG.FIREBASE_AGENCIAS_URL)
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
      var url = CFG.MODE === 'firebase' ? (endpoint.includes('track') ? CFG.FIREBASE_URL : CFG.FIREBASE_AGENCIAS_URL) : CFG.BASE_URL + endpoint;
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
     BÚSQUEDA LOCAL — sobre el JSON cargado en memoria
     Busca por nombre, distrito, provincia, departamento, dirección.
  ══════════════════════════════════════════════════════════ */
  function buscarEnLocal(texto, lista) {
    var q = texto.trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // ignora acentos

    return lista.filter(function (ag) {
      var haystack = [
        ag.nombre, ag.distrito, ag.provincia,
        ag.departamento, ag.direccion, ag.referencia,
      ].join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return haystack.includes(q);
    }).slice(0, CFG.MAX_RESULTS);
  }

  /* ══════════════════════════════════════════════════════════
     ADAPTADORES — campos reales de la API / JSON local
  ══════════════════════════════════════════════════════════ */
  function adaptAgencia(raw) {
    return {
      id:           String(raw.id           || raw.ter_id       || '').trim(),
      nombre:       String(raw.nombre       || raw.lugar_over   || '').trim(),
      departamento: String(raw.departamento || '').trim(),
      provincia:    String(raw.provincia    || '').trim(),
      distrito:     String(raw.distrito     || raw.zona         || '').trim(),
      direccion:    String(raw.direccion    || '').trim(),
      referencia:   String(raw.referencia   || '').trim(),
      telefono:     String(raw.telefono     || '').trim(),
      horario:      String(raw.horario      || raw.hora_atencion|| '').trim(),
      horarioDom:   String(raw.horarioDom   || raw.hora_domingo || '').trim(),
      latitud:      raw.latitud  != null ? Number(raw.latitud)  : null,
      longitud:     raw.longitud != null ? Number(raw.longitud) : null,
      tipo:         String(raw.tipo         || '').trim(),
    };
  }

  function adaptTracking(raw) {
    var d = raw.data || raw.result || raw.tracking || raw;
    var hist = d.historial || d.history || d.estados || d.events || [];
    return {
      guia:           String(d.orderNumber   || d.guia          || '—'),
      codigo:         String(d.orderCode     || d.codigo        || ''),
      estado:         String(d.estado        || d.status        || '—'),
      descripcion:    String(d.descripcion   || d.description   || ''),
      origen:         String(d.origen        || d.ciudad_origen || '—'),
      destino:        String(d.destino       || d.ciudad_destino|| '—'),
      remitente:      String(d.remitente     || d.sender        || '—'),
      destinatario:   String(d.destinatario  || d.recipient     || '—'),
      peso:           String(d.peso          || d.weight        || ''),
      fecha_envio:    String(d.fecha_envio   || d.created_at    || ''),
      fecha_estimada: String(d.fecha_estimada|| d.eta           || ''),
      historial: hist.map(function (e) {
        return {
          estado: String(e.estado  || e.status || e.descripcion || ''),
          fecha:  String(e.fecha   || e.date   || e.datetime    || ''),
          lugar:  String(e.lugar   || e.location || e.ciudad    || ''),
        };
      }),
    };
  }

  /* ══════════════════════════════════════════════════════════
     API PÚBLICA
  ══════════════════════════════════════════════════════════ */
  var ShalomAPI = {};

  /**
   * Busca agencias: primero en JSON local, luego API como fallback.
   * @param {string} texto
   * @returns {Promise<agencia[]>}
   */
  ShalomAPI.buscarAgencias = async function (texto) {
    if (!texto || texto.trim().length < CFG.MIN_CHARS) return [];

    // 1️⃣ Intentar JSON local
    var local = await cargarLocal();
    if (local.length > 0) {
      var resultados = buscarEnLocal(texto, local);
      if (resultados.length > 0) return resultados;
      // Si no hay resultados locales, intentar API de todas formas
    }

    // 2️⃣ Fallback: API remota
    try {
      var json = await Transport.get('/api/buscar', texto.trim());
      var lista = json.resultados || json.data || json.agencias || json.results || json || [];
      if (!Array.isArray(lista)) lista = [];
      return lista.slice(0, CFG.MAX_RESULTS).map(adaptAgencia);
    } catch (e) {
      console.warn('[ShalomAPI] buscarAgencias API fallback falló:', e.message);
      return [];
    }
  };

  /**
   * Tracking de guía — siempre desde la API (datos en tiempo real).
   * @param {string} orderNumber
   * @param {string} orderCode
   */
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
      s.id = id; s.textContent = css;
      document.head.appendChild(s);
    }
  }

  var BASE_CSS = [
    '@keyframes shalomSpin{to{transform:rotate(360deg)}}',
    '@keyframes shalomSpinMid{to{transform:translateY(-50%) rotate(360deg)}}',
    '.shalom-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;',
    '  border-radius:20px;font-size:11px;font-weight:700;border:1px solid;',
    '  cursor:pointer;transition:opacity .15s;white-space:nowrap}',
    '.shalom-chip:active{opacity:.7}',
    '.sc-nuevo   {background:rgba(245,158,11,.1); border-color:rgba(245,158,11,.35);color:#f59e0b}',
    '.sc-transito{background:rgba(79,142,247,.1); border-color:rgba(79,142,247,.35);color:#4f8ef7}',
    '.sc-agencia {background:rgba(163,113,247,.1);border-color:rgba(163,113,247,.35);color:#a78bfa}',
    '.sc-entregado{background:rgba(34,197,94,.1); border-color:rgba(34,197,94,.35); color:#22c55e}',
    '.sc-error   {background:rgba(248,113,113,.1);border-color:rgba(248,113,113,.35);color:#f87171}',
    '.sc-cargando{background:rgba(107,114,128,.1);border-color:rgba(107,114,128,.35);color:#6b7280}',
  ].join('');

  /* ══════════════════════════════════════════════════════════
     HELPERS
  ══════════════════════════════════════════════════════════ */
  function esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function debounce(fn, ms) {
    var t;
    return function() {
      var a = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function(){ fn.apply(ctx,a); }, ms);
    };
  }
  function estadoCSS(e) {
    if (!e) return 'sc-cargando';
    var u = e.toUpperCase();
    if (u.includes('ENTREGADO')||u.includes('DELIVERED')) return 'sc-entregado';
    if (u.includes('AGENCIA')  ||u.includes('DESTINO'))   return 'sc-agencia';
    if (u.includes('TRANSITO') ||u.includes('TRÁNSITO')||u.includes('VIAJE')) return 'sc-transito';
    if (u.includes('ERROR')    ||u.includes('NO ENCONTR')) return 'sc-error';
    return 'sc-nuevo';
  }
  function estadoIco(e) {
    if (!e) return '⟳';
    var u = e.toUpperCase();
    if (u.includes('ENTREGADO'))                           return '✅';
    if (u.includes('AGENCIA')  ||u.includes('DESTINO'))   return '🏢';
    if (u.includes('TRANSITO') ||u.includes('TRÁNSITO'))  return '🚌';
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
     Local primero → API como fallback
     Sin aviso de "modo prueba" ni API key visible en el HTML
  ══════════════════════════════════════════════════════════ */
  ShalomAPI.initBuscadorFormulario = function () {
    injectCSS('shalom-base-css', BASE_CSS);
    injectCSS('shalom-form-css', [
      '.shalom-dropdown{display:none;position:absolute;left:0;right:0;top:calc(100% + 6px);',
      '  background:#0f0f1a;border:1.5px solid #1e1e30;border-radius:12px;',
      '  overflow:hidden;z-index:60;box-shadow:0 8px 32px rgba(0,0,0,.7);max-height:320px;overflow-y:auto}',
      '.shalom-ag-item{padding:12px 15px;cursor:pointer;border-bottom:1px solid #1a1a2a;transition:background .12s}',
      '.shalom-ag-item:last-child{border-bottom:none}',
      '.shalom-ag-item:hover,.shalom-ag-item:active{background:rgba(79,142,247,.08)}',
      '.shalom-sel-badge{display:none;margin-top:8px;background:rgba(34,197,94,.07);',
      '  border:1.5px solid rgba(34,197,94,.22);border-radius:10px;padding:11px 14px}',
    ].join(''));

    // Precarga el JSON al iniciar para que la primera búsqueda sea instantánea
    cargarLocal();

    function init() {
      var box = document.getElementById('agencyBox');
      if (!box) return;

      box.innerHTML = [
        '<span class="slabel" style="margin-top:4px;display:block">AGENCIA SHALOM</span>',
        '<div id="shalomSearchWrap" style="position:relative;margin-top:6px">',
        '  <input id="shalomAgInput" class="fi"',
        '    placeholder="Escribe tu ciudad o distrito (ej: Miraflores, Chiclayo...)"',
        '    autocomplete="off" autocorrect="off" spellcheck="false">',
        '  <div id="shalomSpinner" style="display:none;position:absolute;right:12px;top:50%;',
        '    transform:translateY(-50%);width:16px;height:16px;border:2px solid #1e1e30;',
        '    border-top-color:#4f8ef7;border-radius:50%;animation:shalomSpinMid .7s linear infinite"></div>',
        '  <div class="shalom-dropdown" id="shalomDropdown"></div>',
        '</div>',
        '<div class="shalom-sel-badge" id="shalomSelBadge">',
        '  <div style="font-size:10px;font-weight:800;color:#22c55e;letter-spacing:.8px;margin-bottom:5px">✅ AGENCIA SELECCIONADA</div>',
        '  <div id="shalomSelTxt" style="font-size:12px;color:#f0f0f8;line-height:1.6"></div>',
        '  <button onclick="ShalomAPI._resetAgencia()"',
        '    style="background:none;border:none;color:#6b7280;font-size:11px;cursor:pointer;font-family:inherit;margin-top:5px;padding:0">',
        '    ✕ Cambiar agencia</button>',
        '</div>',
      ].join('');

      var input    = document.getElementById('shalomAgInput');
      var dropdown = document.getElementById('shalomDropdown');
      var spinner  = document.getElementById('shalomSpinner');
      var badge    = document.getElementById('shalomSelBadge');
      var selTxt   = document.getElementById('shalomSelTxt');

      ShalomAPI._agCache = [];

      ShalomAPI._resetAgencia = function () {
        window._shalomAgencia = null;
        badge.style.display   = 'none';
        input.value           = '';
        dropdown.style.display = 'none';
        dropdown.innerHTML    = '';
        input.focus();
      };

      ShalomAPI._selAgencia = function (i) {
        var ag = ShalomAPI._agCache[i];
        if (!ag) return;
        window._shalomAgencia = ag;
        var partes = [ag.nombre];
        if (ag.direccion) partes.push(ag.direccion);
        var geo = [ag.distrito, ag.provincia, ag.departamento].filter(Boolean).join(', ');
        if (geo) partes.push(geo);
        if (ag.referencia) partes.push('Ref: ' + ag.referencia);
        if (ag.telefono)   partes.push('📞 ' + ag.telefono);
        if (ag.horario)    partes.push('🕐 ' + ag.horario);
        selTxt.innerHTML = partes.map(function(p){ return '<div>' + esc(p) + '</div>'; }).join('');
        badge.style.display    = 'block';
        dropdown.style.display = 'none';
        dropdown.innerHTML     = '';
        input.value = ag.nombre + (ag.distrito ? ' — ' + ag.distrito : '');
      };

      function renderDropdown(agencias) {
        dropdown.innerHTML = '';
        if (!agencias.length) {
          dropdown.innerHTML = '<div style="padding:15px 16px;font-size:13px;color:#6b7280;text-align:center">' +
            'Sin resultados — intenta con otro término</div>';
          dropdown.style.display = 'block';
          return;
        }
        ShalomAPI._agCache = agencias;
        agencias.forEach(function (ag, i) {
          var el = document.createElement('div');
          el.className = 'shalom-ag-item';
          var geo = [ag.distrito, ag.provincia, ag.departamento].filter(Boolean).join(' · ');
          el.innerHTML = [
            '<div style="font-size:13px;font-weight:700;color:#f0f0f8">' + esc(ag.nombre) + '</div>',
            ag.direccion ? '<div style="font-size:11px;color:#6b7280;margin-top:2px">' + esc(ag.direccion) + '</div>' : '',
            geo ? '<div style="font-size:10px;color:#4f8ef7;margin-top:2px">' + esc(geo) + '</div>' : '',
            ag.horario ? '<div style="font-size:10px;color:#6b7280;margin-top:1px">🕐 ' + esc(ag.horario) + '</div>' : '',
          ].join('');
          el.addEventListener('click', function () { ShalomAPI._selAgencia(i); });
          dropdown.appendChild(el);
        });
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
        window._shalomAgencia = null;
        badge.style.display   = 'none';
        buscar(this.value);
      });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { dropdown.style.display = 'none'; dropdown.innerHTML = ''; }
      });
      document.addEventListener('click', function (e) {
        var wrap = document.getElementById('shalomSearchWrap');
        if (wrap && !wrap.contains(e.target)) dropdown.style.display = 'none';
      });

      console.log('[ShalomAPI] Buscador agencias listo | fuente: JSON local + fallback API');
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  };

  /* ══════════════════════════════════════════════════════════
     MÓDULO 2 — TRACKING EN PANEL (index.html)
  ══════════════════════════════════════════════════════════ */
  ShalomAPI.initTrackingPanel = function () {
    injectCSS('shalom-base-css', BASE_CSS);
    injectCSS('shalom-panel-css', [
      '#shalomOv{display:none;position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:800;align-items:flex-end;justify-content:center}',
      '#shalomOv.open{display:flex}',
      '#shalomSheet{background:#161b22;border-radius:16px 16px 0 0;padding:20px;width:100%;max-width:480px;border:1px solid #30363d;animation:shalomUp .22s ease;max-height:88vh;overflow-y:auto}',
      '@keyframes shalomUp{from{transform:translateY(100%)}to{transform:translateY(0)}}',
      '.sh-hist-row{display:flex;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05)}',
      '.sh-hist-row:last-child{border-bottom:none}',
      '.sh-hist-dot{width:8px;height:8px;border-radius:50%;background:#4f8ef7;flex-shrink:0;margin-top:5px}',
      '.shalom-guia-wrap{background:rgba(56,139,253,.06);border:1px solid rgba(56,139,253,.15);border-radius:8px;padding:8px 10px;margin-top:7px;display:flex;flex-direction:column;gap:5px}',
    ].join(''));

    if (!document.getElementById('shalomOv')) {
      var ov = document.createElement('div');
      ov.id = 'shalomOv';
      ov.innerHTML = '<div id="shalomSheet"><div id="shalomSheetContent"></div>' +
        '<button onclick="ShalomAPI.cerrarSheet()" style="width:100%;margin-top:14px;padding:12px;background:#1c2333;border:1px solid #30363d;border-radius:10px;color:#8b949e;font-size:13px;cursor:pointer;font-family:inherit">Cerrar</button></div>';
      ov.addEventListener('click', function(e){ if(e.target===ov) ShalomAPI.cerrarSheet(); });
      document.body.appendChild(ov);
    }

    ShalomAPI.cerrarSheet = function () {
      var ov = document.getElementById('shalomOv');
      if (ov) ov.classList.remove('open');
    };

    ShalomAPI.renderBadgeCard = function (s) {
      if (!s.shalomGuia) return '';
      var badgeHTML;
      if (!s.shalomEstado || s.shalomEstado === '') {
        badgeHTML = '<span class="shalom-chip sc-cargando" onclick="ShalomAPI.consultarEstado(\'' + esc(s.id) + '\')">' +
          '⟳ Consultar estado Shalom</span>';
      } else if (s.shalomEstado === 'error_conexion') {
        badgeHTML = '<span class="shalom-chip sc-error" onclick="ShalomAPI.consultarEstado(\'' + esc(s.id) + '\')">' +
          '⚠ Sin conexión — reintentar</span>';
      } else if (s.shalomEstado === 'no_encontrada') {
        badgeHTML = '<span class="shalom-chip sc-error" onclick="ShalomAPI.consultarEstado(\'' + esc(s.id) + '\')">' +
          '❌ Guía no encontrada</span>';
      } else {
        badgeHTML = '<span class="shalom-chip ' + estadoCSS(s.shalomEstado) + '" onclick="ShalomAPI.verDetalle(\'' + esc(s.id) + '\')">' +
          estadoIco(s.shalomEstado) + ' ' + esc(s.shalomEstado) +
          ' <span style="opacity:.55;font-size:9px;margin-left:2px">↗ detalle</span></span>';
      }
      return '<div class="shalom-guia-wrap">' +
        '<div style="font-size:10px;color:#8b949e">🚌 Guía Shalom: ' +
        '<b style="color:#e6edf3;font-family:monospace">' + esc(s.shalomGuia) + '</b>' +
        (s.shalomCodigo ? ' · Código: <b style="color:#e6edf3;font-family:monospace">' + esc(s.shalomCodigo) + '</b>' : '') +
        '</div>' + badgeHTML + '</div>';
    };

    ShalomAPI.consultarEstado = async function (shipId) {
      if (typeof window.S === 'undefined' || !window.S.shipments) return;
      var ship = window.S.shipments.find(function(x){ return x.id === shipId; });
      if (!ship || !ship.shalomGuia) return;
      ship.shalomEstado = 'cargando';
      if (typeof window.render === 'function') window.render();
      var result = await ShalomAPI.trackingGuia(ship.shalomGuia, ship.shalomCodigo);
      if (!result) {
        ship.shalomEstado = 'error_conexion';
      } else if (result.error) {
        ship.shalomEstado = result.error === 'no_encontrada' ? 'no_encontrada' : 'error_conexion';
      } else {
        ship.shalomEstado   = result.estado;
        ship.shalomTracking = result;
      }
      if (typeof window.save === 'function') window.save();
      if (typeof window.render === 'function') window.render();
    };

    ShalomAPI.verDetalle = async function (shipId) {
      var ov  = document.getElementById('shalomOv');
      var cnt = document.getElementById('shalomSheetContent');
      if (!ov || !cnt) return;
      var ship = window.S && window.S.shipments
        ? window.S.shipments.find(function(x){ return x.id === shipId; }) : null;
      cnt.innerHTML = _spinnerHTML('Consultando estado actual...');
      ov.classList.add('open');
      var result = ship && ship.shalomTracking
        ? ship.shalomTracking
        : ship ? await ShalomAPI.trackingGuia(ship.shalomGuia, ship.shalomCodigo) : null;
      _renderSheetTracking(cnt, result, ship ? ship.shalomGuia : '?');
    };

    function _spinnerHTML(msg) {
      return '<div style="text-align:center;padding:32px 16px">' +
        '<div style="width:32px;height:32px;border:2.5px solid #30363d;border-top-color:#4f8ef7;border-radius:50%;animation:shalomSpin .7s linear infinite;margin:0 auto 12px"></div>' +
        '<div style="font-size:13px;color:#8b949e">' + esc(msg) + '</div></div>';
    }

    function _renderSheetTracking(cnt, result, guia) {
      if (!result || result.error === 'conexion') {
        cnt.innerHTML = '<div style="text-align:center;padding:28px"><div style="font-size:36px;margin-bottom:10px">⚠️</div>' +
          '<div style="font-size:15px;font-weight:700;color:#f87171">Sin conexión</div>' +
          '<div style="font-size:12px;color:#8b949e;margin-top:6px">Verifica tu internet e intenta de nuevo.</div></div>';
        return;
      }
      if (result.error === 'no_encontrada') {
        cnt.innerHTML = '<div style="text-align:center;padding:28px"><div style="font-size:36px;margin-bottom:10px">❌</div>' +
          '<div style="font-size:15px;font-weight:700;color:#f87171">Guía no encontrada</div>' +
          '<div style="font-size:12px;color:#8b949e;margin-top:6px">Número: <b style="color:#e6edf3">' + esc(guia) + '</b></div></div>';
        return;
      }
      var cls = estadoCSS(result.estado);
      var ico = estadoIco(result.estado);
      var hist = result.historial || [];
      cnt.innerHTML = [
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">',
        '<div style="font-family:Syne,sans-serif;font-weight:800;font-size:17px">🚌 Estado Shalom</div>',
        '<div style="font-size:11px;color:#8b949e;background:#1c2333;border:1px solid #30363d;border-radius:6px;padding:3px 9px;font-family:monospace">' + esc(result.guia) + '</div>',
        '</div>',
        '<div class="shalom-chip ' + cls + '" style="font-size:14px;padding:11px 16px;border-radius:10px;width:100%;justify-content:center;cursor:default;margin-bottom:14px;box-sizing:border-box">',
        ico + ' ' + esc(result.estado), '</div>',
        '<div style="background:#1c2333;border:1px solid #30363d;border-radius:10px;overflow:hidden;margin-bottom:14px">',
        infoRow('📦','Guía',result.guia), infoRow('🔑','Código',result.codigo),
        infoRow('🏙','Origen',result.origen), infoRow('📍','Destino',result.destino),
        infoRow('👤','Remitente',result.remitente), infoRow('🙋','Destinatario',result.destinatario),
        infoRow('⚖','Peso',result.peso), infoRow('📅','Fecha envío',result.fecha_envio),
        infoRow('🎯','Fecha estimada',result.fecha_estimada),
        result.descripcion ? infoRow('📝','Detalle',result.descripcion) : '', '</div>',
        hist.length ? [
          '<div style="font-size:10px;font-weight:800;color:#8b949e;letter-spacing:.8px;margin-bottom:8px">HISTORIAL</div>',
          '<div style="background:#1c2333;border:1px solid #30363d;border-radius:10px;padding:4px 14px">',
          hist.map(function(h){
            return '<div class="sh-hist-row"><div class="sh-hist-dot"></div><div style="min-width:0">' +
              '<div style="font-size:12px;font-weight:700;color:#e6edf3">' + esc(h.estado) + '</div>' +
              (h.fecha ? '<div style="font-size:10px;color:#8b949e;margin-top:1px">' + esc(h.fecha) +
              (h.lugar ? ' · ' + esc(h.lugar) : '') + '</div>' : '') + '</div></div>';
          }).join(''), '</div>',
        ].join('') : '',
      ].join('');
    }

    ShalomAPI.patchFormPanel = function () {
      var fNotes = document.getElementById('fNotes');
      if (!fNotes || document.getElementById('fShalomGuia')) return;
      var wrap = document.createElement('div');
      wrap.innerHTML = [
        '<div style="background:rgba(56,139,253,.06);border:1px solid rgba(56,139,253,.15);border-radius:10px;padding:12px;margin-bottom:11px">',
        '<div style="font-size:10px;font-weight:700;color:#388bfd;letter-spacing:.8px;text-transform:uppercase;margin-bottom:10px">🚌 Guía Shalom (opcional)</div>',
        '<div class="frow">',
        '<div class="fg"><label class="fl">Número de guía</label>',
        '<input class="fi" id="fShalomGuia" placeholder="Ej: 66479331" style="font-family:monospace" inputmode="numeric"></div>',
        '<div class="fg"><label class="fl">Código</label>',
        '<input class="fi" id="fShalomCodigo" placeholder="3KTH" style="font-family:monospace;text-transform:uppercase" oninput="this.value=this.value.toUpperCase()" maxlength="6"></div>',
        '</div></div>',
      ].join('');
      fNotes.parentNode.insertBefore(wrap, fNotes.nextSibling);
    };

    console.log('[ShalomAPI] Módulo panel listo | tracking vía API en tiempo real');
  };

  /* ══════════════════════════════════════════════════════════
     MÓDULO 3 — TRACKING EN FORMULARIO (formulario.html)
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
        '<div style="font-size:10px;font-weight:800;color:#6b7280;letter-spacing:1px;margin-bottom:10px">🚌 RASTREAR GUÍA SHALOM</div>',
        '<div style="display:flex;gap:8px;margin-bottom:6px">',
        '<input id="shalomTrkNum" class="fi" placeholder="Número de guía (Ej: 66479331)"',
        ' style="flex:2;font-family:monospace;font-size:14px;font-weight:700" inputmode="numeric" maxlength="15">',
        '<input id="shalomTrkCode" class="fi" placeholder="Código"',
        ' style="flex:1;font-family:monospace;font-size:14px;font-weight:700;text-transform:uppercase"',
        ' oninput="this.value=this.value.toUpperCase()" maxlength="6"></div>',
        '<button onclick="ShalomAPI._buscarTrkFormulario()" style="width:100%;background:#4f8ef7;border:none;border-radius:12px;padding:13px;color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:Outfit,sans-serif;margin-bottom:8px">Rastrear envío Shalom</button>',
        '<div id="shalomTrkErr" style="font-size:12px;color:#f87171;padding:4px 2px;display:none">❌ Guía no encontrada. Verifica el número e intenta de nuevo.</div>',
        '<div id="shalomTrkResult" style="margin-top:10px"></div>',
      ].join('');
      trackSearch.appendChild(sec);

      ['shalomTrkNum','shalomTrkCode'].forEach(function(id){
        var el = document.getElementById(id);
        if (el) el.addEventListener('keydown', function(e){ if(e.key==='Enter') ShalomAPI._buscarTrkFormulario(); });
      });
      console.log('[ShalomAPI] Tracking formulario listo');
    }

    ShalomAPI._buscarTrkFormulario = async function () {
      var numEl  = document.getElementById('shalomTrkNum');
      var codeEl = document.getElementById('shalomTrkCode');
      var errEl  = document.getElementById('shalomTrkErr');
      var resEl  = document.getElementById('shalomTrkResult');
      if (!numEl || !resEl) return;
      var num = numEl.value.trim(), code = codeEl ? codeEl.value.trim() : '';
      if (!num) { numEl.focus(); return; }
      errEl.style.display = 'none';
      resEl.innerHTML = '<div style="text-align:center;padding:24px;color:#6b7280">' +
        '<div style="width:28px;height:28px;border:2px solid #1e1e30;border-top-color:#4f8ef7;' +
        'border-radius:50%;animation:shalomSpin .7s linear infinite;margin:0 auto 10px"></div>' +
        '<div style="font-size:12px">Consultando guía <b style="color:#f0f0f8">' + esc(num) + '</b>...</div></div>';

      var result = await ShalomAPI.trackingGuia(num, code);
      if (!result || result.error === 'no_encontrada') { resEl.innerHTML = ''; errEl.style.display = 'block'; return; }
      if (result.error === 'conexion') { resEl.innerHTML = '<div style="text-align:center;padding:16px;font-size:12px;color:#f87171">⚠️ Sin conexión — verifica tu internet</div>'; return; }

      var STEPS = ['Registrado','En proceso','En tránsito','En agencia','Entregado'];
      var eu = (result.estado||'').toUpperCase();
      var step = eu.includes('ENTREGADO')?4:eu.includes('AGENCIA')?3:eu.includes('TRANSITO')?2:eu.includes('PROCESO')?1:0;
      var clrMap = {'sc-nuevo':'#f59e0b','sc-transito':'#4f8ef7','sc-agencia':'#a78bfa','sc-entregado':'#22c55e','sc-error':'#f87171','sc-cargando':'#6b7280'};
      var clr = estadoCSS(result.estado);
      var color = clrMap[clr]||'#4f8ef7';
      var hist = result.historial||[];

      function fRow(lbl,val){ if(!val||val==='—')return''; return '<div style="display:flex;gap:8px;margin-bottom:6px"><div><div style="font-size:10px;font-weight:700;color:#6b7280">'+esc(lbl)+'</div><div style="font-size:13px;font-weight:600;color:#f0f0f8;margin-top:1px">'+esc(String(val))+'</div></div></div>'; }

      resEl.innerHTML = [
        '<div style="background:#0f0f1a;border:1.5px solid #1e1e30;border-radius:14px;overflow:hidden">',
        '<div style="padding:14px 16px;border-bottom:1px solid #1e1e30">',
        '<div style="font-size:10px;font-weight:800;color:#6b7280;letter-spacing:.8px;margin-bottom:8px">ESTADO</div>',
        '<div class="shalom-chip '+clr+'" style="font-size:14px;padding:11px 16px;border-radius:10px;width:100%;justify-content:center;cursor:default;box-sizing:border-box">',
        estadoIco(result.estado)+' '+esc(result.estado),'</div></div>',
        '<div style="padding:12px 16px;border-bottom:1px solid #1e1e30">',
        '<div style="display:flex;gap:4px;margin-bottom:5px">',
        STEPS.map(function(_,i){ return '<div style="flex:1;height:4px;border-radius:2px;background:'+(i<=step?color:'#1e1e30')+'"></div>'; }).join(''),
        '</div><div style="font-size:11px;color:#6b7280">Paso '+(step+1)+' de '+STEPS.length+': '+esc(result.estado)+'</div></div>',
        '<div style="padding:4px 0;border-bottom:1px solid #1e1e30">',
        fRow('Guía',result.guia),fRow('Código',result.codigo),fRow('Origen',result.origen),
        fRow('Destino',result.destino),fRow('Remitente',result.remitente),
        fRow('Destinatario',result.destinatario),fRow('Fecha envío',result.fecha_envio),
        fRow('Fecha estimada',result.fecha_estimada),'</div>',
        hist.length?['<div style="padding:12px 16px">',
          '<div style="font-size:10px;font-weight:800;color:#6b7280;letter-spacing:.8px;margin-bottom:8px">HISTORIAL</div>',
          hist.map(function(h){ return '<div style="display:flex;gap:8px;padding:7px 0;border-bottom:1px solid #1a1a2a">' +
            '<div style="width:6px;height:6px;border-radius:50%;background:#4f8ef7;flex-shrink:0;margin-top:5px"></div>' +
            '<div><div style="font-size:12px;font-weight:600;color:#f0f0f8">'+esc(h.estado)+'</div>' +
            (h.fecha?'<div style="font-size:10px;color:#6b7280;margin-top:1px">'+esc(h.fecha)+(h.lugar?' · '+esc(h.lugar):'')+' </div>':'')+
            '</div></div>'; }).join(''),'</div>'].join('') : '',
        '</div>',
        '<button onclick="ShalomAPI._resetTrkFormulario()" style="width:100%;background:transparent;border:none;color:#6b7280;font-size:12px;cursor:pointer;font-family:Outfit,sans-serif;padding:12px 0;margin-top:2px">← Buscar otra guía</button>',
      ].join('');
    };

    ShalomAPI._resetTrkFormulario = function () {
      var n=document.getElementById('shalomTrkNum'), c=document.getElementById('shalomTrkCode'),
          e=document.getElementById('shalomTrkErr'), r=document.getElementById('shalomTrkResult');
      if(n)n.value=''; if(c)c.value=''; if(e)e.style.display='none'; if(r)r.innerHTML='';
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else { setTimeout(init, 200); }
  };

  /* ══════════════════════════════════════════════════════════
     FIREBASE FUNCTIONS — copia esto a functions/index.js
  ══════════════════════════════════════════════════════════

  const functions = require('firebase-functions');
  const fetch     = require('node-fetch');
  const SHALOM_KEY = functions.config().shalom.key;
  // firebase functions:config:set shalom.key=""

  exports.shalom = functions.https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST')    { res.status(405).send('Method Not Allowed'); return; }
    const { endpoint, q, body } = req.body;
    const ALLOWED = ['/api/buscar','/api/agencia','/api/track'];
    if (!ALLOWED.includes(endpoint)) { res.status(400).send('Endpoint no permitido'); return; }
    try {
      const isPost = endpoint === '/api/track';
      const url = 'https://shalom-api.lat' + endpoint + (!isPost && q ? '?q=' + encodeURIComponent(q) : '');
      const r = await fetch(url, {
        method: isPost ? 'POST' : 'GET',
        headers: { 'x-api-key': SHALOM_KEY, 'Content-Type': 'application/json' },
        body: isPost ? JSON.stringify(body) : undefined,
      });
      res.json(await r.json());
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  ══════════════════════════════════════════════════════════ */

  global.ShalomAPI = ShalomAPI;

})(window);
