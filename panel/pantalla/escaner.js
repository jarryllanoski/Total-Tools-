/**
 * panel/pantalla/escaner.js — escáner QR y lectura del ticket por foto
 * ===========================================================
 * Fase 3 (10/11/2026): el panel en módulos. Antes vivía en index.html.
 * Script CLÁSICO a propósito: sus funciones y variables son globales, igual
 * que cuando estaban en un solo archivo — moverlas no cambió ni una llamada.
 * El orden de los <script> en index.html es el orden de ejecución.
 */
/* QR SCANNER */
let _qrStream=null,_qrAF=null,_qrCanvas=null,_qrCtx=null;
function openQR(){if(!('BarcodeDetector' in window)){if(window.jsQR){startQR();return}const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js';s.onload=startQR;s.onerror=()=>toast('⚠️ Necesitas conexión para el escáner');document.head.appendChild(s);return}startQR()}
async function startQR(){$('qrOverlay').classList.add('open');$('qrFound').style.display='none';try{_qrStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});const v=$('qrVideo');v.srcObject=_qrStream;v.play();_qrCanvas=document.createElement('canvas');_qrCtx=_qrCanvas.getContext('2d');v.addEventListener('loadedmetadata',()=>{_qrCanvas.width=v.videoWidth;_qrCanvas.height=v.videoHeight;scanLoop()})}catch(e){closeQR();toast('⚠️ No se pudo acceder a la cámara')}}
async function scanLoop(){const v=$('qrVideo');if(!v.srcObject)return;_qrCtx.drawImage(v,0,0,_qrCanvas.width,_qrCanvas.height);let res=null;if('BarcodeDetector' in window){try{const bd=new BarcodeDetector({formats:['qr_code']});const c=await bd.detect(_qrCanvas);if(c.length)res=c[0].rawValue}catch(e){}}if(!res&&window.jsQR){const img=_qrCtx.getImageData(0,0,_qrCanvas.width,_qrCanvas.height);const c=jsQR(img.data,img.width,img.height);if(c)res=c.data}if(res){handleQR(res);return}_qrAF=requestAnimationFrame(scanLoop)}
function handleQR(raw){
  // Modo "cambiar etiqueta por QR": el escaneo mueve el pedido, no busca.
  if(_qrMove.on){ _qrMoveOnScan(raw); return; }
  // QR de Shalom (guía) — igual que siempre
  if(raw&&raw.includes('/document/')){const _parts=raw.split('/document/');const _qrId=parseInt(_parts[0]);if(!isNaN(_qrId)){const _ord=String(_qrId-3473503);const _found=S.shipments.find(s=>(s.trackingOrderNumber===_ord)||(s.shalomGuia===_ord));const _fEl=$('qrFound');_fEl.textContent='✅ Guía: '+_ord;_fEl.style.display='block';setTimeout(()=>{closeQR();$('fSearch').value=_ord;_filt='';renderChips();render();if(_found){setTimeout(()=>{document.querySelectorAll('.card').forEach(c=>{if(c.innerHTML.includes(_ord)){c.style.background='rgba(56,139,253,.15)';setTimeout(()=>c.style.background='',1500)}})},200);toast('✅ '+_found.name);}else{toast('⚠️ Guía no encontrada: '+_ord);}},800);return;}}
  /* ★ EL QR PEQUEÑO DEL PIE (`TTPED:<id>`): un pedido exacto, sin buscar.
     Lleva el id, no el número impreso, porque el id no se repite nunca.
     Se va a él igual que con «Ver»: su etiqueta, la marca y el scroll. */
  const _idPie=window.NroComprobante?NroComprobante.leerQrPedido(raw):'';
  if(_idPie){
    const _p=S.shipments.find(x=>x.id===_idPie);
    const _f=$('qrFound');_f.textContent=_p?('✅ '+_p.name):'⚠️ Pedido no encontrado';_f.style.display='block';
    setTimeout(()=>{closeQR();irAlPedido(_idPie);if(_p)toast('✅ '+_p.name);},600);
    return;
  }
  /* EL QR GRANDE: el celular, y la búsqueda de siempre (todos los pedidos de
     ese número). Desde el 27/10/2026 lleva SOLO el celular; las etiquetas
     impresas antes con «número#código» se siguen leyendo: se usa el tramo
     del número. Ese tramo puede ser un usuario de WhatsApp (@nombre): se
     acepta tal cual, ya viene en minúsculas desde el campo. */
  const _qrBruto=String(raw).split('#')[0].trim();
  let phone;
  if(esUsuarioWA(_qrBruto)){ phone=_qrBruto.toLowerCase(); }
  else { phone=_qrBruto.replace(/\D/g,'');if(phone.startsWith('51')&&phone.length===11)phone=phone.slice(2);if(phone.length!==9){toast('QR no reconocido');_qrAF=requestAnimationFrame(scanLoop);return} }
  const f=$('qrFound');f.textContent=`✅ ${phone}`;f.style.display='block';const m=S.shipments.find(s=>s.phone===phone);setTimeout(()=>{closeQR();$('fSearch').value=phone;_filt='';renderChips();render();if(m){setTimeout(()=>{document.querySelectorAll('.card').forEach(c=>{if(c.innerHTML.includes(phone)){c.style.background='rgba(56,139,253,.15)';setTimeout(()=>c.style.background='',1500)}})},200);toast(`✅ ${m.name}`)}else{toast(`⚠️ No encontrado: ${phone}`)}},800)}
function closeQR(){if(_qrAF)cancelAnimationFrame(_qrAF);if(_qrStream)_qrStream.getTracks().forEach(t=>t.stop());_qrStream=null;_qrAF=null;$('qrVideo').srcObject=null;$('qrOverlay').classList.remove('open')}

/* ═══════════════════════════════════════════════════════════════════════
   CAMBIO DE ETIQUETA POR QR — módulo autocontenido.
   • Se activa desde el acordeón del sheet "ordenar esta vista" (solo estados
     hasta ALISTADO) con la clave de cambio de etiqueta (openPin).
   • Escanear mueve el pedido al estado activo. SOLO AVANZA. Uno por uno.
   • SOLO con el QR PEQUEÑO del pie (`TTPED:<id>`, el pedido exacto). Desde
     el 27/10/2026 el QR grande lleva solo el celular, y un celular puede
     tener varios pedidos: mover «el que parezca» es cómo se cambia de
     etiqueta el paquete equivocado. El QR grande aquí no mueve: avisa.
   • Bajo la tarjeta movida aparece "de → a" + Revertir (efímero, solo la última).
   No toca la búsqueda normal ni el render fuera del modo.
   ═══════════════════════════════════════════════════════════════════════ */
const _qrMove = { on:false, status:'', last:null, shown:null }; // last:{id,prev} (con tira) · shown:id (solo mostrar)
const _QRMOVE_TOPE = 'ALISTADO';
let _qrMoveSheetLabel = '';
let _qrMoveTimer = null;
// Auto-apagado por inactividad (1 min). Se rearma en cada escaneo y al activar.
function _qrMoveArmTimer(){
  _qrMoveClearTimer();
  _qrMoveTimer=setTimeout(function(){ if(_qrMove.on){ _qrMoveStop(); if(window.toast) toast('⏱️ Escaneo apagado por inactividad'); } },60000);
}
function _qrMoveClearTimer(){ if(_qrMoveTimer){ clearTimeout(_qrMoveTimer); _qrMoveTimer=null; } }

function _qrMoveEligible(label){
  const all=allStatuses();
  const li=all.indexOf(label), mi=all.indexOf(_QRMOVE_TOPE);
  return mi>=0 && li>=0 && li<=mi; // hasta ALISTADO; si no existe, desactivado
}
function _qrMoveSetupSheet(label){
  _qrMoveSheetLabel=label;
  const acc=$('qrMoveAcc'); if(!acc) return;
  if(!_qrMoveEligible(label)){ acc.style.display='none'; return; }
  acc.style.display='block';
  $('qrMoveBody').classList.remove('open'); $('qrMoveArrow').classList.remove('open');
  const t=$('qrMoveTargetLbl'); if(t) t.textContent=label;
  _qrMoveRefreshBtn(label);
}
function _qrMoveRefreshBtn(label){
  const btn=$('qrMoveActBtn'); if(!btn) return;
  const active=_qrMove.on && _qrMove.status===label;
  btn.textContent=active?('● Escaneando → '+label+' · Desactivar'):'Activar (pide clave)';
}
function toggleQrMoveAcc(){
  const b=$('qrMoveBody'), a=$('qrMoveArrow'); if(!b||!a) return;
  const open=b.classList.contains('open');
  b.classList.toggle('open',!open); a.classList.toggle('open',!open);
}
function qrMoveToggle(){
  const label=_qrMoveSheetLabel;
  if(!label || !_qrMoveEligible(label)) return;
  if(_qrMove.on && _qrMove.status===label){ _qrMoveStop(); _qrMoveRefreshBtn(label); toast('Escaneo desactivado'); return; }
  openPin(()=>{
    _qrMove.on=true; _qrMove.status=label; _qrMove.last=null; _qrMove.shown=null;
    _qrMoveArmTimer();
    _filt=label; renderChips(); render();
    closeOverlay('chipSortOverlay');
    toast('📷 Escaneo activo → '+label+'. Toca 📷 para escanear.');
  });
}
function _qrMoveStop(){ _qrMoveClearTimer(); _qrMove.on=false; _qrMove.status=''; _qrMove.last=null; _qrMove.shown=null; render(); }
// Indicador persistente en la barra (junto al 🗑️): visible solo en modo escaneo.
function _qrMoveIndicator(){
  const el=$('qrMoveInd'); if(!el) return;
  if(_qrMove.on){ el.style.display='flex'; el.title='Escaneo activo → '+_qrMove.status+' · toca para salir'; }
  else el.style.display='none';
}
function qrMoveIndTap(){ if(!_qrMove.on) return; _qrMoveStop(); toast('Escaneo desactivado'); }

// Escaneo rechazado: NO deja ningún pedido en pantalla como si fuera el resultado
// (limpia la tarjeta del escaneo anterior) y avisa por qué. Único punto de salida
// para todos los casos que no mueven ni muestran.
function _qrMoveFallo(msg){
  _qrMove.last=null; _qrMove.shown=null;
  render();
  toast(msg);
}

// Escaneo en modo mover: identifica el pedido, valida "solo avanzar", mueve y guarda.
function _qrMoveOnScan(raw){
  closeQR(); // uno por uno
  _qrMoveArmTimer(); // hubo actividad: reinicia el minuto de inactividad
  const all=allStatuses(); const target=_qrMove.status; const ti=all.indexOf(target);
  // Solo el QR pequeño del pie: el pedido exacto por su id.
  const _idPie=window.NroComprobante?NroComprobante.leerQrPedido(raw):'';
  if(!_idPie){ _qrMoveFallo('⚠️ Para cambiar de etiqueta escanea el QR pequeño de abajo'); return; }
  if(ti<0){ _qrMoveFallo('⚠️ Estado no válido'); return; }
  const match=S.shipments.find(s=>s.id===_idPie);
  if(!match){ _qrMoveFallo('⚠️ Ese pedido ya no está en la lista'); return; }
  const ci=all.indexOf(match.status);
  if(ci<0){ _qrMoveFallo('⚠️ Estado desconocido'); return; }
  // Ya está en ese estado: sin aviso ni tira, solo mostrar ese pedido (como una búsqueda).
  if(ci===ti){ _qrMove.last=null; _qrMove.shown=match.id; render(); return; }
  if(ci>ti){ _qrMoveFallo('⚠️ No se puede retroceder: '+match.name+' está en '+match.status); return; }
  const prev=match.status; match.status=target;
  if(window._fbSaveShipmentNow) window._fbSaveShipmentNow(match); else save(match.id);
  _qrMove.last={ id:match.id, prev:prev }; _qrMove.shown=match.id;
  render();
  toast('🔄 '+match.name+': '+prev+' → '+target);
}

// Revertir (con confirmación, como borrar). Solo la última movida.
let _qrRevertId=null;
function qrMoveRevertAsk(id){
  if(!_qrMove.last || _qrMove.last.id!==id) return;
  const s=S.shipments.find(x=>x.id===id); if(!s) return;
  _qrRevertId=id;
  $('qrRevertMsg').innerHTML=`"${escH(s.name)}" volverá a <b>${escH(_qrMove.last.prev)}</b>.`;
  openOverlay('qrRevertOverlay');
}
function qrMoveRevertConfirm(){
  const id=_qrRevertId;
  if(!_qrMove.last || _qrMove.last.id!==id){ closeOverlay('qrRevertOverlay'); return; }
  const s=S.shipments.find(x=>x.id===id); const prev=_qrMove.last.prev;
  if(s){ s.status=prev; if(window._fbSaveShipmentNow) window._fbSaveShipmentNow(s); else save(id); }
  _qrMove.last=null; _qrMove.shown=null; _qrRevertId=null;
  render(); closeOverlay('qrRevertOverlay');
  toast('↩ Revertido a '+prev);
}

/* ── Escanear ticket Shalom por CÁMARA/FOTO → OCR → autollena orden + código ──
   El QR de Shalom no sigue un formato constante, así que leemos el TEXTO
   impreso ("NRO. ORDEN" + "CÓDIGO") con OCR (Tesseract.js, carga bajo demanda,
   charset 0-9A-Z para máxima precisión). Anclado a las etiquetas del ticket y
   SIEMPRE corregible a mano. Solo se usa aquí (admin), no en el formulario.   */
var _tessLoadP=null, _tessWorker=null, _tessWorkerP=null;
function _cargarTesseract(){
  if(window.Tesseract) return Promise.resolve();
  if(_tessLoadP) return _tessLoadP;
  _tessLoadP=new Promise(function(res,rej){
    var s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    s.onload=function(){ res(); };
    s.onerror=function(){ _tessLoadP=null; rej(new Error('no-cdn')); };
    document.head.appendChild(s);
  });
  return _tessLoadP;
}
function _getTessWorker(){
  if(_tessWorker) return Promise.resolve(_tessWorker);
  if(_tessWorkerP) return _tessWorkerP;
  _tessWorkerP=_cargarTesseract().then(function(){
    return Tesseract.createWorker('eng');
  }).then(function(w){
    return w.setParameters({tessedit_char_whitelist:'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ '})
      .then(function(){ _tessWorker=w; return w; });
  }).catch(function(e){ _tessWorkerP=null; throw e; });
  return _tessWorkerP;
}
// Preprocesa: escala a ~ancho útil + gris con contraste (mejora el ticket térmico).
function _prepCanvas(src){
  var w=src.naturalWidth||src.width, h=src.naturalHeight||src.height;
  if(!w||!h) return src;
  var scale=Math.min(2, Math.max(1, 1400/w));
  var cv=document.createElement('canvas'); cv.width=Math.round(w*scale); cv.height=Math.round(h*scale);
  var cx=cv.getContext('2d'); cx.drawImage(src,0,0,cv.width,cv.height);
  try{
    var d=cx.getImageData(0,0,cv.width,cv.height), a=d.data;
    for(var i=0;i<a.length;i+=4){ var g=0.299*a[i]+0.587*a[i+1]+0.114*a[i+2];
      g=g<120?g*0.55:Math.min(255,g*1.2); a[i]=a[i+1]=a[i+2]=g; }
    cx.putImageData(d,0,0);
  }catch(e){}
  return cv;
}
// Extrae orden (6-12 díg) y código (3-6 alfanum) del texto OCR, anclado a etiquetas.
function _parseTicketOCR(txt){
  var t=(txt||'').toUpperCase().replace(/\|/g,'I');
  var orden='', codigo='';
  var mO=t.match(/[O0]RDEN[^0-9]{0,12}(\d{6,12})/); if(mO) orden=mO[1];
  var mC=t.match(/C[O0Ó]D[I1]G[O0][^A-Z0-9]{0,8}([A-Z0-9]{3,6})/); if(mC) codigo=mC[1];
  if(!orden){ var mm=t.match(/\b(\d{7,12})\b/); if(mm) orden=mm[1]; }
  return {orden:orden, codigo:codigo};
}
function _shalomFillCampos(orden, codigo){
  var fg=$('fShalomGuia'), fc=$('fShalomCodigo');
  if(orden && fg){ fg.value=orden; if(typeof _updateShalomMic==='function')_updateShalomMic(); }
  if(codigo && fc){ fc.value=codigo; }
  if(orden||codigo){
    toast('✅ Detectado — Orden: '+(orden||'?')+' · Código: '+(codigo||'?')+'. Revisa y corrige si hace falta.');
    return true;
  }
  toast('⚠️ No pude leer la orden/código. Acércate con buena luz, o escríbelo a mano.');
  return false;
}
function shalomScanGuia(){
  var f=$('shalomTicketFile'); if(f) f.click();  // cámara nativa (móvil) o foto (PC)
}
function shalomTicketFoto(file){
  if(!file) return;
  toast('🔎 Leyendo el ticket…');
  var img=new Image();
  img.onload=function(){
    var cv;
    try{ cv=_prepCanvas(img); }catch(e){ cv=img; }
    _getTessWorker().then(function(w){ return w.recognize(cv); }).then(function(r){
      var txt=(r&&r.data&&r.data.text)||'';
      var got=_parseTicketOCR(txt);
      _shalomFillCampos(got.orden, got.codigo);
    }).catch(function(e){
      toast(e&&e.message==='no-cdn' ? '⚠️ Necesitas internet la primera vez para el lector.' : '⚠️ No se pudo leer el ticket. Escríbelo a mano.');
    }).then(function(){ try{URL.revokeObjectURL(img.src);}catch(e){} });
  };
  img.onerror=function(){ toast('⚠️ No se pudo abrir la foto'); };
  img.src=URL.createObjectURL(file);
}

function copyCardLink(id){
  const base=typeof getSeguimientoLink==='function'?getSeguimientoLink():window.location.origin+window.location.pathname.replace(/\/[^\/]*$/,'/seguimiento.html');
  /* El token, no el id. Un pedido nuevo lleva 128 bits al azar; uno de ayer
     no tiene token y usa su id de siempre, así que su link ya enviado sigue
     abriendo. La regla vive en functions/enlaceSeguimiento.js — aquí no se
     copia, se llama. */
  const _ped=(window.S&&S.shipments||[]).find(x=>x&&x.id===id);
  const url=base+'?seg='+(window.EnlaceSeguimiento?EnlaceSeguimiento.tokenDe(_ped||{id}):id);
  const done=()=>toast('🔗 Link de seguimiento copiado');
  try{navigator.clipboard.writeText(url).then(done).catch(()=>{const t=document.createElement('textarea');t.value=url;document.body.appendChild(t);t.select();document.execCommand('copy');document.body.removeChild(t);done()});}
  catch(e){const t=document.createElement('textarea');t.value=url;document.body.appendChild(t);t.select();document.execCommand('copy');document.body.removeChild(t);done();}
}
