
function openPin(cb, msg){
  _pinEntry=''; _pinCallback=cb;
  updatePinDots();
  $('pinMsg').textContent=msg||'Ingresa la clave para cambiar el estado';
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
function onTrashBtnTap(){
  const sel=Seleccion.marcados();
  if(sel.length===1){ openDel(sel[0].id); return; }
  if(sel.length>1){ toast('⚠️ Para borrar, selecciona solo un pedido a la vez'); return; }
  openTrash();
}

function openTrash(){
  const now=Date.now();
  const before=S.trash.length;
  S.trash=S.trash.filter(x=>(now-x.deletedAt)<30*24*60*60*1000);
  if(S.trash.length!==before) save('config');

  if(!S.trash.length){
    $('trashList').innerHTML='<div style="text-align:center;padding:24px;color:var(--text2)">🗑️<br><br>La papelera está vacía</div>';
  } else {
    $('trashList').innerHTML=S.trash.map((item,i)=>{
      const days=Math.floor((Date.now()-item.deletedAt)/(24*60*60*1000));
      const remaining=30-days;
      const warn=remaining<=5;
      return`<div class="trash-item">
        <div class="trash-item-info">
          <div class="trash-item-name">${esc(item.shipment.name)}</div>
          <div class="trash-item-meta">📞 ${esc(item.shipment.phone)} · 🚚 ${esc(item.shipment.courier)}</div>
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
  delete item.shipment.sel;
  S.shipments.push(item.shipment);
  S.trash.splice(i,1);
  save(item.shipment.id);render();openTrash();toast(`✅ ${item.shipment.name} recuperado`);
}

function emptyTrash(){
  if(!S.trash.length){toast('La papelera ya está vacía');return}
  confirmar({
    texto:`¿Eliminar definitivamente ${S.trash.length} envío(s)? Esto no se puede deshacer.`,
    textoSi:'Eliminar definitivamente',
    trabajando:'Eliminando...',
    alConfirmar: async () => {
      try{
        if(window._fsList&&window._fbDeleteTrashItem){
          const items=await window._fsList('panel/trash/items');
          await Promise.all(items.map(x=>window._fbDeleteTrashItem(x._id)));
        }
      }catch(e){console.warn('emptyTrash subcol:',e.message);}
      S.trash=[];save('config');openTrash();toast('🗑️ Papelera vaciada');
    }
  });
}
