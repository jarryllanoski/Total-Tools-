/**
 * panel/proveedores.js — proveedores y su stock
 * =============================================
 * Fase 3 (10/11/2026): el panel en módulos. Antes vivía en index.html.
 * Script CLÁSICO a propósito: sus funciones y variables son globales, igual
 * que cuando estaban en un solo archivo — moverlas no cambió ni una llamada.
 * El orden de los <script> en index.html es el orden de ejecución.
 */
/* SUPPLIERS */
let _suppId=null;

function globalSuppSearch(raw){
  if(!raw) raw=($('suppGlobalSearch').value||'');
  if(!raw.trim()) return;

  const codeRegex=/\b([A-Z]{1,6}[0-9][A-Z0-9\-]{2,})\b/g;
  const extracted=[];
  let m;
  while((m=codeRegex.exec(raw))!==null){
    const c=m[1].replace(/\s+/g,'');
    if(!extracted.includes(c)) extracted.push(c);
  }
  raw.split(/[\n,]+/).forEach(line=>{
    const t=line.trim().replace(/\s+/g,'');
    if(t.length>3&&!extracted.includes(t)) extracted.push(t);
  });

  if(!extracted.length) return;

  let marked=0;
  const touched=new Set();
  extracted.forEach(q=>{
    S.suppliers.forEach(sup=>{
      (sup.items||[]).forEach((it,i)=>{
        // Get just the code part (before first space)
        const itemCode=it.text.trim().split(/\s+/)[0].toLowerCase();
        const searchCode=q.toLowerCase();
        if(itemCode===searchCode&&!it.done){
          sup.items[i].done=true;
          marked++;
          touched.add(sup.id);
        }
      });
    });
  });

  if(marked>0){
    touched.forEach(id=>save('supp:'+id)); // solo los proveedores realmente tocados
    // Force full re-render of suppliers panel
    const area=$('suppStatsArea');
    if(area) area.innerHTML='';
    render(); 
    toast(`✅ ${marked} ítem${marked>1?'s':''} marcado${marked>1?'s':''}`); 
  }

  // Clear silently
  const inp=$('suppGlobalSearch'); if(inp) inp.value='';
}

function renderSuppliersPanel(){
  if(!S.suppliers) S.suppliers=[];
  if(window.Cotizacion&&Cotizacion.ensureTienda) Cotizacion.ensureTienda(); // 🏬 Tienda fija
  return`<div class="supp-panel">
    <div class="supp-panel-hdr">
      <div class="supp-panel-ttl">🏭 Proveedores</div>
      <span style="display:flex;align-items:center;gap:10px">
        <span style="font-size:11px;color:var(--text2)">${S.suppliers.length} fuente${S.suppliers.length!==1?'s':''}</span>
        <span onclick="event.stopPropagation();if(window.Ayuda)Ayuda.abrir('proveedores')" style="font-size:12px;color:#a78bfa;cursor:pointer;font-weight:600" title="Ayuda">📖</span>
      </span>
    </div>
    <div class="supp-cards">
      ${S.suppliers.map(sup=>{
        const pending=sup.items?sup.items.filter(x=>!x.done).length:0;
        const total=sup.items?sup.items.length:0;
        const esTienda=sup.tipo==='tienda';
        return`<div class="supp-card ${pending>0?'has-pending':''}" onclick="openSupplier('${sup.id}')">
          <div class="supp-card-name">${esTienda?'🏬 ':''}${sup.name}${esTienda?' <span style="font-size:9px;color:var(--green);font-weight:700;background:rgba(46,160,67,.15);border-radius:4px;padding:1px 5px;vertical-align:middle">TIENDA</span>':''}</div>
          <div class="supp-card-phone">
            <span>📞 ${sup.phone}</span>
            <button onclick="event.stopPropagation();window.open('https://wa.me/51${sup.phone}','_blank')" style="background:rgba(46,160,67,.15);border:1px solid rgba(46,160,67,.3);color:var(--green);border-radius:6px;width:24px;height:24px;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0">💬</button>
          </div>
          ${total>0?`<div class="supp-card-items">
            ${sup.items.slice(0,4).map(it=>`<div class="supp-item-row">
              <div class="supp-item-dot ${it.done?'done':''}"></div>
              <span class="supp-item-text ${it.done?'done':''}">${it.text}</span>
            </div>`).join('')}
            ${total>4?`<div style="font-size:10px;color:var(--text2);margin-top:2px">+${total-4} más...</div>`:''}
          </div>`:`<div style="font-size:11px;color:var(--text2);font-style:italic">Sin items aún</div>`}
          ${pending>0?`<div style="margin-top:8px;font-size:10px;font-weight:700;color:var(--red)">⚠️ ${pending} pendiente${pending>1?'s':''}</div>`:''}
        </div>`;
      }).join('')}
      <div class="supp-add-card" onclick="openOverlay('suppNewOverlay')">＋</div>
    </div>
  </div>`;
}

/* Orden persistente de proveedores (campo .orden). Asigna a los que no tengan. */
function _sortSupp(){
  if(!S.suppliers) return;
  S.suppliers.forEach((s,i)=>{ if(typeof s.orden!=='number') s.orden=i; });
  S.suppliers.sort((a,b)=>(a.orden||0)-(b.orden||0));
}

/* Administrar proveedores (agregar / editar / borrar / reordenar) — desde el icono 🏭 */
function openSuppManage(){
  if(window.Cotizacion&&Cotizacion.ensureTienda) Cotizacion.ensureTienda();
  _sortSupp();
  renderSuppManage();
  openOverlay('suppManageOverlay');
}
function renderSuppManage(){
  const list=$('suppManageList'); if(!list) return;
  _sortSupp();
  const sups=S.suppliers||[];
  if(!sups.length){ list.innerHTML='<div style="text-align:center;color:var(--text2);font-size:12px;padding:20px">Sin proveedores todavía. Tocá “Agregar proveedor”.</div>'; return; }
  list.innerHTML=sups.map((sup,i)=>{
    const esTienda=sup.tipo==='tienda';
    return `<div style="display:flex;align-items:center;gap:6px;padding:9px 0;border-bottom:1px solid var(--bd)">
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esTienda?'🏬 ':'🏭 '}${escH(sup.name)}${esTienda?' <span style="font-size:9px;color:var(--green);font-weight:700;background:rgba(46,160,67,.15);border-radius:4px;padding:1px 5px;vertical-align:middle">TIENDA</span>':''}</div>
        <div style="font-size:11px;color:var(--text2)">📞 ${escH(sup.phone||'—')}</div>
      </div>
      <button onclick="_manageMove('${sup.id}',-1)" ${i===0?'disabled':''} style="background:var(--bg2);border:1px solid var(--bd);border-radius:6px;color:var(--text);width:28px;height:28px;font-size:13px;cursor:pointer;flex-shrink:0;opacity:${i===0?'.3':'1'}">↑</button>
      <button onclick="_manageMove('${sup.id}',1)" ${i===sups.length-1?'disabled':''} style="background:var(--bg2);border:1px solid var(--bd);border-radius:6px;color:var(--text);width:28px;height:28px;font-size:13px;cursor:pointer;flex-shrink:0;opacity:${i===sups.length-1?'.3':'1'}">↓</button>
      <button onclick="_manageEdit('${sup.id}')" style="background:rgba(56,139,253,.12);border:1px solid rgba(56,139,253,.3);border-radius:6px;color:var(--blue);width:28px;height:28px;font-size:12px;cursor:pointer;flex-shrink:0">✏️</button>
      ${esTienda?'<div style="width:28px;flex-shrink:0"></div>':`<button onclick="delSupplier('${sup.id}')" style="background:rgba(248,81,73,.1);border:1px solid rgba(248,81,73,.3);border-radius:6px;color:var(--red);width:28px;height:28px;font-size:12px;cursor:pointer;flex-shrink:0">🗑️</button>`}
    </div>`;
  }).join('');
}
function _manageMove(id,dir){
  _sortSupp();
  const i=S.suppliers.findIndex(x=>x.id===id); if(i<0) return;
  const j=i+dir; if(j<0||j>=S.suppliers.length) return;
  const a=S.suppliers[i], b=S.suppliers[j];
  const ao=a.orden; a.orden=b.orden; b.orden=ao;      // intercambia el orden persistente
  save('supp:'+a.id); save('supp:'+b.id);             // incremental: solo los dos movidos
  render(); renderSuppManage();
}
function _manageEdit(id){
  _suppId=id;
  closeOverlay('suppManageOverlay');
  openEditSupplier();
}

function openSupplier(id){
  _suppId=id;
  const sup=S.suppliers.find(x=>x.id===id); if(!sup) return;
  const esTienda=sup.tipo==='tienda';
  $('suppName').textContent=(esTienda?'🏬 ':'🏭 ')+sup.name;
  $('suppPhone').innerHTML=`📞 ${sup.phone} <button onclick="window.open('https://wa.me/51${sup.phone}','_blank')" style="background:rgba(46,160,67,.15);border:1px solid rgba(46,160,67,.3);color:var(--green);border-radius:7px;padding:4px 10px;font-size:12px;font-weight:700;cursor:pointer">💬 WhatsApp</button>`;
  renderCotizArea(sup);
  renderSuppStock(sup);
  renderSuppCotiz(sup);
  renderSuppItems(sup);
  $('suppNewItem').value='';
  const srch=$('suppSearch'); if(srch) srch.value='';
  const delBtn=$('suppDelBtn'); if(delBtn) delBtn.style.display=esTienda?'none':'block'; // la Tienda no se borra
  openOverlay('suppOverlay');
}

/* Excel de stock del proveedor (o de la tienda). Reusa la API de Cotización. */
function renderSuppStock(sup){
  const area=$('suppStockArea'); if(!area) return;
  const st=(window.Cotizacion&&Cotizacion.stock)?Cotizacion.stock.get(sup.id):null;
  const esTienda=sup.tipo==='tienda';
  const etiqueta=esTienda?'Stock de tienda':'Excel de stock';
  if(st&&st.meta){
    area.innerHTML=`<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;background:var(--bg3);border:1px solid var(--bd);border-radius:8px;padding:8px 12px">
      <span style="font-size:11px;color:var(--text2);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">📊 ${etiqueta}: <b style="color:var(--text)">${st.meta.count}</b> productos${st.fileName?` · ${escH(st.fileName)}`:''}</span>
      <span style="display:flex;gap:6px;flex-shrink:0">
        <button onclick="$('suppStockFile').click()" style="background:rgba(56,139,253,.12);border:1px solid rgba(56,139,253,.25);color:var(--blue);border-radius:6px;padding:4px 9px;font-size:10px;font-weight:700;cursor:pointer">🔄</button>
        <button onclick="delSuppStock('${sup.id}')" style="background:rgba(248,81,73,.1);border:1px solid rgba(248,81,73,.3);color:var(--red);border-radius:6px;padding:4px 9px;font-size:10px;font-weight:700;cursor:pointer">🗑️</button>
      </span>
    </div>`;
  } else {
    area.innerHTML=`<div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg3);border:1px dashed var(--bd);border-radius:8px;padding:8px 12px">
      <span style="font-size:11px;color:var(--text2)">📊 Sin ${etiqueta.toLowerCase()}</span>
      <button onclick="$('suppStockFile').click()" style="background:rgba(56,139,253,.12);border:1px solid rgba(56,139,253,.25);color:var(--blue);border-radius:6px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer">＋ Subir Excel</button>
    </div>`;
  }
}

function loadSuppStock(input){
  const file=input.files[0]; if(!file) return;
  const sup=S.suppliers.find(x=>x.id===_suppId); if(!sup){ input.value=''; return; }
  if(typeof XLSX==='undefined'){ toast('⚠️ Librería de Excel no disponible'); input.value=''; return; }
  const r=new FileReader();
  r.onload=e=>{
    try{
      const wb=XLSX.read(e.target.result,{type:'array'});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const aoa=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
      const n=Cotizacion.stock.importAOA(sup.id, aoa, file.name);
      if(!n){ toast('⚠️ No se reconoció columna de código en el Excel'); return; }
      renderSuppStock(sup);
      toast(`✅ ${n} productos cargados`);
    }catch(err){ toast('⚠️ '+(err.message||'Error leyendo Excel')); }
  };
  r.readAsArrayBuffer(file);
  input.value='';
}

function delSuppStock(id){
  if(window.Cotizacion&&Cotizacion.stock) Cotizacion.stock.del(id);
  const sup=S.suppliers.find(x=>x.id===id); if(sup) renderSuppStock(sup);
  toast('🗑️ Excel de stock eliminado');
}

/* Vista DERIVADA: ítems de cotización asignados a esta fuente (tienda o proveedor).
   No se copian: se calculan desde los pedidos → siempre en sync. */
function renderSuppCotiz(sup){
  const area=$('suppCotizDerived'); if(!area) return;
  const items=(window.Cotizacion&&Cotizacion.itemsDeFuente)?Cotizacion.itemsDeFuente(sup.id):[];
  const esTienda=sup.tipo==='tienda';
  const titulo=esTienda?'🏬 En tienda (de pedidos)':'📤 De cotizaciones';
  if(!items.length){
    area.innerHTML=`<div style="font-size:10px;font-weight:700;color:var(--text2);letter-spacing:.5px;margin-bottom:4px">${titulo}</div>
      <div style="font-size:11px;color:var(--text2);font-style:italic">Nada asignado todavía.</div>`;
    return;
  }
  area.innerHTML=`<div style="font-size:10px;font-weight:700;color:var(--text2);letter-spacing:.5px;margin-bottom:5px">${titulo} · ${items.length}</div>
    ${items.map(it=>`<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--bd)">
      <div style="flex:1;min-width:0">
        <div style="font-size:12.5px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><b style="font-family:monospace">${escH(it.codigo)}</b> · ${escH(it.desc||'')} · <b>${escH(it.cant)}</b>u</div>
        <div style="font-size:10px;color:var(--text2)">🧾 ${escH(it.cliente||'—')}</div>
      </div>
      <button onclick="quitarAsignacion('${escH(it.pedidoId)}','${escH(it.codigo)}')" title="Quitar" style="background:none;border:none;color:var(--red);font-size:16px;cursor:pointer;flex-shrink:0;padding:0 4px">✕</button>
    </div>`).join('')}`;
}

/* Quitar la asignación de un ítem (desde la ficha de la fuente). */
function quitarAsignacion(pedidoId, codigo){
  if(window.Cotizacion&&Cotizacion.asignar) Cotizacion.asignar(pedidoId, codigo, null);
  const sup=S.suppliers.find(x=>x.id===_suppId); if(sup) renderSuppCotiz(sup);
  render();
  toast('Quitado');
}

function delSupplier(id){
  const sup=S.suppliers.find(x=>x.id===id); if(!sup) return;
  if(sup.tipo==='tienda'){ toast('🏬 La tienda no se puede eliminar'); return; }
  confirmar({
    texto: `¿Eliminar el proveedor "${sup.name}"? Se borra su Excel de stock. No se puede deshacer.`,
    textoSi: 'Eliminar proveedor',
    alConfirmar: () => {
      S.suppliers=S.suppliers.filter(x=>x.id!==id);
      if(window.Cotizacion&&Cotizacion.stock) Cotizacion.stock.del(id);
      if(window._fbDeleteSupplier) window._fbDeleteSupplier(id); // borra el doc en Firestore
      save('config'); render(); closeOverlay('suppOverlay'); // bump ts para otros dispositivos
      if($('suppManageOverlay').classList.contains('open')) renderSuppManage();
      toast('🗑️ Proveedor eliminado');
    }
  });
}
function toggleAllSuppItems(){
  const sup=S.suppliers.find(x=>x.id===_suppId); if(!sup||!sup.items||!sup.items.length) return;
  const allDone=sup.items.every(x=>x.done);
  sup.items.forEach(x=>x.done=!allDone);
  save('supp:'+sup.id); render(); renderSuppItems(sup);
  toast(allDone?'☐ Todo desmarcado':'✅ Todo marcado');
}

function filterSuppItems(){
  const sup=S.suppliers.find(x=>x.id===_suppId); if(!sup) return;
  const q=($('suppSearch').value||'').toLowerCase().trim();
  renderSuppItems(sup);
  if(!q) return;
  $('suppItemsList').querySelectorAll('[data-supp-text]').forEach(row=>{
    const text=row.getAttribute('data-supp-text').toLowerCase();
    row.style.display=text.includes(q)?'flex':'none';
  });
}

function bulkVerifySupp(){
  const sup=S.suppliers.find(x=>x.id===_suppId); if(!sup||!sup.items||!sup.items.length) return;
  const q=($('suppSearch').value||'').toLowerCase().trim();
  // If searching, only verify filtered items; otherwise all
  const allDone=q
    ? sup.items.filter(it=>it.text.toLowerCase().includes(q)).every(x=>x.done)
    : sup.items.every(x=>x.done);
  if(q){
    sup.items.forEach(it=>{ if(it.text.toLowerCase().includes(q)) it.done=!allDone; });
  } else {
    sup.items.forEach(it=>it.done=!allDone);
  }
  save('supp:'+sup.id); render(); filterSuppItems();
  toast(allDone?'☐ Desmarcados':'✅ '+( q?'Filtrados':'Todos')+' marcados');
}

function renderSuppItems(sup){
  if(!sup.items||!sup.items.length){
    $('suppItemsList').innerHTML='<div style="text-align:center;padding:16px;color:var(--text2);font-size:12px">Sin items. Agrega productos o tareas pendientes.</div>';
    return;
  }
  $('suppItemsList').innerHTML=sup.items.map((it,i)=>`
    <div data-supp-text="${it.text.replace(/"/g,'&quot;')}" style="display:flex;align-items:center;gap:12px;padding:14px 0;border-bottom:1px solid var(--bd)">
      <div onclick="toggleSuppItem('${sup.id}',${i})" style="width:28px;height:28px;border-radius:8px;border:2px solid ${it.done?'var(--green)':'var(--bd)'};background:${it.done?'var(--green)':'transparent'};display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;color:#fff;font-size:14px;font-weight:700">${it.done?'✓':''}</div>
      <span style="flex:1;font-size:15px;font-weight:500;cursor:pointer;${it.done?'text-decoration:line-through;opacity:.45':''}"
        ontouchstart="suppTapStart('${sup.id}',${i},this,event)"
        ontouchmove="suppTapMove(event)"
        ontouchend="suppTapEnd(event)"
        onclick="toggleSuppItem('${sup.id}',${i})"
      >${it.text}</span>
      <button onclick="delSuppItem('${sup.id}',${i})" style="background:none;border:none;color:var(--red);font-size:20px;cursor:pointer;opacity:.7;padding:0 4px;flex-shrink:0">✕</button>
    </div>`).join('');
}

let _suppTapTimer=null,_suppTapId=null,_suppTapIdx=null,_suppTapEl=null,_suppTapX=0,_suppTapY=0;
function suppTapStart(suppId,idx,el,e){
  _suppTapId=suppId;_suppTapIdx=idx;_suppTapEl=el;
  _suppTapX=e.touches?e.touches[0].clientX:0;
  _suppTapY=e.touches?e.touches[0].clientY:0;
  _suppTapTimer=setTimeout(()=>{ editSuppItem(suppId,idx,el); _suppTapTimer=null; },700);
}
function suppTapMove(e){
  if(!_suppTapTimer) return;
  const dx=Math.abs((e.touches?e.touches[0].clientX:0)-_suppTapX);
  const dy=Math.abs((e.touches?e.touches[0].clientY:0)-_suppTapY);
  if(dx>8||dy>8){ clearTimeout(_suppTapTimer); _suppTapTimer=null; }
}
function suppTapEnd(e){
  if(_suppTapTimer){ clearTimeout(_suppTapTimer); _suppTapTimer=null; }
}

function editSuppItem(suppId,idx,el){
  const sup=S.suppliers.find(x=>x.id===suppId); if(!sup) return;
  const old=sup.items[idx].text;
  const input=document.createElement('input');
  input.value=old;
  input.style.cssText='flex:1;background:var(--bg2);border:1px solid var(--blue);border-radius:6px;padding:4px 8px;font-size:15px;color:var(--text);outline:none;width:100%';
  el.replaceWith(input);
  input.focus();
  input.select();
  const save_=()=>{
    const v=input.value.trim();
    if(v) sup.items[idx].text=v;
    save('supp:'+sup.id); renderSuppItems(sup);
  };
  input.onblur=save_;
  input.onkeydown=e=>{ if(e.key==='Enter') input.blur(); if(e.key==='Escape'){ sup.items[idx].text=old; renderSuppItems(sup); } };
}

function setSuppItemState(){}

function addSuppItem(){
  const sup=S.suppliers.find(x=>x.id===_suppId); if(!sup) return;
  const v=$('suppNewItem').value.trim(); if(!v) return;
  if(!sup.items) sup.items=[];
  sup.items.push({text:v,done:false});
  $('suppNewItem').value='';
  save('supp:'+sup.id); render(); renderSuppItems(sup);
}

function toggleSuppItem(suppId,idx){
  const sup=S.suppliers.find(x=>x.id===suppId); if(!sup) return;
  sup.items[idx].done=!sup.items[idx].done;
  save('supp:'+sup.id); render(); renderSuppItems(sup);
}

function delSuppItem(suppId,idx){
  const sup=S.suppliers.find(x=>x.id===suppId); if(!sup) return;
  sup.items.splice(idx,1);
  save('supp:'+sup.id); render(); renderSuppItems(sup);
}

function moveAllToPorAlistar(){
  openPin(()=>{
    const count=S.shipments.filter(x=>x.status==='EN PROCESO').length;
    S.shipments.forEach(x=>{ if(x.status==='EN PROCESO'){ x.status='POR ALISTAR'; save(x.id); } }); // incremental: solo los movidos
    render();
    toast(`🔵 ${count} pedido${count>1?'s':''} → POR ALISTAR`);
  });
}

function sendSuppList(suppId){
  const sup=S.suppliers.find(x=>x.id===suppId); if(!sup) return;
  if(!sup.phone){ toast('⚠️ Sin número de teléfono'); return; }
  const pending=(sup.items||[]).filter(x=>!x.done);
  // Vista derivada: ítems de cotización asignados a este proveedor.
  const cotiz=(window.Cotizacion&&Cotizacion.itemsDeFuente)?Cotizacion.itemsDeFuente(suppId):[];
  if(!pending.length && !cotiz.length){ toast('✅ Nada para enviar'); return; }
  let msg=`Hola! 👋 Te paso la lista de lo que necesito:\n\n`, n=0;
  cotiz.forEach(it=>{ msg+=`${++n}. ${it.cant} x ${it.codigo}${it.desc?' — '+it.desc:''}\n`; });
  pending.forEach(it=>{ msg+=`${++n}. ${it.text}\n`; });
  msg+=`\nGracias 🙏`;
  window.waOpen(sup.phone, msg);
}

function saveNewSupplier(){
  const name=$('suppNewName').value.trim();
  const phone=$('suppNewPhone').value.trim();
  if(!name){toast('⚠️ Ingresa el nombre');return}
  const tipoEl=document.querySelector('input[name="suppTipo"]:checked');
  const tipo=(tipoEl&&tipoEl.value==='tienda')?'tienda':'proveedor';
  // Tienda exclusiva: si marcás esta como tienda, la anterior pasa a proveedor.
  if(tipo==='tienda'){ (S.suppliers||[]).forEach(x=>{ if(x.tipo==='tienda'){ x.tipo='proveedor'; save('supp:'+x.id); } }); }
  const _ns={id:(tipo==='tienda'?'sup_tienda_'+Date.now():'sup_'+Date.now()),name,phone,items:[],tipo,orden:(S.suppliers?S.suppliers.length:0)};
  S.suppliers.push(_ns);
  $('suppNewName').value=''; $('suppNewPhone').value='';
  const r=document.querySelector('input[name="suppTipo"][value="proveedor"]'); if(r) r.checked=true;
  save('supp:'+_ns.id); render(); closeOverlay('suppNewOverlay');
  toast(tipo==='tienda'?'🏬 Tienda definida':'✅ Proveedor agregado');
}

function openSuppSwitch(){
  if(S.suppliers.length<=1){toast('Solo tienes un proveedor');return}
  const existing=document.getElementById('suppSwitchMenu');
  if(existing){existing.remove();return}
  const sheet=document.getElementById('suppOverlay').querySelector('.sheet');
  sheet.style.position='relative';
  const div=document.createElement('div');
  div.id='suppSwitchMenu';
  div.style.cssText='position:absolute;top:55px;left:18px;right:18px;background:var(--bg2);border:1px solid var(--bd);border-radius:12px;overflow:hidden;z-index:20;box-shadow:0 8px 24px rgba(0,0,0,.6)';
  div.innerHTML='<div style="padding:9px 14px;font-size:10px;font-weight:700;color:var(--text2);letter-spacing:.8px;border-bottom:1px solid var(--bd)">CAMBIAR PROVEEDOR</div>'+
    S.suppliers.map(s=>'<div onclick="switchSupplier(\''+s.id+'\')" style="padding:13px 14px;font-size:14px;font-weight:700;cursor:pointer;border-bottom:1px solid var(--bd);color:'+(s.id===_suppId?'var(--blue)':'var(--text)')+'">🏭 '+s.name+(s.id===_suppId?' <span style="font-size:10px;opacity:.6">● actual</span>':'')+'</div>').join('')+
    '<div onclick="document.getElementById(\'suppSwitchMenu\').remove()" style="padding:11px 14px;font-size:13px;color:var(--text2);cursor:pointer;text-align:center">Cancelar</div>';
  sheet.appendChild(div);
}
function switchSupplier(id){
  const m=document.getElementById('suppSwitchMenu');if(m)m.remove();
  openSupplier(id);
}

function renderCotizArea(sup){
  const area=$('suppCotizArea'); if(!area) return;
  if(sup.cotiz){
    const isPdf=sup.cotiz.t&&sup.cotiz.t.includes('pdf');
    area.innerHTML=`<div class="cotiz-wrap">
      <div class="cotiz-hdr">
        <div style="display:flex;align-items:center;gap:6px;flex:1;min-width:0">
          <span style="font-size:12px;flex-shrink:0">📎</span>
          <div style="display:flex;align-items:center;gap:4px;background:var(--bg2);border:1px solid var(--bd);border-radius:7px;padding:3px 8px;flex:1">
            <span style="font-size:10px;flex-shrink:0">🔍</span>
            <input id="suppSearch" placeholder="Buscar código..." oninput="filterSuppItems()"
              style="background:none;border:none;outline:none;color:var(--text);font-size:11px;width:100%;min-width:0">
          </div>
        </div>
        <div style="display:flex;gap:5px;align-items:center;flex-shrink:0;margin-left:6px">
          <button class="cotiz-btn cotiz-add" style="padding:3px 9px;font-size:10px" onclick="toggleCotizImg('cotizImgArea_${sup.id}')">👁 Ver</button>
          <button class="cotiz-btn cotiz-add" style="padding:3px 9px;font-size:10px" onclick="openCotizMenu()">🔄</button>
          <button class="cotiz-btn cotiz-del" style="padding:3px 9px;font-size:10px" onclick="delCotiz('${sup.id}')">🗑️</button>
        </div>
      </div>
      <div id="cotizImgArea_${sup.id}" style="display:none">
        ${isPdf
          ?`<div class="cotiz-pdf-box" style="padding:12px"><span style="font-size:28px">📄</span><button onclick="window.open(S.suppliers.find(x=>x.id==='${sup.id}').cotiz.d)" style="margin-top:6px;background:rgba(56,139,253,.12);border:1px solid rgba(56,139,253,.25);color:var(--blue);border-radius:6px;padding:5px 12px;font-size:11px;font-weight:700;cursor:pointer">Abrir PDF</button></div>`
          :`<img class="cotiz-img" style="max-height:180px" src="${sup.cotiz.d}" onclick="openViewer(S.suppliers.find(x=>x.id==='${sup.id}').cotiz,'📄 Cotización ${sup.name}')">`
        }
      </div>
    </div>`;
  } else {
    area.innerHTML=`<div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg3);border:1px dashed var(--bd);border-radius:8px;padding:8px 12px">
      <span style="font-size:11px;color:var(--text2)">📎 Sin cotización</span>
      <button onclick="openCotizMenu()" style="background:rgba(56,139,253,.12);border:1px solid rgba(56,139,253,.25);color:var(--blue);border-radius:6px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer">＋ Subir</button>
    </div>`;
  }
}

function toggleCotizImg(id){
  const el=document.getElementById(id); if(!el) return;
  el.style.display=el.style.display==='none'?'block':'none';
}

function openCotizMenu(){
  const existing=document.getElementById('cotizMenu');
  if(existing){existing.remove();return}
  const div=document.createElement('div');
  div.id='cotizMenu';
  div.style.cssText='background:var(--bg2);border:1px solid var(--bd);border-radius:12px;overflow:hidden;margin-top:6px';
  div.innerHTML=`
    <div onclick="$('cotizCam').click();this.closest('#cotizMenu').remove()" style="padding:12px 14px;font-size:13px;font-weight:600;cursor:pointer;border-bottom:1px solid var(--bd);color:var(--text)">📷 Tomar foto</div>
    <div onclick="$('cotizGal').click();this.closest('#cotizMenu').remove()" style="padding:12px 14px;font-size:13px;font-weight:600;cursor:pointer;border-bottom:1px solid var(--bd);color:var(--text)">🖼️ Galería</div>
    <div onclick="$('cotizPdf').click();this.closest('#cotizMenu').remove()" style="padding:12px 14px;font-size:13px;font-weight:600;cursor:pointer;border-bottom:1px solid var(--bd);color:var(--text)">📄 PDF</div>
    <div onclick="this.closest('#cotizMenu').remove()" style="padding:11px 14px;font-size:13px;color:var(--text2);cursor:pointer;text-align:center">Cancelar</div>`;
  $('suppCotizArea').appendChild(div);
}

function loadCotiz(input){
  const file=input.files[0]; if(!file) return;
  if(file.size>10*1024*1024){toast('⚠️ Máximo 10MB');return}
  const sup=S.suppliers.find(x=>x.id===_suppId); if(!sup){input.value='';return}
  input.value='';
  // ★ Subir a Firebase Storage (URL que sincroniza en todos los dispositivos).
  //   Antes se guardaba solo base64 → slimSupplier lo volvía [img] → no se veía
  //   en otros equipos. Fallback a base64 si Storage falla.
  if(window.StorageModule && StorageModule.uploadFile){
    toast('⏳ Subiendo cotización...');
    StorageModule.uploadFile(file, sup.id, 'cotiz').then(function(docObj){
      sup.cotiz=docObj; save('supp:'+sup.id); renderCotizArea(sup);
      toast('✅ Cotización subida');
    }).catch(function(e){
      console.warn('[Cotiz] Storage falló, usando base64:',e&&e.message);
      var t = window._authTextoMotivo && window._authTextoMotivo(e);
      if(t) toast(t);
      _loadCotizBase64(file,sup);
    });
    return;
  }
  _loadCotizBase64(file,sup);
}
function _loadCotizBase64(file,sup){
  const r=new FileReader();
  r.onload=e=>{ sup.cotiz={d:e.target.result,n:file.name,t:file.type}; save('supp:'+sup.id); renderCotizArea(sup); toast('✅ Cotización subida'); };
  r.readAsDataURL(file);
}

function delCotiz(suppId){
  const sup=S.suppliers.find(x=>x.id===suppId); if(!sup) return;
  sup.cotiz=null; save('supp:'+sup.id); renderCotizArea(sup);
  toast('🗑️ Cotización eliminada');
}
function openEditSupplier(){
  const sup=S.suppliers.find(x=>x.id===_suppId); if(!sup) return;
  $('suppEditName').value=sup.name;
  $('suppEditPhone').value=sup.phone;
  openOverlay('suppEditOverlay');
}
function saveEditSupplier(){
  const sup=S.suppliers.find(x=>x.id===_suppId); if(!sup) return;
  const name=$('suppEditName').value.trim();
  const phone=$('suppEditPhone').value.trim();
  if(!name){toast('⚠️ Ingresa el nombre');return}
  sup.name=name; sup.phone=phone;
  save('supp:'+sup.id); render();
  // Update header in suppOverlay
  $('suppName').textContent='🏭 '+name;
  $('suppPhone').innerHTML=`📞 ${phone} <button onclick="window.open('https://wa.me/51${phone}','_blank')" style="background:rgba(46,160,67,.15);border:1px solid rgba(46,160,67,.3);color:var(--green);border-radius:7px;padding:4px 10px;font-size:12px;font-weight:700;cursor:pointer">💬 WhatsApp</button>`;
  closeOverlay('suppEditOverlay');
  toast('✅ Proveedor actualizado');
}
let _pvtNoteId=null;
function togglePvtNote(id){
  const el=$('pvt_'+id); if(!el) return;
  el.style.display=el.style.display==='none'?'block':'none';
}
function openPrivateNote(id){
  _pvtNoteId=id;
  const s=S.shipments.find(x=>x.id===id); if(!s) return;
  $('pvtNoteName').textContent='📦 '+s.name;
  $('pvtNoteInput').value=s.privateNote||'';
  $('pvtNoteDelBtn').style.display=s.privateNote?'block':'none';
  openOverlay('pvtNoteOverlay');
}
function savePvtNote(){
  const s=S.shipments.find(x=>x.id===_pvtNoteId); if(!s) return;
  s.privateNote=$('pvtNoteInput').value.trim();
  save(s.id); render(); closeOverlay('pvtNoteOverlay'); // ★ incremental
  toast('🔒 Nota privada guardada');
}
function deletePvtNote(){
  const s=S.shipments.find(x=>x.id===_pvtNoteId); if(!s) return;
  s.privateNote='';
  save(s.id); render(); closeOverlay('pvtNoteOverlay'); // ★ incremental
  toast('🗑️ Nota eliminada');
}
