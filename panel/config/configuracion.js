/**
 * panel/config/configuracion.js — la pantalla de Config: negocio, etiquetas, couriers, campos
 * ====================================================================================
 * Fase 3 (10/11/2026): el panel en módulos. Antes vivía en config.js.
 * Script CLÁSICO a propósito: sus funciones y variables son globales, igual
 * que cuando estaban en un solo archivo — moverlas no cambió ni una llamada.
 * El orden de los <script> en index.html es el orden de ejecución.
 */
function changePIN(){
  openPin(()=>{
    _pinEntry=''; updatePinDots();
    $('pinMsg').textContent='Ingresa la NUEVA clave (4 dígitos)';
    $('pinMsg').style.color='var(--blue)';
    openOverlay('pinOverlay');
    _pinCallback=()=>{ S.statusPin=_pinEntry; save('config'); toast('🔐 Clave actualizada a: '+_pinEntry); };
  });
}
/* CONFIG */
function loadCfgUI(){
  $('cfgName').value=S.config.name||'';$('cfgPhone').value=S.config.phone||'';$('cfgCity').value=S.config.city||'';
  // Toggle auto-tracking Shalom (por defecto encendido)
  // El estado de la puerta a Shalom se lee de Firestore, así que se pinta
  // aparte y sin bloquear: la pantalla de Config no espera por la red.
  if(typeof _pintarPuertaShalom==='function') _pintarPuertaShalom();
  // El barrido programado: sus ajustes viven en S.config, su informe en el
  // servidor. Lo segundo se pinta aparte y sin bloquear la pantalla.
  if(typeof _cfgBarrido==='function'){
    const b=_cfgBarrido();
    if($('cfgBarridoHoras')) $('cfgBarridoHoras').value=b.horas||'';
    if($('cfgBarridoModo'))  $('cfgBarridoModo').value=b.modo||'semi';
    const ta=$('tglBarridoActivo');    if(ta) ta.classList.toggle('on', b.activo!==false);
  }
  if(typeof _pintarUltimoBarrido==='function') _pintarUltimoBarrido();
  if(typeof _pintarOrigen==='function') _pintarOrigen();
  if(typeof _pintarShalomConfig==='function') _pintarShalomConfig();
  // Configuración Shalom: solo queda "Mostrar en el link del cliente". El motor
  // de rastreo, el modo de etiquetas y los intervalos se retiraron con el
  // rastreo viejo. Los campos que quedan en S.config (trackingMotor,
  // trackingEtiquetaModo, trackingWebInterval*) NO se borran a propósito: son
  // datos guardados y borrarlos no aporta nada; simplemente ya nadie los lee.
  {
    const tc=$('tglTrackingWebCliente');
    if(tc) tc.classList.toggle('on', !!S.config.trackingWebMostrarCliente);
  }

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
  let movidos=[];
  if(_editLabelIdx!==null){
    const newName=nombreEtiqueta($('leNameInp').value);
    if(newName&&newName!==_editLabelSt){
      /* Dos etiquetas con el mismo nombre compartían los mensajes y no se
         podían distinguir en los filtros. */
      if(S.labels.includes(newName)){ toast('⚠️ Ya existe la etiqueta «'+newName+'»'); return; }
      // Move messages to new name
      S.msgTemplates[newName]=S.msgTemplates[_editLabelSt];
      delete S.msgTemplates[_editLabelSt];
      S.labels[_editLabelIdx]=newName;
      /* ★ Sus pedidos se van con ella. Antes se quedaban con el nombre
         viejo y caían a «sin etiqueta» sin que nadie lo notara. */
      movidos=S.shipments.filter(x=>x.status===_editLabelSt);
      movidos.forEach(x=>{ x.status=newName; });
      if(_filt===_editLabelSt) _filt=newName;
      if(_chipSort[_editLabelSt]){ _chipSort[newName]=_chipSort[_editLabelSt]; delete _chipSort[_editLabelSt]; }
    }
  }
  // Con pedidos movidos se suben SOLO esos (y la configuración, que cambió).
  save(movidos.length ? movidos.map(x=>x.id) : 'config'); renderChips(); loadCfgUI(); if(movidos.length) render();
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
      <button class="cbtn-yes" style="background:var(--blue)" onclick="S.couriers[${i}]=document.getElementById('editCourierInp').value.trim()||S.couriers[${i}];save('config');loadCfgUI();closeOverlay('delOverlay');toast('✅ Guardado')">Guardar</button>
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
      <button class="cbtn-yes" style="background:var(--blue)" onclick="S.extraFields[${i}]=document.getElementById('editExtraInp').value.trim()||S.extraFields[${i}];save('config');loadCfgUI();closeOverlay('delOverlay');toast('✅ Guardado')">Guardar</button>
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
  // Una sola puerta para pintar el encabezado: tres copias del mismo par de
  // líneas es como una se queda vieja sin que nadie lo note.
  if(typeof pintarEncabezado==='function') pintarEncabezado();
  save('config'); renderChips(); toast('✅ Configuración guardada'); // ★ solo config
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
  save('config');renderChips();loadCfgUI(); // ★ solo config
}
function dragEnd(){document.querySelectorAll('.label-drag-row').forEach(r=>{r.classList.remove('dragging');r.classList.remove('drag-over')});_dragIdx=null}

// Inline add functions
function addLabelInline(){
  // Nunca dos iguales: «NUEVA ETIQUETA», «NUEVA ETIQUETA 2»…
  let nombre='NUEVA ETIQUETA', n=2;
  while(S.labels.includes(nombre)) nombre='NUEVA ETIQUETA '+(n++);
  S.labels.push(nombre);
  save('config');renderChips();loadCfgUI(); // ★ solo config
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
  S.couriers.push(v);save('config');loadCfgUI();inp.value=''; // ★ solo config
}
function addExtraInline(){
  const inp=$('newExtraInp');const v=inp.value.trim();
  if(!v){toast('Escribe el nombre del campo');return}
  S.extraFields.push(v);save('config');loadCfgUI();inp.value=''; // ★ solo config
}

// Protected delete — requires hold confirmation
function confirmDelItem(type,idx){
  let name='';
  if(type==='label') name=S.labels[idx];
  else if(type==='courier') name=S.couriers[idx];
  else name=S.extraFields[idx];
  if(type==='courier'&&FIXED_COURIERS.includes(name)){toast('⚠️ Este courier es fijo y no se puede eliminar');return}
  /* Tenía el mismo fallo que el borrado de link: no reponía el texto ni el
     `disabled`, así que borrar una etiqueta o un courier también quedaba
     muerto si antes habías borrado un pedido. Eran dos pantallas, no una. */
  const nSinEtq = type==='label' ? S.shipments.filter(x=>x.status===name).length : 0;
  confirmar({
    texto: type==='label'
      ? `¿Eliminar la etiqueta "${name}"?` + (nSinEtq
          ? ` Sus ${nSinEtq} pedido(s) NO se borran: quedan en 🏷️ SIN ETIQUETA hasta que los muevas.`
          : ' No tiene pedidos.')
      : `¿Eliminar "${name}"? Esto no se puede deshacer.`,
    textoSi:'Sí, eliminar',
    alConfirmar: () => {
      if(type==='label'){
        /* Los pedidos NO se tocan: conservan su estado y aparecen en
           «🏷️ SIN ETIQUETA» hasta que los muevas. Los mensajes A/B sí se
           van con la etiqueta: si un día creas otra con el mismo nombre,
           empieza limpia. */
        S.labels.splice(idx,1);
        if(S.msgTemplates) delete S.msgTemplates[name];
        delete _chipSort[name];
        if(_filt===name) _filt = nSinEtq ? SIN_ETIQUETA : '';
        renderChips(); if(nSinEtq) render();
      }
      else if(type==='courier') S.couriers.splice(idx,1);
      else S.extraFields.splice(idx,1);
      save('config');loadCfgUI();toast('🗑️ Eliminado'); // solo config
    }
  });
}
function toggleDispatchDay(v){
  if(!S.dispatch.days) S.dispatch.days=[];
  const idx=S.dispatch.days.indexOf(v);
  if(idx>=0) S.dispatch.days.splice(idx,1);
  else S.dispatch.days.push(v);
  save('config'); // ★ solo config, no reescribe los 180 pedidos
  // Update buttons in place
  document.querySelectorAll('.day-btn').forEach(btn=>{
    const bv=parseInt(btn.getAttribute('onclick').match(/\d+/)[0]);
    btn.classList.toggle('active',S.dispatch.days.includes(bv));
  });
}

function toggleCourierActive(name){
  S.courierActive[name] = S.courierActive[name]===false ? true : false;
  save('config'); loadCfgUI(); // ★ solo config, no reescribe los 180 pedidos
  toast(S.courierActive[name]===false ? `🚚 ${name} oculto del formulario` : `🚚 ${name} visible en formulario`);
}
