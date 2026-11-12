function updateStats(){
  if(_filt==='EN PROCESO'){
    renderStatsAsSuppliers();
    return;
  }
  $('statsArea').style.display='grid';
  $('suppStatsArea').style.display='none';
  $('sTotal').textContent=S.shipments.length;
  $('sPend').textContent=S.shipments.filter(x=>x.status==='NUEVO PEDIDO'||x.status==='EN PROCESO').length;
  $('sEnv').textContent=S.shipments.filter(x=>x.status==='POR ALISTAR'||x.status==='ALISTADO'||x.status==='ENVIADO'||x.status==='LLEGÓ A DESTINO'||x.status==='PENDIENTE DE PAGO').length;
  $('sEnt').textContent=S.shipments.filter(x=>x.status==='FINALIZADO').length;
}

function renderStatsAsSuppliers(){
  $('statsArea').style.display='none';
  $('suppStatsArea').style.display='block';
  if(!S.suppliers) S.suppliers=[];
  _sortSupp();
  const suppWithItems=S.suppliers.filter(sup=>(sup.items||[]).length>0);
  const allReady=suppWithItems.length>0&&suppWithItems.every(sup=>sup.items.every(x=>x.done));
  const enProceso=S.shipments.filter(x=>x.status==='EN PROCESO');
  $('suppStatsArea').innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <div onclick="openSuppManage()" style="font-family:'Syne',sans-serif;font-weight:700;font-size:14px;color:var(--text);cursor:pointer;display:flex;align-items:center;gap:5px" title="Administrar proveedores">🏭 Proveedores <span style="font-size:12px;color:var(--blue)">⚙️</span></div>
      <div style="display:flex;gap:7px;align-items:center">
        <div style="display:flex;align-items:center;gap:5px;background:var(--bg2);border:1px solid var(--bd);border-radius:8px;padding:5px 9px">
          <span style="font-size:12px">🔍</span>
          <input id="suppGlobalSearch" placeholder="Pega código..."
          onkeydown="if(!(event.ctrlKey||event.metaKey))event.preventDefault()"
          oninput="const v=this.value;this.value='';if(v.trim())globalSuppSearch(v);"
          style="background:none;border:none;outline:none;color:var(--text);font-size:11px;width:90px;caret-color:transparent">
        </div>
      </div>
    </div>
    <div id="globalSuppResult" style="display:none;background:var(--bg3);border:1px solid var(--bd);border-radius:8px;padding:9px 12px;margin-bottom:8px;font-size:12px;line-height:1.8"></div>
    <div class="supp-cards">
      ${S.suppliers.map(sup=>{
        const pending=(sup.items||[]).filter(x=>!x.done).length;
        const total=(sup.items||[]).length;
        return`<div class="supp-card ${pending>0?'has-pending':''}" onclick="openSupplier('${sup.id}')">
          <div class="supp-card-name">${sup.name}</div>
          <div class="supp-card-phone">
            <span style="font-size:11px;color:var(--blue)">📞 ${sup.phone}</span>
            <button onclick="event.stopPropagation();sendSuppList('${sup.id}')"
              style="background:rgba(46,160,67,.15);border:1px solid rgba(46,160,67,.3);color:var(--green);border-radius:6px;padding:3px 8px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap">
              💬 Enviar
            </button>
          </div>
          ${total>0?`<div class="supp-card-items">
            ${(sup.items||[]).slice(0,4).map(it=>`<div class="supp-item-row">
              <div class="supp-item-dot ${it.done?'done':''}"></div>
              <span class="supp-item-text ${it.done?'done':''}" style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${it.text}</span>
            </div>`).join('')}
            ${total>4?`<div style="font-size:10px;color:var(--text2)">+${total-4} más...</div>`:''}
          </div>`:`<div style="font-size:11px;color:var(--text2);font-style:italic;margin-top:4px">Lista vacía</div>`}
          ${pending>0?`<div style="margin-top:6px;font-size:10px;font-weight:700;color:var(--red)">⚠️ ${pending} pendiente${pending>1?'s':''}</div>`:
            total>0?`<div style="margin-top:6px;font-size:10px;font-weight:700;color:var(--green)">✅ Todo listo</div>`:''}
        </div>`;
      }).join('')}
      ${!S.suppliers.length?`<div style="font-size:12px;color:var(--text2);padding:20px;text-align:center;width:100%">Toca 🏭 Proveedores ⚙️ para agregar tu primer proveedor</div>`:''}
    </div>
    ${allReady&&enProceso.length>0?`
    <button onclick="moveAllToPorAlistar()" style="width:100%;margin-top:10px;padding:12px;background:linear-gradient(135deg,var(--green),#1a7f37);border:none;border-radius:10px;color:#fff;font-weight:700;font-size:14px;font-family:'Syne',sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px">
      ✅ Todo en stock — Pasar ${enProceso.length} pedido${enProceso.length>1?'s':''} a POR ALISTAR
    </button>`:`
    <div style="margin-top:10px;padding:9px 12px;background:var(--bg2);border-radius:8px;font-size:11px;color:var(--text2);text-align:center">
      ${S.suppliers.length===0?'Agrega proveedores para gestionar el stock':'⏳ Aún hay pendientes — completa las listas para continuar'}
    </div>`}
  `;
}

function openAllLabels(){
  const all=allStatuses();
  const porEtiqueta={};
  S.shipments.forEach(x=>{
    const g=porEtiqueta[x.status]||(porEtiqueta[x.status]={cnt:0,deuda:0});
    g.cnt++; g.deuda+=(parseFloat(x.cost)||0);
  });
  const _fmtSoles=n=>'S/ '+(Math.round((n||0)*100)/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  $('allLabelsList').innerHTML=[
    `<button class="sopt" style="background:rgba(56,139,253,.1);border-color:rgba(56,139,253,.4);color:var(--blue)" onclick="setFilt('');closeOverlay('allLabelsOverlay')">📋 TODOS</button>`,
    ...all.map((st,i)=>{
      const g=porEtiqueta[st]||{cnt:0,deuda:0};
      const cnt=g.cnt;
      const finIdx=all.indexOf('FINALIZADO');
      const activo=(finIdx<0)||(i<finIdx);
      const deuda=g.deuda;
      const monto = activo
        ? `<span style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:11px;font-weight:700;color:${deuda>0?'#f59e0b':'var(--text2)'}">${_fmtSoles(deuda)}</span>`
        : '';
      return `<button class="sopt ${stSoptClass(st)}" style="position:relative" onclick="setFilt('${st}');closeOverlay('allLabelsOverlay')">${stIcon(st)} ${st}<span style="float:right;font-size:11px;opacity:.6">${cnt}</span>${monto}</button>`;
    }),
    ...(()=>{ const n=pedidosSinEtiqueta().length; return n ? [`<button class="sopt sopt-cust" onclick="setFilt(SIN_ETIQUETA);closeOverlay('allLabelsOverlay')">🏷️ SIN ETIQUETA<span style="float:right;font-size:11px;opacity:.6">${n}</span></button>`] : []; })()
  ].join('');
  openOverlay('allLabelsOverlay');
}

function pintarSync(){
  const el=$('syncEstado'); if(!el) return;
  const chk=$('syncRapidaChk'); if(chk) chk.checked=window._syncRapidaActiva?window._syncRapidaActiva():true;
  const u=window._syncUltimo; const s=S&&S._sync;
  const hace=t=>{ const m=Math.round((Date.now()-t)/60000); return m<1?'hace un momento':(m<60?'hace '+m+' min':'hace '+Math.round(m/60)+' h'); };
  let txt = u ? (u.modo==='cambios' ? '⚡ Última: solo cambios ('+u.n+') · '+hace(u.ts)
                                    : '📦 Última: carga completa ('+u.n+') · '+hace(u.ts)+(u.motivo?' · '+u.motivo:'')) : 'Aún no sincronizó en esta sesión';
  if(s && s.full) txt += '<br>Carga completa: '+hace(s.full);
  el.innerHTML = txt;
}
async function syncTodoAhora(btn){
  if(!window._fbLoad||!window._mergeRemote) return;
  const t=btn?btn.textContent:''; if(btn){btn.disabled=true;btn.textContent='⏳ Sincronizando…';}
  try{ const r=await window._fbLoad({completa:true}); if(r) window._mergeRemote(r); }
  catch(e){ toast('⚠️ No se pudo sincronizar: '+(e&&e.message||'')); }
  finally{ if(btn){btn.disabled=false;btn.textContent=t;} pintarSync(); }
}
function syncRapidaCambiar(on){
  try{ localStorage.setItem('tt_sync_rapida', on?'on':'off'); }catch(e){}
  toast(on?'⚡ Sincronización rápida encendida en esta PC':'📦 Esta PC vuelve a la carga completa de siempre');
  pintarSync();
}

function _advVacio(){ return {campo:'envio',dateFrom:'',dateTo:'',couriers:[],costMin:'',costMax:'',doc:'any',sort:'newest'}; }
let _adv=_advVacio();
let _advActive=false;

function openAdvSearch(){
  $('asCourierList').innerHTML=S.couriers.map(c=>`<div class="as-courier-chip ${_adv.couriers.includes(c)?'active':''}" onclick="toggleAsCourier('${c.replace(/'/g,"\\'")}')">🚚 ${c}</div>`).join('');
  $('asDateFrom').value=_adv.dateFrom; $('asDateTo').value=_adv.dateTo;
  _pintarAsCampo();
  $('asCostMin').value=_adv.costMin; $('asCostMax').value=_adv.costMax;
  ['asDocAny','asDocGuia','asDocTicket','asDocNone'].forEach(id=>$(id)?.classList.remove('active'));
  const dm={any:'asDocAny',guia:'asDocGuia',ticket:'asDocTicket',none:'asDocNone'};
  $(dm[_adv.doc])?.classList.add('active');
  const sm={newest:'sortNewest',oldest:'sortOldest',name:'sortName',cost:'sortCost'};
  ['sortNewest','sortOldest','sortName','sortCost'].forEach(id=>$(id)?.classList.remove('active'));
  $(sm[_adv.sort])?.classList.add('active');
  openOverlay('advSearchOverlay');
}
function toggleAsCourier(c){
  const idx=_adv.couriers.indexOf(c);
  if(idx>=0) _adv.couriers.splice(idx,1); else _adv.couriers.push(c);
  document.querySelectorAll('.as-courier-chip').forEach(el=>el.classList.toggle('active',_adv.couriers.includes(el.textContent.replace('🚚 ','').trim())));
}
function _asEsHoy(campo, desde, hasta){
  const hoy = (typeof FechaPedido!=='undefined') ? FechaPedido.hoyLima() : '';
  return campo==='registro' && !!hoy && desde===hoy && hasta===hoy;
}
function _pintarAsCampo(){
  const hoy=_asEsHoy(_adv.campo, $('asDateFrom').value, $('asDateTo').value);
  $('asCampoEnvio')?.classList.toggle('active', _adv.campo!=='registro');
  $('asCampoRegistro')?.classList.toggle('active', _adv.campo==='registro' && !hoy);
  $('asCampoHoy')?.classList.toggle('active', hoy);
}
function setAsCampo(v){ _adv.campo=(v==='registro')?'registro':'envio'; _pintarAsCampo(); }
function asHoy(){
  const hoy=(typeof FechaPedido!=='undefined') ? FechaPedido.hoyLima() : '';
  if(!hoy) return;
  _adv.campo='registro';
  $('asDateFrom').value=hoy; $('asDateTo').value=hoy;
  _pintarAsCampo();
}
function setAsDoc(v){ _adv.doc=v; const dm={any:'asDocAny',guia:'asDocGuia',ticket:'asDocTicket',none:'asDocNone'}; ['asDocAny','asDocGuia','asDocTicket','asDocNone'].forEach(id=>$(id)?.classList.remove('active')); $(dm[v])?.classList.add('active'); }
function setSort(v){ _adv.sort=v; const sm={newest:'sortNewest',oldest:'sortOldest',name:'sortName',cost:'sortCost'}; ['sortNewest','sortOldest','sortName','sortCost'].forEach(id=>$(id)?.classList.remove('active')); $(sm[v])?.classList.add('active'); }
function applyAdvSearch(){ _adv.dateFrom=$('asDateFrom').value; _adv.dateTo=$('asDateTo').value; _adv.costMin=$('asCostMin').value; _adv.costMax=$('asCostMax').value; _advActive=hasAdvFilters(); closeOverlay('advSearchOverlay'); render(); }
function clearAdvSearch(){ _adv=_advVacio(); _advActive=false; if($('asDateFrom')){ $('asDateFrom').value=''; $('asDateTo').value=''; _pintarAsCampo(); } render(); }
function hasAdvFilters(){ return !!(  _adv.dateFrom||_adv.dateTo||_adv.couriers.length||_adv.costMin||_adv.costMax||_adv.doc!=='any'||_adv.sort!=='newest'); }
function updateAdvBar(){
  const bar=$('activeFiltersBar');
  if(!_advActive){bar.style.display='none'; $('advSearchBtn').style.color='var(--text2)'; return;}
  $('advSearchBtn').style.color='var(--blue)';
  const tags=[];
  if(_adv.dateFrom||_adv.dateTo){
    if(_asEsHoy(_adv.campo, _adv.dateFrom, _adv.dateTo)) tags.push('📅 Registrados hoy');
    else tags.push(`📅 ${_adv.campo==='registro'?'Registro':'Envío'}: ${_adv.dateFrom||'...'} → ${_adv.dateTo||'...'}`);
  }
  if(_adv.couriers.length) tags.push(`🚚 ${_adv.couriers.join(', ')}`);
  if(_adv.costMin||_adv.costMax) tags.push(`💰 S/${_adv.costMin||0}–${_adv.costMax||'∞'}`);
  if(_adv.doc!=='any') tags.push({guia:'🚚 Con guía',ticket:'🧾 Con ticket',none:'Sin docs'}[_adv.doc]||'');
  if(_adv.sort!=='newest') tags.push({oldest:'📅 Más antiguo',name:'🔤 A-Z',cost:'💰 Mayor costo'}[_adv.sort]||'');
  bar.style.cssText='display:flex;gap:5px;flex-wrap:wrap;margin-bottom:6px;align-items:center';
  bar.innerHTML=tags.map(t=>`<div class="active-filter-tag">${t}</div>`).join('')+
    `<div class="active-filter-tag" style="cursor:pointer;background:rgba(247,129,102,.12);border-color:rgba(247,129,102,.3);color:var(--red)" onclick="clearAdvSearch()">✕ Limpiar</div>`;
}

function bulkChangeStatus(){
  const sel=Seleccion.marcados();
  if(!sel.length){ toast('No hay clientes seleccionados'); return; }
  openPin(()=>{
    $('bulkStatusInfo').textContent=`Selecciona el nuevo estado para ${sel.length} cliente${sel.length>1?'s':''}`;
    $('bulkStatusOpts').innerHTML=allStatuses().map(st=>`
      <button class="sopt ${stSoptClass(st)}" onclick="applyBulkStatus('${st}')">
        <span>${stIcon(st)} ${st}</span>
      </button>`).join('');
    openOverlay('bulkStatusOverlay');
  });
}

function applyBulkStatus(st){
  const sel=Seleccion.marcados();
  sel.forEach(s=>{ s.status=st; save(s.id); });
  Seleccion.limpiar();
  render();
  closeOverlay('bulkStatusOverlay');
  toast(`✅ ${sel.length} cliente${sel.length>1?'s':''} → ${stIcon(st)} ${st}` + _avisoSaleDeActivos(st));
}

function clearSearch(){
  const inp=$('fSearch');
  if(!inp.value){ inp.focus(); return; }
  inp.value=''; inp.focus();
  clearTimeout(_buscarTimer);
  render();
}

let _filt='';
let _chipSort={};

function renderChips(){
  const all=allStatuses();
  const lbl={'PENDIENTE':'🕐 Pendiente','ENVIADO':'🚚 Enviado','ENTREGADO':'✅ Entregado'};
  const todosChip=$('chipTodos');
  if(todosChip) todosChip.className='chip '+(_filt===''?'active':'');
  $('filterChips').innerHTML=all.map(v=>{
    const sortIcon=_chipSort[v]&&_chipSort[v]!=='courier_date'?'⚙️':'';
    return`<div class="chip ${_filt===v?'active':''}"
      onclick="setFilt('${v}')"
      ondblclick="openChipSort('${v}')"
    >${stIcon(v)} ${v}${sortIcon?` <span style="font-size:9px">${sortIcon}</span>`:''}</div>`;
  }).join('') + _chipSinEtiqueta();
  if(window.ChipsNav) window.ChipsNav.verActivo();
}
function _chipSinEtiqueta(){
  const n=pedidosSinEtiqueta().length;
  if(!n){ if(_filt===SIN_ETIQUETA) _filt=''; return ''; }
  return `<div class="chip ${_filt===SIN_ETIQUETA?'active':''}" onclick="setFilt(SIN_ETIQUETA)" title="Pedidos cuya etiqueta se borró">🏷️ SIN ETIQUETA <span style="font-size:10px;opacity:.7">${n}</span></div>`;
}
function setFilt(v){
  if(_qrMove.on && v!==_qrMove.status){ _qrMoveClearTimer(); _qrMove.on=false; _qrMove.status=''; _qrMove.last=null; _qrMove.shown=null; }
  if(v === _filt) return;
  _filt=v;renderChips();render();
}

function _secuenciaFiltros(){ return ['', ...allStatuses()]; }

function filtroPuedeIr(dir){
  const sec=_secuenciaFiltros();
  let i=sec.indexOf(_filt); if(i<0) i=0;
  const j=i+dir;
  return j>=0 && j<sec.length;
}

let _navFiltroTimer=null;
function navFiltro(dir){
  const sec=_secuenciaFiltros();
  let i=sec.indexOf(_filt); if(i<0) i=0;
  const j=i+dir;
  if(j<0 || j>=sec.length) return;
  const destino=sec[j];
  if(_qrMove.on && destino!==_qrMove.status){ _qrMoveClearTimer(); _qrMove.on=false; _qrMove.status=''; _qrMove.last=null; _qrMove.shown=null; }
  _filt=destino;
  renderChips();
  if(window.ChipsNav) window.ChipsNav.actualizarFlechas();
  clearTimeout(_navFiltroTimer);
  _navFiltroTimer=setTimeout(render, 120);
}

function openChipSort(label){
  if(_qrMove.on && label!==_qrMove.status){ _qrMoveClearTimer(); _qrMove.on=false; _qrMove.status=''; _qrMove.last=null; _qrMove.shown=null; }
  _filt=label; renderChips(); render();
  _qrMoveSetupSheet(label);
  const cur=_chipSort[label]||'courier_date';
  $('chipSortTitle').textContent=`${stIcon(label)} ${label}`;
  ['courier_date','date','name','cost','cost_desc'].forEach(id=>{
    const el=$('cs_'+id); if(el) el.classList.toggle('active',cur===id);
  });
  openOverlay('chipSortOverlay');
}
function setChipSort(v){
  _chipSort[_filt]=v;
  ['courier_date','date','name','cost','cost_desc'].forEach(id=>{
    const el=$('cs_'+id); if(el) el.classList.toggle('active',v===id);
  });
  render(); renderChips();
  toast('↕️ Orden actualizado');
}

function _soloActivos(){
  return !_filt && !$('fSearch').value.trim() && !_advActive;
}

function visibleShipments(){
  const srch=$('fSearch').value.toLowerCase();
  let data=S.shipments;
  if(_filt===SIN_ETIQUETA){ const l=new Set(S.labels); data=data.filter(x=>!l.has(x.status)); }
  else if(_filt) data=data.filter(x=>x.status===_filt);
  else if(_soloActivos()) data=data.filter(x=>x.status!=='FINALIZADO');
  if(srch) data=data.filter(x=>x.name.toLowerCase().includes(srch)||x.phone.includes(srch)||(_dniDe(x)&&_dniDe(x).includes(srch))||x.address.toLowerCase().includes(srch)||x.courier.toLowerCase().includes(srch)||(typeof NroComprobante!=='undefined'&&NroComprobante.coincide(x,srch)));
  if(_advActive){
    if(typeof FechaPedido!=='undefined'){
      if(_adv.dateFrom||_adv.dateTo) data=data.filter(x=>FechaPedido.enRango(x,_adv.campo,_adv.dateFrom,_adv.dateTo));
    } else {
      if(_adv.dateFrom) data=data.filter(x=>x.date&&x.date>=_adv.dateFrom);
      if(_adv.dateTo)   data=data.filter(x=>x.date&&x.date<=_adv.dateTo);
    }
    if(_adv.couriers.length) data=data.filter(x=>_adv.couriers.includes(x.courier));
    if(_adv.costMin)  data=data.filter(x=>parseFloat(x.cost||0)>=parseFloat(_adv.costMin));
    if(_adv.costMax)  data=data.filter(x=>parseFloat(x.cost||0)<=parseFloat(_adv.costMax));
    if(_adv.doc==='guia')   data=data.filter(x=>x.docGuia);
    if(_adv.doc==='ticket') data=data.filter(x=>x.docTicket);
    if(_adv.doc==='none')   data=data.filter(x=>!x.docGuia&&!x.docTicket);
  }
  return data;
}

let _renderPedido = false;

let _pedidoMarcado = '';
let _scrollPendiente = '';
let _marcaTimer = null;
function render(){
  if(_renderPedido) return;
  _renderPedido = true;
  requestAnimationFrame(()=>{ _renderPedido = false; _renderAhora(); });
}
function renderYa(){ _renderPedido = false; _renderAhora(); }

function _renderAhora(){
  if(window.Tracking&&Tracking.checkDestinoAlerts)Tracking.checkDestinoAlerts();
  updateStats(); updateAdvBar(); _qrMoveIndicator();
  if(window.Seleccion) Seleccion._pintarBoton();
  let data=visibleShipments();

  data=data.slice().sort((a,b)=>{
    const ta=a.createdAt?new Date(a.createdAt).getTime():(a._localTs||0);
    const tb=b.createdAt?new Date(b.createdAt).getTime():(b._localTs||0);
    return tb-ta;
  });

  if(_advActive){
    const _tsReg=x=>{ const t=x.createdAt?new Date(x.createdAt).getTime():0; return isNaN(t)?0:t; };
    if(_adv.campo==='registro' && (_adv.sort==='oldest'||_adv.sort==='newest'))
      data=[...data].sort((a,b)=>_adv.sort==='oldest' ? _tsReg(a)-_tsReg(b) : _tsReg(b)-_tsReg(a));
    else if(_adv.sort==='oldest') data=[...data].sort((a,b)=>(a.date||'').localeCompare(b.date||''));
    else if(_adv.sort==='newest') data=[...data].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
    else if(_adv.sort==='name') data=[...data].sort((a,b)=>a.name.localeCompare(b.name));
    else if(_adv.sort==='cost') data=[...data].sort((a,b)=>parseFloat(b.cost||0)-parseFloat(a.cost||0));
  } else {
    const sort=_filt?(_chipSort[_filt]||'courier_date'):'courier_date';
    if(sort==='courier_date')      data=[...data].sort((a,b)=>a.courier.localeCompare(b.courier)||b.date.localeCompare(a.date));
    else if(sort==='date')         data=[...data].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
    else if(sort==='name')         data=[...data].sort((a,b)=>a.name.localeCompare(b.name));
    else if(sort==='cost')         data=[...data].sort((a,b)=>parseFloat(a.cost||0)-parseFloat(b.cost||0));
    else if(sort==='cost_desc')    data=[...data].sort((a,b)=>parseFloat(b.cost||0)-parseFloat(a.cost||0));
  }
  if(_qrMove.on && _qrMove.shown){
    data = data.filter(x=>x.id===_qrMove.shown);
  }
  const groups={};
  data.forEach(x=>{if(!groups[x.courier])groups[x.courier]=[];groups[x.courier].push(x)});
  const area=$('cardsArea');
  if(!data.length){
    const fin = _soloActivos()
      ? S.shipments.filter(x=>x.status==='FINALIZADO').length : 0;
    area.innerHTML = fin
      ? `<div class="empty-st"><div style="font-size:36px">🎉</div>
         <p style="margin-top:10px">Nada pendiente — todo al día.</p>
         <p style="margin-top:6px;font-size:12px;color:#8b949e;cursor:pointer"
            onclick="setFilt('FINALIZADO')">🏁 Ver los <b>${fin}</b> finalizados →</p></div>`
      : '<div class="empty-st"><div style="font-size:36px">📭</div><p style="margin-top:10px">Sin envíos. Presiona ➕</p></div>';
    return;
  }
  const _ocultos = _soloActivos()
    ? S.shipments.filter(x=>x.status==='FINALIZADO').length : 0;
  const _pieOcultos = _ocultos
    ? `<div onclick="setFilt('FINALIZADO')" style="margin:14px auto 4px;padding:11px;
        max-width:420px;text-align:center;cursor:pointer;border-radius:10px;
        background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.18);
        font-size:12px;color:#8b949e">
        🏁 <b style="color:#22c55e">${_ocultos}</b> finalizado${_ocultos===1?'':'s'} oculto${_ocultos===1?'':'s'}
        <span style="color:var(--blue);font-weight:700;margin-left:6px">ver →</span></div>`
    : '';
  area.innerHTML=Object.entries(groups).map(([courier,items])=>`
    <div class="cgroup">
      <div class="cgroup-hdr"><div class="cgroup-bar"></div><span>${_courierIcon(courier)}</span><div class="cgroup-name">${escH(courier)}</div><div class="cgroup-spacer"></div><button class="cgroup-btn" title="Imprimir ${escH(courier)}" onclick="printGroup('${escJs(courier)}')">🖨️</button><div class="cgroup-spacer"></div><div class="cgroup-actions"><button class="cgroup-btn" title="Tarjeta anterior" onclick="scrollCard(-1)">▲</button><button class="cgroup-btn" title="Tarjeta siguiente" onclick="scrollCard(1)">▼</button></div><div class="cgroup-cnt">${items.length}</div></div>
      ${items.map(s=>cardHTML(s)).join('')}
    </div>`).join('') + _pieOcultos;

  if(_scrollPendiente){
    const _c = area.querySelector('.card[data-id="' +
      String(_scrollPendiente).replace(/["\\]/g, '\\$&') + '"]');
    _scrollPendiente = '';
    if(_c){
      try{ _c.scrollIntoView({behavior:'smooth', block:'center'}); }
      catch(e){ try{ _c.scrollIntoView(); }catch(_){} }
    }
  }
}

function escH(s){ return s==null?'':String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function escJs(s){ return String(s==null?'':s).replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }

function _courierIcon(name){
  var u=(name||'').toUpperCase();
  if(u.includes('SHALOM'))                              return '🚌';
  if(u.includes('OLVA'))                                return '📬';
  if(u.includes('MARVISUR'))                            return '🚐';
  if(u.includes('DINSIDES'))                            return '📦';
  if(u.includes('DELIVERY')||u.includes('MOTORIZADO')) return '🛵';
  if(u.includes('RETIRO')||u.includes('TIENDA'))        return '🏪';
  if(u.includes('ENCOMIENDA')||u.includes('OTRAS'))     return '📦';
  return '🚚';
}
function printGroup(courier){
  let sel=visibleShipments().filter(s=>s.courier===courier && Seleccion.tiene(s.id));
  if(!sel.length){ if(window.toast) toast('Selecciona pedidos de '+courier+' para imprimir 🖨️'); return; }
  if(courier&&courier.toUpperCase().includes('DELIVERY')&&window.DeliveryModule&&DeliveryModule.sortForRoute){
    sel=DeliveryModule.sortForRoute(sel);
  }
  if(window.PrintModule) PrintModule.openList(sel.map(s=>s.id));
  else if(window.toast) toast('Impresión no disponible');
}
function _altoFijoArriba(card){
  const alto=(e)=>e?e.getBoundingClientRect().height:0;
  const grupo=card&&card.closest?card.closest('.cgroup'):null;
  const ch=(grupo&&grupo.querySelector('.cgroup-hdr'))||document.querySelector('.cgroup-hdr');
  if(ch){ const top=parseFloat(getComputedStyle(ch).top); if(isFinite(top)) return top+alto(ch); }
  return alto(document.querySelector('.hdr'))+alto(document.querySelector('.tabs'))+(ch?alto(ch):44);
}
function scrollCard(dir){
  const cards=document.querySelectorAll('#cardsArea .card');
  if(!cards.length) return;
  let cur=0, best=Infinity;
  for(let i=0;i<cards.length;i++){
    const d=Math.abs(cards[i].getBoundingClientRect().top-(_altoFijoArriba(cards[i])+6));
    if(d<best){ best=d; cur=i; }
  }
  const t=Math.max(0,Math.min(cards.length-1, cur+dir));
  const y=window.scrollY + cards[t].getBoundingClientRect().top - (_altoFijoArriba(cards[t])+6);
  window.scrollTo({top:Math.max(0,y), behavior:'smooth'});
}
function escU(u){ u=String(u==null?'':u).trim(); return (/^https?:\/\//i.test(u)||/^data:image\//i.test(u))?escH(u):'#'; }
function _montoCard(s){
  if(typeof MontoPedido!=='undefined' && MontoPedido.esNuevo(s)){
    const e=MontoPedido.de(s);
    return `<span class="meta">💰 ${MontoPedido.html(e)}</span>`;
  }
  return s.cost?`<span class="meta">💰 S/ ${escH(s.cost)}</span>`:'';
}
function _btnImprimir(s){
  const on = (window.PrintModule && PrintModule.impreso) ? PrintModule.impreso(s) : !!(s && s.printed);
  return `<button class="wa-btn prn-btn${on?' on':''}" onclick="event.stopPropagation();if(window.PrintModule)PrintModule.openOne('${s.id}')" title="${on?'Impreso — imprimir otra vez':'Imprimir este pedido'}">🖨️</button>`;
}
function cardHTML(s){
  const gChk=s.chkGuia||false, tChk=s.chkTicket||false, eChk=s.chkEmbalado||false;
  const msgs=S.msgTemplates[s.status]||['',''];
  const m1=msgs[0]&&msgs[0].trim(), m2=msgs[1]&&msgs[1].trim();
  const pvtNote=s.privateNote||'';
  const _marcada = (_pedidoMarcado === s.id) ? ' notify-card-highlight' : '';
  return `<div class="card${_marcada}" data-id="${s.id}">
    <div class="card-top">
      <div class="chk ${Seleccion.tiene(s.id)?'on':''}" onclick="toggleSel('${s.id}')">${Seleccion.tiene(s.id)?'✓':''}</div>
      <div class="cname" 
        onclick="togglePvtNote('${s.id}')" 
        ondblclick="event.stopPropagation();openPrivateNote('${s.id}')"
        style="cursor:pointer;flex:1;user-select:none">
        ${escH(s.name)}${pvtNote?` <span style="font-size:11px;color:var(--purple);opacity:.7">🔒</span>`:''}
      </div>
      ${_btnImprimir(s)}
      <button class="wa-btn" onclick="event.stopPropagation();if(window.Cotizacion)Cotizacion.abrir('${s.id}')" title="Cotización">🧾${(Array.isArray(s.cotizItems)&&s.cotizItems.length)?`<span style="font-size:9px;font-weight:700;color:var(--blue);margin-left:1px">${s.cotizItems.length}</span>`:''}</button>
      <button class="wa-btn" onclick="openWA('${s.id}')">💬</button>
    </div>
    ${pvtNote?`<div class="pvt-note" id="pvt_${s.id}" style="display:none" ondblclick="openPrivateNote('${s.id}')">🔒 ${escH(pvtNote)}</div>`:''}
    <div class="card-meta">
      <span class="meta">${esUsuarioWA(s.phone)?'':`<a href="tel:+51${escH(s.phone)}" class="ph-call" onclick="event.stopPropagation()" title="Llamar">📞</a>`}${escH(s.phone)}<button class="ph-copy" onclick="event.stopPropagation();copyPhone('${escH(s.phone)}')" title="Copiar número"><svg viewBox="0 0 448 512" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M320 448v40c0 13.255-10.745 24-24 24H24c-13.255 0-24-10.745-24-24V120c0-13.255 10.745-24 24-24h72v296c0 30.879 25.121 56 56 56h168zm0-344V0H152c-13.255 0-24 10.745-24 24v368c0 13.255 10.745 24 24 24h272c13.255 0 24-10.745 24-24V128H344c-13.2 0-24-10.8-24-24zm120.971-31.029L375.029 7.029A24 24 0 0 0 358.059 0H352v96h96v-6.059a24 24 0 0 0-7.029-16.97z"/></svg></button></span>
      <span class="meta">📅 ${escH(s.date||'—')} <button onclick="copyCardLink('${s.id}')" title="Copiar link" style="background:none;border:none;color:#388bfd;font-size:11px;cursor:pointer;padding:0 0 0 2px;vertical-align:middle">🔗</button></span>
      ${_montoCard(s)}
      ${(window.NroComprobante&&NroComprobante.de(s))?`<span class="meta" title="Factura / Boleta" style="opacity:.75">🧾 ${escH(NroComprobante.de(s))}</span>`:''}
    </div>
    ${(s.courier||'').toUpperCase().includes('ENCOMIENDA')?((s.ciudadDestino||s.address)?`<div class="card-addr">📦 ${escH(s.ciudadDestino||s.address)}${s.encAgencia?' · 🏪 '+escH(s.encAgencia):''}</div>`:''): (s.address?`<div class="card-addr">🏠 ${escH(s.address)}</div>`:'' )}
    ${s.notes?`<div class="card-note">📝 ${escH(s.notes)}</div>`:''}
    ${cardDocs(s,gChk,tChk,eChk)}
    ${(s.trackingOrderNumber||s.shalomGuia)&&typeof Tracking!=='undefined'?Tracking.renderCardBlock(s):''}
    ${dlvDriverBlock(s)}
    ${(m1||m2)?`<div class="card-msgs">
      ${m1?`<button class="card-msg card-msg-a" onclick="quickMsg('${s.id}',0)"><span class="card-msg-ltr">A</span><span class="card-msg-txt">${escH(fillVars(m1,s).substring(0,70))}${fillVars(m1,s).length>70?'…':''}</span></button>`:''}
      ${m2?`<button class="card-msg card-msg-b" onclick="quickMsg('${s.id}',1)"><span class="card-msg-ltr">B</span><span class="card-msg-txt">${escH(fillVars(m2,s).substring(0,70))}${fillVars(m2,s).length>70?'…':''}</span></button>`:''}
    </div>`:''}
    <div class="card-actions">
      <button class="btn-st ${stClass(s.status)}" onclick="openStatus('${s.id}')" style="${!_filt?'opacity:.5;cursor:default':''}">
        ${stIcon(s.status)} ${escH(s.status)}${!_filt?' 🔒':''}
      </button>
      <button class="btn-edit" onclick="openForm('${s.id}')">✏️</button>
      <button class="btn-del" onclick="openDel('${s.id}')">🗑️</button>
    </div>
    ${(_qrMove.on && _qrMove.last && _qrMove.last.id===s.id)?`<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;padding:8px 10px;background:rgba(163,113,247,.10);border:1px solid rgba(163,113,247,.30);border-radius:9px;font-size:12px;color:var(--text)"><span>🔄 ${escH(_qrMove.last.prev)} → <b>${escH(s.status)}</b></span><button onclick="qrMoveRevertAsk('${s.id}')" style="background:rgba(247,129,102,.15);border:1px solid rgba(247,129,102,.3);color:var(--red);border-radius:7px;padding:5px 10px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">↩ Revertir</button></div>`:''}
  </div>`;
}

function dlvDriverBlock(s){
  if(!(s.courier||'').toUpperCase().includes('DELIVERY')) return '';
  const drv=s._dlvDriver||'', tel=s._dlvDriverPhone||'', link=s._dlvRutaLink||'';
  if(!drv && !link) return '';
  return `<div class="trk-block" style="background:rgba(163,113,247,.05);border-color:rgba(163,113,247,.18)">
    <div class="trk-title" style="color:#a371f7"><span>🛵 Motorizado</span></div>
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <div style="flex:1;min-width:0;font-size:11px;color:#8b949e">
        ${drv?`<b style="color:#e6edf3;font-size:12.5px">${escH(drv)}</b>`:'<i>Sin asignar</i>'}
        ${tel?` · <a href="tel:+51${escH(tel)}" style="color:var(--blue);font-weight:700;text-decoration:none">${escH(tel)}</a>
          <a href="https://wa.me/51${escH(tel)}" target="_blank" rel="noopener" style="color:#25d366;text-decoration:none;margin-left:4px">💬</a>`:''}
      </div>
      ${link?`<a href="${escH(link)}" target="_blank" rel="noopener" class="link-chip" style="text-decoration:none;flex-shrink:0">🔗 inDriver</a>`:''}
    </div>
  </div>`;
}

function _docMini(doc, icono){
  if(doc && doc.pendiente) return `<div class="doc-thumb-pdf" title="Por subir"><span style="font-size:18px">⏳</span></div>`;
  if(doc && doc.t && doc.t.startsWith('image/') && doc.d && doc.d!=='[img]'){
    return `<img src="${escU(doc.m||doc.d)}" loading="lazy" decoding="async" alt="" style="width:52px;height:66px;object-fit:cover;display:block">`;
  }
  if(doc && doc.d==='[img]') return `<div class="doc-thumb-pdf" title="Documento perdido: vuelve a subirlo"><span style="font-size:18px">⚠️</span></div>`;
  return `<div class="doc-thumb-pdf"><span style="font-size:20px">${icono}</span></div>`;
}
function cardDocs(s,gChk,tChk,eChk){
  const has=s.docGuia||s.docEmbalado||s.docTicket||(s.links&&s.links.length);
  if(!has)return'';
  return`<div class="card-docs">
    ${s.docGuia?`<div class="doc-thumb" style="border:2px solid ${gChk?'var(--green)':'var(--bd)'}">
      <div onclick="qView('${s.id}','guia')">${_docMini(s.docGuia,'📄')}</div>
      <div class="doc-lbl">GUÍA</div>
      <div class="doc-chk ${gChk?'on-g':''}" onclick="event.stopPropagation();togDoc('${s.id}','guia')">${gChk?'✓':''}</div>
    </div>`:''}
    ${s.docEmbalado?`<div class="doc-thumb" style="border:2px solid ${eChk?'var(--blue)':'var(--bd)'}">
      <div onclick="qView('${s.id}','embalado')">${_docMini(s.docEmbalado,'📦')}</div>
      <div class="doc-lbl">EMBALADO</div>
      <div class="doc-chk ${eChk?'on-e':''}" onclick="event.stopPropagation();togDoc('${s.id}','embalado')">${eChk?'✓':''}</div>
    </div>`:''}
    ${s.docTicket?`<div class="doc-thumb" style="border:2px solid ${tChk?'var(--purple)':'var(--bd)'}">
      <div onclick="qView('${s.id}','ticket')">${_docMini(s.docTicket,'🧾')}</div>
      <div class="doc-lbl">TICKET</div>
      <div class="doc-chk ${tChk?'on-t':''}" onclick="event.stopPropagation();togDoc('${s.id}','ticket')">${tChk?'✓':''}</div>
    </div>`:''}
    ${(s.links||[]).map(l=>`<a href="${escU(l.u)}" target="_blank" rel="noopener" class="link-chip" style="text-decoration:none;cursor:pointer">🔗 ${escH(l.n)}</a>`).join('')}
  </div>`;
}

function saveLocal(){ try{ _guardarCopiaLocal(); }catch(e){} }
function toggleSel(id){ Seleccion.alternar(id); }
function selAll(){
  if(Seleccion.hayAlguno()) Seleccion.limpiar();
  else Seleccion.marcar(visibleShipments().map(x=>x.id));
}

let _buscarTimer=null;
function buscarDebounce(){
  clearTimeout(_buscarTimer);
  _buscarTimer=setTimeout(render, 150);
}

function togDoc(id,slot){const s=S.shipments.find(x=>x.id===id);if(!s)return;if(slot==='guia')s.chkGuia=!s.chkGuia;else if(slot==='embalado')s.chkEmbalado=!s.chkEmbalado;else s.chkTicket=!s.chkTicket;save(id);render()}
