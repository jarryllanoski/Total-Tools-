/**
 * panel/pedido-docs.js — WhatsApp, documentos, visor, links y monto del pedido
 * ============================================================================
 * Fase 3 (10/11/2026): el panel en módulos. Antes vivía en config.js.
 * Script CLÁSICO a propósito: sus funciones y variables son globales, igual
 * que cuando estaban en un solo archivo — moverlas no cambió ni una llamada.
 * El orden de los <script> en index.html es el orden de ejecución.
 */
/* WA SHEET */
let _waId=null, _waMsgIdx=-1;
function openWA(id){
  _waId=id; _waMsgIdx=-1;
  const s=S.shipments.find(x=>x.id===id);if(!s)return;
  const gChk=s.chkGuia||false, tChk=s.chkTicket||false, eChk=s.chkEmbalado||false;
  const msgs=S.msgTemplates[s.status]||['',''];
  const hasMsg=(msgs[0]&&msgs[0].trim())||(msgs[1]&&msgs[1].trim());

  // Sin docs marcados y sin mensajes → WhatsApp directo
  if(!gChk&&!tChk&&!eChk&&!hasMsg){
    window.waOpen(s.phone);
    return;
  }

  // Sin docs marcados pero con mensajes → abrir sheet solo con mensajes
  // Con docs marcados → abrir sheet completo
  $('waInfo').innerHTML=`<div style="font-weight:700;font-size:14px;margin-bottom:4px">${esc(s.name)}</div><div style="color:var(--blue)">📞 +51 ${esc(s.phone)}</div><div style="color:var(--text2);font-size:12px;margin-top:2px">🏠 ${esc(s.address)}</div>`;
  let html='';
  if(s.docTicket||s.docEmbalado||s.docGuia){
    html+=`<div style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;margin-bottom:8px">Documentos a enviar:</div><div class="wa-doc-grid">`;
    if(s.docTicket){html+=waDT(s.docTicket,tChk,'ticket','var(--purple)');}
    if(s.docEmbalado){html+=waDT(s.docEmbalado,eChk,'embalado','var(--blue)');}
    if(s.docGuia){html+=waDT(s.docGuia,gChk,'guia','var(--green)');}
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
  const meta={guia:{lbl:'GUÍA',icon:'🚚'},embalado:{lbl:'EMBALADO',icon:'📦'},ticket:{lbl:'BOLETA',icon:'🧾'}};
  const m=meta[slot]||{lbl:slot.toUpperCase(),icon:'📄'};
  return`<div onclick="event.stopPropagation();togWADoc('${slot}')" style="position:relative;cursor:pointer;border-radius:9px;overflow:hidden;border:2px solid ${chk?color:'var(--bd)'};${chk?'box-shadow:0 0 0 2px rgba(46,160,67,.25)':''}">
    ${doc.t&&doc.t.startsWith('image/')?`<img src="${doc.d}" style="width:80px;height:100px;object-fit:cover;display:block">`:`<div class="wa-doc-pdf"><span style="font-size:28px">${m.icon}</span></div>`}
    <div class="wa-doc-lbl">${m.lbl}</div>
    <div id="waChk_${slot}" class="wa-doc-chk" style="background:${chk?color:'rgba(0,0,0,.3)'};">${chk?'✓':''}</div>
  </div>`;
}
function togWADoc(slot){
  const s=S.shipments.find(x=>x.id===_waId);if(!s)return;
  if(slot==='guia')s.chkGuia=!s.chkGuia;
  else if(slot==='embalado')s.chkEmbalado=!s.chkEmbalado;
  else s.chkTicket=!s.chkTicket;
  save(s.id);render();openWA(_waId); // incremental: solo este pedido
}
function selWAMsg(idx){
  _waMsgIdx=idx;
  ['waMN','waM0','waM1'].forEach(id=>{const e=$(id);if(e)e.classList.remove('sel')});
  const el=$(idx===-1?'waMN':'waM'+idx);if(el)el.classList.add('sel');
}
async function doWASend(){
  const s=S.shipments.find(x=>x.id===_waId);if(!s)return;
  const gChk=s.chkGuia||false,tChk=s.chkTicket||false,eChk=s.chkEmbalado||false;
  const phone='51'+s.phone;
  let msg='';
  if(_waMsgIdx>=0){const msgs=S.msgTemplates[s.status]||['',''];const t=msgs[_waMsgIdx];if(t&&t.trim())msg=fillVars(t,s)}
  if(!gChk&&!tChk&&!eChk){window.open(msg?`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`:`https://wa.me/${phone}`,'_blank');closeOverlay('waOverlay');return}
  closeOverlay('waOverlay');
  const docs=[];
  if(tChk&&s.docTicket)docs.push({doc:s.docTicket,label:'Boleta'});
  if(eChk&&s.docEmbalado)docs.push({doc:s.docEmbalado,label:'Embalado'});
  if(gChk&&s.docGuia)docs.push({doc:s.docGuia,label:'Guia'});
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
// Núcleo reutilizable: valida y guarda el archivo en un slot. Lo usan loadDoc
// (input), dropDoc (arrastrar) y pasteDoc (portapapeles).
// ★ Pedido EXISTENTE + Storage disponible → sube a Firebase Storage (URL que
//   sincroniza en todos los dispositivos), igual que cámara/galería. Pedido
//   NUEVO → base64 (storage.js lo migra a Storage al guardar). Así pegar y
//   arrastrar dejan de guardarse solo como base64 (que se recorta a [img]).
function _docToast(slot){ toast(slot==='guia'?'🚚 Guía subida ✓':slot==='embalado'?'📦 Foto de embalado subida ✓':'🧾 Documento subido ✓'); }
function _procesarDoc(file,slot){
  if(!file)return;
  if(file.size>8*1024*1024){toast('⚠️ Máximo 8MB');return}
  var shipId=(typeof _editId!=='undefined')?_editId:null;
  /* ★ fotos.js: comprime, sube con miniatura y, si no se puede subir, deja
     la foto PENDIENTE (vista previa local) para la cola — nunca base64,
     que al guardar terminaba en «[img]» y perdida. Pedido nuevo: pendiente
     hasta guardar, porque aún no tiene id. */
  if(window.FotosModule){
    var F=window.FotosModule;
    if(!shipId){ _docs[slot]=F.marcaPendiente(file); refreshSlot(slot); toast('📎 Listo — se sube al guardar el pedido'); return; }
    toast('⏳ Subiendo documento...');
    F.subirDoc(file,shipId,slot).then(function(docObj){
      _docs[slot]=docObj; refreshSlot(slot); _docToast(slot);
    }).catch(function(e){
      console.warn('[Doc] no se pudo subir ahora:',e&&e.message);
      var t = window._authTextoMotivo && window._authTextoMotivo(e);
      _docs[slot]=F.marcaPendiente(file); refreshSlot(slot);
      toast(t || '⏳ Sin conexión con la nube — la foto se subirá sola al guardar el pedido');
    });
    return;
  }
  if(shipId && window.StorageModule && StorageModule.uploadFile){
    toast('⏳ Subiendo documento...');
    StorageModule.uploadFile(file,shipId,slot).then(function(docObj){
      _docs[slot]=docObj; refreshSlot(slot); _docToast(slot);
      // Subir un documento ya NO mueve la etiqueta: el estado lo cambias tú.
    }).catch(function(e){
      console.warn('[Doc] Storage falló, usando base64:',e&&e.message);
      // Si lo que falló fue la sesión, decirlo: el archivo quedó aquí, pero
      // no está en la nube y eso se arregla volviendo a entrar, no esperando.
      var t = window._authTextoMotivo && window._authTextoMotivo(e);
      if(t) toast(t);
      _procesarDocBase64(file,slot);
    });
    return;
  }
  _procesarDocBase64(file,slot);
}
function _procesarDocBase64(file,slot){
  const r=new FileReader();
  r.onload=e=>{ _docs[slot]={d:e.target.result,n:file.name,t:file.type}; refreshSlot(slot); _docToast(slot); };
  r.readAsDataURL(file);
}
function loadDoc(input,slot){ _procesarDoc(input.files[0],slot); }
// Arrastrar y soltar sobre el slot.
function dragDoc(e,on){ e.preventDefault(); const t=e.currentTarget; if(t)t.classList.toggle('doc-drag',!!on); }
function dropDoc(e,slot){
  e.preventDefault();
  const t=e.currentTarget; if(t)t.classList.remove('doc-drag');
  const f=e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0];
  if(f)_procesarDoc(f,slot); else toast('⚠️ Suelta un archivo válido');
}
// Pegar imagen del portapapeles (icono 📋). Sin Ctrl+V.
async function pasteDoc(slot){
  if(!navigator.clipboard||!navigator.clipboard.read){ toast('⚠️ Tu navegador no permite pegar aquí'); return; }
  try{
    const items=await navigator.clipboard.read();
    for(const it of items){
      const type=it.types.find(t=>t.startsWith('image/'));
      if(type){
        const blob=await it.getType(type);
        const ext=(type.split('/')[1]||'png').replace('jpeg','jpg');
        _procesarDoc(new File([blob],'pegado_'+slot+'.'+ext,{type}),slot);
        return;
      }
    }
    toast('⚠️ No hay imagen en el portapapeles');
  }catch(err){
    toast('⚠️ No se pudo pegar (permiso denegado)');
  }
}
function refreshSlot(slot){
  const doc=_docs[slot],Slot=cap(slot);
  const prev=$('prev'+Slot),act=$('act'+Slot),btn=$('addBtn'+Slot),lbl=$('lbl'+Slot);
  const meta={
    guia:     {icon:'🚚',label:'Guía / Ticket',   cls:'fg'},
    embalado: {icon:'📦',label:'Embalado',        cls:'fe'},
    ticket:   {icon:'🧾',label:'Boleta / Factura',cls:'ft'},
  };
  const m=meta[slot]||{icon:'📄',label:slot,cls:''};
  if(!doc){
    prev.innerHTML=`<div class="doc-empty"><div style="font-size:28px">${m.icon}</div><div style="font-size:11px;font-weight:700">${m.label}</div></div>`;
    if(btn)btn.style.display='block';act.style.display='none';lbl.className='doc-tap';return;
  }
  lbl.className='doc-tap '+m.cls;if(btn)btn.style.display='none';act.style.display='flex';
  // Pendiente de subir: vista previa local y aviso. Si no, la miniatura
  // (liviana) si la hay; la original se abre al tocar.
  const _marca = doc.pendiente ? '<div class="doc-ok" style="background:#d29922">⏳ por subir</div>' : '<div class="doc-ok">✓</div>';
  if(doc.t&&doc.t.startsWith('image/')){
    prev.innerHTML=`<div class="doc-full"><img src="${escH(doc.m||doc.d)}" decoding="async" style="width:100%;height:100%;object-fit:cover;display:block">${_marca}</div>`;
  } else {
    const _n=doc.n||'';const sn=_n.length>16?_n.substring(0,16)+'…':_n;
    prev.innerHTML=`<div class="doc-full"><div class="doc-full-pdf"><span style="font-size:32px">📄</span><span style="font-size:10px;color:var(--text2);text-align:center;padding:0 6px;word-break:break-all">${sn}</span></div><div class="doc-ok">✓ PDF</div></div>`;
  }
}
function clearSlot(slot){_docs[slot]=null;const Slot=cap(slot);['Cam','Gal','Pdf'].forEach(s=>{const e=$('in'+Slot+s);if(e)e.value=''});refreshSlot(slot);toast('Documento quitado ✓')}
function viewSlot(slot){
  const d=_docs[slot];if(!d)return;
  const labels={guia:'🚚 Guía / Ticket',embalado:'📦 Embalado',ticket:'🧾 Boleta / Factura'};
  openViewer(d,labels[slot]||slot);
}

/* VIEWER */
let _curDoc=null;
function openViewer(doc,title){_curDoc=doc;if(doc.t&&doc.t.startsWith('image/')){$('viewerImg').src=doc.d;$('viewerTtl').textContent=title;$('viewer').classList.add('open')}else{const a=document.createElement('a');a.href=doc.d;a.target='_blank';a.click()}}
function closeViewer(){$('viewer').classList.remove('open');$('viewerImg').src=''}
function dlDoc(){if(!_curDoc)return;const a=document.createElement('a');a.href=_curDoc.d;a.download=_curDoc.n||'doc';a.click()}
function qView(shipId,slot){const s=S.shipments.find(x=>x.id===shipId);if(!s)return;const d=slot==='guia'?s.docGuia:slot==='embalado'?s.docEmbalado:s.docTicket;if(!d)return;openViewer(d,slot==='guia'?'🚚 Guía / Ticket':slot==='embalado'?'📦 Embalado':'🧾 Boleta / Factura')}
$('viewer').addEventListener('click',e=>{if(e.target===$('viewer'))closeViewer()});

/* LINKS */
let _links=[];
function addLink(){const v=$('fLink').value.trim();if(!v){toast('Ingresa un link');return}if(!v.startsWith('http')){toast('⚠️ Link inválido');return}const n=v.length>36?v.substring(0,36)+'…':v;_links.push({u:v,n});renderLinks();$('fLink').value='';toast('🔗 Agregado')}
function removeLink(i){_links.splice(i,1);renderLinks()}
function renderLinks(){$('linkListForm').innerHTML=_links.map((l,i)=>`<div class="link-item"><span>🔗</span><div class="link-name">${esc(l.n)}</div><a href="${esc(l.u)}" target="_blank" style="color:var(--blue);font-size:12px;text-decoration:none">↗</a><button class="link-del" type="button" onclick="removeLink(${i})">✕</button></div>`).join('')}

/* MONTO / ADELANTO / DEUDA — deuda = max(0, monto − adelanto). El campo `cost`
   del pedido guarda la DEUDA (lo leen 14 lugares que siguen funcionando igual). */
function recalcDeuda(){
  const m=parseFloat(($('fMonto')||{value:''}).value)||0;
  const a=parseFloat(($('fAdelanto')||{value:''}).value)||0;
  const d=Math.max(0, m-a);
  const el=$('fDeudaDisplay'); if(!el) return;
  el.style.color='';   // texto plano, sin color
  // Pagado (monto>0 y deuda=0) → monto tachado. Debe / sin monto → texto normal.
  // La regla vive en functions/montoPedido.js: la MISMA que la tarjeta.
  if(window.MontoPedido){ el.innerHTML=MontoPedido.html(MontoPedido.deDatos(m, a)); return; }
  const fmt=n=>'S/ '+(Math.round(n*100)/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  if(m>0 && d<=0){ el.innerHTML='<s>'+fmt(m)+'</s>'; }
  else{ el.textContent=fmt(d); }
}
// Deuda: toca para desplegar/ocultar Monto/Adelanto (fila de abajo).
function toggleDeuda(){
  const body=$('deudaBody'); if(!body) return;
  const abrir=(body.style.display==='none'||!body.style.display);
  body.style.display=abrir?'flex':'none';
  const ar=$('deudaArrow'); if(ar) ar.classList.toggle('open', abrir);
}
// Carga monto/adelanto/deuda al abrir el form. Pedido viejo: deriva monto=cost.
function _loadMontoFields(s){
  let monto='', adel='';
  if(s){
    monto = (s.monto!=null && s.monto!=='') ? s.monto : (s.cost||'');
    adel  = (s.adelanto!=null) ? s.adelanto : '';
  }
  if($('fMonto')) $('fMonto').value=monto;
  if($('fAdelanto')) $('fAdelanto').value=adel;
  const body=$('deudaBody'); if(body) body.style.display='none';   // colapsado al abrir
  const ar=$('deudaArrow'); if(ar) ar.classList.remove('open');
  recalcDeuda();
}
/* ── "Sucio": ¿el formulario cambió respecto a como se abrió? Snapshot de los
   campos clave. Sirve para no cerrar el modal al clic-fuera si hay cambios. */
window._formSnap = '';
function _formSnapshot(){
  const ids=['fName','fPhone','fDni','fAddr','fEncAgencia','fCourier','fDate',
    'fStatus','fNotes','fMonto','fAdelanto','fShalomGuia','fShalomCodigo','fComprobante'];
  let out=ids.map(i=>{const e=$(i);return e?(e.value||''):'';}).join('');
  document.querySelectorAll('.xf').forEach(el=>{ out+=''+(el.value||''); });
  out+=''+((_docs&&(_docs.guia||_docs.embalado||_docs.ticket))?'D':'')
      +''+((_links&&_links.length)?_links.length:'');
  return out;
}
window._formSnapshotDirty=function(){
  return typeof _formSnapshot==='function' && _formSnapshot()!==window._formSnap;
};

/* Chip de estado Shalom en el modal de editar (SOLO LECTURA).
   Refleja s.trackingStatus tal cual está guardado — no consulta ni mueve nada.
   Mismo criterio de color que _estadoChip de tracking.js, replicado inline para
   no acoplar el modal a ese módulo. Sin estado → oculto (no muestra "—"). */
function _pintarShalomEstado(estado){
  const el=$('fShalomEstado'); if(!el) return;
  const st=(estado||'').trim();
  if(!st || st==='—'){ el.style.display='none'; el.textContent=''; return; }
  const u=st.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  let bg,fg,ico;
  if(u.includes('ENTREGADO'))                       { bg='rgba(46,160,67,.15)';  fg='#3fb950'; ico='✅'; }
  else if(u.includes('AGENCIA')||u.includes('DESTINO')){ bg='rgba(56,139,253,.15)'; fg='#58a6ff'; ico='🏢'; }
  else if(u.includes('TRANSITO')||u.includes('CAMINO')){ bg='rgba(210,153,34,.15)'; fg='#d29922'; ico='🚌'; }
  else if(u.includes('ERROR')||u.includes('NO SE'))  { bg='rgba(248,81,73,.15)';  fg='#f85149'; ico='⚠'; }
  else                                                { bg='rgba(139,148,158,.15)';fg='#8b949e'; ico='📦'; }
  el.style.background=bg; el.style.color=fg;
  el.textContent=ico+' '+st;
  el.style.display='inline-block';
}

/* FORM */
let _editId=null;
