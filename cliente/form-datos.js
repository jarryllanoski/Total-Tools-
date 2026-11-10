/**
 * cliente/form-datos.js — teléfono, DNI → nombre, y la regla del nombre
 * ======================================================================
 * Fase 5 (11/11/2026): el formulario en módulos. Antes era cliente/formulario.js
 * (y antes, el script en línea de formulario.html), envuelto en una función.
 * Script CLÁSICO: sus declaraciones son globales y los módulos se ven entre
 * sí por su nombre, como el panel. El orden de los <script> es el de
 * ejecución, y init() corre en form-arranque.js, cuando ya existe todo.
 */
'use strict';

/* ─── NORMALIZACIÓN DE TELÉFONO (misma regla del panel) ──────────────
   Borra no-dígitos, quita el prefijo Perú (+51) si sobra y corta a 9. Se aplica
   por delegación a cualquier input con clase "phone-norm" (aquí: f_phone). Corre
   en captura, ANTES del oninput inline, así onPhoneInput recibe el valor ya
   limpio y pegar "+51 984..." deja de romper la validación de 9 dígitos. */
function normPeruPhone(s){
  var v=String(s==null?'':s).replace(/\D/g,'');
  if(v.startsWith('51')&&v.length>9) v=v.slice(2);
  return v.slice(0,9);
}

/* Contador vivo de Notas. Tope 600 = mismo límite que el servidor (formApi),
   así el cliente NUNCA envía algo que el servidor recorte en silencio. */
var NOTES_MAX=600;
function _notesCount(){
  var t=document.getElementById('f_notes'); var c=document.getElementById('f_notes_count');
  if(!t||!c) return;
  var n=t.value.length;
  c.textContent=n+' / '+NOTES_MAX;
  c.style.color=(n>=NOTES_MAX)?'#f59e0b':(n>=NOTES_MAX*0.9?'#e3b341':'var(--muted,#8b949e)');
}

(function(){
  function _norm(el){ if(el && el.classList && el.classList.contains('phone-norm')) el.value=normPeruPhone(el.value); }
  document.addEventListener('input', function(e){ _norm(e.target); }, true);
  document.addEventListener('paste', function(e){ var el=e.target; if(el&&el.classList&&el.classList.contains('phone-norm')) setTimeout(function(){ _norm(el); },0); }, true);
})();

/* ─── PHONE DETECTION ────────────────────────────────────────────── */
function onPhoneInput(val){
  clearTimeout(_phoneTimer);
  const phone=val.replace(/\D/g,'');
  if(phone.length!==9){
    _knownClient=null;
    const b=$('knownBadge'); if(b) b.style.display='none';
    return;
  }
  _phoneTimer=setTimeout(async ()=>{
    try{
      /* El link va con el celular: solo si el link personalizado es de ESE
         número el servidor devuelve nombre completo y dirección. Si no,
         solo el primer nombre (sin fuga de datos por celular). */
      const c = await _api('client', currentToken ? {phone: phone, t: currentToken} : {phone: phone});
      if(c && c.name){
        _knownClient = c;
        _showKnownBadge();
      } else {
        _knownClient=null;
        const b=$('knownBadge'); if(b) b.style.display='none';
      }
    }catch(e){
      _knownClient=null;
      const b=$('knownBadge'); if(b) b.style.display='none';
    }
  },500);
}

/* ★ EL DNI RELLENA EL NOMBRE — 15/10/2026.
   Lo pidio el dueño, y para el negocio es claro: un nombre escrito a mano
   llega con faltas, sin tildes o con el apellido delante, y eso es justo lo
   que Shalom rechaza al registrar el envio.

   Automatico y no con un boton: el dueño lo pidio asi («al poner dni
   consulte reniec»), y un boton mas es una cosa mas que explicar en una
   pantalla que ya tiene cuatro pasos.

   ⚠️ LO QUE ESCRIBIO EL CLIENTE NO SE PISA. Se rellena si el campo esta
   vacio, o si lo que hay lo puso una consulta anterior. Si el cliente
   corrigio su nombre a mano —se llama distinto a lo que dice su documento,
   o usa su nombre de siempre— eso es SUYO y manda. Un formulario que
   deshace lo que acabas de escribir es un formulario del que te vas.

   ⚠️ Y SI EL DNI CAMBIA, EL NOMBRE AUTOMATICO SE BORRA. Un nombre pegado a
   otro documento es el nombre de otra persona, y de ahi sale una etiqueta
   con el DNI de uno y el nombre de otro — que ya paso una vez en el panel,
   por otro camino. */
var _dniTimer=null, _dniPuesto='', _dniOficial='';

/* Comparar nombres como los escribe la gente: sin tildes, sin dobles
   espacios y sin importar mayusculas. «Jose  Lino» y «JOSÉ LINO» son la
   misma persona, y marcarlas como distintas seria dar un aviso de
   discrepancia donde no hay ninguna — el aviso que se da de mas es el que
   nadie lee cuando de verdad importa. */
function _nrmNom(x){
  return String(x||'').normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/\s+/g,' ').trim().toUpperCase();
}
/* ¿Lo escrito es una versión corta del nombre oficial? («Jarlyn Llanos»
   frente a «JARLYN LLANOS ARTEAGA»): todas sus palabras están en el DNI. */
function _nomParecido(escrito, oficial){
  var a=_nrmNom(escrito).split(' ').filter(Boolean), b=_nrmNom(oficial).split(' ');
  return a.length>0 && a.every(function(p){ return b.indexOf(p)>=0; });
}
/* ★ EL NOMBRE EMPIEZA CON LETRA (30/10/2026). Números o símbolos AL INICIO
   se quitan mientras escribe (o al pegar «123Juan» → «Juan»); después de la
   primera letra se permite lo demás. Para seguir: al menos 2 letras. */
var _NOM_LETRA=/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/;
function _nombreValido(n){
  var t=String(n||'').trim();
  return !!t && _NOM_LETRA.test(t.charAt(0)) && (t.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g)||[]).length>=2;
}
function onNombreInput(el){
  if(!el) return;
  clearInterval(_dniEscribir._t);          // escribe el cliente: manda él
  var v=el.value, limpio=v.replace(/^[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/,'');
  if(limpio!==v){
    var pos=Math.max(0,(el.selectionStart||0)-(v.length-limpio.length));
    el.value=limpio;
    try{ el.setSelectionRange(pos,pos); }catch(e){}
  }
  _dniMarca();
}

/* ★ LA MARCA DEL NOMBRE — se recalcula, nunca se recuerda (30/10/2026).
     · coincide → el campo se ilumina en verde con su ✓ y «✓ Nombre según tu
       DNI» (sin repetir el nombre: está en su campo);
     · NO coincide → una SUGERENCIA, no una alarma: el nombre del DNI y un
       botón grande para usarlo; mantener el propio es un enlace pequeño
       (lo correcto es lo más fácil). Si se parece, «Completa tu nombre»;
     · eligió mantener el suyo → una línea discreta, por si cambia de idea. */
var _dniMantener='';
function _dniMarca(){
  var el=$('dniMarca'); if(!el) return;
  var nmEl=$('f_name'), nom=(nmEl||{value:''}).value;
  var igual=!!_dniOficial && !!nom.trim() && _nrmNom(nom)===_nrmNom(_dniOficial);
  if(nmEl) nmEl.classList.toggle('nom-ok', igual);
  if(!_dniOficial || !nom.trim()){ el.style.display='none'; el.innerHTML=''; return; }
  el.style.display='block';
  if(igual){ el.innerHTML='<span class="dni-ok">✓ Nombre según tu DNI</span>'; return; }
  if(_dniMantener && _nrmNom(_dniMantener)===_nrmNom(nom)){
    el.innerHTML='<span class="dni-mant">Tu DNI dice <b>'+esc(_dniOficial)+'</b> · '
      +'<button type="button" class="dni-link" onclick="usarNombreDni()">usar el del DNI</button></span>';
    return;
  }
  var parecido=_nomParecido(nom, _dniOficial);
  el.innerHTML='<div class="dni-sug">'
    +'<div class="dni-sug-t">🪪 '+(parecido?'Completa tu nombre como en tu DNI:':'Según tu DNI:')+'</div>'
    +'<div class="dni-sug-n">'+esc(_dniOficial)+'</div>'
    +'<button type="button" class="dni-sug-si" onclick="usarNombreDni()">✓ Usar el nombre del DNI</button>'
    +'<button type="button" class="dni-link" onclick="dniMantener()">Mantener «'+esc(nom.trim().slice(0,30))+'»</button>'
    +'<div class="dni-sug-p">Así coincide con tu DNI al recoger o recibir tu pedido.</div></div>';
}
function dniMantener(){ _dniMantener=($('f_name')||{value:''}).value; _dniMarca(); }
function usarNombreDni(){
  if(!_dniOficial) return;
  var nm=$('f_name'); if(!nm) return;
  _dniPuesto=_dniOficial; _dniMantener='';
  var e=$('err_name'); if(e) e.classList.remove('show');
  nm.classList.remove('err');
  _dniEscribir(nm, _dniOficial);
}
/* El nombre «aparece» letra por letra (≈0,4 s), el campo se ilumina y suena
   el ding. Con «reducir movimiento», de golpe. */
function _dniEscribir(nm, texto){
  clearInterval(_dniEscribir._t);
  var fin=function(){
    nm.value=texto;
    nm.classList.remove('nom-brilla'); void nm.offsetWidth; nm.classList.add('nom-brilla');
    _dniMarca(); _dniDing();
  };
  if(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches){ fin(); return; }
  var i=0, paso=Math.max(1, Math.ceil(texto.length/14));
  nm.value='';
  _dniEscribir._t=setInterval(function(){
    i+=paso; nm.value=texto.slice(0,i);
    if(i>=texto.length){ clearInterval(_dniEscribir._t); _dniEscribir._t=0; fin(); }
  }, 28);
}
/* «Ding»: dos notas suaves (<0,2 s) hechas por el navegador (sin descargar
   nada). UNA vez por DNI, nunca con la página en segundo plano. */
var _dniDingHecho='';
function _dniDing(){
  try{
    var dni=($('f_dni')||{value:''}).value.replace(/\D/g,'');
    if(_dniDingHecho===dni || document.hidden) return;
    _dniDingHecho=dni;
    if(navigator.vibrate) navigator.vibrate(12);
    var C=window.AudioContext||window.webkitAudioContext; if(!C) return;
    var a=_dniDing._c||(_dniDing._c=new C());
    if(a.state==='suspended') a.resume();
    var t=a.currentTime;
    [[880,0],[1318.5,0.09]].forEach(function(n){
      var o=a.createOscillator(), g=a.createGain();
      o.type='sine'; o.frequency.value=n[0];
      g.gain.setValueAtTime(0.0001, t+n[1]);
      g.gain.exponentialRampToValueAtTime(0.06, t+n[1]+0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t+n[1]+0.12);
      o.connect(g); g.connect(a.destination); o.start(t+n[1]); o.stop(t+n[1]+0.14);
    });
  }catch(e){}
}

/* ★ REINTENTAR CON CABEZA (30/10/2026). Una falla TEMPORAL (Shalom lento,
   App Check que no llegó, «demasiadas») ya no es «No encontramos ese DNI»:
   se reintenta solo hasta 2 veces (~1,2 s y ~2,5 s, con algo de azar para no
   chocar con otros). «No encontrado», el tope diario o un DNI inválido no se
   insisten. Si el cliente cambia el DNI a mitad, se abandona. Mismo criterio
   de «temporal» que el servidor (functions/reniecPublico.js). */
var _DNI_TEMPORAL=/^(SIN_RED|ERROR_SHALOM|FORMATO_DESCONOCIDO|SIN_RESPUESTA|LIMITE|MUCHAS_CONSULTAS|SIN_APPCHECK)$/;
async function _dniConsultar(dni, alReintentar){
  var esperas=[0, 1200, 2500], r=null;
  for(var i=0;i<esperas.length;i++){
    if(i){ alReintentar(i+1, esperas.length); await new Promise(function(z){ setTimeout(z, esperas[i]+Math.random()*400); }); }
    if(($('f_dni')||{value:''}).value.replace(/\D/g,'')!==dni) return null;   // cambió el DNI: se abandona
    try{ r=await _api('reniec', {dni: dni}); }catch(e){ r={ok:false, motivo:'SIN_RED'}; }
    if(r && r.ok) return r;
    if(!_DNI_TEMPORAL.test(String((r && r.motivo) || 'SIN_RED'))) return r;   // no se insiste
  }
  return r;
}
/* Mensaje según la CAUSA, con [Reintentar] cuando tiene sentido. */
function _dniMensajeFalla(motivo){
  var re=' <button type="button" class="dni-link dni-reintentar" onclick="dniReintentar()">Reintentar</button>';
  if(motivo==='NO_ENCONTRADO') return '<span class="dni-nada">No encontramos ese DNI. Revisa los 8 dígitos o escribe tu nombre completo.'+re+'</span>';
  if(motivo==='TOPE_DIA')      return '<span class="dni-nada">Escribe tu nombre completo como figura en tu documento.</span>';
  if(motivo==='DNI_NO_VALIDO') return '<span class="dni-nada">El DNI son 8 números.</span>';
  return '<span class="dni-nada">No pudimos consultar RENIEC ahora.'+re+' o escribe tu nombre completo.</span>';
}
function dniReintentar(){ var d=$('f_dni'); if(d) onDniInput(d.value); }

/* ★ EL DNI RELLENA EL NOMBRE — 15/10/2026 (animado el 30/10/2026).
   ⚠️ LO QUE ESCRIBIO EL CLIENTE NO SE PISA: se rellena solo si el campo
   esta vacio; si hay algo distinto, se SUGIERE (ver _dniMarca).
   ⚠️ Y SI EL DNI CAMBIA, EL NOMBRE AUTOMATICO SE BORRA: un nombre pegado a
   otro documento es el nombre de otra persona.
   Mientras consulta: el campo «escanea» y dice «Buscando en RENIEC…». */
function onDniInput(val){
  clearTimeout(_dniTimer);
  const dni=String(val||'').replace(/\D/g,'');
  const badge=$('dniBadge');
  const nm=$('f_name');
  const dniEl=$('f_dni');
  // El nombre que puso el DNI (completo o a medio aparecer) se va con él.
  if(_dniPuesto && nm && _dniPuesto.indexOf(nm.value.trim())===0){ clearInterval(_dniEscribir._t); nm.value=''; }
  _dniPuesto=''; _dniOficial=''; _dniMantener='';
  if(dniEl) dniEl.classList.remove('dni-escanea');
  if(badge){ badge.style.display='none'; badge.innerHTML=''; }
  _dniMarca();
  if(dni.length!==8) return;
  _dniTimer=setTimeout(async ()=>{
    const _decir=(html)=>{ if(badge){ badge.style.display='block'; badge.innerHTML=html; } };
    const _callar=()=>{ if(badge){ badge.style.display='none'; badge.innerHTML=''; } };
    if(dniEl) dniEl.classList.add('dni-escanea');
    _decir('<span class="dni-buscando">🪪 Buscando en RENIEC<span class="dni-puntos"></span></span>');
    const r = await _dniConsultar(dni, function(n, de){
      _decir('<span class="dni-buscando">🪪 Buscando en RENIEC<span class="dni-puntos"></span> (reintentando '+n+'/'+de+')</span>');
    });
    if(($('f_dni')||{value:''}).value.replace(/\D/g,'')!==dni) return;
    if(dniEl) dniEl.classList.remove('dni-escanea');
    if(!r || !r.ok || !r.persona || !r.persona.completo){
      /* Nunca se bloquea el pedido: se dice la causa y el cliente escribe
         su nombre completo (o reintenta). */
      _decir(_dniMensajeFalla(r && r.motivo));
      return;
    }
    const comp=r.persona.completo;
    _dniOficial=comp;
    _callar();
    if(nm && !nm.value.trim()){
      _dniPuesto=comp;
      const e=$('err_name'); if(e) e.classList.remove('show');
      nm.classList.remove('err');
      _dniEscribir(nm, comp);             // aparece, se ilumina y suena
      return;
    }
    _dniMarca();                          // había un nombre: coincide o se sugiere
  },250);
}

function _showKnownBadge(){
  const badge=$('knownBadge');
  if(!badge||!_knownClient) return;
  const first=(_knownClient.name||'').split(' ')[0];
  badge.style.display='block';
  badge.innerHTML=`<div style="display:inline-flex;align-items:center;gap:8px;background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.35);border-radius:10px;padding:8px 12px;font-size:13px;color:var(--green)">🌟 ¡Te conocemos, ${esc(first)}!</div>`;
  const nameEl=$('f_name');
  // Con solo el primer nombre (`parcial`) no se rellena: un nombre a medias
  // en una etiqueta de envío es peor que el campo vacío.
  if(nameEl&&!nameEl.value.trim()&&!_knownClient.parcial) nameEl.value=_knownClient.name||'';
  _updateKnownAddrShortcut();
}
