const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
const $=id=>document.getElementById(id);

function _avisar(nombre, detalle){
  if(!window._pantallaLista){
    (window._avisosPendientes = window._avisosPendientes || []).push([nombre, detalle]);
    return;
  }
  try{ window.dispatchEvent(new CustomEvent(nombre, {detail: detalle})); }catch(_){}
}

let _mem={};
function lsGet(k){try{return localStorage.getItem(k)}catch(e){return _mem[k]||null}}
function lsSet(k,v){try{localStorage.setItem(k,v)}catch(e){_mem[k]=v}}

let S=JSON.parse(lsGet('dpanel')||'{}');
window._copiaEnIdb = !lsGet('dpanel') && lsGet('dpanel_en_idb') === '1';
function _guardarCopiaLocal(){
  const txt = JSON.stringify(window._slimStateForLocal ? window._slimStateForLocal(S) : S);
  try{
    localStorage.setItem('dpanel', txt);
    if(localStorage.getItem('dpanel_en_idb')) localStorage.removeItem('dpanel_en_idb');
  }catch(e){
    try{ localStorage.removeItem('dpanel'); localStorage.setItem('dpanel_en_idb', '1'); }catch(_){}
    _mem.dpanel = undefined;
  }
  if(window.CopiaLocal) window.CopiaLocal.programar();
}
window._guardarCopiaLocal = _guardarCopiaLocal;
window.S = S;

function normPeruPhone(s){
  var raw=String(s==null?'':s);
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
function _sinRepetir(a){ const v=new Set(); return (a||[]).filter(x=>{ if(v.has(x)) return false; v.add(x); return true; }); }
function nombreEtiqueta(t){ return String(t||'').replace(/['"`<>\\]/g,'').replace(/\s+/g,' ').trim().toUpperCase().slice(0,30); }
const SIN_ETIQUETA='__SIN_ETIQUETA__';
function pedidosSinEtiqueta(){ const l=new Set(S.labels); return S.shipments.filter(x=>!l.has(x.status)); }
const customLabels=_sinRepetir(S.labels.filter(l=>!FIXED_LABELS.includes(l)));
S.labels=[...FIXED_LABELS,...customLabels];
const FIXED_COURIERS=['SHALOM','OLVA COURIER','MARVISUR','DINSIDES','DELIVERY','RETIRO EN TIENDA','ENCOMIENDA'];
FIXED_COURIERS.forEach(c=>{ if(!S.couriers.includes(c)) S.couriers.unshift(c); });

let _S_TS = Date.now();
window._S_TS = _S_TS;
let _fbSaveTimer = null;

let _dirtyShips = new Set();
let _dirtySupps = new Set();
let _dirtyAll = false;
let _dirtyConfigOnly = false;

const DIRTY_KEY = 'dpanel_dirty';
let _huboSuciosGuardados = false;
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
  }catch(e){  }
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
  }catch(e){  }
}
_recuperarSucios();

const save = (shipId) => {
  if(Array.isArray(shipId) && !shipId.length) return;
  _S_TS = Date.now();
  window._S_TS = _S_TS;
  window.S = S;
  if(Array.isArray(shipId)){
    shipId.forEach(id => { if(id) _dirtyShips.add(id); });
    _dirtyConfigOnly = false;
  } else if(shipId === 'config'){
    _dirtyConfigOnly = true;
  } else if(typeof shipId === 'string' && shipId.indexOf('supp:') === 0){
    _dirtySupps.add(shipId.slice(5));
    _dirtyConfigOnly = false;
  } else if(shipId){
    _dirtyShips.add(shipId);
    _dirtyConfigOnly = false;
  } else {
    _dirtyAll = true;
    _dirtyConfigOnly = false;
  }
  _guardarCopiaLocal();
  _guardarSucios();
  clearTimeout(_fbSaveTimer);
  _fbSaveTimer = setTimeout(() => { _fbSaveWithRetry(S, 0); }, 800);
};
window.save = save;

async function _fbSaveWithRetry(data, attempt){
  if(!window._fbSave) return;
  if(!window._nubeLista){
    lsSet('dpanel_pending', '1');
    return;
  }
  try {
    await window._fbSave(data);
    lsSet('dpanel_pending', '0');
    window._fbStatus && window._fbStatus('ok');
  } catch(e) {
    if(e && e.bloqueadoPorDefecto){
      lsSet('dpanel_pending', '1');
      window._fbStatus && window._fbStatus('err');
      _avisar('tt:aviso', '⛔ No se guardó: el panel tiene los datos vacíos. Recarga la página.');
      console.error('[guarda] escritura bloqueada: la memoria tiene los ' +
        'valores por defecto y la nube un negocio real');
      return;
    }
    if(e && e.http === 403){
      lsSet('dpanel_pending', '1');
      window._fbStatus && window._fbStatus('err');
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
      lsSet('dpanel_pending', '1');
      window._fbStatus && window._fbStatus('err');
      console.warn('Firebase save failed after 3 attempts, will retry on reconnect');
    }
  }
}

window._fbStatus = (status) => {
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

window._mergeRemote = (remote) => {
  window._nubeLista = true;
  if(remote && remote.config && remote.config.name){
    window._nubeNombre = String(remote.config.name);
  }
  if(window._isSaving) return;
  if(remote.shipments) {
    remote.shipments = remote.shipments.map(rs => {
      const local = S.shipments.find(ls => ls.id === rs.id);
      if(local) {
        if(typeof _dirtyShips !== 'undefined' && _dirtyShips.has(rs.id)){
          return local;
        }
        if(rs.docGuia && rs.docGuia.d === '[img]' && local.docGuia) rs.docGuia = local.docGuia;
        if(rs.docEmbalado && rs.docEmbalado.d === '[img]' && local.docEmbalado) rs.docEmbalado = local.docEmbalado;
        if(rs.docTicket && rs.docTicket.d === '[img]' && local.docTicket) rs.docTicket = local.docTicket;
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
      if(typeof _dirtySupps !== 'undefined' && _dirtySupps.has(rs.id) && local) return local;
      if(local && rs.cotiz && rs.cotiz.d === '[img]' && local.cotiz) rs.cotiz = local.cotiz;
      return rs;
    });
  }
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
  const _cfgMia = window._cfgProy ? window._cfgProy(S) : null;
  const _cfgPend = !!(window._cfgBase && _cfgMia && window.MezclaConfig &&
                      MezclaConfig.distintas(_cfgMia, window._cfgBase).length);
  const _cfgBaseVieja = window._cfgBase;

  Object.keys(remote).forEach(k => { S[k] = remote[k]; });

  const _ALIASES=['Nuevo pedido','En proceso','Por alistar','Alistado','Enviado','Llegó a destino','Pendiente de pago','Finalizado','PENDIENTE','ENTREGADO'];
  const _customClean=_sinRepetir((S.labels||[]).filter(l=>!FIXED_LABELS.includes(l)&&!_ALIASES.includes(l)));
  S.labels=[...FIXED_LABELS,..._customClean];

  if(window._cfgProy){
    const _vista = {};
    Object.keys(_cfgMia || {}).forEach(k => { if(k in remote) _vista[k] = S[k]; });
    if('labels' in remote) _vista.labels = S.labels;
    window._cfgBase = window._cfgProy(_vista);
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

  const _STATUS_MAP={'Nuevo pedido':'NUEVO PEDIDO','En proceso':'EN PROCESO','Por alistar':'POR ALISTAR','Alistado':'ALISTADO','Enviado':'ENVIADO','Llegó a destino':'LLEGÓ A DESTINO','Pendiente de pago':'PENDIENTE DE PAGO','Finalizado':'FINALIZADO','EN_DESTINO':'LLEGÓ A DESTINO'};
  if(S.shipments){
    S.shipments=S.shipments.map(s=>({...s,status:_STATUS_MAP[s.status]||s.status}));
  }

  if(remote && remote.ts){
    window._S_TS = remote.ts;
    _S_TS = remote.ts;
  }

  if(window.Seleccion) Seleccion._olvidarHeredado();
  _guardarCopiaLocal();
  _avisar('tt:nube-sincronizada');
};

const _initFirebase = async (intento) => {
  intento = intento || 0;
  const indicator = document.getElementById('fbDot');
  if(indicator) indicator.style.display = 'block';
  try {
    const remote = await window._fbLoad();
    if(remote && Object.keys(remote).length > 0){
      window._mergeRemote(remote);
      if(lsGet('dpanel_pending')==='1' || _huboSuciosGuardados) _fbSaveWithRetry(S, 0);
    } else {
      window._nubeLista = true;
      _avisar('tt:nube-lista');
      const tieneLocal = S.shipments.length > 0 || S.suppliers.length > 0 ||
                         (S.config && S.config.name && S.config.name !== 'Mi Negocio');
      if(tieneLocal){ _dirtyAll = true; _fbSaveWithRetry(S, 0); }
    }
  } catch(e) {
    console.warn('Firebase init error (intento '+intento+'):', e);
    if(e && e.http === 403){
      const habiaSesion = !!(window._authHaySesion && window._authHaySesion());
      if(habiaSesion){
        const correo = (window._authCorreo && window._authCorreo()) || '';
        if(window._authSinAcceso) window._authSinAcceso(correo);
        else if(window._authExpulsar) window._authExpulsar('Tu sesión venció. Ingresa de nuevo.');
      }
      return;
    }
    if(intento < 4){
      const delay = [2000, 5000, 10000, 20000][intento];
      setTimeout(() => _initFirebase(intento+1), delay);
      return;
    }
    _avisar('tt:aviso', '⚠️ Sin conexión a Firebase. Reintentando en segundo plano.');
  }
  if(window._fbListen) window._fbListen();
};

window._trasEntrar = function(){
  if(!window._nubeLista) _initFirebase(0);
};

