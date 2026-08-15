/**
 * agencias-extractor.js — Extractor de agencias (sección Config)
 * =====================================================================
 * Agrega en Config (#page-configurar) un bloque POR CADA courier con
 * catálogo propio (hoy: Shalom y Olva, en ese orden). Cada bloque:
 *   1. Llama a su Cloud Function (la key/URL va segura en el servidor).
 *   2. Trae TODAS las agencias.
 *   3. Las convierte al MISMO formato que usa la búsqueda del formulario
 *      (nombre, distrito, provincia, departamento, direccion, telefono,
 *      horario...) — un solo esquema, sin importar el courier de origen.
 *   4. Muestra cuántas agencias se extrajeron.
 *   5. Te deja descargar el JSON para subir a la carpeta data/.
 *
 * Agregar un courier nuevo = un objeto más en COURIERS. Nada más.
 *
 * Reglas respetadas:
 *   - Módulo independiente. Solo agregar <script src="agencias-extractor.js"></script>
 *   - SIN MutationObserver.
 *   - No toca ninguna otra funcionalidad.
 */
(function (global) {
  'use strict';

  function _txt(s) { return String(s == null ? '' : s).trim(); }

  /* Saneo de calidad de datos — aplica a CUALQUIER courier (punto único, no
     por-mapper): si algún catálogo de origen trae basura, se corrige aquí una
     sola vez.
     - Coordenadas fuera del territorio peruano (lat/lon invertidos, typo del
       origen, etc.) → se tratan como "sin coordenadas" (igual que si vinieran
       vacías): nunca ofrecen una agencia como "cerca de mí" con una distancia
       falsa, pero la agencia sigue siendo buscable por texto.
     - Duplicados exactos (mismo nombre + mismas coordenadas) → se descartan,
       quedándose con el primero. */
  function _coordValidaPeru(lat, lon) {
    return isFinite(lat) && isFinite(lon) &&
      lat >= -19 && lat <= 1 && lon >= -82 && lon <= -68;
  }
  function _sanear(agencias) {
    var vistos = {};
    var out = [];
    agencias.forEach(function (a) {
      var lat = parseFloat(a.latitud), lon = parseFloat(a.longitud);
      if (!(lat === 0 && lon === 0) && !_coordValidaPeru(lat, lon)) {
        a = Object.assign({}, a, { latitud: '', longitud: '' });
      }
      var clave = a.nombre + '|' + a.latitud + '|' + a.longitud;
      if (vistos[clave]) return; // duplicado exacto: se descarta
      vistos[clave] = true;
      out.push(a);
    });
    return out;
  }

  /* Mapea agencia cruda de Shalom al esquema común.
     Acepta nombres crudos (lugar_over, zona, hora_atencion) o ya adaptados. */
  function _mapShalom(raw) {
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

  /* Mapea agencia cruda de Olva (department/province/district/lat/lng/horario
     por día) al MISMO esquema común que Shalom, para que la búsqueda del
     formulario funcione idéntico sin importar el courier. */
  var _DIAS_HORARIO = ['monday','tuesday','wednesday','thursday','friday'];
  function _mapOlva(raw) {
    var h = raw.horario;
    var horario = '';
    if (h && typeof h === 'object') {
      var lv = _DIAS_HORARIO.map(function (d) { return h[d]; })
        .find(function (d) { return d && d.open && d.close; });
      if (lv) horario = 'L-V ' + lv.open + '-' + lv.close;
      var sab = h.saturday;
      if (sab && sab.open && sab.close) horario += (horario ? ' · ' : '') + 'S ' + sab.open + '-' + sab.close;
    }
    var lat = parseFloat(raw.lat), lng = parseFloat(raw.lng);
    return {
      ter_id:       _txt(raw.id || raw.ID),
      nombre:       _txt(raw.nombres),
      departamento: _txt(raw.department),
      provincia:    _txt(raw.province),
      distrito:     _txt(raw.district),
      direccion:    _txt(raw.direccion),
      referencia:   '',
      telefono:     _txt(raw.telefono || raw.phone),
      horario:      horario,
      horarioDom:   '',
      latitud:      (isFinite(lat) && lat) ? String(lat) : '',
      longitud:     (isFinite(lng) && lng) ? String(lng) : ''
    };
  }

  /* Un objeto por courier con catálogo propio. Orden = orden en pantalla. */
  var COURIERS = [
    {
      key: 'shalom', label: 'Shalom',
      functionUrl: 'https://us-central1-total-tools-24ce8.cloudfunctions.net/shalomListar',
      outFile: 'agencias-shalom.json',
      mapper: _mapShalom
    },
    {
      key: 'olva', label: 'Olva',
      functionUrl: 'https://us-central1-total-tools-24ce8.cloudfunctions.net/olvaListar',
      outFile: 'agencias-olva.json',
      mapper: _mapOlva
    }
  ];

  var _ultimoJSON = {}; // por courier.key

  function _toast(m) { if (typeof global.toast === 'function') global.toast(m); }

  function _setEstado(key, html, color) {
    var el = document.getElementById('agExtractorEstado_' + key);
    if (!el) return;
    el.style.display = 'block';
    el.style.color = color || '#8b949e';
    el.innerHTML = html;
  }

  var AgenciasExtractor = {};

  AgenciasExtractor.extraer = async function (key) {
    var c = COURIERS.find(function (x) { return x.key === key; });
    if (!c) return;
    var btn = document.getElementById('agExtractorBtn_' + key);
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Extrayendo...'; }
    _setEstado(key, '⏳ Consultando todas las agencias de ' + c.label + '...', '#8b949e');
    var dl = document.getElementById('agExtractorDl_' + key);
    if (dl) dl.style.display = 'none';
    _ultimoJSON[key] = null;

    try {
      // Leer SIEMPRE el cuerpo: la función devuelve el motivo real del fallo
      // (corte por tiempo, respuesta upstream con su código, o red). Sin esto
      // solo se ve un "HTTP 500" sin causa.
      var r = await fetch(c.functionUrl);
      var data = null;
      try { data = await r.json(); } catch (e) { data = null; }
      if (!r.ok) {
        throw new Error((data && (data.motivo || data.error)) || ('HTTP ' + r.status));
      }
      if (data && data.error) throw new Error(data.motivo || data.error);

      var lista = data.agencias || data.resultados || data.data ||
                  (Array.isArray(data) ? data : []);
      if (!Array.isArray(lista)) lista = [];

      var agencias = _sanear(lista.map(c.mapper).filter(function (a) { return a.nombre; }));

      if (!agencias.length) {
        _setEstado(key, '⚠️ La función respondió pero sin agencias. Revisa el endpoint de origen.', '#f59e0b');
        return;
      }

      _ultimoJSON[key] = {
        meta: { total: agencias.length, generado: new Date().toISOString() },
        agencias: agencias
      };

      _setEstado(key,
        '✅ <b style="color:#22c55e">' + agencias.length + ' agencias</b> extraídas correctamente.<br>' +
        '<span style="font-size:11px;color:#8b949e">Descarga el archivo y súbelo a la carpeta <b>data/</b> de tu repo (reemplaza el actual).</span>',
        '#e6edf3'
      );
      if (dl) dl.style.display = 'block';
      _toast('✅ ' + agencias.length + ' agencias de ' + c.label + ' extraídas');

    } catch (e) {
      _setEstado(key, '❌ No se pudo extraer<br><span style="font-size:11.5px">' +
                 String(e.message || 'error') + '</span>' +
                 '<br><span style="font-size:11px;color:#8b949e">Si dice que tardó o respondió con error, es del lado de ' + c.label + ' — reintenta en unos minutos.</span>', '#f87171');
      console.warn('[AgenciasExtractor]', key, e);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '📥 Extraer agencias'; }
    }
  };

  AgenciasExtractor.descargar = function (key) {
    var c = COURIERS.find(function (x) { return x.key === key; });
    if (!c) return;
    if (!_ultimoJSON[key]) { _toast('Primero extrae las agencias'); return; }
    var blob = new Blob([JSON.stringify(_ultimoJSON[key], null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = c.outFile;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  };

  /* ── Inyectar un bloque por courier en la sección Config ──────────── */
  function _seccionHtml(c) {
    return (
      '<div class="cfg-ttl">🏢 Agencias ' + c.label + ' (offline)</div>' +
      '<div style="font-size:11px;color:#8b949e;line-height:1.5;margin-bottom:10px">' +
        'Extrae todas las agencias de ' + c.label + ' para buscarlas sin gastar API en cada búsqueda.</div>' +
      '<button id="agExtractorBtn_' + c.key + '" type="button" onclick="AgenciasExtractor.extraer(\'' + c.key + '\')" ' +
        'style="width:100%;padding:11px;border-radius:9px;cursor:pointer;font-family:inherit;' +
        'font-size:13px;font-weight:700;background:rgba(163,113,247,.15);' +
        'border:1px solid rgba(163,113,247,.35);color:#a78bfa">📥 Extraer agencias</button>' +
      '<div id="agExtractorEstado_' + c.key + '" style="display:none;margin-top:10px;font-size:12px;line-height:1.5"></div>' +
      '<button id="agExtractorDl_' + c.key + '" type="button" onclick="AgenciasExtractor.descargar(\'' + c.key + '\')" ' +
        'style="display:none;width:100%;margin-top:8px;padding:11px;border-radius:9px;cursor:pointer;' +
        'font-family:inherit;font-size:13px;font-weight:700;background:rgba(34,197,94,.15);' +
        'border:1px solid rgba(34,197,94,.35);color:#22c55e">💾 Descargar ' + c.outFile + '</button>'
    );
  }

  function _injectUI() {
    var page = document.getElementById('page-configurar');
    if (!page) return false;
    if (document.getElementById('agExtractorSec')) return true;

    COURIERS.forEach(function (c) {
      var sec = document.createElement('div');
      sec.className = 'cfg-sec';
      sec.id = c === COURIERS[0] ? 'agExtractorSec' : 'agExtractorSec_' + c.key;
      sec.innerHTML = _seccionHtml(c);
      page.appendChild(sec);
    });
    return true;
  }

  AgenciasExtractor.init = function () {
    var intentos = 0;
    (function intenta() {
      if (_injectUI()) {
        console.log('[AgenciasExtractor] Listo — botones en Config (' + COURIERS.map(function (c) { return c.label; }).join(', ') + ')');
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
