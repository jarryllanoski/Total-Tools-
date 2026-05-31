/**
 * config.js — Módulo de configuración para Total Tools
 * Contiene: datos del negocio, despacho, etiquetas, couriers, campos extra, PIN
 * Requiere: index.html (variables globales S, save, toast, $, openOverlay, closeOverlay, FIXED_LABELS, FIXED_COURIERS)
 */

/* ── HTML DE LA SECCIÓN CONFIG ──────────────────────────────────────
 * El HTML del page-configurar permanece en index.html
 * Este módulo solo contiene las funciones JS
 * ──────────────────────────────────────────────────────────────── */

function openPin(cb){
  _pinEntry=''; _pinCallback=cb;
  updatePinDots();
  $('pinMsg').textContent='Ingresa la clave para cambiar el estado';
  $('pinMsg').style.color='var(--text2)';
  openOverlay('pinOverlay');
}
function pinTap(d){
  if(_pinEntry.length>=4) return;
  _pinEntry+=d;
  updatePinDots();
  if(_pinEntry.length===4) setTimeout(checkPin,150);
}
function pinDel(){
  _pinEntry=_pinEntry.slice(0,-1);
  updatePinDots();
}
function updatePinDots(){
  for(let i=0;i<4;i++){
    const dot=$('pd'+i);
    dot.classList.toggle('filled',i<_pinEntry.length);
    dot.classList.remove('error');
  }
}
function checkPin(){
  if(_pinEntry===S.statusPin){
    closeOverlay('pinOverlay');
    if(_pinCallback){ _pinCallback(); _pinCallback=null; }
  } else {
    $('pinMsg').textContent='❌ Clave incorrecta';
    $('pinMsg').style.color='var(--red)';
    for(let i=0;i<4;i++) $('pd'+i).classList.add('error');
    setTimeout(()=>{ _pinEntry=''; updatePinDots(); $('pinMsg').textContent='Ingresa la clave'; $('pinMsg').style.color='var(--text2)'; },700);
  }
}
let _trashTapTimer=null, _trashTaps=0;
function onTrashBtnTap(){
  _trashTaps++;
  clearTimeout(_trashTapTimer);
  if(_trashTaps>=2){ _trashTaps=0; openTrash(); return; }
  _trashTapTimer=setTimeout(()=>{ 
    _trashTaps=0;
    delSelected(); // single tap = delete selected
  },350);
}

function openTrash(){
  // Auto-purge items older than 30 days
  const now=Date.now();
  const before=S.trash.length;
  S.trash=S.trash.filter(x=>(now-x.deletedAt)<30*24*60*60*1000);
  if(S.trash.length!==before) save();

  if(!S.trash.length){
    $('trashList').innerHTML='<div style="text-align:center;padding:24px;color:var(--text2)">🗑️<br><br>La papelera está vacía</div>';
  } else {
    $('trashList').innerHTML=S.trash.map((item,i)=>{
      const days=Math.floor((Date.now()-item.deletedAt)/(24*60*60*1000));
      const remaining=30-days;
      const warn=remaining<=5;
      return`<div class="trash-item">
        <div class="trash-item-info">
          <div class="trash-item-name">${item.shipment.name}</div>
          <div class="trash-item-meta">📞 ${item.shipment.phone} · 🚚 ${item.shipment.courier}</div>
          <div class="trash-item-meta">📅 Eliminado hace ${days===0?'hoy':days+' día'+(days>1?'s':'')}</div>
        </div>
        <span class="trash-item-days ${warn?'trash-days-warn':'trash-days-ok'}">${remaining}d</span>
        <button class="trash-restore" onclick="restoreTrash(${i})">↩ Recuperar</button>
      </div>`;
    }).join('');
  }
  openOverlay('trashOverlay');
}

function restoreTrash(i){
  const item=S.trash[i];if(!item)return;
  item.shipment.sel=false;
  S.shipments.push(item.shipment);
  S.trash.splice(i,1);
  save();render();openTrash();toast(`✅ ${item.shipment.name} recuperado`);
}

function emptyTrash(){
  if(!S.trash.length){toast('La papelera ya está vacía');return}
  $('delMsg').textContent=`¿Eliminar definitivamente ${S.trash.length} envío(s)? Esto no se puede deshacer.`;
  $('delYes').style.background='var(--red)';
  $('delYes').textContent='Eliminar definitivamente';
  $('delYes').onclick=()=>{S.trash=[];save();closeOverlay('delOverlay');openTrash();toast('🗑️ Papelera vaciada')};
  openOverlay('delOverlay');
}

/* WA SHEET */
let _waId=null, _waMsgIdx=-1;
function openWA(id){
  _waId=id; _waMsgIdx=-1;
  const s=S.shipments.find(x=>x.id===id);if(!s)return;
  const gChk=s.chkGuia||false, tChk=s.chkTicket||false;
  const msgs=S.msgTemplates[s.status]||['',''];
  const hasMsg=(msgs[0]&&msgs[0].trim())||(msgs[1]&&msgs[1].trim());

  // Sin docs marcados y sin mensajes → WhatsApp directo
  if(!gChk&&!tChk&&!hasMsg){
    window.open(`https://wa.me/51${s.phone}`,'_blank');
    return;
  }

  // Sin docs marcados pero con mensajes → abrir sheet solo con mensajes
  // Con docs marcados → abrir sheet completo
  $('waInfo').innerHTML=`<div style="font-weight:700;font-size:14px;margin-bottom:4px">${s.name}</div><div style="color:var(--blue)">📞 +51 ${s.phone}</div><div style="color:var(--text2);font-size:12px;margin-top:2px">🏠 ${s.address}</div>`;
  let html='';
  if(s.docGuia||s.docTicket){
    html+=`<div style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;margin-bottom:8px">Documentos a enviar:</div><div class="wa-doc-grid">`;
    if(s.docGuia){html+=waDT(s.docGuia,gChk,'guia','var(--green)');}
    if(s.docTicket){html+=waDT(s.docTicket,tChk,'ticket','var(--purple)');}
    html+='</div>';
  }
  if(hasMsg){
    html+=`<div style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;margin:12px 0 8px">Mensaje a enviar:</div>`;
    html+=`<div id="waMN" class="wa-msg-none sel" onclick="selWAMsg(-1)">✉️ Sin mensaje</div>`;
    if(msgs[0]&&msgs[0].trim())html+=`<div id="waM0" class="wa-msg-opt" onclick="selWAMsg(0)"><div class="wa-msg-lbl">MENSAJE A</div><div class="wa-msg-txt">${fillVars(msgs[0],s)}</div></div>`;
    if(msgs[1]&&msgs[1].trim())html+=`<div id="waM1" class="wa-msg-opt" onclick="selWAMsg(1)"><div class="wa-msg-lbl">MENSAJE B</div><div class="wa-msg-txt">${fillVars(msgs[1],s)}</div></div>`;
  }
  $('waBody').innerHTML=html;
  openOverlay('waOverlay');
}
function waDT(doc,chk,slot,color){
  return`<div onclick="event.stopPropagation();togWADoc('${slot}')" style="position:relative;cursor:pointer;border-radius:9px;overflow:hidden;border:2px solid ${chk?color:'var(--bd)'};${chk?'box-shadow:0 0 0 2px rgba(46,160,67,.25)':''}">
    ${doc.t&&doc.t.startsWith('image/')?`<img src="${doc.d}" style="width:80px;height:100px;object-fit:cover;display:block">`:`<div class="wa-doc-pdf"><span style="font-size:28px">${slot==='guia'?'📄':'🧾'}</span></div>`}
    <div class="wa-doc-lbl">${slot==='guia'?'GUÍA':'TICKET'}</div>
    <div id="waChk_${slot}" class="wa-doc-chk" style="background:${chk?(slot==='guia'?'var(--green)':'var(--purple)'):'rgba(0,0,0,.3)'};">${chk?'✓':''}</div>
  </div>`;
}
function togWADoc(slot){
  const s=S.shipments.find(x=>x.id===_waId);if(!s)return;
  if(slot==='guia')s.chkGuia=!s.chkGuia;else s.chkTicket=!s.chkTicket;
  save();render();openWA(_waId);
}
function selWAMsg(idx){
  _waMsgIdx=idx;
  ['waMN','waM0','waM1'].forEach(id=>{const e=$(id);if(e)e.classList.remove('sel')});
  const el=$(idx===-1?'waMN':'waM'+idx);if(el)el.classList.add('sel');
}
async function doWASend(){
  const s=S.shipments.find(x=>x.id===_waId);if(!s)return;
  const gChk=s.chkGuia||false,tChk=s.chkTicket||false;
  const phone='51'+s.phone;
  let msg='';
  if(_waMsgIdx>=0){const msgs=S.msgTemplates[s.status]||['',''];const t=msgs[_waMsgIdx];if(t&&t.trim())msg=fillVars(t,s)}
  if(!gChk&&!tChk){window.open(msg?`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`:`https://wa.me/${phone}`,'_blank');closeOverlay('waOverlay');return}
  closeOverlay('waOverlay');
  const docs=[];
  if(gChk&&s.docGuia)docs.push({doc:s.docGuia,label:'Guia'});
  if(tChk&&s.docTicket)docs.push({doc:s.docTicket,label:'Ticket'});
  if(navigator.share){
    try{
      async function b2f(d,n){const r=await fetch(d);const b=await r.blob();return new File([b],n,{type:b.type})}
      const files=await Promise.all(docs.map(({doc,label})=>b2f(doc.d,`${label}.${doc.t.includes('pdf')?'pdf':doc.t.includes('png')?'png':'jpg'}`)));
      if(navigator.canShare&&navigator.canShare({files})){await navigator.share({files,title:s.name,text:msg||''});setTimeout(()=>window.open(`https://wa.me/${phone}${msg?'?text='+encodeURIComponent(msg):''}`,`_blank`),800);return}
    }catch(e){if(e.name==='AbortError')return}
  }
  // Fallback screen
  const div=document.createElement('div');
  div.style.cssText='position:fixed;inset:0;background:#0d1117;z-index:600;overflow-y:auto;padding:16px';
  div.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
    <div style="font-family:Syne,sans-serif;font-weight:700;font-size:16px">📤 Compartir documentos</div>
    <button onclick="this.closest('div[style]').remove()" style="background:rgba(247,129,102,.15);border:1px solid rgba(247,129,102,.3);color:#f78166;border-radius:7px;width:32px;height:32px;font-size:16px;cursor:pointer">✕</button>
  </div>
  <div style="background:#161b22;border:1px solid #30363d;border-radius:10px;padding:12px;margin-bottom:12px;font-size:12px;color:#8b949e;line-height:1.7">
    1️⃣ Toca <b style="color:#388bfd">Descargar</b> cada documento<br>
    2️⃣ Ve a tu galería y compártelo a WhatsApp<br>
    3️⃣ Toca <b style="color:#25d366">Abrir WhatsApp</b> abajo
  </div>
  ${docs.map(({doc,label})=>`<div style="background:#1c2333;border:1px solid #30363d;border-radius:10px;overflow:hidden;margin-bottom:10px">
    <div style="padding:10px 12px;border-bottom:1px solid #30363d;display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:12px;font-weight:700">${label}</span>
      <a href="${doc.d}" download="${label}.${doc.t.includes('pdf')?'pdf':'jpg'}" style="background:#388bfd;color:#fff;border-radius:7px;padding:5px 12px;font-size:11px;font-weight:700;text-decoration:none">⬇ Descargar</a>
    </div>
    ${doc.t&&doc.t.startsWith('image/')?`<img src="${doc.d}" style="width:100%;max-height:200px;object-fit:contain;background:#0d1117;display:block">`:`<div style="padding:20px;text-align:center;font-size:32px">📄</div>`}
  </div>`).join('')}
  <a href="https://wa.me/${phone}${msg?'?text='+encodeURIComponent(msg):''}" target="_blank" style="display:block;width:100%;padding:13px;background:#25d366;border-radius:10px;color:#fff;font-weight:700;font-size:14px;text-align:center;text-decoration:none;margin-top:4px">💬 Abrir WhatsApp</a>
  <div style="height:30px"></div>`;
  document.body.appendChild(div);
}

/* DOC MENU */
function trigInp(inputId,slot){closeDocMenu(slot);setTimeout(()=>$(inputId).click(),50)}
function toggleDocMenu(slot){const m=$('menu'+cap(slot));const o=m.classList.contains('open');document.querySelectorAll('.doc-menu').forEach(x=>x.classList.remove('open'));if(!o)m.classList.add('open')}
function closeDocMenu(slot){const e=$('menu'+cap(slot));if(e)e.classList.remove('open')}
document.addEventListener('click',e=>{if(!e.target.closest('.doc-sw')&&!e.target.classList.contains('doc-add'))document.querySelectorAll('.doc-menu').forEach(m=>m.classList.remove('open'))});

/* DOC SLOTS */
let _docs={guia:null,embalado:null,ticket:null};
function loadDoc(input,slot){
  const file=input.files[0];if(!file)return;
  if(file.size>8*1024*1024){toast('⚠️ Máximo 8MB');return}
  const r=new FileReader();
  r.onload=e=>{
    _docs[slot]={d:e.target.result,n:file.name,t:file.type};
    refreshSlot(slot);
    // Mensajes y auto-cambio de estado
    if(slot==='guia'){
      toast('🚚 Guía subida ✓');
      // Auto-cambio a ENVIADO si estaba en estados anteriores
      const autoSts=['NUEVO PEDIDO','EN PROCESO','POR ALISTAR','ALISTADO'];
      if(_editId){
        const ship=window.S&&window.S.shipments&&window.S.shipments.find(x=>x.id===_editId);
        if(ship&&autoSts.includes(ship.status)){
          ship.status='ENVIADO';
          // Actualizar el selector de status en el form
          const fStatus=$('fStatus');
          if(fStatus) fStatus.value='ENVIADO';
          toast('🚚 Guía subida → Estado cambiado a ENVIADO');
        }
      }
    } else if(slot==='embalado'){
      toast('📦 Foto de embalado subida ✓');
      // Auto-cambio a ALISTADO si estaba en POR ALISTAR
      if(_editId){
        const ship=window.S&&window.S.shipments&&window.S.shipments.find(x=>x.id===_editId);
        if(ship&&(ship.status==='POR ALISTAR'||ship.status==='EN PROCESO')){
          ship.status='ALISTADO';
          const fStatus=$('fStatus');
          if(fStatus) fStatus.value='ALISTADO';
          toast('📦 Embalado → Estado cambiado a ALISTADO');
        }
      }
    } else {
      toast('🧾 Documento subido ✓');
    }
  };
  r.readAsDataURL(file);
}
function refreshSlot(slot){
  const doc=_docs[slot],Slot=cap(slot);
  const prev=$('prev'+Slot),act=$('act'+Slot),btn=$('addBtn'+Slot),lbl=$('lbl'+Slot);
  const meta={
    guia:     {icon:'🚚',label:'Guía courier',  cls:'fg'},
    embalado: {icon:'📦',label:'Embalado',       cls:'fe'},
    ticket:   {icon:'🧾',label:'Ticket / Boleta',cls:'ft'},
  };
  const m=meta[slot]||{icon:'📄',label:slot,cls:''};
  if(!doc){
    prev.innerHTML=`<div class="doc-empty"><div style="font-size:28px">${m.icon}</div><div style="font-size:11px;font-weight:700">${m.label}</div></div>`;
    if(btn)btn.style.display='block';act.style.display='none';lbl.className='doc-tap';return;
  }
  lbl.className='doc-tap '+m.cls;if(btn)btn.style.display='none';act.style.display='flex';
  if(doc.t&&doc.t.startsWith('image/')){
    prev.innerHTML=`<div class="doc-full"><img src="${doc.d}" style="width:100%;height:100%;object-fit:cover;display:block"><div class="doc-ok">✓</div></div>`;
  } else {
    const sn=doc.n.length>16?doc.n.substring(0,16)+'…':doc.n;
    prev.innerHTML=`<div class="doc-full"><div class="doc-full-pdf"><span style="font-size:32px">📄</span><span style="font-size:10px;color:var(--text2);text-align:center;padding:0 6px;word-break:break-all">${sn}</span></div><div class="doc-ok">✓ PDF</div></div>`;
  }
}
function clearSlot(slot){_docs[slot]=null;const Slot=cap(slot);['Cam','Gal','Pdf'].forEach(s=>{const e=$('in'+Slot+s);if(e)e.value=''});refreshSlot(slot);toast('Documento quitado ✓')}
function viewSlot(slot){
  const d=_docs[slot];if(!d)return;
  const labels={guia:'🚚 Guía courier',embalado:'📦 Embalado',ticket:'🧾 Ticket / Boleta'};
  openViewer(d,labels[slot]||slot);
}

/* VIEWER */
let _curDoc=null;
function openViewer(doc,title){_curDoc=doc;if(doc.t&&doc.t.startsWith('image/')){$('viewerImg').src=doc.d;$('viewerTtl').textContent=title;$('viewer').classList.add('open')}else{const a=document.createElement('a');a.href=doc.d;a.target='_blank';a.click()}}
function closeViewer(){$('viewer').classList.remove('open');$('viewerImg').src=''}
function dlDoc(){if(!_curDoc)return;const a=document.createElement('a');a.href=_curDoc.d;a.download=_curDoc.n||'doc';a.click()}
function qView(shipId,slot){const s=S.shipments.find(x=>x.id===shipId);if(!s)return;const d=slot==='guia'?s.docGuia:s.docTicket;if(!d)return;openViewer(d,slot==='guia'?'🚚 Guía Courier':'🧾 Ticket / Boleta')}
$('viewer').addEventListener('click',e=>{if(e.target===$('viewer'))closeViewer()});

/* LINKS */
let _links=[];
function addLink(){const v=$('fLink').value.trim();if(!v){toast('Ingresa un link');return}if(!v.startsWith('http')){toast('⚠️ Link inválido');return}const n=v.length>36?v.substring(0,36)+'…':v;_links.push({u:v,n});renderLinks();$('fLink').value='';toast('🔗 Agregado')}
function removeLink(i){_links.splice(i,1);renderLinks()}
function renderLinks(){$('linkListForm').innerHTML=_links.map((l,i)=>`<div class="link-item"><span>🔗</span><div class="link-name">${l.n}</div><a href="${l.u}" target="_blank" style="color:var(--blue);font-size:12px;text-decoration:none">↗</a><button class="link-del" type="button" onclick="removeLink(${i})">✕</button></div>`).join('')}

/* FORM */
let _editId=null;
function openForm(id){
  // Resetear acordeón de documentos a cerrado
  var body = document.getElementById('docsBody');
  var arrow = document.getElementById('docsArrow');
  if(body) body.classList.remove('open');
  if(arrow) arrow.classList.remove('open');
  _editId=id;$('formTitle').textContent=id?'Editar Envío':'Nuevo Envío';
  const activeCouriers = S.couriers.filter(c => S.courierActive[c] !== false);
  $('fCourier').innerHTML = (activeCouriers.length ? activeCouriers : S.couriers).map(c=>`<option>${c}</option>`).join('');
  $('fStatus').innerHTML=allStatuses().map(s=>`<option>${s}</option>`).join('');
  $('extraForm').innerHTML=S.extraFields.map(f=>`<div class="fg"><label class="fl">${f}</label><input class="fi xf" data-f="${f}" placeholder="${f}..."></div>`).join('');
  _docs={guia:null,embalado:null,ticket:null};_links=[];
  refreshSlot('guia');refreshSlot('ticket');renderLinks();
  ['inGuiaCam','inGuiaGal','inGuiaPdf','inTicketCam','inTicketGal','inTicketPdf'].forEach(i=>{const e=$(i);if(e)e.value=''});
  if(id){
    const s=S.shipments.find(x=>x.id===id);
    $('fName').value=s.name;$('fPhone').value=s.phone;$('fAddr').value=s.address;
    $('fCourier').value=s.courier;$('fDate').value=s.date;$('fStatus').value=s.status;
    $('fCost').value=s.cost||'';$('fNotes').value=s.notes||'';
    document.querySelectorAll('.xf').forEach(el=>{el.value=(s.extra&&s.extra[el.dataset.f])||''});
    if(s.docGuia){_docs.guia=s.docGuia;refreshSlot('guia')}
    if(s.docEmbalado){_docs.embalado=s.docEmbalado;refreshSlot('embalado')}
    if(s.docTicket){_docs.ticket=s.docTicket;refreshSlot('ticket')}
    // Si tiene documentos, abrir el acordeón automáticamente
    if(s.docGuia||s.docEmbalado||s.docTicket){
      var body=document.getElementById('docsBody');
      var arrow=document.getElementById('docsArrow');
      if(body) body.classList.add('open');
      if(arrow) arrow.classList.add('open');
    }
    _links=s.links?JSON.parse(JSON.stringify(s.links)):[];renderLinks();
  }else{
    ['fName','fPhone','fAddr','fCost','fNotes'].forEach(i=>$(i).value='');
    $('fDate').valueAsDate=new Date();
  }
  // ★ SHALOM: show/hide bloque guía según courier
  const _showShalomBlock = () => {
    const c = ($('fCourier').value||'').toUpperCase();
    const b = $('shalomGuiaBlock');
    if(b) b.style.display = c.includes('SHALOM') ? 'block' : 'none';
  };
  $('fCourier').onchange = _showShalomBlock;
  if(id){
    const s=S.shipments.find(x=>x.id===id);
    if(s){
      if($('fShalomGuia'))   $('fShalomGuia').value   = s.trackingOrderNumber||s.shalomGuia||'';
      if($('fShalomCodigo')) $('fShalomCodigo').value = s.trackingOrderCode||s.shalomCodigo||'';
    }
  } else {
    if($('fShalomGuia'))   $('fShalomGuia').value   = '';
    if($('fShalomCodigo')) $('fShalomCodigo').value = '';
  }
  _showShalomBlock();
  openOverlay('formOverlay');
}
function saveShipment(){
  const name=$('fName').value.trim(),phone=$('fPhone').value.trim(),addr=$('fAddr').value.trim();
  if(!name||!phone||!addr){toast('⚠️ Nombre, teléfono y dirección requeridos');return}
  const extra={};document.querySelectorAll('.xf').forEach(el=>extra[el.dataset.f]=el.value);
  const data={name,phone,address:addr,courier:$('fCourier').value,date:$('fDate').value,status:$('fStatus').value,cost:$('fCost').value,notes:$('fNotes').value.trim(),extra,docGuia:_docs.guia,docEmbalado:_docs.embalado,docTicket:_docs.ticket,links:JSON.parse(JSON.stringify(_links)),sel:false,chkGuia:false,chkTicket:false};
  // ★ SHALOM: leer campos guía
  const _sGuia   = ($('fShalomGuia')   ? $('fShalomGuia').value.trim()   : '')||'';
  const _sCodigo = ($('fShalomCodigo') ? $('fShalomCodigo').value.trim() : '')||'';
  if(_sGuia)  { data.trackingOrderNumber=_sGuia;   data.shalomGuia=_sGuia; }
  if(_sCodigo){ data.trackingOrderCode  =_sCodigo; data.shalomCodigo=_sCodigo; }
  if(_editId){const idx=S.shipments.findIndex(x=>x.id===_editId);
    // Preservar campos tracking al editar
    const prev=S.shipments[idx];
    ['trackingStatus','trackingMessage','trackingLastUpdate','trackingLastAutoCheck',
     'trackingHistory','trackingHistorialShalom','trackingOrigen','trackingDestino'].forEach(k=>{
      if(prev[k]!==undefined&&!data[k]) data[k]=prev[k];
    });
    S.shipments[idx]={...prev,...data};toast('✅ Actualizado');}
  else{data.id='id_'+Date.now();data.createdAt=new Date().toISOString();S.shipments.push(data);toast('✅ Envío registrado')}
  save();closeOverlay('formOverlay');render();
}

/* EXCEL EXPORT / IMPORT */
function exportExcel(){
  if(!S.shipments.length){ toast('Sin envíos para exportar'); return; }
  if(typeof XLSX==='undefined'){ toast('⚠️ Cargando librería...'); return; }
  const rows=S.shipments.map(s=>({
    'Nombre':s.name||'',
    'Teléfono':s.phone||'',
    'Dirección':s.address||'',
    'Courier':s.courier||'',
    'Fecha':s.date||'',
    'Estado':s.status||'',
    'Costo':s.cost||'',
    'Notas':s.notes||'',
    'Nota privada':s.privateNote||''
  }));
  const ws=XLSX.utils.json_to_sheet(rows);
  ws['!cols']=[{wch:25},{wch:13},{wch:35},{wch:15},{wch:12},{wch:18},{wch:8},{wch:30},{wch:30}];
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Envíos');
  const date=new Date().toLocaleDateString('es-PE').replace(/\//g,'-');
  XLSX.writeFile(wb,`TotalTools_Envios_${date}.xlsx`);
  toast('📊 Excel descargado');
}

function importExcel(input){
  const file=input.files[0]; if(!file) return;
  const res=$('importResult');
  res.style.display='block'; res.innerHTML='⏳ Procesando...'; res.style.color='var(--text2)';
  const reader=new FileReader();
  reader.onload=e=>{
    try{
      const wb=XLSX.read(e.target.result,{type:'binary'});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const rows=XLSX.utils.sheet_to_json(ws);
      if(!rows.length){ res.innerHTML='⚠️ El archivo está vacío'; return; }
      let added=0, skipped=0;
      rows.forEach(row=>{
        const name=(row['Nombre']||row['nombre']||'').toString().trim();
        const phone=(row['Teléfono']||row['Telefono']||row['telefono']||'').toString().trim();
        const address=(row['Dirección']||row['Direccion']||row['direccion']||'').toString().trim();
        if(!name||!phone){ skipped++; return; }
        if(S.shipments.find(x=>x.name===name&&x.phone===phone)){ skipped++; return; }
        S.shipments.push({
          id:'xl_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),
          name, phone, address,
          courier:(row['Courier']||row['courier']||S.couriers[0]||'').toString().trim(),
          date:(row['Fecha']||row['fecha']||new Date().toISOString().split('T')[0]).toString().trim(),
          status:(row['Estado']||row['estado']||'NUEVO PEDIDO').toString().trim(),
          cost:(row['Costo']||row['costo']||'').toString().trim(),
          notes:(row['Notas']||row['notas']||'').toString().trim(),
          privateNote:(row['Nota privada']||'').toString().trim(),
          extra:{},docGuia:null,docTicket:null,links:[],
          sel:false,chkGuia:false,chkTicket:false,
          createdAt:new Date().toISOString()
        });
        added++;
      });
      save(); render();
      res.style.color=added>0?'var(--green)':'var(--red)';
      res.innerHTML=`✅ ${added} pedido${added!==1?'s':''} importado${added!==1?'s':''}${skipped>0?` · ${skipped} omitido${skipped!==1?'s':''} (duplicados o sin datos)`:''}`;
      if(added>0) toast(`✅ ${added} pedidos importados`);
    }catch(err){
      res.style.color='var(--red)';
      res.innerHTML='❌ Error al leer el archivo.';
    }
    input.value='';
  };
  reader.readAsBinaryString(file);
}

/* EXPORT CSV */
function doCSV(){if(!S.shipments.length){toast('Sin envíos');return}const h=['Nombre','Teléfono','Dirección','Courier','Fecha','Estado','Costo','Notas'];const rows=S.shipments.map(s=>[s.name,s.phone,`"${s.address}"`,s.courier,s.date,s.status,s.cost,`"${s.notes}"`]);const csv=[h,...rows].map(r=>r.join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download=`envios_${new Date().toLocaleDateString('es')}.csv`;a.click();toast('📊 CSV exportado')}

function doPrint(){
  if(window.PrintModule){ PrintModule.open(); }
  else { toast('⚠️ Módulo de impresión no cargado'); }
}

function getFormLink(){
  const base = window.location.origin + window.location.pathname.replace('index.html','').replace(/\/$/, '');
  return `${base}/formulario.html`;
}
function updateShareLink(){
  const link = getFormLink();
  const el = document.getElementById('shareUrl');
  if(el) el.textContent = link;
}
function copyLink(){ 
  const link = getFormLink();
  navigator.clipboard.writeText(link).then(()=>toast('🔗 Link copiado')).catch(()=>{
    // Fallback para navegadores sin clipboard API
    const ta = document.createElement('textarea');
    ta.value = link; document.body.appendChild(ta);
    ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
    toast('🔗 Link copiado');
  });
}
function shareWA(){ window.open(`https://wa.me/?text=${encodeURIComponent('📦 Hola, aquí el link para registrar tu pedido:\n\n'+getFormLink())}`); }
function shareTG(){ window.open(`https://t.me/share/url?url=${encodeURIComponent(getFormLink())}`); }
function openFormLink(){ window.open(getFormLink(),'_blank'); }

/* ── TOKENS: SISTEMA COMPLETO ─────────────────────────────────────── */
let _tokCache = []; // cache local de tokens

function _genTokId(){
  const c='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let r=''; for(let i=0;i<20;i++) r+=c[Math.floor(Math.random()*c.length)];
  return r;
}

async function genToken(action){
  const name    = ($('tokName').value||'').trim();
  const phone   = ($('tokPhone').value||'').trim();
  const link    = ($('tokLink').value||'').trim();
  const expDays = parseInt($('tokExp').value||'0')||0;
  if(!name){ toast('⚠️ Escribe el nombre del cliente'); return; }
  // Esperar Firebase
  let t=0; while(!window._fbSaveTok && t<30){ await new Promise(r=>setTimeout(r,100)); t++; }
  if(!window._fbSaveTok){ toast('⚠️ Firebase no listo, intenta de nuevo'); return; }
  const id  = _genTokId();
  const tok = {
    id, name, phone,
    createdAt:    new Date().toISOString(),
    prefillName:  name,
    prefillPhone: phone||'',
    prefillLink:  link||'',
    used:         false,
    expiresAt:    expDays ? new Date(Date.now()+expDays*864e5).toISOString() : null,
  };
  try {
    await window._fbSaveTok(tok);
    const url = getFormLink()+'?t='+id;
    $('tokName').value=''; $('tokPhone').value=''; $('tokLink').value=''; $('tokExp').value='';
    // Pequeño delay para que Firebase indexe el documento
    await new Promise(r=>setTimeout(r,800));
    if(action==='copy'){
      navigator.clipboard.writeText(url).then(()=>toast('🔑 Link copiado')).catch(()=>{
        const ta=document.createElement('textarea');ta.value=url;
        document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);
        toast('🔑 Link copiado');
      });
    } else {
      const msg='📦 Hola '+name+', aquí tu link para registrar tu pedido:\n\n'+url+(link?'\n\n📎 '+link:'');
      if(phone){ window.open('https://wa.me/51'+phone+'?text='+encodeURIComponent(msg),'_blank'); }
      else if(navigator.share){ navigator.share({title:'Pedido - '+name,text:msg}).catch(()=>window.open('https://wa.me/?text='+encodeURIComponent(msg),'_blank')); }
      else { window.open('https://wa.me/?text='+encodeURIComponent(msg),'_blank'); }
      toast('🔑 Link generado');
    }
    await loadTokenList();
  } catch(e){ toast('⚠️ Error: '+e.message); }
}

async function loadTokenList(){
  const list=$('tokList');
  if(!list) return;
  list.innerHTML='<div class="tok-empty">⏳ Cargando...</div>';
  // Esperar Firebase
  for(let i=0;i<40;i++){
    if(window._fbListToks) break;
    await new Promise(r=>setTimeout(r,100));
  }
  if(!window._fbListToks){
    list.innerHTML='<div class="tok-empty">⚠️ Sin conexión. Toca 🔄</div>';
    return;
  }
  try{
    const raw = await window._fbListToks();
    if(!raw||!raw.length){
      list.innerHTML='<div class="tok-empty">📭 No hay links generados aún.</div>';
      return;
    }
    // Normalizar
    _tokCache = raw
      .map(function(d){ return Object.assign({},d,{id:d.id||d._id||''}); })
      .sort(function(a,b){ return (b.createdAt||'')>(a.createdAt||'')?1:-1; });
    
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
    
    function renderItem(tok, idx){
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
      var nm = (tok.name||'—').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      var ph = (tok.phone||'').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      var lk = (tok.prefillLink||'').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      var shortLk = lk.length>45 ? lk.substring(0,45)+'…' : lk;
      var btns = '';
      if(pend){
        btns += '<button class="tok-act-btn" data-idx="'+idx+'" data-act="share">📤 Compartir</button>';
        if(ph) btns += '<button class="tok-act-btn" style="color:var(--green);border-color:rgba(46,160,67,.4)" data-idx="'+idx+'" data-act="wa">💬 WA</button>';
        btns += '<button class="tok-act-btn" data-idx="'+idx+'" data-act="open">↗</button>';
      }
      btns += '<button class="tok-act-btn tok-act-del" data-idx="'+idx+'" data-act="delete">🗑️</button>';
      
      return '<div class="tok-list-item">'
        +'<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:3px">'
        +'<div class="tok-list-name">'+nm+'</div>'+badge
        +'</div>'
        +'<div class="tok-list-meta">'
        +(ph?'📞 '+ph+'  · ':'')+tiempo
        +(expTxt?'<br>⏱ '+expTxt:'')
        +(lk?'<br><span style="color:var(--blue);font-size:10px">🔗 '+shortLk+'</span>':'')
        +'</div>'
        +'<div class="tok-list-actions" style="margin-top:8px">'+btns+'</div>'
        +'</div>';
    }
    
    activos.forEach(function(tok,i){ html += renderItem(tok, i); });
    if(inactivos.length){
      html += '<div style="font-size:10px;font-weight:700;color:var(--text2);letter-spacing:1px;text-transform:uppercase;margin:12px 0 8px;padding-top:8px;border-top:1px solid var(--bd)">Usados / Vencidos</div>';
      inactivos.forEach(function(tok,i){ html += renderItem(tok, activos.length+i); });
    }
    if(!html) html = '<div class="tok-empty">📭 No hay links generados aún.</div>';
    list.innerHTML = html;
    
    // Event delegation para los botones
    list.onclick = function(e){
      var btn = e.target.closest('[data-act]');
      if(!btn) return;
      var idx = parseInt(btn.dataset.idx);
      var act = btn.dataset.act;
      _tokAction(idx, act);
    };
    
  }catch(e){
    list.innerHTML='<div class="tok-empty">⚠️ Error: '+e.message+'<br><button class="tok-act-btn" onclick="loadTokenList()" style="margin-top:8px">↻ Reintentar</button></div>';
    console.error('loadTokenList error:', e);
  }
}

function _tokAction(idx, action){
  var tok = _tokCache[idx];
  if(!tok){ console.error('Token no encontrado en índice', idx); return; }
  var url = getFormLink()+'?t='+(tok.id||tok._id||'');
  var link = tok.prefillLink||'';
  var msg = '📦 Hola '+tok.name+', aquí tu link para registrar tu pedido:\n\n'+url+(link?'\n\n📎 '+link:'');
  if(action==='share'){
    if(navigator.share){
      navigator.share({title:'Pedido - '+tok.name, text:msg}).catch(function(){
        window.open('https://wa.me/?text='+encodeURIComponent(msg),'_blank');
      });
    } else {
      window.open('https://wa.me/?text='+encodeURIComponent(msg),'_blank');
    }
  } else if(action==='wa'){
    window.open('https://wa.me/51'+tok.phone+'?text='+encodeURIComponent(msg),'_blank');
  } else if(action==='open'){
    window.open(url,'_blank');
  } else if(action==='delete'){
    if(!window._fbDelTok){ toast('⚠️ Error'); return; }
    window._fbDelTok(tok.id||tok._id||'')
      .then(function(){ toast('🗑️ Link eliminado'); loadTokenList(); })
      .catch(function(){ toast('⚠️ Error al eliminar'); });
  }
}

function changePIN(){
  openPin(()=>{
    _pinEntry=''; updatePinDots();
    $('pinMsg').textContent='Ingresa la NUEVA clave (4 dígitos)';
    $('pinMsg').style.color='var(--blue)';
    openOverlay('pinOverlay');
    _pinCallback=()=>{ S.statusPin=_pinEntry; save(); toast('🔐 Clave actualizada a: '+_pinEntry); };
  });
}
/* CONFIG */
function loadCfgUI(){
  $('cfgName').value=S.config.name||'';$('cfgPhone').value=S.config.phone||'';$('cfgCity').value=S.config.city||'';

  // DISPATCH DAYS
  const days=[{n:'Lun',v:1},{n:'Mar',v:2},{n:'Mié',v:3},{n:'Jue',v:4},{n:'Vie',v:5},{n:'Sáb',v:6},{n:'Dom',v:0}];
  $('dispatchDays').innerHTML=days.map(d=>`
    <button class="day-btn ${(S.dispatch.days||[]).includes(d.v)?'active':''}"
      onclick="toggleDispatchDay(${d.v})">${d.n}</button>`).join('');
  // HOUR SELECT
  const hours=[];
  for(let h=0;h<24;h++) for(let m=0;m<60;m+=30){
    const hh=h.toString().padStart(2,'0');
    const mm=m.toString().padStart(2,'0');
    const ap=h<12?'a.m.':'p.m.';
    const h12=h===0?12:h>12?h-12:h;
    hours.push({val:`${hh}:${mm}`,label:`${h12}:${mm} ${ap}`});
  }
  $('dispatchCutHour').innerHTML=hours.map(h=>`<option value="${h.val}" ${S.dispatch.cutHour===h.val?'selected':''}>${h.label}</option>`).join('');
  $('dispatchAnticip').value=S.dispatch.anticipation||0;

  // LABELS — fixed (non-deletable) + custom
  let labHTML='';
  // Show FIXED_LABELS as fixed (no delete)
  FIXED_LABELS.forEach((l)=>{
    const msgs=S.msgTemplates[l]||['',''];
    const has=(msgs[0]&&msgs[0].trim())||(msgs[1]&&msgs[1].trim());
    labHTML+=`<div class="cfl-item">
      <span class="cfl-icon">${FIXED_LABEL_ICONS[l]||'🏷️'}</span>
      <span class="cfl-name">${l}</span>
      <span class="cfl-fixed-badge">Fija</span>
      ${has?`<div class="cfl-has-msg"></div>`:''}
      <div class="cfl-actions">
        <button class="cfl-btn cfl-btn-msg" onclick="openLabelEdit('${l}',null)">💬</button>
      </div>
    </div>`;
  });
  // Custom only (not fixed)
  const customLabels=S.labels.filter(l=>!FIXED_LABELS.includes(l));
  customLabels.forEach((l)=>{
    const i=S.labels.indexOf(l);
    const msgs=S.msgTemplates[l]||['',''];
    const has=(msgs[0]&&msgs[0].trim())||(msgs[1]&&msgs[1].trim());
    labHTML+=`<div class="cfl-item">
      <span class="cfl-drag">⠿</span>
      <span class="cfl-icon">🏷️</span>
      <span class="cfl-name">${l}</span>
      ${has?`<div class="cfl-has-msg"></div>`:''}
      <div class="cfl-actions">
        <button class="cfl-btn cfl-btn-edit" onclick="openLabelEdit('${l}',${i})">✏️</button>
        <button class="cfl-btn cfl-btn-msg" onclick="openLabelEdit('${l}',${i})">💬</button>
        <button class="cfl-btn cfl-btn-del" onclick="confirmDelItem('label',${i})">🗑️</button>
      </div>
    </div>`;
  });
  $('labelsList').innerHTML=labHTML;

  // COURIERS — fixed + custom, with active toggle
  $('couriersList').innerHTML=S.couriers.map((c,i)=>{
    const isActive = S.courierActive[c]!==false;
    const isFixed  = FIXED_COURIERS.includes(c);
    return`<div class="cfl-item">
      <div class="courier-toggle ${isActive?'on':''}" onclick="toggleCourierActive('${c.replace(/'/g,"\\'")}')">
        <div class="courier-toggle-dot"></div>
      </div>
      <span class="cfl-icon">🚚</span>
      <span class="cfl-name" style="${isActive?'':'opacity:.35'}">${c}</span>
      ${isFixed?`<span class="cfl-fixed-badge">Fijo</span>`:''}
      ${!isActive?`<span style="font-size:9px;color:var(--text2);background:var(--bg2);padding:1px 6px;border-radius:8px;border:1px solid var(--bd)">Oculto</span>`:''}
      <div class="cfl-actions">
        ${!isFixed?`<button class="cfl-btn cfl-btn-edit" onclick="openCourierEdit(${i})">✏️</button>`:''}
        ${!isFixed?`<button class="cfl-btn cfl-btn-del" onclick="confirmDelItem('courier',${i})">🗑️</button>`:''}
      </div>
    </div>`;
  }).join('');

  // EXTRA FIELDS
  $('extraFieldsList').innerHTML=S.extraFields.map((f,i)=>`
    <div class="cfl-item">
      <span class="cfl-icon">📝</span>
      <span class="cfl-name">${f}</span>
      <div class="cfl-actions">
        <button class="cfl-btn cfl-btn-edit" onclick="openExtraEdit(${i})" title="Editar">✏️</button>
        <button class="cfl-btn cfl-btn-del" onclick="confirmDelItem('extra',${i})" title="Eliminar">🗑️</button>
      </div>
    </div>`).join('');
}

/* LABEL EDIT SHEET */
let _editLabelSt=null, _editLabelIdx=null;
function openLabelEdit(st, idx){
  _editLabelSt=st; _editLabelIdx=idx;
  const msgs=S.msgTemplates[st]||['',''];
  const isFixed=idx===null;
  const icon=st==='PENDIENTE'?'🕐':st==='ENVIADO'?'🚚':st==='ENTREGADO'?'✅':'🏷️';
  $('labelEditContent').innerHTML=`
    <div class="lbl-sheet-name">${icon} ${st}</div>
    <div class="lbl-sheet-sub">${isFixed?'Etiqueta fija — solo puedes editar sus mensajes':'Edita el nombre y mensajes de esta etiqueta'}</div>
    ${!isFixed?`<div class="fg"><label class="fl">Nombre de la etiqueta</label><input class="fi" id="leNameInp" value="${st}" maxlength="30" placeholder="Nombre..."></div>`:''}
    <div style="font-size:11px;font-weight:700;color:var(--text2);letter-spacing:.8px;text-transform:uppercase;margin-bottom:10px">💬 Mensajes predeterminados</div>
    <div class="lbl-msg-wrap">
      <div class="lbl-msg-head"><div class="lbl-msg-letter lbl-msg-letter-a">A</div><span style="font-size:11px;color:var(--text2)">Mensaje A</span></div>
      <textarea class="msg-ta" id="leMsgA" placeholder="Hola {nombre}, tu pedido está en camino 🚚...">${msgs[0]||''}</textarea>
    </div>
    <div class="lbl-msg-wrap">
      <div class="lbl-msg-head"><div class="lbl-msg-letter lbl-msg-letter-b">B</div><span style="font-size:11px;color:var(--text2)">Mensaje B</span></div>
      <textarea class="msg-ta" id="leMsgB" placeholder="Hola {nombre}, tu pedido fue entregado ✅...">${msgs[1]||''}</textarea>
    </div>
    <div class="lbl-vars-box">Variables: {nombre} {telefono} {direccion} {courier} {fecha} {costo} {estado}</div>
    <div style="height:12px"></div>`;
  openOverlay('labelEditOverlay');
}

function saveLabelEdit(){
  if(!_editLabelSt) return;
  // Save messages
  const msgA=$('leMsgA').value.trim();
  const msgB=$('leMsgB').value.trim();
  if(!S.msgTemplates[_editLabelSt]) S.msgTemplates[_editLabelSt]=['',''];
  S.msgTemplates[_editLabelSt][0]=msgA;
  S.msgTemplates[_editLabelSt][1]=msgB;
  // Rename label if custom
  if(_editLabelIdx!==null){
    const newName=$('leNameInp').value.trim().toUpperCase();
    if(newName&&newName!==_editLabelSt){
      // Move messages to new name
      S.msgTemplates[newName]=S.msgTemplates[_editLabelSt];
      delete S.msgTemplates[_editLabelSt];
      S.labels[_editLabelIdx]=newName;
    }
  }
  save(); renderChips(); loadCfgUI();
  closeOverlay('labelEditOverlay');
  toast('✅ Guardado');
}

/* COURIER / EXTRA INLINE EDIT */
function openCourierEdit(i){
  const v=S.couriers[i];
  $('delMsg').textContent='';
  // Reuse del overlay as quick edit
  const overlay=document.getElementById('delOverlay');
  const sheet=overlay.querySelector('.sheet');
  sheet.innerHTML=`<div class="sheet-handle"></div>
    <div class="sheet-title">✏️ Editar Courier</div>
    <div class="fg"><label class="fl">Nombre</label><input class="fi" id="editCourierInp" value="${v}" maxlength="40"></div>
    <div class="confirm-btns">
      <button class="cbtn-no" onclick="closeOverlay('delOverlay')">Cancelar</button>
      <button class="cbtn-yes" style="background:var(--blue)" onclick="S.couriers[${i}]=document.getElementById('editCourierInp').value.trim()||S.couriers[${i}];save();loadCfgUI();closeOverlay('delOverlay');toast('✅ Guardado')">Guardar</button>
    </div>`;
  openOverlay('delOverlay');
}

function openExtraEdit(i){
  const v=S.extraFields[i];
  const overlay=document.getElementById('delOverlay');
  const sheet=overlay.querySelector('.sheet');
  sheet.innerHTML=`<div class="sheet-handle"></div>
    <div class="sheet-title">✏️ Editar Campo</div>
    <div class="fg"><label class="fl">Nombre</label><input class="fi" id="editExtraInp" value="${v}" maxlength="40"></div>
    <div class="confirm-btns">
      <button class="cbtn-no" onclick="closeOverlay('delOverlay')">Cancelar</button>
      <button class="cbtn-yes" style="background:var(--blue)" onclick="S.extraFields[${i}]=document.getElementById('editExtraInp').value.trim()||S.extraFields[${i}];save();loadCfgUI();closeOverlay('delOverlay');toast('✅ Guardado')">Guardar</button>
    </div>`;
  openOverlay('delOverlay');
}

function saveConfig(){
  S.config.name=$('cfgName').value.trim()||'Mi Negocio';
  S.config.phone=$('cfgPhone').value.trim()||'999000000';
  S.config.city=$('cfgCity').value.trim();
  // Save dispatch
  S.dispatch.cutHour=$('dispatchCutHour').value;
  S.dispatch.anticipation=parseInt($('dispatchAnticip').value)||0;
  $('hdrName').textContent=S.config.name;
  $('hdrPhone').textContent=S.config.phone;
  save(); renderChips(); toast('✅ Configuración guardada');
}
let _dragIdx=null;
function dragStart(e,i){_dragIdx=i;e.currentTarget.classList.add('dragging');e.dataTransfer.effectAllowed='move'}
function dragOver(e){e.preventDefault();e.dataTransfer.dropEffect='move';document.querySelectorAll('.label-drag-row').forEach(r=>r.classList.remove('drag-over'));e.currentTarget.classList.add('drag-over')}
function dropLabel(e,toIdx){
  e.preventDefault();
  if(_dragIdx===null||_dragIdx===toIdx)return;
  const moved=S.labels.splice(_dragIdx,1)[0];
  // Don't allow moving fixed labels
  if(FIXED_LABELS.includes(moved)){S.labels.splice(_dragIdx,0,moved);return}
  S.labels.splice(toIdx,0,moved);
  save();renderChips();loadCfgUI();
}
function dragEnd(){document.querySelectorAll('.label-drag-row').forEach(r=>{r.classList.remove('dragging');r.classList.remove('drag-over')});_dragIdx=null}

// Inline add functions
function addLabelInline(){
  S.labels.push('NUEVA ETIQUETA');
  save();renderChips();loadCfgUI();
  // Auto-open the last card
  const newIdx=S.labels.length-1;
  const bodyEl=document.getElementById(`body_lc_${newIdx}`);
  const arrEl=document.getElementById(`arr_lc_${newIdx}`);
  if(bodyEl){bodyEl.classList.add('open');if(arrEl)arrEl.classList.add('open')}
  // Scroll to it
  const card=document.getElementById(`lc_${newIdx}`);
  if(card)setTimeout(()=>card.scrollIntoView({behavior:'smooth',block:'center'}),100);
}
function addCourierInline(){
  const inp=$('newCourierInp');const v=inp.value.trim();
  if(!v){toast('Escribe el nombre del courier');return}
  S.couriers.push(v);save();loadCfgUI();inp.value='';
}
function addExtraInline(){
  const inp=$('newExtraInp');const v=inp.value.trim();
  if(!v){toast('Escribe el nombre del campo');return}
  S.extraFields.push(v);save();loadCfgUI();inp.value='';
}

// Protected delete — requires hold confirmation
function confirmDelItem(type,idx){
  let name='';
  if(type==='label') name=S.labels[idx];
  else if(type==='courier') name=S.couriers[idx];
  else name=S.extraFields[idx];
  if(type==='courier'&&FIXED_COURIERS.includes(name)){toast('⚠️ Este courier es fijo y no se puede eliminar');return}
  $('delMsg').textContent=`¿Eliminar "${name}"? Esto no se puede deshacer.`;
  $('delYes').style.background='var(--red)';
  $('delYes').onclick=()=>{
    if(type==='label'){S.labels.splice(idx,1);renderChips()}
    else if(type==='courier') S.couriers.splice(idx,1);
    else S.extraFields.splice(idx,1);
    save();loadCfgUI();closeOverlay('delOverlay');toast('🗑️ Eliminado');
  };
  openOverlay('delOverlay');
}
function toggleDispatchDay(v){
  if(!S.dispatch.days) S.dispatch.days=[];
  const idx=S.dispatch.days.indexOf(v);
  if(idx>=0) S.dispatch.days.splice(idx,1);
  else S.dispatch.days.push(v);
  save();
  // Update buttons in place
  document.querySelectorAll('.day-btn').forEach(btn=>{
    const bv=parseInt(btn.getAttribute('onclick').match(/\d+/)[0]);
    btn.classList.toggle('active',S.dispatch.days.includes(bv));
  });
}

function toggleCourierActive(name){
  S.courierActive[name] = S.courierActive[name]===false ? true : false;
  save(); loadCfgUI();
  toast(S.courierActive[name]===false ? `🚚 ${name} oculto del formulario` : `🚚 ${name} visible en formulario`);
}
