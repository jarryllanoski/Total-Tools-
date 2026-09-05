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
       quedándose con el primero.
     - Sedes a las que un cliente NO puede ir → se descartan (ver _esUsable). */
  function _coordValidaPeru(lat, lon) {
    return isFinite(lat) && isFinite(lon) &&
      lat >= -19 && lat <= 1 && lon >= -82 && lon <= -68;
  }

  /* ¿Puede un cliente presentarse en esta sede a recoger su paquete?
     El catálogo alimenta un buscador donde el cliente ELIGE dónde recoger, así
     que una entrada que no sirva para eso no es un dato incompleto: es una
     trampa. Aparece entre los resultados, se puede tocar, y el pedido termina
     con un punto de recojo al que nadie puede llegar.
     Dos reglas, ambas indiscutibles:
       - Sin dirección → no hay a dónde ir.
       - Nombre de prueba → no es una sede real (Shalom deja terminales de
         prueba en su catálogo; una salía en los resultados de un distrito).
     Deliberadamente NO se filtran almacenes ni centros de distribución que sí
     traen dirección: algunos atienden público y no nos consta cuáles. Ante la
     duda, se conserva: perder una sede real es peor que mostrar una de más. */
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
      // Cualquier coordenada que no caiga dentro de Perú se vacía, y el (0,0)
      // entra en esa regla. Antes estaba exceptuado, lo que contradecía el
      // comentario de arriba y dejaba pasar 5 agencias de la API de Shalom con
      // 0,0 — un punto en el Atlántico frente a África. Vacío es honesto:
      // "no sabemos dónde está". Un 0,0 parece un dato bueno y no lo es.
      if (!_coordValidaPeru(lat, lon)) {
        a = Object.assign({}, a, { latitud: '', longitud: '' });
      }
      if (!_esUsable(a)) { descartadas.push(a); return; }
      var clave = a.nombre + '|' + a.latitud + '|' + a.longitud;
      if (vistos[clave]) return; // duplicado exacto: se descarta
      vistos[clave] = true;
      out.push(a);
    });
    // Se devuelve también lo descartado: filtrar en silencio es cómodo hasta
    // el día que descarta algo que sí servía y nadie se entera.
    out.descartadas = descartadas;
    return out;
  }

  /* Primer valor no vacío entre varios nombres posibles. La documentación de
     la API no describe las respuestas, así que en vez de fijar un nombre y
     rezar, se aceptan los que ya conocemos del catálogo guardado y sus
     variantes razonables. Lo que no aparezca queda vacío, y `_sanear` decide
     si la agencia sirve igual. */
  function _primero(raw, nombres) {
    for (var i = 0; i < nombres.length; i++) {
      var v = raw[nombres[i]];
      if (v !== undefined && v !== null && String(v).trim() !== '') return _txt(v);
    }
    return '';
  }

  /* Mapea agencia cruda de Shalom al esquema común (el mismo que ya usa el
     buscador del formulario, así no hay que tocarlo). */
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

  /* Mapea agencia cruda de Olva (department/province/district/lat/lng/horario
     por día) al MISMO esquema común que Shalom, para que la búsqueda del
     formulario funcione idéntico sin importar el courier. */
  /* Gemelo en el servidor: functions/olvaNormalizar.js, que aplica el MISMO
     mapeo al respaldo en vivo (agenciasOlva). Si Olva cambia sus campos, se
     tocan los dos. */
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

  /* Un objeto por courier con catálogo propio. Orden = orden en pantalla.

     Cada courier declara CÓMO se traen sus datos, porque no todos se piden
     igual:
       · functionUrl → una URL abierta que se consulta directo (Olva).
       · traer()     → una función propia, para cuando hace falta sesión.
     Shalom pasa por la puerta única (shalom.js), que adjunta el token del
     panel; su Cloud Function exige ser administrador, así que un fetch pelado
     recibiría un 401. Un courier nuevo se agrega con una entrada más, sin
     tocar el resto del extractor. */
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
        return global.Shalom.agencias();
      },
      outFile: 'agencias-shalom.json',
      jsonActual: './data/agencias-shalom.json', // para comparar antes de reemplazar
      mapper: _mapShalom
    }
  ];

  var _ultimoJSON = {}; // por courier.key

  /* Encuentra la lista dentro de la respuesta, venga como venga envuelta.
     Cada courier la envuelve distinto y ninguno lo documenta, así que se
     buscan los nombres habituales en la raíz y un nivel más adentro. */
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

  /* Compara lo recién extraído con el catálogo que ya está en uso.
     Si el nuevo trae MENOS, lo dice con todas las letras: reemplazar a ciegas
     dejaría sin agencias a clientes que hoy sí pueden elegirlas. No bloquea la
     descarga —a veces el courier cierra sedes de verdad— pero obliga a mirar. */
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
      return { html: '' }; // no poder comparar no debe impedir extraer
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
        // Courier con puerta propia (Shalom): la función adjunta la sesión.
        var res = await c.traer();
        if (!res || res.ok === false || res.error) {
          throw new Error(res && (res.motivo || res.error) || 'sin respuesta');
        }
        data = res.data !== undefined ? res.data : res;
      } else {
        // Leer SIEMPRE el cuerpo: la función devuelve el motivo real del fallo
        // (corte por tiempo, respuesta upstream con su código, o red). Sin esto
        // solo se ve un "HTTP 500" sin causa.
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

      // COMPARAR CON LO QUE YA TIENES antes de dejar reemplazar. Descargar un
      // catálogo más chico y pisar el bueno deja al cliente sin poder elegir
      // agencias que antes sí aparecían — y te enterarías por un reclamo, no
      // por un error. Por eso el aviso es explícito y dice cuántas faltan.
      var aviso = await _compararConActual(c, agencias.length);

      // Lo descartado se dice, no se calla: si algún día el filtro se lleva
      // algo que servía, tiene que verse acá y no descubrirse por un reclamo.
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
