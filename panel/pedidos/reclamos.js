(function(global){
  'use strict';

  var _actual = null;

  function _ov(){
    var ov = document.getElementById('recOv');
    if(!ov){
      ov = document.createElement('div');
      ov.id = 'recOv';
      ov.className = 'rec-ov';
      ov.addEventListener('click', function(e){ if(e.target === ov) cerrar(); });
      document.body.appendChild(ov);
    }
    return ov;
  }

  function _pedido(id){
    return ((global.S && global.S.shipments) || []).find(function(x){ return x && x.id === id; }) || null;
  }

  function _estados(){ return Object.keys((global.Garantia && global.Garantia.ESTADOS) || {}); }
  function _tipo(t){ return (global.Garantia && global.Garantia.TIPOS[t]) || 'Solicitud'; }

  function _pintar(){
    var r = _actual;
    var ov = _ov();
    if(!r){ ov.innerHTML = '<div class="rec-box"><div class="tgl-s">Cargando…</div></div>'; return; }
    var fotos = (r.doc.fotos || []).filter(function(u){ return /^https:\/\/firebasestorage\.googleapis\.com\//.test(String(u || '')); });
    ov.innerHTML = '<div class="rec-box" role="dialog" aria-modal="true" aria-label="Solicitud de garantía">'
      + '<div class="rec-cab"><b>🛡️ ' + escH(_tipo(r.doc.tipo)) + '</b><button type="button" class="rec-x" onclick="Reclamos.cerrar()" aria-label="Cerrar">✕</button></div>'
      + '<div class="rec-dato"><span>Cliente</span>' + escH(r.doc.cliente || '—') + ' · #' + escH(r.doc.codigo || '') + '</div>'
      + '<div class="rec-dato"><span>Producto</span>' + escH(r.doc.producto || '—') + '</div>'
      + '<div class="rec-dato"><span>Qué pasó</span>' + escH(r.doc.texto || '—') + '</div>'
      + '<div class="rec-dato"><span>Enviado</span>' + escH(r.doc.creado ? new Date(r.doc.creado).toLocaleString('es-PE') : '—') + '</div>'
      + '<div class="rec-fotos">' + fotos.map(function(u, i){
          return '<a href="' + escU(u) + '" target="_blank" rel="noopener noreferrer"><img src="' + escU(u) + '" alt="Foto ' + (i + 1) + '" loading="lazy"></a>';
        }).join('') + '</div>'
      + '<label class="rec-lbl">Estado</label>'
      + '<select class="fi" id="recEstado">' + _estados().map(function(e){
          return '<option value="' + escH(e) + '"' + (e === r.estado ? ' selected' : '') + '>' + escH(e) + '</option>';
        }).join('') + '</select>'
      + '<label class="rec-lbl">Respuesta para el cliente (la ve en su seguimiento)</label>'
      + '<textarea class="fi" id="recResp" rows="3" maxlength="300" placeholder="Ej. Trae el producto a tienda con tu boleta y lo cambiamos">' + escH(r.respuesta) + '</textarea>'
      + '<div class="rec-btns">'
      + '<button type="button" class="cfg-save" onclick="Reclamos.guardar(this)">💾 Guardar</button>'
      + (r.doc.telefono ? '<button type="button" class="cfg-save rec-wa" onclick="Reclamos.whatsapp()">💬 WhatsApp</button>' : '')
      + '</div></div>';
  }

  async function abrir(id){
    var s = _pedido(id);
    if(!s || !s.reclamo) return;
    _actual = null;
    var ov = _ov();
    ov.style.display = 'flex';
    _pintar();
    try{
      var doc = global._fbLeerReclamo ? await global._fbLeerReclamo(id) : null;
      if(!doc) throw new Error('no se encontró la solicitud');
      _actual = {id: id, doc: doc, estado: s.reclamo.estado || doc.estado, respuesta: s.reclamo.respuesta || doc.respuesta || ''};
      _pintar();
    }catch(e){
      cerrar();
      toast('⚠️ No se pudo abrir la solicitud: ' + e.message);
    }
  }

  function cerrar(){
    var ov = document.getElementById('recOv');
    if(ov){ ov.style.display = 'none'; ov.innerHTML = ''; }
    _actual = null;
  }

  function _leerForm(){
    var e = document.getElementById('recEstado');
    var t = document.getElementById('recResp');
    return {estado: e ? e.value : '', respuesta: t ? String(t.value || '').trim().slice(0, 300) : ''};
  }

  async function guardar(btn){
    if(!_actual) return;
    var f = _leerForm();
    if(_estados().indexOf(f.estado) < 0){ toast('⚠️ Estado no válido'); return; }
    if(f.estado === 'RECHAZADO' && !f.respuesta){ toast('⚠️ Explica al cliente por qué no procede'); return; }
    var s = _pedido(_actual.id);
    if(!s || !s.reclamo) return;
    if(btn) btn.disabled = true;
    try{
      var ahora = new Date().toISOString();
      var nuevo = {estado: f.estado, tipo: s.reclamo.tipo, fecha: s.reclamo.fecha};
      if(f.respuesta) nuevo.respuesta = f.respuesta;
      await global._fbGuardarReclamo(_actual.id, {estado: f.estado, respuesta: f.respuesta, actualizado: ahora});
      await global._fbPatchShipment(_actual.id, {reclamo: nuevo});
      s.reclamo = nuevo;
      _actual.estado = f.estado;
      _actual.respuesta = f.respuesta;
      if(typeof global.render === 'function') global.render();
      toast('✅ Guardado. El cliente lo ve en su seguimiento');
    }catch(e){
      toast('⚠️ No se guardó: ' + e.message);
    }finally{
      if(btn) btn.disabled = false;
    }
  }

  function mensaje(r, form){
    var G = global.Garantia;
    var est = (G && G.ESTADOS[form.estado]) || [form.estado];
    var nombre = String(r.doc.cliente || '').trim().split(/\s+/)[0] || '';
    return 'Hola' + (nombre ? ' ' + nombre : '') + ', te escribimos de Total Tools por tu solicitud de '
      + _tipo(r.doc.tipo).toLowerCase() + ' (' + (r.doc.producto || 'tu producto') + ', pedido #' + (r.doc.codigo || '') + '). '
      + est[0] + (/[.!?]$/.test(est[0]) ? '' : '.') + (form.respuesta ? ' ' + form.respuesta : '');
  }

  function whatsapp(){
    if(!_actual) return;
    var tel = String(_actual.doc.telefono || '').replace(/\D/g, '');
    if(!tel) return;
    var url = 'https://wa.me/' + (tel.length === 9 ? '51' + tel : tel) + '?text=' + encodeURIComponent(mensaje(_actual, _leerForm()));
    global.open(url, '_blank', 'noopener');
  }

  global.Reclamos = {abrir: abrir, cerrar: cerrar, guardar: guardar, whatsapp: whatsapp, mensaje: mensaje};
})(window);
