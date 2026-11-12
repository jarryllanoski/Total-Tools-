
let _cuenta = {estado: 'mirando'};
let _cuentaPedida = false;
let _cuentaAuto = false;
let _cuentaForm = false;

function cuentaShalomEstado(){ return _cuenta; }

function _cuentaPintar(){
  if(typeof _pintarShalomConfig === 'function') _pintarShalomConfig();
  if(typeof _pintarRegistroShalom === 'function') _pintarRegistroShalom();
}

function _cuentaRecordarId(id){
  if(id && window.S) S.shalomInstancia = Object.assign({}, S.shalomInstancia, {id: String(id)});
}

function cuentaShalomRevisar(forzar){
  if(!window.Shalom || typeof Shalom.estadoCuenta !== 'function') return;
  if(_cuentaPedida && !forzar) return;
  _cuentaPedida = true;
  _cuenta = {estado: 'mirando'};
  _cuentaPintar();
  Shalom.estadoCuenta().then(function(r){
    if(r && r.conectada){
      _cuenta = {estado: 'ok', usuario: r.usuario};
      _cuentaRecordarId(r.id);
      _cuentaPintar();
      return;
    }
    const caida = r && r.hayCredenciales && r.motivo !== 'SIN_RED';
    if(caida && !_cuentaAuto){
      _cuentaAuto = true;
      return _cuentaConectar('', '', true);
    }
    _cuenta = (r && !r.hayCredenciales) ? {estado: 'sinCuenta'} :
      {estado: 'caida', motivo: (r && r.motivo) || 'SIN_RED', usuario: r && r.usuario};
    _cuentaPintar();
  }).catch(function(){
    _cuenta = {estado: 'error', motivo: 'SIN_RED'};
    _cuentaPintar();
  });
}

async function _cuentaConectar(usuario, clave, sola){
  _cuenta = {estado: 'conectando'};
  _cuentaPintar();
  let r = null;
  try{ r = await Shalom.conectar(usuario, clave); }catch(e){ r = null; }
  if(r && r.ok){
    _cuenta = {estado: 'ok', usuario: r.usuario, aviso: r.aviso || ''};
    _cuentaForm = false;
    _cuentaRecordarId(r.id);
    if(!sola) toast('✅ Shalom Pro conectada');
  } else {
    _cuenta = {estado: 'caida', motivo: (r && r.motivo) || 'SIN_RED',
      detalle: (r && r.detalle) || ''};
  }
  _cuentaPintar();
  return r;
}

function cuentaShalomConectar(){
  const u = $('credUser'), k = $('credPass');
  const usuario = (u && u.value || '').trim();
  const clave = (k && k.value) || '';
  if(k) k.value = '';
  if(usuario && !clave){ toast('Escribe también la contraseña'); return; }
  _cuentaConectar(usuario, clave, false);
}

function cuentaShalomCambiar(){ _cuentaForm = !_cuentaForm; _cuentaPintar(); }

function _cuentaTexto(c){
  if(c.detalle) return c.detalle;
  const T = {NO_EXISTE: 'La cuenta guardada ya no existe en Shalom. Pulsa Conectar.',
    SIN_SESION: 'Shalom cerró la sesión. Pulsa Conectar.',
    SIN_CUENTA: 'Aún no está conectada.', SIN_RED: 'No se pudo comprobar (sin conexión).'};
  return T[c.motivo] || ((window.Shalom && Shalom.textoMotivo) ? Shalom.textoMotivo(c.motivo) : c.motivo);
}

function _pintarShalomConfig(){
  const box = $('shalomCfgBloque'); if(!box) return;
  cuentaShalomRevisar();
  const c = _cuenta;
  let lin;
  if(c.estado === 'ok'){
    lin = '<span style="color:#3fb950">● Conectada</span>' +
      (c.usuario ? '<span style="color:var(--text2)"> · '+escH(c.usuario)+'</span>' : '');
  } else if(c.estado === 'mirando' || c.estado === 'conectando'){
    lin = '<span style="opacity:.65">'+(c.estado === 'mirando' ? 'comprobando…' : 'conectando…')+'</span>';
  } else {
    lin = '<span style="color:#f59e0b">'+escH(_cuentaTexto(c))+'</span>';
  }
  let html = '<div style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text2);line-height:1.5">'+
    '<span style="flex:1"><b style="color:var(--text)">Shalom Pro</b> '+lin+'</span>'+
    (c.estado === 'ok' ? '<span onclick="cuentaShalomCambiar()" style="font-size:11px;color:#388bfd;cursor:pointer;font-weight:700;white-space:nowrap">'+
      (_cuentaForm ? 'cerrar' : 'cambiar cuenta')+'</span>' : '')+
    '<span onclick="if(window.Ayuda)Ayuda.abrir(\'registroShalom\')" title="Ayuda" style="font-size:12px;color:#8b949e;cursor:pointer">📖</span></div>';
  if(c.aviso) html += '<div style="font-size:11px;color:#f59e0b;margin-top:6px">'+escH(c.aviso)+'</div>';
  const pidiendo = c.estado === 'conectando';
  if((c.estado !== 'ok' && c.estado !== 'mirando') || _cuentaForm){
    html += '<div style="margin-top:10px"><div class="frow">'+
      '<div class="fg"><label class="fl">Correo</label><input class="fi" id="credUser" type="email" autocomplete="off" placeholder="correo de pro.shalom.pe"></div>'+
      '<div class="fg"><label class="fl">Contraseña</label><input class="fi" id="credPass" type="password" autocomplete="new-password" placeholder="contraseña de pro.shalom.pe"></div>'+
      '</div><button type="button" onclick="cuentaShalomConectar()" '+(pidiendo ? 'disabled ' : '')+
      'style="width:100%;margin-top:9px;padding:11px;border-radius:9px;cursor:pointer;font-family:inherit;font-size:13px;font-weight:700;'+
      'background:rgba(63,185,80,.14);border:1px solid rgba(63,185,80,.35);color:#3fb950">'+
      (pidiendo ? '⏳ Conectando…' : '🔗 Conectar')+'</button>'+
      '<div style="font-size:10.5px;color:#8b949e;margin-top:6px;line-height:1.45">'+
      'Se guardan una sola vez, cifradas en el servidor. Después se mantiene conectada sola.</div></div>';
  }
  box.innerHTML = html;
  const sal = $('shalomCfgSalida'); if(sal){ sal.style.display = 'none'; sal.innerHTML = ''; }
}

function cuentaShalomFila(){
  cuentaShalomRevisar();
  const c = _cuenta;
  if(c.estado === 'ok') return {ico: '🔌', txt: 'Shalom Pro <span style="color:#3fb950">conectada</span>'+
    (c.usuario ? ' · '+escH(c.usuario) : '')};
  if(c.estado === 'mirando' || c.estado === 'conectando') return {ico: '🔌', txt: '<span style="opacity:.6">Shalom Pro — '+
    (c.estado === 'mirando' ? 'comprobando…' : 'conectando…')+'</span>'};
  return {ico: '⚠️', txt: '<span style="color:#f59e0b">'+escH(_cuentaTexto(c))+'</span>',
    accion: 'conectar en Config'};
}

window.addEventListener('tt:nube-sincronizada', function(){ cuentaShalomRevisar(); });
