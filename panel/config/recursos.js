(function (global) {
  'use strict';

  var Recursos = {};

  var CATEGORIAS = ['Manuales', 'Videos', 'Procesos', 'Catálogos', 'Garantía'];

  var MAX_URL = 2000;
  var MAX_TIT = 80;
  var MAX_NOTA = 120;
  var MAX_ITEMS = 300;
  var UMBRAL_BUSCADOR = 8;

  var TIPOS = [
    {re: /drive\.google\.com\/drive\/(u\/\d+\/)?folders\//i,
      icono: '📁', etiqueta: 'Carpeta de Drive'},
    {re: /drive\.google\.com\/file\//i, icono: '📄', etiqueta: 'Archivo de Drive'},
    {re: /docs\.google\.com\/spreadsheets/i, icono: '📊', etiqueta: 'Hoja de cálculo'},
    {re: /docs\.google\.com\/presentation/i, icono: '📽️', etiqueta: 'Presentación'},
    {re: /docs\.google\.com\/forms/i, icono: '📋', etiqueta: 'Formulario'},
    {re: /docs\.google\.com\/document/i, icono: '📝', etiqueta: 'Documento'},
    {re: /(^|\/\/|\.)(youtube\.com|youtu\.be)/i, icono: '🎬', etiqueta: 'Video'},
    {re: /\.pdf($|[?#])/i, icono: '📕', etiqueta: 'PDF'},
    {re: /\.(png|jpe?g|webp|gif)($|[?#])/i, icono: '🖼️', etiqueta: 'Imagen'},
    {re: /(wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com)/i,
      icono: '💬', etiqueta: 'WhatsApp'}
  ];

  function tipoDe(url) {
    var u = String(url == null ? '' : url);
    for (var i = 0; i < TIPOS.length; i++) {
      if (TIPOS[i].re.test(u)) {
        return {icono: TIPOS[i].icono, etiqueta: TIPOS[i].etiqueta};
      }
    }
    return {icono: '🔗', etiqueta: 'Enlace'};
  }

  function urlValida(u) {
    var s = String(u == null ? '' : u).trim();
    if (!s || s.length > MAX_URL) return false;
    if (/[\s<>"']/.test(s)) return false;
    if (/[\u0000-\u001f]/.test(s)) return false;
    return /^https:\/\/[^/?#\s]+\.[^/?#\s]+/i.test(s);
  }

  function normalizar(bruto) {
    if (!Array.isArray(bruto)) return [];
    var out = [];
    var vistos = {};
    for (var i = 0; i < bruto.length && out.length < MAX_ITEMS; i++) {
      var r = bruto[i];
      if (!r || typeof r !== 'object' || Array.isArray(r)) continue;
      var u = String(r.u == null ? '' : r.u).trim();
      if (!urlValida(u)) continue;
      var t = String(r.t == null ? '' : r.t).trim().slice(0, MAX_TIT);
      var c = CATEGORIAS.indexOf(r.c) >= 0 ? r.c : CATEGORIAS[0];
      var id = String(r.id == null ? '' : r.id).trim();
      if (!id || vistos[id]) id = 'r_' + i + '_' + u.length;
      vistos[id] = 1;
      out.push({
        id: id,
        t: t || u.slice(0, MAX_TIT),
        u: u,
        c: c,
        n: String(r.n == null ? '' : r.n).trim().slice(0, MAX_NOTA),
        img: urlValida(r.img) ? String(r.img).trim() : '',
        publico: r.publico === true
      });
    }
    return out;
  }

  function _plano(s) {
    return String(s == null ? '' : s).toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function filtrar(lista, cat, texto) {
    var q = _plano(texto).trim();
    return (lista || []).filter(function (r) {
      if (cat && cat !== 'Todos' && r.c !== cat) return false;
      if (!q) return true;
      return _plano(r.t).indexOf(q) >= 0 ||
             _plano(r.n).indexOf(q) >= 0 ||
             _plano(r.c).indexOf(q) >= 0;
    });
  }

  function categoriasConAlgo(lista) {
    return CATEGORIAS.filter(function (c) {
      return (lista || []).some(function (r) { return r.c === c; });
    });
  }

  function idYoutube(url) {
    var u = String(url == null ? '' : url);
    var m = u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,20})/i);
    return m ? m[1] : '';
  }

  function idDrive(url) {
    var u = String(url == null ? '' : url);
    if (/\/folders\//i.test(u) || /folderview/i.test(u)) return '';
    var m = u.match(/\/(?:file|document|spreadsheets|presentation)\/d\/([A-Za-z0-9_-]{10,})/i) ||
            u.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
    return m ? m[1] : '';
  }

  function portadaDe(r) {
    if (!r) return null;
    if (r.img) return r.img;
    var y = idYoutube(r.u);
    if (y) return 'https://img.youtube.com/vi/' + y + '/hqdefault.jpg';
    var d = idDrive(r.u);
    if (d) return 'https://drive.google.com/thumbnail?id=' + d + '&sz=w400';
    return null;
  }

  var ORDENES = ['categoria', 'az', 'nuevos'];

  function ordenar(lista, modo) {
    var l = (lista || []).slice();
    if (modo === 'az') {
      return l.sort(function (a, b) {
        return _plano(a.t).localeCompare(_plano(b.t));
      });
    }
    if (modo === 'nuevos') return l.reverse();
    return l.sort(function (a, b) {
      return CATEGORIAS.indexOf(a.c) - CATEGORIAS.indexOf(b.c);
    });
  }

  function agrupar(lista) {
    return CATEGORIAS.map(function (c) {
      return {cat: c, items: (lista || []).filter(function (r) { return r.c === c; })};
    }).filter(function (g) { return g.items.length > 0; });
  }

  function cuentas(lista) {
    var l = lista || [];
    var carpetas = 0;
    var videos = 0;
    l.forEach(function (r) {
      var e = tipoDe(r.u).etiqueta;
      if (e === 'Carpeta de Drive') carpetas++;
      else if (e === 'Video') videos++;
    });
    return {total: l.length, carpetas: carpetas, videos: videos,
      archivos: l.length - carpetas - videos};
  }

  function textoCompartir(sel) {
    return (sel || []).map(function (r) {
      return (r.t ? r.t + '\n' : '') + r.u;
    }).join('\n\n');
  }

  Recursos.idYoutube = idYoutube;
  Recursos.idDrive = idDrive;
  Recursos.portadaDe = portadaDe;
  Recursos.ordenar = ordenar;
  Recursos.ORDENES = ORDENES;
  Recursos.agrupar = agrupar;
  Recursos.cuentas = cuentas;
  Recursos.textoCompartir = textoCompartir;

  Recursos.CATEGORIAS = CATEGORIAS;
  Recursos.UMBRAL_BUSCADOR = UMBRAL_BUSCADOR;
  Recursos.tipoDe = tipoDe;
  Recursos.urlValida = urlValida;
  Recursos.normalizar = normalizar;
  Recursos.filtrar = filtrar;
  Recursos.categoriasConAlgo = categoriasConAlgo;

  global.Recursos = Recursos;
})(typeof window !== 'undefined' ? window : globalThis);
