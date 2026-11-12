(function(){
  'use strict';

  var Respaldo = {};
  window.Respaldo = Respaldo;

  var FORMATO_VERSION = 2;
  var LS_LAST_BACKUP  = 'tt_last_backup';

  function _toast(msg){ if(typeof window.toast==='function') window.toast(msg); }

  function _lsGet(k){
    try { return (typeof lsGet==='function') ? lsGet(k) : localStorage.getItem(k); }
    catch(e){ return null; }
  }
  function _lsSet(k,v){
    try { if(typeof lsSet==='function') lsSet(k,v); else localStorage.setItem(k,v); }
    catch(e){}
  }

  function _fechaLegible(ts){
    if(!ts) return '—';
    try {
      return new Date(ts).toLocaleString('es-PE',{
        day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'
      });
    } catch(e){ return '—'; }
  }

  function _construirRespaldo(){
    var S = window.S || {};
    var snapshot = {
      _meta: {
        app: 'Total Tools',
        formato: FORMATO_VERSION,
        fecha: Date.now(),
        fechaLegible: _fechaLegible(Date.now())
      },
      shipments:     S.shipments     || [],
      suppliers:     S.suppliers     || [],
      couriers:      S.couriers      || [],
      courierActive: S.courierActive || {},
      labels:        S.labels        || [],
      msgTemplates:  S.msgTemplates  || {},
      extraFields:   S.extraFields   || [],
      dispatch:      S.dispatch      || {},
      config:        S.config        || {},
      statusPin:     S.statusPin     || '1234',
      trash:         S.trash         || [],
      recursos:      Array.isArray(S.recursos) ? S.recursos : [],
      agenciaOrigen: S.agenciaOrigen || null,
      shalomInstancia: S.shalomInstancia || null
    };
    return JSON.parse(JSON.stringify(snapshot));
  }

  function _validar(data){
    if(!data || typeof data !== 'object')        return {ok:false, motivo:'El archivo no es un respaldo válido.'};
    if(!data._meta || data._meta.app!=='Total Tools')
      return {ok:false, motivo:'El archivo no es un respaldo de Total Tools.'};
    if(!Array.isArray(data.shipments))           return {ok:false, motivo:'El respaldo no contiene la lista de pedidos.'};
    for(var i=0;i<data.shipments.length;i++){
      if(!data.shipments[i] || typeof data.shipments[i]!=='object')
        return {ok:false, motivo:'Hay pedidos con formato inválido en el respaldo.'};
    }
    if(data.couriers && !Array.isArray(data.couriers))
      return {ok:false, motivo:'La lista de couriers tiene un formato inválido.'};
    return {ok:true};
  }

  Respaldo.crearYDescargar = function(){
    try {
      var snapshot = _construirRespaldo();
      var json = JSON.stringify(snapshot, null, 2);
      var blob = new Blob([json], {type:'application/json'});
      var url  = URL.createObjectURL(blob);
      var fecha = new Date().toLocaleDateString('es-PE').replace(/\//g,'-');
      var a = document.createElement('a');
      a.href = url;
      a.download = 'TotalTools_Respaldo_'+fecha+'.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
      _lsSet(LS_LAST_BACKUP, String(Date.now()));
      _toast('🛡️ Respaldo descargado ('+snapshot.shipments.length+' pedidos)');
      _refrescarFecha();
    } catch(e){
      console.error('[Respaldo] Error al crear respaldo:', e);
      _toast('⚠️ No se pudo crear el respaldo');
    }
  };

  Respaldo.restaurarDesdeArchivo = function(input){
    var file = input && input.files && input.files[0];
    if(!file){ return; }
    if(!window._nubeLista){
      _toast('⏳ Espera a que sincronice con la nube y vuelve a intentarlo');
      input.value = '';
      return;
    }
    var reader = new FileReader();
    reader.onload = function(ev){
      var data;
      try { data = JSON.parse(ev.target.result); }
      catch(e){ _toast('⚠️ El archivo no es un JSON válido'); input.value=''; return; }

      var v = _validar(data);
      if(!v.ok){ _toast('⚠️ '+v.motivo); input.value=''; return; }

      var resumen = (data.shipments?data.shipments.length:0)+' pedidos · '+
                    (data._meta&&data._meta.fechaLegible?data._meta.fechaLegible:'fecha desconocida');
      _pedirConfirmacion(resumen, function(){
        _aplicarRestauracion(data);
      });
      input.value='';
    };
    reader.onerror = function(){ _toast('⚠️ No se pudo leer el archivo'); input.value=''; };
    reader.readAsText(file);
  };

  function _aplicarRestauracion(data){
    try {
      try {
        var seguridad = _construirRespaldo();
        _lsSet('tt_backup_pre_restore', JSON.stringify(seguridad));
      } catch(e){ 
        console.warn('[Respaldo] No se pudo crear respaldo de seguridad:', e);
      }

      var S = window.S;
      if(!S){ _toast('⚠️ Estado no disponible'); return; }

      S.shipments     = Array.isArray(data.shipments)     ? data.shipments     : [];
      S.suppliers     = Array.isArray(data.suppliers)     ? data.suppliers     : [];
      S.couriers      = Array.isArray(data.couriers)      ? data.couriers      : [];
      S.courierActive = (data.courierActive && typeof data.courierActive==='object') ? data.courierActive : {};
      S.labels        = Array.isArray(data.labels)        ? data.labels        : [];
      S.msgTemplates  = (data.msgTemplates && typeof data.msgTemplates==='object') ? data.msgTemplates : {};
      S.extraFields   = Array.isArray(data.extraFields)   ? data.extraFields   : [];
      S.dispatch      = (data.dispatch && typeof data.dispatch==='object') ? data.dispatch : {};
      S.config        = (data.config && typeof data.config==='object') ? data.config : {};
      S.statusPin     = data.statusPin || '1234';
      S.trash         = Array.isArray(data.trash)         ? data.trash         : [];

      if(Object.prototype.hasOwnProperty.call(data, 'recursos')){
        S.recursos = Array.isArray(data.recursos) ? data.recursos : [];
      }
      if(Object.prototype.hasOwnProperty.call(data, 'agenciaOrigen')){
        S.agenciaOrigen = (data.agenciaOrigen && typeof data.agenciaOrigen === 'object')
          ? data.agenciaOrigen : null;
      }
      var _cuentaDistinta = !!(data.shalomInstancia && data.shalomInstancia.id &&
        (!S.shalomInstancia || S.shalomInstancia.id !== data.shalomInstancia.id));

      window.S = S;

      if(typeof window.save==='function') window.save();
      if(typeof window.render==='function') window.render();
      if(typeof window.renderChips==='function') window.renderChips();

      _cerrarOverlay();
      _toast('✅ Respaldo restaurado ('+S.shipments.length+' pedidos)' +
        (_cuentaDistinta ? ' · la cuenta de Shalom no se cambió: si hace falta, pulsa Conectar en Config' : ''));
    } catch(e){
      console.error('[Respaldo] Error al restaurar:', e);
      _toast('⚠️ Error al restaurar el respaldo');
    }
  }

  function _pedirConfirmacion(resumen, onConfirm){
    var ov = document.getElementById('delOverlay');
    if(ov){
      var sheet = ov.querySelector('.sheet');
      if(sheet){
        sheet.innerHTML =
          '<div class="sheet-handle"></div>'+
          '<div style="font-family:Syne,sans-serif;font-weight:800;font-size:17px;margin-bottom:8px">⚠️ Confirmar restauración</div>'+
          '<div style="font-size:13px;color:#e6edf3;line-height:1.5;margin-bottom:6px">Vas a reemplazar <b>TODOS</b> los datos actuales por los del respaldo:</div>'+
          '<div style="font-size:12px;color:#8b949e;margin-bottom:14px;padding:8px 10px;background:rgba(56,139,253,.08);border:1px solid rgba(56,139,253,.25);border-radius:8px">📦 '+resumen+'</div>'+
          '<div style="font-size:11px;color:#8b949e;margin-bottom:14px">Se creará un respaldo de seguridad del estado actual por si necesitas deshacer.</div>'+
          '<div style="display:flex;gap:8px">'+
          '<button id="_respCancel" style="flex:1;padding:12px;background:#1c2333;border:1px solid #30363d;border-radius:9px;color:#8b949e;font-size:13px;cursor:pointer;font-family:inherit">Cancelar</button>'+
          '<button id="_respOk" style="flex:2;padding:12px;background:linear-gradient(135deg,#388bfd,#1a5fbf);border:none;border-radius:9px;color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">✅ Restaurar</button>'+
          '</div>';
        ov.classList.add('open');
        var btnOk = document.getElementById('_respOk');
        var btnCancel = document.getElementById('_respCancel');
        if(btnOk) btnOk.onclick = function(){ ov.classList.remove('open'); onConfirm(); };
        if(btnCancel) btnCancel.onclick = function(){ ov.classList.remove('open'); };
        return;
      }
    }
    if(window.confirm('¿Restaurar el respaldo?\n\n'+resumen+'\n\nEsto reemplaza todos los datos actuales.')){
      onConfirm();
    }
  }

  function _cerrarOverlay(){
    var ov = document.getElementById('delOverlay');
    if(ov) ov.classList.remove('open');
    var ex = document.getElementById('excelOverlay');
    if(ex) ex.classList.remove('open');
  }

  function _refrescarFecha(){
    var el = document.getElementById('respLastBackup');
    if(el){
      var ts = parseInt(_lsGet(LS_LAST_BACKUP)||'0',10);
      el.textContent = ts ? ('Último respaldo: '+_fechaLegible(ts)) : 'Aún no has creado un respaldo';
    }
  }
  Respaldo.refrescarFecha = _refrescarFecha;

  Respaldo.deshacerUltimaRestauracion = function(){
    var raw = _lsGet('tt_backup_pre_restore');
    if(!raw){ _toast('No hay respaldo de seguridad disponible'); return; }
    try {
      var data = JSON.parse(raw);
      _pedirConfirmacion('Estado previo a la última restauración', function(){
        _aplicarRestauracion(data);
      });
    } catch(e){ _toast('⚠️ El respaldo de seguridad está dañado'); }
  };

  if(document.readyState!=='complete'){
    document.addEventListener('DOMContentLoaded', _refrescarFecha);
  } else {
    _refrescarFecha();
  }

})();
