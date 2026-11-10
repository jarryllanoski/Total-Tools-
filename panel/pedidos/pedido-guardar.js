/**
 * panel/pedidos/pedido-guardar.js — guardar el pedido (saveShipment)
 * ==========================================================
 * Fase 3 (10/11/2026): el panel en módulos. Antes vivía en config.js.
 * Script CLÁSICO a propósito: sus funciones y variables son globales, igual
 * que cuando estaban en un solo archivo — moverlas no cambió ni una llamada.
 * El orden de los <script> en index.html es el orden de ejecución.
 */
function saveShipment(confirmadoReg){
  /* ★ GUARDAR Y REGISTRAR (10/11/2026). Con «Registrar en Shalom al
     guardar» encendido, primero se pide la confirmación de siempre (cuesta
     dinero) y solo después se guarda; el registro va cuando el pedido ya
     subió, porque el servidor registra con lo que hay en la nube. */
  if(_regAlGuardar && _editId && confirmadoReg !== true){ _confirmarGuardarYRegistrar(); return; }
  // Auto-agregar link si hay texto en el campo pero no se presionó +Add
  const pendingLink = ($('fLink')||{value:''}).value.trim();
  if(pendingLink && pendingLink.startsWith('http')){
    const n = pendingLink.length>36 ? pendingLink.substring(0,36)+'…' : pendingLink;
    _links.push({u:pendingLink, n});
    $('fLink').value='';
    renderLinks();
  }
  const name=$('fName').value.trim(),phone=$('fPhone').value.trim(),addr=$('fAddr').value.trim();
  if(!name||!phone||!addr){toast('⚠️ Nombre, teléfono y dirección requeridos');return}
  // El teléfono admite número (como siempre) o usuario de WhatsApp (@nombre).
  // Solo se valida cuando el operador EMPEZÓ con arroba: así un "@ab" a medio
  // escribir no se guarda roto, y los números siguen entrando exactamente igual
  // que hasta hoy (nada de estrenar reglas sobre los pedidos que ya funcionan).
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
  // ★ SHALOM: leer campos guía
  const _sGuia   = ($('fShalomGuia')   ? $('fShalomGuia').value.trim()   : '')||'';
  const _sCodigo = ($('fShalomCodigo') ? $('fShalomCodigo').value.trim() : '')||'';
  /* ★ LA AGENCIA IDENTIFICADA.
     Si sigue vigente, viajan los cuatro campos. Si no, `limpiar()` decide:
     devuelve {} cuando el pedido NUNCA tuvo agencia —así abrir y guardar un
     pedido antiguo no le añade ni un campo vacío— y los cuatro en null
     cuando sí la tenía y se rompió, porque ahí el borrado TIENE que viajar a
     la nube: un id viejo pegado a una dirección nueva es cómo se manda un
     paquete pagado a otra ciudad. */
  if(window.Agencias){
    const _agV = _agVigente();
    if(_agV) Object.assign(data, _agV);
    else Object.assign(data, Agencias.limpiar(_editId ? (S.shipments||[]).find(x=>x.id===_editId) : null));
  }
  /* La clave de recojo. Tres condiciones para escribirla, y las tres
     importan:
       · solo con courier Shalom — en un DELIVERY sería un número sin sentido;
       · solo si HAY algo que escribir, o si el pedido YA la tenía. Sin esta
         segunda parte, abrir un pedido de Shalom de hace un mes y guardarlo
         le añadía `shalomClave: ''` — un campo nuevo en un pedido antiguo,
         que es justo lo que el dueño pidió que no pasara;
       · y cuando sí se escribe, se escribe '' al vaciarla y nunca undefined,
         para que BORRARLA también viaje a la nube. */
  if(($('fCourier').value||'').toUpperCase().includes('SHALOM')){
    const _clv = (($('fShalomClave')||{value:''}).value||'').replace(/\D/g,'').slice(0,4);
    const _prevClv = _editId ?
      ((S.shipments||[]).find(x=>x.id===_editId)||{}).shalomClave : undefined;
    if(_clv || (_prevClv !== undefined && _prevClv !== '')) data.shalomClave = _clv;
  }
  /* ★ LAS COPIAS VIEJAS DEL DNI, PUESTAS AL DÍA.
     El 13/10/2026 el dueño corrigió un destinatario aquí mismo y la etiqueta
     siguió imprimiendo el DNI del anterior: `dniRecoger` se quedaba con el
     valor viejo y la etiqueta lo prefería. Ya no lo prefiere —todos los
     lectores pasan por `DniPedido.de`— pero una copia desfasada en la nube
     es una trampa esperando al siguiente que la lea, así que se pone al día.

     SOLO las que el pedido YA TENÍA: abrir y guardar un pedido antiguo no le
     estrena campos. Misma regla que `shalomClave`, dos bloques más arriba. */
  /* ★ EL NÚMERO DE FACTURA/BOLETA. Misma regla que `shalomClave`: se
     escribe si HAY algo, o si el pedido YA lo tenía —y entonces también
     vacío, para que BORRARLO viaje a la nube y el pedido vuelva a su
     código de 6 dígitos—. Abrir y guardar un pedido antiguo no le estrena
     el campo. */
  {
    const _nro = _nroLimpio(($('fComprobante')||{value:''}).value);
    const _prevNro = _editId ?
      ((S.shipments||[]).find(x=>x.id===_editId)||{}).nroComprobante : undefined;
    if(_nro || (_prevNro !== undefined && _prevNro !== null && _prevNro !== '')) data.nroComprobante = _nro;
    const _otro = _nroRepetido(_nro, _editId);
    // Aviso, no bloqueo: una factura puede cubrir dos bultos.
    if(_otro) toast('🧾 '+_nro+' también está en el pedido de '+(_otro.name||'otro cliente'));
  }
  if(_editId && window.DniPedido){
    Object.assign(data, DniPedido.copiasAlDia(
        (S.shipments||[]).find(x=>x.id===_editId), dni));
  }
  /* ★ CUÁNDO SE CORRIGIÓ, que no es cuándo nació.
     Sin esto, «rellenar con los últimos datos del cliente» ordenaba por
     `createdAt` y te ofrecía el pedido más NUEVO, no el último que
     corregiste. Los pedidos de antes de hoy no lo tienen y se siguen
     ordenando por `createdAt`, igual que siempre. */
  data.updatedAt = new Date().toISOString();
  if(_sGuia)  { data.trackingOrderNumber=_sGuia;   data.shalomGuia=_sGuia; }
  if(_sCodigo){ data.trackingOrderCode  =_sCodigo; data.shalomCodigo=_sCodigo; }
  // ★ MEDIDAS DEL PAQUETE: se guardan tal cual (vacío → '', nunca undefined,
  // para que "borrar la medida" se propague a la nube igual que cualquier
  // otro campo). pkgTipo se guarda ya calculado — barato de leer después
  // (ej. filtrar "quién tiene medidas puestas") sin repetir la cuenta cada vez.
  const _pkgL=($('fPkgLargo')||{value:''}).value.trim();
  const _pkgA=($('fPkgAncho')||{value:''}).value.trim();
  const _pkgH=($('fPkgAlto') ||{value:''}).value.trim();
  const _pkgP=($('fPkgPeso') ||{value:''}).value.trim();
  data.pkgLargo=_pkgL; data.pkgAncho=_pkgA; data.pkgAlto=_pkgH; data.pkgPeso=_pkgP;
  const _pkgClasif=(window.Shalom&&Shalom.clasificarPaquete)?Shalom.clasificarPaquete(_pkgL,_pkgA,_pkgH,_pkgP):null;
  data.pkgTipo=_pkgClasif?_pkgClasif.tipo:'';
  /* La caja elegida de un toque manda: es la que se registra en Shalom. */
  data.pkgCaja=($('fPkgCaja')||{value:''}).value||'';
  if(data.pkgCaja) data.pkgTipo=data.pkgCaja;

  /* ★ EL NOMBRE DE RENIEC, PARTIDO, SE GUARDA CON EL PEDIDO.
     Hasta ahora la consulta vivía solo en `window._dniUltima` —memoria
     volátil— y lo único que quedaba era el nombre COMPLETO en el campo de
     texto. Pero `POST /account/register` pide el nombre en TRES campos
     (`name`, `firstname`, `lastname`), y partir "JOSE LUIS DE LA CRUZ" a
     ojo se equivoca: es exactamente lo que hace la otra aplicación del
     dueño, que con un nombre de una sola palabra manda el mismo valor en
     dos campos.

     Sin esto, la reja del registro habría dicho "falta el nombre de RENIEC"
     en TODOS los pedidos, con el DNI consultado y el nombre a la vista —y
     se habría leído como un fallo del registro cuando el fallo estaba tres
     pasos antes.

     ⚠️ SOLO SI CORRESPONDE AL DNI QUE SE ESTÁ GUARDANDO. Si consultaste un
     DNI y luego escribiste otro, pegar el nombre del primero sería darle a
     Shalom el nombre de otra persona: peor que no tener ninguno.

     Y los pedidos de ayer no se tocan: solo gana el campo el que se guarda
     de hoy en adelante. */
  const _rn = window.RegistroShalom
    ? RegistroShalom.reniecDe(window._dniUltima, data.dni) : null;
  if(_rn) data.reniec = _rn;
  // (La cola del seguimiento automático se retiró: escribía
  // trackingWebProximaConsulta para el Motor B, que ya no existe. Ver shalom.js.)
  // ★ DELIVERY: motorizado (nombre, teléfono) + link inDriver. Solo se tocan si el
  //   courier es DELIVERY (no ensucia otros pedidos); null al vaciar, para que
  //   "quitar" también se propague a la nube.
  if($('fDlvDriver') && ($('fCourier').value||'').toUpperCase().includes('DELIVERY')){
    const _dDrv  = ($('fDlvDriver')||{value:''}).value.trim();
    const _dTel  = ($('fDlvDriverPhone')||{value:''}).value.trim();
    const _dLink = ($('fDlvRutaLink')||{value:''}).value.trim();
    data._dlvDriver      = _dDrv || null;
    data._dlvDriverPhone = _dTel || null;
    data._dlvRutaLink    = _dLink ? (/^https?:\/\//i.test(_dLink) ? _dLink : (/^[a-z][a-z0-9+.-]*:/i.test(_dLink) ? null : 'https://'+_dLink)) : null;
    // Sello del momento en que se asignó/cambió el motorizado o el link: la ruta
    // pone arriba al último asignado. Solo se actualiza si algo cambió.
    const _prevD = _editId ? (S.shipments.find(x=>x.id===_editId)||{}) : {};
    const _cambio = (data._dlvDriver!==(_prevD._dlvDriver||null)) ||
                    (data._dlvRutaLink!==(_prevD._dlvRutaLink||null));
    if(data._dlvDriver || data._dlvRutaLink){
      data._dlvAsignadoTs = _cambio ? Date.now() : (_prevD._dlvAsignadoTs || Date.now());
    } else {
      data._dlvAsignadoTs = null;   // sin motorizado → vuelve al orden por fecha
    }
  }
  if(_editId){const idx=S.shipments.findIndex(x=>x.id===_editId);
    // Preservar campos tracking al editar
    const prev=S.shipments[idx];
    ['trackingStatus','trackingMessage','trackingLastUpdate','trackingLastAutoCheck',
     'trackingHistory','trackingHistorialShalom','trackingOrigen','trackingDestino',
     'trackingOrderNumber','trackingOrderCode','shalomGuia','shalomCodigo',
     'shalomEstado','shalomMonto','shalomRegistradoEn',
     'dniDestinatario'].forEach(k=>{
      if(prev[k]!==undefined&&!data[k]) data[k]=prev[k];
    });
    /* Guía cambiada A MANO sobre una registrada por Shalom Pro: la nueva no
       la registró Pro, así que se quitan su marca y su hora (sin ellas no hay
       plazo de 24 h ni «registrar de nuevo» sobre una guía ajena). */
    const _gPrev = String(prev.trackingOrderNumber||prev.shalomGuia||'').trim();
    if(_sGuia && _gPrev && _sGuia !== _gPrev){ data.shalomPor=''; data.shalomRegistradoEn=''; }
    S.shipments[idx]={...prev,...data, _localTs: Date.now()};
    // ★ Aquí había además un _fbSaveShipmentNow(): el mismo pedido se escribía
    // DOS veces, una suelta al instante y otra 800 ms después dentro de la
    // tanda de save(). Estaba para que un cambio no se perdiera si cerrabas la
    // pestaña antes del debounce. Ya no hace falta: save() persiste en el acto
    // qué quedó sin subir (dpanel_dirty), _mergeRemote no se lo lleva por
    // delante y el arranque lo sube solo. Ver INVARIANTES §7.
    save(_editId);closeOverlay('formOverlay');render(); // ★ incremental: solo este pedido
    if(window.FotosModule) FotosModule.trasGuardar(_editId); // fotos pendientes → cola
    if(window.DeliveryModule&&DeliveryModule.refrescar)DeliveryModule.refrescar(); // ruta al día si está abierta
    toast('✅ Actualizado');
    return 'ok';}
  else{
    data.id='id_'+Date.now();data.createdAt=new Date().toISOString();data._localTs=Date.now();
    /* ★ EL TOKEN DEL LINK DE SEGUIMIENTO.
       Antes el link era `?seg=` + este mismo id, o sea `id_` + el reloj: un
       numero que avanza solo y que cualquiera puede recorrer. Ahora el link
       lleva 128 bits al azar (functions/enlaceSeguimiento.js).

       SOLO PEDIDOS NUEVOS. A los de ayer no se les escribe nada y su link
       de siempre sigue abriendo — hay mas de mil ya enviados por WhatsApp.

       Y SI EL MODULO NO CARGO, SE AVISA Y SE CREA IGUAL. El negocio no se
       para porque falle un <script>: sin token, el link se comporta
       exactamente como ayer. Pero callarselo seria crear pedidos con menos
       proteccion durante semanas sin que nadie se entere, que es justo el
       patron que llevamos meses cazando. */
    try{
      data.trackToken = window.EnlaceSeguimiento.generar();
    }catch(e){
      toast('⚠️ Pedido creado, pero su link de seguimiento es del tipo antiguo. Recarga con Ctrl+Shift+R y avisa.');
    }
    S.shipments.push(data);
    // ★ Sin _fbSaveShipmentNow(): ver el comentario de arriba. Un pedido nuevo
    // que aún no subió ya sobrevive al latido y al cierre de la pestaña.
    save(data.id);closeOverlay('formOverlay');
    // Sus fotos esperaban el id: entran a la cola y suben con ESTE id.
    if(window.FotosModule) FotosModule.trasGuardar(data.id);
    /* Llevar al pedido nuevo y resaltarlo, por LA MISMA puerta que usa el
       boton "Ver" de la campana.
       Antes esto era `setFilt(data.status)` + `_highlightCard(data.id)`, y
       fallaba en silencio cuando el filtro YA estaba en ese estado: setFilt
       se salia por su optimizacion, no repintaba, y la tarjeta nunca
       llegaba al DOM. Ver el comentario de `irAlPedido` en index.html. */
    if(typeof irAlPedido==='function') irAlPedido(data.id);
    else if(typeof render==='function') render();
    // Notificar (campana), igual que los pedidos del formulario público
    if(window.NotifyModule && data.status==='NUEVO PEDIDO'){
      window.NotifyModule.add({icon:'📦',title:'Nuevo pedido — '+data.name,sub:(data.courier||'')+' · '+String(data.address||data.ciudadDestino||'—').substring(0,45),shipId:data.id,ts:Date.now(),link:(data.links&&data.links[0]&&data.links[0].u)||''});
    }
    toast('✅ Envío registrado');
  }
}
