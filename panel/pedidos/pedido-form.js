function openForm(id){
  var body = document.getElementById('docsBody');
  var arrow = document.getElementById('docsArrow');
  if(body) body.classList.remove('open');
  if(arrow) arrow.classList.remove('open');
  _editId=id;$('formTitle').textContent=id?'Editar Envío':'Nuevo Envío';
  _agElegida = null; _agTexto = '';
  _dniPedido = ''; if(typeof _dniAviso==='function') _dniAviso('');
  if($('fShalomClave')) $('fShalomClave').value = '';
  if(id && window.Agencias){
    const _s0 = (S.shipments||[]).find(x=>x.id===id);
    if(_s0 && Agencias.identificada(_s0)){
      _agElegida = {agenciaId:_s0.agenciaId, agenciaNombre:_s0.agenciaNombre||'',
        agenciaGeo:_s0.agenciaGeo||'', agenciaCourier:_s0.agenciaCourier};
      _agTexto = _s0.address||'';
    }
  }
  if($('fPaste')) $('fPaste').value='';
  if(typeof _pasteClearToggle==='function') _pasteClearToggle();
  _clienteMatch=null; if($('clienteHint')){ $('clienteHint').style.display='none'; $('clienteHint').innerHTML=''; }
  $('fCourier').innerHTML = (S.couriers||[]).map(c=>`<option>${c}</option>`).join('');
  $('fStatus').innerHTML=allStatuses().map(s=>`<option>${s}</option>`).join('');
  $('extraForm').innerHTML=S.extraFields.map(f=>`<div class="fg"><label class="fl">${f}</label><input class="fi xf" data-f="${f}" placeholder="${f}..."></div>`).join('');
  _docs={guia:null,embalado:null,ticket:null};_links=[];
  refreshSlot('guia');refreshSlot('embalado');refreshSlot('ticket');renderLinks();
  _loadMontoFields(null);
  ['inGuiaCam','inGuiaGal','inGuiaPdf','inEmbCam','inEmbGal','inEmbPdf','inTicketCam','inTicketGal','inTicketPdf'].forEach(i=>{const e=$(i);if(e)e.value=''});
  if(id){
    const s=S.shipments.find(x=>x.id===id);
    if(!s){toast('⚠️ Recarga la página e intenta de nuevo');return;}
    $('fName').value=s.name;$('fPhone').value=s.phone;if($('fDni'))$('fDni').value=s.dni||'';
    if(s.dni && typeof _dniReniec==='function') _dniReniec(s.dni);
    const _isEncEdit=(s.courier||'').toUpperCase().includes('ENCOMIENDA');
    $('fAddr').value=_isEncEdit?(s.ciudadDestino||s.address||''):s.address;
    if($('fEncAgencia'))$('fEncAgencia').value=s.encAgencia||'';
    $('fCourier').value=s.courier;$('fDate').value=s.date;
    if(s.status && !S.labels.includes(s.status)){
      const o=document.createElement('option'); o.value=s.status; o.textContent=s.status+' (sin etiqueta)';
      $('fStatus').appendChild(o);
    }
    $('fStatus').value=s.status;
    $('fNotes').value=s.notes||'';_loadMontoFields(s);
    if($('fComprobante'))$('fComprobante').value=_nroDe(s);
    document.querySelectorAll('.xf').forEach(el=>{el.value=(s.extra&&s.extra[el.dataset.f])||''});
    if(s.docGuia){_docs.guia=s.docGuia;refreshSlot('guia')}
    if(s.docEmbalado){_docs.embalado=s.docEmbalado;refreshSlot('embalado')}
    if(s.docTicket){_docs.ticket=s.docTicket;refreshSlot('ticket')}
    if(s.docGuia||s.docEmbalado||s.docTicket){
      var body=document.getElementById('docsBody');
      var arrow=document.getElementById('docsArrow');
      if(body) body.classList.add('open');
      if(arrow) arrow.classList.add('open');
    }
    _links=s.links?JSON.parse(JSON.stringify(s.links)):[];renderLinks();
  }else{
    ['fName','fPhone','fAddr','fNotes'].forEach(i=>$(i).value='');if($('fDni'))$('fDni').value='';if($('fComprobante'))$('fComprobante').value='';if($('fEncAgencia'))$('fEncAgencia').value='';
    $('fDate').valueAsDate=new Date();
    if($('fCourier')){ const _sh=Array.from($('fCourier').options).find(o=>(o.value||'').toUpperCase().includes('SHALOM')); if(_sh) $('fCourier').value=_sh.value; }
  }
  const _showShalomBlock = () => {
    const c = ($('fCourier').value||'').toUpperCase();
    const b = $('shalomGuiaBlock');
    const isShalom = c.includes('SHALOM');
    if(b) b.style.display = isShalom ? 'block' : 'none';
    const dbk = $('dlvDriverBlock');
    if(dbk) dbk.style.display = c.includes('DELIVERY') ? 'block' : 'none';
    const isEnc = c.includes('ENCOMIENDA');
    _agPintar();
    const addrLbl = document.getElementById('fAddrLabelTxt');
    const encGrp  = document.getElementById('fEncAgenciaGroup');
    if(addrLbl) addrLbl.textContent = isEnc ? 'Ciudad destino *' : 'Dirección *';
    if(encGrp)  encGrp.style.display = isEnc ? '' : 'none';
    if(isShalom){ _claveAuto(); if(typeof _panelShalomLoad==='function') _panelShalomLoad(); }
    else { const d=$('shDrop'); if(d) d.style.display='none'; }
    if(typeof _updateShalomMic==='function') _updateShalomMic();
    if(typeof _pintarRegistroShalom==='function') _pintarRegistroShalom();
  };
  $('fCourier').onchange = function(){ _showShalomBlock(); _agPintar(); };
  if(id){
    const s=S.shipments.find(x=>x.id===id);
    if(s){
      if($('fShalomClave'))  $('fShalomClave').value  = s.shalomClave||'';
    if(typeof _congelarSiRegistrado==='function') _congelarSiRegistrado(s);
      if($('fShalomGuia'))   $('fShalomGuia').value   = s.trackingOrderNumber||s.shalomGuia||'';
      if(window.Guias) Guias.vigilar('fShalomGuia', id);
      if($('fShalomCodigo')) $('fShalomCodigo').value = s.trackingOrderCode||s.shalomCodigo||'';
      if($('fDlvDriver'))      $('fDlvDriver').value      = s._dlvDriver||'';
      if($('fDlvDriverPhone')) $('fDlvDriverPhone').value = s._dlvDriverPhone||'';
      if($('fDlvRutaLink'))    $('fDlvRutaLink').value    = s._dlvRutaLink||'';
      if($('fPkgLargo')) $('fPkgLargo').value = s.pkgLargo||'';
      if($('fPkgAncho')) $('fPkgAncho').value = s.pkgAncho||'';
      if($('fPkgAlto'))  $('fPkgAlto').value  = s.pkgAlto||'';
      if($('fPkgPeso'))  $('fPkgPeso').value  = s.pkgPeso||'';
      if($('fPkgCaja'))  $('fPkgCaja').value  = s.pkgCaja||'';
      window._pkgMedir = !s.pkgCaja && !!(s.pkgLargo||s.pkgAncho||s.pkgAlto||s.pkgPeso);
      _regPrepararForm();
      if(typeof _pkgClasificar==='function') _pkgClasificar();
      _pintarShalomEstado(s.trackingStatus);
    }
  } else {
    _pintarShalomEstado('');
    if($('fShalomGuia'))   $('fShalomGuia').value   = '';
    if($('fShalomCodigo')) $('fShalomCodigo').value = '';
    if($('fDlvDriver'))      $('fDlvDriver').value      = '';
    if($('fDlvDriverPhone')) $('fDlvDriverPhone').value = '';
    if($('fDlvRutaLink'))    $('fDlvRutaLink').value    = '';
    if($('fPkgLargo')) $('fPkgLargo').value = '';
    if($('fPkgAncho')) $('fPkgAncho').value = '';
    if($('fPkgAlto'))  $('fPkgAlto').value  = '';
    if($('fPkgPeso'))  $('fPkgPeso').value  = '';
    if($('fPkgCaja'))  $('fPkgCaja').value  = '';
    window._pkgMedir = false;
    _regPrepararForm();
    if(typeof _pkgClasificar==='function') _pkgClasificar();
    if(window.Guias) Guias.vigilar('fShalomGuia', '');
  }
  _showShalomBlock();
  if($('fPaste')) $('fPaste').value='';
  window._waPasteUsed = false;
  if($('fPasteBox')) $('fPasteBox').style.display = id ? 'none' : 'block';
  openOverlay('formOverlay');
  window._formSnap = (typeof _formSnapshot==='function') ? _formSnapshot() : '';
}

function _dniDe(p){
  return window.DniPedido ? DniPedido.de(p)
    : String((p&&(p.dni||p.dniRecoger||p.dniDestinatario))||'').trim();
}

var _clienteOpciones=[], _cliTimer=null;
function _norm9(s){ let v=(s||'').replace(/\D/g,''); if(v.startsWith('51')&&v.length>9) v=v.slice(2); return v.slice(-9); }

var CLIENTE_COPIA = ['name', 'phone', 'dni', 'address', 'encAgencia',
  'courier', 'agenciaId', 'agenciaNombre', 'agenciaGeo', 'agenciaCourier'];

function _cliMasReciente(L){
  return L.slice().sort(function(a,b){
    const k=function(x){ return String(x.updatedAt||x.createdAt||x.date||''); };
    return k(b).localeCompare(k(a));
  })[0];
}

function _clienteElegir(lista, keyPh, keyDni){
  const L = Array.isArray(lista) ? lista.filter(function(x){
    return x && typeof x === 'object'; }) : [];
  const dniDe = function(x){ return _dniDe(x).replace(/\D/g,''); };

  if(keyDni){
    const porDni = L.filter(function(x){ return dniDe(x) === keyDni; });
    if(porDni.length) return {estado:'uno', uno:_cliMasReciente(porDni)};
  }
  if(!keyPh) return {estado:'ninguno'};

  const porPh = L.filter(function(x){ return _norm9(x.phone) === keyPh; });
  if(!porPh.length) return {estado:'ninguno'};

  const dnis = [];
  porPh.forEach(function(x){
    const d = dniDe(x);
    if(d && dnis.indexOf(d) < 0) dnis.push(d);
  });
  if(dnis.length > 1){
    return {estado:'varios', varios: dnis.slice(0,4).map(function(d){
      return _cliMasReciente(porPh.filter(function(x){ return dniDe(x)===d; }));
    })};
  }
  if(!dnis.length){
    const noms = [];
    porPh.forEach(function(x){
      const n = String(x.name||'').trim().toUpperCase();
      if(n && noms.indexOf(n) < 0) noms.push(n);
    });
    if(noms.length > 1){
      return {estado:'varios', varios: noms.slice(0,4).map(function(n){
        return _cliMasReciente(porPh.filter(function(x){
          return String(x.name||'').trim().toUpperCase()===n; }));
      })};
    }
  }
  return {estado:'uno', uno:_cliMasReciente(porPh)};
}

function _clienteBuscar(){
  if(_editId) return {estado:'ninguno'};
  const ph=_norm9(($('fPhone')||{value:''}).value);
  const dni=(($('fDni')||{value:''}).value||'').replace(/\D/g,'');
  const keyPh  = ph.length===9  ? ph  : '';
  const keyDni = dni.length===8 ? dni : '';
  if(!keyPh && !keyDni) return {estado:'ninguno'};
  return _clienteElegir(S.shipments||[], keyPh, keyDni);
}

function _clienteHintUpdate(){
  clearTimeout(_cliTimer);
  _cliTimer=setTimeout(function(){
    const box=$('clienteHint'); if(!box) return;
    const r=_clienteBuscar()||{estado:'ninguno'};
    _clienteOpciones = r.estado==='uno' ? [r.uno]
      : (r.estado==='varios' ? r.varios : []);
    if(!_clienteOpciones.length){
      box.style.display='none'; box.innerHTML=''; return; }
    box.innerHTML='';
    if(r.estado==='varios'){
      const t=document.createElement('div');
      t.style.cssText='font-size:11.5px;color:#d29922;font-weight:700;margin-bottom:6px;line-height:1.45';
      t.textContent='⚠️ Ese teléfono tiene '+_clienteOpciones.length+
        ' clientes distintos — elige cuál:';
      box.appendChild(t);
    }
    _clienteOpciones.forEach(function(m,i){
      const btn=document.createElement('button');
      btn.type='button';
      btn.style.cssText='width:100%;text-align:left;background:rgba(34,197,94,.10);border:1px solid rgba(34,197,94,.35);border-radius:9px;padding:9px 11px;color:#22c55e;font-weight:700;font-size:12.5px;cursor:pointer;font-family:inherit;margin-bottom:5px';
      const _cd=_dniDe(m).replace(/\D/g,''), _cp=_norm9(m.phone);
      btn.textContent=(_clienteOpciones.length>1?'👤 ':'🌟 Cliente conocido: ')+
        (m.name||'—')+(_cd?' · DNI '+_cd:'')+
        (_clienteOpciones.length>1?'':(_cp?' · '+_cp:''))+
        (_clienteOpciones.length>1?'':' — toca para rellenar');
      btn.onclick=function(){ _clienteRellenar(i); };
      box.appendChild(btn);
    });
    box.style.display='block';
  }, 250);
}

function _clienteRellenar(i){
  const m=_clienteOpciones[i||0]; if(!m) return;
  const setIfEmpty=function(id,val){ const e=$(id); if(e && !e.value.trim() && val) e.value=String(val); };
  setIfEmpty('fName', m.name);
  setIfEmpty('fPhone', _norm9(m.phone));
  setIfEmpty('fDni', _dniDe(m).replace(/\D/g,''));
  const isEnc=(m.courier||'').toUpperCase().includes('ENCOMIENDA');
  const dirDe=isEnc?(m.ciudadDestino||m.address||''):(m.address||'');
  setIfEmpty('fAddr', dirDe);
  setIfEmpty('fEncAgencia', m.encAgencia||'');
  if(m.courier && $('fCourier')){
    const opt=Array.from($('fCourier').options).find(o=>(o.value||'').toUpperCase()===String(m.courier).toUpperCase());
    if(opt){ $('fCourier').value=opt.value; $('fCourier').dispatchEvent(new Event('change')); }
  }
  if(window.Agencias && Agencias.identificada(m) &&
     ($('fAddr')||{value:''}).value === dirDe && dirDe){
    _agElegida = {agenciaId:m.agenciaId, agenciaNombre:m.agenciaNombre||'',
      agenciaGeo:m.agenciaGeo||'', agenciaCourier:m.agenciaCourier};
    _agTexto = dirDe;
    if(typeof _agPintar==='function') _agPintar();
  }
  if(typeof toast==='function') toast('✅ Datos de '+(m.name||'cliente')+' rellenados');
  const box=$('clienteHint'); if(box){ box.style.display='none'; }
}

function _spanishDateToIso(str){
  const meses={enero:'01',febrero:'02',marzo:'03',abril:'04',mayo:'05',junio:'06',julio:'07',agosto:'08',septiembre:'09',setiembre:'09',octubre:'10',noviembre:'11',diciembre:'12'};
  const m=(str||'').toLowerCase().match(/(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})/);
  if(!m) return '';
  const mes=meses[m[2]];
  if(!mes) return '';
  return `${m[3]}-${mes}-${m[1].padStart(2,'0')}`;
}
function parseWAOrder(){
  const txt=($('fPaste')?$('fPaste').value:'')||'';
  if(!txt.trim()){ toast('⚠️ Pega el mensaje de WhatsApp primero'); return; }
  const clean=s=>(s||'').replace(/\*/g,'').trim();
  const grab=re=>{ const m=txt.match(re); return m?clean(m[1]):''; };
  const name   =grab(/Cliente:?\*?\s*(.+)/i);
  const phoneR =grab(/WhatsApp:?\*?\s*([+\d\s]+)/i);
  const addr   =grab(/(?:Agencia|Direcci[oó]n):?\*?\s*(.+)/i);
  const ciudad =grab(/Ciudad destino:?\*?\s*(.+)/i);
  const dni    =grab(/DNI(?:\s+para\s+recoger|\s+destinatario)?:?\*?\s*(\d{6,8})/i);
  const courier=grab(/Courier:?\*?\s*(.+)/i);
  const fechaR =grab(/Fecha de env[ií]o:?\*?\s*(.+)/i);
  const notas  =grab(/Notas:?\*?\s*(.+)/i);
  let filled=0;
  if(name){ $('fName').value=name; filled++; }
  if(phoneR){
    let v=phoneR.replace(/\D/g,'');
    if(v.startsWith('51')&&v.length>9) v=v.slice(2);
    v=v.slice(-9);
    if(v){ $('fPhone').value=v; filled++; }
  }
  const addrVal=addr||ciudad;
  if(addrVal){ $('fAddr').value=addrVal; filled++; }
  if(ciudad&&!addr&&$('fEncAgencia')){  }
  if(dni&&$('fDni')){ $('fDni').value=dni; filled++; }
  if(courier){
    const sel=$('fCourier');
    const opt=Array.from(sel.options).find(o=>o.value.toUpperCase().trim()===courier.toUpperCase().trim());
    if(opt){ sel.value=opt.value; filled++; }
    sel.dispatchEvent(new Event('change'));
  }
  if(fechaR){ const iso=_spanishDateToIso(fechaR); if(iso){ $('fDate').value=iso; filled++; } }
  if(notas){ $('fNotes').value=notas; filled++; }
  if(filled>0){
    window._waPasteUsed = true;
    const _d=$('shDrop'); if(_d) _d.style.display='none';
    toast('✅ '+filled+' campo'+(filled!==1?'s':'')+' rellenado'+(filled!==1?'s':''));
  }
  else toast('⚠️ No se reconoció el formato del mensaje');
}

let _shTimer=null;
const SHALOM_CATALOGO_V='2026-11-12';
async function _panelShalomLoad(){
  if(window._shalomData && window._shalomData.length) return window._shalomData;
  try{
    const c=localStorage.getItem('shalom_agencias_cache');
    const t=parseInt(localStorage.getItem('shalom_agencias_time')||'0');
    const v=localStorage.getItem('shalom_agencias_ver');
    if(c && v===SHALOM_CATALOGO_V && (Date.now()-t)<86400000){ window._shalomData=JSON.parse(c); return window._shalomData; }
  }catch(e){}
  try{
    const r=await fetch('data/agencias-shalom.json?v='+SHALOM_CATALOGO_V);
    if(r.ok){
      const j=await r.json();
      const lista=j.agencias||j.data||j||[];
      if(Array.isArray(lista)&&lista.length){
        window._shalomData=lista;
        try{ localStorage.setItem('shalom_agencias_cache',JSON.stringify(lista)); localStorage.setItem('shalom_agencias_time',String(Date.now())); localStorage.setItem('shalom_agencias_ver',SHALOM_CATALOGO_V); }catch(e){}
        return lista;
      }
    }
  }catch(e){ console.warn('[Shalom panel] JSON no disponible:',e.message); }
  return [];
}
function _panelShalomSearch(q){
  const data=window._shalomData||[];
  const nrm=s=>String(s==null?'':s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  const qu=nrm(q);
  const claveM=[], dirM=[];
  data.forEach((ag,idx)=>{
    const clave=nrm([ag.lugar_over||ag.nombre, ag.zona||ag.distrito, ag.provincia, ag.departamento].join(' '));
    const extra=nrm(ag.direccion);
    let score;
    if(clave.indexOf(qu)===0) score=0;
    else if((' '+clave).indexOf(' '+qu)!==-1) score=1;
    else if(clave.indexOf(qu)!==-1) score=2;
    else { if(extra.indexOf(qu)!==-1) dirM.push({ag,idx}); return; }
    claveM.push({ag,score,idx});
  });
  claveM.sort((a,b)=>a.score-b.score||a.idx-b.idx);
  let res=claveM.map(x=>x.ag);
  if(res.length<8) res=res.concat(dirM.map(x=>x.ag));
  return res.slice(0,8);
}
function onAddrInput(val){
  _agPintar();
  const drop=$('shDrop'); if(!drop) return;
  if(window._waPasteUsed){ drop.style.display='none'; return; }
  const isShalom=(($('fCourier')||{value:''}).value||'').toUpperCase().includes('SHALOM');
  if(!isShalom){ drop.style.display='none'; return; }
  clearTimeout(_shTimer);
  const q=(val||'').trim();
  if(q.length<2){ drop.style.display='none'; return; }
  _shTimer=setTimeout(async()=>{
    await _panelShalomLoad();
    const res=_panelShalomSearch(q);
    if(!res.length){
      drop.innerHTML='<div style="padding:12px 14px;text-align:center;font-size:12px;color:var(--text2)">🔍 Sin resultados — busca por ciudad, distrito o nombre de agencia</div>';
      drop.style.display='block'; return;
    }
    window._panelShCache=res;
    drop.innerHTML=res.map((ag,i)=>{
      const nombre=ag.lugar_over||ag.nombre||'—';
      const geo=[ag.zona||ag.distrito,ag.provincia,ag.departamento].filter(Boolean).join(' · ');
      const dir=ag.direccion||'';
      return `<div onclick="pickShalomAgency(${i})" style="padding:9px 12px;border-bottom:1px solid var(--bd);cursor:pointer" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
        <div style="font-weight:700;font-size:12px;color:var(--text)">${esc(nombre)}</div>
        ${geo?`<div style="font-size:11px;color:var(--blue);margin-top:2px">${esc(geo)}</div>`:''}
        ${dir?`<div style="font-size:11px;color:var(--text2);margin-top:2px;line-height:1.4">${esc(dir)}</div>`:''}
      </div>`;
    }).join('');
    drop.style.display='block';
  },300);
}
