/**
 * tests/elegir-sede.test.js — el paso «Elige tu sede» del formulario
 * ==================================================================
 * Mapa con pines rojos, «Usar mi ubicación», «Ver todos» / «Mi posición».
 * Tocar un pin rojo marca la sede y la sube arriba de la lista; el cliente
 * pulsa Continuar (no se avanza solo). Aquí se prueba:
 *   1. la lógica PURA de la lista (AgLista), ejecutada de verdad;
 *   2. que la ubicación nunca se pida sin que el cliente toque algo;
 *   3. que, si algo falla (sin mapa, sin GPS), elegir sigue funcionando;
 *   4. el fallo «Iniciando fábrica…» al abrir el formulario sin link.
 */
'use strict';
const E = require('./_entorno.js');
const vm = require('vm');

module.exports = async ({bloque, ok}) => {
  const form = E.leer('formulario.html');

  /* El código que se despliega, no una copia: se corta del formulario. */
  const hav = form.slice(form.indexOf('function _haversineKm('), form.indexOf('\n}\n', form.indexOf('function _haversineKm(')) + 3);
  const i0 = form.indexOf('var AgLista = {');
  const lst = form.slice(i0, form.indexOf('\n};\n', i0) + 4);
  const ctx = vm.createContext({});
  vm.runInContext(hav + lst + ';this.AgLista=AgLista;', ctx);
  const A = ctx.AgLista;

  bloque('AgLista: una sola verdad para la lista');

  {
    ok(A.clave({ter_id: 77, nombre: 'x'}) === 'id:77', 'Shalom se identifica por ter_id');
    ok(A.clave({nombre: 'TIENDA X', direccion: 'JR 1'}) === 'n:TIENDA X|JR 1', 'Olva (sin ter_id) por nombre + dirección');
    ok(A.clave(null) === '', 'nada → clave vacía, sin reventar');
    ok(A.coords({latitud: '-12.05', longitud: '-77.04'})[0] === -12.05, 'coordenadas en texto se leen');
    ok(A.coords({latitud: '40.4', longitud: '-3.7'}) === null, 'fuera de Perú = dato malo, no se pinta');
    ok(A.coords({latitud: '', longitud: 'x'}) === null, 'sin coordenadas → null');
    ok(A.titulo({nombre: 'LIMA / LIMA / CARABAYLLO / AV JOSE SACO ROJAS'}, 'Shalom') === 'Shalom Carabayllo (Av Jose Saco Rojas)',
       'título legible para Shalom');
    ok(A.titulo({nombre: 'TIENDA CHACHAPOYAS - JR AMAZONAS'}) === 'Tienda Chachapoyas - Jr Amazonas', 'Olva en minúsculas bonitas');
    ok(A.km(0.6) === '600 m' && A.km(3.456) === '3.5 km' && A.km(null) === '', 'distancia legible');
    const todas = [
      {ter_id: 1, latitud: -12.0, longitud: -77.0},
      {ter_id: 2, latitud: -12.5, longitud: -77.0},
      {ter_id: 3, latitud: -12.1, longitud: -77.0},
      {ter_id: 4, latitud: '', longitud: ''},
    ];
    const c = A.cercanas(todas, -12.0, -77.0, 2);
    ok(c.length === 2 && c[0].ter_id === 1 && c[1].ter_id === 3, 'las N más cercanas, en orden');
    ok(!todas[0]._distKm, 'no ensucia los datos originales (copia)');
    ok(A.cercanas(todas, -12, -77, 20).every((x) => x.ter_id !== 4), 'una sede sin coordenadas no se dice «cerca»');
    const l = A.conElegida(c, {ter_id: 3});
    ok(l[0].ter_id === 3 && l.length === 2, '⚠️ la elegida va PRIMERA, sin duplicarse');
    ok(A.conElegida(c, {ter_id: 9})[0].ter_id === 9 && A.conElegida(c, {ter_id: 9}).length === 3,
       'si no estaba en la lista, se añade arriba');
    ok(A.conElegida(c, null).length === 2, 'sin elegida, la lista igual');
  }

  bloque('Psicología: nunca pedir la ubicación sin que el cliente toque algo');

  {
    const ini = form.slice(form.indexOf('function agIniciar(key)'), form.indexOf('function agIniciarAlVer'));
    ok(/st\.state==='granted'\) agUbicarme\(key, \{silencioso:true\}\)/.test(ini),
       'solo se ubica solo si el permiso YA estaba dado');
    ok((ini.match(/agUbicarme\(/g) || []).length === 1, 'y en ningún otro caso al llegar al paso');
    ok(/\.catch\(function\(\)\{\}\)/.test(ini), 'si la API de permisos falla, no pasa nada (sigue el mapa)');
    ok(/onclick="agUbicarme\('/.test(form), 'el botón «Usar mi ubicación» es quien pide el permiso');
    const geo = form.slice(form.indexOf('function _obtenerUbicacion('), form.indexOf('function _gpsCopiarLink'));
    ok(/opc && opc\.rapida[\s\S]{0,260}enableHighAccuracy:false, timeout:8000, maximumAge:300000/.test(geo),
       'para la sede basta UNA petición rápida (wifi/antena, 8 s, vale 5 min)');
    ok(/enableHighAccuracy:true, timeout:8000/.test(geo), 'el delivery sigue con el GPS fino de siempre');
    ok(/\{rapida:true\}\)/.test(form.slice(form.indexOf('function agUbicarme('), form.indexOf('function agUbicarme(') + 2500)),
       'agUbicarme usa la petición rápida');
  }

  bloque('El mapa: se mueve con el mouse y tocar un punto ordena la lista');

  {
    ok(/dragging:!_tactil/.test(form) && /matchMedia\('\(pointer:coarse\)'\)/.test(form),
       'se arrastra con el mouse en PC; en celular con dos dedos (un dedo desplaza la página)');
    ok(/ev\.touches\.length!==1 \|\| m\.dragging\.enabled\(\)\) return;/.test(form) && /Usa dos dedos para mover el mapa/.test(form),
       'con un dedo sobre el mapa avisa «Usa dos dedos»');
    ok(!/agPuntoMapa/.test(form) && /_mapa\.on\('click', function\(\)\{ if\(_mapaTodas\) _agMapaAviso\(\); \}\);/.test(form),
       '⚠️ tocar el mapa NO filtra ni mueve: sin filtro solo avisa «Usa tu ubicación o busca…»');
    ok(/bubblingMouseEvents:false/.test(form), 'tocar un pin NO cuenta como tocar el mapa');
    ok(/m\.on\('click', function\(\)\{ _agElegir\(key, g\.ag\); \}\)/.test(form), 'tocar un pin elige por la misma puerta');
    const ver = form.slice(form.indexOf('function agIniciarAlVer'), form.indexOf('function agIniciarAlVer') + 1200);
    ok(/new IntersectionObserver/.test(ver) && /typeof IntersectionObserver!=='function'\)\{ arrancar\(\); return; \}/.test(ver),
       'el mapa se dibuja cuando el paso se VE (y sin IntersectionObserver, igual arranca)');
    ok(/agIniciarAlVer\(agKey\)/.test(form), 'el paso lo usa');
  }

  bloque('Ubicación bloqueada: dos salidas, y al segundo intento, la lupa');

  {
    ok(!/ag-mapa-ley/.test(form) && !/ag-dot-a/.test(form), 'sin leyenda en el mapa (pines y punto se entienden solos)');
    const f = form.slice(form.indexOf('function _ubicMensaje('), form.indexOf('function agIrALupa('));
    ok(/Activa tu ubicación manualmente/.test(f) && /onclick="agIrALupa\(\)"/.test(f),
       'el mensaje dice cómo activarla a mano O lleva a la lupa');
    const u = form.slice(form.indexOf('async function agUbicarme('), form.indexOf('function agCerca('));
    ok(/_agFallosUbic>0 && _agPerm && _agPerm\.state==='denied'\)\{ agIrALupa\(\); return; \}/.test(u),
       '⚠️ si sigue bloqueada, el toque va DIRECTO a la lupa (dentro del gesto: el teclado se abre)');
    ok(/if\(_agFallosUbic>=2\) agIrALupa\(\);/.test(u), 'y sin API de permisos, al segundo fallo también');
    ok(/_agFallosUbic=0;/.test(u), 'si se activa y funciona, el contador vuelve a cero');
    const l = form.slice(form.indexOf('function agIrALupa('), form.indexOf('async function agUbicarme('));
    ok(/inp\.focus\(/.test(l) && /ag-buscar-foco/.test(l) && /agLupaHint/.test(l), 'la lupa se ilumina, con pista y cursor listo');
    ok(/visualViewport/.test(l) && /setTimeout\(otra, 450\)/.test(l),
       '⚠️ y se vuelve a subir cuando el teclado termina de abrirse (antes lo tapaba)');
    ok(/<div id="agLupaHint"><span class="ag-lh-ic"><\/span>Busca tu provincia o distrito<\/div>/.test(form) &&
       /placeholder="Busca provincia o distrito"/.test(form), 'encabezado y buscador dicen «provincia o distrito»');
    ok(!/ag-opc/.test(form) && !/>Opcional</.test(form), 'sin la palabra «Opcional»');
  }

  bloque('En el paso de la sede la etiqueta no ocupa la pantalla');

  {
    ok(/body\.wz-sede #tt-lbl\{display:none!important\}/.test(form), 'la etiqueta se oculta en el paso de la sede');
    ok(/classList\.toggle\('wz-sede', step===3 && selCourierType==='agencia' && !\$\('agcManualInput'\)\)/.test(form),
       'solo en el paso 3 con mapa: en el paso 4 vuelve con la sede en DESTINO; delivery no cambia');
  }

  bloque('Pines: en la vista de todo el Perú solo se ven; con filtro se tocan');

  {
    const fn = form.slice(form.indexOf('async function agMapaPintar'), form.indexOf('function agMapaMarcar'));
    ok(/var tocables = !opc\.todas;/.test(fn), 'tocables solo fuera de la vista general');
    ok(/interactive:tocables, keyboard:tocables/.test(fn), '⚠️ en la vista general un pin amontonado no se toca por error');
    ok(/if\(tocables\)\{[\s\S]{0,260}m\.on\('click', function\(\)\{ _agElegir\(key, g\.ag\); \}\);/.test(fn),
       'y el clic que elige solo existe en los tocables');
    ok(/if\(!val\) agMapaPintar\(key, _agTodas\(key\), \{todas:true\}\);/.test(form),
       'al vaciar la búsqueda (sin ubicación) vuelve la vista general');
  }

  bloque('Elegida: lista recogida, «Cambiar sede» y Continuar que dice el estado');

  {
    ok(/const recogida = !!el && !_agListaAbierta;/.test(form) && /class="ag-cambiar" onclick="agCambiar\(/.test(form),
       'tras elegir queda «✓ Tu sede» y «Cambiar sede»');
    ok(/_agElegidaK = AgLista\.clave\(ag\);\n  _agListaAbierta = false;/.test(form), 'elegir siempre la recoge');
    const c = form.slice(form.indexOf('function _paso3Continuar('), form.indexOf('function _agGuiarEleccion('));
    ok(/'Continuar con esta sede →' : 'Continuar con esta dirección →'/.test(c) && /'Elige una sede para continuar' : 'Escribe tu dirección para continuar'/.test(c) && /wz-apagado/.test(c),
       'Continuar dice el estado: sede o dirección (apagado sin ella)');
    ok(/if\(!sede && !dlv\)\{ b\.textContent='Continuar →';/.test(c), 'otra agencia y Olva manual: el Continuar de siempre');
    ok(/if\(\$\('shalomDrop'\)\) _agGuiarEleccion\(\); else/.test(form), 'sin sede: guía a los dos caminos, no error rojo');
  }

  bloque('Ubicación: un mensaje por causa, el toque se nota y se ubica sola al arreglarlo');

  {
    const i = form.indexOf('function _ubicCasoDe(');
    const ctx = vm.createContext({});
    vm.runInContext(form.slice(i, form.indexOf('function _ubicTrasFallo(', i)) + ';this.C=_ubicCasoDe;', ctx);
    const C = ctx.C;
    ok(C('denegado', 'denied') === 'sitio', 'sitio bloqueado en el navegador → «Activa tu ubicación manualmente»');
    ok(C('fallo', 'granted') === 'gps' && C('denegado', 'granted') === 'gps', '⚠️ permiso dado sin posición → «Enciende la ubicación de tu celular»');
    ok(C('denegado', 'prompt') === 'pregunta', 'cerró el aviso → «Toca Permitir»');
    ok(C('denegado', '') === 'sitio', 'sin API de permisos → lo más probable');
    ok(C('no_soporta', '') === 'navegador' && C('fuera', 'granted') === 'fuera', 'navegador sin soporte / fuera del Perú');
    const u = form.slice(form.indexOf('async function agUbicarme('), form.indexOf('function agCerca('));
    ok(/Math\.max\(0, 700-\(Date\.now\(\)-t0\)\)/.test(u), '«Buscando…» se ve al menos 0,7 s: el toque se nota');
    ok(/_agUbicFallo\(codigo, estado\)/.test(u) && /_agPermiso\(\)\.then/.test(u), 'el mensaje sale de la causa real');
    ok(/st\.state==='granted' && _ubicReintento\)\{ var f=_ubicReintento; _ubicReintento=null; f\(\); \}/.test(form),
       'si lo permite desde el 🔒, se ubica sola (sedes o delivery: el flujo que falló)');
    ok(/!_ubicReintentoGps \|\| !_ubicReintento\) return;/.test(form) && /_ubicReintentoGps = \(caso==='gps'\);/.test(form),
       'si enciende el GPS y vuelve a la página, se reintenta UNA vez sola');
    ok(/_ubicTrasFallo\(caso, function\(\)\{ if\(_agUbicKey && \$\('agUbicCaja'\)\) agUbicarme\(_agUbicKey\); \}\);/.test(form),
       'sedes: reintenta la sede');
  }

  bloque('Botón nativo <geolocation> (Chrome 144+) con el de siempre como respaldo');

  {
    const g0 = form.indexOf('<geolocation id="agGeoNativo"');
    const t = form.slice(g0, form.indexOf('</geolocation>', g0) + 14);
    ok(/id="shalomCercaBtn"/.test(t), 'el botón de siempre va DENTRO: donde no hay nativo, el navegador lo muestra');
    ok(/\.ag-geo\{display:block;width:100%;padding:16px 0;/.test(form),
       '⚠️ ancho 100% con relleno lateral 0: Chrome añade el suyo e ignora box-sizing; si se sale, lo declara inválido');
    const n = form.slice(form.indexOf('function _ubicNativo('), form.indexOf('/* ── Sedes: el fallo'));
    ok(/'HTMLGeolocationElement' in window/.test(n), 'detección de soporte');
    ok(/if\(g\.isValid===false\)\{ h\.invalido\(\); return; \}/.test(n), 'si Chrome lo da por inválido, el toque pide por el camino de siempre');
    ok(/addEventListener\('location'/.test(n) && /h\.exito\(g\.position\)/.test(n) && /falla\(c, e\)/.test(n),
       'posición y error salen a quien lo conectó');
    ok(/addEventListener\('promptdismiss'/.test(n), 'cerrar el aviso tiene su mensaje');
    ok(/vigia=setTimeout\(function\(\)\{\n      if\(!h\.vigente\(\)\) return;[\s\S]{0,140}\}, 15000\);/.test(n),
       'vigía de 15 s: nunca se queda en «Buscando…» para siempre');
    const a = form.slice(form.indexOf('function _agGeoNativo('), form.indexOf('function agCerca('));
    ok(/invalido: function\(\)\{ agUbicarme\(key\); \}/.test(a) && /exito:    function\(pos\)\{ _agUbicExito\(key, pos, \{\}\); \}/.test(a),
       'sedes: conectado a la MISMA tubería que el botón de siempre');
    ok(/_agGeoNativo\(agKey\);/.test(form), 'se conecta al pintar el paso');
    ok(/sitio:     nativo\n      \? '<b>📍 Toca «Usar ubicación» y elige Permitir<\/b>/.test(form),
       'bloqueado + nativo: «Toca Usar ubicación y elige Permitir» (Chrome deja recuperarlo)');
  }

  bloque('Tocar y elegir se siente: respuesta al instante y un pequeño pico al elegir');

  {
    ok(/closest\('\.date-opt,\.cour-card,\.ag-item'\)/.test(form) && /Math\.abs\(ev\.clientX-x\)>10/.test(form),
       'el dedo apoyado marca al instante; si se mueve (deslizar) se quita');
    const sd = form.slice(form.indexOf('function selDate('), form.indexOf('function _ttPop('));
    ok(/const nueva = iso!==selDateIso && !!\(ev && ev\.isTrusted\);/.test(sd),
       '⚠️ solo un toque REAL anima y vibra (la fecha preelegida por el programa no)');
    ok(/'📦 Tu pedido sale el '/.test(sd), 'la fecha elegida se dice con todas sus palabras');
    ok(/if\(nueva\)\{ _ttPop\(el\); _ttVibrar\(\); _ttBrillo\(\$\('confirmBtn'\)\); \}/.test(sd), 'rebote, vibración y brillo en Confirmar');
    ok(/navigator\.vibrate\(12\)/.test(form) && /prefers-reduced-motion: reduce\)'\)\.matches\) return;/.test(form),
       'vibración corta y nunca con «reducir movimiento»');
    const el = form.slice(form.indexOf('function _agElegir('), form.indexOf('function agManual'));
    ok(/if\(!\(opc && opc\.restaurar\)\)\{ _agRecien=true; _ttVibrar\(\); \}/.test(el), 'elegir sede: pico; volver al paso: sin animación');
    ok(/_agElegir\(key, el, \{restaurar:true\}\)/.test(form), 'agIniciar restaura sin celebrar');
    ok(/var salta=_agRecien;/.test(form), 'el pin salta (se lee antes del await del mapa)');
    ok(/¡Ya casi! Solo falta la fecha/.test(form), 'gradiente de meta en la barra');
    ok(/@media\(prefers-reduced-motion:reduce\)\{\.tt-pop,\.ag-recien/.test(form), 'reducir movimiento: sin rebotes ni brillos');
  }

  bloque('⚠️ «Iniciando fábrica…» al abrir el formulario sin link');

  {
    ok(/\nvar _trackTokenActivo = '';/.test(form) && !/let _trackTokenActivo/.test(form),
       'var y no let: init() lo toca antes de su declaración (TDZ colgaba el formulario)');
  }
};
