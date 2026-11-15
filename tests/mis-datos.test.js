'use strict';
const vm = require('vm');
const E = require('./_entorno.js');

const DIA = 864e5;
const AHORA = Date.parse('2026-11-15T12:00:00Z');

function modulo(extra) {
  const elementos = {};
  const el = (id) => elementos[id] || (elementos[id] = {id, value: '', innerHTML: '', focus() {}});
  const almacen = {};
  const llamadas = [];
  const ctx = vm.createContext(Object.assign({
    Date, JSON, Math, String, Object, isFinite,
    $: el,
    esc: (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    localStorage: {
      getItem: (k) => (k in almacen ? almacen[k] : null),
      setItem: (k, v) => { almacen[k] = String(v); },
      removeItem: (k) => { delete almacen[k]; },
    },
    _prefillPhone: '',
    _knownClient: null,
    selCourierType: 'delivery',
    onNombreInput: () => llamadas.push('nombre'),
    onDniInput: () => llamadas.push('dni'),
    onPhoneInput: () => llamadas.push('telefono'),
  }, extra || {}));
  vm.runInContext(E.leerReal('cliente/form-mis-datos.js') + ';this._knownClientDe=()=>_knownClient;', ctx);
  return {ctx, el, almacen, llamadas};
}

const datos = (cambios) => Object.assign({v: 1, nombre: 'JUAN CARLOS PEREZ', dni: '76543210', telefono: '912344321',
  direccion: 'Av. Ejemplo 123', referencia: 'Frente al parque', guardado: new Date(AHORA - 3 * DIA).toISOString()}, cambios || {});

module.exports = async ({bloque, ok}) => {
  bloque('«¿Eres tú?»: que se guarda en el celular y cuanto dura');
  {
    const {ctx} = modulo();
    const L = (d, t) => ctx.misDatosLimpios(d, t || AHORA);
    ok(L(datos()).nombre === 'JUAN CARLOS PEREZ' && L(datos()).dni === '76543210', 'datos validos de hace 3 dias: se usan');
    ok(L(datos({guardado: new Date(AHORA - 181 * DIA).toISOString()})) === null, 'despues de 180 dias se olvidan solos');
    ok(L(datos({guardado: new Date(AHORA + 5 * DIA).toISOString()})) === null, 'una fecha del futuro (manipulada) no vale');
    ok(L(datos({dni: '1234'})) === null && L(datos({telefono: '12'})) === null && L(datos({nombre: '  '})) === null,
       'sin DNI de 8, celular de 9 o nombre: no se ofrece nada');
    ok(L(datos({v: 2})) === null && L(null) === null && L('texto') === null, 'otro formato o basura: nada');
    ok(L(datos({nombre: '<img src=x onerror=alert(1)> ANA'})).nombre === 'img src=x onerror=alert(1) ANA',
       'un nombre con signos de codigo pierde < > y comillas');
    ok(L(datos({direccion: 'x'.repeat(900)})).direccion.length === 600, 'cada campo con su largo maximo');

    const prev = {direccion: 'Av. Anterior 1', referencia: 'Ref anterior'};
    const ped = {name: 'ANA TORRES', phone: '+51 987 001 122', address: 'Jr. Nuevo 4', referencia: 'Casa verde'};
    ctx.selCourierType = 'delivery';
    let d = ctx.misDatosDelPedido(ped, '45678912', AHORA, prev);
    ok(d.telefono === '987001122' && d.direccion === 'Jr. Nuevo 4' && d.referencia === 'Casa verde',
       'pedido por delivery: guarda su direccion y referencia, celular sin +51 ni espacios');
    ctx.selCourierType = 'agencia';
    d = ctx.misDatosDelPedido(ped, '45678912', AHORA, prev);
    ok(d.direccion === 'Av. Anterior 1' && d.referencia === 'Ref anterior', 'pedido por agencia: conserva la direccion de su ultimo delivery');
    ok(ctx.misDatosDelPedido(ped, '', AHORA, prev) === null, 'sin DNI no se guarda nada');
  }

  bloque('«¿Eres tú?»: cuando se ofrece');
  {
    const ofrecer = (guardado, prep) => {
      const m = modulo();
      if (guardado !== undefined) m.almacen.tt_mis_datos = typeof guardado === 'string' ? guardado : JSON.stringify(guardado);
      if (prep) prep(m);
      m.ctx._misDatosOfrecer();
      return {html: m.el('misDatosCard').innerHTML, m};
    };
    const hoy = {guardado: new Date().toISOString()};
    let r = ofrecer(undefined);
    ok(r.html === '', 'sin datos guardados: no se muestra');
    r = ofrecer(datos(hoy));
    ok(/¿Eres tú, JUAN\?/.test(r.html) && /Sí, soy yo/.test(r.html) && /No soy yo/.test(r.html), 'con datos: «¿Eres tú, JUAN?» con sus dos botones');
    ok(/DNI 7654••••/.test(r.html) && /•••••4321/.test(r.html) && !/76543210|912344321/.test(r.html),
       'muestra el DNI y el celular tapados: quien mire la pantalla no los lee completos');
    ok(/guardados solo en este celular/.test(r.html), 'dice donde estan sus datos (confianza)');
    r = ofrecer(datos(hoy), (m) => { m.el('f_dni').value = '11111111'; });
    ok(r.html === '', 'si ya escribio un DNI: no interrumpe');
    r = ofrecer(datos(hoy), (m) => { m.ctx._prefillPhone = '999888777'; m.el('f_phone').value = '999888777'; });
    ok(r.html === '', '⚠️ link personal de OTRO celular: no ofrece datos ajenos');
    r = ofrecer(datos(hoy), (m) => { m.ctx._prefillPhone = '912344321'; m.el('f_phone').value = '912344321'; });
    ok(/¿Eres tú/.test(r.html), 'link personal del mismo celular: si');
    r = ofrecer(datos(hoy), (m) => { m.el('f_phone').value = '955555555'; });
    ok(r.html === '', 'si ya escribio otro celular: no');
    r = ofrecer('{no es json');
    ok(r.html === '' && !('tt_mis_datos' in r.m.almacen), 'datos dañados: no se muestra y se borran');
    r = ofrecer(datos({guardado: new Date(Date.now() - 200 * DIA).toISOString()}));
    ok(r.html === '' && !('tt_mis_datos' in r.m.almacen), 'datos vencidos: se borran');
  }

  bloque('«¿Eres tú?»: los botones');
  {
    const m = modulo();
    m.almacen.tt_mis_datos = JSON.stringify(datos({guardado: new Date().toISOString()}));
    m.ctx.usarMisDatos();
    ok(m.el('f_dni').value === '76543210' && m.el('f_name').value === 'JUAN CARLOS PEREZ' && m.el('f_phone').value === '912344321',
       '«Sí, soy yo» llena DNI, nombre y celular');
    ok(m.llamadas.join() === 'nombre,dni,telefono', 'y corre las mismas validaciones que si los escribiera (RENIEC incluido)');
    const k = m.ctx._knownClientDe();
    ok(k && k.local === true && k.address === 'Av. Ejemplo 123' && k.telefono === '912344321', 'deja lista su direccion de siempre para el paso de entrega');
    ok(/Revisa que todo esté bien/.test(m.el('misDatosCard').innerHTML), 'y le pide revisar (los datos siguen siendo editables)');

    const m2 = modulo();
    m2.almacen.tt_mis_datos = JSON.stringify(datos({guardado: new Date().toISOString()}));
    m2.el('f_name').value = 'OTRO NOMBRE';
    m2.ctx.usarMisDatos();
    ok(m2.el('f_name').value === 'OTRO NOMBRE', 'no pisa lo que ya escribio');

    const m3 = modulo();
    m3.almacen.tt_mis_datos = JSON.stringify(datos({guardado: new Date().toISOString()}));
    m3.ctx.noSoyYo();
    ok(!('tt_mis_datos' in m3.almacen) && /borramos esos datos de este celular/.test(m3.el('misDatosCard').innerHTML) && m3.el('f_dni').value === '',
       '«No soy yo» borra los datos de este celular y deja el formulario vacio (celular compartido)');
  }

  bloque('«¿Eres tú?»: conectado al formulario');
  {
    const fb = E.leerReal('cliente/form-base.js');
    ok(/<div class="section-ttl" style="margin-top:4px">Datos de la persona que recibe<\/div>\s*<div id="misDatosCard"><\/div>/.test(fb), 'la tarjeta va arriba del paso de datos');
    ok(/if\(typeof _misDatosOfrecer==='function'\) _misDatosOfrecer\(\);\s*wzInit\(\);/.test(fb), 'se ofrece despues de poner los datos del link');
    ok(/if\(typeof _misDatosGuardar==='function'\) _misDatosGuardar\(order, /.test(E.leerReal('cliente/form-enviar.js')), 'se guarda solo cuando el pedido se registro bien');
    const fd = E.leerReal('cliente/form-datos.js');
    ok(/function _soltarConocido\(phone\)\{\s*if\(!\(_knownClient && _knownClient\.local && _knownClient\.telefono===phone\)\) _knownClient=null;/.test(fd) &&
       !/_knownClient=null/.test(fd.slice(fd.indexOf('function onPhoneInput'), fd.indexOf('var _dniTimer'))),
       '⚠️ la respuesta vacia del servidor ya no borra la direccion guardada en el celular');
    const fo = E.leerCrudo('formulario.html');
    ok(fo.indexOf('cliente/form-datos.js') < fo.indexOf('cliente/form-mis-datos.js') && fo.indexOf('cliente/form-mis-datos.js') < fo.indexOf('cliente/form-arranque.js'),
       'el modulo carga despues de form-datos y antes del arranque');
    ok(/if\(ref && !ref\.value\.trim\(\) && _knownClient\.referencia\) ref\.value=_knownClient\.referencia;/.test(E.leerReal('cliente/form-courier.js')),
       '«Usar mi dirección de siempre» tambien pone la referencia');
    ok(/\.mis-datos-no\{[^}]*text-decoration:underline/.test(E.leerReal('cliente/cliente.css')) && /\.mis-datos-si\{width:100%/.test(E.leerReal('cliente/cliente.css')),
       'boton principal grande para «Sí, soy yo» y «No soy yo» visible pero secundario');
  }
};
