function saveShipment(confirmadoReg){
  if(_regAlGuardar && _editId && confirmadoReg !== true){ _confirmarGuardarYRegistrar(); return; }
  const pendingLink = ($('fLink')||{value:''}).value.trim();
  if(pendingLink && pendingLink.startsWith('http')){
    const n = pendingLink.length>36 ? pendingLink.substring(0,36)+'…' : pendingLink;
    _links.push({u:pendingLink, n});
    $('fLink').value='';
    renderLinks();
  }
  const name=$('fName').value.trim(),phone=$('fPhone').value.trim(),addr=$('fAddr').value.trim();
  if(!name||!phone||!addr){toast('⚠️ Nombre, teléfono y dirección requeridos');return}
  if(phone.charAt(0)==='@' && !(typeof window.esUsuarioWA==='function' && window.esUsuarioWA(phone))){
    toast('⚠️ Usuario de WhatsApp: @ y 3 a 35 letras, números, puntos o guiones bajos');return;
  }
  const extra={};document.querySelectorAll('.xf').forEach(el=>extra[el.dataset.f]=el.value);
  const dni=($('fDni')||{value:''}).value.trim();
  const _isEncSave=($('fCourier').value||'').toUpperCase().includes('ENCOMIENDA');
  const _encAgencia=_isEncSave?($('fEncAgencia')||{value:''}).value.trim():'';
  const _monto=($('fMonto')||{value:''}).value.trim();
  const _adel=($('fAdelanto')||{value:''}).value.trim();
  const _deuda=Math.max(0,(parseFloat(_monto)||0)-(parseFloat(_adel)||0));
  const data={name,phone,dni,address:_isEncSave?'':addr,courier:$('fCourier').value,date:$('fDate').value,status:$('fStatus').value,monto:_monto,adelanto:_adel,cost:(_deuda>0?String(_deuda):''),notes:$('fNotes').value.trim(),extra,docGuia:_docs.guia,docEmbalado:_docs.embalado,docTicket:_docs.ticket,links:JSON.parse(JSON.stringify(_links)),sel:false,chkGuia:false,chkEmbalado:false,chkTicket:false};
  if(_isEncSave){data.ciudadDestino=addr;data.encAgencia=_encAgencia;}
  const _sGuia   = ($('fShalomGuia')   ? $('fShalomGuia').value.trim()   : '')||'';
  const _sCodigo = ($('fShalomCodigo') ? $('fShalomCodigo').value.trim() : '')||'';
  if(window.Agencias){
    const _agV = _agVigente();
    if(_agV) Object.assign(data, _agV);
    else Object.assign(data, Agencias.limpiar(_editId ? (S.shipments||[]).find(x=>x.id===_editId) : null));
  }
  if(($('fCourier').value||'').toUpperCase().includes('SHALOM')){
    const _clv = (($('fShalomClave')||{value:''}).value||'').replace(/\D/g,'').slice(0,4);
    const _prevClv = _editId ?
      ((S.shipments||[]).find(x=>x.id===_editId)||{}).shalomClave : undefined;
    if(_clv || (_prevClv !== undefined && _prevClv !== '')) data.shalomClave = _clv;
  }
  {
    const _nro = _nroLimpio(($('fComprobante')||{value:''}).value);
    const _prevNro = _editId ?
      ((S.shipments||[]).find(x=>x.id===_editId)||{}).nroComprobante : undefined;
    if(_nro || (_prevNro !== undefined && _prevNro !== null && _prevNro !== '')) data.nroComprobante = _nro;
    const _otro = _nroRepetido(_nro, _editId);
    if(_otro) toast('🧾 '+_nro+' también está en el pedido de '+(_otro.name||'otro cliente'));
  }
  if(_editId && window.DniPedido){
    Object.assign(data, DniPedido.copiasAlDia(
        (S.shipments||[]).find(x=>x.id===_editId), dni));
  }
  data.updatedAt = new Date().toISOString();
  if(_sGuia)  { data.trackingOrderNumber=_sGuia;   data.shalomGuia=_sGuia; }
  if(_sCodigo){ data.trackingOrderCode  =_sCodigo; data.shalomCodigo=_sCodigo; }
  const _pkgL=($('fPkgLargo')||{value:''}).value.trim();
  const _pkgA=($('fPkgAncho')||{value:''}).value.trim();
  const _pkgH=($('fPkgAlto') ||{value:''}).value.trim();
  const _pkgP=($('fPkgPeso') ||{value:''}).value.trim();
  data.pkgLargo=_pkgL; data.pkgAncho=_pkgA; data.pkgAlto=_pkgH; data.pkgPeso=_pkgP;
  const _pkgClasif=(window.Shalom&&Shalom.clasificarPaquete)?Shalom.clasificarPaquete(_pkgL,_pkgA,_pkgH,_pkgP):null;
  data.pkgTipo=_pkgClasif?_pkgClasif.tipo:'';
  data.pkgCaja=($('fPkgCaja')||{value:''}).value||'';
  if(data.pkgCaja) data.pkgTipo=data.pkgCaja;

  const _rn = window.RegistroShalom
    ? RegistroShalom.reniecDe(window._dniUltima, data.dni) : null;
  if(_rn) data.reniec = _rn;
  if($('fDlvDriver') && ($('fCourier').value||'').toUpperCase().includes('DELIVERY')){
    const _dDrv  = ($('fDlvDriver')||{value:''}).value.trim();
    const _dTel  = ($('fDlvDriverPhone')||{value:''}).value.trim();
    const _dLink = ($('fDlvRutaLink')||{value:''}).value.trim();
    data._dlvDriver      = _dDrv || null;
    data._dlvDriverPhone = _dTel || null;
    data._dlvRutaLink    = _dLink ? (/^https?:\/\//i.test(_dLink) ? _dLink : (/^[a-z][a-z0-9+.-]*:/i.test(_dLink) ? null : 'https://'+_dLink)) : null;
    const _prevD = _editId ? (S.shipments.find(x=>x.id===_editId)||{}) : {};
    const _cambio = (data._dlvDriver!==(_prevD._dlvDriver||null)) ||
                    (data._dlvRutaLink!==(_prevD._dlvRutaLink||null));
    if(data._dlvDriver || data._dlvRutaLink){
      data._dlvAsignadoTs = _cambio ? Date.now() : (_prevD._dlvAsignadoTs || Date.now());
    } else {
      data._dlvAsignadoTs = null;
    }
  }
  if(_editId){const idx=S.shipments.findIndex(x=>x.id===_editId);
    const prev=S.shipments[idx];
    ['trackingStatus','trackingMessage','trackingLastUpdate','trackingLastAutoCheck',
     'trackingHistory','trackingHistorialShalom','trackingOrigen','trackingDestino',
     'trackingOrderNumber','trackingOrderCode','shalomGuia','shalomCodigo',
     'shalomEstado','shalomMonto','shalomRegistradoEn',
     'dniDestinatario'].forEach(k=>{
      if(prev[k]!==undefined&&!data[k]) data[k]=prev[k];
    });
    const _gPrev = String(prev.trackingOrderNumber||prev.shalomGuia||'').trim();
    if(_sGuia && _gPrev && _sGuia !== _gPrev){ data.shalomPor=''; data.shalomRegistradoEn=''; }
    S.shipments[idx]={...prev,...data, _localTs: Date.now()};
    save(_editId);closeOverlay('formOverlay');render();
    if(window.FotosModule) FotosModule.trasGuardar(_editId);
    if(window.DeliveryModule&&DeliveryModule.refrescar)DeliveryModule.refrescar();
    toast('✅ Actualizado');
    return 'ok';}
  else{
    data.id='id_'+Date.now();data.createdAt=new Date().toISOString();data._localTs=Date.now();
    try{
      data.trackToken = window.EnlaceSeguimiento.generar();
    }catch(e){
      toast('⚠️ Pedido creado, pero su link de seguimiento es del tipo antiguo. Recarga con Ctrl+Shift+R y avisa.');
    }
    S.shipments.push(data);
    save(data.id);closeOverlay('formOverlay');
    if(window.FotosModule) FotosModule.trasGuardar(data.id);
    if(typeof irAlPedido==='function') irAlPedido(data.id);
    else if(typeof render==='function') render();
    if(window.NotifyModule && data.status==='NUEVO PEDIDO'){
      window.NotifyModule.add({icon:'📦',title:'Nuevo pedido — '+data.name,sub:(data.courier||'')+' · '+String(data.address||data.ciudadDestino||'—').substring(0,45),shipId:data.id,ts:Date.now(),link:(data.links&&data.links[0]&&data.links[0].u)||''});
    }
    toast('✅ Envío registrado');
  }
}
