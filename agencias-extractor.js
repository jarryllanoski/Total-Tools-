/**
 * agencias-extractor.js — Extractor de agencias Shalom (sección Config)
 * =====================================================================
 * Agrega un bloque en Config (#page-configurar) que:
 *   1. Llama a la Cloud Function "shalomListar" (la API key va segura en el servidor).
 *   2. Trae TODAS las agencias desde GET /api/listar.
 *   3. Las convierte al formato que usa tu búsqueda local (nombre, distrito,
 *      provincia, departamento, direccion, telefono, horario...).
 *   4. Muestra cuántas agencias se extrajeron.
 *   5. Te deja descargar "agencias-shalom.json" para subir a la carpeta data/.
 *
 * Reglas respetadas:
 *   - Módulo independiente. Solo agregar <script src="agencias-extractor.js"></script>
 *   - SIN MutationObserver.
 *   - No toca ninguna otra funcionalidad.
 *
 * Requiere desplegar la función shalomListar (igual que shalomTicket).
 */
(function (global) {
  'use strict';

  var CFG = {
    // Cloud Function que esconde la API key (mismo patrón que el ticket)
    FUNCTION_URL: 'https://us-central1-total-tools-24ce8.cloudfunctions.net/shalomListar',
    OUT_FILE: 'agencias-shalom.json'
  };

  var _ultimoJSON = null;

  function _toast(m) { if (typeof global.toast === 'function') global.toast(m); }
  function _txt(s)   { return String(s == null ? '' : s).trim(); }

  function _setEstado(html, color) {
    var el = document.getElementById('agExtractorEstado');
    if (!el) return;
    el.style.display = 'block';
    el.style.color = color || '#8b949e';
    el.innerHTML = html;
  }

  /* Mapea agencia cruda de Shalom al formato que espera la búsqueda local.
     Acepta nombres crudos (lugar_over, zona, hora_atencion) o ya adaptados. */
  function _mapAgencia(raw) {
    return {
      ter_id:       _txt(raw.ter_id || raw.id),
      nombre:       _txt(raw.nombre || raw.lugar_over || raw.nombre_agencia),
      departamento: _txt(raw.departamento),
      provincia:    _txt(raw.provincia),
      distrito:     _txt(raw.distrito || raw.zona),
      direccion:    _txt(raw.direccion),
      referencia:   _txt(raw.referencia),
      telefono:     _txt(raw.telefono),
      horario:      _txt(raw.horario || raw.hora_atencion),
      horarioDom:   _txt(raw.horarioDom || raw.hora_domingo),
      latitud:      _txt(raw.latitud || raw.lat),
      longitud:     _txt(raw.longitud || raw.lng || raw.lon)
    };
  }

  var AgenciasExtractor = {};

  AgenciasExtractor.extraer = async function () {
    var btn = document.getElementById('agExtractorBtn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Extrayendo...'; }
    _setEstado('⏳ Consultando todas las agencias de Shalom...', '#8b949e');
    var dl = document.getElementById('agExtractorDl');
    if (dl) dl.style.display = 'none';
    _ultimoJSON = null;

    try {
      var r = await fetch(CFG.FUNCTION_URL);
      if (!r.ok) throw new Error('HTTP ' + r.status);

      var data = await r.json();
      if (data && data.error) throw new Error(data.error);

      var lista = data.agencias || data.resultados || data.data ||
                  (Array.isArray(data) ? data : []);
      if (!Array.isArray(lista)) lista = [];

      var agencias = lista.map(_mapAgencia).filter(function (a) { return a.nombre; });

      if (!agencias.length) {
        _setEstado('⚠️ La función respondió pero sin agencias. Revisa el endpoint /api/listar.', '#f59e0b');
        return;
      }

      _ultimoJSON = {
        meta: { total: agencias.length, generado: new Date().toISOString() },
        agencias: agencias
      };

      _setEstado(
        '✅ <b style="color:#22c55e">' + agencias.length + ' agencias</b> extraídas correctamente.<br>' +
        '<span style="font-size:11px;color:#8b949e">Descarga el archivo y súbelo a la carpeta <b>data/</b> de tu repo (reemplaza el actual).</span>',
        '#e6edf3'
      );
      if (dl) dl.style.display = 'block';
      _toast('✅ ' + agencias.length + ' agencias extraídas');

    } catch (e) {
      _setEstado('❌ No se pudo extraer: ' + (e.message || 'error') +
                 '<br><span style="font-size:11px;color:#8b949e">¿Ya desplegaste la función shalomListar?</span>', '#f87171');
      console.warn('[AgenciasExtractor]', e);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '📥 Extraer agencias'; }
    }
  };

  AgenciasExtractor.descargar = function () {
    if (!_ultimoJSON) { _toast('Primero extrae las agencias'); return; }
    var blob = new Blob([JSON.stringify(_ultimoJSON, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = CFG.OUT_FILE;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  };

  /* ── Inyectar el bloque en la sección Config ─────────────────────── */
  function _injectUI() {
    var page = document.getElementById('page-configurar');
    if (!page) return false;
    if (document.getElementById('agExtractorSec')) return true;

    var sec = document.createElement('div');
    sec.className = 'cfg-sec';
    sec.id = 'agExtractorSec';
    sec.innerHTML =
      '<div class="cfg-ttl">🏢 Agencias Shalom (offline)</div>' +
      '<div style="font-size:11px;color:#8b949e;line-height:1.5;margin-bottom:10px">' +
        'Extrae todas las agencias de Shalom para buscarlas sin gastar API en cada búsqueda. ' +
        'La key va segura en el servidor.</div>' +
      '<button id="agExtractorBtn" type="button" onclick="AgenciasExtractor.extraer()" ' +
        'style="width:100%;padding:11px;border-radius:9px;cursor:pointer;font-family:inherit;' +
        'font-size:13px;font-weight:700;background:rgba(163,113,247,.15);' +
        'border:1px solid rgba(163,113,247,.35);color:#a78bfa">📥 Extraer agencias</button>' +
      '<div id="agExtractorEstado" style="display:none;margin-top:10px;font-size:12px;line-height:1.5"></div>' +
      '<button id="agExtractorDl" type="button" onclick="AgenciasExtractor.descargar()" ' +
        'style="display:none;width:100%;margin-top:8px;padding:11px;border-radius:9px;cursor:pointer;' +
        'font-family:inherit;font-size:13px;font-weight:700;background:rgba(34,197,94,.15);' +
        'border:1px solid rgba(34,197,94,.35);color:#22c55e">💾 Descargar agencias-shalom.json</button>';

    page.appendChild(sec);
    return true;
  }

  AgenciasExtractor.init = function () {
    var intentos = 0;
    (function intenta() {
      if (_injectUI()) {
        console.log('[AgenciasExtractor] Listo — botón en Config');
        return;
      }
      if (intentos++ < 30) setTimeout(intenta, 200);
    })();
  };

  global.AgenciasExtractor = AgenciasExtractor;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', AgenciasExtractor.init);
  } else {
    AgenciasExtractor.init();
  }

})(window);
