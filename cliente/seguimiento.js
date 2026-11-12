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
      (_waHref?`<div style="text-align:center;margin-top:20px"><a href="${_waHref}" target="_blank" rel="noopener" style="display:inline-block;background:#25D366;color:#fff;padding:14px 24px;border-radius:12px;text-decoration:none;font-weight:700;font-size:15px">💬 Consultar por WhatsApp</a></div>`:'')
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

function renderTrackResult(ship, code){
  const _dniTk    = window.DniPedido ? DniPedido.de(ship)
    : String(ship.dni||ship.dniRecoger||ship.dniDestinatario||'').trim();
  const _dniTkLbl = window.DniPedido ? DniPedido.etiqueta(ship) : 'DNI';
  const meta   = STATUS_META[ship.status]||{color:'#6b7280',emoji:'🏷️',step:0};
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

  setTrackContent(`
    <div id="refreshRow" class="refresh-row">
      <span class="refresh-lbl">🔄 Se actualiza automáticamente</span>
    </div>
    <div class="track-card" data-tipo="${esc(narr.tipo)}"${narr.enShalom?' data-en-shalom="1"':''}${narr.shalomFase!==null?` data-shalom-fase="${narr.shalomFase}"`:''}${narr.shalomSt!==null?` data-shalom-st="${narr.shalomSt}"`:''}${narr.tiendaDir?` data-tienda-dir="${esc(narr.tiendaDir)}"`:''}>
      <div class="tk-section">
        <div class="tk-lbl">${_nroTk ? 'Factura / Boleta' : 'Código de seguimiento'}</div>
        <div style="font-size:22px;font-weight:700;color:var(--purple);letter-spacing:${_nroTk ? '1px' : '3px'};word-break:break-all">${_nroTk ? '' : '#'}${esc(tc)}</div>
      </div>
      ${_enShalom ? '' : `<div class="tk-section">
        <div class="tk-lbl">Estado actual</div>
        <div class="status-badge" style="background:${meta.color}22;border:1px solid ${meta.color}55;color:${meta.color}">
          ${meta.emoji} ${esc(ship.status||'Desconocido')}
        </div>
      </div>`}
      ${shalomBlock}
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
        ${ship.minimo?`<div class="tk-row"><span class="tk-row-val" style="color:var(--text2);font-size:12px">🔒 Por tu privacidad, los datos de un pedido entregado hace tiempo ya no se muestran aquí. Si necesitas algo, escríbenos.</span></div>`:''}
      </div>
      ${(ship.links&&ship.links.length)?`<div class="tk-section"><div class="tk-lbl">📄 Documentos adjuntos</div>${ship.links.map(l=>`<a href="${l.u}" target="_blank" rel="noopener" style="display:flex;align-items:center;justify-content:space-between;padding:13px 16px;background:var(--bg2);border:1px solid var(--bd);border-radius:10px;text-decoration:none;margin-bottom:6px"><span style="color:var(--blue);font-weight:600;font-size:14px">📄 Presiona para ver tu documento</span><span style="color:var(--text2);font-size:18px">→</span></a>`).join('')}</div>`:''}
    </div>
    ${waConsultUrl?`<div style="padding:4px 0 8px;text-align:center"><a href="${waConsultUrl}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:8px;padding:13px 28px;background:#25D366;border-radius:14px;color:#fff;font-weight:700;font-size:15px;text-decoration:none">💬 Consultar por WhatsApp</a></div>`:''}
    <a href="https://www.totaltoolspe.com/" target="_blank" rel="noopener" style="display:flex;align-items:center;justify-content:space-between;margin-top:12px;padding:14px 18px;background:linear-gradient(135deg,rgba(56,139,253,.12),rgba(163,113,247,.12));border:1px solid rgba(56,139,253,.25);border-radius:14px;text-decoration:none;gap:12px">
      <div>
        <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:3px">🛍️ ¿Quieres ver más productos y ofertas?</div>
        <div style="font-size:11px;color:var(--text2)">Visita nuestra tienda online</div>
      </div>
      <div style="font-size:13px;font-weight:700;color:var(--blue);white-space:nowrap">Ver tienda →</div>
    </a>
  `);
}

function init(){
  const segTok = new URLSearchParams(location.search).get('seg');
  if(segTok){ loadCfgThenTrack(segTok); return; }
  location.replace('formulario.html' + location.hash);
}

window.buscarPedido    = buscarPedido;
window.abrirAyudaTrack = abrirAyudaTrack;
window._copyGuia       = _copyGuia;
window.cerrarAyudaForm = cerrarAyudaForm;

init();

})();
