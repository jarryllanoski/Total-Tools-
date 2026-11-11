/**
 * panel/shalom/shalom-ajustes.js — Shalom en Config: barrido, puerta, seguimiento y cuentas
 * ==================================================================================
 * Fase 3 (10/11/2026): el panel en módulos. Antes vivía en index.html.
 * Script CLÁSICO a propósito: sus funciones y variables son globales, igual
 * que cuando estaban en un solo archivo — moverlas no cambió ni una llamada.
 * El orden de los <script> en index.html es el orden de ejecución.
 */
/* SHALOM: el barrido programado (Config) */
function _cfgBarrido(){
  S.config = S.config || {};
  // Valores de fábrica: encendido y en semiautomática. (`simulacro` se
  // retiró: si quedó guardado en la nube, el servidor ya no lo lee.)
  S.config.barrido = Object.assign(
    {activo:true, modo:'semi', horas:'08:00, 11:30, 16:30, 19:00'},
    S.config.barrido || {});
  return S.config.barrido;
}
/* ★ LA CLAVE DE LOS AJUSTES DE SHALOM. Es la «Clave para cambiar estado»,
   con su mismo teclado: una sola clave que el dueño cambia en un solo
   sitio. No se escribe en el código — esta página es pública en GitHub. */
function _pinShalom(hecho){
  openPin(hecho, 'Clave para cambiar la configuración de Shalom');
}
/* Horarios y modo: el campo vuelve AL INSTANTE a lo guardado, y el valor
   nuevo solo entra con la clave. Si se cancela, en pantalla queda lo que de
   verdad está guardado — nunca un valor que parece puesto y no lo está. */
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
/* Por qué fallaron, no solo cuántas. Un número suelto no se puede accionar:
   "6 fallaron" no distingue un corte de red de una cuota agotada ni de una
   clave rechazada, y cada una se arregla en un sitio distinto. */
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

/* El informe de la última corrida. Dice también a cuántos NO se les preguntó:
   sin eso, "consultó 12" parece poco cuando en realidad es todo lo que había. */
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
    (u.fallidas ? ' · <b style="color:#d29922">' + u.fallidas + ' fallaron</b>' +
      _motivosBarrido(u.motivos) : '') +
    '<br>No preguntó a ' + ahorro + ' (ya entregados o finalizados)' +
    (s2.vencidas ? ' · ' + s2.vencidas + ' guía(s) vencida(s) sin dejarse en la agencia' : '') +
    ((u.guiasMalas||[]).length ? ' · ' + u.guiasMalas.length +
      ' guía(s) con formato raro: ' + u.guiasMalas.map(g=>g.guia).join(', ') : '') +
    (u.cortado ? '<br><b style="color:#d29922">Se cortó: ' + u.cortado + '</b>' : '');
}

/* Correr el barrido a pedido: el MISMO barrido, sin esperar al horario.
   Sirve para ver el informe ahora y, después, para forzar una actualización
   cuando haga falta. Se salta el reloj pero NO el interruptor. */
async function correrBarridoAhora(){
  const btn = $('btnBarridoAhora'); if(!btn) return;
  const antes = btn.textContent;
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
    // Los pedidos cambiaron en la nube: que el panel los traiga.
    if(window._fbLoad && window._mergeRemote){
      try{ const remoto = await window._fbLoad(); if(remoto) window._mergeRemote(remoto); }catch(e){}
    }
  }catch(e){
    toast('📡 No se pudo conectar — revisa tu internet');
  }finally{
    btn.disabled = false; btn.textContent = antes;
    _pintarUltimoBarrido();
  }
}

/* 🔬 MEDIR los caminos por Shalom Pro (11/11/2026). Elige 4 guías NUEVAS
   (sin estado de Shalom: las que /track no puede leer) y 1 de CONTROL (ya
   en camino, que /track sí lee). El resultado son formas y sí/no por guía:
   se copia o se fotografía y con eso se escribe el arreglo. */
function _guiasParaMedir(){
  const lista = (window.S && S.shipments) || [];
  const con = lista.filter(s => /SHALOM/i.test(String(s.courier||'')) &&
    String(s.status||'').toUpperCase() !== 'FINALIZADO' &&
    /^[0-9]{8,12}$/.test(String(s.trackingOrderNumber||s.shalomGuia||'').trim()) &&
    /^[A-Za-z0-9]{4}$/.test(String(s.trackingOrderCode||s.shalomCodigo||'').trim()));
  const reciente = (a, b) => String(b.createdAt||'').localeCompare(String(a.createdAt||''));
  const par = s => ({g: String(s.trackingOrderNumber||s.shalomGuia).trim(),
    c: String(s.trackingOrderCode||s.shalomCodigo).trim()});
  const nuevas = con.filter(s => !String(s.trackingStatus||'').trim()).sort(reciente).slice(0, 4).map(par);
  const control = con.filter(s => String(s.trackingStatus||'').trim()).sort(reciente).slice(0, 1).map(par);
  return nuevas.concat(control);
}
async function medirShalomPro(){
  const btn = $('btnMedirPro'), sal = $('medirProSalida');
  if(!btn || !sal || !window.Shalom || !Shalom.medirPro) return;
  const guias = _guiasParaMedir();
  if(!guias.length){ toast('No hay guías de Shalom abiertas para medir'); return; }
  const antes = btn.textContent;
  btn.disabled = true; btn.textContent = '⏳ Midiendo… (hasta un minuto)';
  try{
    const r = await Shalom.medirPro(guias);
    sal.style.display = 'block';
    sal.textContent = JSON.stringify(r, null, 1).slice(0, 6000);
    toast(r && r.ok ? '🔬 Medido — mándame una foto del resultado' : '⚠️ No se pudo medir: ' + ((r && r.motivo) || '—'));
  }catch(e){
    toast('📡 No se pudo conectar — revisa tu internet');
  }finally{
    btn.disabled = false; btn.textContent = antes;
  }
}

/* SHALOM: el interruptor maestro de la puerta (Config) */
/* SHALOM: toggle auto-tracking (Config) */
function toggleShalomAuto(){
  const el=document.getElementById('tglShalomAuto'); if(!el) return;
  el.classList.toggle('on');
  const on=el.classList.contains('on');
  S.config=S.config||{};
  S.config.shalomAutoTrack=on;
  save('config'); // solo cambia config
  toast(on?'🚚 Auto-tracking Shalom activado':'⏸️ Auto-tracking Shalom apagado');
}
/* Motor de rastreo: 'off' | 'api' | 'web' (Motor B, mi servidor). Solo uno a
   la vez: al elegir 'web' se apaga la API paga; al elegir 'api' se prende. */
/* ── Auto-avanzar estado al subir un documento ─────────────────────────────
   Escalera monotónica sobre FIXED_LABELS: cada slot apunta a un estado y el
   pedido SOLO avanza si el objetivo está más adelante; nunca retrocede.
   Gobernado por el toggle S.config.autoEstadoDoc (default ON). */
/* NOTA — El estado ya NO se mueve solo.
   Se retiró `autoEstadoPorDoc` (subir un documento avanzaba la etiqueta), el
   selector de motor de rastreo, el modo de etiquetas (off/auto/semi) y los
   intervalos de la cola. Eran del rastreo viejo, que se apoyaba en leer la web
   pública de Shalom. La integración nueva va contra la API oficial y avisa por
   webhook; si en su momento se decide que la etiqueta vuelva a moverse sola,
   se hará ahí, con el dato real delante. Hoy la etiqueta la mueves tú.

   Se conserva `toggleTrackingWebCliente`: qué ve el cliente sigue siendo una
   decisión tuya, y el filtro que la respeta vive en la Cloud Function. */
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
