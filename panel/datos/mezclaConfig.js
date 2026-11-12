"use strict";

(function (global) {
  var MezclaConfig = {};

  function txt(v) { return JSON.stringify(v === undefined ? null : v); }
  function copia(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }

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
      if (enBase[k] && !enSuya[k]) return;
      ya[k] = 1; out.push(x);
    });
    suya.forEach(function (x) {
      var k = txt(x);
      if (ya[k]) return;
      if (enBase[k]) return;
      ya[k] = 1; out.push(x);
    });
    return out;
  }

  function claveDe(x) {
    if (x && typeof x === 'object') {
      if (x.id != null && x.id !== '') return 'id:' + x.id;
      if (x.shipment && x.shipment.id != null) return 'sh:' + x.shipment.id + ':' + (x.deletedAt || '');
      if (x.u) return 'u:' + x.u;
    }
    return 'v:' + txt(x);
  }

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
        if (txt(x) === txt(b[k])) return;
      }
      ya[k] = 1;
      out.push(k in s && k in b && txt(x) === txt(b[k]) ? s[k] : x);
    });
    suya.forEach(function (x) {
      var k = claveDe(x);
      if (ya[k]) return;
      if (k in b && txt(x) === txt(b[k])) return;
      ya[k] = 1; out.push(x);
    });
    return out;
  }

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

  function valor(base, mia, suya) {
    return txt(mia) === txt(base) ? suya : mia;
  }

  var COMO = {
    labels: lista, couriers: lista, extraFields: lista,
    recursos: porId, trash: porId,
    msgTemplates: mapa, courierActive: mapa
  };
  MezclaConfig.COMO = COMO;

  MezclaConfig.mezclar = function (base, mia, suya) {
    base = base || {}; mia = mia || {}; suya = suya || {};
    var out = {};
    Object.keys(mia).forEach(function (k) {
      var f = COMO[k] || valor;
      out[k] = copia(f(base[k], mia[k], suya[k]));
    });
    return out;
  };

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
