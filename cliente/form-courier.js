'use strict';

function pickCourier(name){
  const sel=$('f_courier'); if(!sel) return;
  sel.value=name;
  sel.dispatchEvent(new Event('change',{bubbles:true}));
  const cards=document.querySelectorAll('#courierCards .cour-card');
  cards.forEach(c=>{
    const on=c.getAttribute('data-courier')===name;
    c.classList.toggle('sel',on);
    c.setAttribute('aria-checked',on?'true':'false');
  });
}

function onCourierChange(name){
  selCourierType = _tipoEnvioDe(name);
  selCourierName=name;
  window._selCourierType = name ? selCourierType : '';
  $('err_courier')&&$('err_courier').classList.remove('show');
  _gpsLat=null; _gpsLon=null; _dlvReset();
  const agBox=$('agencyBox');
  const addrBox=$('deliveryAddrBox');
  const encBox=$('encomiendaBox');
  if(selCourierType==='agencia'){
    if(agBox){agBox.style.display='block';renderAgencyBox(name);}
    if(addrBox) addrBox.style.display='none';
    if(encBox) encBox.style.display='none';
  } else if(selCourierType==='encomienda'){
    if(agBox){agBox.style.display='none';resetAgency();}
    if(addrBox) addrBox.style.display='none';
    if(encBox) encBox.style.display='block';
  } else if(selCourierType==='retiro'){
    if(agBox){agBox.style.display='none';resetAgency();}
    if(addrBox) addrBox.style.display='none';
    if(encBox) encBox.style.display='none';
  } else {
    if(agBox){agBox.style.display='none';resetAgency();}
    if(addrBox) addrBox.style.display='block';
    if(encBox) encBox.style.display='none';
    _dlvConectar();
  }
  _updateKnownAddrShortcut();
  const badge=$('courierBadge');
  if(badge){
    if(name){
      const ico=_courierIcon(name, selCourierType);
      const tipoTxt = selCourierType==='agencia'?'Retiro en agencia'
                    : selCourierType==='retiro'?'Retiro en tienda'
                    : selCourierType==='encomienda'?'Otras Agencias'
                    : 'Envío a domicilio';
      badge.style.display='block';
      const lbl=_courierLabel(name, selCourierType);
      const extra=lbl.toUpperCase().indexOf(tipoTxt.toUpperCase())>=0 ? '' : ` · ${tipoTxt}`;
      badge.innerHTML=`<div class="tt-envio">${ico} <b>Envío: ${esc(lbl)}</b>${extra}</div>`;
    } else {
      badge.style.display='none';
    }
  }
}

function _updateKnownAddrShortcut(){
  const shortcut=$('addrShortcut');
  if(!shortcut) return;
  if(_knownClient&&_knownClient.address&&selCourierType==='delivery'){
    const full=_knownClient.address;
    const short=full.length>70?full.slice(0,70)+'…':full;
    shortcut.style.display='block';
    shortcut.innerHTML=`
      <div class="addr-opt" onclick="usarDireccionDeSiempre()" style="align-items:flex-start">
        <div class="addr-opt-icon">📍</div>
        <div class="addr-opt-body">
          <div class="addr-opt-lbl">Usar mi dirección de siempre</div>
          <div class="addr-opt-desc" style="color:var(--text2)">${esc(short)}</div>
        </div>
      </div>`;
  } else {
    shortcut.style.display='none';
    shortcut.innerHTML='';
  }
}

function usarDireccionDeSiempre(){
  if(!_knownClient||!_knownClient.address) return;
  const ta=$('addrManualInput');
  if(ta){ ta.value=_knownClient.address; try{ ta.focus(); }catch(e){} }
  onDireccionInput();
}

function collectExtra(){
  const extra={};
  document.querySelectorAll('[data-extra]').forEach(el=>{extra[el.dataset.extra]=el.value.trim();});
  return extra;
}

function renderAgencyBox(courierName){
  const agBox = $('agencyBox');
  if(!agBox) return;
  const agKey = _agSourceKey(courierName);
  if(agKey){
    const cfg = AGENCY_SOURCES[agKey];
    agBox.innerHTML = `<div class="agc-box">
      <!-- ★ ELEGIR SEDE (31/10/2026). UNA verdad: la LISTA. La ubicacion, el
           mapa y el buscador solo la ORDENAN o la FILTRAN; elegir es siempre
           la misma puerta (_agElegir), venga de un pin o de una fila.
           Sin comillas invertidas en estos comentarios: viven dentro de un
           template literal. -->
      <span class="agc-lbl">Elige tu sede ${esc(cfg.label)} *</span>
      <!-- La accion principal, grande y arriba: usar la ubicacion. El
           beneficio dicho con palabras del cliente, y la explicacion ANTES de
           que salga el aviso del navegador (asi se acepta mas). Si falla o la
           niegan, aqui mismo se dice que hacer, y todo lo demas sigue. -->
      <div id="agUbicCaja" class="ag-ubic">
        <!-- ★ BOTÓN NATIVO <geolocation> (Chrome 144+): lo dibuja el navegador,
             que confía en ese toque y deja RECUPERAR un permiso bloqueado ahí
             mismo. Donde no existe (Safari, Firefox, Chrome viejo, WhatsApp),
             el navegador muestra lo de dentro: el botón de siempre. -->
        <geolocation id="agGeoNativo" class="ag-geo">
        <button type="button" id="shalomCercaBtn" class="ag-ubic-btn" onclick="agUbicarme('${agKey}')"
          aria-label="Usar mi ubicación para ver las sedes más cercanas">
          <span class="geo-pin" aria-hidden="true">📍</span> <span class="cerca-txt">Usar mi ubicación</span></button>
        </geolocation>
        <div class="ag-ubic-sub" id="agUbicSub">Te mostramos las sedes más cerca de ti. Solo la usamos para ordenarlas; no la guardamos.</div>
      </div>
      <!-- ORDEN = el orden en que se decide (30/10/2026): los DOS caminos
           juntos arriba (ubicacion y lupa), los resultados JUSTO debajo de
           donde se escribe (con el teclado abierto se ven), y el mapa al
           final como apoyo. -->
      <div id="agLupaHint"><span class="ag-lh-ic"></span>Busca tu provincia o distrito</div>
      <div class="ag-buscar" style="position:relative;margin-bottom:10px">
        <span class="ag-lupa" aria-hidden="true">🔍</span>
        <!-- SIN data-wz-focus, a proposito: al llegar al paso el teclado no
             debe abrirse encima del mapa y de la lista. -->
        <input class="fi" id="shalomAgInput" autocomplete="off"
          style="padding-left:42px;padding-right:40px;text-overflow:ellipsis"
          placeholder="Busca provincia o distrito"
          oninput="agOnInput('${agKey}', this.value)">
        <div id="shalomSpin" style="display:none;position:absolute;right:14px;top:50%;
          transform:translateY(-50%);width:16px;height:16px;border:2px solid #1e1e30;
          border-top-color:var(--blue);border-radius:50%;animation:spin .7s linear infinite"></div>
      </div>
      <div id="shalomDrop" class="ag-lista" style="display:none"></div>
      <div id="shalomMapaWrap" class="ag-mapa-wrap" style="display:none">
        <div id="shalomMapa" class="ag-mapa"></div>
        <div id="agMapaDedos" class="ag-mapa-dedos" aria-hidden="true">Usa 2 dedos para mover el mapa</div>
        <div class="ag-mapa-btns">
          <button type="button" onclick="agVerTodos('${agKey}')">🗺️ Ver todos</button>
          <button type="button" onclick="agMiPosicion('${agKey}')">◎ Mi posición</button>
        </div>
      </div>
      <div id="agMapaAyuda" class="ag-mapa-ayuda" style="display:none"></div>
      <!-- La sede elegida tambien queda aqui, en texto: la etiqueta viva y el
           narrador la leen de este span. Se ve en la lista (arriba, con su
           marca), asi que este bloque va oculto. -->
      <div id="shalomSelBadge" style="display:none">
        <div class="sel-badge">🏢 <span id="shalomSelTxt"></span>
          <button class="clr-btn" onclick="agReset('${agKey}')">✕</button></div>
      </div>
      <div class="ferr" id="err_agency" style="margin-top:6px">Selecciona una agencia</div>
    </div>`;
    agPrecargar(agKey);
    _agGeoNativo(agKey);
    agIniciarAlVer(agKey);
    return;
  }
  {
    agBox.innerHTML=`<div class="agc-box">
      <span class="agc-lbl">🏢 Escribe la agencia de ${esc(courierName)}</span>
      <div style="font-size:12px;color:var(--text2);margin-bottom:10px;line-height:1.5">
        Indica el departamento, provincia, distrito y dirección de la agencia donde quieres recoger tu pedido.
      </div>
      <div class="fg" style="margin-bottom:8px">
        <textarea class="fi" id="agcManualInput" rows="3" data-wz-focus
          placeholder="Ej: Arequipa / Cerro Colorado — Av. Ejército 123, agencia Olva Zamácola"
          oninput="onAgencyManual(this.value)"
          style="resize:vertical;min-height:70px;font-family:inherit"></textarea>
      </div>
      <div class="ferr" id="err_agency_manual" style="margin-top:2px">Escribe la agencia de destino</div>
    </div>`;
    return;
  }
}

function onAgencyManual(val){
  const txt=(val||'').trim();
  agState = {dept:'', prov:'', dist:'', addr:txt};
  window._agIdent = null; window._agIdentTxt = '';
  if(txt){ $('err_agency')&&$('err_agency').classList.remove('show'); }
}

function resetAgency(){
  agState={dept:'',prov:'',dist:'',addr:''};
}
