function toast(m){const e=$('toastEl');e.textContent=m;e.classList.add('show');clearTimeout(e._t);e._t=setTimeout(()=>e.classList.remove('show'),2600)}

const _PANTALLAS_NUBE = ['configurar', 'recursos'];

function _pintarEsperaNube(){
  _PANTALLAS_NUBE.forEach(function(id){
    const pg = document.getElementById('page-' + id);
    if(!pg) return;
    let velo = document.getElementById('nubeEspera_' + id);
    if(window._nubeLista){
      if(velo) velo.remove();
      return;
    }
    if(velo) return;
    if(getComputedStyle(pg).position === 'static') pg.style.position = 'relative';
    velo = document.createElement('div');
    velo.id = 'nubeEspera_' + id;
    velo.setAttribute('role', 'status');
    velo.style.cssText = 'position:absolute;inset:0;z-index:50;' +
      'background:rgba(13,17,23,.82);backdrop-filter:blur(2px);' +
      'display:flex;align-items:flex-start;justify-content:center;' +
      'padding-top:80px;text-align:center';
    velo.innerHTML = '<div style="max-width:300px;padding:0 20px">' +
      '<div style="font-size:30px">⏳</div>' +
      '<div style="font-weight:700;margin-top:10px">Sincronizando con la nube…</div>' +
      '<div style="font-size:12.5px;color:var(--text2);margin-top:8px;line-height:1.5">' +
      'Esta pantalla se abre en cuanto lleguen tus datos. Editarla antes ' +
      'escribiría encima de tu configuración guardada.</div></div>';
    pg.appendChild(velo);
  });
}

function _liberarPantallasNube(){
  _pintarEsperaNube();
  const activa = document.querySelector('.page.active');
  const id = activa ? activa.id.replace('page-', '') : '';
  if(id === 'configurar' && typeof loadCfgUI === 'function') loadCfgUI();
  if(id === 'recursos' && typeof recRender === 'function') recRender();
}

function goPage(id){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  $('page-'+id).classList.add('active');
  ['envios','compartir','configurar'].forEach((n,i)=>{if(n===id)document.querySelectorAll('.tab')[i].classList.add('active')});
  if(id==='configurar') loadCfgUI();
  if(id==='compartir') { updateShareLink(); loadTokenList();
    if(typeof _pintarLinkSel === 'function') _pintarLinkSel(); }
  if(id==='recursos') recRender();
  _pintarEsperaNube();
}

function openOverlay(id){$(id).classList.add('open');}
function closeOverlay(id){$(id).classList.remove('open');}
document.querySelectorAll('.overlay').forEach(el=>el.addEventListener('click',e=>{
  if(e.target!==el) return;
  if(el.id==='formOverlay' && typeof window._formSnapshotDirty==='function' && window._formSnapshotDirty()){
    if(typeof toast==='function') toast('⚠️ Tienes datos sin guardar — usa Guardar o Cancelar');
    return;
  }
  el.classList.remove('open');
}));

function allStatuses(){ return S.labels; }
function stIcon(st){ return FIXED_LABEL_ICONS[st]||(st==='PENDIENTE'?'🕐':st==='ENVIADO'?'🚚':st==='ENTREGADO'?'✅':'🏷️') }
function stClass(st){ return st==='NUEVO PEDIDO'?'st-pend':st==='EN PROCESO'?'st-env':st==='POR ALISTAR'?'st-env':st==='FINALIZADO'?'st-ent':st==='ENVIADO'?'st-env':st==='ENTREGADO'?'st-ent':'st-cust' }
function stSoptClass(st){ return st==='NUEVO PEDIDO'?'sopt-pend':st==='EN PROCESO'?'sopt-env':st==='POR ALISTAR'?'sopt-env':st==='FINALIZADO'?'sopt-ent':st==='ENVIADO'?'sopt-env':st==='ENTREGADO'?'sopt-ent':'sopt-cust' }
function fillVars(tpl,s){return tpl.replace(/\{nombre\}/gi,s.name).replace(/\{telefono\}/gi,s.phone).replace(/\{direccion\}/gi,s.address).replace(/\{courier\}/gi,s.courier).replace(/\{fecha\}/gi,s.date||'—').replace(/\{costo\}/gi,s.cost?'S/ '+s.cost:'—').replace(/\{estado\}/gi,s.status)}
