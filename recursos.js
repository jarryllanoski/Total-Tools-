/**
 * recursos.js — Centro de recursos v1
 * ====================================
 * Los enlaces que el negocio necesita a mano: manuales de herramientas,
 * videos, procesos internos, catálogos y garantía. Viven en Drive; acá solo
 * se organizan y se abren.
 *
 * DÓNDE VIVEN LOS DATOS — y por qué NO en `config`
 * En `S.recursos`, una clave HERMANA de `config` dentro del mismo documento.
 * Nunca dentro de `config`: `handleConfig` (functions/index.js) devuelve el
 * objeto `config` ENTERO al formulario público, así que meterlos ahí sería
 * publicar los precios mayoristas y los comunicados internos a quien pidiera
 * esa URL. Es la misma razón por la que `msgTemplates` y `labels` están fuera.
 *
 * QUÉ CUESTA
 * Nada extra. `S.recursos` viaja en el documento de configuración que el panel
 * ya lee al arrancar, y se guarda con `save('config')`, que sube ESE documento
 * y no los 1165 pedidos. Cero lecturas nuevas, cero escrituras nuevas.
 *
 * `publico` queda preparado desde el día uno aunque hoy no se use: cuando el
 * cliente deba ver avisos y promociones en su link de seguimiento, será añadir
 * el interruptor y un endpoint que devuelva SOLO los marcados — sin migrar
 * nada ni tocar los recursos ya guardados.
 *
 * Lógica pura arriba, pantalla abajo. Lo de arriba se prueba sin navegador.
 */
(function (global) {
  'use strict';

  var Recursos = {};

  /* Cinco, y fijas. Con cinco los chips entran en la pantalla de un teléfono;
     con doce hay que deslizar y el filtro deja de usarse. Añadir una es una
     línea, y es algo que pasa una vez al año — un editor de categorías sería
     otro trozo que mantener para eso. */
  var CATEGORIAS = ['Manuales', 'Videos', 'Procesos', 'Catálogos', 'Garantía'];

  var MAX_URL = 2000;   // una URL de Drive ronda los 90
  var MAX_TIT = 80;
  var MAX_NOTA = 120;
  var MAX_ITEMS = 300;
  /* El buscador aparece solo a partir de aquí. Un buscador sobre cinco
     elementos es decoración que ocupa sitio en una pantalla de teléfono. */
  var UMBRAL_BUSCADOR = 8;

  /* El tipo se deduce del enlace: tú pegas, el panel decide el icono. Elegir
     un icono por recurso sería trabajo tuyo en cada alta, y trabajo que nadie
     hace acaba en una lista de 🔗 iguales. */
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

  /**
   * Qué es un enlace, mirando solo su dirección.
   * @param {string} url dirección
   * @return {{icono:string, etiqueta:string}} icono y nombre del tipo
   */
  function tipoDe(url) {
    var u = String(url == null ? '' : url);
    for (var i = 0; i < TIPOS.length; i++) {
      if (TIPOS[i].re.test(u)) {
        return {icono: TIPOS[i].icono, etiqueta: TIPOS[i].etiqueta};
      }
    }
    return {icono: '🔗', etiqueta: 'Enlace'};
  }

  /**
   * ¿Se puede poner esta dirección en un enlace?
   *
   * SOLO `https://`, y no es quisquillosería: `javascript:` dentro de un href
   * ejecuta código con los permisos de tu panel. `http://` se rechaza también
   * porque el panel se sirve por https y el navegador bloquearía el salto.
   * @param {*} u dirección
   * @return {boolean} true si se puede usar
   */
  function urlValida(u) {
    var s = String(u == null ? '' : u).trim();
    if (!s || s.length > MAX_URL) return false;
    if (/[\s<>"']/.test(s)) return false;       // nada de espacios ni comillas
    if (/[\u0000-\u001f]/.test(s)) return false; // ni caracteres de control
    // El punto obliga a un dominio de verdad y descarta el "https:/drive..."
    // de un pegado a medias.
    return /^https:\/\/[^/?#\s]+\.[^/?#\s]+/i.test(s);
  }

  /**
   * Deja la lista utilizable: descarta lo que no sirve, recorta lo largo y
   * pone valores por defecto. Lo que viene de la nube puede ser cualquier
   * cosa —lo escribió otro dispositivo, o una versión vieja del panel—, así
   * que nada se pinta sin pasar por aquí.
   * @param {*} bruto lo que haya en S.recursos
   * @return {Array<Object>} lista limpia
   */
  function normalizar(bruto) {
    if (!Array.isArray(bruto)) return [];
    var out = [];
    var vistos = {};
    for (var i = 0; i < bruto.length && out.length < MAX_ITEMS; i++) {
      var r = bruto[i];
      if (!r || typeof r !== 'object' || Array.isArray(r)) continue;
      var u = String(r.u == null ? '' : r.u).trim();
      // Un enlace inválido NO se muestra roto: no se muestra. Mostrarlo
      // apuntando a "#" daría un elemento que no hace nada y nadie sabría
      // por qué.
      if (!urlValida(u)) continue;
      var t = String(r.t == null ? '' : r.t).trim().slice(0, MAX_TIT);
      var c = CATEGORIAS.indexOf(r.c) >= 0 ? r.c : CATEGORIAS[0];
      var id = String(r.id == null ? '' : r.id).trim();
      if (!id || vistos[id]) id = 'r_' + i + '_' + u.length;
      vistos[id] = 1;
      out.push({
        id: id,
        t: t || u.slice(0, MAX_TIT), // sin título, la dirección: mejor que vacío
        u: u,
        c: c,
        n: String(r.n == null ? '' : r.n).trim().slice(0, MAX_NOTA),
        // La portada que TÚ pusiste —subida o pegada—. Pasa por la misma
        // criba que el enlace: una portada es otro sitio del que el navegador
        // va a cargar algo.
        img: urlValida(r.img) ? String(r.img).trim() : '',
        publico: r.publico === true
      });
    }
    return out;
  }

  /**
   * Sin tildes y en minúsculas, para que "garantia" encuentre "Garantía".
   * @param {*} s texto
   * @return {string} texto comparable
   */
  function _plano(s) {
    return String(s == null ? '' : s).toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  /**
   * Filtra por categoría y texto. El texto busca en título, nota y categoría
   * —se busca por objetivo ("garantía"), no por tipo de archivo—.
   * @param {Array<Object>} lista recursos ya normalizados
   * @param {string} cat categoría o 'Todos'
   * @param {string} texto búsqueda libre
   * @return {Array<Object>} los que pasan
   */
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

  /**
   * Solo las categorías que tienen algo dentro. Un chip que siempre abre una
   * lista vacía enseña a no usar los chips.
   * @param {Array<Object>} lista recursos ya normalizados
   * @return {Array<string>} categorías con al menos un recurso
   */
  function categoriasConAlgo(lista) {
    return CATEGORIAS.filter(function (c) {
      return (lista || []).some(function (r) { return r.c === c; });
    });
  }

  /* ── PORTADAS ──────────────────────────────────────────────────────────
     La portada NO se guarda cuando se puede deducir del enlace. Si Google
     cambia mañana su dirección de miniaturas, se toca UNA función; si
     estuviera guardada, habría que arreglar cuarenta registros con una URL
     muerta cada uno. */

  /**
   * El id de un video de YouTube, en cualquiera de sus cuatro formas.
   * @param {string} url dirección
   * @return {string} id, o '' si no es de YouTube
   */
  function idYoutube(url) {
    var u = String(url == null ? '' : url);
    var m = u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,20})/i);
    return m ? m[1] : '';
  }

  /**
   * El id de un ARCHIVO de Drive. Una carpeta no cuenta: no tiene miniatura,
   * y pedirla devolvería una imagen rota.
   * @param {string} url dirección
   * @return {string} id, o '' si no es un archivo de Drive
   */
  function idDrive(url) {
    var u = String(url == null ? '' : url);
    /* Una carpeta se descarta ANTES de buscar el id, y en sus DOS formas:
       la actual `/drive/folders/1of…` y la antigua `folderview?id=1of…`.
       La antigua es la que importa: trae un `id=`, así que sin esta línea
       caería en el patrón genérico de abajo y devolvería el id de la carpeta
       como si fuera de un archivo — miniatura rota en la tarjeta. */
    if (/\/folders\//i.test(u) || /folderview/i.test(u)) return '';
    var m = u.match(/\/(?:file|document|spreadsheets|presentation)\/d\/([A-Za-z0-9_-]{10,})/i) ||
            u.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
    return m ? m[1] : '';
  }

  /**
   * La portada de un recurso, o null si no hay ninguna.
   *
   * Orden: la que subiste o pegaste gana siempre —es una decisión tuya—, y
   * solo si no hay se deduce del enlace.
   *
   * ⚠️ La de YouTube es de fiar: lleva quince años igual y no pide permisos.
   * La de Drive NO está garantizada —exige que el archivo esté compartido, y
   * Google ha movido ese endpoint más de una vez—. Por eso lo que hace que
   * esto sea seguro no es la dirección, es el `onerror` de la pantalla: si no
   * carga, se ve el icono. Nunca una imagen rota.
   * @param {Object} r recurso ya normalizado
   * @return {?string} dirección de la portada
   */
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

  /**
   * Ordena una copia, nunca la lista original: ordenar en la pantalla no
   * puede cambiar el orden que se guarda.
   * @param {Array<Object>} lista recursos ya normalizados
   * @param {string} modo 'categoria' | 'az' | 'nuevos'
   * @return {Array<Object>} copia ordenada
   */
  function ordenar(lista, modo) {
    var l = (lista || []).slice();
    if (modo === 'az') {
      return l.sort(function (a, b) {
        return _plano(a.t).localeCompare(_plano(b.t));
      });
    }
    if (modo === 'nuevos') return l.reverse();
    // Por categoría, en el orden declarado de CATEGORIAS — no alfabético:
    // el sitio de cada grupo no puede cambiar al renombrar una categoría.
    return l.sort(function (a, b) {
      return CATEGORIAS.indexOf(a.c) - CATEGORIAS.indexOf(b.c);
    });
  }

  /**
   * Agrupa por categoría, en el orden declarado y sin grupos vacíos.
   * @param {Array<Object>} lista recursos ya normalizados
   * @return {Array<{cat:string, items:Array<Object>}>} grupos con contenido
   */
  function agrupar(lista) {
    return CATEGORIAS.map(function (c) {
      return {cat: c, items: (lista || []).filter(function (r) { return r.c === c; })};
    }).filter(function (g) { return g.items.length > 0; });
  }

  /**
   * Cuántos hay de cada tipo, para las tarjetas de arriba.
   * @param {Array<Object>} lista recursos ya normalizados
   * @return {{total:number, carpetas:number, videos:number, archivos:number}} cuentas
   */
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

  /**
   * Lo que se manda por WhatsApp con los marcados. Un enlace por línea con su
   * título: pegar seis URLs sueltas no le dice nada a quien las recibe.
   * @param {Array<Object>} sel recursos marcados
   * @return {string} texto listo para enviar
   */
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
