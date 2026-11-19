(function(){
'use strict';

let trackRefreshId = null;

async function loadCfgThenTrack(token){
  try{
    const cfgId = new URLSearchParams(location.search).get('cfg');
    let cfg = cfgId ? await _api('formcfg', {id: cfgId}) : await _api('config');
    if(cfg && cfg.error) cfg = null;
    if(!cfg || !_cfgHasPhone(cfg)){
      const live = await _api('config');
      if(live && !live.error){
        if(!cfg){ cfg = live; }
        else{ const lp = live.phone||(live.config&&live.config.phone)||''; if(lp) cfg.phone = lp; }
      }
    }
    if(cfg && !cfg.error) CFG = cfg;
  }catch(e){ console.warn('Config no disponible'); }
  renderTracking(token);
  if(window.TTFormLoader) TTFormLoader.ready();
}

function _ayudaTrackContenido(tipo, esShalom, tiendaDir, estado, nombre, shalom){
  const dir = esc(tiendaDir||'');
  const enTienda = dir ? ' en <b>'+dir+'</b>' : '';
  const T = {
    delivery: {
      envio:'🛵 Salió con nuestro motorizado hacia tu dirección.',
      destino:'🛵 El motorizado está llegando. Ten tu DNI a la mano y revisa tu pedido al recibirlo.',
      pago:'Pagas al recibir tu pedido.'},
    agencia: {
      envio: esShalom ? '🚚 Lo dejamos en Shalom y viaja a tu ciudad. Mira su recorrido en el bloque <b>Seguimiento Shalom</b>.'
                      : '🚚 Lo dejamos en la agencia y viaja a tu ciudad.',
      destino:'🏢 Ya está en la agencia de destino: acércate con el DNI del destinatario para recogerlo.',
      pago:'Completa el pago para poder recogerlo.'},
    encomienda: {
      envio:'📦 Lo dejamos en la agencia; ya viaja a tu ciudad.',
      destino:'📦 Llegó a la agencia de tu ciudad: recógelo con el DNI del destinatario.',
      pago:'Completa el pago para poder recogerlo.'},
    retiro: {
      envio:'🏪 ¡Listo! Ya puedes pasar a recogerlo a nuestra tienda'+enTienda+'.',
      destino:'🏪 ¡Listo! Ya puedes pasar a recogerlo a nuestra tienda'+enTienda+'. Trae tu DNI.',
      pago:'Pagas al recoger en tienda.'},
  };
  const t = T[tipo] || T.delivery;
  const estados = [
    {ico:'🆕', t:'NUEVO PEDIDO · EN PROCESO', d:'Recibimos tu pedido y lo estamos revisando.', k:['NUEVO PEDIDO','EN PROCESO']},
    tipo==='retiro'
      ? {ico:'📦', t:'POR ALISTAR', d:'Estamos preparando tu pedido.', k:['POR ALISTAR']}
      : {ico:'📦', t:'POR ALISTAR · ALISTADO', d:'Estamos empacando tu pedido.', k:['POR ALISTAR','ALISTADO']},
  ];
  if(tipo==='retiro'){
    estados.push({ico:'✅', t:'ALISTADO', d:t.envio, k:['ALISTADO','ENVIADO','LLEGÓ A DESTINO']});
  } else {
    estados.push({ico:'🚚', t:'ENVIADO', d:t.envio, k:['ENVIADO']});
    estados.push({ico:'📍', t:'LLEGÓ A DESTINO', d:t.destino, k:['LLEGÓ A DESTINO']});
  }
  estados.push({ico:'💰', t:'PENDIENTE DE PAGO', d:t.pago, k:['PENDIENTE DE PAGO']});
  estados.push({ico:'🏁', t:'FINALIZADO', d:'Entregado. ¡Gracias por tu compra!', k:['FINALIZADO','ENTREGADO']});
  const enShalom = !!(shalom && typeof shalom === 'object');
  let actual = enShalom ? -1 : estados.findIndex(e => e.k.indexOf(String(estado||'').toUpperCase()) >= 0);
  if(enShalom){
    estados.length = 0;
    estados.push({ico:'📦', t:'En origen', d:'Shalom recibió tu paquete en la agencia de salida.', k:[]});
    estados.push({ico:'🚚', t:'En camino', d:'Viaja hacia la agencia de destino.', k:[]});
    estados.push({ico:'📍', t:'En destino', d:'Ya está en la agencia de destino: acércate con el DNI del destinatario.', k:[]});
    estados.push({ico:'✅', t:'Entregado', d:'Recogido. ¡Gracias por tu compra!', k:[]});
    const f = (typeof _shalomFase === 'function' && shalom.estado) ? _shalomFase(shalom.estado) : null;
    actual = f ? f.idx : -1;
  }
  const hola = nombre ? _holaNombre(nombre) : '';
  const toby = enShalom
    ? hola + 'Tu envío ya está en <b>Shalom</b>. ' + (shalom.estado
        ? 'Shalom dice: <b>' + esc(String(shalom.estado)) + '</b>.'
        : 'Estamos esperando que lo reciban en la agencia; aquí verás cada avance.')
    : (actual >= 0
      ? hola + 'Tu pedido: <b>' + esc(String(estado).toUpperCase()) + '</b>. ' + estados[actual].d
      : hola + 'Aquí ves qué significa cada estado de tu pedido.');

  const faq = [];
  if(esShalom){
    faq.push({q:'¿Qué son el N.º de guía y el código?', a:'Son los datos de tu envío en Shalom. Con ellos puedes ver tu paquete en la app de Shalom (Seguimiento → ingresa la guía y el código). Toca <b>Copiar</b> para copiarlos juntos.'});
    faq.push({q:'¿Cada cuánto se actualiza?', a:'El estado de Shalom se consulta varias veces al día, solo. No necesitas hacer nada: abre este enlace cuando quieras.'});
  } else {
    faq.push({q:'¿Cada cuánto se actualiza?', a:'Cada vez que tu pedido avanza lo actualizamos. Abre este enlace cuando quieras.'});
  }
  if(tipo==='agencia' || tipo==='encomienda'){
    faq.push({q:'¿Qué llevo para recoger?', a:'El DNI de la persona que figura como destinatario.'});
  } else if(tipo==='retiro'){
    faq.push({q:'¿Dónde recojo mi pedido?', a:'En nuestra tienda'+enTienda+', cuando el estado diga <b>ALISTADO</b>. Trae tu DNI.'});
  } else {
    faq.push({q:'¿Quién recibe mi pedido?', a:'La persona que registraste. Ten tu DNI a la mano cuando llegue el motorizado.'});
  }
  faq.push({q:'«Presiona para ver tu documento»', a:'Es tu boleta o factura (si se adjuntó).'});
  faq.push({q:'¿Por qué mi DNI sale con asteriscos?', a:'Por tu seguridad: este enlace se puede reenviar, así que no mostramos el número completo.'});
  faq.push({q:'Tengo una consulta', a:'Usa el botón verde «Consultar por WhatsApp» para escribirnos directamente.'});
  return {estados, faq, actual, toby};
}

function abrirAyudaTrack(){
  const ov = _ayudaHoja();
  const cc = (CFG && (CFG.config || CFG)) || {};
  const c = _ayudaTrackContenido(window._trackTipo||'', !!window._trackEsShalom,
    String(cc.city||'').trim(), window._trackEstado||'', window._trackNombre||'',
    window._trackShalom || null);
  const wa = _ayudaWa('Hola, tengo una consulta sobre mi pedido');
  ov.innerHTML = `<div class="ay-sheet">
    ${_toby(c.toby, 'Guía de seguimiento')}
    <div class="ay-ttl">Qué significa cada estado</div>
    ${c.estados.map((e,i)=>{
      const est = c.actual<0 ? '' : (i===c.actual ? 'on' : (i<c.actual ? 'ok' : ''));
      return `<div class="ay-paso ${est}"><div class="ay-n">${est==='ok'?'✓':e.ico}</div><div><div class="ay-t">${e.t}${est==='on'?'<span class="ay-aqui">ESTÁS AQUÍ</span>':''}</div><div class="ay-d">${e.d}</div></div></div>`;
    }).join('')}
    <div class="ay-ttl">Preguntas frecuentes</div>
    ${c.faq.map(f=>`<details><summary>${f.q}</summary><p>${f.a}</p></details>`).join('')}
    <div class="ay-btns">
      ${wa?`<a class="ay-wa" href="${esc(wa)}" target="_blank" rel="noopener">💬 Escríbenos</a>`:''}
      <button class="ay-x" onclick="cerrarAyudaForm()">Entendido</button>
    </div>
  </div>`;
  ov.style.display = 'flex';
  document.body.classList.add('tt-ayuda-on');
  try{ ov.querySelector('.ay-x').focus({preventScroll:true}); }catch(_){}
}

function renderTracking(token){
  clearTrackRefresh();
  document.body.classList.add('seg');
  setApp(`
    ${headerHtml('track')}
    <div id="trackContent">
      <div style="display:flex;align-items:center;justify-content:center;padding:60px 0">
        <div class="spin"></div>
      </div>
    </div>
    ${brandFooterHtml()}
  `);
  buscarPedido(token);
}

var _trackTokenActivo = '';

function clearTrackRefresh(){
  if(trackRefreshId){ clearInterval(trackRefreshId); trackRefreshId=null; }
  _trackTokenActivo = '';
}

document.addEventListener('visibilitychange', function(){
  if(!document.hidden && _trackTokenActivo) buscarPedido(_trackTokenActivo, true);
});

async function buscarPedido(token, silent){
  const t = (token||'').trim();
  if(!t) return;

  if(!silent){
    const tc=$('trackContent');
    if(tc) tc.innerHTML=`<div style="display:flex;align-items:center;justify-content:center;padding:60px 0"><div class="spin"></div></div>`;
  }

  try{
    const resp = await _api('track', {token: t});
    if(resp && resp.status === 'ok' && resp.order){
      if(window.TTLoader) TTLoader.done();
      window._segTok = t;
      window._segVitrina = resp.vitrina || null;
      window._segGoogle = /^https:\/\//.test(String(resp.google || '')) ? resp.google : '';
      renderTrackResult(resp.order, resp.order.code);
      if(resp.order.frozen){
        clearTrackRefresh();
      } else if(!trackRefreshId){
        _trackTokenActivo = t;
        trackRefreshId = setInterval(()=>{
          if(document.hidden) return;
          buscarPedido(t, true);
        }, 30000);
      }
      return;
    }
    if(window.TTLoader) TTLoader.done();

    if(resp && resp.status === 'rate_limited'){
      setTrackContent('<div class="error-box" style="text-align:center">⏳ Demasiadas consultas ahora mismo<br><small style="font-weight:400;opacity:.8">Tu link está bien. Espera un momento y se actualiza solo.</small></div>');
      return;
    }

    clearTrackRefresh();
    const _bizPhone=((CFG&&(CFG.config&&CFG.config.phone||CFG.phone))||'').replace(/\D/g,'');
    const _waHref=_bizPhone?`https://wa.me/51${_bizPhone}?text=${encodeURIComponent('Hola, tengo una consulta sobre mi pedido')}`:'';
    setTrackContent(
      `<div class="error-box" style="text-align:center">🔧 Link no disponible<br><small style="font-weight:400;opacity:.8">Para consultar el estado de tu pedido, escríbenos directamente.</small></div>`+
      (_waHref?`<div style="text-align:center;margin-top:20px"><a href="${_waHref}" target="_blank" rel="noopener" style="display:inline-block;background:#0f7f3c;color:#fff;padding:14px 24px;border-radius:12px;text-decoration:none;font-weight:700;font-size:15px">💬 Consultar por WhatsApp</a></div>`:'')
    );
  }catch(e){
    if(window.TTLoader) TTLoader.done();
    setTrackContent(`<div class="error-box">Error al buscar: ${esc(e.message)}</div>${notMyOrderBtn()}`);
  }
}

function setTrackContent(html){
  const tc=$('trackContent'); if(tc) tc.innerHTML=html;
}

function notMyOrderBtn(){ return ''; }

function _copiarClasico(txt){
  try{
    var ta=document.createElement('textarea'); ta.value=txt; ta.setAttribute('readonly','');
    ta.style.cssText='position:fixed;top:-9999px;opacity:0';
    document.body.appendChild(ta); ta.select();
    var ok=document.execCommand('copy'); document.body.removeChild(ta);
    return !!ok;
  }catch(_){ return false; }
}

function _copyTrack(txt, btn){
  var hecho=function(ok){
    if(!btn) return;
    var o=btn.getAttribute('data-txt')||btn.textContent;
    btn.setAttribute('data-txt', o);
    btn.textContent= ok ? '\u2713 Copiado' : 'Mantén presionado para copiar';
    if(!ok){ try{ window.prompt('Copia estos datos:', txt); }catch(_){} }
    setTimeout(function(){ btn.textContent=o; }, ok?1400:2600);
  };
  try{
    if(navigator.clipboard && navigator.clipboard.writeText){
      return navigator.clipboard.writeText(txt).then(function(){ hecho(true); },
        function(){ hecho(_copiarClasico(txt)); });
    }
  }catch(_){}
  hecho(_copiarClasico(txt));
  return Promise.resolve();
}

function _textoGuia(guia, codigo){
  guia=String(guia||'').trim(); codigo=String(codigo||'').trim();
  if(guia && codigo) return 'Guía: '+guia+' · Código: '+codigo;
  return guia || codigo;
}

function _copyGuia(btn){
  if(!btn) return;
  return _copyTrack(_textoGuia(btn.getAttribute('data-guia'), btn.getAttribute('data-codigo')), btn);
}

var _FASE_VISTA = [
  {color:'var(--blue)', bg:'rgba(79,142,247,.08)', bd:'rgba(79,142,247,.22)',
    ic:'\ud83d\udce6', sub:'Tu paquete fue recibido por Shalom y ser\u00e1 enviado pronto.', pill:null},
  {color:'var(--blue)', bg:'rgba(79,142,247,.10)', bd:'rgba(79,142,247,.26)',
    ic:'\ud83d\ude9a', sub:'Tu paquete ya sali\u00f3 y viaja hacia la agencia de destino.', pill:null},
  {color:'var(--purple)', bg:'rgba(167,139,250,.12)', bd:'rgba(167,139,250,.32)',
    ic:'\ud83d\udce6', sub:'Tu paquete ya est\u00e1 en la agencia Shalom de destino.', pill:'destino'},
  {color:'var(--green)', bg:'rgba(34,197,94,.10)', bd:'rgba(34,197,94,.28)',
    ic:'\u2705', sub:'Tu paquete fue recogido. \u00a1Gracias por tu compra!', pill:null}
];
function _shalomFase(estado){
  var f = window.ShalomEstado ? window.ShalomEstado.fase(estado) : {idx:-1, demora:false};
  if(f.idx < 0){
    return {idx:-1, color:'var(--text2)', bg:'rgba(107,114,128,.08)', bd:'var(--bd)',
      ic:'\ud83d\udce6', sub:'', pill:null};
  }
  var v = Object.assign({idx:f.idx}, _FASE_VISTA[f.idx]);
  if(f.demora) v.sub = 'Tu paquete tuvo una demora, pero sigue en camino a destino.';
  if(f.reparto){
    v.sub = 'Tu paquete sali\u00f3 de la agencia de destino y va en reparto.'; v.pill = null;
  }
  return v;
}

function _shalomTrackingBlock(ship){
  var isShalom = ship.courier && ship.courier.toUpperCase().includes('SHALOM');
  if(!isShalom) return '';
  var guia   = ship.trackingOrderNumber || ship.shalomGuia   || '';
  var codigo = ship.trackingOrderCode   || ship.shalomCodigo || '';
  var estado = (ship.trackingStatus || '').trim();
  var ultima = ship.trackingLastUpdate || '';
  var dni    = (window.DniPedido ? DniPedido.de(ship)
                : (ship.dni || ship.dniRecoger || ship.dniDestinatario || ''));
  if(!guia && !codigo && !estado) return '';

  var ago = '';
  if(ultima){
    var m = Math.floor((Date.now() - new Date(ultima).getTime())/60000);
    if(isNaN(m)) ago='';
    else if(m<1) ago='actualizado hace un momento';
    else if(m<60) ago='actualizado hace '+m+' min';
    else if(m<1440) ago='actualizado hace '+Math.floor(m/60)+' h';
    else ago='actualizado el '+new Date(ultima).toLocaleDateString('es-PE',{day:'2-digit',month:'short'});
  }

  var f = _shalomFase(estado);
  var pasos = ['En origen','En camino','En destino','Entregado'];

  var titulo = estado || 'Registrado en Shalom';
  if(!estado && guia){
    f = {idx:-1, color:'var(--purple)', bg:'rgba(167,139,250,.08)', bd:'rgba(167,139,250,.3)',
      ic:'\ud83d\udce6', sub:'Esperando que lo reciban en la agencia. Aqu\u00ed ver\u00e1s cada avance.', pill:null};
  }
  var pillHtml = '';
  if(f.pill === 'destino'){
    pillHtml = '<span style="display:inline-block;margin-top:9px;font-size:12.5px;font-weight:800;'
      +'padding:7px 12px;border-radius:9px;background:var(--purple);color:#0b0b13">'
      +'\ud83d\udccd '+(dni?('Ac\u00e9rcate con tu DNI: '+esc(dni)):'Recoge en la agencia Shalom de destino')+'</span>';
  }
  var heroHtml = '<div style="display:flex;gap:12px;align-items:flex-start;background:'+f.bg
    +';border:1px solid '+f.bd+';border-radius:12px;padding:13px 14px;margin-bottom:14px">'
    +'<div style="font-size:26px;line-height:1;flex-shrink:0;margin-top:1px">'+f.ic+'</div>'
    +'<div style="min-width:0"><div style="font-size:15px;font-weight:800;color:'+f.color
    +';line-height:1.25'+(f.sub?';margin-bottom:3px':'')+'">'+esc(titulo)+'</div>'
    +(f.sub?'<div style="font-size:12.5px;color:var(--text2);line-height:1.4">'+f.sub+'</div>':'')
    +pillHtml
    +'</div></div>';

  var stepHtml = '';
  if(f.idx >= 0){
    stepHtml = '<div style="display:flex;align-items:flex-start;margin:4px 2px 16px">'
      + pasos.map(function(p,i){
          var done = i < f.idx, now = i === f.idx;
          var dotBg = (done||now) ? 'var(--purple)' : 'var(--bd)';
          var line  = i===0 ? '' : '<div style="position:absolute;top:6px;left:-50%;width:100%;height:2px;background:'+((i<=f.idx)?'var(--purple)':'var(--bd)')+';z-index:1"></div>';
          var ring  = now ? 'box-shadow:0 0 0 4px rgba(167,139,250,.22);' : '';
          var mark  = done ? '\u2713' : '';
          return '<div style="flex:1;text-align:center;position:relative">'
            + line
            + '<div style="width:13px;height:13px;border-radius:50%;background:'+dotBg+';border:2px solid '+dotBg+';margin:0 auto 6px;position:relative;z-index:2;'+ring+'display:flex;align-items:center;justify-content:center;font-size:8px;color:#fff">'+mark+'</div>'
            + '<div style="font-size:9.5px;color:'+(now?'var(--text)':'var(--text2)')+';font-weight:'+(now?'800':'600')+';line-height:1.2">'+p+'</div>'
            + '</div>';
        }).join('')
      + '</div>';
  }

  var guiaHtml = '';
  if(guia || codigo){
    guiaHtml = '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;'
      +'background:var(--card2);border:1px solid var(--bd);border-radius:10px;padding:10px 13px">'
      +'<div style="min-width:0"><div style="font-size:11px;color:var(--text2)">N.\u00ba de gu\u00eda Shalom</div>'
      +(guia?'<div style="font-size:15px;font-weight:800;font-family:ui-monospace,monospace;letter-spacing:1px;color:var(--text)">'+esc(guia)+'</div>':'')
      +(codigo?'<div style="font-size:11px;color:var(--text2);margin-top:1px">C\u00f3digo: <b style="color:var(--text);font-family:ui-monospace,monospace">'+esc(codigo)+'</b></div>':'')
      +'</div>'
      +((guia||codigo)?'<button type="button" onclick="_copyGuia(this)" data-guia="'+esc(guia)+'" data-codigo="'+esc(codigo)+'" style="font-size:11px;font-weight:700;color:var(--blue);background:none;border:none;cursor:pointer;font-family:inherit;flex-shrink:0">Copiar</button>':'')
      +'</div>';
  }

  return '<div style="background:rgba(167,139,250,.06);border:1px solid rgba(167,139,250,.22);border-radius:14px;padding:14px;margin-bottom:18px">'
    +'<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px">'
    +'<div style="font-size:11px;font-weight:800;color:var(--purple);letter-spacing:.6px">\ud83d\ude9a SEGUIMIENTO SHALOM</div>'
    +(ago?'<div style="font-size:10px;color:var(--text2);white-space:nowrap">'+ago+'</div>':'')
    +'</div>'
    + heroHtml + stepHtml + guiaHtml
    +'</div>';
}

function _datosNarrador(ship){
  const esShalom = !!(ship && /SHALOM/i.test(String(ship.courier||'')));
  const tipo = _tipoEnvioDe(ship && ship.courier);
  let shalomSt = null, shalomFase = null;
  if(esShalom){
    const f = _shalomFase((ship.trackingStatus||'').trim());
    if(f.idx >= 0 && (ship.trackingStatus||'').trim()){ shalomSt = [2,2,3,4][f.idx]; shalomFase = f.idx; }
  }
  const enShalom = esShalom && !!(ship && (ship.shalomGuia || ship.trackingOrderNumber));
  const cc = (CFG && (CFG.config || CFG)) || {};
  const tiendaDir = tipo==='retiro' ? String(cc.city||'').trim() : '';
  return {tipo, esShalom, enShalom, shalomSt, shalomFase, tiendaDir};
}

function _confianzaShalom(){
  return '<div class="seg-confianza">'
    + '<span class="seg-conf-ic" aria-hidden="true">✓</span>'
    + '<span class="seg-conf-txt"><b>Envío oficial con Shalom Pro</b>'
    + '<span>Desde nuestra cuenta empresa. Compruébalo con tu guía y código.</span></span>'
    + '<a href="https://shalom.com.pe/" target="_blank" rel="noopener" aria-label="Verificar en shalom.com.pe">Verificar ↗</a>'
    + '</div>';
}

function _pasosHtml(vista){
  if(vista.paso < 0) return '';
  return '<ol class="seg-pasos">' + vista.pasos.map(function(p, i){
    var fin = vista.paso === vista.pasos.length - 1;
    var cls = (i < vista.paso || fin) ? 'hecho' : (i === vista.paso ? 'ahora' : '');
    return '<li class="' + cls + '"' + (i === vista.paso ? ' aria-current="step"' : '') + '>'
      + '<span class="seg-punto">' + ((i < vista.paso || fin) ? '✓' : (i + 1)) + '</span>'
      + '<span class="seg-paso-t">' + esc(p) + '</span></li>';
  }).join('') + '</ol>';
}

function _segMostrar(cual){
  document.querySelectorAll('.seg-vista').forEach(function(el){ el.hidden = el.getAttribute('data-vista') !== cual; });
  document.querySelectorAll('.seg-nav button[data-ir]').forEach(function(b){
    var on = b.getAttribute('data-ir') === cual;
    b.classList.toggle('on', on);
    if(on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  window._segVista = cual;
}

function _segVer(cual){
  _segMostrar(cual);
  try{ window.scrollTo({top: 0, behavior: 'smooth'}); }catch(_){ window.scrollTo(0, 0); }
}

var _SEG_DOCS = [
  ['boleta', '🧾', 'Boleta / factura', 'Tu comprobante de pago'],
  ['paquete', '📦', 'Foto del paquete', 'Así salió tu pedido de la tienda'],
  ['guia', '🚚', 'Guía de envío', 'Tu ticket de la agencia']
];
var _segDocCache = {};
var _segDocsDe = {};

function _docsListos(docs){
  return _SEG_DOCS.filter(function(d){ return docs && docs[d[0]]; }).length;
}

function _docsHtml(docs, minimo){
  if(minimo) return '<div class="seg-vacio">🔒 Por tu privacidad, los documentos de un pedido entregado hace tiempo ya no se muestran. Si los necesitas, escríbenos.</div>';
  return _SEG_DOCS.map(function(d){
    var hay = docs && docs[d[0]];
    if(!hay) return '<div class="seg-doc no"><span class="seg-doc-ic">' + d[1] + '</span><span class="seg-doc-t">' + d[2] + '<small>Aún no disponible</small></span></div>';
    return '<button type="button" class="seg-doc" onclick="abrirDocSeg(\'' + d[0] + '\')"><span class="seg-doc-ic">' + d[1] + '</span>'
      + '<span class="seg-doc-t">' + d[2] + '<small>' + (hay === 'link' ? 'Toca para abrir tu comprobante' : d[3] + ' · toca para ver') + '</small></span>'
      + '<span class="seg-doc-ir">→</span></button>';
  }).join('') + '<div class="seg-doc-msg" id="segDocMsg" role="status"></div>';
}

function _docMsg(t){ var m = $('segDocMsg'); if(m) m.textContent = t || ''; }

function _verDoc(cual, url, mime, nombre){
  var ov = document.getElementById('segVisor');
  if(!ov){ ov = document.createElement('div'); ov.id = 'segVisor'; ov.className = 'seg-visor'; document.body.appendChild(ov); }
  var esPdf = mime === 'application/pdf';
  ov.innerHTML = '<div class="seg-visor-caja" role="dialog" aria-modal="true" aria-label="' + esc(nombre) + '">'
    + (esPdf ? '<div class="seg-visor-pdf">📄<b>' + esc(nombre) + '</b><span>Documento PDF listo</span></div>'
             : '<img src="' + url + '" alt="' + esc(nombre) + '">')
    + '<div class="seg-visor-btns">'
    + (esPdf ? '<a class="seg-visor-si" href="' + url + '" target="_blank" rel="noopener">Abrir</a>' : '')
    + '<a class="seg-visor-si" href="' + url + '" download="' + esc(nombre) + '">⬇ Descargar</a>'
    + '<button type="button" class="seg-visor-no" onclick="cerrarDocSeg()">Cerrar</button></div></div>';
  ov.onclick = function(e){ if(e.target === ov) cerrarDocSeg(); };
  ov.style.display = 'flex';
}

function cerrarDocSeg(){
  var ov = document.getElementById('segVisor');
  if(ov){ ov.style.display = 'none'; ov.innerHTML = ''; }
}

async function abrirDocSeg(cual){
  var docs = _segDocsDe || {};
  if(docs[cual] === 'link' && docs.link){ window.open(docs.link, '_blank', 'noopener'); return; }
  if(docs[cual] !== 'archivo' || !window._segTok) return;
  var c = _segDocCache[cual];
  if(c){ _verDoc(cual, c.url, c.mime, c.nombre); return; }
  _docMsg('⏳ Cargando tu documento…');
  try{
    var r = await fetch(FORM_API + '?action=doc&tipo=' + encodeURIComponent(cual) + '&token=' + encodeURIComponent(window._segTok));
    if(r.status === 429){ _docMsg('⏳ Muchas consultas seguidas. Espera un minuto e intenta de nuevo.'); return; }
    if(!r.ok){ _docMsg('Este documento ya no está disponible. Escríbenos y te lo enviamos.'); return; }
    var mime = (r.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
    if(!/^(image\/(png|jpe?g|webp|gif|heic|heif)|application\/pdf)$/.test(mime)){ _docMsg('No pudimos abrir este documento. Escríbenos.'); return; }
    var disp = r.headers.get('Content-Disposition') || '';
    var nombre = (/filename="([A-Za-z0-9._-]{1,60})"/.exec(disp) || [])[1] || (cual + (mime === 'application/pdf' ? '.pdf' : '.jpg'));
    var url = URL.createObjectURL(await r.blob());
    _segDocCache[cual] = {url: url, mime: mime, nombre: nombre};
    _docMsg('');
    _verDoc(cual, url, mime, nombre);
  }catch(e){
    _docMsg('Sin conexión. Revisa tu internet e intenta de nuevo.');
  }
}

var _segInstalar = null;

function _esperarInstalar(){
  window.addEventListener('beforeinstallprompt', function(e){
    e.preventDefault();
    _segInstalar = e;
  });
}

function _soles(n){
  var v = Number(n) || 0;
  return 'S/ ' + (Number.isInteger(v) ? String(v) : v.toFixed(2));
}

function _fechaCorta(iso){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return '';
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-PE', {day: 'numeric', month: 'short'});
}

function _nautiHtml(vit, bizPhone){
  if(!vit || (!(vit.promos || []).length && !vit.sorteo)) return '';
  var promos = (vit.promos || []).filter(function(p){ return p && /^https:\/\/firebasestorage\.googleapis\.com\//.test(String(p.img || '')) && p.titulo; });
  var dice = promos.length
    ? (vit.sorteo ? 'Con mis tentáculos jalé las promos de hoy y un sorteo para ti.' : 'Con mis tentáculos jalé las promos de hoy para ti.')
    : 'Con mis tentáculos jalé un sorteo para ti.';
  var tarjetas = promos.map(function(p, i){
    var msg = 'Hola, vi la promo «' + p.titulo + '»' + (p.precio ? ' a ' + _soles(p.precio) : '') + ' en mi seguimiento. ¿Está disponible?';
    var wa = bizPhone ? 'https://wa.me/51' + bizPhone + '?text=' + encodeURIComponent(msg) : '';
    return '<article class="seg-promo" style="--i:' + i + '">'
      + '<img src="' + esc(p.img) + '" alt="' + esc(p.titulo) + '" width="160" height="160" loading="lazy" decoding="async">'
      + '<div class="seg-promo-t">' + esc(p.titulo) + '</div>'
      + (p.precio ? '<div class="seg-promo-p">' + (p.antes ? '<s>' + esc(_soles(p.antes)) + '</s> ' : '') + '<b>' + esc(_soles(p.precio)) + '</b></div>' : '')
      + (wa ? '<a class="seg-promo-wa" href="' + esc(wa) + '" target="_blank" rel="noopener">Lo quiero</a>' : '')
      + '</article>';
  }).join('');
  var s = vit.sorteo;
  var sorteo = (s && /^https:\/\//i.test(String(s.link || '')) && s.titulo)
    ? '<a class="seg-sorteo" href="' + esc(s.link) + '" target="_blank" rel="noopener noreferrer">'
      + '<span class="seg-sorteo-ic" aria-hidden="true">🎉</span>'
      + '<span class="seg-sorteo-t"><b>' + esc(s.titulo) + '</b>' + (s.texto ? '<small>' + esc(s.texto) + '</small>' : '')
      + (_fechaCorta(s.hasta) ? '<small class="seg-sorteo-h">Hasta el ' + esc(_fechaCorta(s.hasta)) + '</small>' : '') + '</span>'
      + '<span class="seg-sorteo-ir">Participar →</span></a>'
    : '';
  return '<section class="seg-nauti" aria-label="Promos y sorteos">'
    + '<div class="seg-nauti-cab"><img class="seg-nauti-av" src="narrador/load-nauti.webp?v=3" alt="" width="56" height="56" decoding="async">'
    + '<div class="seg-nauti-bub"><span class="seg-nauti-quien">Nauti · Cazador de ofertas</span>' + esc(dice) + '</div></div>'
    + (tarjetas ? '<div class="seg-promos">' + tarjetas + '</div>' : '')
    + sorteo
    + '</section>';
}

function _esApp(){
  try{ return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; }catch(e){ return false; }
}

function _instalarHtml(){
  if(_esApp()) return '';
  return '<div class="seg-instalar" id="segInstalarBox">'
    + '<span class="seg-instalar-ic" aria-hidden="true">📲</span>'
    + '<span class="seg-instalar-t"><b>Guarda tu pedido en tu celular</b><small>Ábrelo con un toque, sin buscar el link.</small></span>'
    + '<button type="button" onclick="instalarSeg()">Guardar</button></div>';
}

async function instalarSeg(){
  if(_segInstalar){
    _segInstalar.prompt();
    try{ await _segInstalar.userChoice; }catch(e){}
    _segInstalar = null;
    return;
  }
  var ios = /iphone|ipad|ipod/i.test(navigator.userAgent || '');
  var ov = _ayudaHoja();
  ov.innerHTML = '<div class="ay-sheet">'
    + _toby(ios ? 'En iPhone: toca <b>Compartir</b> (el cuadrado con la flecha) y luego <b>Agregar a inicio</b>.'
                : 'Toca el menú <b>⋮</b> de tu navegador y luego <b>Agregar a la pantalla principal</b> o <b>Instalar app</b>.', 'Guardar en tu celular')
    + '<div class="ay-btns"><button class="ay-x" onclick="cerrarAyudaForm()">Entendido</button></div></div>';
  ov.style.display = 'flex';
  document.body.classList.add('tt-ayuda-on');
}

var _segRes = {n: 0, chips: [], texto: ''};
var _SEG_CHIPS = {
  bien: ['Llegó rápido', 'Bien empacado', 'Buena atención', 'Buen precio', 'Producto original'],
  mal: ['Demoró', 'Llegó dañado', 'Faltó algo', 'No era lo que pedí', 'Mala atención']
};
var _SEG_CARITA = ['Toca una estrella', 'Muy mal', 'Mal', 'Regular', 'Bien', '¡Excelente!'];

function _tobyMini(texto){
  return '<div class="seg-nauti-cab"><img class="seg-nauti-av" src="narrador/toby.webp?v=1" alt="" width="56" height="56" decoding="async">'
    + '<div class="seg-nauti-bub"><span class="seg-nauti-quien">Toby · Tu asistente</span>' + texto + '</div></div>';
}

function _resenaTexto(){
  var t = _segRes.chips.join(' · ');
  if(_segRes.texto) t = t ? t + ' — ' + _segRes.texto : _segRes.texto;
  return t.slice(0, 500);
}

function _resenaCuerpo(){
  var n = _segRes.n;
  var est = [1, 2, 3, 4, 5].map(function(i){
    return '<button type="button" role="radio" aria-checked="' + (i === n) + '" aria-label="' + i + (i === 1 ? ' estrella' : ' estrellas') + '"'
      + ' class="seg-estrella' + (i <= n ? ' on' : '') + '" onclick="resenaEstrella(' + i + ')">★</button>';
  }).join('');
  var lista = n >= 4 ? _SEG_CHIPS.bien : _SEG_CHIPS.mal;
  var resto = n ? '<div class="seg-chips">' + lista.map(function(c, i){
      return '<button type="button" class="seg-chip" aria-pressed="' + (_segRes.chips.indexOf(c) >= 0) + '" onclick="resenaChip(' + i + ')">' + esc(c) + '</button>';
    }).join('') + '</div>'
    + '<textarea class="seg-resena-txt" maxlength="400" rows="3" oninput="resenaTexto(this.value)" placeholder="'
    + (n >= 4 ? '¿Qué fue lo que más te gustó? (opcional)' : 'Cuéntanos qué pasó y lo solucionamos (opcional)') + '">' + esc(_segRes.texto) + '</textarea>'
    + '<button type="button" class="seg-resena-env" onclick="enviarResena(this)">Enviar mi opinión</button>'
    + '<div class="seg-resena-msg" id="segResMsg" role="status"></div>' : '';
  return _tobyMini('¿Qué tal tu compra? Tu opinión nos ayuda a mejorar y a que otros compren con confianza.')
    + '<div class="seg-estrellas" role="radiogroup" aria-label="Califica tu compra">' + est + '</div>'
    + '<div class="seg-carita">' + esc(_SEG_CARITA[n]) + '</div>' + resto;
}

function _resenaGracias(r){
  var n = r.estrellas;
  var g = window._segGoogle;
  var tel = window._segTel;
  var est = '<div class="seg-estrellas seg-hecha" aria-label="Calificaste con ' + n + ' de 5">'
    + [1, 2, 3, 4, 5].map(function(i){ return '<span class="seg-estrella' + (i <= n ? ' on' : '') + '">★</span>'; }).join('') + '</div>';
  var gBtn = g ? '<a class="seg-resena-g' + (n >= 4 ? '' : ' seg-sec') + '" href="' + esc(g) + '" target="_blank" rel="noopener noreferrer" onclick="resenaCopiar()">'
    + (n >= 4 ? '⭐ Publicarla en Google' : 'También puedes opinar en Google') + '</a>' : '';
  if(n >= 4){
    return _tobyMini('¡Gracias por tu opinión! ¿Nos regalas 10 segundos más? En Google ayuda a otros clientes a comprar seguro.')
      + est + gBtn + (g && r.texto ? '<div class="seg-resena-nota">Copiamos tu opinión: solo pégala en Google.</div>' : '');
  }
  var msg = 'Hola, califiqué mi pedido #' + (window._segCodigo || '') + ' con ' + n + (n === 1 ? ' estrella' : ' estrellas') + (r.texto ? ': ' + r.texto : '') + '. ¿Me ayudan?';
  var wa = tel ? '<a class="btn-wa seg-wa" href="https://wa.me/51' + esc(tel) + '?text=' + esc(encodeURIComponent(msg)) + '" target="_blank" rel="noopener">💬 Quiero que lo solucionen</a>' : '';
  return _tobyMini('Gracias por contarnos. Sentimos que no fue lo que esperabas: escríbenos y lo solucionamos.')
    + est + wa + gBtn;
}

function _resenaHtml(ship){
  if(ship.resena){
    _segRes.enviado = String(ship.resena.texto || '');
    return '<section class="seg-resena" id="segResena" aria-label="Tu opinión">' + _resenaGracias(ship.resena) + '</section>';
  }
  if(!ship.resenaAbierta) return '';
  return '<section class="seg-resena" id="segResena" aria-label="Califica tu compra">' + _resenaCuerpo() + '</section>';
}

function _resenaPintar(){ var b = $('segResena'); if(b) b.innerHTML = _resenaCuerpo(); }

function resenaEstrella(n){
  var antes = _segRes.n;
  _segRes.n = n;
  if((antes >= 4) !== (n >= 4)) _segRes.chips = [];
  _resenaPintar();
}

function resenaChip(i){
  var c = (_segRes.n >= 4 ? _SEG_CHIPS.bien : _SEG_CHIPS.mal)[i];
  if(!c) return;
  var k = _segRes.chips.indexOf(c);
  if(k >= 0) _segRes.chips.splice(k, 1); else _segRes.chips.push(c);
  _resenaPintar();
}

function resenaTexto(v){ _segRes.texto = String(v || '').slice(0, 400); }

function resenaCopiar(){
  var t = _segRes.enviado || '';
  if(t && navigator.clipboard) navigator.clipboard.writeText(t).catch(function(){});
}

async function enviarResena(btn){
  var n = _segRes.n;
  if(!(n >= 1 && n <= 5) || !window._segTok) return;
  var msg = $('segResMsg');
  btn.disabled = true;
  btn.textContent = 'Enviando…';
  var texto = _resenaTexto();
  try{
    var r = await fetch(FORM_API + '?action=review', {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({token: window._segTok, estrellas: n, texto: texto})});
    var d = await r.json().catch(function(){ return {}; });
    if(d.status === 'ok' || d.status === 'ya'){
      if(/^https:\/\//.test(String(d.google || ''))) window._segGoogle = d.google;
      _segRes.enviado = texto;
      var b = $('segResena');
      if(b) b.innerHTML = _resenaGracias(d.status === 'ok' ? {estrellas: n, texto: texto} : {estrellas: n, texto: ''});
      return;
    }
    if(msg) msg.textContent = d.status === 'rate_limited' ? 'Espera un momento y vuelve a intentar.'
      : d.status === 'cerrada' ? 'Este pedido ya no se puede calificar.' : 'No se pudo enviar. Intenta de nuevo.';
  }catch(e){
    if(msg) msg.textContent = 'Sin conexión. Intenta de nuevo.';
  }
  btn.disabled = false;
  btn.textContent = 'Enviar mi opinión';
}

var _segGar = {tipo: '', producto: '', texto: '', fotos: [], abierto: false};

function _politicaHtml(){
  if(!window.Garantia) return '';
  return '<div class="seg-politica">' + Garantia.POLITICA.map(function(sec, i){
    return '<details' + (i === 0 ? ' open' : '') + '><summary>' + esc(sec.t) + '</summary><ul>'
      + sec.d.map(function(x){ return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></details>';
  }).join('') + '<p class="seg-politica-wa">¿Dudas? Escríbenos por WhatsApp y te ayudamos.</p></div>';
}

function _reclamoHtml(rc){
  var G = window.Garantia;
  var e = G.ESTADOS[rc.estado] || ['Recibimos tu solicitud', ''];
  var pasos = ['Recibido', 'En revisión', 'Respuesta'];
  var idx = rc.estado === 'RECIBIDO' ? 0 : rc.estado === 'EN REVISIÓN' ? 1 : 2;
  var tono = rc.estado === 'RECHAZADO' ? 'gris' : idx === 2 ? 'ok' : 'marca';
  return '<div class="seg-tarjeta seg-reclamo">'
    + '<span class="seg-pill seg-' + tono + '">' + esc(G.TIPOS[rc.tipo] || 'Solicitud') + '</span>'
    + '<h2 class="seg-titulo">' + esc(e[0]) + '</h2><p class="seg-sub">' + esc(e[1]) + '</p>'
    + '<ol class="seg-pasos">' + pasos.map(function(t, i){
        var hecho = i < idx || idx === 2;
        return '<li class="' + (hecho ? 'hecho' : i === idx ? 'ahora' : '') + '"' + (i === idx ? ' aria-current="step"' : '') + '>'
          + '<span class="seg-punto">' + (hecho ? '✓' : (i + 1)) + '</span><span class="seg-paso-t">' + esc(t) + '</span></li>';
      }).join('') + '</ol>'
    + (rc.respuesta ? '<div class="seg-reclamo-resp"><b>Respuesta de Total Tools</b>' + esc(rc.respuesta) + '</div>' : '')
    + (rc.fecha ? '<div class="seg-ultimo">🕐 Solicitud enviada el ' + esc(new Date(rc.fecha).toLocaleDateString('es-PE', {day: 'numeric', month: 'long'})) + '.</div>' : '')
    + '</div>';
}

function _garFormHtml(permitidos){
  var G = window.Garantia;
  var tipos = permitidos.map(function(t){
    return '<button type="button" class="seg-chip" aria-pressed="' + (_segGar.tipo === t) + '" onclick="garTipo(\'' + t + '\')">' + esc(G.TIPOS[t]) + '</button>';
  }).join('');
  var fotos = _segGar.fotos.map(function(f, i){
    return '<span class="seg-gar-foto"><img src="' + esc(f.url) + '" alt="Foto ' + (i + 1) + '"><button type="button" aria-label="Quitar foto" onclick="garQuitarFoto(' + i + ')">✕</button></span>';
  }).join('');
  return '<div class="seg-tarjeta seg-gar-form" id="segGarForm">'
    + _tobyMini('Tranquilo, estamos para ayudarte. Una foto clara del producto y del problema nos ayuda a resolverlo más rápido.')
    + '<div class="seg-gar-lbl">¿Qué necesitas?</div><div class="seg-chips seg-chips-izq">' + tipos + '</div>'
    + '<label class="seg-gar-lbl" for="garProd">¿Qué producto?</label>'
    + '<input id="garProd" class="seg-resena-txt" maxlength="80" placeholder="Ej. Taladro inalámbrico 20V" value="' + esc(_segGar.producto) + '" oninput="garCampo(\'producto\',this.value)">'
    + '<label class="seg-gar-lbl" for="garTxt">Cuéntanos qué pasó</label>'
    + '<textarea id="garTxt" class="seg-resena-txt" rows="3" maxlength="600" placeholder="Ej. No enciende desde el segundo día de uso" oninput="garCampo(\'texto\',this.value)">' + esc(_segGar.texto) + '</textarea>'
    + '<div class="seg-gar-lbl">Fotos (1 a ' + G.MAX_FOTOS + ')</div>'
    + '<div class="seg-gar-fotos">' + fotos
    + (_segGar.fotos.length < G.MAX_FOTOS ? '<label class="seg-gar-mas">📷<span>Agregar foto</span><input type="file" accept="image/*" hidden onchange="garFoto(this)"></label>' : '') + '</div>'
    + '<button type="button" class="seg-resena-env" onclick="enviarGarantia(this)">Enviar solicitud</button>'
    + '<div class="seg-resena-msg" id="segGarMsg" role="status"></div>'
    + '<div class="seg-resena-nota">🔒 Solo Total Tools ve tus fotos. Te respondemos por WhatsApp.</div>'
    + '</div>';
}

function _garantiaHtml(ship){
  var G = window.Garantia;
  if(!G) return '';
  var cab = '<div class="seg-tarjeta"><h2 class="seg-h2">Garantía y cambios</h2>';
  if(ship.reclamo) return _reclamoHtml(ship.reclamo) + cab + _politicaHtml() + '</div>';
  var permitidos = (Array.isArray(ship.garantia) ? ship.garantia : []).filter(function(t){ return G.TIPOS[t]; });
  var intro;
  if(permitidos.length){
    var d = G.dias(ship, Date.now());
    var quedan = G.DIAS_CAMBIO - d;
    intro = '<div class="seg-gar-ok">🛡️ <span><b>Tu compra está protegida</b><small>'
      + (permitidos.indexOf('cambio') >= 0 ? 'Te ' + (quedan === 1 ? 'queda 1 día' : 'quedan ' + quedan + ' días') + ' para cambio o devolución.' : 'Tu producto tiene garantía por falla de fabricación.')
      + '</small></span></div>'
      + (_segGar.abierto ? '' : '<button type="button" class="seg-resena-env" onclick="garAbrir()">Solicitar cambio o garantía</button>');
  }else{
    intro = '<p class="seg-sub">' + (G.FINALES.indexOf(String(ship.status || '').trim().toUpperCase()) >= 0
      ? 'El plazo para solicitudes en línea de este pedido terminó. Escríbenos por WhatsApp y lo vemos.'
      : 'Cuando recibas tu pedido, aquí podrás pedir un cambio o la garantía en un minuto.') + '</p>';
  }
  return cab + intro + '</div>' + (permitidos.length && _segGar.abierto ? _garFormHtml(permitidos) : '')
    + '<div class="seg-tarjeta"><h2 class="seg-h2">Nuestras políticas</h2>' + _politicaHtml() + '</div>';
}

function _garPintar(){
  var b = $('segGarantia');
  if(b && window._segUltimoPedido) b.innerHTML = _garantiaHtml(window._segUltimoPedido);
}

function garAbrir(){ _segGar.abierto = true; _garPintar(); var f = $('segGarForm'); if(f && f.scrollIntoView) f.scrollIntoView({behavior: 'smooth', block: 'start'}); }
function garTipo(t){ if(window.Garantia && Garantia.TIPOS[t]){ _segGar.tipo = t; _garPintar(); } }
function garCampo(k, v){ if(k === 'producto' || k === 'texto') _segGar[k] = String(v || ''); }
function garQuitarFoto(i){
  var f = _segGar.fotos.splice(i, 1)[0];
  if(f && f.url) try{ URL.revokeObjectURL(f.url); }catch(e){}
  _garPintar();
}

function _garComprimir(file){
  return new Promise(function(ok, mal){
    var url = URL.createObjectURL(file);
    var im = new Image();
    im.onload = function(){
      var k = Math.min(1, 1280 / Math.max(im.naturalWidth, im.naturalHeight));
      var c = document.createElement('canvas');
      c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(function(b){ b ? ok(b) : mal(new Error('foto')); }, 'image/jpeg', 0.8);
    };
    im.onerror = function(){ URL.revokeObjectURL(url); mal(new Error('foto')); };
    im.src = url;
  });
}

function _aBase64(blob){
  return new Promise(function(ok, mal){
    var r = new FileReader();
    r.onload = function(){ ok(String(r.result).split(',')[1] || ''); };
    r.onerror = mal;
    r.readAsDataURL(blob);
  });
}

async function garFoto(input){
  var f = input && input.files && input.files[0];
  if(input) input.value = '';
  var msg = $('segGarMsg');
  if(!f || !window.Garantia || _segGar.fotos.length >= Garantia.MAX_FOTOS) return;
  if(!/^image\//.test(f.type)){ if(msg) msg.textContent = 'Elige una foto.'; return; }
  try{
    var b = await _garComprimir(f);
    if(b.size > Garantia.MAX_FOTO_BYTES){ if(msg) msg.textContent = 'La foto es muy pesada. Prueba con otra.'; return; }
    _segGar.fotos.push({blob: b, url: URL.createObjectURL(b)});
    _garPintar();
  }catch(e){
    if(msg) msg.textContent = 'No pudimos leer esa foto. Prueba con otra.';
  }
}

async function enviarGarantia(btn){
  var msg = $('segGarMsg');
  var falta = !_segGar.tipo ? 'Elige qué necesitas.'
    : _segGar.producto.trim().length < 2 ? 'Escribe qué producto es.'
    : _segGar.texto.trim().length < 10 ? 'Cuéntanos un poco más qué pasó.'
    : !_segGar.fotos.length ? 'Agrega al menos una foto.' : '';
  if(falta){ if(msg) msg.textContent = falta; return; }
  btn.disabled = true;
  btn.textContent = 'Enviando…';
  try{
    var fotos = await Promise.all(_segGar.fotos.map(function(f){ return _aBase64(f.blob); }));
    var r = await fetch(FORM_API + '?action=claim', {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({token: window._segTok, tipo: _segGar.tipo, producto: _segGar.producto, texto: _segGar.texto, fotos: fotos})});
    var d = await r.json().catch(function(){ return {}; });
    if(d.status === 'ok' || d.status === 'ya'){
      _segGar.fotos.forEach(function(f){ try{ URL.revokeObjectURL(f.url); }catch(e){} });
      var tipo = _segGar.tipo;
      _segGar = {tipo: '', producto: '', texto: '', fotos: [], abierto: false};
      if(window._segUltimoPedido && d.status === 'ok'){
        window._segUltimoPedido.reclamo = {estado: 'RECIBIDO', tipo: tipo, fecha: new Date().toISOString()};
      }
      if(d.status === 'ya' && window._segTok){ buscarPedido(window._segTok, true); return; }
      _garPintar();
      try{ window.scrollTo({top: 0, behavior: 'smooth'}); }catch(e){}
      return;
    }
    if(msg) msg.textContent = d.status === 'rate_limited' ? 'Espera un momento y vuelve a intentar.'
      : d.status === 'cerrada' ? 'El plazo para esta solicitud terminó. Escríbenos por WhatsApp.'
      : (d.error || 'No se pudo enviar. Intenta de nuevo.');
  }catch(e){
    if(msg) msg.textContent = 'Sin conexión. Intenta de nuevo.';
  }
  btn.disabled = false;
  btn.textContent = 'Enviar solicitud';
}

function _segNavHtml(){
  return '<nav class="seg-nav" aria-label="Secciones">'
    + '<button type="button" data-ir="inicio" onclick="_segVer(\'inicio\')">🏠<span>Inicio</span></button>'
    + '<button type="button" data-ir="docs" onclick="_segVer(\'docs\')">📄<span>Documentos</span></button>'
    + '<button type="button" data-ir="garantia" onclick="_segVer(\'garantia\')">🛡️<span>Garantía</span></button>'
    + '<button type="button" onclick="abrirAyudaTrack()">❓<span>Ayuda</span></button>'
    + '</nav>';
}

function renderTrackResult(ship, code){
  const _dniTk    = window.DniPedido ? DniPedido.de(ship)
    : String(ship.dni||ship.dniRecoger||ship.dniDestinatario||'').trim();
  const _dniTkLbl = window.DniPedido ? DniPedido.etiqueta(ship) : 'DNI';
  const _nroTk = String(ship.nroComprobante||'').replace(/[^A-Z0-9-]/g,'').slice(0,20);
  const tc     = _nroTk || codigoSeg(ship.id, ship.createdAt);

  const shalomBlock = _shalomTrackingBlock(ship);
  const narr = _datosNarrador(ship);
  window._trackTipo = narr.tipo;
  window._trackEsShalom = narr.esShalom;
  window._trackEstado = ship.status||'';
  window._trackNombre = ship.name||'';
  const _enShalom = narr.esShalom && !!(ship.shalomGuia || ship.trackingOrderNumber);
  window._trackShalom = _enShalom ? {estado: String(ship.trackingStatus||'').trim()} : null;

  const vista = PasosEnvio.vista(ship, narr.tipo, {esShalom: narr.esShalom,
    idx: narr.shalomFase === null ? -1 : narr.shalomFase, registrado: _enShalom});
  const primera = !document.body.classList.contains('seg-quieto');
  const hola = _holaNombre(ship.name).trim();

  const dateLabel = ship.date
    ? new Date(ship.date+'T12:00:00').toLocaleDateString('es-PE',{weekday:'short',year:'numeric',month:'short',day:'numeric'})
    : '—';

  const extraRows = Object.entries(ship.extra||{})
    .filter(([,v])=>v)
    .map(([k,v])=>`<div class="tk-row"><span class="tk-row-lbl">${esc(k)}</span><span class="tk-row-val">${esc(v)}</span></div>`)
    .join('');

  const bizPhone = ((CFG&&(CFG.config&&CFG.config.phone||CFG.phone))||'').replace(/\D/g,'');
  const waConsultUrl = bizPhone
    ? `https://wa.me/51${bizPhone}?text=${encodeURIComponent('Hola, tengo una consulta sobre mi pedido #'+tc)}`
    : '';
  _segDocsDe = ship.docs || {};
  window._segUltimoPedido = ship;
  window._segTel = bizPhone;
  window._segCodigo = tc;
  const listos = _docsListos(ship.docs);
  const docsHtml = _docsHtml(ship.docs, !!ship.minimo);

  setTrackContent(`
    <div class="seg-hola">
      <h1>${hola || '¡Hola!'} <span aria-hidden="true">👋</span></h1>
      <p>Todo sobre tu compra, en un solo lugar.</p>
    </div>
    <section class="seg-vista" data-vista="inicio">
    <div class="track-card${vista.modo === 'shalom' ? ' seg-solo-shalom' : ''}" data-tipo="${esc(narr.tipo)}"${narr.enShalom?' data-en-shalom="1"':''}${narr.shalomFase!==null?` data-shalom-fase="${narr.shalomFase}"`:''}${narr.shalomSt!==null?` data-shalom-st="${narr.shalomSt}"`:''}${narr.tiendaDir?` data-tienda-dir="${esc(narr.tiendaDir)}"`:''}>
      <div class="seg-cab">
        <span class="tk-lbl">${vista.modo === 'shalom' ? 'Seguimiento de envío' : 'Seguimiento de pedido'}</span>
        <button type="button" class="seg-codigo" onclick="_copyTrack(this.getAttribute('data-c'), this)" data-c="${esc(tc)}" title="${_nroTk ? 'Factura / Boleta' : 'Código de seguimiento'}">${_nroTk ? '' : '#'}${esc(tc)}</button>
      </div>
      ${vista.modo === 'shalom' ? '' : `
      <span class="seg-pill seg-${vista.tono}">${esc(vista.pill)}</span>
      <h2 class="seg-titulo">${esc(vista.titulo)}</h2>
      <p class="seg-sub">${esc(vista.sub)}</p>`}
      ${vista.aviso?`<div class="seg-aviso" role="status">💰 ${esc(vista.aviso)}</div>`:''}
      ${vista.modo === 'shalom' ? `<div class="seg-shalom">${shalomBlock}</div>${_confianzaShalom()}` : _pasosHtml(vista)}
      ${vista.modo !== 'shalom' && vista.ultimo?`<div class="seg-ultimo">🕐 Último avance: ${esc(vista.ultimo)}.</div>`:''}
    </div>
    ${_resenaHtml(ship)}
    <div class="seg-tarjeta">
      <div class="tk-section">
        <div class="tk-lbl">Detalle</div>
        <div class="tk-row"><span class="tk-row-lbl">Cliente</span><span class="tk-row-val">${esc(ship.name||'—')}</span></div>
        <div class="tk-row"><span class="tk-row-lbl">Courier</span><span class="tk-row-val">${esc(ship.courier||'—')}</span></div>
        <div class="tk-row"><span class="tk-row-lbl">Fecha</span><span class="tk-row-val">${dateLabel}</span></div>
        ${ship.address?`<div class="tk-row"><span class="tk-row-lbl">Dirección</span><span class="tk-row-val">${esc(ship.address)}</span></div>`:''}
        ${ship.referencia?`<div class="tk-row"><span class="tk-row-lbl">Referencia</span><span class="tk-row-val">${esc(ship.referencia)}</span></div>`:''}
        ${ship.ciudadDestino?`<div class="tk-row"><span class="tk-row-lbl">Ciudad destino</span><span class="tk-row-val">${esc(ship.ciudadDestino)}</span></div>`:''}
        ${ship.encAgencia?`<div class="tk-row"><span class="tk-row-lbl">Agencia</span><span class="tk-row-val">${esc(ship.encAgencia)}</span></div>`:''}
        ${_dniTk?`<div class="tk-row"><span class="tk-row-lbl">${_dniTkLbl}</span><span class="tk-row-val">${esc(_dniTk)}</span></div>`:''}
        ${ship.notes?`<div class="tk-row"><span class="tk-row-lbl">Notas</span><span class="tk-row-val">${esc(ship.notes)}</span></div>`:''}
        ${extraRows}
        <div class="seg-privado">🔒 Enlace privado: solo tú lo tienes. Por tu seguridad, tu DNI se muestra oculto.</div>
        ${ship.minimo?`<div class="tk-row"><span class="tk-row-val" style="color:var(--text2);font-size:12px">🔒 Por tu privacidad, los datos de un pedido entregado hace tiempo ya no se muestran aquí. Si necesitas algo, escríbenos.</span></div>`:''}
      </div>
    </div>
    ${listos?`<button type="button" class="seg-docs-atajo" onclick="_segVer('docs')"><span><b>📄 Tus ${listos === 1 ? 'documento' : listos + ' documentos'}</b><small>Boleta, foto del paquete y guía, siempre a la mano</small></span><span class="seg-tienda-ir">Ver →</span></button>`:''}
    ${_nautiHtml(window._segVitrina, bizPhone)}
    ${waConsultUrl?`<a class="btn-wa seg-wa" href="${waConsultUrl}" target="_blank" rel="noopener">💬 Consultar por WhatsApp</a>`:''}
    <a class="seg-tienda" href="https://www.totaltoolspe.com/" target="_blank" rel="noopener">
      <span><b>🛍️ ¿Quieres ver más productos y ofertas?</b><small>Visita nuestra tienda online</small></span>
      <span class="seg-tienda-ir">Ver tienda →</span>
    </a>
    </section>
    <section class="seg-vista" data-vista="docs" hidden>
      <div class="seg-tarjeta">
        <h2 class="seg-h2">Tus documentos</h2>
        <p class="seg-sub">Siempre a la mano cuando los necesites.</p>
        ${docsHtml}
      </div>
    </section>
    <section class="seg-vista" data-vista="garantia" id="segGarantia" hidden>${_garantiaHtml(ship)}</section>
    ${_instalarHtml()}
    <div class="refresh-row" id="refreshRow"><span class="refresh-lbl">🔄 Se actualiza automáticamente</span></div>
    ${_segNavHtml()}
  `);
  _segMostrar(window._segVista === 'docs' || window._segVista === 'garantia' ? window._segVista : 'inicio');
  if(primera) setTimeout(function(){ document.body.classList.add('seg-quieto'); }, 1600);
}

const SEG_GUARDADO = 'tt_seg';

function init(){
  _esperarInstalar();
  const segTok = new URLSearchParams(location.search).get('seg');
  if(segTok){
    if(/^[A-Za-z0-9_-]{2,64}$/.test(segTok)){ try{ localStorage.setItem(SEG_GUARDADO, segTok); }catch(e){} }
    loadCfgThenTrack(segTok);
    return;
  }
  let guardado = '';
  try{ guardado = localStorage.getItem(SEG_GUARDADO) || ''; }catch(e){}
  if(/^[A-Za-z0-9_-]{2,64}$/.test(guardado)){ loadCfgThenTrack(guardado); return; }
  location.replace('formulario.html' + location.hash);
}

window.buscarPedido    = buscarPedido;
window.abrirAyudaTrack = abrirAyudaTrack;
window._copyGuia       = _copyGuia;
window._copyTrack      = _copyTrack;
window._segVer         = _segVer;
window.abrirDocSeg     = abrirDocSeg;
window.instalarSeg     = instalarSeg;
window.resenaEstrella  = resenaEstrella;
window.resenaChip      = resenaChip;
window.resenaTexto     = resenaTexto;
window.resenaCopiar    = resenaCopiar;
window.enviarResena    = enviarResena;
window.garAbrir        = garAbrir;
window.garTipo         = garTipo;
window.garCampo        = garCampo;
window.garFoto         = garFoto;
window.garQuitarFoto   = garQuitarFoto;
window.enviarGarantia  = enviarGarantia;
window.cerrarDocSeg    = cerrarDocSeg;
window.cerrarAyudaForm = cerrarAyudaForm;

init();

})();
