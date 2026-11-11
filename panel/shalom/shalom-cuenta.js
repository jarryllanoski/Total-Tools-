/**
 * panel/shalom/shalom-cuenta.js — la cuenta de Shalom Pro, en el panel
 * =====================================================================
 * Rehecho el 11/11/2026. UN solo lugar para todo lo de la cuenta:
 *   · el estado («● Shalom Pro conectada · tu correo»);
 *   · Config: correo + contraseña + «Conectar» (y «cambiar cuenta»);
 *   · la RECONEXIÓN SOLA: al abrir el panel se mira el estado (gratis) y,
 *     si se cayó y hay credenciales guardadas, se reconecta una vez.
 * Lo decide el servidor (functions/cuentaShalom.js): el navegador nunca ve
 * la lista de instancias ni la contraseña después de escribirla.
 * Script CLÁSICO: sus funciones son globales (las llaman los onclick).
 */

/* El estado de la cuenta para toda la pantalla:
   mirando · conectando · ok · sinCuenta · caida · error */
let _cuenta = {estado: 'mirando'};
let _cuentaPedida = false;     // ya se preguntó en esta sesión
let _cuentaAuto = false;       // ya se intentó reconectar sola
let _cuentaForm = false;       // «cambiar cuenta» abierto

/** El estado actual (lo lee el bloque de registro del pedido). */
function cuentaShalomEstado(){ return _cuenta; }

function _cuentaPintar(){
  if(typeof _pintarShalomConfig === 'function') _pintarShalomConfig();
  if(typeof _pintarRegistroShalom === 'function') _pintarRegistroShalom();
}

/* Recuerda la instancia que dijo el servidor (no se guarda desde aquí:
   la escribe el servidor). Sirve para que el registro no diga «falta la
   cuenta» mientras llega la sincronización. */
function _cuentaRecordarId(id){
  if(id && window.S) S.shalomInstancia = Object.assign({}, S.shalomInstancia, {id: String(id)});
}

/** Pregunta al servidor si la cuenta sigue conectada. Gratis.
 *  Si se cayó y hay credenciales guardadas, reconecta UNA vez sola. */
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

/* Conectar (con lo escrito, o vacío = con lo guardado). */
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

/** El botón «Conectar» de Config. */
function cuentaShalomConectar(){
  const u = $('credUser'), k = $('credPass');
  const usuario = (u && u.value || '').trim();
  const clave = (k && k.value) || '';
  if(k) k.value = '';                // la contraseña no se queda en pantalla
  if(usuario && !clave){ toast('Escribe también la contraseña'); return; }
  _cuentaConectar(usuario, clave, false);
}

/** «cambiar cuenta»: abre o cierra el formulario. */
function cuentaShalomCambiar(){ _cuentaForm = !_cuentaForm; _cuentaPintar(); }

/* Lo que se dice cuando no está conectada: palabras, no códigos. */
function _cuentaTexto(c){
  if(c.detalle) return c.detalle;
  const T = {NO_EXISTE: 'La cuenta guardada ya no existe en Shalom. Pulsa Conectar.',
    SIN_SESION: 'Shalom cerró la sesión. Pulsa Conectar.',
    SIN_CUENTA: 'Aún no está conectada.', SIN_RED: 'No se pudo comprobar (sin conexión).'};
  return T[c.motivo] || ((window.Shalom && Shalom.textoMotivo) ? Shalom.textoMotivo(c.motivo) : c.motivo);
}

/** La sección de Shalom Pro en Config. */
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

/** La fila «TU CUENTA» del bloque de registro del pedido. */
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

/* Al entrar al panel (cuando llegan los datos, o sea con sesión), se mira
   la cuenta una vez y se reconecta sola si hace falta. */
window.addEventListener('tt:nube-sincronizada', function(){ cuentaShalomRevisar(); });
