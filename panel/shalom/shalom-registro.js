/**
 * panel/shalom/shalom-registro.js — clave de recojo y registro en Shalom (desde el pedido y en Config)
 * =============================================================================================
 * Fase 3 (10/11/2026): el panel en módulos. Antes vivía en config.js.
 * Script CLÁSICO a propósito: sus funciones y variables son globales, igual
 * que cuando estaban en un solo archivo — moverlas no cambió ni una llamada.
 * El orden de los <script> en index.html es el orden de ejecución.
 */
/* ── CLAVE DE RECOJO ─────────────────────────────────────────────────────
   Los 4 dígitos que el destinatario necesita para retirar el paquete en la
   agencia. `POST /account/register` la acepta como `clave`, y es la razón
   por la que se eligió el endpoint individual y no el masivo: el masivo NO
   la admite.

   Se genera sola —una menos que inventar por pedido— pero se puede cambiar.
   Y NO se regenera sola en un pedido que ya tiene guía: la clave que se le
   dio a Shalom es la que el cliente va a usar, y cambiarla aquí dejaría al
   cliente con un número que no abre nada. */
function regenClaveRecojo(){
  const el = $('fShalomClave'); if(!el) return;
  /* ⚠️ UN ENVÍO YA REGISTRADO NO CAMBIA DE CLAVE. Esos cuatro dígitos ya
     están en Shalom: generar otros aquí le daría al cliente un número que
     no abre nada y el paquete se quedaría en la agencia.
     `_claveAuto` ya lo respetaba; este botón no, y se podía pulsar. Lo vio
     el dueño en la primera prueba real.
     Y SE DICE, no se ignora en silencio: un botón que no hace nada y no
     explica por qué se vuelve a pulsar. */
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

/* Congela lo que Shalom ya tiene. Se llama al abrir el formulario.
   La clave y la agencia de destino dejan de poder cambiarse en cuanto hay
   guía: Shalom las tiene, y que el panel diga una cosa y el paquete vaya a
   otra es peor que no poder editarlo. */
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


/* ── 🚚 REGISTRAR EN SHALOM, DESDE EL PEDIDO ──────────────────────────────
   Hasta hoy el registro solo existía desde la consola. Esta es su cara.

   TRES REGLAS QUE NO SE NEGOCIAN, porque Shalom no anula un envío, no tiene
   clave de idempotencia y cada registro cuesta dinero:

   1. Lo que falta se dice ANTES, en palabras. `window.RegistroShalom.faltantes()` es
      el MISMO archivo que usa el servidor para decidir, así que lo que lees
      aquí es exactamente lo que el servidor va a decidir — no una copia que
      algún día diga otra cosa. Un botón gris sin explicación obliga a probar,
      y probar aquí cuesta S/ 12.
   2. El botón se apaga al pulsarlo y NO SE VUELVE A ENCENDER. Ni en éxito, ni
      en fallo, ni en duda. Dos clics serían dos envíos y dos cobros.
   3. En duda jamás sale "reintentar". Sale "Recuperar", que solo lee.

   Y la trampa silenciosa: el servidor lee el pedido DE FIRESTORE, no de tu
   pantalla. Si hay cambios sin subir, registraría con los datos viejos —caja
   equivocada, o "faltan medidas" con las medidas delante—. Por eso se mira
   `_dirtyShips` y se te pide guardar primero. Explícito, no magia. */

let _regTimer = null;

/* ── ★ REGISTRAR AL GUARDAR (10/11/2026) ──────────────────────────────────
   Antes había que guardar, cerrar, volver a abrir y recién ahí registrar.
   Ahora el bloque mira lo que tienes EN PANTALLA (estado, caja o medidas,
   clave): si con eso ya se puede, ofrece «Registrar en Shalom al guardar»
   y el botón Guardar pasa a «Guardar y registrar». Los cambios valen al
   guardar, como siempre, y el registro va DESPUÉS de que el pedido subió:
   el servidor registra con lo que hay en la nube.
   Cero lecturas y cero llamadas para decidir: la lista de lo que falta es la
   MISMA función del servidor, corriendo aquí. */
let _regAlGuardar = false;
let _regFormListo = false;   // el formulario ya cargó los valores de ESTE pedido
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
/** Lo guardado + lo que tienes en pantalla en los campos que deciden.
 * @param {Object} ped el pedido guardado
 * @return {Object} el pedido tal como quedaría al guardar */
function _regBorrador(ped){
  if(!_regFormListo || !ped) return ped;
  const b = Object.assign({}, ped);
  Object.keys(_REG_CAMPOS).forEach(k => {
    const e = $(_REG_CAMPOS[k]); if(e) b[k] = String(e.value || '').trim();
  });
  // Una guía escrita a mano en pantalla también cuenta: ese ya no se registra.
  const g = ($('fShalomGuia')||{value:''}).value.trim();
  if(g) b.shalomGuia = g;
  /* ★ LO QUE EL GUARDADO TAMBIÉN DECIDE (11/11/2026). Sin esto, el DNI recién
     escrito, su nombre de RENIEC o la agencia recién elegida solo contaban
     después de guardar, cerrar y volver a abrir: «Falta el nombre partido
     por RENIEC» con el nombre a la vista. Se calculan con las MISMAS reglas
     que saveShipment (pedido-guardar.js). */
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

/* La confirmación ANTES de guardar: cuesta dinero y no se deshace. */
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

/** Espera a que ESTE pedido termine de subir (o se rinde).
 * @param {string} id el pedido
 * @param {number} tope ms como máximo
 * @return {Promise<boolean>} true si ya está en la nube */
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
  // Simulacro, fallo o duda: se reabre el pedido para verlo con sus palabras.
  _regReabrir(id, null, r);
}

function _regReabrir(id, html, r){
  if(typeof openForm==='function') openForm(id);
  const body = $('pkgBody');
  if(body && !body.classList.contains('open') && typeof togglePkgAccordion==='function') togglePkgAccordion();
  const ped = (S.shipments||[]).find(x=>x.id===id);
  if(html) _regSalida(html); else _aplicarRegistroShalom(ped, r);
}

/* ⏰ REGISTRAR DE NUEVO — pasadas 24 h sin dejar el paquete en la agencia.
   El servidor vuelve a comprobarlo TODO (hora, y que Shalom diga que no
   entró): si el paquete ya entró, no se registra y no se cobra. */
function renovarEnvioPanel(){
  const R = window.RegistroShalom;
  const ped = _editId ? (S.shipments||[]).find(x=>x.id===_editId) : null;
  if(!R || !ped || !window.Shalom) return;
  const sim = _regEsSimulacro();
  confirmar({
    html: '<div style="text-align:left;line-height:1.65;font-size:13px">'+
      '<b style="color:#f59e0b">🔁 Registrar de nuevo</b><br>'+
      'La guía <b>'+escH(ped.shalomGuia||'')+'</b> venció sin dejarse en la agencia. '+
      (sim ? 'Simulacro: no se crea nada.' : 'Se crea un envío <b>nuevo</b> y <b>se cobra otra vez</b>.')+
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

/* ── ⚠️ LO GUARDADO NO ES LO COMPROBADO ──────────────────────────────────
   La primera versión de este bloque pintaba «🔌 Cuenta Total» leyendo
   `S.shalomInstancia`, que es lo que hay en TU NAVEGADOR. El 3 de octubre el
   lote de instancias de Shalom se quedó VACÍO al cambiar de plan y la
   pantalla siguió diciendo «Cuenta Total» tan tranquila. Era el mismo error
   que la otra aplicación, que mostraba «Instancia asignada» sin instancia
   ninguna: enseñar un dato propio como si fuera una respuesta de Shalom.

   Y no había excusa, porque comprobarlo es GRATIS. De su documentación:
   «GET /instances · POST /instances/status — Ninguno consume cuota».

   Se comprueba solo, una vez por cuenta. `_regSesionDe` guarda para QUÉ id
   se comprobó: si cambias de cuenta, la respuesta vieja no vale. */
let _regSesion = null;
let _regSesionDe = '';

/** Comprueba la instancia contra Shalom. Gratis, una vez, sin bloquear.
 * @param {boolean} [forzar] true vuelve a preguntar aunque ya se supiera */
function _regComprobarInstancia(forzar){
  const id = (S.shalomInstancia || {}).id;
  if(!id || !window.Shalom || !window.Shalom.estadoSesion) return;
  if(!forzar && _regSesionDe === id && _regSesion) return;
  _regSesionDe = id;
  _regSesion = {estado: 'mirando'};
  window.Shalom.estadoSesion(id).then((r) => {
    // Si cambiaste de cuenta mientras llegaba, esta respuesta ya no es de
    // nadie: tirarla es más barato que explicar por qué el panel miente.
    if((S.shalomInstancia || {}).id !== id) return;
    _regSesion = (r && r.ok && r.sesion) ?
      {estado: r.sesion.conectada ? 'ok' : 'sinSesion', usuario: r.sesion.usuario} :
      {estado: 'rota', motivo: (r && r.motivo) || 'SIN_RED'};
    _pintarRegistroShalom();
  }).catch(() => {
    if((S.shalomInstancia || {}).id !== id) return;
    _regSesion = {estado: 'rota', motivo: 'SIN_RED'};
    _pintarRegistroShalom();
  });
}

/** La config del registro, por la MISMA función que usa el servidor.
 * @return {Object} {agenciaOrigen, instanceId} */
function _regCfg(){
  return window.RegistroShalom ? window.RegistroShalom.configDe(S)
                               : {agenciaOrigen:null, instanceId:''};
}

/** Simulacro ENCENDIDO salvo un `false` explícito — la regla del servidor,
 * repetida aquí porque la pantalla tiene que decir la verdad sobre si el
 * próximo clic cuesta dinero.
 * @return {boolean} true si no va a gastar */
function _regEsSimulacro(){ return S.shalomRegistroSimulacro !== false; }

/** ¿Este pedido tiene cambios que Firestore todavía no tiene?
 * @param {string} id el id del pedido
 * @return {boolean} true si falta subirlo */
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

/* ★ EL RESUMEN DE LA CABECERA. Lo que se lee con el desplegable CERRADO.
   La clave va aquí a propósito: la necesitas para dictársela al cliente, así
   que esconderla detrás de un clic sería esconder justo lo que más se mira.
   Y si falta algo estando en POR ALISTAR —o sea, ahora es cuando se puede
   hacer algo— la cabecera se pone ámbar: te enteras sin abrir.
   @param {Object} ped el pedido guardado, o null
   @param {Array} faltan lo que falta, o null si no aplica
   @param {boolean} registrado si ya tiene guía */
function _pintarResumenPaquete(ped, faltan, registrado){
  const h = $('pkgResumen'); if(!h) return;
  const p = ped || {};
  const R = window.RegistroShalom;
  const elegida = (R && R.tipoElegido) ? R.tipoElegido(p) : '';
  const caja = elegida ? {etiqueta: elegida === 'SOBRE' ? 'Sobre' : 'Paquete ' + elegida} : ((R && R.clasificar) ?
    R.clasificar(p.pkgLargo, p.pkgAncho, p.pkgAlto, p.pkgPeso) : null);
  /* La clave en la cabecera: mientras se prepara el registro (para
     dictársela al cliente) y cuando lo registró Shalom Pro. Con una guía
     puesta a mano, nada — como antes (10/11/2026). */
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
    // Ámbar solo si se puede hacer algo YA: en POR ALISTAR.
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

/* ★ EL PINTOR. Único sitio que decide qué se ve en ese bloque. */
function _pintarRegistroShalom(reintento){
  const box = $('shalomRegBlock'); if(!box) return;
  const R = window.RegistroShalom;
  // Sin título propio: el del desplegable ya dice qué es esto.
  const tit = '';
  const aviso = (ico, txt, col) =>
    '<div style="font-size:11.5px;color:'+(col||'var(--text2)')+';line-height:1.5">'+
    ico+' '+txt+'</div>';

  if(!R){ box.innerHTML = tit + aviso('⚠️',
    'El módulo de registro no cargó. Recarga con Ctrl+Shift+R.', '#f59e0b');
    return; }

  const ped = _editId ? (S.shipments||[]).find(x=>x.id===_editId) : null;
  if(!ped){
    /* ⚠️ Y LA CABECERA TAMBIÉN SE LIMPIA. Esta puerta de atrás salía sin
       repintarla, así que al abrir un pedido NUEVO después de editar uno
       registrado, el desplegable seguía diciendo «PAQUETE L · CLAVE 6277 ·
       REGISTRADO» del anterior — con el cuerpo justo debajo diciendo
       «guarda el pedido y vuelve a abrirlo».

       Una pantalla que se contradice consigo misma a dos centímetros de
       distancia da más miedo que un error: el dueño creyó que el pedido
       nuevo había nacido registrado. No lo estaba —los campos de verdad sí
       se limpian— pero eso no se podía saber mirando. */
    _pintarResumenPaquete(null, null, false);
    box.innerHTML = tit + aviso('💾',
      'Guarda el pedido y vuelve a abrirlo para poder registrarlo.');
    return;
  }

  /* YA REGISTRADO: no hay botón. No es que esté deshabilitado — es que no
     existe, que es la única forma de que un clic no pueda crear un segundo
     envío con un segundo cobro. */
  if(R.estaRegistrado(ped)){
    _pintarResumenPaquete(ped, null, true);
    _regAlGuardar = false; _regBotonGuardar();
    /* Guía puesta a mano (o escaneada del ticket): no la registró Shalom Pro
       desde aquí, así que no se muestra nada de registro — como antes. */
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

  /* Escribiste una guía a mano en pantalla: este pedido no se registra. */
  const bor = _regBorrador(ped);
  if(R.estaRegistrado(bor)){
    _pintarResumenPaquete(bor, null, true);
    _regAlGuardar = false; _regBotonGuardar();
    box.innerHTML = '';
    return;
  }

  const cfg = _regCfg();
  const org = cfg.agenciaOrigen || {};
  const inst = S.shalomInstancia || {};
  let html = tit;

  /* ── TU CUENTA. Comprobada contra Shalom, no leída de tu navegador.
     NO se bloquea el botón cuando la comprobación falla: un registro sin
     instancia válida devuelve 403 y NO crea ni cobra nada, mientras que
     bloquear por una lectura que puede fallar por red te dejaría sin poder
     registrar teniéndolo todo bien. Se dice la verdad y decides tú. */
  if(inst.id) _regComprobarInstancia();
  const ses = (_regSesionDe === inst.id) ? _regSesion : null;
  let icoC = '🔌', txtC, accC = 'comprobar';
  if(!inst.id){
    icoC = '⚠️';
    txtC = '<span style="color:#f59e0b">Sin cuenta de Shalom Pro</span>';
    accC = 'elegir en Config';
  } else {
    const nom = '<b style="color:var(--text)">'+escH(inst.nombre||inst.id)+'</b>';
    if(!ses || ses.estado === 'mirando'){
      txtC = 'Cuenta '+nom+'<span style="opacity:.6"> — comprobando…</span>';
    } else if(ses.estado === 'ok'){
      txtC = 'Cuenta '+nom+'<span style="color:#3fb950"> — sesión activa</span>';
    } else if(ses.estado === 'sinSesion'){
      icoC = '⚠️';
      txtC = 'Cuenta '+nom+'<span style="color:#f59e0b"> — sin sesión en '+
        'Shalom Pro</span>';
    } else {
      icoC = '⛔';
      txtC = 'Cuenta '+nom+'<span style="color:var(--red)"> — '+
        escH(ses.motivo === 'SIN_INSTANCIA_VALIDA' ? 'ya no existe en Shalom' :
          (ses.motivo === 'SIN_RED' ? 'no se pudo comprobar' : ses.motivo))+
        '</span>';
    }
  }
  html += _regFila(icoC, txtC, _regLink(accC, 'regComprobarSesion()'));

  /* ── TU AGENCIA DE ORIGEN. Se puede cambiar desde aquí, y es UNA sola para
     todo el negocio: cambiarla «para este envío» cambia todos los
     siguientes. Eso ya no se repite en pantalla —estaba fijo, ocupando una
     línea cada vez— y vive en 📖 Ayuda, que es donde se lee una vez. */
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

  /* ── LO QUE FALTA, EN PALABRAS. Mismo archivo que el servidor. */
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
      /* Esta nota SOLO cuando aplica. Permanente era ruido; con cambios sin
         subir es justo lo que explica por qué la lista no cuadra con lo que
         ves en pantalla. */
      (_regSinSubir(ped.id) ?
        '<div style="font-size:10.5px;color:var(--text2);margin-top:6px;font-style:italic">'+
        'Se comprueba lo guardado, y acabas de escribir algo que aún no sube.'+
        '</div>' : '')+
      '</div>';
    box.innerHTML = html;
    return;
  }

  /* ── TODO LISTO CON LO DE PANTALLA, pero aún no guardado: se ofrece
     registrar AL GUARDAR. Nada se llama hasta pulsar Guardar. */
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

  /* ── TODO LISTO. Antes del botón, la trampa de los datos sin subir. */
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
    /* ⚠️ "Guarda primero" sonaría a reproche cuando acabas de guardar: la
       subida va con 800 ms de espera más la red, así que hay unos segundos
       en los que ya pulsaste Guardar y la nube todavía no lo tiene. Se dice
       lo que de verdad pasa, y el bloque se repinta solo al terminar — sin
       eso te quedarías mirando un aviso vencido sin saber qué hacer. */
    html += '<div style="margin-top:9px;background:rgba(245,158,11,.08);'+
      'border:1px solid rgba(245,158,11,.3);border-radius:9px;padding:10px 12px;'+
      'font-size:11.5px;color:#f59e0b;line-height:1.5;font-weight:700">'+
      '💾 Subiendo cambios…'+
      '<div style="font-weight:400;color:var(--text2);margin-top:4px">Shalom se registra '+
      'con lo que hay en la nube, no con lo que ves en pantalla. El botón aparece '+
      'en cuanto termine de subir.</div></div>';
    /* ⚠️ ACOTADO. La primera versión se reprogramaba sola sin límite: si la
       subida no terminaba nunca —sin red, sesión caída— el panel repintaba
       cada 1,2 s para siempre. Un reintento sin final no es paciencia, es un
       bucle. A los ~18 s se para y se te da un botón, que además te dice que
       algo va mal con la subida en vez de fingir que sigue en camino. */
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

  /* ── EL INTERRUPTOR. Hasta hoy solo se podía cambiar subiendo un archivo de
     configuración: lo único que decide si un clic cuesta S/ 12 era invisible. */
  html += '<div style="margin-top:8px;text-align:right">'+
    _regLink(sim ? 'Apagar simulacro (registrará de verdad)' : 'Encender simulacro',
             'regToggleSimulacro()')+'</div>';
  html += '<div id="regShalomSalida" style="display:none;margin-top:9px;'+
    'font-size:11.5px;line-height:1.55"></div>';

  box.innerHTML = html;
}

/* ⏳ / ⏰ El plazo de 24 h de Shalom para dejar el paquete. Dentro del
   plazo, cuánto queda (urgencia real, no inventada); vencido y sin que
   Shalom lo haya recibido, la salida: registrar de nuevo. Sin la hora del
   registro no se dice nada: mejor callar que inventar un plazo. */
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
  /* Se guarda `false` EXPLÍCITO para apagarlo y `true` para encenderlo: el
     servidor solo apaga el simulacro con un false explícito, así que dejar
     el campo ausente lo dejaría encendido y el botón mentiría. */
  S.shalomRegistroSimulacro = sim ? false : true;
  save('config');
  toast(sim ? '⚠️ Simulacro APAGADO — los registros serán reales'
            : '🧪 Simulacro encendido — los registros no cuestan');
  _pintarRegistroShalom();
}

/* ★ LA SECCIÓN DE SHALOM EN CONFIG — una línea, y un botón solo si hace falta.
   Aquí había TRES botones, y de raíz sobraban dos:

     · «Verificar sesión» era un trozo de «Conectar» —Conectar ya termina
       comprobando— y el estado es GRATIS (su doc: `GET /instances` y
       `POST /instances/status` no consumen cuota). Pedirlo con un botón era
       cobrar un clic por algo que no cuesta nada.
     · «Guardar credenciales» NUNCA era útil sola: guardas, y luego hay que
       conectar igual. El estado intermedio —«guardé pero no conecté»— no
       sirve para nada, y es justo donde el dueño se quedó atascado el
       11/10/2026.

   Lo que queda es: el estado, siempre visible; y un botón que hace lo que
   haga falta sin obligarte a saber la diferencia. */
let _cfgSesion = null;
let _cfgSesionDe = '';
let _cfgFormAbierto = false;

/** Comprueba la sesión de la cuenta guardada. Gratis, una vez por cuenta.
 * @param {boolean} [forzar] true vuelve a preguntar */
function _cfgComprobar(forzar){
  const id = (S.shalomInstancia || {}).id;
  if(!id || !window.Shalom || !window.Shalom.estadoSesion) return;
  if(!forzar && _cfgSesionDe === id && _cfgSesion) return;
  _cfgSesionDe = id;
  _cfgSesion = {estado: 'mirando'};
  window.Shalom.estadoSesion(id).then((r) => {
    if((S.shalomInstancia || {}).id !== id) return;
    _cfgSesion = (r && r.ok && r.sesion) ?
      {estado: r.sesion.conectada ? 'ok' : 'sinSesion', usuario: r.sesion.usuario} :
      {estado: 'rota', motivo: (r && r.motivo) || 'SIN_RED'};
    _pintarShalomConfig();
  }).catch(() => {
    if((S.shalomInstancia || {}).id !== id) return;
    _cfgSesion = {estado: 'rota', motivo: 'SIN_RED'};
    _pintarShalomConfig();
  });
}

/** Abre o cierra el formulario de credenciales. */
function cfgCambiarCuenta(){
  _cfgFormAbierto = !_cfgFormAbierto;
  _pintarShalomConfig();
  if(_cfgFormAbierto){ const u = $('credUser'); if(u) u.focus(); }
}

/** El pintor. Único sitio que decide qué se ve en la sección de Shalom.
 * @param {boolean} [yaComprobado] true si acaba de resolverse por otra vía */
function _pintarShalomConfig(yaComprobado){
  const box = $('shalomCfgBloque'); if(!box) return;
  const inst = S.shalomInstancia || {};
  if(inst.id && !yaComprobado) _cfgComprobar();
  const ses = (_cfgSesionDe === inst.id) ? _cfgSesion : null;

  /* El estado, en una línea. Conectada es lo normal, así que es lo que
     menos tiene que ocupar: un punto verde y el correo. */
  let ico = '🔌', txt, conectada = false;
  if(!inst.id){
    ico = '⚠️'; txt = '<span style="color:#f59e0b">Sin cuenta conectada</span>';
  } else if(!ses || ses.estado === 'mirando'){
    txt = '<span style="opacity:.6">comprobando…</span>';
  } else if(ses.estado === 'ok'){
    conectada = true;
    txt = '<span style="color:#3fb950">● Conectada</span>'+
      (ses.usuario ? '<span style="color:var(--text2)"> · '+escH(ses.usuario)+'</span>' : '');
  } else if(ses.estado === 'sinSesion'){
    ico = '⚠️'; txt = '<span style="color:#f59e0b">Sin sesión</span>';
  } else {
    ico = '⛔'; txt = '<span style="color:var(--red)">'+
      escH(ses.motivo === 'SIN_INSTANCIA_VALIDA' ? 'Esa cuenta ya no existe' :
        'No se pudo comprobar')+'</span>';
  }

  const enlace = (t, fn) => '<span onclick="'+fn+'" style="font-size:11px;'+
    'color:#388bfd;cursor:pointer;font-weight:700;white-space:nowrap">'+t+'</span>';

  let html = '<div style="display:flex;align-items:center;gap:8px;font-size:12px;'+
    'color:var(--text2);line-height:1.5">'+
    '<span>'+ico+'</span>'+
    '<span style="flex:1"><b style="color:var(--text)">Shalom Pro</b> '+txt+'</span>'+
    (inst.id ? enlace('comprobar', 'verificarInstanciaShalom()')+
      '<span style="opacity:.3">·</span>' : '')+
    enlace(_cfgFormAbierto ? 'cerrar' : (conectada ? 'cambiar cuenta' : 'entrar'),
        'cfgCambiarCuenta()')+
    '<span onclick="if(window.Ayuda)Ayuda.abrir(\'registroShalom\')" title="Ayuda" '+
    'style="font-size:12px;color:#8b949e;cursor:pointer">📖</span></div>';

  /* El formulario solo cuando hace falta: si no hay sesión sale solo, y si
     la hay se pide con «cambiar cuenta». Lo que no se puede hacer ahora
     mismo no tiene por qué estar ocupando pantalla. */
  if(!conectada || _cfgFormAbierto){
    html += '<div style="margin-top:10px">'+
      '<div class="frow">'+
        '<div class="fg"><label class="fl">Correo</label>'+
          '<input class="fi" id="credUser" type="email" autocomplete="off" '+
          'placeholder="correo@gmail.com"></div>'+
        '<div class="fg"><label class="fl">Contraseña</label>'+
          '<input class="fi" id="credPass" type="password" autocomplete="new-password" '+
          'placeholder="La de pro.shalom.pe"></div>'+
      '</div>'+
      '<button id="cfgConectarBtn" type="button" onclick="conectarShalomUno()" '+
      'style="width:100%;margin-top:9px;padding:11px;border-radius:9px;cursor:pointer;'+
      'font-family:inherit;font-size:13px;font-weight:700;'+
      'background:rgba(63,185,80,.14);border:1px solid rgba(63,185,80,.35);'+
      'color:#3fb950">&#128279; Conectar</button>'+
      '<div style="font-size:10.5px;color:#8b949e;margin-top:6px;line-height:1.45">'+
      'Déjalos vacíos para entrar con las credenciales que ya están guardadas.'+
      '</div></div>';
  }
  box.innerHTML = html;
}

/* ★ UN SOLO BOTÓN, Y HACE LO QUE HAGA FALTA.
   Antes eran dos pasos que el dueño tenía que encadenar a mano —guardar y
   luego conectar— y el estado de en medio no servía para nada. Ahora:

     escribiste algo  → se guarda Y se conecta
     campos vacíos    → se conecta con lo ya guardado
     vacíos y sin nada→ se dice que hace falta escribirlo

   Las dos operaciones siguen SEPARADAS en el servidor, con sus rejas: lo
   que se junta es la cara, no los candados. */
async function conectarShalomUno(){
  const u = $('credUser'), k = $('credPass'), btn = $('cfgConectarBtn');
  const caja = $('shalomCfgSalida');
  const decir = (html) => { if(caja){ caja.style.display='block'; caja.innerHTML=html; } };
  if(!window.Shalom || !window.Shalom.conectarCuenta){
    decir('<span style="color:var(--red)">Shalom no está disponible.</span>'); return; }

  const usuario = (u && u.value || '').trim();
  const clave   = (k && k.value) || '';
  const apagar = (t) => { if(btn){ btn.disabled=true; btn.style.opacity='.5'; btn.textContent=t; } };
  const encender = () => { if(btn){ btn.disabled=false; btn.style.opacity=''; btn.textContent='🔗 Conectar'; } };

  // 1 · si escribió algo, se guarda ANTES de conectar
  if(usuario || clave){
    apagar('⏳ Guardando…');
    let g = null;
    try{ g = await window.Shalom.guardarCredenciales(usuario, clave); }catch(e){ g = null; }
    if(!g || !g.ok){
      encender();
      const m = (g && g.motivo) || 'SIN_RED';
      decir('<div style="background:rgba(248,81,73,.1);border:1px solid rgba(248,81,73,.3);'+
        'border-radius:9px;padding:10px 12px"><b style="color:var(--red)">❌ '+
        escH(window.Shalom.textoMotivo ? window.Shalom.textoMotivo(m) : m)+'</b>'+
        ((g && g.faltan && g.faltan.length) ?
          '<ul style="margin:5px 0 0;padding-left:16px;color:var(--text2)">'+
          g.faltan.map(f=>'<li>'+escH(f)+'</li>').join('')+'</ul>' : '')+
        ((g && g.detalle) ? '<div style="color:var(--text2);margin-top:4px">'+
          escH(g.detalle)+'</div>' : '')+'</div>');
      if(k) k.value = '';     // la contraseña no se queda en pantalla
      return;
    }
    // Vaciar en cuanto están a salvo: la clave primero.
    if(k) k.value = '';
    if(u) u.value = '';
  }

  // 2 · conectar
  apagar('⏳ Conectando…');
  decir('<span style="color:var(--text2)">Buscando la cuenta, entrando y comprobando…</span>');
  let r = null;
  try{ r = await window.Shalom.conectarCuenta(); }catch(e){ r = null; }
  encender();

  if(r && r.ok){
    if(r.id){
      S.shalomInstancia = {id: String(r.id),
        nombre: (S.shalomInstancia||{}).nombre || 'Total Tools Panel'};
      save('config');
    }
    _cfgSesion = {estado: r.conectada ? 'ok' : 'sinSesion', usuario: r.usuario};
    _cfgSesionDe = String(r.id || '');
    _cfgFormAbierto = false;
    _pintarShalomConfig(true);
    if(typeof _pintarRegistroShalom === 'function'){
      _regSesion = _cfgSesion; _regSesionDe = _cfgSesionDe;
      _pintarRegistroShalom();
    }
    decir('<span style="color:#3fb950">'+(r.creada ? '✅ Cuenta creada y conectada' :
      (r.conectada ? '✅ Sesión renovada' : '⚠️ Entró, pero Shalom aún no la da por conectada'))+
      '</span>'+(r.usuario ? '<span style="color:var(--text2)"> · '+escH(r.usuario)+'</span>' : ''));
    toast(r.creada ? '✅ Cuenta de Shalom conectada' : '✅ Sesión de Shalom renovada');
    if(r.forma) console.log('[Shalom login · forma]', JSON.stringify(r.forma));
    return;
  }

  const mot = (r && r.motivo) || 'SIN_RED';
  decir('<div style="background:rgba(248,81,73,.1);border:1px solid rgba(248,81,73,.3);'+
    'border-radius:9px;padding:10px 12px"><b style="color:var(--red)">❌ '+
    escH(window.Shalom.textoMotivo ? window.Shalom.textoMotivo(mot) : mot)+'</b>'+
    ((r && r.detalle) ? '<div style="color:var(--text2);margin-top:4px">'+
      escH(r.detalle)+'</div>' : '')+'</div>');
}

/* Los dos manejadores que había aquí —`guardarCredencialesShalom` y
   `conectarCuentaShalom`— se fundieron en `conectarShalomUno()`, arriba.
   Eran dos pasos que el dueño tenía que encadenar a mano, y el estado de en
   medio no servía para nada. */

async function regComprobarSesion(){
  const id = (S.shalomInstancia||{}).id;
  if(!id){ toast('Elige tu cuenta de Shalom Pro en ⚙️ Config'); return; }
  _regComprobarInstancia(true);   // y que la fila se entere, no solo el aviso
  if(!window.Shalom || !window.Shalom.estadoSesion){ toast('⚠️ Shalom no disponible'); return; }
  toast('🔌 Comprobando…');
  let r = null;
  try{ r = await window.Shalom.estadoSesion(id); }catch(e){ r = null; }
  if(r && r.ok){ toast('✅ Sesión de Shalom conectada'); return; }
  const m = (r && r.motivo) || 'SIN_RED';
  toast('⚠️ ' + (window.Shalom.textoMotivo ? window.Shalom.textoMotivo(m) : m));
}

/* ★ EL CLIC QUE CUESTA DINERO.
   Todo se vuelve a comprobar aquí, justo antes de llamar: entre que se pintó
   el bloque y pulsaste pudo cambiar cualquier cosa (otra pestaña, el barrido,
   tú mismo). Lo pintado es un aviso; lo que manda es esta comprobación. */
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
      /* ⚠️ EL BOTÓN SE APAGA ANTES DE LLAMAR Y NO SE VUELVE A ENCENDER.
         No es un detalle de estilo: dos clics son dos envíos y dos cobros que
         nadie puede anular. Se le quita hasta el onclick. */
      if(btn){
        btn.disabled = true; btn.onclick = null; btn.style.opacity = '.45';
        btn.style.cursor = 'default'; btn.textContent = '⏳ Registrando…';
      }
      let r = null;
      try{ r = await window.Shalom.registrarEnvio(ped.id); }catch(e){ r = null; }
      _aplicarRegistroShalom(ped, r);
      /* NO SE RELANZA NUNCA. `confirmar` vuelve a habilitar SU botón cuando
         `alConfirmar` lanza, y ofrecer ahí un reintento sería ofrecer un
         segundo envío. Los tres finales se cuentan abajo, en su sitio. */
    }
  });
}

/* ★ LOS TRES FINALES. No dos: éxito, fallo y DUDA.
   Shalom no anula y no tiene clave de idempotencia, así que llamar "fallo" a
   una duda invita a reintentar — y un reintento sobre un envío que sí se creó
   es un segundo paquete y un segundo cobro. La duda tiene su propia salida, y
   es de SOLO LECTURA. */
function _aplicarRegistroShalom(ped, r){
  /* ★ EL RASTRO. Un registro cuesta dinero y pasa UNA vez: si la respuesta
     no queda escrita en algún sitio, lo único que te queda cuando algo sale
     raro es el recuerdo. Y `forma` —los NOMBRES de los campos que devolvió
     Shalom, sin un solo valor— es lo que permite cerrar el traductor cuando
     un campo no llega donde lo esperábamos; pasó con el monto.
     Se deja fuera `cuerpo`: en simulacro lleva el nombre, el DNI y el
     teléfono del cliente, y eso no tiene por qué quedar en una consola que
     cualquiera puede estar mirando por encima del hombro. */
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
    toast('✅ Registrado — guía '+(r.campos.shalomGuia||''));
    return;
  }

  const mot = (r && r.motivo) || 'SIN_RED';
  const txt = (window.Shalom && window.Shalom.textoMotivo) ? window.Shalom.textoMotivo(mot) : mot;

  /* DUDA: se cortó y NO sabemos si el envío llegó a crearse. */
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

  /* FALLO: Shalom dijo que no. Se dice UNA vez, con sus palabras, y sin
     ningún botón que invite a volver a intentarlo a ciegas. */
  _regSalida(_regServidorViejo(ped, r)+'<span style="color:var(--red)">❌ '+escH(txt)+'</span>'+
    (r && r.detalle ? '<div style="color:var(--text2);margin-top:3px">'+escH(r.detalle)+'</div>' : '')+
    (r && r.faltan && r.faltan.length ?
      '<ul style="margin:5px 0 0;padding-left:16px;color:var(--text2)">'+
      r.faltan.map(f=>'<li>'+escH(f)+'</li>').join('')+'</ul>' : ''));
  toast('❌ No se registró');
}

/* ★ LO QUE TRAE EL SERVIDOR, AL PEDIDO (11/11/2026). El servidor de la
   Fase 1 ya trae la marca de Shalom Pro y la nota privada con la clave. Uno
   SIN DESPLEGAR no: entonces el panel la completa él mismo —la clave y la
   guía las tiene a mano— y avisa, para que no quede en silencio que el
   servidor está atrasado. Pasó de verdad: la nota quedó vacía. */
function _regAplicarCampos(ped, campos){
  Object.assign(ped, campos);
  if(campos.shalomPor === 'pro') return;
  ped.shalomPor = 'pro';
  if(window.RegistroShalom && window.RegistroShalom.notaConClave && ped.shalomGuia && ped.shalomClave){
    ped.privateNote = window.RegistroShalom.notaConClave(ped.privateNote, ped.shalomClave, ped.shalomGuia);
  }
  toast('⚠️ El servidor no está actualizado — corre «firebase deploy --only functions». La clave se anotó desde el panel.');
}

/* Un servidor sin la Fase 1 rechaza lo que el panel ya permite (caja sin
   medidas, ALISTADO). Si el rechazo es ESE, se dice qué hacer. */
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

/* SOLO LEE: busca el envío entre los pendientes de Shalom por clave y destino
   y rellena la guía. No registra, así que no puede costar ni duplicar. */
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
  if(el.value) return;                       // ya tiene una: no se pisa
  // Un pedido con guía ya está registrado en Shalom: generarle una clave
  // nueva aquí sería darle al cliente un número que no abre nada.
  if(($('fShalomGuia')||{value:''}).value.trim()) return;
  if(!window.Shalom || typeof Shalom.claveRecojo !== 'function') return;
  el.value = Shalom.claveRecojo();
}
