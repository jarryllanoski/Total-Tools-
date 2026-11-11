/**
 * panel/pedidos/pedido-form.js — abrir el formulario del pedido, cliente recurrente, pegar de WhatsApp
 * ============================================================================================
 * Fase 3 (10/11/2026): el panel en módulos. Antes vivía en config.js.
 * Script CLÁSICO a propósito: sus funciones y variables son globales, igual
 * que cuando estaban en un solo archivo — moverlas no cambió ni una llamada.
 * El orden de los <script> en index.html es el orden de ejecución.
 */
function openForm(id){
  // Resetear acordeón de documentos a cerrado
  var body = document.getElementById('docsBody');
  var arrow = document.getElementById('docsArrow');
  if(body) body.classList.remove('open');
  if(arrow) arrow.classList.remove('open');
  _editId=id;$('formTitle').textContent=id?'Editar Envío':'Nuevo Envío';
  /* La agencia identificada del pedido que se abre. Un pedido antiguo no la
     tiene y no pasa nada: funciona igual que siempre, solo que el aviso dirá
     "sin identificar" mientras no elijas de la lista. */
  _agElegida = null; _agTexto = '';
  _dniPedido = ''; if(typeof _dniAviso==='function') _dniAviso('');
  if($('fShalomClave')) $('fShalomClave').value = '';
  if(id && window.Agencias){
    const _s0 = (S.shipments||[]).find(x=>x.id===id);
    if(_s0 && Agencias.identificada(_s0)){
      _agElegida = {agenciaId:_s0.agenciaId, agenciaNombre:_s0.agenciaNombre||'',
        agenciaGeo:_s0.agenciaGeo||'', agenciaCourier:_s0.agenciaCourier};
      // El texto de referencia es el que YA tiene el pedido: si no lo tocas,
      // el id sobrevive a abrir y guardar.
      _agTexto = _s0.address||'';
    }
  }
  if($('fPaste')) $('fPaste').value='';   // limpiar el pegado al abrir
  if(typeof _pasteClearToggle==='function') _pasteClearToggle();
  _clienteMatch=null; if($('clienteHint')){ $('clienteHint').style.display='none'; $('clienteHint').innerHTML=''; }
  // Panel de gestión: SIEMPRE todos los couriers disponibles (independiente
  // de qué esté activo en el formulario público del cliente).
  $('fCourier').innerHTML = (S.couriers||[]).map(c=>`<option>${c}</option>`).join('');
  $('fStatus').innerHTML=allStatuses().map(s=>`<option>${s}</option>`).join('');
  $('extraForm').innerHTML=S.extraFields.map(f=>`<div class="fg"><label class="fl">${f}</label><input class="fi xf" data-f="${f}" placeholder="${f}..."></div>`).join('');
  _docs={guia:null,embalado:null,ticket:null};_links=[];
  refreshSlot('guia');refreshSlot('embalado');refreshSlot('ticket');renderLinks();
  _loadMontoFields(null);   // limpiar monto/adelanto/deuda (pedido nuevo); el edit lo sobreescribe
  ['inGuiaCam','inGuiaGal','inGuiaPdf','inEmbCam','inEmbGal','inEmbPdf','inTicketCam','inTicketGal','inTicketPdf'].forEach(i=>{const e=$(i);if(e)e.value=''});
  if(id){
    const s=S.shipments.find(x=>x.id===id);
    if(!s){toast('⚠️ Recarga la página e intenta de nuevo');return;}
    $('fName').value=s.name;$('fPhone').value=s.phone;if($('fDni'))$('fDni').value=s.dni||'';
    /* ★ Al abrir un pedido con DNI, se vuelve a consultar RENIEC.
       No cuesta: `Shalom.dni` cachea en el navegador y un DNI ya consultado
       no se vuelve a preguntar nunca. Lo que SI consigue es que el pedido
       gane el nombre PARTIDO al guardarlo — sin esto, un pedido creado
       antes de que existiera ese campo no lo gana jamas aunque tenga el DNI
       puesto y el nombre en pantalla, y el registro dice "falta el nombre
       de RENIEC" sin que se entienda por que. */
    if(s.dni && typeof _dniReniec==='function') _dniReniec(s.dni);
    const _isEncEdit=(s.courier||'').toUpperCase().includes('ENCOMIENDA');
    $('fAddr').value=_isEncEdit?(s.ciudadDestino||s.address||''):s.address;
    if($('fEncAgencia'))$('fEncAgencia').value=s.encAgencia||'';
    $('fCourier').value=s.courier;$('fDate').value=s.date;
    /* ★ Un pedido cuya etiqueta se borró: su estado no está en la lista, y
       el <select> quedaba vacío — al guardar, el pedido perdía el estado sin
       aviso. Se añade su estado actual para que se conserve tal cual. */
    if(s.status && !S.labels.includes(s.status)){
      const o=document.createElement('option'); o.value=s.status; o.textContent=s.status+' (sin etiqueta)';
      $('fStatus').appendChild(o);
    }
    $('fStatus').value=s.status;
    $('fNotes').value=s.notes||'';_loadMontoFields(s);
    if($('fComprobante'))$('fComprobante').value=_nroDe(s);
    document.querySelectorAll('.xf').forEach(el=>{el.value=(s.extra&&s.extra[el.dataset.f])||''});
    if(s.docGuia){_docs.guia=s.docGuia;refreshSlot('guia')}
    if(s.docEmbalado){_docs.embalado=s.docEmbalado;refreshSlot('embalado')}
    if(s.docTicket){_docs.ticket=s.docTicket;refreshSlot('ticket')}
    // Si tiene documentos, abrir el acordeón automáticamente
    if(s.docGuia||s.docEmbalado||s.docTicket){
      var body=document.getElementById('docsBody');
      var arrow=document.getElementById('docsArrow');
      if(body) body.classList.add('open');
      if(arrow) arrow.classList.add('open');
    }
    _links=s.links?JSON.parse(JSON.stringify(s.links)):[];renderLinks();
  }else{
    ['fName','fPhone','fAddr','fNotes'].forEach(i=>$(i).value='');if($('fDni'))$('fDni').value='';if($('fComprobante'))$('fComprobante').value='';if($('fEncAgencia'))$('fEncAgencia').value='';
    $('fDate').valueAsDate=new Date();
    // Courier por defecto: SHALOM (siempre está en la lista del panel)
    if($('fCourier')){ const _sh=Array.from($('fCourier').options).find(o=>(o.value||'').toUpperCase().includes('SHALOM')); if(_sh) $('fCourier').value=_sh.value; }
  }
  // ★ SHALOM + ENCOMIENDA: show/hide bloques según courier
  const _showShalomBlock = () => {
    const c = ($('fCourier').value||'').toUpperCase();
    const b = $('shalomGuiaBlock');
    const isShalom = c.includes('SHALOM');
    if(b) b.style.display = isShalom ? 'block' : 'none';
    // DELIVERY: bloque motorizado (mismo criterio por courier que Shalom)
    const dbk = $('dlvDriverBlock');
    if(dbk) dbk.style.display = c.includes('DELIVERY') ? 'block' : 'none';
    const isEnc = c.includes('ENCOMIENDA');
    _agPintar();
    /* El TEXTO, no la etiqueta entera: dentro vive ahora la marca de agencia
       identificada, y `textContent` sobre el padre se la llevaba por delante. */
    const addrLbl = document.getElementById('fAddrLabelTxt');
    const encGrp  = document.getElementById('fEncAgenciaGroup');
    if(addrLbl) addrLbl.textContent = isEnc ? 'Ciudad destino *' : 'Dirección *';
    if(encGrp)  encGrp.style.display = isEnc ? '' : 'none';
    // SHALOM: precargar agencias para búsqueda instantánea; si no, ocultar dropdown
    // Al aparecer el bloque de Shalom es cuando la clave hace falta: antes no
    // se sabía que este pedido iba por ahí, y generarla en un pedido de
    // DELIVERY sería un campo lleno que no significa nada.
    if(isShalom){ _claveAuto(); if(typeof _panelShalomLoad==='function') _panelShalomLoad(); }
    else { const d=$('shDrop'); if(d) d.style.display='none'; }
    if(typeof _updateShalomMic==='function') _updateShalomMic();
    if(typeof _pintarRegistroShalom==='function') _pintarRegistroShalom();
  };
  $('fCourier').onchange = function(){ _showShalomBlock(); _agPintar(); };
  if(id){
    const s=S.shipments.find(x=>x.id===id);
    if(s){
      if($('fShalomClave'))  $('fShalomClave').value  = s.shalomClave||'';
    if(typeof _congelarSiRegistrado==='function') _congelarSiRegistrado(s);
      if($('fShalomGuia'))   $('fShalomGuia').value   = s.trackingOrderNumber||s.shalomGuia||'';
      if(window.Guias) Guias.vigilar('fShalomGuia', id); // avisos: formato y guía repetida
      if($('fShalomCodigo')) $('fShalomCodigo').value = s.trackingOrderCode||s.shalomCodigo||'';
      if($('fDlvDriver'))      $('fDlvDriver').value      = s._dlvDriver||'';
      if($('fDlvDriverPhone')) $('fDlvDriverPhone').value = s._dlvDriverPhone||'';
      if($('fDlvRutaLink'))    $('fDlvRutaLink').value    = s._dlvRutaLink||'';
      if($('fPkgLargo')) $('fPkgLargo').value = s.pkgLargo||'';
      if($('fPkgAncho')) $('fPkgAncho').value = s.pkgAncho||'';
      if($('fPkgAlto'))  $('fPkgAlto').value  = s.pkgAlto||'';
      if($('fPkgPeso'))  $('fPkgPeso').value  = s.pkgPeso||'';
      if($('fPkgCaja'))  $('fPkgCaja').value  = s.pkgCaja||'';
      // Las medidas se ven si las había (y no eligió caja): no se esconde lo escrito.
      window._pkgMedir = !s.pkgCaja && !!(s.pkgLargo||s.pkgAncho||s.pkgAlto||s.pkgPeso);
      _regPrepararForm();
      if(typeof _pkgClasificar==='function') _pkgClasificar(); // pinta el tipo ya guardado
      _pintarShalomEstado(s.trackingStatus);
    }
  } else {
    _pintarShalomEstado('');
    if($('fShalomGuia'))   $('fShalomGuia').value   = '';
    if($('fShalomCodigo')) $('fShalomCodigo').value = '';
    if($('fDlvDriver'))      $('fDlvDriver').value      = '';
    if($('fDlvDriverPhone')) $('fDlvDriverPhone').value = '';
    if($('fDlvRutaLink'))    $('fDlvRutaLink').value    = '';
    if($('fPkgLargo')) $('fPkgLargo').value = '';
    if($('fPkgAncho')) $('fPkgAncho').value = '';
    if($('fPkgAlto'))  $('fPkgAlto').value  = '';
    if($('fPkgPeso'))  $('fPkgPeso').value  = '';
    if($('fPkgCaja'))  $('fPkgCaja').value  = '';
    window._pkgMedir = false;
    _regPrepararForm();
    if(typeof _pkgClasificar==='function') _pkgClasificar(); // limpia el badge
    /* ⚠️ EL VIGILANTE, DESPUÉS DE LIMPIAR. Estaba veinte líneas MÁS ARRIBA,
       y `Guias.vigilar` pinta en el acto: leía el campo cuando todavía tenía
       la guía del pedido anterior y dejaba «⚠️ Esta guía ya está en otro
       pedido» colgado sobre un campo que se vaciaba justo después.

       Vaciar un campo por código NO dispara `input`, así que nadie volvía a
       pintar y el aviso se quedaba ahí, hablando de un pedido que no tenía
       nada que ver con el que estabas creando.

       Un vigilante que mira antes de que el mundo esté listo no vigila:
       informa de lo de antes. */
    if(window.Guias) Guias.vigilar('fShalomGuia', '');
  }
  _showShalomBlock();
  if($('fPaste')) $('fPaste').value='';
  window._waPasteUsed = false;  // reiniciar: buscador de agencias disponible de nuevo
  // Caja "Pegar pedido de WhatsApp": solo en pedido NUEVO (no al editar)
  if($('fPasteBox')) $('fPasteBox').style.display = id ? 'none' : 'block';
  openOverlay('formOverlay');
  // Snapshot del estado inicial (para saber si luego se ensució).
  window._formSnap = (typeof _formSnapshot==='function') ? _formSnapshot() : '';
}

/* ★ EL DNI DE UN PEDIDO — una sola regla, en functions/dniPedido.js.
   El 13/10/2026 el dueño corrigió un destinatario y la etiqueta siguió
   imprimiendo el documento del anterior: el mismo dato vivía en tres campos
   (`dni`, `dniRecoger`, `dniDestinatario`), el panel al editar solo tocaba
   el primero, y cada uno de los nueve lectores tenía su propio orden. */
function _dniDe(p){
  return window.DniPedido ? DniPedido.de(p)
    : String((p&&(p.dni||p.dniRecoger||p.dniDestinatario))||'').trim();
}

/* ── RELLENAR CLIENTE RECURRENTE (por teléfono o DNI, solo en Nuevo Envío) ──
   Se deriva del historial que ya está en memoria (`S.shipments`): sin
   colección nueva, sin una sola lectura de Firestore, sin reglas nuevas.

   ⚠️ Y NO HACE FALTA UNA FICHA DE CLIENTE. Sería una SEGUNDA CASA del mismo
   dato —el nombre y el DNI vivirían en el pedido y en la ficha— y el día que
   no coincidan hay que decidir cuál manda. Esa es, palabra por palabra, la
   historia del DNI en tres campos que costó dos días. El historial de
   pedidos YA ES el historial del cliente. */
var _clienteOpciones=[], _cliTimer=null;
function _norm9(s){ let v=(s||'').replace(/\D/g,''); if(v.startsWith('51')&&v.length>9) v=v.slice(2); return v.slice(-9); }

/* ★ LO QUE SE COPIA DE UN CLIENTE. LISTA CERRADA, NO UN COMENTARIO.
   Antes esto eran seis `setIfEmpty` sueltos y un comentario que prometía
   «NO se toca: fecha, estado, monto, notas, guía/código». Un comentario no
   impide nada — es la misma clase de promesa que el «fuente única =
   order.dni» que el código incumplía mientras hacía tres copias.

   LO DE SHALOM NO ES DEL CLIENTE, ES DE ESE ENVÍO: la guía, el código, la
   clave de recojo, el «registrado» y las medidas del paquete nacen y mueren
   con un paquete concreto. Copiarlos daría por registrado un pedido que no
   existe, y le daría al cliente una clave que no abre nada.

   LA AGENCIA SÍ: es del cliente. Dónde recoge no cambia cada semana, y sin
   el `agenciaId` el pedido es irregistrable y hay que volver a buscarla a
   mano en cada envío repetido.

   Hay una prueba que fija esta lista. */
var CLIENTE_COPIA = ['name', 'phone', 'dni', 'address', 'encAgencia',
  'courier', 'agenciaId', 'agenciaNombre', 'agenciaGeo', 'agenciaCourier'];

/** El más recientemente CORREGIDO, no el más reciente. */
function _cliMasReciente(L){
  return L.slice().sort(function(a,b){
    const k=function(x){ return String(x.updatedAt||x.createdAt||x.date||''); };
    return k(b).localeCompare(k(a));
  })[0];
}

/* ★ CUÁL DE LOS CLIENTES — Y POR QUÉ AQUÍ NO SE ADIVINA.
   El teléfono 940703156 del dueño pertenece a DOS personas distintas: DUBER
   GARCÍA PEÑA (DNI 76307875) y JOSE LINO CORDOVA MORETO (44049239). Antes se
   cogía «el más reciente» EN SILENCIO, así que escribir ese número rellenaba
   el nombre y el documento de una de las dos sin decir que había otra — y la
   etiqueta salía con el DNI de otra persona, por el mismo camino que ya
   arreglamos una vez.

   Es la regla que el proyecto ya aplica a las instancias y a las agencias:
     · Adivinar  = elegir entre varias cuando no se sabe cuál. Prohibido.
     · Preguntar = enseñarlas y que elija el dueño. Eso sí.

   EL DNI ES LA PERSONA; el teléfono es un punto de contacto y se comparte.
   Por eso el DNI, cuando se escribe, manda y no hay ambigüedad posible.

   Solo se considera que hay varias cuando se puede AFIRMAR que son personas
   distintas: dos DNI diferentes, o —si ninguno tiene DNI— dos nombres
   diferentes. Un pedido sin DNI nunca parte en dos a alguien que sí lo
   tiene: sería preguntar por un dato que falta, no por una contradicción.
   @param {Array} lista los pedidos
   @param {string} keyPh teléfono de 9 dígitos, o ''
   @param {string} keyDni DNI de 8 dígitos, o ''
   @return {Object} {estado:'uno'|'varios'|'ninguno', uno, varios} */
function _clienteElegir(lista, keyPh, keyDni){
  const L = Array.isArray(lista) ? lista.filter(function(x){
    return x && typeof x === 'object'; }) : [];
  const dniDe = function(x){ return _dniDe(x).replace(/\D/g,''); };

  if(keyDni){
    const porDni = L.filter(function(x){ return dniDe(x) === keyDni; });
    if(porDni.length) return {estado:'uno', uno:_cliMasReciente(porDni)};
  }
  if(!keyPh) return {estado:'ninguno'};

  const porPh = L.filter(function(x){ return _norm9(x.phone) === keyPh; });
  if(!porPh.length) return {estado:'ninguno'};

  const dnis = [];
  porPh.forEach(function(x){
    const d = dniDe(x);
    if(d && dnis.indexOf(d) < 0) dnis.push(d);
  });
  if(dnis.length > 1){
    return {estado:'varios', varios: dnis.slice(0,4).map(function(d){
      return _cliMasReciente(porPh.filter(function(x){ return dniDe(x)===d; }));
    })};
  }
  if(!dnis.length){
    // Sin ningún DNI, lo único que distingue a dos personas es el nombre.
    const noms = [];
    porPh.forEach(function(x){
      const n = String(x.name||'').trim().toUpperCase();
      if(n && noms.indexOf(n) < 0) noms.push(n);
    });
    if(noms.length > 1){
      return {estado:'varios', varios: noms.slice(0,4).map(function(n){
        return _cliMasReciente(porPh.filter(function(x){
          return String(x.name||'').trim().toUpperCase()===n; }));
      })};
    }
  }
  return {estado:'uno', uno:_cliMasReciente(porPh)};
}

function _clienteBuscar(){
  if(_editId) return {estado:'ninguno'};   // solo en Nuevo Envío
  const ph=_norm9(($('fPhone')||{value:''}).value);
  const dni=(($('fDni')||{value:''}).value||'').replace(/\D/g,'');
  const keyPh  = ph.length===9  ? ph  : '';
  const keyDni = dni.length===8 ? dni : '';
  if(!keyPh && !keyDni) return {estado:'ninguno'};
  return _clienteElegir(S.shipments||[], keyPh, keyDni);
}

function _clienteHintUpdate(){
  clearTimeout(_cliTimer);
  _cliTimer=setTimeout(function(){
    const box=$('clienteHint'); if(!box) return;
    const r=_clienteBuscar()||{estado:'ninguno'};
    _clienteOpciones = r.estado==='uno' ? [r.uno]
      : (r.estado==='varios' ? r.varios : []);
    if(!_clienteOpciones.length){
      box.style.display='none'; box.innerHTML=''; return; }
    box.innerHTML='';
    if(r.estado==='varios'){
      /* ⚠️ NO SE ELIGE SOLO. Dos personas en el mismo teléfono es un caso
         real de este negocio, y rellenar «la más reciente» pone el DNI de
         una en el paquete de la otra. */
      const t=document.createElement('div');
      t.style.cssText='font-size:11.5px;color:#d29922;font-weight:700;margin-bottom:6px;line-height:1.45';
      t.textContent='⚠️ Ese teléfono tiene '+_clienteOpciones.length+
        ' clientes distintos — elige cuál:';
      box.appendChild(t);
    }
    _clienteOpciones.forEach(function(m,i){
      const btn=document.createElement('button');
      btn.type='button';
      btn.style.cssText='width:100%;text-align:left;background:rgba(34,197,94,.10);border:1px solid rgba(34,197,94,.35);border-radius:9px;padding:9px 11px;color:#22c55e;font-weight:700;font-size:12.5px;cursor:pointer;font-family:inherit;margin-bottom:5px';
      /* ★ SE ENSEÑA QUÉ VA A RELLENAR, no solo el nombre. Una sugerencia que
         no dice qué trae se acepta a ciegas, y el día que trae el DNI de
         otro nadie lo mira. */
      const _cd=_dniDe(m).replace(/\D/g,''), _cp=_norm9(m.phone);
      btn.textContent=(_clienteOpciones.length>1?'👤 ':'🌟 Cliente conocido: ')+
        (m.name||'—')+(_cd?' · DNI '+_cd:'')+
        (_clienteOpciones.length>1?'':(_cp?' · '+_cp:''))+
        (_clienteOpciones.length>1?'':' — toca para rellenar');
      btn.onclick=function(){ _clienteRellenar(i); };
      box.appendChild(btn);
    });
    box.style.display='block';
  }, 250);
}

function _clienteRellenar(i){
  const m=_clienteOpciones[i||0]; if(!m) return;
  const setIfEmpty=function(id,val){ const e=$(id); if(e && !e.value.trim() && val) e.value=String(val); };
  setIfEmpty('fName', m.name);
  setIfEmpty('fPhone', _norm9(m.phone));
  setIfEmpty('fDni', _dniDe(m).replace(/\D/g,''));
  const isEnc=(m.courier||'').toUpperCase().includes('ENCOMIENDA');
  const dirDe=isEnc?(m.ciudadDestino||m.address||''):(m.address||'');
  setIfEmpty('fAddr', dirDe);
  setIfEmpty('fEncAgencia', m.encAgencia||'');
  // Courier habitual (dispara el cambio de bloque agencia/encomienda).
  if(m.courier && $('fCourier')){
    const opt=Array.from($('fCourier').options).find(o=>(o.value||'').toUpperCase()===String(m.courier).toUpperCase());
    if(opt){ $('fCourier').value=opt.value; $('fCourier').dispatchEvent(new Event('change')); }
  }
  /* ★ LA AGENCIA IDENTIFICADA VIAJA — y con la misma regla que todo el
     proyecto: el id sobrevive SOLO si el texto de la dirección es
     literalmente el de esa agencia.

     Sin esto, el pedido repetido salía con la dirección de la agencia
     escrita y «sin identificar» por dentro: irregistrable en Shalom hasta
     volver a buscarla a mano, cada vez.

     Y si el campo de dirección ya tenía algo escrito, `setIfEmpty` no lo
     pisa — entonces el texto NO es el de esta agencia y el id tampoco se
     pone. Un id pegado a una dirección que no es la suya es cómo se manda
     un paquete pagado a otra ciudad. */
  if(window.Agencias && Agencias.identificada(m) &&
     ($('fAddr')||{value:''}).value === dirDe && dirDe){
    _agElegida = {agenciaId:m.agenciaId, agenciaNombre:m.agenciaNombre||'',
      agenciaGeo:m.agenciaGeo||'', agenciaCourier:m.agenciaCourier};
    _agTexto = dirDe;
    if(typeof _agPintar==='function') _agPintar();
  }
  /* NO se copia NADA de Shalom ni del paquete: guía, código, clave,
     registrado, medidas. Ver CLIENTE_COPIA, que es la lista de verdad. */
  if(typeof toast==='function') toast('✅ Datos de '+(m.name||'cliente')+' rellenados');
  const box=$('clienteHint'); if(box){ box.style.display='none'; }
}

/* ── PEGAR PEDIDO DE WHATSAPP → autocompletar campos ──────────────── */
function _spanishDateToIso(str){
  const meses={enero:'01',febrero:'02',marzo:'03',abril:'04',mayo:'05',junio:'06',julio:'07',agosto:'08',septiembre:'09',setiembre:'09',octubre:'10',noviembre:'11',diciembre:'12'};
  const m=(str||'').toLowerCase().match(/(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})/);
  if(!m) return '';
  const mes=meses[m[2]];
  if(!mes) return '';
  return `${m[3]}-${mes}-${m[1].padStart(2,'0')}`;
}
function parseWAOrder(){
  const txt=($('fPaste')?$('fPaste').value:'')||'';
  if(!txt.trim()){ toast('⚠️ Pega el mensaje de WhatsApp primero'); return; }
  const clean=s=>(s||'').replace(/\*/g,'').trim();
  const grab=re=>{ const m=txt.match(re); return m?clean(m[1]):''; };
  const name   =grab(/Cliente:?\*?\s*(.+)/i);
  const phoneR =grab(/WhatsApp:?\*?\s*([+\d\s]+)/i);
  const addr   =grab(/(?:Agencia|Direcci[oó]n):?\*?\s*(.+)/i);
  const ciudad =grab(/Ciudad destino:?\*?\s*(.+)/i);
  const dni    =grab(/DNI(?:\s+para\s+recoger|\s+destinatario)?:?\*?\s*(\d{6,8})/i);
  const courier=grab(/Courier:?\*?\s*(.+)/i);
  const fechaR =grab(/Fecha de env[ií]o:?\*?\s*(.+)/i);
  const notas  =grab(/Notas:?\*?\s*(.+)/i);
  let filled=0;
  if(name){ $('fName').value=name; filled++; }
  if(phoneR){
    let v=phoneR.replace(/\D/g,'');
    if(v.startsWith('51')&&v.length>9) v=v.slice(2);
    v=v.slice(-9);
    if(v){ $('fPhone').value=v; filled++; }
  }
  const addrVal=addr||ciudad;
  if(addrVal){ $('fAddr').value=addrVal; filled++; }
  if(ciudad&&!addr&&$('fEncAgencia')){ /* encomienda: dejar dirección como ciudad */ }
  if(dni&&$('fDni')){ $('fDni').value=dni; filled++; }
  if(courier){
    const sel=$('fCourier');
    const opt=Array.from(sel.options).find(o=>o.value.toUpperCase().trim()===courier.toUpperCase().trim());
    if(opt){ sel.value=opt.value; filled++; }
    sel.dispatchEvent(new Event('change'));
  }
  if(fechaR){ const iso=_spanishDateToIso(fechaR); if(iso){ $('fDate').value=iso; filled++; } }
  if(notas){ $('fNotes').value=notas; filled++; }
  if(filled>0){
    // Pegado de WhatsApp reconocido: la dirección ya viene completa, así que
    // NO activar el buscador de agencias Shalom (solo aplica en llenado manual).
    window._waPasteUsed = true;
    const _d=$('shDrop'); if(_d) _d.style.display='none';
    toast('✅ '+filled+' campo'+(filled!==1?'s':'')+' rellenado'+(filled!==1?'s':''));
  }
  else toast('⚠️ No se reconoció el formato del mensaje');
}

/* ── BÚSQUEDA DE AGENCIAS SHALOM en el campo Dirección (courier SHALOM) ──
   Mismo JSON y misma calidad de búsqueda que el formulario público.       */
let _shTimer=null;
/* Versión del catálogo = fecha de `meta.generado` de data/agencias-shalom.json.
   La MISMA que AGENCY_SOURCES.SHALOM.version en formulario.html (hay prueba). */
const SHALOM_CATALOGO_V='2026-11-11';
async function _panelShalomLoad(){
  if(window._shalomData && window._shalomData.length) return window._shalomData;
  // 1) cache localStorage (24 h) — solo si es de ESTA versión del catálogo
  try{
    const c=localStorage.getItem('shalom_agencias_cache');
    const t=parseInt(localStorage.getItem('shalom_agencias_time')||'0');
    const v=localStorage.getItem('shalom_agencias_ver');
    if(c && v===SHALOM_CATALOGO_V && (Date.now()-t)<86400000){ window._shalomData=JSON.parse(c); return window._shalomData; }
  }catch(e){}
  // 2) JSON local (con ?v= para que el navegador no sirva la copia vieja)
  try{
    const r=await fetch('data/agencias-shalom.json?v='+SHALOM_CATALOGO_V);
    if(r.ok){
      const j=await r.json();
      const lista=j.agencias||j.data||j||[];
      if(Array.isArray(lista)&&lista.length){
        window._shalomData=lista;
        try{ localStorage.setItem('shalom_agencias_cache',JSON.stringify(lista)); localStorage.setItem('shalom_agencias_time',String(Date.now())); localStorage.setItem('shalom_agencias_ver',SHALOM_CATALOGO_V); }catch(e){}
        return lista;
      }
    }
  }catch(e){ console.warn('[Shalom panel] JSON no disponible:',e.message); }
  return [];
}
function _panelShalomSearch(q){
  const data=window._shalomData||[];
  const nrm=s=>String(s==null?'':s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  const qu=nrm(q);
  const claveM=[], dirM=[];
  data.forEach((ag,idx)=>{
    const clave=nrm([ag.lugar_over||ag.nombre, ag.zona||ag.distrito, ag.provincia, ag.departamento].join(' '));
    const extra=nrm(ag.direccion);
    let score;
    if(clave.indexOf(qu)===0) score=0;
    else if((' '+clave).indexOf(' '+qu)!==-1) score=1;
    else if(clave.indexOf(qu)!==-1) score=2;
    else { if(extra.indexOf(qu)!==-1) dirM.push({ag,idx}); return; }
    claveM.push({ag,score,idx});
  });
  claveM.sort((a,b)=>a.score-b.score||a.idx-b.idx);
  let res=claveM.map(x=>x.ag);
  if(res.length<8) res=res.concat(dirM.map(x=>x.ag));
  return res.slice(0,8);
}
function onAddrInput(val){
  // Repinta el aviso mientras escribes: si rompiste la correspondencia con la
  // agencia elegida, lo ves en el momento y no al intentar registrar.
  _agPintar();
  const drop=$('shDrop'); if(!drop) return;
  // Si se pegó un pedido de WhatsApp, la dirección ya está completa: no buscar agencias
  if(window._waPasteUsed){ drop.style.display='none'; return; }
  const isShalom=(($('fCourier')||{value:''}).value||'').toUpperCase().includes('SHALOM');
  if(!isShalom){ drop.style.display='none'; return; }
  clearTimeout(_shTimer);
  const q=(val||'').trim();
  if(q.length<2){ drop.style.display='none'; return; }
  _shTimer=setTimeout(async()=>{
    await _panelShalomLoad();
    const res=_panelShalomSearch(q);
    if(!res.length){
      drop.innerHTML='<div style="padding:12px 14px;text-align:center;font-size:12px;color:var(--text2)">🔍 Sin resultados — busca por ciudad, distrito o nombre de agencia</div>';
      drop.style.display='block'; return;
    }
    window._panelShCache=res;
    drop.innerHTML=res.map((ag,i)=>{
      const nombre=ag.lugar_over||ag.nombre||'—';
      const geo=[ag.zona||ag.distrito,ag.provincia,ag.departamento].filter(Boolean).join(' · ');
      const dir=ag.direccion||'';
      return `<div onclick="pickShalomAgency(${i})" style="padding:9px 12px;border-bottom:1px solid var(--bd);cursor:pointer" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
        <div style="font-weight:700;font-size:12px;color:var(--text)">${esc(nombre)}</div>
        ${geo?`<div style="font-size:11px;color:var(--blue);margin-top:2px">${esc(geo)}</div>`:''}
        ${dir?`<div style="font-size:11px;color:var(--text2);margin-top:2px;line-height:1.4">${esc(dir)}</div>`:''}
      </div>`;
    }).join('');
    drop.style.display='block';
  },300);
}
