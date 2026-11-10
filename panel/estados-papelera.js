/**
 * panel/estados-papelera.js — cambiar estado, confirmar, papelera
 * ===============================================================
 * Fase 3 (10/11/2026): el panel en módulos. Antes vivía en index.html.
 * Script CLÁSICO a propósito: sus funciones y variables son globales, igual
 * que cuando estaban en un solo archivo — moverlas no cambió ni una llamada.
 * El orden de los <script> en index.html es el orden de ejecución.
 */
/* STATUS */
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
    // Special: from NUEVO PEDIDO (idx 0) allow jump to POR ALISTAR (idx 2)
    const canJump=all[curIdx]==='NUEVO PEDIDO' && st==='POR ALISTAR';
    // Sin etiqueta (la suya se borró) no tiene «siguiente»: va a cualquiera.
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
/* Marcar algo como FINALIZADO desde TODOS hace que la tarjeta desaparezca de
   la lista. Es correcto —ya no es un pendiente— pero sorprende si nadie lo
   dice: se ve igual que si se hubiera borrado. */
function _avisoSaleDeActivos(st){
  return (st==='FINALIZADO' && _soloActivos()) ? ' · sale de la lista de activos' : '';
}
// delivery.js finaliza por su cuenta al confirmar una entrega y también hace
// desaparecer la tarjeta: necesita poder decirlo con las mismas palabras.
window._avisoSaleDeActivos = _avisoSaleDeActivos;

function applyStatus(st){
  const s=S.shipments.find(x=>x.id===_stId);if(!s)return;
  const sel=Seleccion.marcados();
  if(sel.length>1){
    // Apply to all selected
    sel.forEach(x=>{ x.status=st; save(x.id); }); // incremental: solo los seleccionados
    Seleccion.limpiar();
    render(); closeOverlay('statusOverlay');
    toast(`${stIcon(st)} ${st} → ${sel.length} clientes` + _avisoSaleDeActivos(st));
  } else {
    s.status=st;
    save(s.id); render(); closeOverlay('statusOverlay'); // ★ incremental: solo este pedido
    toast(`${stIcon(st)} ${st}` + _avisoSaleDeActivos(st));
    // Hook Cotización: al pasar a EN PROCESO, ofrece enviar los faltantes a un proveedor.
    if(window.Cotizacion && Cotizacion.onEstado) Cotizacion.onEstado(s.id, st);
  }
}

/* ── LA ÚNICA PUERTA AL DIÁLOGO DE CONFIRMAR ─────────────────────────────
   Cinco pantallas —borrar pedido, borrar varios, borrar proveedor, vaciar
   papelera y borrar link— escribían A MANO sobre el mismo botón: su texto, su
   color, su acción y si estaba apagado. Cada una tenía que acordarse de
   dejarlo limpio para las otras cuatro.

   Una se olvidó. `openDel` dejaba el botón en "Moviendo…" y DESHABILITADO al
   terminar bien (solo lo reponía si fallaba), y el borrado de link no reponía
   nada. Resultado: borrabas un pedido y el siguiente borrado de link nacía
   muerto — el botón salía diciendo "Moviendo…" y no respondía. No fallaba
   siempre: fallaba según lo que hubieras hecho antes, que es lo peor que
   puede hacer un fallo.

   Ahora nadie toca el botón. Esta función lo pone en su sitio al abrir y lo
   devuelve SIEMPRE al terminar —salga bien o mal—, así que ya no hay nada de
   qué acordarse. Hay una prueba que falla si alguien vuelve a escribirle
   encima por su cuenta. */
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
    // Cerrar solo si salió bien: si falló, el aviso se lee con el diálogo
    // delante y se puede reintentar sin volver a buscar el pedido.
    if(bien) closeOverlay('delOverlay');
  };
  openOverlay('delOverlay');
}
window.confirmar = confirmar;

/* DELETE → TRASH */
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
      save('config');render();toast('🗑️ Movido a papelera'); // solo config (trash): el pedido ya se borró de Firestore
    }
  });
}
function delSelected(){
  const sel=Seleccion.marcados();if(!sel.length){toast('Selecciona envíos');return}
  /* SE CONGELA LA LISTA ACÁ, Y ES LA ÚNICA QUE MANDA.
     Antes esto leía la selección dos veces: una al abrir el aviso (para contar)
     y otra al confirmar (para quitar de la pantalla). Entre las dos caben
     segundos, y en esos segundos el latido de Firebase reemplaza los pedidos.
     Si la selección cambiaba en medio, se quitaba de la pantalla un pedido que
     NO se había mandado a la papelera ni borrado de Firestore: desaparecía sin
     estar borrado, y el aviso decía otro número. Una acción destructiva no
     puede preguntar dos veces y confiar en que le respondan igual. */
  const ids=new Set(sel.map(s=>String(s.id)));
  confirmar({
    texto: `¿Mover ${sel.length} envío(s) a la papelera?`,
    textoSi: 'Mover a papelera',
    trabajando: 'Moviendo...',
    alConfirmar: () => {
    // Se resuelven los objetos AHORA, contra la lista viva: si el latido los
    // reemplazó, la papelera tiene que guardar la versión buena, no la que se
    // capturó hace treinta segundos.
    const aBorrar=S.shipments.filter(s=>ids.has(String(s.id)));
    aBorrar.forEach(s=>{
      S.trash.push({shipment:s, deletedAt:Date.now()});
      // Borrar de Firestore inmediatamente
      if(window._fbDeleteShipment) window._fbDeleteShipment(s.id);
    });
    S.shipments=S.shipments.filter(x=>!ids.has(String(x.id)));
    Seleccion.quitar(Array.from(ids));
    save('config');render();toast(`🗑️ ${aBorrar.length} movidos a papelera`); // solo config (trash): los pedidos ya se borraron de Firestore
    }
  });
}

/* PIN */
let _pinEntry='', _pinCallback=null;
/* Funciones de configuración movidas a config.js */
