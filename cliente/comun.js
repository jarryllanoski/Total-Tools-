'use strict';

const FORM_API = 'https://us-central1-total-tools-24ce8.cloudfunctions.net/formApi';

const CON_APPCHECK = {reniec: true};

async function _api(action, params, opts){
  let url = FORM_API + '?action=' + encodeURIComponent(action);
  if(params){ for(const k in params){ url += '&' + k + '=' + encodeURIComponent(params[k]); } }
  const o = Object.assign({}, opts || {});
  try{
    if(CON_APPCHECK[action] && typeof window._appCheckToken === 'function'){
      const t = await window._appCheckToken();
      if(t){ o.headers = Object.assign({}, o.headers, {'X-Firebase-AppCheck': t}); }
    }
  }catch(e){}
  const r = await fetch(url, o);
  if(r.status === 429){ return r.json().catch(()=>({status:'rate_limited'})); }
  if(!r.ok){ throw new Error('API ' + r.status); }
  return r.json();
}

const wsId = 'panel';

const STATUS_META = {
  'NUEVO PEDIDO':    {color:'#f59e0b',emoji:'🆕',step:0},
  'EN PROCESO':      {color:'#f97316',emoji:'⚠️',step:1},
  'POR ALISTAR':     {color:'#3b82f6',emoji:'📦',step:2},
  'ALISTADO':        {color:'#14b8a6',emoji:'✅',step:2},
  'ENVIADO':         {color:'#8b5cf6',emoji:'🚚',step:3},
  'LLEGÓ A DESTINO': {color:'#06b6d4',emoji:'📍',step:4},
  'PENDIENTE DE PAGO':{color:'#eab308',emoji:'💰',step:4},
  'FINALIZADO':      {color:'#22c55e',emoji:'🏁',step:5},
  'Nuevo pedido':    {color:'#f59e0b',emoji:'🆕',step:0},
  'En proceso':      {color:'#f97316',emoji:'⚠️',step:1},
  'Por alistar':     {color:'#3b82f6',emoji:'📦',step:2},
  'Alistado':        {color:'#14b8a6',emoji:'✅',step:2},
  'Enviado':         {color:'#8b5cf6',emoji:'🚚',step:3},
  'Llegó a destino': {color:'#06b6d4',emoji:'📍',step:4},
  'Pendiente de pago':{color:'#eab308',emoji:'💰',step:4},
  'Finalizado':      {color:'#22c55e',emoji:'🏁',step:5},
};

function courierEmoji(name, type){
  if(type==='agencia') return '🏢';
  const u = (name||'').toUpperCase();
  if(u.includes('SHALOM'))                         return '🚌';
  if(u.includes('OLVA'))                           return '📬';
  if(u.includes('MARVISUR'))                       return '🚐';
  if(u.includes('DINSIDES'))                       return '📦';
  if(u.includes('DELIVERY')||u.includes('MOTORIZADO')) return '🛵';
  if(u.includes('RETIRO'))                         return '🏪';
  if(_isOtrasAg(u))                                return '📦';
  return '🏢';
}

function _isOtrasAg(name){
  const u=(name||'').toUpperCase();
  return u.includes('ENCOMIENDA')||u.includes('OTRAS AGENCIA')||u.includes('OTRA AGENCIA');
}

let CFG            = null;

const app = document.getElementById('app');

function $ (id){ return document.getElementById(id); }

function setApp(html){ app.innerHTML = html; }

function esc(s){ return s==null?'':String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

function isoDate(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

function _cfgHasPhone(c){ return !!(c && (c.phone || (c.config && c.config.phone))); }

function headerHtml(ayudaTipo){
  const bizName = (CFG&&(CFG.name||CFG.config&&CFG.config.name)) || 'Mi Negocio';
  const bizCity = (CFG&&(CFG.city||CFG.config&&CFG.config.city)) || '';
  const ayudaFn = ayudaTipo==='track' ? 'abrirAyudaTrack()' : 'abrirAyudaForm()';
  const isTrack = ayudaTipo==='track';
  const brand = isTrack
    ? `<div class="biz-name">${esc(bizName)}</div>${bizCity?`<div class="biz-city">📍 ${esc(bizCity)}</div>`:''}`
    : '';
  return `<div class="biz-header" style="position:relative${isTrack?'':';min-height:34px'}">${brand}<div onclick="${ayudaFn}" style="position:absolute;top:2px;right:0;display:flex;align-items:center;gap:4px;background:rgba(167,139,250,.12);border:1px solid rgba(167,139,250,.3);color:#a78bfa;border-radius:8px;padding:5px 10px;cursor:pointer;font-size:12px;font-weight:700" title="Ayuda">📖 Ayuda</div></div>`;
}

function _ayudaFormCss(){
  if(document.getElementById('ayudaCss')) return;
  var st=document.createElement('style'); st.id='ayudaCss';
  st.textContent=''
   +'body.tt-ayuda-on #tt-narr{display:none!important}'
   +'#ayudaFormOv .ay-sheet{background:#0d1117;border:1px solid #30363d;border-radius:18px 18px 0 0;width:100%;max-width:520px;max-height:88vh;overflow-y:auto;padding:18px 18px 20px;box-shadow:0 -10px 40px rgba(0,0,0,.5);animation:ayIn .28s ease}'
   +'@keyframes ayIn{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}'
   +'#ayudaFormOv .ay-ttl{font-size:11px;font-weight:800;letter-spacing:.8px;color:#a78bfa;margin:14px 0 6px;text-transform:uppercase}'
   +'#ayudaFormOv .ay-paso{display:flex;gap:10px;padding:10px;border-radius:12px;border:1px solid transparent;margin-bottom:4px}'
   +'#ayudaFormOv .ay-paso.on{background:rgba(45,212,191,.08);border-color:rgba(45,212,191,.45)}'
   +'#ayudaFormOv .ay-paso.ok{opacity:.6}'
   +'#ayudaFormOv .ay-n{width:24px;height:24px;border-radius:50%;background:rgba(167,139,250,.15);border:1px solid rgba(167,139,250,.3);color:#a78bfa;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0}'
   +'#ayudaFormOv .ay-paso.on .ay-n{background:#2dd4bf;border-color:#2dd4bf;color:#04122c}'
   +'#ayudaFormOv .ay-paso.ok .ay-n{background:rgba(30,185,84,.18);border-color:rgba(30,185,84,.5);color:#1eb954}'
   +'#ayudaFormOv .ay-t{font-size:13.5px;color:#e6edf3;font-weight:700}'
   +'#ayudaFormOv .ay-d{font-size:12.5px;color:#8b949e;line-height:1.5;margin-top:2px}'
   +'#ayudaFormOv .ay-aqui{font-size:10px;font-weight:800;color:#2dd4bf;margin-left:6px;letter-spacing:.04em}'
   +'#ayudaFormOv details{border-bottom:1px solid rgba(255,255,255,.06);padding:9px 2px}'
   +'#ayudaFormOv summary{cursor:pointer;font-size:13px;color:#e6edf3;font-weight:700;list-style:none;display:flex;justify-content:space-between;gap:8px}'
   +'#ayudaFormOv summary::-webkit-details-marker{display:none}'
   +'#ayudaFormOv summary:after{content:"+";color:#8b949e;font-weight:400}'
   +'#ayudaFormOv details[open] summary:after{content:"–"}'
   +'#ayudaFormOv details p{font-size:12.5px;color:#8b949e;line-height:1.5;margin:6px 0 0}'
   +'#ayudaFormOv .ay-btns{display:flex;gap:8px;margin-top:16px}'
   +'#ayudaFormOv .ay-btns a,#ayudaFormOv .ay-btns button{flex:1;padding:12px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;text-align:center;text-decoration:none}'
   +'#ayudaFormOv .ay-wa{background:rgba(30,185,84,.12);border:1px solid rgba(30,185,84,.45);color:#1eb954}'
   +'#ayudaFormOv .ay-x{background:#1c2333;border:1px solid #30363d;color:#c9d1d9}'
   +'@media(prefers-reduced-motion:reduce){#ayudaFormOv .ay-sheet{animation:none}}';
  document.head.appendChild(st);
}

function _toby(texto, rol){
  return window.Toby ? Toby.globo(texto, rol) : '<div class="ay-d" style="margin-bottom:12px">'+texto+'</div>';
}

function _holaNombre(n){
  var p=String(n||'').trim().split(/\s+/)[0]||'';
  if(!p) return '';
  p=p.charAt(0).toUpperCase()+p.slice(1).toLowerCase();
  return '¡Hola, '+esc(p)+'! ';
}

function _ayudaHoja(){
  _ayudaFormCss();
  let ov = document.getElementById('ayudaFormOv');
  if(!ov){
    ov = document.createElement('div');
    ov.id = 'ayudaFormOv';
    ov.setAttribute('role','dialog'); ov.setAttribute('aria-modal','true'); ov.setAttribute('aria-label','Ayuda');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:99999;display:flex;align-items:flex-end;justify-content:center';
    ov.addEventListener('click', e=>{ if(e.target===ov) cerrarAyudaForm(); });
    document.addEventListener('keydown', e=>{ if(e.key==='Escape' && ov.style.display!=='none') cerrarAyudaForm(); });
    document.body.appendChild(ov);
  }
  return ov;
}

function _ayudaWa(texto){
  let bizPhone = String((CFG&&(CFG.config&&CFG.config.phone||CFG.phone))||'').replace(/\D/g,'');
  if(bizPhone.startsWith('51') && bizPhone.length>9) bizPhone = bizPhone.slice(2);
  return bizPhone ? `https://wa.me/51${bizPhone}?text=${encodeURIComponent(texto)}` : '';
}

function cerrarAyudaForm(){
  var ov=document.getElementById('ayudaFormOv'); if(ov) ov.style.display='none';
  document.body.classList.remove('tt-ayuda-on');
}

function brandFooterHtml(){
  const web='<svg class="bf-ic" viewBox="0 0 496 512" fill="#12a5b4" aria-hidden="true"><path d="M336.5 160C322 70.7 287.8 8 248 8s-74 62.7-88.5 152h177zM152 256c0 22.2 1.2 43.5 3.3 64h185.3c2.1-20.5 3.3-41.8 3.3-64s-1.2-43.5-3.3-64H155.3c-2.1 20.5-3.3 41.8-3.3 64zm324.7-96c-28.6-67.9-86.5-120.4-158-141.6 24.4 33.8 41.2 84.7 50 141.6h108zM177.2 18.4C105.8 39.6 47.8 92.1 19.3 160h108c8.7-56.9 25.5-107.8 49.9-141.6zM487.4 192H372.7c2.1 21 3.3 42.5 3.3 64s-1.2 43-3.3 64h114.6c5.5-20.5 8.6-41.8 8.6-64s-3.1-43.5-8.5-64zM120 256c0-21.5 1.2-43 3.3-64H8.6C3.2 212.5 0 233.8 0 256s3.2 43.5 8.6 64h114.6c-2-21-3.2-42.5-3.2-64zm35.4 96c14.5 89.3 48.7 152 88.5 152s74-62.7 88.5-152h-177zm159.4 141.6c71.4-21.2 129.4-73.7 158-141.6h-108c-8.8 56.9-25.6 107.8-50 141.6zM19.3 352c28.6 67.9 86.5 120.4 158 141.6-24.4-33.8-41.2-84.7-50-141.6h-108z"/></svg>';
  const fb='<svg class="bf-ic" viewBox="0 0 448 512" fill="#1877F2" aria-hidden="true"><path d="M400 32H48A48 48 0 0 0 0 80v352a48 48 0 0 0 48 48h137.25V327.69h-63V256h63v-54.64c0-62.15 37-96.48 93.67-96.48 27.14 0 55.52 4.84 55.52 4.84v61h-31.27c-30.81 0-40.42 19.12-40.42 38.73V256h68.78l-11 71.69h-57.78V480H400a48 48 0 0 0 48-48V80a48 48 0 0 0-48-48z"/></svg>';
  const tk='<svg class="bf-ic" viewBox="0 0 448 512" fill="#e9edf3" aria-hidden="true"><path d="M448 209.91a210.06 210.06 0 0 1-122.77-39.25V349.38A162.55 162.55 0 1 1 185 188.31V278.2a74.62 74.62 0 1 0 52.23 71.18V0h88a121.18 121.18 0 0 0 1.86 22.17A122.18 122.18 0 0 0 381 102.39a121.43 121.43 0 0 0 67 20.14z"/></svg>';
  const ig='<svg class="bf-ic" viewBox="0 0 448 512" fill="#E1306C" aria-hidden="true"><path d="M224.1 141c-63.6 0-114.9 51.3-114.9 114.9s51.3 114.9 114.9 114.9S339 319.5 339 255.9 287.7 141 224.1 141zm0 189.6c-41.1 0-74.7-33.5-74.7-74.7s33.5-74.7 74.7-74.7 74.7 33.5 74.7 74.7-33.6 74.7-74.7 74.7zm146.4-194.3c0 14.9-12 26.8-26.8 26.8-14.9 0-26.8-12-26.8-26.8s12-26.8 26.8-26.8 26.8 12 26.8 26.8zm76.1 27.2c-1.7-35.9-9.9-67.7-36.2-93.9-26.2-26.2-58-34.4-93.9-36.2-37-2.1-147.9-2.1-184.9 0-35.8 1.7-67.6 9.9-93.9 36.1s-34.4 58-36.2 93.9c-2.1 37-2.1 147.9 0 184.9 1.7 35.9 9.9 67.7 36.2 93.9s58 34.4 93.9 36.2c37 2.1 147.9 2.1 184.9 0 35.9-1.7 67.7-9.9 93.9-36.2 26.2-26.2 34.4-58 36.2-93.9 2.1-37 2.1-147.8 0-184.8zM398.8 388c-7.8 19.6-22.9 34.7-42.6 42.6-29.5 11.7-99.5 9-132.1 9s-102.7 2.6-132.1-9c-19.6-7.8-34.7-22.9-42.6-42.6-11.7-29.5-9-99.5-9-132.1s-2.6-102.7 9-132.1c7.8-19.6 22.9-34.7 42.6-42.6 29.5-11.7 99.5-9 132.1-9s102.7-2.6 132.1 9c19.6 7.8 34.7 22.9 42.6 42.6 11.7 29.5 9 99.5 9 132.1s2.7 102.7-9 132.1z"/></svg>';
  return `
    <div class="brand-foot">
      <div class="bf-row">
        <span class="bf-item bf-web">${web} totaltoolspe.com</span>
      </div>
      <div class="bf-row bf-soc">
        <span class="bf-item">${fb} Total One-Stop Tools Station</span>
        <span class="bf-item">${tk} Total Tools Lima</span>
        <span class="bf-item">${tk} Total Tools Perú</span>
        <span class="bf-item">${ig} totaltoolsperu</span>
      </div>
    </div>`;
}

function codigoSeg(id, createdAt){
  return window.CodigoSeguimiento ? window.CodigoSeguimiento.de(id, createdAt)
    : String(id||'').slice(-4).toUpperCase();
}

function _tipoEnvioDe(name){
  const cTypes=(CFG&&CFG.courierTypes)||{};
  const configType=name?(cTypes[name]||''):'';
  const u=(name||'').toUpperCase();
  const isEncomienda=_isOtrasAg(u);
  const isRetiro=!isEncomienda&&u.includes('RETIRO');
  const isKnownAgency=['SHALOM','OLVA','MARVISUR','DINSIDES'].some(n=>u.includes(n));
  const isAgencia=!isRetiro&&!isEncomienda&&(configType==='agencia'||isKnownAgency);
  return isAgencia    ? 'agencia'
       : isEncomienda ? 'encomienda'
       : isRetiro     ? 'retiro'
       :                'delivery';
}
