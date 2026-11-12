(function (global) {
  'use strict';

  function _txt(s) { return String(s == null ? '' : s).trim(); }

  function _coordValidaPeru(lat, lon) {
    return isFinite(lat) && isFinite(lon) &&
      lat >= -19 && lat <= 1 && lon >= -82 && lon <= -68;
  }

  var RE_NO_REAL = /\b(prueba|test)\b/i;
  function _esUsable(a) {
    if (!_txt(a.direccion)) return false;
    if (RE_NO_REAL.test(_txt(a.nombre))) return false;
    return true;
  }

  function _sanear(agencias) {
    var vistos = {};
    var out = [];
    var descartadas = [];
    agencias.forEach(function (a) {
      var lat = parseFloat(a.latitud), lon = parseFloat(a.longitud);
      if (!_coordValidaPeru(lat, lon)) {
        a = Object.assign({}, a, { latitud: '', longitud: '' });
      }
      if (!_esUsable(a)) { descartadas.push(a); return; }
      var clave = a.nombre + '|' + a.latitud + '|' + a.longitud;
      if (vistos[clave]) return;
      vistos[clave] = true;
      out.push(a);
    });
    out.descartadas = descartadas;
    return out;
  }

  function _primero(raw, nombres) {
    for (var i = 0; i < nombres.length; i++) {
      var v = raw[nombres[i]];
      if (v !== undefined && v !== null && String(v).trim() !== '') return _txt(v);
    }
    return '';
  }

  function _mapShalom(raw) {
    if (!raw || typeof raw !== 'object') return {};
    return {
      ter_id:       _primero(raw, ['ter_id', 'id', 'terminal_id', 'terminalId']),
      nombre:       _primero(raw, ['nombre', 'name', 'lugar_over', 'nombre_agencia', 'terminal']),
      departamento: _primero(raw, ['departamento', 'department', 'dpto']),
      provincia:    _primero(raw, ['provincia', 'province']),
      distrito:     _primero(raw, ['distrito', 'district', 'zona']),
      direccion:    _primero(raw, ['direccion', 'address', 'dir']),
      referencia:   _primero(raw, ['referencia', 'reference', 'ref']),
      telefono:     _primero(raw, ['telefono', 'phone', 'celular']),
      horario:      _primero(raw, ['horario', 'hora_atencion', 'schedule']),
      horarioDom:   _primero(raw, ['horarioDom', 'hora_domingo', 'horario_domingo']),
      latitud:      _primero(raw, ['latitud', 'lat', 'latitude']),
      longitud:     _primero(raw, ['longitud', 'lng', 'lon', 'longitude'])
    };
  }

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

  var COURIERS = [
    {
      key: 'olva', label: 'Olva',
      functionUrl: 'https://us-central1-total-tools-24ce8.cloudfunctions.net/olvaListar',
      outFile: 'agencias-olva.json',
      mapper: _mapOlva
    },
    {
      key: 'shalom', label: 'Shalom',
      traer: function () {
        if (!global.Shalom || typeof global.Shalom.agencias !== 'function') {
          return Promise.resolve({error: true, motivo: 'La puerta de Shalom no está cargada'});
        }
        return global.Shalom.agencias().then(function (r) {
          if (r && r.ok === false && r.motivo === 'DESCONECTADO') {
            return {error: true, motivo:
              'Extraer agencias de Shalom está en reconstrucción. ' +
              'El catálogo que ya tienes sigue funcionando en el formulario.'};
          }
          return r;
        });
      },
      outFile: 'agencias-shalom.json',
      jsonActual: './data/agencias-shalom.json',
      mapper: _mapShalom
    }
  ];

  var _ultimoJSON = {};

  function _listaDe(data) {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== 'object') return null;
    var claves = ['agencias', 'agencies', 'data', 'resultados', 'results',
                  'items', 'terminales'];
    for (var i = 0; i < claves.length; i++) {
      var v = data[claves[i]];
      if (Array.isArray(v)) return v;
      if (v && typeof v === 'object') {
        for (var j = 0; j < claves.length; j++) {
          if (Array.isArray(v[claves[j]])) return v[claves[j]];
        }
      }
    }
    return null;
  }

  async function _compararConActual(c, nuevas) {
    if (!c.jsonActual) return { html: '' };
    try {
      var r = await fetch(c.jsonActual, { cache: 'no-store' });
      if (!r.ok) return { html: '' };
      var actual = await r.json();
      var lista = _listaDe(actual);
      var antes = Array.isArray(lista) ? lista.length : 0;
      if (!antes) return { html: '' };

      if (nuevas < antes) {
        return { html:
          '<br><b style="color:#f59e0b">⚠️ El catálogo actual tiene ' + antes +
          ' — faltarían ' + (antes - nuevas) + '.</b>' +
          '<br><span style="font-size:11px;color:#8b949e">Revisa antes de reemplazar: puede que la API omita rutas aéreas o esté paginando.</span>' };
      }
      if (nuevas > antes) {
        return { html: '<br><span style="color:#22c55e">Son ' + (nuevas - antes) +
                 ' más que las ' + antes + ' actuales.</span>' };
      }
      return { html: '<br><span style="color:#8b949e">Mismo total que el catálogo actual (' + antes + ').</span>' };
    } catch (e) {
      return { html: '' };
    }
  }

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
      var data;
      if (typeof c.traer === 'function') {
        var res = await c.traer();
        if (!res || res.ok === false || res.error) {
          throw new Error(res && (res.motivo || res.error) || 'sin respuesta');
        }
        data = res.data !== undefined ? res.data : res;
      } else {
        var r = await fetch(c.functionUrl);
        data = null;
        try { data = await r.json(); } catch (e) { data = null; }
        if (!r.ok) {
          throw new Error((data && (data.motivo || data.error)) || ('HTTP ' + r.status));
        }
        if (data && data.error) throw new Error(data.motivo || data.error);
      }

      var lista = _listaDe(data);
      if (!Array.isArray(lista)) lista = [];

      var agencias = _sanear(lista.map(c.mapper).filter(function (a) { return a.nombre; }));

      if (!agencias.length) {
        _setEstado(key, '⚠️ Respondió pero sin agencias reconocibles. Puede que cambiaran los nombres de los campos.', '#f59e0b');
        return;
      }

      _ultimoJSON[key] = {
        meta: { total: agencias.length, generado: new Date().toISOString() },
        agencias: agencias
      };

      var aviso = await _compararConActual(c, agencias.length);

      var desc = agencias.descartadas || [];
      var descHtml = desc.length
        ? '<br><span style="font-size:11px;color:#8b949e">Se descartaron <b>' + desc.length +
          '</b> sin dirección o de prueba: ' +
          desc.slice(0, 3).map(function (a) {
            return String(a.nombre || '?').split('/').pop().trim();
          }).join(', ') + (desc.length > 3 ? '…' : '') + '</span>'
        : '';

      _setEstado(key,
        '✅ <b style="color:#22c55e">' + agencias.length + ' agencias</b> extraídas.' + aviso.html + descHtml + '<br>' +
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

  if (document.readyState !== 'complete') {
    document.addEventListener('DOMContentLoaded', AgenciasExtractor.init);
  } else {
    AgenciasExtractor.init();
  }

})(window);
