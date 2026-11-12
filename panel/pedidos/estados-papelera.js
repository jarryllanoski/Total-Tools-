let _stId=null;
function openStatus(id){
  if(Seleccion.cantidad()>1){ toast('⚠️ Selecciona un solo pedido para cambiar etiqueta'); return; }
  if(!_filt){ toast('⚠️ Filtra por una etiqueta primero'); return; }
  openPin(()=>{ _doOpenStatus(id); });
}

function _doOpenStatus(id){
  _stId=id;
  const s=S.shipments.find(x=>x.id===id);if(!s)return;
  const sel=Seleccion.marcados();
  const all=allStatuses();
  const curIdx=all.indexOf(s.status);
  $('stClientName').textContent= sel.length>1
    ? `📦 ${sel.length} clientes seleccionados`
    : `📦 ${s.name}`;
  $('stCurrentLbl').textContent= sel.length>1
    ? `Estado actual de "${s.name}": ${stIcon(s.status)} ${s.status}`
    : (curIdx<0 ? `🏷️ «${s.status||'sin estado'}» ya no es una etiqueta. Elige a dónde moverlo.` : '');
  $('statusOpts').innerHTML=all.map((st,i)=>{
    const isCur=i===curIdx;
    const canFwd=i===curIdx+1;
    const canBck=i===curIdx-1;
    const canJump=all[curIdx]==='NUEVO PEDIDO' && st==='POR ALISTAR';
    const libre=curIdx<0;
    const ok=libre||canFwd||canBck||canJump;
    return`<button class="sopt ${stSoptClass(st)}"
      style="
        ${isCur?'border-width:3px;opacity:1;filter:brightness(1.3);box-shadow:0 0 0 3px rgba(255,255,255,.1)':''}
        ${!isCur&&!ok?'opacity:.2;cursor:not-allowed':''}
        ${!isCur&&ok?'opacity:.65':''}
      "
      onclick="${ok?`applyStatus('${st}')`:''}"
      ${isCur||!ok?'disabled':''}>
      <span>${stIcon(st)} ${st}</span>
      <span style="font-size:11px;font-weight:600;opacity:.8">
        ${isCur?'● ACTUAL':libre?'➜ mover aquí':canJump?'⏩ saltar':canFwd?'▶ avanzar':canBck?'◀ retroceder':''}
      </span>
    </button>`;
  }).join('');
  openOverlay('statusOverlay');
}
function _avisoSaleDeActivos(st){
  return (st==='FINALIZADO' && _soloActivos()) ? ' · sale de la lista de activos' : '';
}
window._avisoSaleDeActivos = _avisoSaleDeActivos;

function applyStatus(st){
  const s=S.shipments.find(x=>x.id===_stId);if(!s)return;
  const sel=Seleccion.marcados();
  if(sel.length>1){
    sel.forEach(x=>{ x.status=st; save(x.id); });
    Seleccion.limpiar();
    render(); closeOverlay('statusOverlay');
    toast(`${stIcon(st)} ${st} → ${sel.length} clientes` + _avisoSaleDeActivos(st));
  } else {
    s.status=st;
    save(s.id); render(); closeOverlay('statusOverlay');
    toast(`${stIcon(st)} ${st}` + _avisoSaleDeActivos(st));
    if(window.Cotizacion && Cotizacion.onEstado) Cotizacion.onEstado(s.id, st);
  }
}

function confirmar(op){
  const msg = $('delMsg'), si = $('delYes');
  if(!msg || !si) return;
  const textoSi = op.textoSi || 'Sí, eliminar';

  if(op.html !== undefined) msg.innerHTML = op.html;
  else msg.textContent = op.texto || '';
  si.textContent = textoSi;
  si.disabled = false;
  si.style.background = op.colorSi || 'var(--red)';

  si.onclick = async () => {
    si.disabled = true;
    if(op.trabajando) si.textContent = op.trabajando;
    let bien = false;
    try{
      await op.alConfirmar();
      bien = true;
    }catch(e){
      console.warn('confirmar:', e);
      toast(op.siFalla || '⚠️ No se pudo completar la acción');
    }finally{
      si.disabled = false;
      si.textContent = textoSi;
    }
    if(bien) closeOverlay('delOverlay');
  };
  openOverlay('delOverlay');
}
window.confirmar = confirmar;

function openDel(id){
  const s=S.shipments.find(x=>x.id===id);if(!s)return;
  confirmar({
    texto: `¿Mover "${s.name}" a la papelera?`,
    textoSi: 'Mover a papelera',
    trabajando: 'Moviendo...',
    siFalla: '❌ No se pudo mover a papelera. El pedido no fue borrado.',
    alConfirmar: async () => {
      if(window._fbWriteTrashItem)
        await window._fbWriteTrashItem(id,{shipment:s,deletedAt:Date.now()});
      S.trash.push({shipment:s,deletedAt:Date.now()});
      S.shipments=S.shipments.filter(x=>x.id!==id);
      if(window._fbDeleteShipment) window._fbDeleteShipment(id);
      save('config');render();toast('🗑️ Movido a papelera');
    }
  });
}
function delSelected(){
  const sel=Seleccion.marcados();if(!sel.length){toast('Selecciona envíos');return}
  const ids=new Set(sel.map(s=>String(s.id)));
  confirmar({
    texto: `¿Mover ${sel.length} envío(s) a la papelera?`,
    textoSi: 'Mover a papelera',
    trabajando: 'Moviendo...',
    alConfirmar: () => {
    const aBorrar=S.shipments.filter(s=>ids.has(String(s.id)));
    aBorrar.forEach(s=>{
      S.trash.push({shipment:s, deletedAt:Date.now()});
      if(window._fbDeleteShipment) window._fbDeleteShipment(s.id);
    });
    S.shipments=S.shipments.filter(x=>!ids.has(String(x.id)));
    Seleccion.quitar(Array.from(ids));
    save('config');render();toast(`🗑️ ${aBorrar.length} movidos a papelera`);
    }
  });
}

let _pinEntry='', _pinCallback=null;
