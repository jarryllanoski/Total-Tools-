/**
 * tests/recursos.test.js — el centro de recursos
 * ===============================================
 * Lo que se prueba aquí es lo que decide QUÉ se pinta y CON QUÉ enlace. Dos
 * cosas importan de verdad:
 *
 *   1. Que nunca llegue a un `href` algo que no sea `https://`. Un
 *      `javascript:` ahí ejecuta código con los permisos del panel.
 *   2. Que lo que venga de la nube —escrito por otro dispositivo o por una
 *      versión vieja— no pueda romper la pantalla ni pintarse a medias.
 */
'use strict';
const E = require('./_entorno.js');

module.exports = async ({bloque, ok}) => {
  const win = {};
  E.cargar('recursos.js', win);
  const R = win.Recursos;

  bloque('Un enlace solo entra si es https — lo demás no se discute');

  ok(R.urlValida('https://drive.google.com/drive/folders/1ofnXmi6oiSgT6'),
     'una carpeta de Drive entra');
  ok(!R.urlValida('javascript:alert(1)'),
     'un `javascript:` NO entra: dentro de un href ejecuta código con los ' +
     'permisos de tu panel. Es el agujero, no un detalle de estilo');
  ok(!R.urlValida('JaVaScRiPt:alert(1)'), 'ni disfrazado de mayúsculas');
  ok(!R.urlValida('data:text/html,<script>x</script>'), 'ni un `data:`');
  ok(!R.urlValida('http://drive.google.com/x'),
     'ni `http://`: el panel se sirve por https y el navegador bloquearía el ' +
     'salto — sería un enlace que no hace nada');
  ok(!R.urlValida('https:/drive.google.com/x'),
     'ni una barra de menos, que es un pegado a medias');
  ok(!R.urlValida('https://sinpunto/x'), 'ni un dominio sin punto');
  ok(!R.urlValida('https://a.com/ x'), 'ni con un espacio dentro');
  ok(!R.urlValida('https://a.com/"onload="x'),
     'ni con comillas: así no se puede escapar del atributo');
  ok(!R.urlValida(''), 'ni vacío');
  ok(!R.urlValida(null) && !R.urlValida(undefined) && !R.urlValida(123),
     'ni nada que no sea texto');
  ok(!R.urlValida('https://a.com/' + 'x'.repeat(3000)), 'ni una de 3000 letras');

  bloque('El icono sale del enlace: tú pegas, el panel decide');

  {
    const casos = [
      ['https://drive.google.com/drive/folders/1of', '📁', 'Carpeta de Drive'],
      ['https://drive.google.com/drive/u/1/folders/1of', '📁', 'Carpeta de Drive'],
      ['https://drive.google.com/file/d/1abc/view', '📄', 'Archivo de Drive'],
      ['https://docs.google.com/spreadsheets/d/1/edit', '📊', 'Hoja de cálculo'],
      ['https://docs.google.com/document/d/1/edit', '📝', 'Documento'],
      ['https://docs.google.com/presentation/d/1/edit', '📽️', 'Presentación'],
      ['https://docs.google.com/forms/d/1/view', '📋', 'Formulario'],
      ['https://www.youtube.com/watch?v=abc', '🎬', 'Video'],
      ['https://youtu.be/abc', '🎬', 'Video'],
      ['https://x.com/manual.pdf', '📕', 'PDF'],
      ['https://x.com/a.pdf?v=2', '📕', 'PDF'],
      ['https://x.com/catalogo.jpg', '🖼️', 'Imagen'],
      ['https://wa.me/51999', '💬', 'WhatsApp'],
      ['https://cualquier-cosa.pe/x', '🔗', 'Enlace']
    ];
    const malos = casos.filter((c) => {
      const t = R.tipoDe(c[0]);
      return t.icono !== c[1] || t.etiqueta !== c[2];
    });
    ok(malos.length === 0,
       'los 14 tipos se reconocen por su dirección' +
       (malos.length ? ' — fallan: ' + malos.map((m) => m[0]).join(', ') : ''));
    ok(R.tipoDe(null).icono === '🔗', 'y sin dirección no revienta');
    ok(R.tipoDe('https://noesyoutube.com.pe/x').etiqueta === 'Enlace',
       'un dominio que solo CONTIENE "youtube.com" no es un video: ' +
       '"noesyoutube.com.pe" es otra cosa');
  }

  bloque('Lo que viene de la nube no puede romper la pantalla');

  {
    const bruto = [
      {id: 'a', t: 'Manual taladro', u: 'https://drive.google.com/file/d/1/view', c: 'Manuales'},
      {t: 'Sin id', u: 'https://x.pe/a.pdf', c: 'Procesos'},
      {t: 'Enlace malo', u: 'javascript:alert(1)', c: 'Manuales'},
      {t: 'Sin enlace', c: 'Videos'},
      null, 'texto', 42, [],
      {t: 'Categoría inventada', u: 'https://x.pe/b', c: 'Fantasía'},
      {u: 'https://x.pe/sin-titulo'}
    ];
    const l = R.normalizar(bruto);
    ok(l.length === 4,
       'entran 4 de 10: se descartan el javascript:, el que no tiene enlace, ' +
       'y los cuatro que no son objetos');
    ok(!l.some((r) => r.u.indexOf('javascript') === 0),
       'y NINGUNO con javascript: llega a la lista. Esta es la línea que ' +
       'impide que un enlace guardado ejecute código al tocarlo');
    ok(l.every((r) => r.id), 'todos salen con id, aunque no lo trajeran');
    ok(new Set(l.map((r) => r.id)).size === l.length,
       'y sin ids repetidos: dos filas con el mismo id se pisarían al borrar');
    ok(l.find((r) => r.t === 'Categoría inventada').c === 'Manuales',
       'una categoría que no existe cae en la primera, no desaparece el recurso');
    ok(l.find((r) => r.u.indexOf('sin-titulo') > 0).t.indexOf('https') === 0,
       'sin título se muestra la dirección: mejor que una fila en blanco');
    ok(l.every((r) => r.publico === false),
       'y nada es público por defecto. `publico` ya existe para cuando el ' +
       'cliente vea avisos en su link, pero hasta entonces nada se escapa');
  }

  ok(R.normalizar(null).length === 0 && R.normalizar('x').length === 0 &&
     R.normalizar({}).length === 0,
     'sin lista, lista vacía: el centro de recursos no revienta el panel');

  {
    const muchos = [];
    for (let i = 0; i < 500; i++) muchos.push({t: 'r' + i, u: 'https://x.pe/' + i});
    ok(R.normalizar(muchos).length === 300,
       'hay tope de 300: una lista corrupta con 50 000 filas no congela el panel');
  }

  {
    const largo = R.normalizar([{t: 'T'.repeat(500), n: 'N'.repeat(500),
      u: 'https://x.pe/a'}])[0];
    ok(largo.t.length === 80 && largo.n.length === 120,
       'los textos larguísimos se recortan antes de pintarse, no con CSS');
  }

  bloque('Buscar por lo que quieres, no por dónde está guardado');

  {
    const l = R.normalizar([
      {t: 'Manual del taladro', u: 'https://x.pe/1', c: 'Manuales'},
      {t: 'Condiciones', n: 'garantía de 12 meses', u: 'https://x.pe/2', c: 'Garantía'},
      {t: 'Catálogo 2026', u: 'https://x.pe/3', c: 'Catálogos'}
    ]);
    ok(R.filtrar(l, 'Todos', '').length === 3, 'sin filtro salen todos');
    ok(R.filtrar(l, 'Manuales', '').length === 1, 'el chip filtra por categoría');
    ok(R.filtrar(l, 'Todos', 'taladro').length === 1, 'el texto busca en el título');
    ok(R.filtrar(l, 'Todos', 'garantia')[0].t === 'Condiciones',
       'y escribiendo "garantia" SIN TILDE encuentra el de "Garantía": nadie ' +
       'escribe tildes buscando en el teléfono');
    ok(R.filtrar(l, 'Todos', 'GARANTIA').length === 1, 'y sin importar mayúsculas');
    ok(R.filtrar(l, 'Todos', 'catalogo')[0].t === 'Catálogo 2026',
       'la tilde del TÍTULO tampoco estorba');
    ok(R.filtrar(l, 'Todos', '12 meses')[0].t === 'Condiciones',
       'y la nota también se busca: ahí está el dato que uno recuerda');
    ok(R.filtrar(l, 'Catálogos', 'taladro').length === 0,
       'los dos filtros se suman, no se pisan');
    ok(R.filtrar(null, 'Todos', '').length === 0, 'y sin lista no revienta');
  }

  bloque('Un chip que siempre sale vacío enseña a no usar los chips');

  {
    const l = R.normalizar([
      {t: 'a', u: 'https://x.pe/1', c: 'Manuales'},
      {t: 'b', u: 'https://x.pe/2', c: 'Manuales'},
      {t: 'c', u: 'https://x.pe/3', c: 'Garantía'}
    ]);
    const cats = R.categoriasConAlgo(l);
    ok(cats.length === 2 && cats.indexOf('Manuales') >= 0 &&
       cats.indexOf('Garantía') >= 0,
       'solo se dibujan las categorías que tienen algo dentro');
    ok(cats.indexOf('Videos') < 0, 'las vacías no aparecen');
    ok(R.categoriasConAlgo([]).length === 0, 'sin recursos, ningún chip');
    ok(cats[0] === 'Manuales',
       'y en el orden declarado, no en el de llegada: el sitio de cada chip ' +
       'no puede cambiar según lo último que añadiste');
  }

  ok(R.UMBRAL_BUSCADOR === 8,
     'el buscador aparece a partir de 8 recursos: sobre cinco es decoración ' +
     'que ocupa sitio en la pantalla de un teléfono');
  ok(R.CATEGORIAS.length === 5,
     'cinco categorías: con más, los chips no entran en un teléfono');

  bloque('Los recursos NO viven dentro de `config`');

  {
    /* `handleConfig` devuelve el objeto `config` ENTERO al formulario
       público. Guardar ahí los recursos publicaría los precios mayoristas y
       los comunicados internos a quien pidiera esa URL. */
    const fidx = E.leer('functions/index.js');
    const pub = fidx.slice(fidx.indexOf('async function handleConfig'),
        fidx.indexOf('// ── action=formcfg'));
    ok(/config: d\.config \|\| \{\}/.test(pub),
       'la función pública sigue devolviendo `config` entero — por eso los ' +
       'recursos no pueden estar ahí dentro');
    ok(pub.indexOf('recursos') < 0,
       'y NO devuelve los recursos: son internos hasta que exista el ' +
       'interruptor "visible para el cliente"');

    const idx = E.leer('index.html');
    const sube = idx.slice(idx.indexOf("clave: 'config', path: cfgPath()"),
        idx.indexOf('for(const s of(data.shipments||[]))'));
    ok(/recursos:\s*data\.recursos/.test(sube),
       'el panel los guarda como clave HERMANA de config, en el mismo ' +
       'documento — ni una lectura ni una escritura nuevas');
    ok(!/config:\s*\{[^}]*recursos/.test(sube),
       'y nunca metidos dentro de `config`');
  }

  bloque('La portada se deduce del enlace: en la mayoría no subes nada');

  {
    const p = (u, img) => R.portadaDe(R.normalizar([{t:'x', u:u, img:img}])[0]);

    ok(p('https://youtu.be/dQw4w9WgXcQ') === 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
       'un video de YouTube trae su miniatura solo');
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtube.com/watch?list=PL1&v=dQw4w9WgXcQ',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ'].forEach((u) => {
      ok(p(u).indexOf('dQw4w9WgXcQ') > 0, 'y en sus otras formas: ' + u.slice(8, 40));
    });
    ok(p('https://drive.google.com/file/d/1AbC_defGHIj/view').indexOf('thumbnail?id=1AbC_defGHIj') > 0,
       'un ARCHIVO de Drive también');
    ok(p('https://drive.google.com/drive/folders/1AbC_defGHIj') === null,
       'una CARPETA de Drive no: no existe miniatura de carpeta, y pedirla ' +
       'devolvería una imagen rota');
    ok(p('https://cualquier.pe/x') === null, 'y de lo demás, ninguna');

    ok(p('https://youtu.be/dQw4w9WgXcQ', 'https://mi.pe/portada.jpg') === 'https://mi.pe/portada.jpg',
       'la que TÚ pones gana siempre: es una decisión tuya, no una deducción');
    ok(p('https://youtu.be/dQw4w9WgXcQ', 'javascript:alert(1)').indexOf('img.youtube') > 0,
       'pero una portada con `javascript:` se descarta en `normalizar` y se ' +
       'cae a la deducida — una portada es otra dirección de la que el ' +
       'navegador va a cargar algo');
    ok(R.portadaDe(null) === null, 'y sin recurso no revienta');

    ok(R.idYoutube('https://noesyoutube.com.pe/watch?v=abc123') === '',
       'un dominio que solo CONTIENE youtube.com no cuenta');
    ok(R.idDrive('https://drive.google.com/drive/folders/1AbC_defGHIj') === '',
       'y una carpeta no da id de archivo');
    /* La forma ANTIGUA de una carpeta trae un `id=`, así que sin la guarda
       caería en el patrón genérico y devolvería el id de la CARPETA como si
       fuera de un archivo — miniatura rota. Lo descubrió una mutación que
       sobrevivió: la guarda anterior miraba solo `/folders/`. */
    ok(R.idDrive('https://drive.google.com/folderview?id=1AbC_defGHIj') === '',
       'ni en su forma antigua `folderview?id=`, que SÍ trae un id y se ' +
       'colaría por el patrón genérico');
    ok(R.idDrive('https://drive.google.com/drive/u/1/folders/1AbC_defGHIj') === '',
       'ni con el número de cuenta en medio');
    ok(R.idDrive('https://drive.google.com/open?id=1AbC_defGHIj') === '1AbC_defGHIj',
       'pero `open?id=` de un ARCHIVO sí: esa es la forma vieja de un archivo');
  }

  bloque('Ordenar no puede cambiar lo que está guardado');

  {
    const l = R.normalizar([
      {t: 'Zeta', u: 'https://x.pe/1', c: 'Videos'},
      {t: 'Álvaro', u: 'https://x.pe/2', c: 'Garantía'},
      {t: 'Manual', u: 'https://x.pe/3', c: 'Manuales'}
    ]);
    const antes = l.map(r => r.t).join(',');
    const az = R.ordenar(l, 'az');
    ok(l.map(r => r.t).join(',') === antes,
       'ordenar devuelve una COPIA: la lista guardada no se toca, así que ' +
       'mirar de otra forma no reescribe tu configuración');
    ok(az[0].t === 'Álvaro',
       'A–Z ordena sin que la tilde mande a la Á al final');
    ok(R.ordenar(l, 'categoria')[0].c === 'Manuales',
       'por categoría sigue el orden declarado, no el alfabético: el sitio de ' +
       'cada grupo no puede cambiar al renombrar una categoría');
    ok(R.ordenar(l, 'nuevos')[0].t === 'Manual', 'y "más nuevos" invierte');
    ok(R.ordenar(null, 'az').length === 0, 'sin lista no revienta');
  }

  bloque('Los grupos y las cuentas de arriba');

  {
    const l = R.normalizar([
      {t: 'a', u: 'https://drive.google.com/drive/folders/1AbC_defGHIj', c: 'Manuales'},
      {t: 'b', u: 'https://youtu.be/dQw4w9WgXcQ', c: 'Videos'},
      {t: 'c', u: 'https://x.pe/c.pdf', c: 'Catálogos'},
      {t: 'd', u: 'https://x.pe/d.pdf', c: 'Catálogos'}
    ]);
    const g = R.agrupar(l);
    ok(g.length === 3, 'un grupo por categoría con algo dentro, ni uno vacío');
    ok(g[0].cat === 'Manuales' && g[2].cat === 'Catálogos',
       'y en el orden declarado');
    ok(g[2].items.length === 2, 'con sus elementos');

    const c = R.cuentas(l);
    ok(c.total === 4 && c.carpetas === 1 && c.videos === 1 && c.archivos === 2,
       'las cuatro tarjetas de arriba cuentan por TIPO — otro eje que los ' +
       'chips, que cuentan por categoría');
    ok(c.carpetas + c.videos + c.archivos === c.total,
       'y los tres suman el total: ningún recurso se queda sin contar');
  }

  bloque('Lo que se manda por WhatsApp');

  {
    const l = R.normalizar([
      {t: 'Catálogo 2026', u: 'https://x.pe/1'},
      {t: '', u: 'https://x.pe/2'}
    ]);
    const txt = R.textoCompartir(l);
    ok(txt.indexOf('Catálogo 2026') === 0 && txt.indexOf('https://x.pe/1') > 0,
       'cada enlace va con su título: seis URLs sueltas no le dicen nada a ' +
       'quien las recibe');
    ok(txt.indexOf('https://x.pe/1') >= 0 && txt.indexOf('https://x.pe/2') >= 0,
       'y van los dos marcados, no solo el primero');
    ok(txt.indexOf('\n\n') > 0,
       'separados por una línea en blanco: pegados serían un muro ilegible en ' +
       'el chat');
    ok(R.textoCompartir([]) === '' && R.textoCompartir(null) === '',
       'sin nada marcado, texto vacío — el botón ya avisa antes de llegar aquí');
  }

  bloque('La pantalla no deshace lo que la lógica protege');

  {
    /* De nada sirve validar el enlace si después se pinta sin escapar. Y son
       DOS sitios: la fila y la tarjeta del mosaico. Si uno se escapa y el
       otro no, el agujero está igual de abierto. */
    const html = E.leer('index.html');
    const fila = html.slice(html.indexOf('function _recFila(r){'),
        html.indexOf('function _recMosaicoCard(r){'));
    const mosaico = html.slice(html.indexOf('function _recMosaicoCard(r){'),
        html.indexOf('/* ── Marcar ──'));

    [['la fila', fila], ['la tarjeta del mosaico', mosaico]].forEach(([nombre, t]) => {
      ok(/href="'\+escH\(r\.u\)\+'"/.test(t),
         'en ' + nombre + ' el enlace se escapa: validar y luego inyectar en ' +
         'crudo sería no haber validado');
      ok(/rel="noopener noreferrer"/.test(t),
         'y se abre con rel="noopener": sin eso la pestaña nueva puede cambiar ' +
         'la dirección de la tuya');
      ok(t.indexOf('escU(') < 0, 'y sin `escU`, que acepta http://');
    });

    ok(/<img src="'\+escH\(p\)\+'"/.test(mosaico),
       'la portada también se escapa: es otra dirección que viene de fuera');
    ok(/onerror="'\+_REC_ONERR\+'"/.test(mosaico),
       'y lleva `onerror`: la miniatura de Drive NO está garantizada, así que ' +
       'lo que impide ver una imagen rota no es la URL, es esta caída al icono');
    ok(/loading="lazy"/.test(mosaico),
       'y `loading="lazy"`: en el mosaico, 40 portadas en datos móviles se ' +
       'bajan solo cuando se ven');

    const prev = html.slice(html.indexOf('function recPrevia()'),
        html.indexOf('async function recSubirPortada'));
    ok(/onerror="'\+_REC_ONERR\+'"/.test(prev),
       'la vista previa del editor cae igual: ahí es donde descubres que esa ' +
       'portada no va a cargar, antes de guardarla');

    ok(/if\(!Recursos\.urlValida\(url\)\)/.test(html) &&
       /if\(img && !Recursos\.urlValida\(img\)\)/.test(html),
       'el enlace Y la portada se validan al GUARDAR, no al pintar: nada malo ' +
       'llega a la nube');
  }

  {
    // Guardar recursos NO puede costar lo que cuesta guardar los pedidos.
    const html = E.leer('index.html');
    const conComentarios = html.slice(html.indexOf('/* ══ CENTRO DE RECURSOS'),
        html.indexOf('async function _pintarPuertaShalom'));
    /* Sin comentarios: se cuentan LLAMADAS, no prosa. Una explicación que
       menciona `save('config')` no es un guardado, y contarla haría que la
       prueba pasara o fallara según cómo esté redactado un comentario. */
    const bloqueRec = conComentarios
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
    ok((bloqueRec.match(/save\('config'\)/g) || []).length === 2,
       'guardar y quitar usan `save(\'config\')`: sube UN documento, no los ' +
       '1169 pedidos');
    ok(!/save\(\)/.test(bloqueRec),
       'y ninguno llama a `save()` sin argumento, que enciende _dirtyAll y ' +
       'sube la base entera por editar una nota');

    /* La selección de recursos NO puede ser la de pedidos: compartirla haría
       que marcar un catálogo marcara un envío, y que el 🗑️ de Envíos borrara
       lo que marcaste aquí. */
    ok(bloqueRec.indexOf('Seleccion') < 0,
       'el centro de recursos no toca `seleccion.js` ni de lejos: esa es la ' +
       'selección de PEDIDOS');
    ok(/let _recSel = new Set\(\)/.test(bloqueRec),
       'tiene la suya, en memoria, que se olvida al recargar');

    // La subida reusa lo que ya existe y funciona, en su propia carpeta.
    ok(/StorageModule\.uploadFile\(f, 'portadas', id, 'recursos'\)/.test(bloqueRec),
       'la portada se sube con el `storage.js` de siempre, pero a la carpeta ' +
       '`recursos/` — no mezclada con los documentos de los envíos');
    const reglas = E.leer('storage.rules');
    ok(/match \/recursos\/\{grupo\}\/\{fileName\}/.test(reglas),
       'y esa carpeta tiene su regla: lo que no está declarado se deniega, y ' +
       'la subida fallaría con un 403 que parece un problema de sesión');
  }

  {
    // El editor sale de Config: ya no se administra desde ahí.
    const html = E.leer('index.html');
    ok(html.indexOf('recCfgLista') < 0 && html.indexOf('recNuevaUrl') < 0,
       'no queda nada del editor viejo en Config');
    ok(E.leer('config.js').indexOf('_recCfgPintar') < 0,
       'ni la llamada que lo pintaba');
    ok(/id="page-recursos"/.test(html), 'es una página propia');
    ok(/if\(id==='recursos'\) recRender\(\);/.test(html),
       'y `goPage` la pinta al entrar');
    ok(!/\['envios','compartir','configurar','recursos'\]/.test(html),
       'sin cuarta pestaña: cuatro no entran en un teléfono de 360 px sin ' +
       'dejar "Config" en "Confi…"');
  }
};
