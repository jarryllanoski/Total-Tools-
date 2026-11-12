let _dniPedido = '';

function _dniMarca(marca, titulo){
  const m = $('fDniMarca'); if(!m) return;
  m.textContent = marca || '';
  m.title = titulo || '';
  m.setAttribute('aria-label', titulo || '');
  m.style.cssText = marca ?
    'color:var(--green,#2ea043);font-weight:700;font-size:11px' : 'display:none';
}

function _dniAviso(html, color){
  const el = $('fDniReniec'); if(!el) return;
  if(!html){ el.style.display='none'; el.innerHTML=''; return; }
  el.style.display='block';
  el.style.cssText = 'display:block;font-size:10.5px;line-height:1.5;margin-top:5px;color:'+(color||'#8b949e');
  el.innerHTML = html;
}

function _dniUsar(){
  const p = window._dniUltima; if(!p) return;
  $('fName').value = p.completo;
  _dniMarca('✓', 'Nombre puesto desde RENIEC'); _dniAviso('');
}

async function _dniReniec(valor){
  const n = String(valor||'').replace(/\D/g,'');
  if(n.length !== 8){ _dniPedido=''; _dniAviso(''); _dniMarca(''); return; }
  if(n === _dniPedido) return;
  _dniPedido = n;
  if(!window.Shalom || typeof Shalom.dni !== 'function'){ _dniAviso(''); return; }
  _dniMarca('…', 'Consultando RENIEC'); _dniAviso('');
  let r;
  try{ r = await Shalom.dni(n); }catch(e){ r = null; }
  if(($('fDni')||{value:''}).value.replace(/\D/g,'') !== n) return;
  if(r && r.ok) window._dniUltima = r.persona;
  if(typeof _pintarRegistroShalom==='function') _pintarRegistroShalom();
  if(!r || !r.ok){
    const m = (r&&r.motivo)||'';
    if(m === 'NO_ENCONTRADO'){
      _dniAviso('⚠️ <b>Ese DNI no existe en RENIEC.</b> Revísalo: un envío registrado con DNI malo no se puede recoger.', '#f59e0b');
    } else {
      const txt = (window.Shalom && Shalom.textoMotivo) ? Shalom.textoMotivo(m)
        : ('No se pudo consultar ('+(m||'sin motivo')+').');
      _dniAviso('🪪 '+escH(txt), m==='SIN_RED' ? '#8b949e' : '#f59e0b');
    }
    return;
  }
  window._dniUltima = r.persona;
  const actual = ($('fName')||{value:''}).value.trim();
  if(!actual){
    $('fName').value = r.persona.completo;
    _dniMarca('✓', 'Nombre puesto desde RENIEC'); _dniAviso('');
    return;
  }
  if(actual.toUpperCase() === r.persona.completo.toUpperCase()){
    _dniMarca('✓', 'Coincide con RENIEC'); _dniAviso('');
    return;
  }
  _dniMarca('', '');
  _dniAviso('🪪 RENIEC dice: <b>'+escH(r.persona.completo)+'</b> '+
    '<button type="button" onclick="_dniUsar()" style="background:rgba(56,139,253,.15);'+
    'border:1px solid rgba(56,139,253,.4);border-radius:6px;color:var(--blue);'+
    'font-size:10px;font-weight:700;padding:2px 7px;cursor:pointer;font-family:inherit;'+
    'margin-left:4px">Usar este</button>');
}

let _agElegida = null;
let _agTexto   = '';

function _agVigente(){
  if(!_agElegida) return null;
  const txt = ($('fAddr')||{value:''}).value;
  const cur = window.Agencias ? Agencias.courierDe(($('fCourier')||{value:''}).value) : '';
  if(txt !== _agTexto || cur !== _agElegida.agenciaCourier){
    _agElegida = null; _agTexto = '';
  }
  return _agElegida;
}

function _agPintar(){
  const el = $('fAgenciaEstado'); if(!el) return;
  const marca = $('fAgenciaMarca');
  const ponMarca = (t, tit) => {
    if(!marca) return;
    marca.textContent = t || '';
    marca.title = tit || '';
    marca.setAttribute('aria-label', tit || '');
    marca.style.cssText = t ? 'color:var(--green,#2ea043);font-size:11px' : 'display:none';
  };
  const viva = _agVigente();
  if(viva){
    ponMarca('🏢', 'Agencia identificada · '+viva.agenciaNombre);
    el.innerHTML = ''; el.style.cssText = 'display:none';
    if(typeof _pintarRegistroShalom==='function') _pintarRegistroShalom();
    return;
  }
  ponMarca('', '');
  if(typeof _pintarRegistroShalom==='function') _pintarRegistroShalom();
  {
    const c = window.Agencias ? Agencias.courierDe(($('fCourier')||{value:''}).value) : '';
    if(!c){ el.innerHTML=''; el.style.cssText='display:none'; return; }
    el.innerHTML = '⚠️ Elígela de la lista';
    el.style.cssText = 'font-size:10.5px;line-height:1.5;margin-top:5px;color:#d29922';
  }
}

function pickShalomAgency(i){
  const ag=(window._panelShCache||[])[i]; if(!ag) return;
  const nombre=ag.lugar_over||ag.nombre||'';
  const dir=ag.direccion||'';
  $('fAddr').value = dir ? (nombre+' – '+dir) : nombre;
  _agElegida = window.Agencias ? Agencias.elegida(ag, ($('fCourier')||{value:''}).value) : null;
  _agTexto = $('fAddr').value;
  _agPintar();
  const drop=$('shDrop'); if(drop) drop.style.display='none';
  toast(_agElegida ? '🏢 Agencia identificada' : '🏢 Agencia seleccionada');
}
document.addEventListener('click',function(e){
  const drop=$('shDrop'); if(!drop) return;
  if(e.target && (e.target.id==='fAddr' || (e.target.closest && e.target.closest('#shDrop')))) return;
  drop.style.display='none';
});
