function getFormLink(){
  const base = window.location.origin + window.location.pathname.replace('index.html','').replace(/\/$/, '');
  return `${base}/formulario.html`;
}
function getSeguimientoLink(){
  return getFormLink().replace(/formulario\.html$/, 'seguimiento.html');
}
function updateShareLink(){
  const link = getFormLink();
  const el = document.getElementById('shareUrl');
  if(el) el.textContent = link;
}
const _LINK_SEL_KEY = 'tt_link_sel';
const _LINK_DIAS = [{n:'L',v:1},{n:'M',v:2},{n:'X',v:3},{n:'J',v:4},{n:'V',v:5},{n:'S',v:6},{n:'D',v:0}];

function _linkSel(){
  let guardado = null;
  try{ guardado = JSON.parse(localStorage.getItem(_LINK_SEL_KEY) || 'null'); }catch(e){}
  const cfgAct = S.courierActive || {};
  const couriers = {};
  (S.couriers || []).forEach(function(c){
    const g = guardado && guardado.couriers ? guardado.couriers[c] : undefined;
    couriers[c] = (typeof g === 'boolean') ? g : (cfgAct[c] !== false);
  });
  const dias = (guardado && Array.isArray(guardado.days))
    ? guardado.days.filter(function(d){ return d >= 0 && d <= 6; })
    : ((S.dispatch && S.dispatch.days) || []).slice();
  return {days: dias, couriers: couriers};
}

function _linkSelGuardar(sel){
  try{ localStorage.setItem(_LINK_SEL_KEY, JSON.stringify(sel)); }catch(e){}
}

function linkSelDia(v){
  const sel = _linkSel();
  const i = sel.days.indexOf(v);
  if(i >= 0) sel.days.splice(i, 1); else sel.days.push(v);
  _linkSelGuardar(sel); _pintarLinkSel();
}

function linkSelCourier(nombre){
  const sel = _linkSel();
  sel.couriers[nombre] = !sel.couriers[nombre];
  _linkSelGuardar(sel); _pintarLinkSel();
}

function linkSelComoConfig(){
  try{ localStorage.removeItem(_LINK_SEL_KEY); }catch(e){}
  _pintarLinkSel();
  if(typeof toast === 'function') toast('↺ Igual que en Config');
}

function _linkSelFalta(){
  const sel = _linkSel();
  if(!sel.days.length) return '⚠️ Marca al menos un día de despacho para este link';
  const alguno = Object.keys(sel.couriers).some(function(c){ return sel.couriers[c]; });
  if(!alguno) return '⚠️ Marca al menos una forma de envío para este link';
  return '';
}

function _pintarLinkSel(){
  const box = $('linkSelBox'); if(!box) return;
  const sel = _linkSel();
  const chip = function(on, txt, onclick, titulo, enCasilla){
    return '<button type="button" onclick="'+escH(onclick)+'" title="'+escH(titulo||txt)+'" ' +
      'style="' + (enCasilla
        ? 'width:100%;min-width:0;padding:7px 4px;font-size:11px;line-height:1.2;' +
          'white-space:normal;word-break:break-word;text-align:center;'
        : 'flex-shrink:0;padding:7px 11px;font-size:12px;white-space:nowrap;') +
      'border-radius:9px;font-weight:700;cursor:pointer;font-family:inherit;' +
      (on ? 'background:var(--blue-fill);border:1px solid var(--blue);color:#fff'
          : 'background:var(--bg3);border:1px solid var(--bd);color:var(--text2)') +
      '">'+escH(txt)+'</button>';
  };
  const fila = function(etq, contenido, cuerpoCss){
    return '<div style="display:flex;align-items:flex-start;gap:8px;margin-top:8px">' +
      '<div style="font-size:11px;color:var(--text2);width:42px;flex-shrink:0;' +
      'padding-top:8px">'+etq+'</div>' +
      '<div style="flex:1;min-width:0;'+cuerpoCss+'">'+contenido+'</div></div>';
  };
  const dias = _LINK_DIAS.map(function(d){
    return chip(sel.days.indexOf(d.v) >= 0, d.n, 'linkSelDia('+d.v+')');
  }).join('');
  const lista = S.couriers || [];
  const envios = lista.map(function(c){
    return chip(!!sel.couriers[c], c, "linkSelCourier('"+escJs(c)+"')", c, true);
  }).join('');
  const cols = Math.max(1, Math.ceil(lista.length / 2));
  box.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">' +
      '<div class="cfg-ttl" style="margin:0">📦 Este link</div>' +
      '<button type="button" onclick="linkSelComoConfig()" style="background:none;border:none;' +
      'color:var(--blue);font-size:11.5px;font-weight:700;cursor:pointer;font-family:inherit;' +
      'padding:4px 2px">↺ como en Config</button>' +
    '</div>' +
    fila('Días', dias, 'display:flex;gap:6px;flex-wrap:wrap') +
    fila('Envío', envios, 'display:grid;gap:6px;' +
      'grid-template-columns:repeat('+cols+',minmax(0,1fr))');
}

async function _snapshotFormConfig(){
  const uuid=Math.random().toString(36).slice(2,9)+Date.now().toString(36);
  const sel=_linkSel();
  const courierActive={};
  (S.couriers||[]).forEach(function(c){ courierActive[c]=!!sel.couriers[c]; });
  const snap={
    name:(S.config&&S.config.name)||'',
    city:(S.config&&S.config.city)||'',
    phone:(S.config&&S.config.phone)||'',
    couriers:S.couriers||[],
    courierActive:courierActive,
    courierTypes:S.courierTypes||{},
    dispatch:Object.assign({},S.dispatch||{},{days:sel.days.slice()}),
    extraFields:S.extraFields||[],
    createdAt:new Date().toISOString()
  };
  if(!window._fbSaveFormConfig) throw new Error('guardado de la foto no disponible');
  await window._fbSaveFormConfig(uuid,snap);
  return uuid;
}
let _genBusy=false;
async function _genGuard(btn, fn){
  if(_genBusy) return;
  _genBusy=true;
  var orig=null;
  if(btn){ orig=btn.innerHTML; btn.disabled=true; btn.innerHTML='<span class="trk-spin-inline"></span> Generando…'; }
  try{ await fn(); }
  finally{ _genBusy=false; if(btn){ btn.disabled=false; btn.innerHTML=orig; } }
}
async function _genQuickDo(action){
  let win=null;
  if(action==='open'||action==='wa') win=window.open('','_blank');
  let t=0; while(!window._fbSaveTok && t<30){ await new Promise(r=>setTimeout(r,100)); t++; }
  if(!window._fbSaveTok){ if(win)win.close(); toast('⚠️ Firebase no listo, intenta de nuevo'); return; }
  const id = _genTokId();
  const tok = {
    id,
    name:         'Link rápido',
    phone:        '',
    createdAt:    new Date().toISOString(),
    prefillName:  '',
    prefillPhone: '',
    prefillLink:  '',
    used:         false,
    quick:        true,
    expiresAt:    new Date(Date.now()+7*864e5).toISOString(),
  };
  try{
    let cfgId='';
    try{ cfgId=await _snapshotFormConfig(); }catch(e){ console.warn('cfg snapshot:',e); }
    if(!cfgId){ if(win)win.close(); toast('⚠️ No se pudo guardar la configuración del link. Intenta de nuevo.'); return; }
    tok.cfgId=cfgId;
    await window._fbSaveTok(tok);
    const url = getFormLink()+'?t='+id+'&cfg='+cfgId;
    if(action==='copy'){
      navigator.clipboard.writeText(url).then(()=>toast('🔗 Link copiado')).catch(()=>{
        const ta=document.createElement('textarea');ta.value=url;document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);toast('🔗 Link copiado');
      });
    } else if(action==='wa'){
      const wa='https://wa.me/?text='+encodeURIComponent('📦 Hola, aquí el link para registrar tu pedido:\n\n'+url);
      if(win) win.location=wa; else window.open(wa,'_blank');
    } else {
      if(win) win.location=url; else window.open(url,'_blank');
    }
    if(typeof loadTokenList==='function') loadTokenList(true);
  }catch(e){ if(win)win.close(); toast('⚠️ Error: '+e.message); }
}
function genQuickToken(action, btn){
  const _falta=_linkSelFalta();
  if(_falta){ if(typeof toast==='function') toast(_falta); return; }
  return _genGuard(btn, ()=>_genQuickDo(action));
}
function copyLink(btn){ return genQuickToken('copy', btn); }
function openFormLink(btn){ return genQuickToken('open', btn); }
function shareWA(btn){ return genQuickToken('wa', btn); }

let _tokCache = [];
let _tokSel = {};

function _isTokToday(iso){
  if(!iso) return false;
  var d=new Date(iso), n=new Date();
  return d.getFullYear()===n.getFullYear()&&d.getMonth()===n.getMonth()&&d.getDate()===n.getDate();
}
function _tokDayLabel(iso, isToday){
  if(isToday) return 'Hoy';
  if(!iso) return 'Sin fecha';
  return new Date(iso).toLocaleDateString('es-PE',{weekday:'short',day:'2-digit',month:'short'});
}
function _tokSelCount(){ return Object.keys(_tokSel).filter(function(k){return _tokSel[k];}).length; }
function _updateTokBar(){
  var b=document.getElementById('tokPrintBtn'); if(!b) return;
  var n=_tokSelCount();
  b.textContent='🖨️ Imprimir'+(n?' ('+n+')':'');
  b.disabled=!n;
}
function tokToggleSel(id){
  if(_tokSel[id]) delete _tokSel[id]; else _tokSel[id]=true;
  var cb=document.querySelector('.tok-check[data-id="'+id.replace(/"/g,'&quot;')+'"]');
  if(cb) cb.classList.toggle('on', !!_tokSel[id]);
  _updateTokBar();
}
function tokSelAllToday(){
  var ids=_tokCache.filter(function(t){return t.used && _isTokToday(t.createdAt);}).map(function(t){return t.id;});
  if(!ids.length){ toast('No hay usados de hoy'); return; }
  var yaTodos=ids.every(function(id){return _tokSel[id];});
  ids.forEach(function(id){
    if(yaTodos) delete _tokSel[id]; else _tokSel[id]=true;
    var cb=document.querySelector('.tok-check[data-id="'+id.replace(/"/g,'&quot;')+'"]');
    if(cb) cb.classList.toggle('on', !yaTodos);
  });
  _updateTokBar();
}
function tokPrintSel(){
  var sel=Object.keys(_tokSel).filter(function(k){return _tokSel[k];});
  if(!sel.length){ toast('Selecciona links usados'); return; }
  var toks=sel.map(function(id){return _tokCache.find(function(t){return t.id===id;});}).filter(Boolean);
  var orderIds=toks.map(function(t){return t.orderId;}).filter(Boolean);
  var S=window.S;
  var existing=orderIds.filter(function(oid){return S&&S.shipments&&S.shipments.some(function(x){return x.id===oid;});});
  var missing=toks.length-existing.length;
  if(!existing.length){ toast('⚠️ Esos links no tienen pedido cargado para imprimir'); return; }
  if(window.PrintModule&&window.PrintModule.openList){
    window.PrintModule.openList(existing);
    if(missing>0) toast('🖨️ '+existing.length+' · '+missing+' sin pedido');
  } else { toast('⚠️ Impresión no disponible'); }
}

function _nroLimpio(x){ return window.NroComprobante ? NroComprobante.limpiar(x) : ''; }
function _nroDe(s){ return window.NroComprobante ? NroComprobante.de(s) : ''; }
function _nroRepetido(nro, idPropio){
  if(!nro) return null;
  return (S.shipments||[]).find(x=>x && x.id!==idPropio && _nroDe(x)===nro) || null;
}

const _TOK_LETRAS='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const _TOK_LARGO=22;
function _genTokId(){
  const azar=new Uint8Array(32);
  let r='';
  while(r.length<_TOK_LARGO){
    crypto.getRandomValues(azar);
    for(let i=0;i<azar.length && r.length<_TOK_LARGO;i++){
      if(azar[i]<248) r+=_TOK_LETRAS[azar[i]%62];
    }
  }
  return r;
}

function _tokAlgunDato(){
  return ['tokName','tokPhone','tokMonto','tokAdelanto','tokLink','tokComprobante']
    .some(function(id){ var e=$(id); return !!(e && String(e.value||'').trim()); });
}
var _TOK_FALTA='⚠️ Escribe al menos un dato: nombre, teléfono, monto, link o N° de factura';
async function _genTokenDo(action){
  const name    = ($('tokName').value||'').trim();
  const phone   = ($('tokPhone').value||'').trim();
  const link    = ($('tokLink').value||'').trim();
  const nroComp = _nroLimpio(($('tokComprobante')||{}).value);
  const monto   = (($('tokMonto')||{}).value||'').trim();
  const adelanto= (($('tokAdelanto')||{}).value||'').trim();
  const expDays = parseInt($('tokExp').value||'0')||0;
  if(!_tokAlgunDato()){ toast(_TOK_FALTA); return; }
  let t=0; while(!window._fbSaveTok && t<30){ await new Promise(r=>setTimeout(r,100)); t++; }
  if(!window._fbSaveTok){ toast('⚠️ Firebase no listo, intenta de nuevo'); return; }
  const id  = _genTokId();
  const tok = {
    id, name, phone,
    createdAt:    new Date().toISOString(),
    prefillName:  name,
    prefillPhone: phone||'',
    prefillLink:  link||'',
    monto:        monto||'',
    adelanto:     adelanto||'',
    used:         false,
    expiresAt:    expDays ? new Date(Date.now()+expDays*864e5).toISOString() : null,
  };
  if(nroComp) tok.nroComprobante = nroComp;
  try {
    let cfgId='';
    try{ cfgId=await _snapshotFormConfig(); }catch(e){ console.warn('cfg snapshot:',e); }
    if(!cfgId){ toast('⚠️ No se pudo guardar la configuración del link. Intenta de nuevo.'); return; }
    tok.cfgId=cfgId;
    await window._fbSaveTok(tok);
    const url = getFormLink()+'?t='+id+'&cfg='+cfgId;
    $('tokName').value=''; $('tokPhone').value=''; $('tokLink').value=''; $('tokExp').value='';
    if($('tokComprobante')) $('tokComprobante').value='';
    if($('tokMonto')) $('tokMonto').value=''; if($('tokAdelanto')) $('tokAdelanto').value='';
    await new Promise(r=>setTimeout(r,800));
    if(action==='copy'){
      navigator.clipboard.writeText(url).then(()=>toast('🔑 Link copiado')).catch(()=>{
        const ta=document.createElement('textarea');ta.value=url;
        document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);
        toast('🔑 Link copiado');
      });
    } else {
      const registro='📦 Programa tu envío aquí 👇\n📝 así registramos bien tu pedido y evitamos errores en el envío\n🔗 Es rápido y nos ayuda a brindarte una mejor atención 👍\n\n'+url;
      const msg=registro+(link?'\n\n─────────\n📎 Aquí tu documento:\n'+link:'');
      if(phone){ window.waOpen(phone, msg); }
      else if(navigator.share){ navigator.share({title:'Pedido'+(name?' - '+name:''),text:msg}).catch(()=>window.open('https://wa.me/?text='+encodeURIComponent(msg),'_blank')); }
      else { window.open('https://wa.me/?text='+encodeURIComponent(msg),'_blank'); }
      toast('🔑 Link generado');
    }
    await loadTokenList(true);
  } catch(e){ toast('⚠️ Error: '+e.message); }
}
function genToken(action, btn){
  if(!_tokAlgunDato()){ if(typeof toast==='function') toast(_TOK_FALTA); return; }
  const _falta=_linkSelFalta();
  if(_falta){ if(typeof toast==='function') toast(_falta); return; }
  return _genGuard(btn, ()=>_genTokenDo(action));
}

let _tokRecientes = [];
let _tokAnteriores = [];
let _tokCursor = null;
let _tokFin = false;
let _tokTodo = false;
let _tokCargandoAnt = false;
const _TOK_PAGINA = 50;

function _tokCorteISO(){
  const F = window.FechaPedido;
  if(F && F.hoyLima) return F.inicioDiaLimaISO(F.sumarDias(F.hoyLima(), -1));
  return new Date(Date.now() - 2*864e5).toISOString();
}
function _tokUnir(recientes, anteriores){
  const vistos = {};
  return (recientes||[]).concat(anteriores||[])
    .map(function(d){ return Object.assign({},d,{id:d.id||d._id||''}); })
    .filter(function(d){ if(!d.id || vistos[d.id]) return false; vistos[d.id]=true; return true; })
    .sort(function(a,b){ return (b.createdAt||'')>(a.createdAt||'')?1:-1; });
}
async function _tokTraer(){
  if(!_tokTodo && window._fbListToksRecientes){
    try{ return {recientes: await window._fbListToksRecientes(_tokCorteISO()), todo:false}; }
    catch(e){ console.warn('[links] la consulta parcial falló; se baja la lista completa:', e); }
  }
  return {recientes: await window._fbListToks(), todo:true};
}
async function tokCargarAnteriores(btn){
  if(_tokCargandoAnt || _tokFin || _tokTodo || !window._fbListToksAnteriores) return;
  _tokCargandoAnt = true;
  if(btn){ btn.disabled = true; btn.textContent = '⏳ Cargando…'; }
  try{
    const pag = await window._fbListToksAnteriores(_tokCorteISO(), _tokCursor, _TOK_PAGINA);
    if(pag.length){
      const ult = pag[pag.length-1];
      _tokCursor = {usedAt: ult.usedAt, name: ult._name};
      _tokAnteriores = _tokAnteriores.concat(pag);
    }
    if(pag.length < _TOK_PAGINA) _tokFin = true;
    _tokCache = _tokUnir(_tokRecientes, _tokAnteriores);
  }catch(e){
    if(typeof toast==='function') toast('⚠️ No se pudieron cargar: '+e.message);
  }finally{
    _tokCargandoAnt = false;
    _renderTokList();
  }
}
async function tokCargarTodo(btn){
  if(_tokTodo) return;
  _tokTodo = true;
  if(btn){ btn.disabled = true; btn.textContent = '⏳ Cargando todo…'; }
  _tokLastFetch = 0;
  await _revalidateTokens(false);
  _renderTokList();
}
function _tokPie(){
  if(_tokTodo) return '';
  const n = _tokAnteriores.length;
  if(!_tokFin){
    return '<div style="text-align:center;margin-top:10px">' +
      '<button class="tok-act-btn" data-act="anteriores">⬇ Cargar anteriores' +
      (n ? ' · '+n+' cargados' : '') + '</button></div>';
  }
  return '<div style="text-align:center;margin-top:10px;font-size:11px;color:var(--text2)">' +
    'No hay más links' + (n ? ' · '+n+' anteriores cargados' : '') + '<br>' +
    '<button class="tok-act-btn" data-act="todo" style="margin-top:6px">Cargar todo (incluye los muy antiguos)</button></div>';
}

let _tokLastFetch = 0;
let _tokRevalidating = false;
const _TOK_COOLDOWN = 30000;

async function loadTokenList(force){
  const list=$('tokList');
  if(!list) return;
  if(_tokCache && _tokCache.length){
    _renderTokList();
    if(force || (Date.now()-_tokLastFetch) > _TOK_COOLDOWN) _revalidateTokens(false);
    return;
  }
  list.innerHTML='<div class="tok-empty">⏳ Cargando...</div>';
  await _revalidateTokens(true);
}

async function _revalidateTokens(isFirst){
  if(_tokRevalidating) return;
  _tokRevalidating = true;
  const list=$('tokList');
  try{
    for(let i=0;i<40;i++){ if(window._fbListToks) break; await new Promise(r=>setTimeout(r,100)); }
    if(!window._fbListToks){
      if(isFirst && list) list.innerHTML='<div class="tok-empty">⚠️ Sin conexión. Toca 🔄</div>';
      return;
    }
    const r = await _tokTraer();
    _tokLastFetch = Date.now();
    if(r.todo){ _tokTodo = true; _tokAnteriores = []; }
    _tokRecientes = r.recientes || [];
    const next = _tokUnir(_tokRecientes, _tokAnteriores);
    const sig = function(arr){ return (arr||[]).map(function(t){return t.id+'|'+(t.used?1:0)+'|'+(t.expiresAt||'');}).join(','); };
    const changed = sig(next)!==sig(_tokCache);
    _tokCache = next;
    if(changed || isFirst) _renderTokList();
  }catch(e){
    if(isFirst && list) list.innerHTML='<div class="tok-empty">⚠️ Error: '+e.message+'<br><button class="tok-act-btn" onclick="loadTokenList(true)" style="margin-top:8px">↻ Reintentar</button></div>';
    console.error('loadTokenList error:', e);
  }finally{
    _tokRevalidating = false;
  }
}

function _renderTokList(){
  const list=$('tokList');
  if(!list) return;
  try{
    if(!_tokCache || !_tokCache.length){
      list.innerHTML='<div class="tok-empty">📭 '+(_tokTodo?'No hay links generados aún.':'Ningún link por usar ni usado hoy o ayer.')+'</div>'+_tokPie();
      _updateTokBar();
      _tokEnganchar(list);
      return;
    }
    
    var now = new Date();
    var html = '';
    var activos = [];
    var inactivos = [];
    
    _tokCache.forEach(function(tok){
      var exp = tok.expiresAt ? new Date(tok.expiresAt) : null;
      var expired = !!(exp && exp < now);
      var used = !!tok.used;
      if(!used && !expired){ activos.push(tok); }
      else { inactivos.push(tok); }
    });
    
    function timeAgo(iso){
      if(!iso) return 'hace un momento';
      var diff = Date.now() - new Date(iso).getTime();
      var m = Math.floor(diff/60000);
      if(m<1) return 'hace un momento';
      if(m<60) return 'hace '+m+' min';
      if(m<1440) return 'hace '+Math.floor(m/60)+'h';
      return new Date(iso).toLocaleDateString('es-PE',{day:'2-digit',month:'short'});
    }
    
    function renderItem(tok, showTime){
      if(showTime===undefined) showTime=true;
      var exp = tok.expiresAt ? new Date(tok.expiresAt) : null;
      var expired = !!(exp && exp < now);
      var used = !!tok.used;
      var pend = !used && !expired;
      var badge = used
        ? '<span class="tok-badge tok-badge-used">✓ Usado</span>'
        : expired
          ? '<span class="tok-badge tok-badge-exp">⏰ Vencido</span>'
          : '<span class="tok-badge tok-badge-ok">● Disponible</span>';
      var tiempo = timeAgo(tok.createdAt);
      var expTxt = exp ? ((expired?'Venció ':'Vence ')+exp.toLocaleDateString('es-PE',{day:'2-digit',month:'short'})) : '';
      var ord = (used && tok.orderId && window.S && S.shipments)
        ? S.shipments.find(function(x){return x.id===tok.orderId;}) : null;
      var nmRaw = (ord && ord.name) ? ord.name : (tok.name||'—');
      var nm = String(nmRaw).replace(/</g,'&lt;').replace(/>/g,'&gt;');
      var dni = ord ? _dniDe(ord) : '';
      var nroTok = (window.NroComprobante ? NroComprobante.de(ord || tok) : '');
      var cour = ord ? String(ord.courier||'').trim() : '';
      var dniEsc = dni.replace(/</g,'&lt;').replace(/>/g,'&gt;');
      var courEsc = cour.replace(/</g,'&lt;').replace(/>/g,'&gt;');
      var courIcon = (cour && window._courierIcon) ? window._courierIcon(cour) : '';
      var hasApi = !!(ord && Array.isArray(ord.links) && ord.links.some(function(l){return /apisal/i.test((l&&l.u)||'');}));
      var extraido = !!(ord && ((Array.isArray(ord.cotizItems)&&ord.cotizItems.length) || (ord.extraccion&&ord.extraccion.estado==='procesado')));
      var ph = (tok.phone||'').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      var lk = (tok.prefillLink||'').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      var shortLk = lk.length>45 ? lk.substring(0,45)+'…' : lk;
      var lkHref = (tok.prefillLink||'').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      var tid = (tok.id||'').replace(/"/g,'&quot;');
      var check = used ? '<span class="tok-check'+(_tokSel[tok.id]?' on':'')+'" data-act="toksel" data-id="'+tid+'" title="Seleccionar para imprimir"></span>' : '';
      var btns = '';
      if(pend){
        btns += '<button class="tok-act-btn" data-id="'+tid+'" data-act="share">📤 Compartir</button>';
        if(ph) btns += '<button class="tok-act-btn" style="color:var(--green);border-color:rgba(46,160,67,.4)" data-id="'+tid+'" data-act="wa">💬 WA</button>';
        btns += '<button class="tok-act-btn" data-id="'+tid+'" data-act="open">↗</button>';
      }
      if(hasApi) btns += '<button class="tok-act-btn" data-id="'+tid+'" data-act="docview" title="Ver comprobante (solo lectura)">📄 '+(extraido?'Ver':'Extraer')+'</button>';
      btns += '<button class="tok-act-btn tok-act-del" data-id="'+tid+'" data-act="delete">🗑️</button>';

      return '<div class="tok-list-item">'
        +'<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:3px">'
        +'<div style="display:flex;align-items:center;gap:8px;min-width:0">'+check+'<div class="tok-list-name">'+nm+'</div></div>'+badge
        +'</div>'
        +'<div class="tok-list-meta">'
        +(ph?'📞 '+ph:'')+(showTime?((ph?'  · ':'')+tiempo):'')
        +(dni?'<br>🪪 DNI '+dniEsc:'')
        +(nroTok?'<br>🧾 '+nroTok:'')
        +(cour?'<br>'+(courIcon?courIcon+' ':'🚚 ')+courEsc:'')
        +(expTxt?'<br>⏱ '+expTxt:'')
        +(lk?'<br><a href="'+lkHref+'" target="_blank" rel="noopener" class="link-chip" onclick="event.stopPropagation()" style="margin-top:4px">🔗 '+shortLk+'</a>':'')
        +'</div>'
        +'<div class="tok-list-actions" style="margin-top:8px">'+btns+'</div>'
        +'</div>';
    }

    activos.forEach(function(tok){ html += renderItem(tok, true); });
    if(inactivos.length){
      html += '<div style="font-size:10px;font-weight:700;color:var(--text2);letter-spacing:1px;text-transform:uppercase;margin:12px 0 8px;padding-top:8px;border-top:1px solid var(--bd)">Usados / Vencidos</div>';
      html += '<div class="tok-bar">'
        + '<button class="tok-act-btn" data-act="selall">☑️ Seleccionar hoy</button>'
        + '<button class="tok-act-btn" id="tokPrintBtn" data-act="printsel" disabled>🖨️ Imprimir</button>'
        + '</div>';
      var byDay={}, order=[];
      inactivos.forEach(function(tok){
        var d=tok.createdAt?new Date(tok.createdAt):null;
        var k=(d&&!isNaN(d))?(d.getFullYear()+'-'+d.getMonth()+'-'+d.getDate()):'sin';
        if(!byDay[k]){ byDay[k]=[]; order.push(k); }
        byDay[k].push(tok);
      });
      order.forEach(function(k){
        var items=byDay[k], iso=items[0].createdAt, isToday=_isTokToday(iso);
        html += '<div class="tok-day-hdr">'+_tokDayLabel(iso,isToday)+'</div>';
        items.forEach(function(tok){ html += renderItem(tok, isToday); });
      });
    }
    if(!html) html = '<div class="tok-empty">📭 No hay links generados aún.</div>';
    list.innerHTML = html + _tokPie();
    _updateTokBar();
    _tokEnganchar(list);
  }catch(e){
    console.error('renderTokList error:', e);
  }
}

function _tokEnganchar(list){
  list.onclick = function(e){
    var btn = e.target.closest('[data-act]');
    if(!btn) return;
    var id  = btn.dataset.id;
    var act = btn.dataset.act;
    if(act==='toksel'){  tokToggleSel(id);  return; }
    if(act==='selall'){  tokSelAllToday();  return; }
    if(act==='printsel'){ tokPrintSel();    return; }
    if(act==='anteriores'){ tokCargarAnteriores(btn); return; }
    if(act==='todo'){     tokCargarTodo(btn);       return; }
    _tokAction(id, act);
  };
}

function _tokAction(id, action){
  var tok = _tokCache.find(function(t){ return t.id === id; });
  if(!tok){ console.error('Token no encontrado:', id); return; }
  var url = getFormLink()+'?t='+(tok.id||tok._id||'');
  var link = tok.prefillLink||'';
  var msg = '📦 Hola'+(tok.name?' '+tok.name:'')+', aquí tu link para registrar tu pedido:\n\n'+url+(link?'\n\n📎 '+link:'');
  if(action==='share'){
    if(navigator.share){
      navigator.share({title:'Pedido'+(tok.name?' - '+tok.name:''), text:msg}).catch(function(){
        window.open('https://wa.me/?text='+encodeURIComponent(msg),'_blank');
      });
    } else {
      window.open('https://wa.me/?text='+encodeURIComponent(msg),'_blank');
    }
  } else if(action==='wa'){
    window.waOpen(tok.phone, msg);
  } else if(action==='open'){
    window.open(url,'_blank');
  } else if(action==='delete'){
    _confirmDelToken(tok);
  } else if(action==='docview'){
    var oid = tok.orderId||'';
    if(oid && window.Cotizacion && Cotizacion.ver){ Cotizacion.ver(oid); }
    else { toast('Este link no tiene comprobante para ver'); }
  }
}

function _confirmDelToken(tok){
  var quien = String(tok.name||tok.phone||'este link').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  confirmar({
    html:'¿Eliminar el link de <b>'+quien+'</b>?<br><span style="font-size:11px;color:var(--text2)">Solo se borra el link. El pedido registrado NO se toca.</span>',
    textoSi:'Sí, eliminar',
    trabajando:'Eliminando...',
    siFalla:'⚠️ Error al eliminar',
    alConfirmar: async function(){
      var id = tok.id||tok._id||'';
      if(!window._fbDelTok) throw new Error('sin _fbDelTok');
      await window._fbDelTok(id);
      delete _tokSel[id];
      _tokAnteriores = _tokAnteriores.filter(function(t){ return (t.id||t._id)!==id; });
      toast('🗑️ Link eliminado');
      loadTokenList(true);
    }
  });
}
