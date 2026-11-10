/**
 * panel/datos/mezclaConfig.js — mezclar la configuración entre equipos
 * Fase 7 (11/11/2026): movido de la raíz a su capa, sin cambiar una línea.
 */
"use strict";

/**
 * mezclaConfig.js — DOS EQUIPOS, NINGÚN CAMBIO PERDIDO (06/11/2026)
 * =========================================================================
 * Etiquetas, recursos, mensajes, couriers… viven en UN documento de la nube
 * (`panel/config`). Antes cada guardado lo reescribía ENTERO desde la memoria
 * del equipo que guardaba: si el teléfono tenía la lista de hace un rato,
 * subía esa lista y la etiqueta que acababas de crear en la PC desaparecía.
 *
 * Ahora cada equipo recuerda la BASE —lo último que vio en la nube— y al
 * guardar compara tres cosas:
 *   base  → lo que había cuando este equipo leyó la nube
 *   mia   → lo que hay ahora en este equipo
 *   suya  → lo que hay ahora en la nube (lo que dejaron los otros)
 * Lo que TÚ cambiaste respecto a la base gana; lo que no tocaste se queda
 * como lo dejaron los otros. En listas se mezcla elemento por elemento: tu
 * etiqueta nueva y la del otro equipo quedan las dos; lo que alguien borró
 * queda borrado.
 *
 * Lógica PURA: ni red ni DOM. La usan index.html (`_fbSave`, `_mergeRemote`)
 * y las pruebas.
 */
(function (global) {
  var MezclaConfig = {};

  function txt(v) { return JSON.stringify(v === undefined ? null : v); }
  function copia(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }

  /* Listas de textos (etiquetas, couriers, campos extra). Se respeta TU orden
     (lo arrastraste tú) y lo nuevo de los otros va al final. */
  function lista(base, mia, suya) {
    base = Array.isArray(base) ? base : [];
    mia = Array.isArray(mia) ? mia : [];
    suya = Array.isArray(suya) ? suya : [];
    var enBase = {}, enSuya = {}, out = [], ya = {};
    base.forEach(function (x) { enBase[txt(x)] = 1; });
    suya.forEach(function (x) { enSuya[txt(x)] = 1; });
    mia.forEach(function (x) {
      var k = txt(x);
      if (ya[k]) return;
      // Estaba en la base y la nube ya no lo tiene: otro equipo lo borró.
      if (enBase[k] && !enSuya[k]) return;
      ya[k] = 1; out.push(x);
    });
    suya.forEach(function (x) {
      var k = txt(x);
      if (ya[k]) return;
      // Estaba en la base y aquí ya no: lo borraste tú.
      if (enBase[k]) return;
      ya[k] = 1; out.push(x);
    });
    return out;
  }

  /* La identidad de un elemento de lista de objetos: los recursos tienen `id`;
     la papelera guarda `{shipment, deletedAt}`. Sin nada de eso, su contenido. */
  function claveDe(x) {
    if (x && typeof x === 'object') {
      if (x.id != null && x.id !== '') return 'id:' + x.id;
      if (x.shipment && x.shipment.id != null) return 'sh:' + x.shipment.id + ':' + (x.deletedAt || '');
      if (x.u) return 'u:' + x.u;
    }
    return 'v:' + txt(x);
  }

  /* Listas de objetos (recursos, papelera). Igual que `lista`, y además: si
     los dos tienen el mismo elemento y tú NO lo editaste, vale la versión de
     la nube (quizá el otro sí lo editó). */
  function porId(base, mia, suya) {
    base = Array.isArray(base) ? base : [];
    mia = Array.isArray(mia) ? mia : [];
    suya = Array.isArray(suya) ? suya : [];
    var b = {}, s = {}, out = [], ya = {};
    base.forEach(function (x) { b[claveDe(x)] = x; });
    suya.forEach(function (x) { s[claveDe(x)] = x; });
    mia.forEach(function (x) {
      var k = claveDe(x);
      if (ya[k]) return;
      if (k in b && !(k in s)) {
        // Otro equipo lo quitó. Si tú lo editaste mientras tanto, se queda.
        if (txt(x) === txt(b[k])) return;
      }
      ya[k] = 1;
      out.push(k in s && k in b && txt(x) === txt(b[k]) ? s[k] : x);
    });
    suya.forEach(function (x) {
      var k = claveDe(x);
      if (ya[k]) return;
      if (k in b && txt(x) === txt(b[k])) return; // lo quitaste tú y nadie lo editó
      ya[k] = 1; out.push(x);
    });
    return out;
  }

  /* Objetos por clave (mensajes por etiqueta, couriers activos). */
  function mapa(base, mia, suya) {
    base = base && typeof base === 'object' && !Array.isArray(base) ? base : {};
    mia = mia && typeof mia === 'object' && !Array.isArray(mia) ? mia : {};
    suya = suya && typeof suya === 'object' && !Array.isArray(suya) ? suya : {};
    var out = {}, claves = {};
    [base, mia, suya].forEach(function (o) { Object.keys(o).forEach(function (k) { claves[k] = 1; }); });
    Object.keys(claves).forEach(function (k) {
      var v = txt(mia[k]) === txt(base[k]) ? suya[k] : mia[k];
      if (v !== undefined) out[k] = v;
    });
    return out;
  }

  /* Valores sueltos (PIN, agencia de origen, datos del negocio…). */
  function valor(base, mia, suya) {
    return txt(mia) === txt(base) ? suya : mia;
  }

  var COMO = {
    labels: lista, couriers: lista, extraFields: lista,
    recursos: porId, trash: porId,
    msgTemplates: mapa, courierActive: mapa
  };
  MezclaConfig.COMO = COMO;

  /**
   * @param {Object} base lo último que este equipo vio en la nube
   * @param {Object} mia  lo de este equipo ahora
   * @param {Object} suya lo de la nube ahora
   * @return {Object} la mezcla, con las mismas claves que `mia`
   */
  MezclaConfig.mezclar = function (base, mia, suya) {
    base = base || {}; mia = mia || {}; suya = suya || {};
    var out = {};
    Object.keys(mia).forEach(function (k) {
      var f = COMO[k] || valor;
      out[k] = copia(f(base[k], mia[k], suya[k]));
    });
    return out;
  };

  /** Las claves en que dos proyecciones no coinciden. */
  MezclaConfig.distintas = function (a, b) {
    a = a || {}; b = b || {};
    return Object.keys(a).filter(function (k) { return txt(a[k]) !== txt(b[k]); });
  };

  MezclaConfig.copia = copia;
  MezclaConfig.lista = lista;
  MezclaConfig.porId = porId;
  MezclaConfig.mapa = mapa;

  if (typeof module !== 'undefined' && module.exports) module.exports = MezclaConfig;
  else global.MezclaConfig = MezclaConfig;
})(typeof window !== 'undefined' ? window : this);
