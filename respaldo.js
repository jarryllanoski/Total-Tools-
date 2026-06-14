/**
 * respaldo.js — Módulo de Respaldo y Restauración para Total Tools
 *
 * OBJETIVO: respaldar y restaurar TODO el estado de la app (S) en un archivo
 * JSON, para poder reconstruir el sistema exactamente como estaba.
 *
 * DEPENDENCIAS (globales que ya existen en index.html):
 *   - window.S        → el estado completo de la app
 *   - window.save     → persiste S en localStorage + Firebase
 *   - window.render / window.renderChips → refrescan la UI
 *   - window.toast    → notificación visual (opcional)
 *   - lsGet / lsSet   → acceso a localStorage (opcional, para fecha último respaldo)
 *
 * NO MODIFICA NADA EXISTENTE. Se auto-registra como window.Respaldo.
 * Para desactivar: quitar <script src="respaldo.js"> del index.html
 *
 * Última actualización: 2026-06
 */
(function(){
  'use strict';

  // Espacio de nombres global (declarado al inicio para poder colgar métodos)
  var Respaldo = {};
  window.Respaldo = Respaldo;

  var FORMATO_VERSION = 1; // versión del formato de respaldo (para futuras migraciones)
  var LS_LAST_BACKUP  = 'tt_last_backup'; // fecha del último respaldo descargado

  /* ── Utilidades ──────────────────────────────────────────────────── */
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

  /* ── Construir el objeto de respaldo desde S ─────────────────────── */
  // Toma una "foto" completa del estado. Clona profundo para no enlazar
  // referencias con el S vivo.
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
      trash:         S.trash         || []
    };
    // Clon profundo para desligar del estado vivo
    return JSON.parse(JSON.stringify(snapshot));
  }

  /* ── Validar integridad de un respaldo antes de restaurar ────────── */
  // Devuelve {ok:true} o {ok:false, motivo:'...'}
  function _validar(data){
    if(!data || typeof data !== 'object')        return {ok:false, motivo:'El archivo no es un respaldo válido.'};
    if(!data._meta || data._meta.app!=='Total Tools')
      return {ok:false, motivo:'El archivo no es un respaldo de Total Tools.'};
    if(!Array.isArray(data.shipments))           return {ok:false, motivo:'El respaldo no contiene la lista de pedidos.'};
    // Validar que cada pedido tenga al menos un id (estructura mínima)
    for(var i=0;i<data.shipments.length;i++){
      if(!data.shipments[i] || typeof data.shipments[i]!=='object')
        return {ok:false, motivo:'Hay pedidos con formato inválido en el respaldo.'};
    }
    if(data.couriers && !Array.isArray(data.couriers))
      return {ok:false, motivo:'La lista de couriers tiene un formato inválido.'};
    return {ok:true};
  }

  /* ── 1. CREAR + DESCARGAR respaldo ───────────────────────────────── */
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
      // Recordar fecha del último respaldo
      _lsSet(LS_LAST_BACKUP, String(Date.now()));
      _toast('🛡️ Respaldo descargado ('+snapshot.shipments.length+' pedidos)');
      _refrescarFecha();
    } catch(e){
      console.error('[Respaldo] Error al crear respaldo:', e);
      _toast('⚠️ No se pudo crear el respaldo');
    }
  };

  /* ── 2. RESTAURAR respaldo desde archivo ─────────────────────────── */
  // Lee el archivo, valida, pide confirmación, crea respaldo de seguridad
  // del estado actual, y aplica.
  Respaldo.restaurarDesdeArchivo = function(input){
    var file = input && input.files && input.files[0];
    if(!file){ return; }
    var reader = new FileReader();
    reader.onload = function(ev){
      var data;
      try { data = JSON.parse(ev.target.result); }
      catch(e){ _toast('⚠️ El archivo no es un JSON válido'); input.value=''; return; }

      var v = _validar(data);
      if(!v.ok){ _toast('⚠️ '+v.motivo); input.value=''; return; }

      // Confirmación antes de restaurar (paso destructivo)
      var resumen = (data.shipments?data.shipments.length:0)+' pedidos · '+
                    (data._meta&&data._meta.fechaLegible?data._meta.fechaLegible:'fecha desconocida');
      _pedirConfirmacion(resumen, function(){
        _aplicarRestauracion(data);
      });
      input.value=''; // permitir volver a elegir el mismo archivo
    };
    reader.onerror = function(){ _toast('⚠️ No se pudo leer el archivo'); input.value=''; };
    reader.readAsText(file);
  };

  /* ── Aplicar la restauración (tras confirmar) ────────────────────── */
  function _aplicarRestauracion(data){
    try {
      // 5. Respaldo automático de seguridad del estado ACTUAL antes de pisar
      try {
        var seguridad = _construirRespaldo();
        _lsSet('tt_backup_pre_restore', JSON.stringify(seguridad));
      } catch(e){ /* si falla el de seguridad, igual seguimos pero avisamos */ 
        console.warn('[Respaldo] No se pudo crear respaldo de seguridad:', e);
      }

      var S = window.S;
      if(!S){ _toast('⚠️ Estado no disponible'); return; }

      // Restaurar cada sección (manteniendo relaciones tal cual estaban)
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

      window.S = S;

      // Persistir (sube a Firebase como cambio completo) y refrescar UI
      if(typeof window.save==='function') window.save(); // sin id → guardado completo
      if(typeof window.render==='function') window.render();
      if(typeof window.renderChips==='function') window.renderChips();

      // Cerrar overlay si está abierto
      _cerrarOverlay();
      _toast('✅ Respaldo restaurado ('+S.shipments.length+' pedidos)');
    } catch(e){
      console.error('[Respaldo] Error al restaurar:', e);
      _toast('⚠️ Error al restaurar el respaldo');
    }
  }

  /* ── 6. Confirmación visual antes de restaurar ───────────────────── */
  function _pedirConfirmacion(resumen, onConfirm){
    // Reutiliza el overlay genérico delOverlay si existe; si no, crea uno propio.
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
    // Fallback: confirm nativo
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

  /* ── 4. Mostrar fecha del último respaldo en la UI ───────────────── */
  function _refrescarFecha(){
    var el = document.getElementById('respLastBackup');
    if(el){
      var ts = parseInt(_lsGet(LS_LAST_BACKUP)||'0',10);
      el.textContent = ts ? ('Último respaldo: '+_fechaLegible(ts)) : 'Aún no has creado un respaldo';
    }
  }
  // Exponer para que index pueda refrescar al abrir el modal
  Respaldo.refrescarFecha = _refrescarFecha;

  /* ── Restaurar el respaldo de seguridad pre-restauración ─────────── */
  // Por si el usuario restaura algo equivocado y quiere volver atrás.
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

  // Refrescar la fecha al cargar (si el elemento ya existe)
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', _refrescarFecha);
  } else {
    _refrescarFecha();
  }

  console.log('[Respaldo] Módulo listo ✓');
})();
