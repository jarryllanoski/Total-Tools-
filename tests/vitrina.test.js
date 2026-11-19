'use strict';
const vm = require('vm');
const E = require('./_entorno.js');
const V = require('../functions/vitrina.js');

const BUCKET = 'total-tools-24ce8.firebasestorage.app';
const img = (n, b) => 'https://firebasestorage.googleapis.com/v0/b/' + (b || BUCKET) + '/o/' + encodeURIComponent('recursos/promos/' + n) + '?alt=media&token=x';
const AHORA = Date.parse('2026-11-19T15:00:00Z');

module.exports = async ({bloque, ok}) => {
  bloque('Vitrina: el servidor solo deja pasar promos y sorteos limpios');
  {
    const doc = {activa: true, promos: [
      {img: img('p1.jpg'), titulo: 'Amoladora 42V', precio: '459', antes: '599'},
      {img: img('p2.jpg'), titulo: '<script>x</script>Taladro', precio: '399.5', antes: '100'},
      {img: img('p3.jpg'), titulo: 'Vencida', precio: '10', hasta: '2026-11-18'},
      {img: img('p4.jpg'), titulo: 'Hoy', precio: '10', hasta: '2026-11-19'},
      {img: img('p5.jpg'), titulo: 'Apagada', activa: false},
      {img: 'https://evil.example/x.jpg', titulo: 'Imagen ajena'},
      {img: img('p6.jpg', 'otro.appspot.com'), titulo: 'Otro bucket'},
      {img: 'https://firebasestorage.googleapis.com/v0/b/' + BUCKET + '/o/' + encodeURIComponent('shipments/id_1/guia.png'), titulo: 'Foto de un pedido'},
      {img: img('p7.jpg'), titulo: ''},
    ], sorteo: {activo: true, titulo: 'Sorteo de una amoladora', texto: 'Participa gratis', link: 'https://sorteos.example/total', hasta: '2026-11-30'}};
    const v = V.publica(doc, AHORA, BUCKET);
    ok(v.promos.map((p) => p.titulo).join('|') === 'Amoladora 42V|scriptx/scriptTaladro|Hoy', 'quedan las vigentes y válidas, en su orden');
    ok(v.promos[0].precio === 459 && v.promos[0].antes === 599, 'precio y precio anterior como números');
    ok(v.promos[1].antes === undefined && v.promos[1].precio === 399.5, 'un «antes» más barato que el precio no se muestra (no se inventa un descuento)');
    ok(!/[<>]/.test(JSON.stringify(v)), 'sin < ni > en ningún texto');
    ok(v.sorteo && v.sorteo.link === 'https://sorteos.example/total' && v.sorteo.hasta === '2026-11-30', 'sorteo con su link https y fecha');
    ok(V.publica(Object.assign({}, doc, {activa: false}), AHORA, BUCKET) === null, 'apagada en el panel: no se muestra nada');
    ok(V.publica({sorteo: {activo: true, titulo: 'X', link: 'javascript:alert(1)'}}, AHORA, BUCKET) === null, 'un sorteo con link que no es https: no');
    ok(V.publica({sorteo: {activo: true, titulo: 'X', link: 'https://ok.example', hasta: '2026-11-01'}}, AHORA, BUCKET) === null, 'un sorteo vencido: no');
    ok(V.publica({sorteo: {activo: false, titulo: 'X', link: 'https://ok.example'}}, AHORA, BUCKET) === null, 'un sorteo apagado: no');
    const ruta = (r) => 'https://firebasestorage.googleapis.com/v0/b/' + BUCKET + '/o/' + encodeURIComponent(r);
    ok(V.imagenPromo(ruta('recursos/portadas/x.jpg'), BUCKET) === '' && V.imagenPromo(ruta('recursos/promos/x.html'), BUCKET) === '' &&
       V.imagenPromo(ruta('recursos/promos/../x.jpg'), BUCKET) === '' && V.imagenPromo(ruta('recursos/promos/p1.jpg'), BUCKET) !== '',
       'solo imágenes de recursos/promos (ni otra carpeta, ni otro tipo, ni rutas con ..)');
    ok(V.publica(null, AHORA, BUCKET) === null && V.publica({}, AHORA, BUCKET) === null, 'sin nada guardado: nada');
    const muchas = {promos: Array.from({length: 10}, (_, i) => ({img: img('q' + i + '.jpg'), titulo: 'P' + i}))};
    ok(V.publica(muchas, AHORA, BUCKET).promos.length === V.MAX_PROMOS, 'como mucho ' + V.MAX_PROMOS + ' promos');
    ok(V.diaLima(Date.parse('2026-11-20T03:00:00Z')) === '2026-11-19', 'las fechas se cuentan en hora de Lima');
    ok(V.precio('abc') === 0 && V.precio(-5) === 0 && V.precio('12,5') === 12.5, 'precios raros o negativos no se muestran');
  }

  bloque('Vitrina: el seguimiento la trae en la misma consulta, con caché');
  {
    const src = E.leer('functions/index.js');
    ok(/const vit = await _vitrinaPublica\(\);\s*if \(vit\) out\.vitrina = vit;/.test(src), 'viene con el pedido: cero llamadas extra del cliente');
    ok(/const VITRINA_FRESCA_MS = 60000;/.test(src) && /ahora - _vitrina\.ts >= VITRINA_FRESCA_MS/.test(src),
       'el servidor la lee como mucho una vez por minuto, no una vez por cliente');
    ok(/catch \(e\) \{\s*_vitrina = \{doc: _vitrina\.doc, ts: ahora\};/.test(src), 'si Firestore falla, sigue con la última que tenía');
    ok(/match \/panel\/\{document=\*\*\} \{\s*allow read, write: if esAdmin\(\);/.test(E.leerReal('firestore.rules')), 'panel/vitrina solo la edita un administrador');
  }

  const sj = E.trozoCliente('var _segInstalar = null;', 'function _segNavHtml(){');
  const ctx = vm.createContext({
    esc: (x) => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
    encodeURIComponent, Number, String, Date, navigator: {userAgent: ''}, window: {matchMedia: () => ({matches: false}), navigator: {}},
  });
  vm.runInContext(sj + ';this.N=_nautiHtml;this.I=_instalarHtml;', ctx);

  bloque('Nauti en el seguimiento');
  {
    const vit = {promos: [{img: img('p1.jpg'), titulo: 'Amoladora "42V"', precio: 459, antes: 599}], sorteo: {titulo: 'Sorteo', texto: 'Gratis', link: 'https://sorteos.example/x', hasta: '2026-11-30'}};
    const h = ctx.N(vit, '933724178');
    ok(/Nauti · Cazador de ofertas/.test(h) && /jalé las promos de hoy y un sorteo para ti/.test(h), 'Nauti dice que jaló promos y sorteo');
    ok(/src="narrador\/load-nauti\.webp\?v=\d+"/.test(h), 'con su imagen');
    ok(/<s>S\/ 599<\/s> <b>S\/ 459<\/b>/.test(h), 'precio con el anterior tachado');
    ok(/href="https:\/\/wa\.me\/51933724178\?text=Hola%2C%20vi%20la%20promo/.test(h) && />Lo quiero</.test(h), '«Lo quiero» abre tu WhatsApp con la promo escrita');
    ok(/alt="Amoladora &quot;42V&quot;"/.test(h), 'los textos van escapados');
    ok(/href="https:\/\/sorteos\.example\/x" target="_blank" rel="noopener noreferrer"/.test(h) && /Participar →/.test(h) && /Hasta el /.test(h), 'sorteo con su botón y fecha');
    ok(ctx.N(null, '1') === '' && ctx.N({promos: [], sorteo: null}, '1') === '', 'sin vitrina, Nauti no aparece');
    ok(!/<article/.test(ctx.N({promos: [{img: 'https://evil.example/x.jpg', titulo: 'X'}], sorteo: {titulo: 'S', link: 'https://ok.example'}}, '1')), 'una imagen ajena no se pinta (segunda barrera)');
    ok(!/<a class="seg-sorteo"/.test(ctx.N({promos: [], sorteo: {titulo: 'S', link: 'javascript:1'}}, '1')), 'un link raro no se pinta');
    ok(/loading="lazy" decoding="async"/.test(h) && /width="160" height="160"/.test(h), 'imágenes diferidas y con tamaño (sin saltos)');
    const r = E.trozoCliente('function renderTrackResult(ship, code){', 'function init(){');
    ok(/\$\{_nautiHtml\(window\._segVitrina, bizPhone\)\}/.test(r), 'va en Inicio, antes del botón de WhatsApp');
    const css = E.leerReal('cliente/cliente.css');
    ok(/@keyframes segJala/.test(css) && /body\.seg:not\(\.seg-quieto\) \.seg-promo\{animation:segTira/.test(css), 'Nauti «jala» las promos al entrar (una vez)');
  }

  bloque('Guardar el seguimiento como app');
  {
    ok(/Guarda tu pedido en tu celular/.test(ctx.I()), 'se ofrece');
    ctx.window.matchMedia = () => ({matches: true});
    ok(ctx.I() === '', 'ya instalada: no se ofrece');
    const m = JSON.parse(E.leerReal('marca/seguimiento.webmanifest'));
    ok(m.start_url === '../seguimiento.html' && m.scope === '../seguimiento.html' && m.display === 'standalone', 'la app abre SOLO el seguimiento (no el panel)');
    ok(m.short_name === 'Mis pedidos' && m.icons.every((i) => /\?v=\d+$/.test(i.src)), 'con nombre propio e íconos versionados');
    ok(/<link rel="manifest" href="marca\/seguimiento\.webmanifest\?v=\d+">/.test(E.leerCrudo('seguimiento.html')), 'la página lo enlaza');
    const sjs = E.leerReal('cliente/seguimiento.js');
    ok(/if\(\/\^\[A-Za-z0-9_-\]\{2,64\}\$\/\.test\(segTok\)\)\{ try\{ localStorage\.setItem\(SEG_GUARDADO, segTok\); \}catch\(e\)\{\} \}/.test(sjs),
       'al abrir un link, el celular recuerda ese pedido (para abrir la app sin link)');
    ok(/e\.preventDefault\(\);\s*_segInstalar = e;/.test(sjs) && /_segInstalar\.prompt\(\);/.test(sjs), 'Android: botón de instalar nativo');
    ok(/En iPhone: toca <b>Compartir<\/b>/.test(sjs), 'iPhone: explica cómo agregarlo a inicio');
  }

  bloque('Panel: editar promos y sorteo');
  {
    const pv = E.leerReal('panel/config/vitrina.js');
    ok(/var MAX = 6;/.test(pv) && /StorageModule\.uploadFile\(chica, 'promos', id, 'recursos'\)/.test(pv), 'hasta 6 promos, la imagen va a recursos/promos');
    ok(/900 \/ Math\.max\(im\.naturalWidth, im\.naturalHeight\)/.test(pv) && /'image\/jpeg', 0\.82/.test(pv), 'la imagen se achica antes de subir (carga rápida para el cliente)');
    ok(/if\(s\.activo && !\/\^https:\\\/\\\/\\S\{4,\}\$\/i\.test\(s\.link \|\| ''\)\)/.test(pv), 'el sorteo exige un link https');
    ok(/escH\(p\.titulo \|\| ''\)/.test(pv) && /escU\(p\.img\)/.test(pv), 'lo que se pinta en el panel va escapado');
    ok(/<div class="cfg-sec" id="vitrinaBox"><\/div>/.test(E.leerCrudo('index.html')) && /if\(window\.Vitrina\) Vitrina\.abrir\(\);/.test(E.leerReal('panel/pantalla/navegacion.js')),
       'está en Configuración y se carga al abrirla');
  }
};
