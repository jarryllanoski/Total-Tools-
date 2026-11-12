'use strict';

function _construirWaMsg(order, trackCode, trackToken){
  const bizName  = (CFG&&(CFG.config&&CFG.config.name||CFG.name))||'Mi Negocio';
  const dateLabel = order.date
    ? new Date(order.date+'T12:00:00').toLocaleDateString('es-PE',{weekday:'long',year:'numeric',month:'long',day:'numeric'})
    : selDateLbl||order.date;
  const trackUrl = `${location.origin}${location.pathname.replace(/[^/]*$/, 'seguimiento.html')}?seg=${trackToken}`;

  const refLine  = order.referencia    ? `\n📌 *Referencia:* ${order.referencia}` : '';
  const _mapaUrl = selCourierType==='delivery' ? EnlaceMapa.de(order.gpsCoords) : '';
  const mapaLine = _mapaUrl ? `\n🗺️ *Ubicación exacta:* ${_mapaUrl}` : '';
  const _dniLbl  = selCourierType==='agencia'    ? 'DNI para recoger'
                 : selCourierType==='encomienda'  ? 'DNI destinatario'
                 :                                   'DNI';
  const dniLine  = order.dni ? `\n🪪 *${_dniLbl}:* ${order.dni}` : '';
  const encLine  = order.ciudadDestino ? `\n📦 *Ciudad destino:* ${order.ciudadDestino}` : '';
  const notesLine= order.notes ? `\n📝 *Notas:* ${order.notes}` : '';
  const _nroTxt  = String(order.nroComprobante||'').replace(/[^A-Z0-9-]/g,'').slice(0,20);
  const nroLine  = _nroTxt ? `\n🧾 *Factura/Boleta:* ${_nroTxt}` : '';
  const dirLabel = selCourierType==='agencia'
    ? `\n🏢 *Agencia:* ${order.address||'—'}`
    : selCourierType==='retiro'
      ? `\n🏪 *Retiro en tienda*`
      : `\n🏠 *Dirección:* ${order.address||order.ciudadDestino||'—'}`;

  return `🛒 *NUEVO PEDIDO* — ${bizName}\n`+
    `━━━━━━━━━━━━━━━\n`+
    `👤 *Cliente:* ${order.name}\n`+
    `📞 *WhatsApp:* ${order.phone}`+
    `${dirLabel}${refLine}${mapaLine}${dniLine}${encLine}\n`+
    `🚚 *Courier:* ${order.courier}\n`+
    `📅 *Fecha de envío:* ${dateLabel}${notesLine}\n`+
    `━━━━━━━━━━━━━━━\n`+
    (nroLine ? `${nroLine.slice(1)}\n\n` : `🔑 *Código de seguimiento:* #${trackCode}\n\n`)+
    `📍 *Para ver el estado de tu pedido en tiempo real, abre este enlace:*\n${trackUrl}`;
}

function _construirWaHref(order, trackCode, trackToken){
  let bizPhone = (CFG&&(CFG.config&&CFG.config.phone||CFG.phone))||'';
  bizPhone = String(bizPhone).replace(/\D/g,'');
  if(bizPhone.startsWith('51') && bizPhone.length>9) bizPhone = bizPhone.slice(2);
  const msg = _construirWaMsg(order, trackCode, trackToken);
  return bizPhone
    ? `https://wa.me/51${bizPhone}?text=${encodeURIComponent(msg)}`
    : `https://wa.me/?text=${encodeURIComponent(msg)}`;
}

async function submitOrder(){
  const name  = ($('f_name')||{value:''}).value.trim();
  const phone = ($('f_phone')||{value:''}).value.trim();

  function chk(fid,eid,bad){
    const fe=$(fid),ee=$(eid);
    if(bad){fe&&fe.classList.add('err');ee&&ee.classList.add('show');}
    else   {fe&&fe.classList.remove('err');ee&&ee.classList.remove('show');}
    return bad;
  }

  let ok=true;
  if(chk('f_name','err_name',!_nombreValido(name))) ok=false;
  if(chk('f_phone','err_phone',!/^\d{9}$/.test(phone))) ok=false;

  if(!selCourierName){ $('err_courier')&&$('err_courier').classList.add('show'); ok=false; }
  else               { $('err_courier')&&$('err_courier').classList.remove('show'); }
  const manualAgInput = $('agcManualInput');
  if(manualAgInput){
    const manualTxt = manualAgInput.value.trim();
    agState.addr = manualTxt;
    if(selCourierType==='agencia' && !manualTxt){
      $('err_agency_manual')&&$('err_agency_manual').classList.add('show'); ok=false;
    } else {
      $('err_agency_manual')&&$('err_agency_manual').classList.remove('show');
    }
  } else if(selCourierType==='agencia'&&!agState.addr){
    $('err_agency')&&$('err_agency').classList.add('show'); ok=false;
  } else {
    $('err_agency')&&$('err_agency').classList.remove('show');
  }
  if(!selDateIso)    { $('err_date')&&$('err_date').classList.add('show'); ok=false; }
  else               { $('err_date')&&$('err_date').classList.remove('show'); }

  {
    const dni=($('f_dni')||{value:''}).value.trim();
    if(!/^\d{8}$/.test(dni)){ $('err_dni')&&$('err_dni').classList.add('show'); ok=false; }
    else                    { $('err_dni')&&$('err_dni').classList.remove('show'); }
  }

  if(selCourierType==='encomienda'){
    const ciudad=($('f_ciudad')||{value:''}).value.trim();
    if(!ciudad){ $('err_ciudad')&&$('err_ciudad').classList.add('show'); ok=false; }
    else       { $('err_ciudad')&&$('err_ciudad').classList.remove('show'); }
  }

  const extraF=((CFG&&CFG.extraFields)||[]).filter(f=>f&&f.visible!==false);
  extraF.forEach(f=>{
    const fname=typeof f==='string'?f:(f.name||'');
    const isReq=typeof f==='object'&&!!f.required;
    if(!isReq) return;
    const el=$('ex_'+fname.replace(/\W/g,'_'));
    const er=$('exerr_'+fname.replace(/\W/g,'_'));
    if(el&&!el.value.trim()){el.classList.add('err');er&&er.classList.add('show');ok=false;}
    else if(el){el.classList.remove('err');er&&er.classList.remove('show');}
  });

  let deliveryAddress='';
  let referencia='';
  if(selCourierType==='delivery'){
    deliveryAddress=getDeliveryAddr();
    referencia=($('f_ref')||{value:''}).value.trim();
    if(!deliveryAddress){$('err_deliveryAddr')&&$('err_deliveryAddr').classList.add('show');ok=false;}
    else               {$('err_deliveryAddr')&&$('err_deliveryAddr').classList.remove('show');}
  }

  if(!ok) return;

  let fullNotes=($('f_notes')||{value:''}).value.trim();
  const _dni             = ($('f_dni')||{value:''}).value.trim();
  const dniRecoger       = selCourierType==='agencia'    ? _dni : '';
  const ciudadDestino    = selCourierType==='encomienda'  ? ($('f_ciudad')||{value:''}).value.trim()      : '';
  const dniDestinatario  = selCourierType==='encomienda'  ? _dni : '';
  const encAgencia       = selCourierType==='encomienda'  ? ($('f_agencia') ||{value:''}).value.trim()    : '';

  let finalAddress = deliveryAddress;
  if(selCourierType==='agencia' && agState.addr){
    finalAddress = agState.addr;
  }

  const now      = Date.now();
  const orderId  = `id_${now}`;

  const _agOk = (window._agIdent && window._agIdentTxt === finalAddress)
    ? window._agIdent : null;

  const order = {
    id:             orderId,
    name,
    phone,
    address:        finalAddress,
    agenciaId:      _agOk ? _agOk.agenciaId      : '',
    agenciaNombre:  _agOk ? _agOk.agenciaNombre  : '',
    agenciaGeo:     _agOk ? _agOk.agenciaGeo     : '',
    agenciaCourier: _agOk ? _agOk.agenciaCourier : '',
    gpsCoords:      (_gpsLat&&_gpsLon) ? `${_gpsLat},${_gpsLon}` : null,
    referencia,
    dniRecoger,
    ciudadDestino,
    dniDestinatario,
    encAgencia,
    courier:        selCourierName,
    date:           selDateIso,
    status:         'NUEVO PEDIDO',
    cost:           '',
    notes:          fullNotes,
    extra:          collectExtra(),
    docGuia:        null,
    docEmbalado:    null,
    docComprobante: null,
    links:          _prefillLink ? [{u:_prefillLink, n:_prefillLink.length>36?_prefillLink.substring(0,36)+'…':_prefillLink}] : [],
    sel:            false,
    chkGuia:        false,
    chkEmbalado:    false,
    chkComprobante: false,
    createdAt:      new Date().toISOString(),
    fromForm:       true,
    dni:            _dni || dniRecoger || dniDestinatario || '',
  };

  const btn=$('confirmBtn');
  $('submitErrBox')&&($('submitErrBox').style.display='none');
  const t0=_confEmpezar(btn);

  try{
    const resp = await _api('create', null, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ order: order, token: currentToken || '' })
    });
    if(!resp || resp.status !== 'ok' || !resp.trackToken){
      throw new Error((resp && resp.error) || 'No se pudo registrar');
    }
    order.id = resp.orderId;
    if(resp.nroComprobante) order.nroComprobante = String(resp.nroComprobante);
    localStorage.setItem('dpanel_order_'+wsId, JSON.stringify({
      trackToken: resp.trackToken, orderId: resp.orderId, name: order.name
    }));
    const espera=Math.max(0, 900-(Date.now()-t0));
    setTimeout(function(){ showInlineConfirmed(order, codigoSeg(order.id, order.createdAt || new Date().toISOString()), resp.trackToken); }, espera);
  }catch(e){
    _confFallo(btn);
    const eb=$('submitErrBox');
    if(eb){ eb.style.display='block'; eb.textContent=`Error al registrar: ${e.message}`; }
  }
}

function _confEmpezar(btn){
  if(btn){
    btn.disabled=true; btn.classList.add('tt-registrando');
    btn.innerHTML='<span class="tt-reg-bar" aria-hidden="true"></span><span class="tt-reg-txt">Registrando tu pedido…</span>';
  }
  var card=document.querySelector('#tt-lbl .card');
  if(card){ card.classList.add('tt-imprimiendo'); try{ card.scrollIntoView({behavior:'smooth',block:'start'}); }catch(e){} }
  return Date.now();
}
function _confFallo(btn){
  var card=document.querySelector('#tt-lbl .card'); if(card) card.classList.remove('tt-imprimiendo');
  if(btn){ btn.disabled=false; btn.classList.remove('tt-registrando'); btn.textContent='Confirmar pedido →'; }
}
function _confSello(codigo){
  var card=document.querySelector('#tt-lbl .card'); if(!card) return;
  card.classList.remove('tt-imprimiendo');
  var v=card.querySelector('.tt-sello'); if(v) v.remove();
  var se=document.createElement('div'); se.className='tt-sello'; se.setAttribute('aria-hidden','true');
  se.innerHTML='<b>✓ REGISTRADO</b>'+(codigo?'<small>'+esc(codigo)+'</small>':'');
  card.appendChild(se);
  card.classList.remove('tt-tiembla'); void card.offsetWidth; card.classList.add('tt-tiembla');
  try{ if(navigator.vibrate && !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) navigator.vibrate([15,40,15]); }catch(e){}
  _confConfeti();
}
function _confConfeti(){
  try{
    if(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var c=document.createElement('div'); c.className='tt-confeti'; c.setAttribute('aria-hidden','true');
    var col=['#22c55e','#4f8ef7','#12a5b4','#f59e0b','#e11d2e','#a78bfa'], h='';
    for(var i=0;i<26;i++){
      h+='<i style="left:'+(Math.random()*100).toFixed(1)+'%;background:'+col[i%col.length]
        +';animation-delay:'+(Math.random()*.25).toFixed(2)+'s;animation-duration:'+(1.1+Math.random()*.6).toFixed(2)+'s;transform:rotate('+Math.round(Math.random()*360)+'deg)"></i>';
    }
    c.innerHTML=h; document.body.appendChild(c);
    setTimeout(function(){ c.remove(); }, 2200);
  }catch(e){}
}
var _waToco=false, _waListo=false, _waRecordatorio=0;
function showInlineConfirmed(order, trackCode, trackToken){
  const waHref = _construirWaHref(order, trackCode, trackToken);
  window._ttFrozen = true;
  document.querySelectorAll('.wz-step').forEach(s=>{ s.hidden=true; });
  const prog=$('wzProgress'); if(prog) prog.style.display='none';
  const codigo = order.nroComprobante ? String(order.nroComprobante) : '#'+trackCode;
  _confSello(codigo);
  const anyStep=document.querySelector('.wz-step');
  const cont=(anyStep&&anyStep.parentNode)||document.getElementById('app');
  let box=$('ttConfirmed');
  if(!box){ box=document.createElement('div'); box.id='ttConfirmed'; box.className='tt-confirmed'; cont.appendChild(box); }
  _waToco=false; _waListo=false;
  box.innerHTML = waHref ? `
    <div class="tt-meta"><div class="tt-meta-txt" id="ttMetaTxt">Tu pedido ●●●●○ · <b>falta 1 toque</b></div><div class="tt-meta-bar"><i id="ttMetaBar"></i></div></div>
    <div class="tt-wa-ttl">Envíanos tu pedido por WhatsApp</div>
    <a class="btn-wa tt-wa-btn" id="ttWaBtn" href="${esc(waHref)}" target="_blank" rel="noopener" onclick="_waAbierto()">
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="#fff" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.1 5.1 0 0 0 1.1 2.7 11.6 11.6 0 0 0 4.4 3.9c1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z"/></svg>
      Enviar por WhatsApp</a>
    <div class="tt-wa-sub">Al enviarlo recibes tu <b>link de seguimiento</b> y te avisamos cada avance.</div>
    <div class="tt-wa-vuelta" id="ttWaVuelta" style="display:none"></div>`
    : '<div class="error-box" style="margin-top:12px">No se pudo generar el enlace de WhatsApp. Contáctanos directamente.</div>';
  clearTimeout(_waRecordatorio);
  if(waHref) setTimeout(function(){ if(!_waToco) _waRecordar(true); }, 1000);
  _waRecordatorio=setTimeout(function(){ if(!_waToco) _waRecordar(); }, 25000);
}
function _waAbierto(){ _waToco=true; clearTimeout(_waRecordatorio); }
function _waRecordar(primera){
  var b=$('ttWaBtn'), v=$('ttWaVuelta'); if(!b || _waListo) return;
  b.classList.remove('tt-llama'); void b.offsetWidth; b.classList.add('tt-llama');
  if(v){
    v.style.display='block';
    v.innerHTML=(primera ? '¡Ya casi! <b>Solo falta este paso</b> para recibir tu link de seguimiento'
                         : 'Te falta enviarlo para recibir tu link de seguimiento')
      +' <span class="tt-dedo" aria-hidden="true">👆</span>';
    v.classList.remove('tt-asoma'); void v.offsetWidth; v.classList.add('tt-asoma');
  }
}
try{ document.addEventListener('visibilitychange', function(){
  if(document.hidden || !$('ttWaBtn') || _waListo) return;
  if(!_waToco){ _waRecordar(); return; }
  var v=$('ttWaVuelta'); if(!v) return;
  v.style.display='block';
  v.innerHTML='<div class="tt-wa-q">¿Ya lo enviaste?</div>'
    +'<div class="dlv-btns"><button type="button" class="dlv-si" onclick="waYaEnviado()">✓ Sí, ya lo envié</button>'
    +'<a class="dlv-aj tt-wa-otra" href="'+esc($('ttWaBtn').getAttribute('href'))+'" target="_blank" rel="noopener" onclick="_waAbierto()">Abrir otra vez</a></div>';
}); }catch(e){}
function waYaEnviado(){
  _waListo=true;
  var t=$('ttMetaTxt'), bar=$('ttMetaBar'), v=$('ttWaVuelta');
  if(t) t.innerHTML='Tu pedido ●●●●● · <b>¡completo!</b>';
  if(bar) bar.style.width='100%';
  if(v) v.innerHTML='<div class="tt-ok on">¡Gracias! 🙌 Te avisaremos cada avance de tu pedido.</div>';
  try{ if(navigator.vibrate) navigator.vibrate(12); }catch(e){}
}
