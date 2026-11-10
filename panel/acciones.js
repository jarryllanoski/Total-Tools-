/**
 * panel/acciones.js — resaltar, pegar, copiar, dictado por voz y mensajes rápidos
 * ===============================================================================
 * Fase 3 (10/11/2026): el panel en módulos. Antes vivía en index.html.
 * Script CLÁSICO a propósito: sus funciones y variables son globales, igual
 * que cuando estaban en un solo archivo — moverlas no cambió ni una llamada.
 * El orden de los <script> en index.html es el orden de ejecución.
 */
/* Resaltar (y centrar) una tarjeta por su id — se usa al crear un pedido nuevo */
/* ══════════════════════════════════════════════════════════════════════
   LLÉVAME A ESE PEDIDO — la única puerta
   ══════════════════════════════════════════════════════════════════════
   ⚠️ EXISTE POR UN FALLO REAL (30 sep 2026): al guardar un pedido nuevo, el
   panel no saltaba a él ni lo resaltaba. Y la causa es fina.

   `config.js` hacía esto:
       setFilt(data.status);      // esperando que repinte
       _highlightCard(data.id);   // y buscaba la tarjeta en el DOM

   Pero `setFilt` tiene una optimización legítima: `if (v === _filt) return;`
   —tocar el chip que ya está activo no debe reconstruir 1200 tarjetas—. Si
   el filtro YA estaba en "NUEVO PEDIDO", que es lo normal tras crear dos
   pedidos seguidos, `setFilt` se salía por ahí y NO REPINTABA. La tarjeta
   nueva no llegaba al DOM, `querySelector` devolvía null, y el resaltado
   hacía `if(!c) return;`: se callaba. Ni scroll, ni resaltado, ni tarjeta.

   EL ERROR DE FONDO NO ES ESE `return`. Es que el camino de creación
   dependía de un EFECTO SECUNDARIO de `setFilt` en vez de pedir el
   repintado que necesitaba. Y había DOS caminos para lo mismo: el de
   `notify.js` (botón Ver) lo hacía bien desde hace meses. Ahora es uno.

   El repintado está GARANTIZADO porque `clearAdvSearch()` siempre llama a
   `render()`, pase lo que pase con el filtro. Esa es la pieza que al camino
   de creación le faltaba.
   ══════════════════════════════════════════════════════════════════════ */
function irAlPedido(id, opciones){
  const o = opciones || {};
  const ped = ((window.S && S.shipments) || []).filter(function(x){
    return x && x.id === id; })[0];

  /* 1 · Destrabar lo que pudiera esconderlo. La razón está escrita en el
     comentario original de notify.js: "antes podía quedar oculto por una
     búsqueda activa". Un pedido recién creado que no aparece porque hay
     texto en el buscador es el mismo fallo con otra cara. */
  const srch = document.getElementById('fSearch');
  if(srch && srch.value){ srch.value=''; }
  if(typeof clearAdvSearch === 'function') clearAdvSearch();
  else if(typeof render === 'function') render();

  /* 2 · Si el pedido ya no está, se dice y no se marca nada. Marcar un id
     que no existe dejaría el estado encendido para siempre, esperando a una
     tarjeta que no va a pintarse nunca. */
  if(!ped){
    console.warn('[irAlPedido] el pedido ' + id +
      ' no está en S.shipments — no es cosa de la vista');
    if(typeof toast === 'function') toast('⚠️ Ese pedido ya no está en la lista');
    return;
  }

  /* 3 · Pedir la marca y el desplazamiento ANTES de cambiar de etiqueta.
     No se hace ninguna de las dos cosas aquí: se APUNTAN, y las hace el
     repintado cuando la lista definitiva ya está escrita. Esa inversión es
     todo el arreglo — antes esto buscaba la tarjeta a mano y la encontraba
     en la lista VIEJA, que el repintado estaba a punto de destruir. */
  clearTimeout(_marcaTimer);
  _pedidoMarcado = id;
  _scrollPendiente = id;

  /* 4 · Llevar a la etiqueta donde vive el pedido. El repintado que esto
     dispara es el que pinta la marca y hace el scroll, ya dentro de la
     lista corta: desplazarse entre 29 tarjetas cae donde debe; entre 1408,
     nunca caía bien. */
  if(typeof setFilt === 'function') setFilt(ped.status);
  /* `setFilt` no repinta si la etiqueta YA era esa. Entonces repinta esto,
     o la marca se quedaría apuntada y sin pintar. */
  if(typeof render === 'function') render();

  /* 5 · Y se apaga sola. El apagado también es un repintado: la marca entra
     y sale por el mismo sitio por el que se dibuja. */
  _marcaTimer = setTimeout(function(){
    _pedidoMarcado = '';
    if(typeof render === 'function') render();
  }, o.ms || 3000);
}
/* fin irAlPedido */

/* Barra de pegar WhatsApp: botón ✕ para limpiar lo pegado */
function _pasteClearToggle(){ const p=document.getElementById('fPaste'),b=document.getElementById('fPasteClear'); if(!p||!b) return; b.style.display=(p.value&&p.value.trim())?'block':'none'; }
function clearPaste(){ const p=document.getElementById('fPaste'); if(p){ p.value=''; p.focus(); } _pasteClearToggle(); }

/* Copiar el número de la tarjeta (iconito ⧉ al lado del número) */
function copyPhone(phone){
  // Con usuario de WhatsApp se copia tal cual (la arroba hace falta para
  // pegarlo en su buscador); con número, solo los dígitos, como siempre.
  const clean=esUsuarioWA(phone)?String(phone).trim():String(phone).replace(/\D/g,'');
  const done=()=>toast('📋 Copiado ✓');
  if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(clean).then(done).catch(()=>toast('📋 '+clean)); }
  else { const t=document.createElement('textarea'); t.value=clean; t.style.cssText='position:fixed;top:-9999px'; document.body.appendChild(t); t.select(); try{document.execCommand('copy');done();}catch(e){toast(clean);} t.remove(); }
}
/* ── Dictado por voz para Guía + Código Shalom ─────────────────────────
   Reutiliza Web SpeechRecognition (es-PE). Guía = 8 dígitos (auto-salta al
   código al completar). Código = 4 caracteres (mejor esfuerzo + corregible).
   El micro solo se ve si el navegador soporta voz Y la guía está vacía.       */
var _SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition || null;
var _shalomRec = null;          // instancia activa
var _shalomVozStage = null;     // 'guia' | 'codigo' | null
var _shalomVozChain = null;     // timer del salto automático guía → código

// Motivo por el que el dictado no está disponible (para explicarlo claro en vez
// de fallar callado). Solo Chrome/Edge de escritorio; Brave lo desactiva.
function _motivoSinVozShalom(){
  if(!_SpeechRec) return '⚠️ Este navegador no soporta dictado. Usa Chrome o Edge.';
  if(navigator.brave) return '🦁 Brave desactiva el dictado por privacidad. Abre el panel en Chrome o Edge.';
  return null;
}

function _updateShalomMic(){
  var btn = document.getElementById('shalomMicBtn');
  if(!btn) return;
  // Siempre visible si el navegador soporta voz. (Antes se ocultaba al llenar la
  // guía, dejando la etapa 'código' sin mic visible → confuso.)
  btn.style.display = _SpeechRec ? 'block' : 'none';
  if(_shalomRec) return; // escuchando: el visual lo maneja _shalomMicVisual
  var g = document.getElementById('fShalomGuia');
  var guiaLista = !!(g && (g.value||'').trim().length>=8);
  btn.title = guiaLista ? '🎤 Dicta el código por voz' : '🎤 Dicta la guía por voz';
}

/* Convierte palabras/frases dictadas a solo dígitos ("ocho dos cero" → 820) */
function _vozADigitos(txt){
  var mapa={cero:'0',uno:'1',una:'1',dos:'2',tres:'3',cuatro:'4',cinco:'5',seis:'6',siete:'7',ocho:'8',nueve:'9'};
  var out=(txt||'').toLowerCase()
    .replace(/[a-záéíóúñü]+/g, function(w){ return (mapa[w]!==undefined)? mapa[w] : w; });
  return out.replace(/\D/g,'');
}
/* Código: alfanumérico → mayúsculas sin espacios (mejor esfuerzo).
   Convierte también números dictados en palabra ("nueve" → 9). */
function _vozACodigo(txt){
  // Números en palabra + alfabeto fonético español (ej. "tres ka te te" → "3KTT").
  // Mejor esfuerzo y corregible a mano — dictar letras nunca es 100% fiable.
  var mapa={
    cero:'0',uno:'1',una:'1',dos:'2',tres:'3',cuatro:'4',cinco:'5',seis:'6',siete:'7',ocho:'8',nueve:'9',
    a:'A',be:'B',ve:'V',ce:'C',de:'D',e:'E',efe:'F',ge:'G',hache:'H',i:'I',jota:'J',ka:'K',ele:'L',
    eme:'M',ene:'N',o:'O',pe:'P',cu:'Q',ere:'R',erre:'R',ese:'S',te:'T',u:'U',uve:'V',equis:'X',ye:'Y',zeta:'Z',ceta:'Z'
  };
  var t=(txt||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  var out=t.replace(/[a-z]+/g,function(w){ return (mapa[w]!==undefined)? mapa[w] : w; });
  return out.toUpperCase().replace(/[^A-Z0-9]/g,'');
}

function _shalomMicVisual(on){
  var btn=document.getElementById('shalomMicBtn');
  if(!btn) return;
  if(on){ btn.textContent='🔴'; btn.style.animation='shalomMicPulse 1s ease-in-out infinite'; btn.title='Escuchando… toca para detener'; }
  else  { btn.textContent='🎤'; btn.style.animation=''; btn.title='Dictar guía y código por voz'; }
}

function _shalomVozStop(){
  if(_shalomVozChain){ clearTimeout(_shalomVozChain); _shalomVozChain=null; }
  _shalomVozStage=null;
  if(_shalomRec){ try{ _shalomRec.onend=null; _shalomRec.stop(); }catch(e){} _shalomRec=null; }
  _shalomMicVisual(false);
}

function shalomVozStart(){
  // si ya está escuchando (o en el salto guía → código), el toque detiene
  if(_shalomRec||_shalomVozChain){ _shalomVozStop(); return; }
  var motivo=_motivoSinVozShalom();
  if(motivo){ toast(motivo); return; }
  var gEl=document.getElementById('fShalomGuia');
  var cEl=document.getElementById('fShalomCodigo');
  if(!gEl||!cEl) return;
  _shalomVozStage = (gEl.value||'').trim().length>=8 ? 'codigo' : 'guia';
  _shalomVozBeginStage();
}

function _shalomVozBeginStage(){
  if(!_SpeechRec) return;
  var rec = new _SpeechRec();
  rec.lang='es-PE'; rec.interimResults=true; rec.maxAlternatives=1; rec.continuous=false;
  _shalomRec=rec;
  _shalomMicVisual(true);
  var gEl=document.getElementById('fShalomGuia');
  var cEl=document.getElementById('fShalomCodigo');
  if(_shalomVozStage==='guia'){ toast('🎤 Dicta el número de guía (8 dígitos)'); }
  else { toast('🎤 Dicta el código (4 caracteres)'); }

  rec.onresult=function(ev){
    var txt='';
    for(var i=ev.resultIndex;i<ev.results.length;i++){ txt+=ev.results[i][0].transcript; }
    if(_shalomVozStage==='guia'){
      var d=_vozADigitos(txt);
      if(d){ gEl.value=d.substring(0,8); }
      if((gEl.value||'').length>=8){
        // Guía completa → el micrófono SIGUE PRENDIDO y salta solo al código.
        // Se cierra esta sesión y se abre una NUEVA tras una pausa breve: así el
        // final de la frase de la guía no se cuela en el código (era el bug de
        // la transición directa). La guarda anti-leak de abajo es el segundo
        // cinturón. Tocar el mic durante la pausa cancela.
        gEl.value=gEl.value.substring(0,8);
        try{ rec.onend=null; rec.stop(); }catch(e){}
        _shalomRec=null;
        _shalomVozStage='codigo';
        _shalomMicVisual(true);       // sigue en rojo: no hay que volver a encender
        cEl.focus();
        toast('✅ Guía lista — ahora dicta el código');
        if(_shalomVozChain) clearTimeout(_shalomVozChain);
        _shalomVozChain=setTimeout(function(){
          _shalomVozChain=null;
          if(_shalomVozStage==='codigo' && !_shalomRec) _shalomVozBeginStage();
        }, 700);
      }
    } else if(_shalomVozStage==='codigo'){
      var c=_vozACodigo(txt);
      // Guardia anti-leak: un código real es corto y alfanumérico. Si el
      // resultado trae 5+ dígitos seguidos o contiene la guía completa, es la
      // guía colándose → ignorar.
      var guia=(gEl.value||'').trim();
      var esGuia = /\d{5,}/.test(c) || (guia && c.indexOf(guia)!==-1);
      if(c && !esGuia){ cEl.value=c.substring(0,8); }
    }
  };
  rec.onerror=function(e){
    if(e){
      if(e.error==='network'||e.error==='service-not-allowed'){ toast('⚠️ El dictado no está disponible en este navegador. Usa Chrome o Edge.'); }
      else if(e.error==='not-allowed'){ toast('🎤 Permite el micrófono para dictar'); }
    }
    _shalomVozStop();
  };
  rec.onend=function(){
    var eraCodigo = _shalomVozStage==='codigo';
    _shalomVozStop();
    _updateShalomMic(); // reflejar la etapa (guía/código) en el mic tras terminar
    if(eraCodigo && (cEl.value||'').trim()){
      toast('✅ Código dictado — revísalo (puedes corregirlo a mano)');
    }
  };
  try{ rec.start(); }catch(e){ _shalomVozStop(); }
}

/* Ícono 🔄: CON selección → tracking Shalom de las seleccionadas; SIN selección → refrescar */
function onTrackBtn(){
  const sel=Seleccion.marcados();
  if(!sel.length){ render(); return; }
  if(window.Tracking && Tracking.bulkTrack){ Tracking.bulkTrack(sel.map(x=>x.id)); }
  else { render(); }
}

/* QUICK MSG */
function quickMsg(id,idx){
  const s=S.shipments.find(x=>x.id===id);if(!s)return;
  const msgs=S.msgTemplates[s.status]||['',''];
  const tpl=msgs[idx];if(!tpl||!tpl.trim())return;
  window.waOpen(s.phone, fillVars(tpl,s));
}
