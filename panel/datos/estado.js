/**
 * panel/datos/estado.js — estado, guardado, sucios, mezcla con la nube y arranque
 * =========================================================================
 * Fase 3 (10/11/2026): el panel en módulos. Antes vivía en index.html.
 * Script CLÁSICO a propósito: sus funciones y variables son globales, igual
 * que cuando estaban en un solo archivo — moverlas no cambió ni una llamada.
 * El orden de los <script> en index.html es el orden de ejecución.
 */
const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
const $=id=>document.getElementById(id);

/* ★ DATOS AVISA, PANTALLA PINTA (Fase 7, 11/11/2026). Este módulo es
   estado y sincronización: no pinta ni muestra mensajes. Cuando pasa algo,
   AVISA con un evento y pantalla/inicio.js hace lo de siempre (repintar,
   mostrar el aviso). dispatchEvent es inmediato: el orden de lo que se ve no
   cambia. Si algo se avisa antes de que la pantalla esté escuchando, queda
   en cola y se entrega en cuanto escucha — no se pierde ningún aviso. */
function _avisar(nombre, detalle){
  if(!window._pantallaLista){
    (window._avisosPendientes = window._avisosPendientes || []).push([nombre, detalle]);
    return;
  }
  try{ window.dispatchEvent(new CustomEvent(nombre, {detail: detalle})); }catch(_){}
}

/* STATE */
let _mem={};
function lsGet(k){try{return localStorage.getItem(k)}catch(e){return _mem[k]||null}}
function lsSet(k,v){try{localStorage.setItem(k,v)}catch(e){_mem[k]=v}}

let S=JSON.parse(lsGet('dpanel')||'{}');
/* ★ LA COPIA LOCAL (Fase 8). Si localStorage se llenó, la copia vive en
   IndexedDB (panel/datos/copia-local.js) y se lee al arrancar, antes de
   pedir a la nube (pantalla/inicio.js). */
window._copiaEnIdb = !lsGet('dpanel') && lsGet('dpanel_en_idb') === '1';
/** Guarda la copia local: localStorage mientras quepa, y siempre IndexedDB.
 *  Una sola puerta para las tres escrituras que había sueltas. */
function _guardarCopiaLocal(){
  const txt = JSON.stringify(window._slimStateForLocal ? window._slimStateForLocal(S) : S);
  try{
    localStorage.setItem('dpanel', txt);
    if(localStorage.getItem('dpanel_en_idb')) localStorage.removeItem('dpanel_en_idb');
  }catch(e){
    /* Lleno: antes esto caía en memoria y al recargar no había copia (el
       panel bajaba TODO). Ahora se libera localStorage para lo pequeño y la
       copia queda en IndexedDB. */
    try{ localStorage.removeItem('dpanel'); localStorage.setItem('dpanel_en_idb', '1'); }catch(_){}
    _mem.dpanel = undefined;
  }
  if(window.CopiaLocal) window.CopiaLocal.programar();
}
window._guardarCopiaLocal = _guardarCopiaLocal;
window.S = S; // ★ Exponer S globalmente para tracking.js

// ── Normalización de teléfono (una sola regla, reutilizada en todos los campos)
// Borra lo que no sea dígito, quita el prefijo Perú (+51) si sobra y corta a 9.
// Es la MISMA regla que ya funcionaba en el link personalizado; ahora vive en un
// solo lugar. Se aplica por DELEGACIÓN: cualquier input con clase "phone-norm"
// (estático o creado dinámicamente, como el del motorizado) se limpia solo, sin
// cablear cada campo. Los valores de cada campo siguen 100% independientes.
function normPeruPhone(s){
  var raw=String(s==null?'':s);
  // Usuario de WhatsApp (@nombre): se deja pasar, recortando solo lo que
  // WhatsApp no admite. Sin esta guarda, el replace de abajo borraba la arroba
  // en cada tecla y el campo era imposible de llenar.
  // Se guarda en minúsculas a propósito: así el buscador del panel (que compara
  // en minúsculas) y el escaneo del QR encuentran el pedido sin código extra.
  if(raw.trim().charAt(0)==='@'){
    return '@'+raw.trim().slice(1).replace(/[^A-Za-z0-9._]/g,'').toLowerCase().slice(0,35);
  }
  var v=raw.replace(/\D/g,'');
  if(v.startsWith('51')&&v.length>9) v=v.slice(2);
  return v.slice(0,9);
}
window.normPeruPhone=normPeruPhone;
(function(){
  function _norm(el){ if(el && el.classList && el.classList.contains('phone-norm')) el.value=normPeruPhone(el.value); }
  // captura: corre ANTES del oninput inline del campo, así quien lea this.value
  // (ej. onPhoneInput) recibe el valor ya limpio.
  document.addEventListener('input', function(e){ _norm(e.target); }, true);
  document.addEventListener('paste', function(e){ var el=e.target; if(el&&el.classList&&el.classList.contains('phone-norm')) setTimeout(function(){ _norm(el); },0); }, true);
})();

if(!S.shipments)    S.shipments=[];
if(!S.couriers)     S.couriers=[];
if(!S.extraFields)  S.extraFields=[];
if(!S.labels)       S.labels=[];
if(!S.msgTemplates) S.msgTemplates={};
if(!S.courierActive) S.courierActive={};
if(!S.suppliers)    S.suppliers=[];
if(!S.trash)        S.trash=[];
if(!S.statusPin)    S.statusPin='1234';
if(!S.dispatch)     S.dispatch={days:[1,2,3,4,5],cutHour:'11:30',anticipation:0};
if(!S.config)       S.config={name:'Mi Negocio',phone:'999000000',city:'Lima, Perú'};
const FIXED_LABELS=['NUEVO PEDIDO','EN PROCESO','POR ALISTAR','ALISTADO','ENVIADO','LLEGÓ A DESTINO','PENDIENTE DE PAGO','FINALIZADO'];
const FIXED_LABEL_ICONS={'NUEVO PEDIDO':'🆕','EN PROCESO':'⚠️','POR ALISTAR':'📦','ALISTADO':'✅','ENVIADO':'🚚','LLEGÓ A DESTINO':'📍','PENDIENTE DE PAGO':'💰','FINALIZADO':'🏁'};
const LABEL_ALIASES=['Nuevo pedido','En proceso','Por alistar','Alistado','Enviado','Llegó a destino','Pendiente de pago','Finalizado','PENDIENTE','ENTREGADO','EN_DESTINO'];
S.labels = S.labels.filter(l => !LABEL_ALIASES.includes(l));
FIXED_LABELS.forEach(l=>{ if(!S.labels.includes(l)) S.labels.push(l); });
/* ★ Sin repetidos: dos «AVISAR CUANDO LLEGUE» compartían mensajes y
   filtro, y no había forma de saber cuál era cuál. */
function _sinRepetir(a){ const v=new Set(); return (a||[]).filter(x=>{ if(v.has(x)) return false; v.add(x); return true; }); }
/* El nombre de una etiqueta va dentro de botones (onclick='…'): sin
   comillas, < > ni barras, en mayúsculas y sin espacios de sobra. */
function nombreEtiqueta(t){ return String(t||'').replace(/['"`<>\\]/g,'').replace(/\s+/g,' ').trim().toUpperCase().slice(0,30); }
/* Filtro de los pedidos cuya etiqueta se borró (o que vienen con un estado
   que ya no existe). Un valor que ninguna etiqueta puede tener. */
const SIN_ETIQUETA='__SIN_ETIQUETA__';
function pedidosSinEtiqueta(){ const l=new Set(S.labels); return S.shipments.filter(x=>!l.has(x.status)); }
const customLabels=_sinRepetir(S.labels.filter(l=>!FIXED_LABELS.includes(l)));
S.labels=[...FIXED_LABELS,...customLabels];
const FIXED_COURIERS=['SHALOM','OLVA COURIER','MARVISUR','DINSIDES','DELIVERY','RETIRO EN TIENDA','ENCOMIENDA'];
FIXED_COURIERS.forEach(c=>{ if(!S.couriers.includes(c)) S.couriers.unshift(c); });

// ── FIREBASE SAVE/LOAD ────────────────────────────────────────────────
let _S_TS = Date.now();
window._S_TS = _S_TS;
let _fbSaveTimer = null;

// ★ Guardado incremental: registro de pedidos modificados ("sucios").
// save(id) marca solo ese pedido para subir. save() sin id = subir todo (seguro).
let _dirtyShips = new Set();
let _dirtySupps = new Set();   // proveedores modificados: save('supp:'+id) marca solo ese
/* ★ Arranca en FALSE, no en true.
   Arrancar en true significaba "no sé qué quedó pendiente, sube los 971". Eso
   tenía sentido cuando nadie anotaba qué había quedado sin subir; ahora
   `dpanel_dirty` lo dice con nombre y apellido, y dejarlo en true convertía
   cada arranque con algo pendiente en una subida completa.
   Los dos sitios que de verdad necesitan subirlo todo lo encienden a
   propósito: `save()` sin argumento (importar Excel, restaurar respaldo) y el
   primer arranque real con la nube vacía. */
let _dirtyAll = false;
let _dirtyConfigOnly = false; // true = subir SOLO config (toggles de Config)

/* ★ LOS SUCIOS SOBREVIVEN AL CIERRE DE LA PESTAÑA
   Sin esto había una pérdida silenciosa: cambias algo → la subida falla los 4
   intentos → cierras la pestaña. Al volver, _dirtyShips está vacío (vive en
   memoria), así que _mergeRemote deja mandar a la nube y tu cambio desaparece
   sin dejar rastro — ni aviso, ni forma de recuperarlo.
   Guardando qué quedó sucio, _mergeRemote reconoce esos pedidos al arrancar y
   conserva la versión local hasta que suba de verdad. */
const DIRTY_KEY = 'dpanel_dirty';
let _huboSuciosGuardados = false; // ¿la sesión anterior dejó algo sin subir?
function _guardarSucios(){
  try{
    if(_dirtyAll || _dirtyShips.size || _dirtySupps.size){
      lsSet(DIRTY_KEY, JSON.stringify({
        all: _dirtyAll,
        s: Array.from(_dirtyShips),
        p: Array.from(_dirtySupps)
      }));
    } else {
      lsSet(DIRTY_KEY, '');
    }
  }catch(e){ /* localStorage lleno o bloqueado: no vale romper el guardado */ }
}
function _recuperarSucios(){
  try{
    const raw = lsGet(DIRTY_KEY);
    if(!raw) return;
    const o = JSON.parse(raw);
    (o.s||[]).forEach(id => _dirtyShips.add(id));
    (o.p||[]).forEach(id => _dirtySupps.add(id));
    if(o.all) _dirtyAll = true;
    _huboSuciosGuardados = !!(o.all || (o.s||[]).length || (o.p||[]).length);
  }catch(e){ /* dato corrupto: se ignora, _dirtyAll ya cubre el caso */ }
}
_recuperarSucios();

const save = (shipId) => {
  // Lista vacía = no cambió nada. Sin esta guarda caería en "sin id" y subiría
  // los ~700 pedidos por gusto.
  if(Array.isArray(shipId) && !shipId.length) return;
  _S_TS = Date.now();
  window._S_TS = _S_TS;
  window.S = S;
  // Marcar qué cambió
  if(Array.isArray(shipId)){
    // ★ Varios pedidos de una vez (imprimir un lote, ciclo de auto-tracking).
    // Marca todos y serializa UNA sola vez: llamar save(id) en un bucle de 700
    // congela el panel 7,6 s porque cada llamada reescribe el estado completo.
    shipId.forEach(id => { if(id) _dirtyShips.add(id); });
    _dirtyConfigOnly = false;
  } else if(shipId === 'config'){
    // ★ Solo config cambió (toggles de Config: días, couriers, etc.).
    // No marca ningún pedido: si no hay otros pedidos sucios pendientes,
    // _fbSave subirá únicamente el documento config (no los 180 pedidos).
    _dirtyConfigOnly = true;
  } else if(typeof shipId === 'string' && shipId.indexOf('supp:') === 0){
    // ★ Proveedor específico: sube solo ese proveedor + config, no los 170 pedidos.
    _dirtySupps.add(shipId.slice(5));
    _dirtyConfigOnly = false;
  } else if(shipId){
    _dirtyShips.add(shipId);
    _dirtyConfigOnly = false; // hay un pedido real → no es solo-config
  } else {
    _dirtyAll = true; // sin id → cambio de config/suppliers/masivo → subir todo
    _dirtyConfigOnly = false;
  }
  _guardarCopiaLocal(); // ★ Mejora 3: local sin base64 pesadas · Fase 8: + IndexedDB
  _guardarSucios(); // qué quedó sin subir viaja con el respaldo, no solo en memoria
  clearTimeout(_fbSaveTimer);
  _fbSaveTimer = setTimeout(() => { _fbSaveWithRetry(S, 0); }, 800);
};
// ★ save() se declara con const, y un const de nivel superior NO se cuelga de
// window (a diferencia de las function). Los módulos que hacían
// `typeof window.save === 'function'` veían undefined y NO GUARDABAN NADA:
// print.js, notify.js, respaldo.js (¡restaurar un respaldo no persistía!) y el
// ciclo de auto-tracking. Una línea los revive a los cuatro.
window.save = save;

// Guardar con hasta 3 reintentos ante fallos de red
async function _fbSaveWithRetry(data, attempt){
  if(!window._fbSave) return;
  /* ★ CAPA 1 · NADA SUBE ANTES DE QUE LA NUBE CONTESTE.
     `_fbSave` reescribe el documento de configuración ENTERO en CADA
     guardado —editar un pedido, imprimir, el seguimiento automático—, no
     solo al tocar Config. En un navegador sin datos locales la memoria
     arranca con los valores por defecto, y cualquier guardado en el segundo
     que tarda la nube en contestar borraba etiquetas, recursos, la cuenta de
     Shalom y la agencia de origen. El 21/10/2026 faltó un pelo.

     No se pierde nada por esperar: lo marcado como sucio sigue marcado,
     `_mergeRemote` rescata los pedidos sucios al llegar la nube, y esta
     bandera de pendiente hace que `_initFirebase` lo suba justo después.
     Se APLAZA, no se tira. */
  if(!window._nubeLista){
    lsSet('dpanel_pending', '1');
    return;
  }
  try {
    await window._fbSave(data);
    lsSet('dpanel_pending', '0'); // sync exitoso
    // Repintar: el aviso de pendiente se lee de localStorage, y _fbSave ya
    // había pintado 'ok' ANTES de que esta línea limpiara la bandera.
    window._fbStatus && window._fbStatus('ok');
  } catch(e) {
    /* La capa 3 negó la escritura. Reintentar no sirve —la memoria sigue
       teniendo los valores por defecto— y decir «guardado» sería mentir. */
    if(e && e.bloqueadoPorDefecto){
      lsSet('dpanel_pending', '1');
      window._fbStatus && window._fbStatus('err');
      _avisar('tt:aviso', '⛔ No se guardó: el panel tiene los datos vacíos. Recarga la página.');
      console.error('[guarda] escritura bloqueada: la memoria tiene los ' +
        'valores por defecto y la nube un negocio real');
      return;
    }
    // Un 403 al guardar es la misma sesión vencida: se marca pendiente (lo que
    // no subió sobrevive) y se pide entrar de nuevo, en vez de gastar cuatro
    // intentos que van a fallar igual.
    if(e && e.http === 403){
      lsSet('dpanel_pending', '1');
      window._fbStatus && window._fbStatus('err');
      // Misma regla que arriba: sin sesión previa no hay a quién expulsar.
      const habiaSesion = !!(window._authHaySesion && window._authHaySesion());
      if(habiaSesion && window._authExpulsar){
        window._authExpulsar('Tu sesión venció. Ingresa de nuevo — tus cambios están guardados aquí y se subirán al entrar.');
      }
      return;
    }
    if(attempt < 3){
      const delay = [3000, 8000, 20000][attempt];
      setTimeout(() => _fbSaveWithRetry(data, attempt+1), delay);
    } else {
      /* ★ Agotados los intentos: marcar pendiente DE VERDAD.
         Esta bandera se leía en dos sitios pero NADIE la ponía nunca en '1'.
         Consecuencia: el aviso "⚠️ Datos pendientes de sincronizar" no
         aparecía jamás, y la resubida al reconectar —que ya estaba escrita en
         _initFirebase— no llegaba a dispararse nunca. El comentario decía
         "se subirá cuando vuelva la conexión" y no era cierto. */
      lsSet('dpanel_pending', '1');
      window._fbStatus && window._fbStatus('err');
      console.warn('Firebase save failed after 3 attempts, will retry on reconnect');
    }
  }
}

// Sin modo offline — requiere conexión

// Firebase status indicator in header
window._fbStatus = (status) => {
  // Mostrar indicador de pendiente si hay datos sin sincronizar
  const pendEl = document.getElementById('pendingDot');
  if(pendEl){
    const isPending = lsGet('dpanel_pending') === '1';
    pendEl.style.display = (status==='err' || isPending) ? 'inline' : 'none';
    pendEl.title = isPending ? '⚠️ Datos pendientes de sincronizar' : '';
  }
  const el = document.getElementById('fbDot');
  if(!el) return;
  el.setAttribute('data-ready','1');
  el.style.animation = 'none';
  if(status === 'ok') {
    el.style.background = 'var(--green)';
    el.title = 'Sincronizado con Firebase ☁️';
  } else {
    el.style.background = 'var(--red)';
    el.title = 'Error de sincronización ⚠️';
  }
};

// Merge remote state preserving local images
window._mergeRemote = (remote) => {
  /* ★ LA NUBE CONTESTÓ CON DATOS. Se marca aquí y no en `_initFirebase`
     porque este es el ÚNICO sitio por el que entran datos de la nube: la
     carga inicial, el latido de 5 s y la recarga tras registrar. Si la
     primera carga falla y el latido la recupera minutos después, también
     cuenta — y así nada se queda bloqueado para siempre.
     Y se apunta el nombre del negocio que trae la nube: es la referencia de
     la capa 3. */
  window._nubeLista = true;
  if(remote && remote.config && remote.config.name){
    window._nubeNombre = String(remote.config.name);
  }
  // No mergear si hay un guardado en curso - evita race condition
  if(window._isSaving) return;
  // Preserve base64 images from local state
  if(remote.shipments) {
    remote.shipments = remote.shipments.map(rs => {
      const local = S.shipments.find(ls => ls.id === rs.id);
      if(local) {
        // ★ FIX preciso: si ESTE pedido tiene un cambio local específico aún sin
        // subir (está en _dirtyShips), conservamos la versión local para que el
        // latido no lo pise antes de que suba. NO usamos _dirtyAll (sería muy
        // amplio: bloquearía los cambios legítimos de otros dispositivos).
        if(typeof _dirtyShips !== 'undefined' && _dirtyShips.has(rs.id)){
          return local;
        }
        // Preservar imágenes base64 que no se guardan en Firebase
        if(rs.docGuia && rs.docGuia.d === '[img]' && local.docGuia) rs.docGuia = local.docGuia;
        if(rs.docEmbalado && rs.docEmbalado.d === '[img]' && local.docEmbalado) rs.docEmbalado = local.docEmbalado;
        if(rs.docTicket && rs.docTicket.d === '[img]' && local.docTicket) rs.docTicket = local.docTicket;
        // Preservar campos de tracking/guía Shalom si Firebase trae versión sin ellos
        // ⚠️ shalomEstado/shalomMonto/shalomRegistradoEn faltaban en esta lista
        // desde que se lanzo el registro: una copia vieja de la nube podia
        // borrarlos. Esta lista solo CONSERVA, nunca pisa, asi que anadirlos
        // no puede romper nada — y sin shalomRegistradoEn no hay cuenta atras.
        ['trackingOrderNumber','trackingOrderCode','shalomGuia','shalomCodigo',
         'shalomEstado','shalomMonto','shalomRegistradoEn',
         'trackingStatus','trackingMessage','trackingLastUpdate','trackingLastAutoCheck',
         'trackingHistory','trackingHistorialShalom','trackingOrigen','trackingDestino'].forEach(k=>{
          if(local[k]!==undefined && !rs[k]) rs[k]=local[k];
        });
      }
      return rs;
    });
  }
  if(remote.suppliers) {
    remote.suppliers = remote.suppliers.map(rs => {
      const local = (S.suppliers||[]).find(ls => ls.id === rs.id);
      // Si este proveedor tiene un cambio local aún sin subir, conservar la versión local.
      if(typeof _dirtySupps !== 'undefined' && _dirtySupps.has(rs.id) && local) return local;
      if(local && rs.cotiz && rs.cotiz.d === '[img]' && local.cotiz) rs.cotiz = local.cotiz;
      return rs;
    });
  }
  /* ★ LOS PEDIDOS QUE SOLO EXISTEN AQUÍ
     La línea de abajo reemplaza S ENTERO con lo que trae la nube. Un pedido
     creado en este dispositivo que todavía no llegó a subir NO viene en
     `remote`, así que desaparecía: de la pantalla y del respaldo local, sin
     aviso y sin forma de recuperarlo. No hacía falta cerrar la pestaña —
     bastaba con que la subida fallara y llegara el latido de los 5 s.

     Se rescatan SOLO los que están marcados como sucios. Ese filtro es lo que
     impide resucitar lo que otro dispositivo borró a propósito: si un pedido
     no está marcado, es que aquí no hay nada pendiente sobre él y su ausencia
     en la nube es la verdad, no una pérdida. */
  if(remote.shipments && typeof _dirtyShips !== 'undefined'){
    const enNube = new Set(remote.shipments.map(r => r && r.id));
    (S.shipments || []).forEach(l => {
      if(l && l.id && _dirtyShips.has(l.id) && !enNube.has(l.id)) remote.shipments.push(l);
    });
  }
  if(remote.suppliers && typeof _dirtySupps !== 'undefined'){
    const enNubeP = new Set(remote.suppliers.map(r => r && r.id));
    (S.suppliers || []).forEach(l => {
      if(l && l.id && _dirtySupps.has(l.id) && !enNubeP.has(l.id)) remote.suppliers.push(l);
    });
  }
  /* ★ Un cambio de configuración hecho AQUÍ que aún no subió (la base dice
     una cosa y la memoria otra) no se tira: se mezcla con lo que trae la
     nube, igual que al guardar. Sin esto, el latido lo borraba antes de
     que llegara a subir. */
  const _cfgMia = window._cfgProy ? window._cfgProy(S) : null;
  const _cfgPend = !!(window._cfgBase && _cfgMia && window.MezclaConfig &&
                      MezclaConfig.distintas(_cfgMia, window._cfgBase).length);
  const _cfgBaseVieja = window._cfgBase;

  // Full replace — not just assign — so arrays like labels/couriers sync correctly
  Object.keys(remote).forEach(k => { S[k] = remote[k]; });

  // ★ Limpiar etiquetas alias que puedan venir de Firebase
  const _ALIASES=['Nuevo pedido','En proceso','Por alistar','Alistado','Enviado','Llegó a destino','Pendiente de pago','Finalizado','PENDIENTE','ENTREGADO'];
  const _customClean=_sinRepetir((S.labels||[]).filter(l=>!FIXED_LABELS.includes(l)&&!_ALIASES.includes(l)));
  S.labels=[...FIXED_LABELS,..._customClean];

  /* La nueva base: lo que la nube tiene AHORA, ya limpio como lo ve el
     panel. Una clave que la nube aún no tiene cuenta como vacía, para que
     lo de aquí suba la primera vez. */
  if(window._cfgProy){
    const _vista = {};
    Object.keys(_cfgMia || {}).forEach(k => { if(k in remote) _vista[k] = S[k]; });
    if('labels' in remote) _vista.labels = S.labels;
    window._cfgBase = window._cfgProy(_vista);
    /* ★ ETIQUETAS REPETIDAS EN LA NUBE (11/11/2026). Aquí se muestran sin
       repetir, pero la copia guardada seguía con la «AVISAR CUANDO LLEGUE»
       doble para siempre: la base decía «limpio» y nada la reescribía. Si
       la nube trae repetidas (o alias viejos), la base toma lo que la nube
       tiene DE VERDAD y se guarda una vez: la mezcla sube la lista limpia.
       Al quedar limpia, la próxima carga ya no lo dispara. */
    const _crudas = Array.isArray(remote.labels) ? remote.labels : null;
    if(_crudas && (_crudas.length !== new Set(_crudas).size ||
                   _crudas.some(l => _ALIASES.includes(l)))){
      window._cfgBase.labels = JSON.parse(JSON.stringify(_crudas));
      setTimeout(() => { if(window._nubeLista) save('config'); }, 0);
    }
    if(_cfgPend){
      const m = MezclaConfig.mezclar(_cfgBaseVieja, _cfgMia, window._cfgBase);
      Object.keys(m).forEach(k => { S[k] = m[k]; });
    }
  }

  // ★ Normalizar status de pedidos con nombres viejos
  const _STATUS_MAP={'Nuevo pedido':'NUEVO PEDIDO','En proceso':'EN PROCESO','Por alistar':'POR ALISTAR','Alistado':'ALISTADO','Enviado':'ENVIADO','Llegó a destino':'LLEGÓ A DESTINO','Pendiente de pago':'PENDIENTE DE PAGO','Finalizado':'FINALIZADO','EN_DESTINO':'LLEGÓ A DESTINO'};
  if(S.shipments){
    S.shipments=S.shipments.map(s=>({...s,status:_STATUS_MAP[s.status]||s.status}));
  }

  // ★ FIX lecturas: sincronizar _S_TS con el ts de los datos recién cargados.
  // Sin esto, el listener cree que SIEMPRE hay cambios nuevos y recarga los
  // ~170 pedidos cada 5s en bucle (causaba millones de lecturas/mes).
  if(remote && remote.ts){
    window._S_TS = remote.ts;
    _S_TS = remote.ts;
  }

  // Los pedidos que vienen de Firestore pueden traer `sel` guardado de cuando
  // la selección vivía dentro del pedido. Se suelta acá, ANTES de guardar en
  // local, para que no se cuele de vuelta por la puerta de atrás. La selección
  // de ESTE dispositivo (seleccion.js) no se toca: el latido de otro
  // dispositivo ya no puede desmarcarte nada.
  if(window.Seleccion) Seleccion._olvidarHeredado();
  _guardarCopiaLocal(); // ★ Mejora 3: local sin base64 pesadas · Fase 8: + IndexedDB
  // El nombre y el teléfono del negocio también vienen de la nube: sin esto se
  // quedaban en los valores por defecto hasta la siguiente recarga.
  // La pantalla repinta encabezado, lista y chips, libera Config/Recursos
  // y dice «☁️ Datos sincronizados» (pantalla/inicio.js).
  _avisar('tt:nube-sincronizada');
};

// On Firebase ready: load remote data if available
const _initFirebase = async (intento) => {
  intento = intento || 0;
  const indicator = document.getElementById('fbDot');
  if(indicator) indicator.style.display = 'block';
  try {
    const remote = await window._fbLoad();
    if(remote && Object.keys(remote).length > 0){
      // Firebase tiene datos → Firebase manda
      window._mergeRemote(remote);
      /* ★ Subir lo que quedó pendiente, ahora que hay conexión confirmada.
         Antes solo miraba `dpanel_pending`, que se enciende al agotar los
         reintentos — o sea, nunca cuando la pestaña se cierra de golpe. Con
         `dpanel_dirty` sabemos qué quedó sin subir aunque el navegador se
         cerrara a media escritura, y RECONOCERLO no bastaba: había que
         subirlo. `_dirtyAll` sigue en false, así que sube exactamente esos y
         no los 971. */
      if(lsGet('dpanel_pending')==='1' || _huboSuciosGuardados) _fbSaveWithRetry(S, 0);
    } else {
      // remote === null SOLO cuando Firebase confirmó (respuestas OK) que está vacío.
      // Solo en ese caso es seguro subir lo local (primer arranque real).
      /* La nube CONFIRMÓ que está vacía: eso también es una respuesta, y la
         única en la que subir lo local es correcto. */
      window._nubeLista = true;
      _avisar('tt:nube-lista');
      const tieneLocal = S.shipments.length > 0 || S.suppliers.length > 0 ||
                         (S.config && S.config.name && S.config.name !== 'Mi Negocio');
      // Primer arranque real: la nube está vacía y todo lo local es nuevo para
      // ella. Este es uno de los dos sitios que encienden _dirtyAll a mano.
      if(tieneLocal){ _dirtyAll = true; _fbSaveWithRetry(S, 0); }
    }
  } catch(e) {
    // ★ La carga FALLÓ (no es "vacío"). NO tocar la nube: jamás subir local aquí.
    console.warn('Firebase init error (intento '+intento+'):', e);
    /* ★ 403 = PERMISSION_DENIED. No es la red: es que esta sesión ya no tiene
       permiso, casi siempre porque venció (auth.js corta a las 12 h). El
       control de vencimiento solo corría AL CARGAR la página, así que si la
       sesión moría con el panel abierto nadie se enteraba: salía "Sin conexión
       a Firebase" y a revisar el internet.
       Reintentar un 403 cuatro veces no lo arregla — solo llena la consola. */
    if(e && e.http === 403){
      /* ⚠️ Un 403 significa "tu sesión venció" SOLO SI HABÍA UNA SESIÓN.
         Sin token guardado, el 403 es el estado NORMAL de quien todavía no ha
         entrado — esta carga corre en paralelo con la pantalla de login.
         Tratarlo como expulsión borraba la sesión y dibujaba una SEGUNDA
         pantalla de login encima; al entrar se quitaba una y el usuario
         seguía mirando la otra, tecleando su contraseña sin entender nada. */
      const habiaSesion = !!(window._authHaySesion && window._authHaySesion());
      if(habiaSesion){
        /* Había sesión y aun así Firestore dice que no. Son dos cosas
           distintas —venció, o esta cuenta no está autorizada— y desde el 403
           no se pueden separar. Antes se afirmaba "venció", y a quien entraba
           con la cuenta equivocada lo mandaba a un bucle: entra, se le dice
           que venció, vuelve a entrar, y otra vez.
           Ahora se dice lo que SÍ se sabe: con qué correo entró. */
        const correo = (window._authCorreo && window._authCorreo()) || '';
        if(window._authSinAcceso) window._authSinAcceso(correo);
        else if(window._authExpulsar) window._authExpulsar('Tu sesión venció. Ingresa de nuevo.');
      }
      return; // en los dos casos: reintentar un 403 no lo arregla
    }
    if(intento < 4){
      // Reintentar la carga; no nos quedamos con local viejo en pantalla sin avisar
      const delay = [2000, 5000, 10000, 20000][intento];
      setTimeout(() => _initFirebase(intento+1), delay);
      return; // no arrancar el listener todavía; lo hará el reintento exitoso
    }
    _avisar('tt:aviso', '⚠️ Sin conexión a Firebase. Reintentando en segundo plano.');
  }
  if(window._fbListen) window._fbListen();
};

/* ★ AL ENTRAR, CARGAR. La carga inicial corre en paralelo con la pantalla
   de login: sin sesión falla, reintenta cuatro veces (unos 37 s) y se rinde.
   Quien tardaba más que eso en entrar se quedaba sin datos de la nube hasta
   recargar la página — y con la guarda de la configuración, con Config
   bloqueado. auth.js llama a esto al entrar con éxito. */
window._trasEntrar = function(){
  if(!window._nubeLista) _initFirebase(0);
};

// ─────────────────────────────────────────────────────────────────────
