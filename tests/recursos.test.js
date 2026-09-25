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

  bloque('La pantalla no deshace lo que la lógica protege');

  {
    /* De nada sirve validar el enlace si después se pinta sin escapar. Estas
       dos líneas son las que convierten la validación en seguridad real. */
    const html = E.leer('index.html');
    const pinta = html.slice(html.indexOf('cont.innerHTML = vis.map'),
        html.indexOf('/* ── El editor, en Config'));
    ok(/href="'\+escH\(r\.u\)\+'"/.test(pinta),
       'el enlace se escapa al pintarlo: validar y luego inyectar en crudo ' +
       'sería no haber validado');
    ok(/rel="noopener noreferrer"/.test(pinta),
       'y se abre con rel="noopener": sin eso, la pestaña que se abre puede ' +
       'cambiar la dirección de la tuya');
    ok(pinta.indexOf('escU(') < 0,
       'y NO se usa `escU`, que acepta http:// — aquí solo vale https');

    const ed = html.slice(html.indexOf('function _recCfgPintar'),
        html.indexOf('function recAgregar'));
    ok(ed.indexOf('href=') < 0,
       'el editor no pinta enlaces clicables: una fila con un enlace a medio ' +
       'escribir no tiene por qué poder abrirse');

    ok(/if\(!Recursos\.urlValida\(url\)\)/.test(html),
       'y al agregar se valida ANTES de guardar, no al pintar: un enlace malo ' +
       'no llega ni a la nube');
  }

  {
    // Guardar los recursos NO puede costar lo que cuesta guardar los pedidos.
    const html = E.leer('index.html');
    const bloqueRec = html.slice(html.indexOf('function recAgregar'),
        html.indexOf('async function _pintarPuertaShalom'));
    const guardados = (bloqueRec.match(/save\('config'\)/g) || []).length;
    ok(guardados === 3,
       'agregar, borrar y mover usan `save(\'config\')`: sube UN documento, ' +
       'no los 1165 pedidos');
    ok(!/save\(\)/.test(bloqueRec),
       'y ninguno llama a `save()` sin argumento, que enciende _dirtyAll y ' +
       'sube la base entera por cambiar el orden de un enlace');
  }
};
