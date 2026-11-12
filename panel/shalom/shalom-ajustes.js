function _cfgBarrido(){
  S.config = S.config || {};
  S.config.barrido = Object.assign(
    {activo:true, modo:'semi', horas:'08:00, 11:30, 16:30, 19:00'},
    S.config.barrido || {});
  return S.config.barrido;
}
function _pinShalom(hecho){
  openPin(hecho, 'Clave para cambiar la configuración de Shalom');
}
function guardarBarrido(){
  const b = _cfgBarrido();
  const h = $('cfgBarridoHoras'), m = $('cfgBarridoModo');
  const nuevo = {horas: h ? h.value.trim() : (b.horas||''), modo: m ? m.value : (b.modo||'semi')};
  if(h) h.value = b.horas || '';
  if(m) m.value = b.modo || 'semi';
  if(nuevo.horas === (b.horas||'') && nuevo.modo === (b.modo||'semi')) return;
  _pinShalom(()=>{
    b.horas = nuevo.horas; b.modo = nuevo.modo;
    if(h) h.value = b.horas;
    if(m) m.value = b.modo;
    save('config');
    toast('✅ Seguimiento automático actualizado');
  });
}
function toggleBarrido(cual){
  if(cual !== 'activo') return;
  _pinShalom(()=>{
    const b = _cfgBarrido();
    const el = $('tglBarridoActivo'); if(!el) return;
    el.classList.toggle('on');
    b.activo = el.classList.contains('on');
    save('config');
    toast(b.activo ? '🕐 Seguimiento automático encendido'
                   : '⏸️ Seguimiento automático apagado');
  });
}
const _MOTIVO_HUMANO = {
  SIN_RED: 'sin conexión', ERROR_SHALOM: 'error de Shalom',
  LIMITE: 'cuota agotada', BLOQUEADO: 'clave rechazada',
  NO_ENCONTRADO: 'guía no encontrada', SIN_DATO: 'sin estado',
  PETICION_INVALIDA: 'petición rechazada',
  SHALOM_SIN_RESPUESTA: 'guía nueva que Shalom-API no pudo leer (falla suya)',
  FORMATO_DESCONOCIDO: 'respuesta no reconocida',
  PUERTA_CERRADA: 'puerta cerrada', APAGADA: 'puerta apagada'
};
function _motivosBarrido(m){
  const pares = Object.keys(m || {}).map(k =>
    (m[k] + ' ' + (_MOTIVO_HUMANO[k] || k.toLowerCase().replace(/_/g,' '))));
  return pares.length ? ' (' + pares.join(' · ') + ')' : '';
}

async function _pintarUltimoBarrido(){
  const el = $('barridoUltima'); if(!el) return;
  const doc = (window._fbLeerBarrido ? await window._fbLeerBarrido() : null);
  const u = doc && doc.ultima;
  if(!u){ el.textContent = 'Última corrida: todavía ninguna.'; return; }
  const cuando = new Date(u.ts).toLocaleString('es-PE',
    {day:'numeric',month:'numeric',hour:'2-digit',minute:'2-digit'});
  const s2 = u.saltados || {};
  const ahorro = (s2.yaEntregados||0) + (s2.finalizados||0);
  el.innerHTML =
    '<b>Última corrida:</b> ' + cuando + ' (' + (u.hora||'') + ')' +
    '<br>Consultó ' + (u.consultadas||0) + ' · cambió ' + (u.conCambio||0) +
    ' · movió ' + (u.movidas||0) + ' etiqueta' + (u.movidas===1?'':'s') +
    (u.porDejar ? ' · 📦 ' + u.porDejar + ' por dejar en agencia' : '') +
    (u.porPro ? ' · 🔁 ' + u.porPro + ' leída(s) desde tu Shalom Pro' : '') +
    (u.fallidas ? ' · <b style="color:#d29922">' + u.fallidas + ' fallaron</b>' +
      _motivosBarrido(u.motivos) : '') +
    '<br>No preguntó a ' + ahorro + ' (ya entregados o finalizados)' +
    (s2.vencidas ? ' · ' + s2.vencidas + ' guía(s) vencida(s) sin dejarse en la agencia' : '') +
    ((u.guiasMalas||[]).length ? ' · ' + u.guiasMalas.length +
      ' guía(s) con formato raro: ' + u.guiasMalas.map(g=>g.guia).join(', ') : '') +
    (u.cortado ? '<br><b style="color:#d29922">Se cortó: ' + u.cortado + '</b>' : '');
}

async function correrBarridoAhora(){
  const btn = $('btnBarridoAhora'); if(!btn) return;
  const antes = btn.innerHTML;
  btn.disabled = true; btn.textContent = '⏳ Consultando… (puede tardar un minuto)';
  try{
    const tok = localStorage.getItem('tt_id_token') || '';
    if(!tok){ toast('🔒 Tu sesión venció — ingresa de nuevo'); return; }
    const r = await fetch('https://us-central1-total-tools-24ce8.cloudfunctions.net/barridoAhora',
      {method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+tok}});
    if(r.status === 401){ toast('🔒 Tu sesión venció — ingresa de nuevo'); return; }
    if(r.status === 403){ toast('🚫 Tu cuenta no está autorizada'); return; }
    const j = await r.json().catch(()=>({ok:false}));
    if(!j.ok){
      toast(j.motivo === 'BARRIDO_APAGADO'
        ? '⏸️ El seguimiento automático está apagado — enciéndelo arriba'
        : '⚠️ No se pudo correr el barrido');
      return;
    }
    const i = j.informe || {};
    toast('✅ consultó ' + (i.consultadas||0) + ' · ' + (i.movidas||0) + ' etiqueta(s) movidas');
    if(window._fbLoad && window._mergeRemote){
      try{ const remoto = await window._fbLoad(); if(remoto) window._mergeRemote(remoto); }catch(e){}
    }
  }catch(e){
    toast('📡 No se pudo conectar — revisa tu internet');
  }finally{
    btn.disabled = false; btn.innerHTML = antes;
    _pintarUltimoBarrido();
  }
}

function toggleShalomAuto(){
  const el=document.getElementById('tglShalomAuto'); if(!el) return;
  el.classList.toggle('on');
  const on=el.classList.contains('on');
  S.config=S.config||{};
  S.config.shalomAutoTrack=on;
  save('config');
  toast(on?'🚚 Auto-tracking Shalom activado':'⏸️ Auto-tracking Shalom apagado');
}
function toggleTrackingWebCliente(){ _pinShalom(_toggleTrackingWebClienteHecho); }
function _toggleTrackingWebClienteHecho(){
  const el=document.getElementById('tglTrackingWebCliente'); if(!el) return;
  el.classList.toggle('on');
  const on=el.classList.contains('on');
  S.config=S.config||{};
  S.config.trackingWebMostrarCliente=on;
  save('config');
  toast(on?'📱 El cliente verá el estado de Shalom':'🙈 Estado de Shalom solo en tu panel');
}
