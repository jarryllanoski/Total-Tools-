function regenClaveRecojo(){
  const el = $('fShalomClave'); if(!el) return;
  const _g = ($('fShalomGuia')||{value:''}).value.trim();
  if(_g || (window.RegistroShalom &&
      RegistroShalom.estaRegistrado({shalomGuia:_g}))){
    toast('🔒 Ya está registrado en Shalom con la clave '+el.value+
      ' — cambiarla aquí le daría al cliente un número que no abre nada.');
    return;
  }
  if(!window.Shalom || typeof Shalom.claveRecojo !== 'function') return;
  el.value = Shalom.claveRecojo();
  toast('🔑 Clave nueva: '+el.value);
}

function _congelarSiRegistrado(s){
  const reg = window.RegistroShalom ?
    RegistroShalom.estaRegistrado(s||{}) : !!(s&&s.shalomGuia);
  const cl = $('fShalomClave');
  if(cl){
    cl.readOnly = reg;
    cl.style.opacity = reg ? '.65' : '';
    cl.title = reg ? 'Ya registrado en Shalom: esta clave no se cambia' : '';
  }
  const btn = $('btnRegenClave');
  if(btn) btn.style.display = reg ? 'none' : '';
  const ag = $('fAddr');
  if(ag && reg){
    ag.title = 'Ya registrado en Shalom: la agencia de destino no se cambia';
  }
}

let _regTimer = null;

let _regAlGuardar = false;
let _regFormListo = false;
const _REG_CAMPOS = {status:'fStatus', pkgLargo:'fPkgLargo', pkgAncho:'fPkgAncho',
  pkgAlto:'fPkgAlto', pkgPeso:'fPkgPeso', pkgCaja:'fPkgCaja', shalomClave:'fShalomClave'};

function _regPrepararForm(){ _regAlGuardar = false; _regFormListo = true; _regBotonGuardar(); }
function _regBotonGuardar(){
  const b = $('btnGuardarEnvio'); if(!b) return;
  b.textContent = _regAlGuardar ? '💾 Guardar y registrar en Shalom' : '💾 Guardar envío';
}
function regAlGuardarToggle(){
  _regAlGuardar = !_regAlGuardar; _regBotonGuardar(); _pintarRegistroShalom();
}
function _regBorrador(ped){
  if(!_regFormListo || !ped) return ped;
  const b = Object.assign({}, ped);
  Object.keys(_REG_CAMPOS).forEach(k => {
    const e = $(_REG_CAMPOS[k]); if(e) b[k] = String(e.value || '').trim();
  });
  const g = ($('fShalomGuia')||{value:''}).value.trim();
  if(g) b.shalomGuia = g;
  const d = $('fDni'); if(d) b.dni = String(d.value||'').trim();
  const ph = $('fPhone'); if(ph) b.phone = String(ph.value||'').trim();
  const co = $('fCourier'); if(co && co.value) b.courier = co.value;
  if(window.Agencias && typeof _agVigente === 'function'){
    const ag = _agVigente();
    Object.assign(b, ag || window.Agencias.limpiar(ped));
  }
  const rn = (window.RegistroShalom && window._dniUltima) ?
    window.RegistroShalom.reniecDe(window._dniUltima, b.dni) : null;
  if(rn) b.reniec = rn;
  return b;
}
const _REG_DIFIERE = Object.keys(_REG_CAMPOS).concat(['shalomGuia', 'dni', 'phone',
  'courier', 'agenciaId', 'agenciaCourier']);
function _regDifiere(a, b){
  return _REG_DIFIERE.some(k => String(a[k]||'') !== String(b[k]||'')) ||
    JSON.stringify(a.reniec||null) !== JSON.stringify(b.reniec||null);
}

function _confirmarGuardarYRegistrar(){
  const R = window.RegistroShalom;
  const ped = _editId ? (S.shipments||[]).find(x=>x.id===_editId) : null;
  if(!R || !ped || !window.Shalom){ _regAlGuardar = false; _regBotonGuardar(); return saveShipment(true); }
  const bor = _regBorrador(ped);
  if(R.faltantes(bor, _regCfg()).length){
    _regAlGuardar = false; _regBotonGuardar(); _pintarRegistroShalom();
    toast('⚠️ Falta algo para registrar — mira la lista'); return;
  }
  const sim = _regEsSimulacro();
  const org = (_regCfg().agenciaOrigen) || {};
  confirmar({
    html: '<div style="text-align:left;line-height:1.65;font-size:13px">'+
      (sim ? '<b style="color:var(--blue)">🧪 Simulacro.</b> Se guarda y se prueba el registro: no se crea nada y no cuesta.'
           : '<b style="color:#f59e0b">⚠️ Se guarda y se crea un envío real en Shalom, que se cobra.</b>'+
             '<br><span style="font-size:12px;color:var(--text2)">Shalom no anula envíos: una vez creado, no se deshace.</span>')+
      '<div style="margin-top:9px;font-size:12.5px;color:var(--text2)">'+
      '<b style="color:var(--text)">'+escH(bor.name||'')+'</b><br>'+
      escH(R.contenidoDe(bor)||'—')+' · de '+escH(org.agenciaNombre||'origen')+
      ' a '+escH(bor.agenciaNombre||'destino')+'<br>Clave de recojo: <b style="color:var(--text)">'+
      escH(bor.shalomClave||'—')+'</b><br>Al registrarse pasa a <b style="color:var(--text)">ALISTADO</b>.</div></div>',
    textoSi: sim ? 'Guardar y probar' : 'Sí, guardar y registrar',
    colorSi: sim ? 'var(--blue)' : '#f59e0b',
    trabajando: 'Guardando…',
    alConfirmar: () => {
      const id = _editId;
      if(saveShipment(true) === 'ok') _registrarTrasGuardar(id);
    }
  });
}

function _esperarSubida(id, tope){
  return new Promise(res => {
    const t0 = Date.now();
    (function mira(){
      if(!_regSinSubir(id) && !window._isSaving) return res(true);
      if(Date.now() - t0 > tope) return res(false);
      setTimeout(mira, 400);
    })();
  });
}

async function _registrarTrasGuardar(id){
  _regAlGuardar = false; _regBotonGuardar();
  toast('💾 Guardando… y luego se registra en Shalom');
  const subio = await _esperarSubida(id, 25000);
  const ped = (S.shipments||[]).find(x=>x.id===id);
  if(!ped || !window.Shalom) return;
  if(!subio){
    _regReabrir(id, '<span style="color:#f59e0b">⚠️ Los cambios no terminaron de subir: '+
      '<b>no se registró nada</b>. Revisa tu conexión y vuelve a intentarlo.</span>');
    return;
  }
  let r = null;
  try{ r = await window.Shalom.registrarEnvio(id); }catch(e){ r = null; }
  if(r && r.ok && r.campos && !r.simulacro){
    _regAplicarCampos(ped, r.campos);
    save(ped.id);
    if(typeof render==='function') render();
    toast('✅ Registrado en Shalom — guía '+(r.campos.shalomGuia||'')+' · pasó a ALISTADO');
    return;
  }
  _regReabrir(id, null, r);
}

function _regReabrir(id, html, r){
  if(typeof openForm==='function') openForm(id);
  const body = $('pkgBody');
  if(body && !body.classList.contains('open') && typeof togglePkgAccordion==='function') togglePkgAccordion();
  const ped = (S.shipments||[]).find(x=>x.id===id);
  if(html) _regSalida(html); else _aplicarRegistroShalom(ped, r);
}

function renovarEnvioPanel(){
  const R = window.RegistroShalom;
  const ped = _editId ? (S.shipments||[]).find(x=>x.id===_editId) : null;
  if(!R || !ped || !window.Shalom) return;
  const sim = _regEsSimulacro();
  confirmar({
    html: '<div style="text-align:left;line-height:1.65;font-size:13px">'+
      '<b style="color:#f59e0b">🔁 Registrar de nuevo</b><br>'+
      'La guía <b>'+escH(ped.shalomGuia||'')+'</b> venció sin dejarse en la agencia. '+
      (sim ? 'Simulacro: no se crea nada.' : 'Se crea un envío <b>nuevo</b> y <b>se cobra otra vez</b>. '+
        'Después se borra la guía vencida de tu Shalom Pro (1 operación).')+
      '<div style="margin-top:8px;font-size:12px;color:var(--text2)">Antes preguntamos a Shalom: '+
      'si el paquete ya entró a una agencia, no se hace nada. La clave sigue siendo <b>'+
      escH(ped.shalomClave||'—')+'</b>: el cliente no tiene que cambiar nada.</div></div>',
    textoSi: sim ? 'Probar' : 'Sí, registrar de nuevo',
    colorSi: sim ? 'var(--blue)' : '#f59e0b',
    trabajando: 'Comprobando con Shalom…',
    alConfirmar: async () => {
      const b = $('btnRenovarShalom');
      if(b){ b.disabled = true; b.onclick = null; b.style.opacity = '.45'; b.textContent = '⏳ Registrando…'; }
      let r = null;
      try{ r = await window.Shalom.registrarEnvio(ped.id, {renovar: true}); }catch(e){ r = null; }
      _aplicarRegistroShalom(ped, r);
    }
  });
}

function _regCfg(){
  return window.RegistroShalom ? window.RegistroShalom.configDe(S)
                               : {agenciaOrigen:null, instanceId:''};
}

function _regEsSimulacro(){ return S.shalomRegistroSimulacro !== false; }

function _regSinSubir(id){
  try{ return !!(id && typeof _dirtyShips!=='undefined' && _dirtyShips.has(id)); }
  catch(e){ return false; }
}

function _regFila(ico, txt, accion){
  return '<div style="display:flex;align-items:center;gap:7px;font-size:11.5px;'+
    'color:var(--text2);margin-bottom:6px;line-height:1.45">'+
    '<span>'+ico+'</span><span style="flex:1">'+txt+'</span>'+(accion||'')+'</div>';
}
function _regLink(txt, fn){
  return '<span onclick="'+fn+'" style="font-size:11px;color:#388bfd;'+
    'cursor:pointer;font-weight:700;white-space:nowrap">'+txt+'</span>';
}

function _pintarResumenPaquete(ped, faltan, registrado){
  const h = $('pkgResumen'); if(!h) return;
  const p = ped || {};
  const R = window.RegistroShalom;
  const elegida = (R && R.tipoElegido) ? R.tipoElegido(p) : '';
  const caja = elegida ? {etiqueta: elegida === 'SOBRE' ? 'Sobre' : 'Paquete ' + elegida} : ((R && R.clasificar) ?
    R.clasificar(p.pkgLargo, p.pkgAncho, p.pkgAlto, p.pkgPeso) : null);
  const aMano = !!(R && R.estaRegistrado && R.estaRegistrado(p) &&
    !(R.registradoPorPro && R.registradoPorPro(p)));
  const clave = aMano ? '' : String(p.shalomClave || '').trim();
  const trozos = [];
  if(caja) trozos.push(escH(caja.etiqueta));
  if(clave) trozos.push('clave <b>'+escH(clave)+'</b>');

  let color = '';
  if(registrado){
    if(!aMano) trozos.push('<span style="color:#3fb950">registrado</span>');
  } else if(faltan && faltan.length){
    trozos.push('<span style="color:#d29922">faltan '+faltan.length+
      (faltan.length === 1 ? ' dato' : ' datos')+'</span>');
    if(['POR ALISTAR','ALISTADO'].indexOf(String(p.status||'').trim().toUpperCase()) >= 0){
      color = 'color:#d29922';
    }
  } else if(faltan){
    trozos.push('<span style="color:#3fb950">listo para registrar</span>');
  }
  h.innerHTML = '📦 Paquete y envío' +
    (trozos.length ? '<span style="font-weight:400;opacity:.85"> · '+
      trozos.join(' · ')+'</span>' : '');
  h.style.cssText = color;
}

function _pintarRegistroShalom(reintento){
  const box = $('shalomRegBlock'); if(!box) return;
  const R = window.RegistroShalom;
  const tit = '';
  const aviso = (ico, txt, col) =>
    '<div style="font-size:11.5px;color:'+(col||'var(--text2)')+';line-height:1.5">'+
    ico+' '+txt+'</div>';

  if(!R){ box.innerHTML = tit + aviso('⚠️',
    'El módulo de registro no cargó. Recarga con Ctrl+Shift+R.', '#f59e0b');
    return; }

  const ped = _editId ? (S.shipments||[]).find(x=>x.id===_editId) : null;
  if(!ped){
    _pintarResumenPaquete(null, null, false);
    box.innerHTML = tit + aviso('💾',
      'Guarda el pedido y vuelve a abrirlo para poder registrarlo.');
    return;
  }

  if(R.estaRegistrado(ped)){
    _pintarResumenPaquete(ped, null, true);
    _regAlGuardar = false; _regBotonGuardar();
    if(R.registradoPorPro && !R.registradoPorPro(ped)){ box.innerHTML = ''; return; }
    const m = parseFloat(ped.shalomMonto);
    box.innerHTML = tit +
      '<div style="background:rgba(63,185,80,.09);border:1px solid rgba(63,185,80,.25);'+
      'border-radius:9px;padding:10px 12px">'+
      '<div style="font-size:12.5px;font-weight:700;color:#3fb950">✅ Registrado en Shalom</div>'+
      '<div style="font-size:11.5px;color:var(--text2);margin-top:5px;line-height:1.6">'+
      'Guía <b style="color:var(--text)">'+escH(ped.shalomGuia||'—')+'</b> · '+
      'Código <b style="color:var(--text)">'+escH(ped.shalomCodigo||'—')+'</b>'+
      (isFinite(m)&&m>0 ? ' · <b style="color:var(--text)">S/ '+m.toFixed(2)+'</b>' : '')+
      '</div></div>' + _regPlazoHtml(ped, R);
    return;
  }

  const bor = _regBorrador(ped);
  if(R.estaRegistrado(bor)){
    _pintarResumenPaquete(bor, null, true);
    _regAlGuardar = false; _regBotonGuardar();
    box.innerHTML = '';
    return;
  }

  const cfg = _regCfg();
  const org = cfg.agenciaOrigen || {};
  let html = tit;

  const cf = (typeof cuentaShalomFila === 'function') ? cuentaShalomFila() :
    {ico: '🔌', txt: 'Shalom Pro'};
  html += _regFila(cf.ico, cf.txt, cf.accion ? _regLink(cf.accion, "goPage('configurar')") : '');

  const orgOk = !!(org.agenciaId);
  html += _regFila(orgOk ? '🏢' : '⚠️',
    orgOk ?
      'Despachas desde <b style="color:var(--text)">'+
        escH(org.agenciaNombre||org.agenciaId)+'</b>' :
      '<span style="color:#f59e0b">Sin agencia de origen</span>',
    _regLink('cambiar', 'regOrigenAbrir()'));
  html += '<div id="regOrigenCaja" style="display:none;position:relative;margin:2px 0 8px">'+
    '<input class="fi" id="regOrigenInput" autocomplete="off" placeholder="Busca por ciudad, distrito o nombre…" '+
    'oninput="onOrigenInput(this.value,\'reg\')" onfocus="onOrigenInput(this.value,\'reg\')">'+
    '<div id="regOrigenDrop" style="display:none;position:absolute;left:0;right:0;top:100%;z-index:60;'+
    'background:var(--bg2);border:1px solid var(--bd);border-radius:9px;margin-top:4px;'+
    'max-height:220px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,.4)"></div></div>';

  const faltan = R.faltantes(bor, cfg);
  _pintarResumenPaquete(bor, faltan, false);
  if(faltan.length){
    _regAlGuardar = false; _regBotonGuardar();
    html += '<div style="background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.25);'+
      'border-radius:9px;padding:9px 11px;margin-top:4px">'+
      '<div style="font-size:11.5px;font-weight:700;color:#f59e0b;margin-bottom:5px">'+
      'Falta esto para poder registrar:</div><ul style="margin:0;padding-left:16px;'+
      'font-size:11.5px;color:var(--text2);line-height:1.6">'+
      faltan.map(f=>'<li>'+escH(f)+'</li>').join('')+'</ul>'+
      (_regSinSubir(ped.id) ?
        '<div style="font-size:10.5px;color:var(--text2);margin-top:6px;font-style:italic">'+
        'Se comprueba lo guardado, y acabas de escribir algo que aún no sube.'+
        '</div>' : '')+
      '</div>';
    box.innerHTML = html;
    return;
  }

  if(_regFormListo && _regDifiere(bor, ped)){
    const sim2 = _regEsSimulacro();
    html += '<div style="background:rgba(63,185,80,.08);border:1px solid rgba(63,185,80,.3);'+
      'border-radius:9px;padding:9px 11px;margin-top:4px;font-size:11.5px;color:var(--text2);line-height:1.6">'+
      '✅ <b style="color:var(--text)">Todo listo.</b> Se registrará como <b style="color:var(--text)">'+
      escH(R.contenidoDe(bor)||'—')+'</b>, a <b style="color:var(--text)">'+
      escH(bor.agenciaNombre||'destino')+'</b>, clave <b style="color:var(--text)">'+
      escH(bor.shalomClave||'—')+'</b>.</div>'+
      '<button type="button" id="btnRegAlGuardar" onclick="regAlGuardarToggle()" '+
      'style="width:100%;margin-top:9px;padding:11px;border-radius:9px;cursor:pointer;font-family:inherit;'+
      'font-size:13px;font-weight:700;'+(_regAlGuardar ?
        'background:rgba(63,185,80,.18);border:2px solid #3fb950;color:#3fb950">☑ Se registrará al guardar' :
        'background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.45);color:#f59e0b">☐ Registrar en Shalom al guardar')+
      '</button><div style="font-size:10.5px;color:var(--text2);margin-top:5px;text-align:center">'+
      (_regAlGuardar ? 'Pulsa <b>Guardar y registrar</b> abajo. ' : '')+
      (sim2 ? '🧪 Simulacro: no cuesta.' : 'Crea un envío real y se cobra.')+'</div>';
    html += '<div style="margin-top:8px;text-align:right">'+
      _regLink(sim2 ? 'Apagar simulacro (registrará de verdad)' : 'Encender simulacro',
               'regToggleSimulacro()')+'</div>';
    html += '<div id="regShalomSalida" style="display:none;margin-top:9px;'+
      'font-size:11.5px;line-height:1.55"></div>';
    box.innerHTML = html;
    return;
  }
  _regAlGuardar = false; _regBotonGuardar();

  const caja = R.clasificar(ped.pkgLargo, ped.pkgAncho, ped.pkgAlto,
      ped.pkgPeso) || {};
  const queEs = R.contenidoDe(ped) || caja.etiqueta || '—';
  const sinSubir = _regSinSubir(ped.id);
  const sim = _regEsSimulacro();

  html += '<div style="background:rgba(56,139,253,.07);border:1px solid rgba(56,139,253,.2);'+
    'border-radius:9px;padding:9px 11px;margin-top:4px;font-size:11.5px;'+
    'color:var(--text2);line-height:1.6">Se registrará como <b style="color:var(--text)">'+
    escH(queEs)+'</b>, de <b style="color:var(--text)">'+
    escH(org.agenciaNombre||'origen')+'</b> a <b style="color:var(--text)">'+
    escH(ped.agenciaNombre||'destino')+'</b>, clave <b style="color:var(--text)">'+
    escH(ped.shalomClave||'—')+'</b>.</div>';

  if(sinSubir){
    html += '<div style="margin-top:9px;background:rgba(245,158,11,.08);'+
      'border:1px solid rgba(245,158,11,.3);border-radius:9px;padding:10px 12px;'+
      'font-size:11.5px;color:#f59e0b;line-height:1.5;font-weight:700">'+
      '💾 Subiendo cambios…'+
      '<div style="font-weight:400;color:var(--text2);margin-top:4px">Shalom se registra '+
      'con lo que hay en la nube, no con lo que ves en pantalla. El botón aparece '+
      'en cuanto termine de subir.</div></div>';
    const n = (reintento || 0) + 1;
    if(n <= 15){
      clearTimeout(_regTimer);
      _regTimer = setTimeout(() => {
        if(document.getElementById('shalomRegBlock')) _pintarRegistroShalom(n);
      }, 1200);
    } else {
      html = html.replace('El botón aparece en cuanto termine de subir.',
        'Los cambios llevan rato sin subir — comprueba tu conexión. ' +
        '<span onclick="_pintarRegistroShalom()" style="color:#388bfd;' +
        'cursor:pointer;font-weight:700">Comprobar de nuevo</span>');
    }
  } else {
    html += '<button type="button" id="btnRegistrarShalom" onclick="registrarEnvioPanel()" '+
      'style="width:100%;margin-top:9px;padding:11px;border-radius:9px;cursor:pointer;'+
      'font-family:inherit;font-size:13px;font-weight:700;'+
      (sim ? 'background:rgba(56,139,253,.15);border:1px solid rgba(56,139,253,.35);color:#388bfd">'+
             '🧪 Probar registro (simulacro — no cuesta)'
           : 'background:rgba(245,158,11,.15);border:1px solid rgba(245,158,11,.45);color:#f59e0b">'+
             '🚚 Registrar en Shalom — crea un envío real')+
      '</button>';
  }

  html += '<div style="margin-top:8px;text-align:right">'+
    _regLink(sim ? 'Apagar simulacro (registrará de verdad)' : 'Encender simulacro',
             'regToggleSimulacro()')+'</div>';
  html += '<div id="regShalomSalida" style="display:none;margin-top:9px;'+
    'font-size:11.5px;line-height:1.55"></div>';

  box.innerHTML = html;
}

function _regPlazoHtml(ped, R){
  if(!R || !R.plazoVencido || String(ped.trackingStatus||'').trim()) return '';
  const t = Date.parse(String(ped.shalomRegistradoEn||''));
  if(!isFinite(t)) return '';
  const resta = t + R.PLAZO_MS - Date.now();
  if(resta > 0){
    const h = Math.floor(resta/3600000), mi = Math.floor((resta%3600000)/60000);
    return '<div style="margin-top:8px;font-size:11.5px;color:'+(h < 4 ? '#f59e0b' : 'var(--text2)')+
      ';line-height:1.5">⏳ Déjalo en la agencia: quedan <b>'+h+' h '+mi+' min</b> de las 24 h.</div>';
  }
  return '<div style="margin-top:9px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.35);'+
    'border-radius:9px;padding:10px 12px;font-size:11.5px;line-height:1.55;color:var(--text2)">'+
    '<b style="color:#f59e0b">⏰ Esta guía venció</b>: pasaron más de 24 h y Shalom no la ha recibido en la agencia.'+
    '<button type="button" id="btnRenovarShalom" onclick="renovarEnvioPanel()" style="width:100%;margin-top:9px;'+
    'padding:10px;border-radius:8px;cursor:pointer;font-family:inherit;font-size:12.5px;font-weight:700;'+
    'background:rgba(245,158,11,.15);border:1px solid rgba(245,158,11,.45);color:#f59e0b">🔁 Registrar de nuevo</button>'+
    '<div style="font-size:10.5px;margin-top:6px">Antes de cobrar se pregunta a Shalom: si el paquete ya entró, no se hace nada.</div>'+
    '</div><div id="regShalomSalida" style="display:none;margin-top:9px;font-size:11.5px;line-height:1.55"></div>';
}

function _regSalida(html){
  const d = $('regShalomSalida'); if(!d) return;
  d.style.display='block'; d.innerHTML = html;
}

function regOrigenAbrir(){
  const c = $('regOrigenCaja'); if(!c) return;
  const abierto = c.style.display !== 'none';
  c.style.display = abierto ? 'none' : 'block';
  if(!abierto){ const i=$('regOrigenInput'); if(i) i.focus(); }
}

function regToggleSimulacro(){
  const sim = _regEsSimulacro();
  S.shalomRegistroSimulacro = sim ? false : true;
  save('config');
  toast(sim ? '⚠️ Simulacro APAGADO — los registros serán reales'
            : '🧪 Simulacro encendido — los registros no cuestan');
  _pintarRegistroShalom();
}

async function registrarEnvioPanel(){
  const R = window.RegistroShalom;
  const ped = _editId ? (S.shipments||[]).find(x=>x.id===_editId) : null;
  if(!R || !ped || !window.Shalom) return;

  if(R.estaRegistrado(ped)){
    toast('Este pedido ya tiene guía de Shalom'); _pintarRegistroShalom(); return; }
  if(R.faltantes(ped, _regCfg()).length){
    toast('⚠️ Falta algo — mira la lista'); _pintarRegistroShalom(); return; }
  if(_regSinSubir(ped.id)){
    toast('💾 Guarda los cambios antes de registrar'); _pintarRegistroShalom(); return; }

  const sim = _regEsSimulacro();
  const caja = R.clasificar(ped.pkgLargo, ped.pkgAncho, ped.pkgAlto,
      ped.pkgPeso) || {};
  const queEs = R.contenidoDe(ped) || caja.etiqueta || '—';
  const org = (_regCfg().agenciaOrigen) || {};
  const btn = $('btnRegistrarShalom');

  confirmar({
    html: '<div style="text-align:left;line-height:1.65;font-size:13px">'+
      (sim ? '<b style="color:var(--blue)">🧪 Simulacro.</b> No se crea nada y no cuesta nada.'
           : '<b style="color:#f59e0b">⚠️ Esto crea un envío real en Shalom y se cobra.</b>'+
             '<br><span style="font-size:12px;color:var(--text2)">Shalom no anula envíos: '+
             'una vez creado, no se deshace.</span>')+
      '<div style="margin-top:9px;font-size:12.5px;color:var(--text2)">'+
      '<b style="color:var(--text)">'+escH(ped.name||'')+'</b><br>'+
      escH(queEs)+' · de '+escH(org.agenciaNombre||'origen')+
      ' a '+escH(ped.agenciaNombre||'destino')+'<br>Clave de recojo: <b style="color:var(--text)">'+
      escH(ped.shalomClave||'—')+'</b></div></div>',
    textoSi: sim ? 'Probar' : 'Sí, registrar',
    colorSi: sim ? 'var(--blue)' : '#f59e0b',
    trabajando: 'Registrando…',
    alConfirmar: async () => {
      if(btn){
        btn.disabled = true; btn.onclick = null; btn.style.opacity = '.45';
        btn.style.cursor = 'default'; btn.textContent = '⏳ Registrando…';
      }
      let r = null;
      try{ r = await window.Shalom.registrarEnvio(ped.id); }catch(e){ r = null; }
      _aplicarRegistroShalom(ped, r);
    }
  });
}

function _aplicarRegistroShalom(ped, r){
  try{
    console.log('[Registro Shalom]', JSON.stringify({
      ok: r && r.ok, estado: r && r.estado, motivo: r && r.motivo,
      detalle: r && r.detalle, simulacro: !!(r && r.simulacro),
      recuperado: !!(r && r.recuperado), campos: r && r.campos,
      forma: r && r.forma, faltan: r && r.faltan}));
  }catch(e){}

  if(r && r.ok && r.simulacro){
    _regSalida('<span style="color:#388bfd">🧪 Simulacro correcto.</span> '+
      '<span style="color:var(--text2)">No se creó nada. Apaga el simulacro '+
      'para registrar de verdad.</span>');
    toast('🧪 Simulacro correcto — no se creó nada');
    return;
  }

  if(r && r.ok && r.campos){
    _regAplicarCampos(ped, r.campos);
    save(ped.id);
    if(typeof _congelarSiRegistrado==='function') _congelarSiRegistrado(ped);
    if(typeof render==='function') render();
    _pintarRegistroShalom();
    const vieja = {borrada: ' · la guía vencida se borró de tu Shalom Pro',
      no_pendiente: ' · la guía vencida ya no estaba en tus pendientes',
      fallo: ' · no se pudo borrar la guía vencida: bórrala en pro.shalom.pe'}[r.vieja] || '';
    toast('✅ Registrado — guía '+(r.campos.shalomGuia||'')+vieja);
    return;
  }

  const mot = (r && r.motivo) || 'SIN_RED';
  const txt = (window.Shalom && window.Shalom.textoMotivo) ? window.Shalom.textoMotivo(mot) : mot;

  if(r && r.estado === 'duda'){
    _regSalida('<div style="background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.35);'+
      'border-radius:9px;padding:10px 12px"><b style="color:#f59e0b">⚠️ No sabemos si se creó.</b>'+
      '<div style="color:var(--text2);margin-top:4px">'+escH(r.detalle||txt)+'</div>'+
      '<button type="button" onclick="recuperarEnvioPanel()" style="width:100%;margin-top:9px;'+
      'padding:9px;border-radius:8px;cursor:pointer;font-family:inherit;font-size:12.5px;'+
      'font-weight:700;background:rgba(56,139,253,.15);border:1px solid rgba(56,139,253,.35);'+
      'color:#388bfd">🔍 Buscar en Shalom y rellenar la guía</button>'+
      '<div style="font-size:10.5px;color:var(--text2);margin-top:6px">Solo lee. No registra '+
      'nada y no puede cobrarte otra vez.</div></div>');
    toast('⚠️ Registro en duda — no se reintenta');
    return;
  }

  _regSalida(_regServidorViejo(ped, r)+'<span style="color:var(--red)">❌ '+escH(txt)+'</span>'+
    (r && r.detalle ? '<div style="color:var(--text2);margin-top:3px">'+escH(r.detalle)+'</div>' : '')+
    (r && r.faltan && r.faltan.length ?
      '<ul style="margin:5px 0 0;padding-left:16px;color:var(--text2)">'+
      r.faltan.map(f=>'<li>'+escH(f)+'</li>').join('')+'</ul>' : ''));
  toast('❌ No se registró');
}

function _regAplicarCampos(ped, campos){
  Object.assign(ped, campos);
  if(campos.shalomPor === 'pro') return;
  ped.shalomPor = 'pro';
  if(window.RegistroShalom && window.RegistroShalom.notaConClave && ped.shalomGuia && ped.shalomClave){
    ped.privateNote = window.RegistroShalom.notaConClave(ped.privateNote, ped.shalomClave, ped.shalomGuia);
  }
  toast('⚠️ El servidor no está actualizado — corre «firebase deploy --only functions». La clave se anotó desde el panel.');
}

function _regServidorViejo(ped, r){
  const f = (r && r.motivo === 'SIN_DATO' && Array.isArray(r.faltan)) ? r.faltan.join(' ') : '';
  if(!f) return '';
  const viejo = (ped && ped.pkgCaja && /medidas|peso/i.test(f)) ||
    /Solo se registra lo que está en POR ALISTAR \(/.test(f);
  return viejo ? '<div style="background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.35);'+
    'border-radius:9px;padding:9px 11px;margin-bottom:8px;color:#f59e0b;font-weight:700">'+
    '⚠️ El servidor todavía no tiene la versión nueva. Corre <code>firebase deploy --only functions</code> '+
    'y vuelve a intentarlo: no se registró nada.</div>' : '';
}

async function recuperarEnvioPanel(){
  const ped = _editId ? (S.shipments||[]).find(x=>x.id===_editId) : null;
  if(!ped || !window.Shalom) return;
  _regSalida('🔍 Buscando en Shalom…');
  let r = null;
  try{ r = await window.Shalom.recuperarEnvio(ped.id); }catch(e){ r = null; }
  if(r && r.ok && r.campos){
    _regAplicarCampos(ped, r.campos);
    save(ped.id);
    if(typeof _congelarSiRegistrado==='function') _congelarSiRegistrado(ped);
    if(typeof render==='function') render();
    _pintarRegistroShalom();
    toast('✅ Guía recuperada: '+(r.campos.shalomGuia||''));
    return;
  }
  const mot = (r && r.motivo) || 'SIN_RED';
  const txt = (window.Shalom.textoMotivo ? window.Shalom.textoMotivo(mot) : mot);
  _regSalida('<span style="color:var(--red)">❌ '+escH(txt)+'</span>'+
    (r && r.detalle ? '<div style="color:var(--text2);margin-top:3px">'+escH(r.detalle)+'</div>' : ''));
}

function _claveAuto(){
  const el = $('fShalomClave'); if(!el) return;
  if(el.value) return;
  if(($('fShalomGuia')||{value:''}).value.trim()) return;
  if(!window.Shalom || typeof Shalom.claveRecojo !== 'function') return;
  el.value = Shalom.claveRecojo();
}
