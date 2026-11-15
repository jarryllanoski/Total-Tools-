'use strict';

const MIS_DATOS_CLAVE = 'tt_mis_datos';
const MIS_DATOS_DIAS = 180;

function _misTexto(v, max){
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function misDatosLimpios(d, ahoraMs){
  if(!d || typeof d !== 'object' || d.v !== 1) return null;
  const guardado = Date.parse(d.guardado);
  if(!isFinite(guardado) || ahoraMs - guardado > MIS_DATOS_DIAS * 864e5 || guardado - ahoraMs > 864e5) return null;
  const out = {
    nombre: _misTexto(d.nombre, 120).replace(/[<>"'`]/g, '').replace(/\s+/g, ' ').trim(),
    dni: _misTexto(d.dni, 8),
    telefono: _misTexto(d.telefono, 9),
    direccion: _misTexto(d.direccion, 600),
    referencia: _misTexto(d.referencia, 300),
    guardado: new Date(guardado).toISOString()
  };
  if(!out.nombre || !/^\d{8}$/.test(out.dni) || !/^\d{9}$/.test(out.telefono)) return null;
  return out;
}

function misDatosDelPedido(order, dni, ahoraMs, anteriores){
  const previos = anteriores || {};
  const esDelivery = typeof selCourierType !== 'undefined' && selCourierType === 'delivery';
  return misDatosLimpios({
    v: 1,
    nombre: order && order.name,
    dni: dni,
    telefono: String((order && order.phone) || '').replace(/\D/g, '').slice(-9),
    direccion: esDelivery ? (order && order.address) : previos.direccion,
    referencia: esDelivery ? (order && order.referencia) : previos.referencia,
    guardado: new Date(ahoraMs).toISOString()
  }, ahoraMs);
}

function _misDatosLeer(){
  let d = null;
  try{ d = misDatosLimpios(JSON.parse(localStorage.getItem(MIS_DATOS_CLAVE) || 'null'), Date.now()); }catch(e){ d = null; }
  if(!d){ try{ localStorage.removeItem(MIS_DATOS_CLAVE); }catch(e){} }
  return d;
}

function _misDatosGuardar(order, dni){
  const d = misDatosDelPedido(order, dni, Date.now(), _misDatosLeer());
  if(!d) return;
  try{ localStorage.setItem(MIS_DATOS_CLAVE, JSON.stringify(Object.assign({v: 1}, d))); }catch(e){}
}

function _misTapar(t, ver){
  const s = String(t || '');
  return s.slice(0, ver) + '•'.repeat(Math.max(0, s.length - ver));
}

function _misDatosOfrecer(){
  const caja = $('misDatosCard');
  if(!caja) return;
  const d = _misDatosLeer();
  const telLink = String(_prefillPhone || '').replace(/\D/g, '').slice(-9);
  const dniPuesto = !!($('f_dni') && $('f_dni').value.trim());
  const telPuesto = String(($('f_phone') || {value: ''}).value).replace(/\D/g, '');
  const otraPersona = telLink && telLink !== (d && d.telefono);
  if(!d || dniPuesto || (telPuesto && telPuesto !== telLink) || otraPersona){ caja.innerHTML = ''; return; }
  const primero = d.nombre.split(/\s+/)[0];
  caja.innerHTML = `<div class="mis-datos" role="group" aria-label="Usar tus datos guardados">
    <div class="mis-datos-ttl">👋 ¿Eres tú, ${esc(primero)}?</div>
    <div class="mis-datos-sub">Ahórrate escribir: usamos los datos de tu último pedido, guardados solo en este celular.</div>
    <div class="mis-datos-chips"><span>🪪 DNI ${esc(_misTapar(d.dni, 4))}</span><span>📱 ${esc('•••••' + d.telefono.slice(-4))}</span></div>
    <button type="button" class="btn-main mis-datos-si" onclick="usarMisDatos()">Sí, soy yo · Usar mis datos</button>
    <button type="button" class="mis-datos-no" onclick="noSoyYo()">No soy yo</button>
  </div>`;
}

function usarMisDatos(){
  const d = _misDatosLeer();
  const caja = $('misDatosCard');
  if(!d){ if(caja) caja.innerHTML = ''; return; }
  const dni = $('f_dni'), nom = $('f_name'), tel = $('f_phone');
  if(nom && !nom.value.trim()){ nom.value = d.nombre; onNombreInput(nom); }
  if(dni && !dni.value.trim()){ dni.value = d.dni; onDniInput(d.dni); }
  if(tel && !tel.value.trim()){ tel.value = d.telefono; onPhoneInput(d.telefono); }
  if(!_knownClient && d.direccion) _knownClient = {name: d.nombre, address: d.direccion, referencia: d.referencia, telefono: d.telefono, local: true};
  if(caja) caja.innerHTML = '<div class="mis-datos-ok">✅ Listo. Revisa que todo esté bien y continúa.</div>';
}

function noSoyYo(){
  try{ localStorage.removeItem(MIS_DATOS_CLAVE); }catch(e){}
  const caja = $('misDatosCard');
  if(caja) caja.innerHTML = '<div class="mis-datos-ok">Listo, borramos esos datos de este celular.</div>';
  const dni = $('f_dni');
  if(dni){ try{ dni.focus(); }catch(e){} }
}
