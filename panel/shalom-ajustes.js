/**
 * panel/shalom-ajustes.js — Shalom en Config: barrido, puerta, seguimiento y cuentas
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
    (u.fallidas ? ' · <b style="color:#d29922">' + u.fallidas + ' fallaron</b>' +
      _motivosBarrido(u.motivos) : '') +
    '<br>No preguntó a ' + ahorro + ' (ya entregados o finalizados)' +
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
/* Verificar la sesión de Shalom Pro.

   "Instancia encendida" y "sesión de Shalom viva" NO son lo mismo, y confundirlas
   sale caro: la pantalla de Instancias puede decir Conectado (el robot corre)
   mientras la cuenta está deslogueada y el robot quedó parado en /login. Este
   botón mira la sesión, que es lo que decide si un registro va a funcionar.

   La forma de la respuesta está MEDIDA, no supuesta (ver docs/SHALOM.md):
     { isLoggedIn: boolean, username: string|null, url: string }
   Quien la traduce es la Cloud Function; acá solo se pinta.

   Si algún día Shalom cambia esa forma, `sesion.conocido` llega en false y este
   cuadro vuelve a enseñar la respuesta cruda en vez de inventar un "conectado".
   Ese camino se deja puesto a propósito: es el que permitió medir esto sin
   desplegar una versión especial para mirar.

   No escribe en ningún pedido, no gasta envíos y no expone la clave: la clave
   vive en Secret Manager y quien habla con Shalom es la Cloud Function. */
function verificarInstanciaShalom(){
  /* Ya no hay botón propio: esto se llama desde el enlace «comprobar» de
     la línea de estado, que lo pinta `_pintarShalomConfig()`. El `btn`
     queda opcional para no atar esta función a una pantalla concreta. */
  const btn=document.getElementById('shalomInstBtn');
  const caja=document.getElementById('shalomCfgSalida');
  if(!caja) return;
  if(!window.Shalom||typeof Shalom.estadoInstancia!=='function'){
    caja.style.display='block';
    caja.innerHTML='<span style="color:#f87171">No se pudo cargar el módulo de Shalom. Recarga la página.</span>';
    return;
  }
  if(btn){ btn.disabled=true; btn.textContent='⏳ Consultando…'; }
  caja.style.display='block';
  caja.innerHTML='<span style="color:#8b949e">Preguntándole a Shalom…</span>';

  return Shalom.estadoInstancia().then(function(r){
    // Los motivos que sí conocemos son NUESTROS (los inventa la puerta única),
    // así que esos sí se traducen: no es suponer, es leer nuestro propio código.
    const nuestros={
      SIN_RED:'Sin internet. Revisa tu conexión y reintenta.',
      DESCONECTADO:'La integración con Shalom se está rehaciendo. Vuelve cuando esté conectada.',
      SIN_SESION:'Tu sesión del panel venció. Cierra sesión y vuelve a entrar.',
      SIN_PERMISO:'Entraste bien, pero tu cuenta no está autorizada para esto.',
      SIN_INSTANCIA:'No tienes ninguna cuenta de Shalom Pro conectada. Créala en el panel de Shalom (Instancias → Nueva instancia).',
      VARIAS_INSTANCIAS:'Tienes más de una cuenta de Shalom Pro y la configurada no aparece en la lista. No elijo una por ti: registrar en la equivocada le cobra al otro negocio. Pulsa de nuevo para elegirla a mano.',
      BLOQUEADO:'Shalom rechazó la clave de la API o el plan venció.',
      LIMITE:'Se agotó la cuota del plan de Shalom.',
      ERROR_SHALOM:'Shalom respondió con un error. Reintenta en unos minutos.'
    };
    /* ★ CUÁL DE TUS CUENTAS DE SHALOM PRO USA EL PANEL.
       Caso real (01/10/2026): la cuenta devuelve DOS instancias y las DOS
       conectadas —`Total` y `Yapaitas`, dos negocios distintos—. Elegir una
       por su cuenta habría registrado el envío de un cliente en la cuenta
       del otro negocio, cobrado a ellos, y nadie se habría enterado hasta
       que el paquete no apareciera.
       La decisión vive en `Shalom.elegirInstancia`, UN solo sitio: dos
       pantallas decidiendo lo mismo divergen, y divergir aquí cuesta eso. */
    const guardada = (window.S && S.shalomInstancia && S.shalomInstancia.id) || '';
    /* La cuenta declarada de este panel. Config la puede pisar sin
       desplegar; si no hay nada en Config, vale la del módulo. */
    const preferida = (window.S && S.shalomInstanciaPreferida) ||
      (window.Shalom && Shalom.INSTANCIA_PREFERIDA) || '';
    const elec = (window.Shalom && Shalom.elegirInstancia)
      ? Shalom.elegirInstancia((r && r.instancias) || [], guardada, preferida)
      : null;

    if(elec && elec.estado==='falta_elegir'){
      _pintarElectorInstancia(caja, elec.instancias, '',
        'Tienes más de una cuenta de Shalom Pro. <b>Elige cuál usa el panel</b> — '+
        'registrar en la equivocada le cobra al otro negocio.');
      return;
    }
    if(elec && elec.estado==='elegida_no_existe'){
      /* No se cae a otra, ni aunque quede una sola: sería cambiarte de
         negocio sin avisar. */
      _pintarElectorInstancia(caja, elec.instancias, '',
        '⚠️ La cuenta que elegiste (<b>'+esc((S.shalomInstancia&&S.shalomInstancia.nombre)||guardada)+
        '</b>) ya no está. <b>No se cambia sola.</b> Elige otra:');
      return;
    }

    /* ⚠️ ESTO VA ANTES DEL AVISO, y el orden no es un detalle de estilo:
       fue un fallo real en producción (02/10/2026).
       Con dos instancias el servidor responde `VARIAS_INSTANCIAS` —y hace
       bien, porque ÉL no sabe cuál quiere el dueño—. Pero el navegador SÍ
       lo sabe: la tiene declarada. Yo dejé el aviso antes de resolverla, así
       que salía "tienes más de una cuenta" y la resolución no llegaba a
       ejecutarse nunca. La negativa del servidor es correcta; lo que
       faltaba era usarla aquí en vez de repetirla. */
    const ses=(elec && (elec.estado==='elegida' || elec.estado==='declarada'))
      ? {conocido:true, conectada:elec.instancia.conectada,
         usuario:elec.instancia.usuario, nombre:elec.instancia.nombre,
         id:elec.instancia.id, url:null, enLogin:null}
      : (r&&r.sesion);

    if(!ses && r && r.ok===false && nuestros[r.motivo]){
      caja.innerHTML='<span style="color:#f87171">❌ '+nuestros[r.motivo]+'</span>';
      return;
    }

    /* ★ RESOLVER NO ES GUARDAR, y confundirlos dejo ciego al servidor.
       La cuenta declarada vive en shalom.js, que es codigo de NAVEGADOR. El
       panel la resolvia y la enseñaba conectada, pero la Cloud Function que
       registra envios lee Firestore — y ahi no habia nada. Decia "falta la
       cuenta de Shalom Pro" con la cuenta a la vista, y el fallo estaba
       tres pasos antes.
       Se guarda SOLO cuando se resolvio sola: declarada (tu la declaraste)
       o unica (no hay otra). Ante duda nunca — eso sigue siendo tuyo. */
    if(elec && elec.instancia &&
       (elec.estado==='declarada' || elec.estado==='una' ||
        elec.estado==='elegida') && window.S){
      const _ya = (S.shalomInstancia||{}).id;
      if(_ya !== elec.instancia.id){
        S.shalomInstancia = {id: elec.instancia.id,
          nombre: elec.instancia.nombre||''};
        if(typeof save==='function') save('config');
      }
    }

    if(ses&&ses.conocido){
      _pintarSesionShalom(caja,ses);
      if(elec && elec.instancia && elec.instancias.length>1){
        caja.innerHTML += '<div style="margin-top:8px;text-align:right">'+
          '<button type="button" onclick="verificarInstanciaShalom._cambiar()" '+
          'style="background:none;border:none;color:#58a6ff;cursor:pointer;'+
          'font-family:inherit;font-size:11px;text-decoration:underline">'+
          'Cambiar de cuenta</button></div>';
        verificarInstanciaShalom._cambiar=function(){
          _pintarElectorInstancia(caja, elec.instancias, elec.instancia.id,
            'Elige qué cuenta de Shalom Pro usa el panel:');
        };
      }
      return;
    }

    // Forma no reconocida: se enseña tal cual y no se afirma nada.
    _pintarRespuestaCruda(caja,r,
      'Shalom respondió algo con una forma que no reconozco. No voy a adivinar si la sesión está viva:');
  }).catch(function(e){
    caja.innerHTML='<span style="color:#f87171">❌ '+String((e&&e.message)||'error')+'</span>';
  }).then(function(){
    if(btn){ btn.disabled=false; btn.textContent='🔌 Verificar sesión'; }
    // Que la línea de estado se entere de lo que acabamos de resolver.
    if(typeof _pintarShalomConfig==='function') _pintarShalomConfig(true);
  });
}

/* La lista de cuentas de Shalom Pro, para que el dueño elija UNA.
   No marca ninguna por defecto a propósito: un radio preseleccionado es una
   elección que nadie hizo, y aquí elegir mal cuesta registrar el envío de un
   cliente en la cuenta de otro negocio. */
function _pintarElectorInstancia(caja, lista, idActual, titulo){
  const filas=(lista||[]).map(function(x){
    const esta = x.id===idActual;
    return '<button type="button" onclick="elegirInstanciaShalom('+
      JSON.stringify(JSON.stringify({id:x.id,nombre:x.nombre}))+')" '+
      'style="display:block;width:100%;text-align:left;margin-top:6px;padding:9px 10px;'+
      'border-radius:9px;cursor:pointer;font-family:inherit;background:'+
      (esta?'rgba(34,197,94,.12)':'var(--bg2)')+';border:1px solid '+
      (esta?'rgba(34,197,94,.35)':'var(--bd)')+'">'+
      '<div style="font-size:12.5px;font-weight:700;color:var(--text)">'+
      (esta?'✅ ':'')+esc(x.nombre||'(sin nombre)')+'</div>'+
      '<div style="font-size:10.5px;color:#8b949e;margin-top:2px">'+
      esc(x.usuario||'')+' · '+(x.conectada?'🟢 conectada':'🔴 desconectada')+
      '</div></button>';
  }).join('');
  caja.innerHTML='<div style="font-size:12px;color:#f59e0b;line-height:1.5">'+
    titulo+'</div>'+filas;
}

/* Pinta el resultado cuando la forma SÍ es la conocida. */
function _pintarSesionShalom(caja,ses){
  if(ses.conectada){
    caja.innerHTML=
      '<div style="padding:10px;border-radius:9px;background:rgba(34,197,94,.1);'+
      'border:1px solid rgba(34,197,94,.3)">'+
      '<div style="color:#22c55e;font-weight:700">✅ Sesión conectada</div>'+
      '<div id="shalomInstUser" style="color:#8b949e;font-size:11.5px;margin-top:4px"></div>'+
      '</div>';
    // textContent: el nombre de la cuenta lo manda Shalom, se muestra como
    // texto y nunca se interpreta como HTML.
    document.getElementById('shalomInstUser').textContent =
      ses.usuario ? ('Cuenta: '+ses.usuario+' · el registro automático puede funcionar.')
                  : 'El registro automático puede funcionar.';
    return;
  }
  caja.innerHTML=
    '<div style="padding:10px;border-radius:9px;background:rgba(248,113,113,.1);'+
    'border:1px solid rgba(248,113,113,.3)">'+
    '<div style="color:#f87171;font-weight:700">⚠️ La sesión de Shalom Pro está caída</div>'+
    '<div style="color:#8b949e;font-size:11.5px;margin-top:5px;line-height:1.5">'+
    'La instancia sigue encendida, pero la cuenta se deslogueó: quedó parada en la '+
    'pantalla de inicio de sesión. Mientras siga así, registrar envíos desde el panel '+
    'no va a funcionar. Entra a tu cuenta de Shalom Pro y vuelve a presionar este botón.'+
    '</div>'+
    '<div id="shalomInstLink" style="margin-top:7px"></div>'+
    '</div>';
  // Solo se convierte en enlace si es https. Una URL que llega de afuera no se
  // mete en un href a ciegas (javascript: sería un agujero).
  const cont=document.getElementById('shalomInstLink');
  const url=String(ses.url||'');
  if(/^https:\/\//.test(url)){
    const a=document.createElement('a');
    a.href=url; a.target='_blank'; a.rel='noopener noreferrer';
    a.textContent='🔗 Abrir Shalom Pro para iniciar sesión';
    a.style.cssText='color:#388bfd;font-size:11.5px;font-weight:700;text-decoration:none';
    cont.appendChild(a);
  }
}

/* Enseña la respuesta tal cual llegó. Se usa cuando la forma no es la medida:
   antes de traducir algo que no se entiende, se muestra. */
function _pintarRespuestaCruda(caja,r,titulo){
  caja.innerHTML=
    '<div id="shalomInstTit" style="color:#8b949e;margin-bottom:6px"></div>'+
    '<pre id="shalomInstRaw" style="margin:0;padding:9px;border-radius:8px;background:var(--bg2);'+
    'border:1px solid var(--bd);color:#e6edf3;font-size:11px;line-height:1.45;'+
    'max-height:220px;overflow:auto;white-space:pre-wrap;word-break:break-word"></pre>'+
    '<button type="button" onclick="copiarRespuestaInstancia()" style="width:100%;margin-top:8px;'+
    'padding:9px;border-radius:9px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:700;'+
    'background:rgba(163,113,247,.15);border:1px solid rgba(163,113,247,.35);color:#a78bfa">📋 Copiar respuesta</button>';
  document.getElementById('shalomInstTit').textContent=titulo;
  document.getElementById('shalomInstRaw').textContent=JSON.stringify(r,null,1);
}
function copiarRespuestaInstancia(){
  const pre=document.getElementById('shalomInstRaw');
  if(!pre) return;
  const txt=pre.textContent||'';
  const listo=function(){ toast('📋 Respuesta copiada'); };
  try{
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(txt).then(listo).catch(function(){ _copiarFallback(txt,listo); });
    }else{ _copiarFallback(txt,listo); }
  }catch(e){ _copiarFallback(txt,listo); }
}
function _copiarFallback(txt,listo){
  try{
    const t=document.createElement('textarea');
    t.value=txt; t.style.position='fixed'; t.style.opacity='0';
    document.body.appendChild(t); t.select();
    document.execCommand('copy');
    document.body.removeChild(t);
    listo();
  }catch(e){ toast('No se pudo copiar — selecciona el texto a mano'); }
}
