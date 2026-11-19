'use strict';
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const E = require('./_entorno.js');
const PF = require('../functions/pedidoForm.js');
const N = require('../functions/nroComprobante.js');

const MINIMOS = [
  {id: 'a', name: 'COMPLETO', phone: '900000001', address: 'Av. Prueba 1', courier: 'DELIVERY', date: '2026-11-18', nroComprobante: 'B002-4393'},
  {id: 'b', name: 'SIN DIRECCION', phone: '900000002', courier: 'RETIRO EN TIENDA', date: '2026-11-18'},
  {id: 'c', name: 'SIN FECHA', phone: '900000003', courier: 'SHALOM', shalomGuia: '55667788', ciudadDestino: 'AREQUIPA'},
  {id: 'd', phone: '900000004'},
  {id: 'e'},
];

module.exports = async ({bloque, ok}) => {
  bloque('Servidor: los campos básicos siempre llegan como texto (vacío si no hay)');
  {
    const o = PF.limpiar({name: 'Ana', phone: '999 999 999', courier: 'RETIRO EN TIENDA'});
    ok(['name', 'address', 'referencia', 'notes', 'courier'].every((k) => typeof o[k] === 'string') && o.address === '' && o.notes === '',
       'un pedido sin dirección ni notas las guarda vacías, como antes del blindaje');
    ok(PF.limpiar({}).courier === '' && PF.limpiar({}).name === '' && typeof PF.limpiar({}).phone === 'string', 'aunque no venga nada, no faltan');
    ok(PF.limpiar({address: '<script>x</script>Av 1'}).address === 'scriptx/scriptAv 1', 'y la limpieza de seguridad sigue igual');
    ok(PF.limpiar({dni: '', ciudadDestino: ''}).dni === undefined && PF.limpiar({ciudadDestino: ''}).ciudadDestino === undefined,
       'los opcionales vacíos (DNI, ciudad) siguen sin guardarse');
    ok(PF.SIEMPRE.join() === 'name,address,referencia,notes', 'la lista de siempre presentes es explícita');
  }

  bloque('Buscador del panel: nunca se rompe por un pedido incompleto');
  {
    const src = E.trozo('index.html', 'const _txtOrden=', 'let _renderPedido = false;');
    let q = '';
    // eslint-disable-next-line no-new-func
    const api = new Function('S', '$', '_dniDe', 'NroComprobante',
        'const SIN_ETIQUETA="__SIN_ETIQUETA__";let _filt="",_advActive=false;const _adv={};function _soloActivos(){return false}' + src +
        ';return {vis: visibleShipments, coincide: coincideBusqueda};')(
        {shipments: MINIMOS}, () => ({value: q}), (x) => String((x && x.dni) || ''), N);
    const terminos = ['prueba', 'b002-4393', 'zzz', 'retiro', 'arequipa', '55667788', '9000', 'sin', 'delivery', '  ', ''];
    let roto = '';
    terminos.forEach((t) => { q = t; try { api.vis(); } catch (e) { roto = t + ': ' + e.message; } });
    ok(!roto, '⚠️ ninguna búsqueda lanza error con pedidos sin dirección, fecha, nombre o courier ' + roto);
    q = 'prueba'; ok(api.vis().map((x) => x.id).join() === 'a', 'por dirección');
    q = 'b002-4393'; ok(api.vis().map((x) => x.id).join() === 'a', 'por boleta (antes se rompía al llegar aquí)');
    q = 'arequipa'; ok(api.vis().map((x) => x.id).join() === 'c', 'por ciudad destino (nuevo)');
    q = '55667788'; ok(api.vis().map((x) => x.id).join() === 'c', 'por guía de Shalom (nuevo)');
    q = 'retiro'; ok(api.vis().map((x) => x.id).join() === 'b', 'por courier');
    q = '  sin direccion  '; ok(api.vis().map((x) => x.id).join() === 'b', 'ignora espacios al inicio y al final');
    q = 'zzz'; ok(api.vis().length === 0, 'lo que no existe: lista vacía, sin error');
    q = '   '; ok(api.vis().length === MINIMOS.length, 'solo espacios: no filtra');
    ok(api.coincide(null, 'x') === false && api.coincide({}, 'x') === false, 'un pedido vacío o nulo no coincide ni rompe');
  }

  bloque('Orden y grupos de la lista: tolerantes');
  {
    const lista = E.leerReal('panel/pantalla/lista.js');
    ok(!/[a-z]\.(name|courier|date)\.localeCompare\(/.test(lista), 'ningún orden llama localeCompare sobre un campo que puede faltar');
    ok(/const k=_txtOrden\(x\.courier\);if\(!groups\[k\]\)/.test(lista) && /escH\(courier\|\|'Sin courier'\)/.test(lista),
       'un pedido sin courier va a «Sin courier», no a «undefined»');
    const _txtOrden = vm.runInNewContext('(' + (/const _txtOrden=(v=>[^;]+);/.exec(lista) || [])[1] + ')');
    const ordenados = MINIMOS.slice().sort((a, b) => _txtOrden(a.courier).localeCompare(_txtOrden(b.courier)) || _txtOrden(b.date).localeCompare(_txtOrden(a.date)));
    ok(ordenados.length === MINIMOS.length, 'ordenar por courier y fecha con pedidos incompletos no lanza error');
  }

  bloque('Mensajes rápidos de WhatsApp: sin «undefined»');
  {
    const nav = E.leerReal('panel/pantalla/navegacion.js');
    const ctx = vm.createContext({});
    vm.runInContext((/function fillVars\(tpl,s\)\{[\s\S]*?\n\}/.exec(nav) || [''])[0], ctx);
    const tpl = 'Hola {nombre} ({telefono}), va a {direccion} por {courier} el {fecha}, {costo}, {estado}';
    MINIMOS.forEach((s) => ok(!/undefined|null/.test(ctx.fillVars(tpl, s)), 'pedido ' + s.id + ': ' + ctx.fillVars(tpl, s)));
    ok(ctx.fillVars('{direccion}', MINIMOS[2]) === 'AREQUIPA', 'sin dirección usa la ciudad destino');
    ok(ctx.fillVars('{direccion}', {address: 'Jr. $& 1'}) === 'Jr. $& 1', 'un «$&» en la dirección se copia tal cual (no lo interpreta)');
    ok(ctx.fillVars('{NOMBRE} {Nombre}', {name: 'ANA'}) === 'ANA ANA' && ctx.fillVars(null, {}) === '', 'mayúsculas o plantilla vacía');
  }

  bloque('Editar un pedido incompleto: campos vacíos, no «undefined»');
  {
    const form = E.leerReal('panel/pedidos/pedido-form.js');
    ['fName', 'fPhone', 'fCourier', 'fDate', 'fStatus'].forEach((k) => {
      ok(new RegExp("\\$\\('" + k + "'\\)\\.value=s\\.[a-zA-Z]+\\|\\|''").test(form), k + ' con respaldo vacío');
    });
    ok(/\$\('fAddr'\)\.value=_isEncEdit\?\(s\.ciudadDestino\|\|s\.address\|\|''\):\(s\.address\|\|''\);/.test(form), 'fAddr con respaldo vacío en los dos casos');
  }

  bloque('Exportar CSV: celdas seguras');
  {
    const ex = E.leerReal('panel/compartir/excel.js');
    const ctx = vm.createContext({});
    vm.runInContext((/function celdaCSV\(v\)\{[\s\S]*?\n\}/.exec(ex) || [''])[0], ctx);
    ok(ctx.celdaCSV(undefined) === '""' && ctx.celdaCSV(null) === '""', 'vacío, no «undefined»');
    ok(ctx.celdaCSV('Av. 1, Lima') === '"Av. 1, Lima"' && ctx.celdaCSV('dice "hola"') === '"dice ""hola"""', 'comas y comillas no rompen las columnas');
    ok(['=HYPERLINK("x")', '+1', '-2+3', '@SUM(A1)'].every((v) => ctx.celdaCSV(v).startsWith('"\'')), '⚠️ una fórmula escrita por el cliente no se ejecuta al abrir en Excel');
    ok(/r\.map\(celdaCSV\)\.join\(','\)/.test(ex), 'todas las celdas pasan por celdaCSV');
  }

  bloque('Barrido: ningún campo opcional del pedido se usa sin protección');
  {
    const raiz = path.join(__dirname, '..', 'panel');
    const archivos = [];
    const recorrer = (d) => fs.readdirSync(d, {withFileTypes: true}).forEach((f) => {
      const r = path.join(d, f.name);
      if (f.isDirectory()) recorrer(r); else if (/\.js$/.test(f.name)) archivos.push(r);
    });
    recorrer(raiz);
    const peligro = /\b([a-z_]+)\.(address|referencia|notes|ciudadDestino|encAgencia|dni|date|courier|name|phone|status|privateNote|createdAt)\.(toLowerCase|toUpperCase|includes|trim|replace|split|startsWith|endsWith|slice|substring|indexOf|match|localeCompare)\(/g;
    const hallados = [];
    archivos.forEach((f) => {
      fs.readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
        let m;
        peligro.lastIndex = 0;
        while ((m = peligro.exec(l))) {
          const exp = m[1] + '.' + m[2];
          const protegido = l.includes(exp + '&&' + exp + '.') || l.includes(exp + ' ? ' + exp + '.') ||
            l.includes('if(' + exp + ') return ' + exp + '.') || (m[1] === 'doc' && m[2] === 'name');
          if (!protegido) hallados.push(path.relative(raiz, f) + ':' + (i + 1) + ' ' + exp + '.' + m[3]);
        }
      });
    });
    ok(hallados.length === 0, '⚠️ todo uso de un campo del pedido que puede faltar está protegido ' + hallados.join(', '));
  }
};
