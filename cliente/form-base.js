'use strict';

let selCourierName = '';
let selCourierType = '';
let selDateIso     = '';
let selDateLbl     = '';
window.selDate = function(iso, lbl) {
  selDateIso = iso; selDateLbl = lbl;
  document.querySelectorAll('.date-opt').forEach(function(el){ el.classList.remove('active'); });
  var el = document.getElementById('dopt_'+iso);
  if (el) el.classList.add('active');
  var errEl = document.getElementById('err_date');
  if (errEl) errEl.classList.remove('show');
};
let agState        = {dept:'',prov:'',dist:'',addr:''};
let currentToken   = '';
let _phoneTimer    = null;
let _knownClient   = null;
let _prefillName   = '';
let _prefillPhone  = '';
let _prefillLink   = '';
let _gpsLat        = null;
let _gpsLon        = null;

function init(){

  const tok = new URLSearchParams(location.search).get('t') || '';
  if(tok){ checkToken(tok); return; }

  const saved = localStorage.getItem('dpanel_order_'+wsId);
  if(saved){
    try{
      const o = JSON.parse(saved);
      if(o.trackToken){ location.replace('seguimiento.html?seg=' + encodeURIComponent(o.trackToken)); return; }
    }catch(e){}
  }

  loadCfg();
}

async function checkToken(tok){
  setApp(`<div class="loading-screen"><div class="spin"></div><div class="spin-lbl">Verificando link...</div></div>`);
  try{
    const timeoutP = new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),8000));
    const data = await Promise.race([_api('token', {t: tok}), timeoutP]);
    if(data.status === 'expired'){
      showTokenScreen('⏰','Link vencido','Este link ya venció. Solicitá uno nuevo.');
      return;
    }
    if(data.status === 'used'){
      showTokenScreen('🔒','Link ya utilizado','Este link ya fue utilizado.\nPara registrar un nuevo pedido, solicitá un nuevo link.');
      return;
    }
    if(data.status === 'invalid'){
      showTokenScreen('❌','Link inválido','Este link no existe o fue eliminado.');
      return;
    }
    currentToken = tok;
    if(data.prefillName)  _prefillName  = data.prefillName;
    if(data.prefillPhone) _prefillPhone = data.prefillPhone;
    if(data.prefillLink)  _prefillLink  = data.prefillLink;
    if(data.cfgId) _tokCfgId = String(data.cfgId);
    if(data.cfg || data.vivo) _cfgAdjunta = {cfg: data.cfg || null, vivo: data.vivo || null};
    loadCfg();
  }catch(e){
    if(e.message==='timeout'){
      showTokenScreen('⚠️','Sin conexión','No se pudo verificar el link.\nRevisa tu conexión e intenta de nuevo.');
    } else {
      showTokenScreen('⚠️','Error de conexión','Reintentá más tarde.');
    }
  }
}

function showTokenScreen(icon, title, msg){
  setApp(`<div class="unconf">
    <div class="unconf-icon">${icon}</div>
    <div class="unconf-ttl">${esc(title)}</div>
    <div class="unconf-sub">${esc(msg).replace(/\n/g,'<br>')}</div>
  </div>`);
  if(window.TTFormLoader) TTFormLoader.ready();
}

var _tokCfgId = '';
var _cfgAdjunta = null;

async function loadCfg(){
  CFG = null;
  renderForm();
  try{
    const cfgId = _tokCfgId || new URLSearchParams(location.search).get('cfg');
    const withTO = (pr,ms)=>Promise.race([pr, new Promise(r=>setTimeout(()=>r(null),ms))]);
    let cfg = null;
    const adj = _cfgAdjunta;
    _cfgAdjunta = null;
    if(adj && adj.cfg){
      cfg = adj.cfg;
    } else if(cfgId){
      const snap = await withTO(_api('formcfg', {id: cfgId}), 5000);
      if(snap && !snap.error) cfg = snap;
    }
    if(!cfg || !_cfgHasPhone(cfg)){
      const live = (adj && adj.vivo) || await withTO(_api('config'), 5000);
      if(live && !live.error){
        if(!cfg){ cfg = live; }
        else{
          const lp = live.phone || (live.config && live.config.phone) || '';
          if(lp) cfg.phone = lp;
          if(!(cfg.name||(cfg.config&&cfg.config.name))) cfg.name = live.name || (live.config&&live.config.name) || '';
        }
      }
    }
    if(cfg && !cfg.error){ CFG = cfg; renderForm(); }
  }catch(e){
    console.warn('Config no disponible:', e.message);
  }finally{
    if(window.TTFormLoader) TTFormLoader.ready();
  }
}

function _ayudaFormContenido(e){
  e=e||{};
  var tipo=e.tipo||'', paso=e.paso||1, retiro=tipo==='retiro';
  var dest={
    agencia: e.mapa
      ? 'Toca el botón azul de <b>ubicación</b> o busca tu <b>provincia o distrito</b> con la 🔍 lupa. Luego elige tu sede en la lista o tocando su <b>pin rojo</b>: queda marcada con ✓.'
      : 'Escribe tu ciudad o distrito y toca la sede donde recogerás.',
    delivery: 'Escribe tu dirección de entrega o toca <b>📍 Usar mi ubicación</b> para que el motorizado llegue exacto. Agrega una referencia.',
    encomienda: 'Escribe la <b>ciudad de destino</b> y, si la sabes, la agencia.'
  };
  var pasos=[
    {n:1, t:'Cómo recibir tu pedido', d:'Elige Shalom, delivery, otra agencia o retiro en tienda.'},
    {n:2, t:'Datos de quien recibe', d:'Escribe el <b>DNI</b>: el nombre se completa solo. Luego tu número de <b>WhatsApp</b>.'},
    {n:3, t:'Destino', d: dest[tipo] || 'La sede, tu dirección o la ciudad, según cómo lo recibas.'},
    {n:4, t:'Fecha y confirmar', d:'Elige la fecha de envío y toca <b>Confirmar pedido</b>. Tu pedido queda registrado al instante.'}
  ];
  if(retiro) pasos=pasos.filter(function(p){ return p.n!==3; });
  if(e.unico) pasos=pasos.filter(function(p){ return p.n!==1; });
  var toby;
  if(e.confirmado) toby='¡Listo! 🎉 Tu pedido <b>ya está registrado</b>. Toca <b>Ir a WhatsApp</b> para recibir tu link de seguimiento.';
  else if(paso===1) toby='¡Hola! Soy Toby 🐢, tu guía. Pedir toma menos de un minuto: primero elige <b>cómo quieres recibir</b> tu pedido.';
  else if(paso===2) toby='Empieza por el <b>DNI</b> de quien recibe: así su nombre sale exacto, sin errores en la etiqueta.';
  else if(paso===3) toby=({
    agencia: e.mapa ? 'Toca el botón azul de <b>ubicación</b> o busca tu <b>provincia o distrito</b> con la 🔍 lupa: te muestro tus sedes.' : 'Escribe tu distrito y elige la sede donde recogerás.',
    delivery: 'Con <b>📍 Usar mi ubicación</b> el motorizado llega exacto a tu puerta.',
    encomienda: 'Cuéntame a qué <b>ciudad</b> viaja tu pedido.'
  })[tipo] || 'Dime a dónde enviamos tu pedido.';
  else toby='Último paso: elige la <b>fecha</b> y toca <b>Confirmar pedido</b>.';
  var faq=[
    {q:'¿Mi pedido ya queda registrado?', a:'Sí. Al tocar «Confirmar pedido» ya nos llega. WhatsApp sirve para que recibas tu link de seguimiento y para escribirnos.'},
    {q:'¿Para qué piden el DNI?', a:'Para que solo la persona indicada pueda recoger el pedido, y para escribir su nombre tal como figura en su documento.'},
    {q:'¿Guardan mi ubicación?', a:'Para elegir sede, no: solo se usa en tu teléfono para ordenar las sedes por cercanía. En delivery se envía el punto de entrega para que el motorizado llegue.'},
    {q:'¿Cómo sigo mi pedido?', a:'Con el link que recibes por WhatsApp. Ahí ves cada estado de tu pedido.'},
    {q:'Me equivoqué en un dato', a:'Si aún no confirmas, vuelve con «← Atrás». Si ya confirmaste, escríbenos por WhatsApp y lo corregimos.'}
  ];
  if(retiro && e.tiendaDir) faq.splice(1,0,{q:'¿Dónde recojo mi pedido?', a:'En nuestra tienda: '+esc(e.tiendaDir)+'. Te avisamos cuando esté listo. Trae tu DNI.'});
  return {toby:toby, pasos:pasos, faq:faq};
}
function abrirAyudaForm(){
  const ov = _ayudaHoja();
  const seq = (typeof wzSeq==='function') ? wzSeq() : [1,2,3,4];
  const c = _ayudaFormContenido({
    tipo: selCourierType, paso: _wzStep, confirmado: !!window._ttFrozen, unico: !!_wzUnico,
    mapa: selCourierType==='agencia' && !$('agcManualInput'),
    tiendaDir: String(((CFG && (CFG.config||CFG)) || {}).city || '').trim()
  });
  const actual = seq.indexOf(_wzStep);
  const wa = _ayudaWa('Hola, necesito ayuda con mi pedido');
  ov.innerHTML = `<div class="ay-sheet">
    ${_toby((window._ttFrozen ? '' : _holaNombre(($('f_name')||{value:''}).value)) + c.toby, 'Guía de pedidos')}
    <div class="ay-ttl">Tu pedido en ${c.pasos.length} pasos</div>
    ${c.pasos.map((p,i)=>{
      const est = window._ttFrozen ? 'ok' : (i===actual ? 'on' : (i<actual ? 'ok' : ''));
      return `<div class="ay-paso ${est}"><div class="ay-n">${est==='ok'?'✓':i+1}</div><div><div class="ay-t">${p.t}${est==='on'?'<span class="ay-aqui">ESTÁS AQUÍ</span>':''}</div><div class="ay-d">${p.d}</div></div></div>`;
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

function _courierLabel(name, type){
  const u=(name||'').toUpperCase();
  if(u.includes('RETIRO')) return 'RETIRO EN TIENDA';
  if(_isOtrasAg(u)) return 'OTRA AGENCIA';
  return name;
}

function _courierIcon(name, type){
  const u=(name||'').toUpperCase();
  if(u.includes('RETIRO')) return '🏪';
  if(_isOtrasAg(u)) return '📦';
  if(u.includes('DELIVERY')) return '🏍️';
  if(u.includes('SHALOM')) return '🚚';
  if(u.includes('OLVA')) return '🚚';
  if(u.includes('MARVISUR')) return '🚚';
  if(u.includes('DINSIDES')) return '🚚';
  return (type==='agencia') ? '🏢' : '🚚';
}

function _courierSvg(type){
  const c='#17b3c3';
  const M={
    agencia:`<svg viewBox="0 0 640 512" fill="${c}" aria-hidden="true"><path d="M624 352h-16V243.9c0-12.7-5.1-24.9-14.1-33.9L494 110.1c-9-9-21.2-14.1-33.9-14.1H416V48c0-26.5-21.5-48-48-48H48C21.5 0 0 21.5 0 48v320c0 26.5 21.5 48 48 48h16c0 53 43 96 96 96s96-43 96-96h128c0 53 43 96 96 96s96-43 96-96h48c8.8 0 16-7.2 16-16v-32c0-8.8-7.2-16-16-16zM160 464c-26.5 0-48-21.5-48-48s21.5-48 48-48 48 21.5 48 48-21.5 48-48 48zm320 0c-26.5 0-48-21.5-48-48s21.5-48 48-48 48 21.5 48 48-21.5 48-48 48zm80-208H416V144h44.1l99.9 99.9V256z"/></svg>`,
    delivery:`<svg viewBox="0 0 576 512" fill="${c}" aria-hidden="true"><path d="M280.37 148.26L96 300.11V464a16 16 0 0 0 16 16l112.06-.29a16 16 0 0 0 15.92-16V368a16 16 0 0 1 16-16h64a16 16 0 0 1 16 16v95.64a16 16 0 0 0 16 16.05L464 480a16 16 0 0 0 16-16V300L295.67 148.26a12.19 12.19 0 0 0-15.3 0zM571.6 251.47L488 182.56V44.05a12 12 0 0 0-12-12h-56a12 12 0 0 0-12 12v72.61L318.47 43a48 48 0 0 0-61 0L4.34 251.47a12 12 0 0 0-1.6 16.9l25.5 31A12 12 0 0 0 45.15 301l235.22-193.74a12.19 12.19 0 0 1 15.3 0L530.9 301a12 12 0 0 0 16.9-1.6l25.5-31a12 12 0 0 0-1.7-16.93z"/></svg>`,
    retiro:`<svg viewBox="0 0 616 512" fill="${c}" aria-hidden="true"><path d="M602 118.6L537.1 15C531.3 5.7 521 0 510 0H106C95 0 84.7 5.7 78.9 15L14 118.6c-33.5 53.5-3.8 127.9 58.8 136.4 4.5 .6 9.1 .9 13.7 .9 29.6 0 55.8-13 73.8-33.1 18 20.1 44.3 33.1 73.8 33.1 29.6 0 55.8-13 73.8-33.1 18 20.1 44.3 33.1 73.8 33.1 29.6 0 55.8-13 73.8-33.1 18.1 20.1 44.3 33.1 73.8 33.1 4.7 0 9.2-.3 13.7-.9 62.8-8.4 92.6-82.8 59-136.4zM529.5 288c-10 0-19.9-1.5-29.5-3.8V384H116v-99.8c-9.6 2.2-19.5 3.8-29.5 3.8-6 0-12.1-.4-18-1.2-5.6-.8-11.1-2.1-16.4-3.6V464c0 26.5 21.5 48 48 48h384c26.5 0 48-21.5 48-48V283.2c-5.4 1.6-10.8 2.9-16.4 3.6-6 .8-12 1.2-18.1 1.2z"/></svg>`,
    encomienda:`<svg viewBox="0 0 448 512" fill="${c}" aria-hidden="true"><path d="M50.7 58.5L0 160h208V32H93.7c-18.2 0-34.8 10.3-43 26.5zM240 160h208l-50.7-101.5c-8.2-16.2-24.8-26.5-43-26.5H240v128zm208 32H0v240c0 26.5 21.5 48 48 48h352c26.5 0 48-21.5 48-48V192z"/></svg>`
  };
  return M[type]||M.delivery;
}

function renderForm(){
  window._bizInfo = {
    name:  (CFG&&(CFG.name||CFG.config&&CFG.config.name))||'Mi Negocio',
    phone: ((CFG&&(CFG.config&&CFG.config.phone||CFG.phone))||'').toString().trim(),
    city:  (CFG&&(CFG.city||CFG.config&&CFG.config.city))||''
  };
  _knownClient=null; _gpsLat=null; _gpsLon=null;
  const extraF   = ((CFG&&CFG.extraFields)||[]).filter(f=>f&&f.visible!==false);
  const couriers = (CFG&&CFG.couriers)||['SHALOM','OLVA COURIER','MARVISUR','DELIVERY','RETIRO EN TIENDA','OTRAS AGENCIAS'];
  const cAct     = (CFG&&CFG.courierActive)||{};
  const cTypes   = (CFG&&CFG.courierTypes)||{};
  const dispatch = (CFG&&CFG.dispatch)||{};
  const active   = couriers.filter(c=>cAct[c]!==false);
  const _prio=(c)=>{ const u=(c||'').toUpperCase();
    if(u.includes('SHALOM'))    return 1;
    if(u.includes('DELIVERY'))  return 2;
    if(u.includes('OLVA'))      return 3;
    if(u.includes('MARVISUR'))  return 4;
    if(_isOtrasAg(u))           return 5;
    if(u.includes('RETIRO'))    return 6;
    if(u.includes('DINSIDES'))  return 7;
    return 50; };
  active.sort((a,b)=>_prio(a)-_prio(b));
  _wzUnico = active.length===1 ? active[0] : '';

  const extraHtml = extraF.map(f=>{
    const fname=typeof f==='string'?f:(f.name||'');
    const isReq=typeof f==='object'&&!!f.required;
    const eid='ex_'+fname.replace(/\W/g,'_');
    return `<div class="fg">
      <input class="fi" id="${esc(eid)}" data-extra="${esc(fname)}" data-req="${isReq?'1':'0'}"
        placeholder="${esc(fname)}${isReq?' *':''}" autocomplete="off">
      ${isReq?`<div class="ferr" id="exerr_${esc(fname.replace(/\W/g,'_'))}">Este campo es obligatorio</div>`:''}
    </div>`;
  }).join('');

  const courierOpts = active.length
    ? '<option value="">— ¿Cómo quieres recibir? —</option>'+active.map(c=>{
        const t=cTypes[c]||'delivery';
        return `<option value="${esc(c)}">${esc(_courierLabel(c,t))}</option>`;
      }).join('')
    : '<option value="">Sin couriers configurados</option>';

  const _courierTypeOf=(c)=>{
    const u=(c||'').toUpperCase();
    if(_isOtrasAg(u)) return 'encomienda';
    if(u.includes('RETIRO')) return 'retiro';
    if(cTypes[c]==='agencia'||['SHALOM','OLVA','MARVISUR','DINSIDES'].some(n=>u.includes(n))) return 'agencia';
    return 'delivery';
  };
  const courierCards = active.length
    ? active.map(c=>{
        const t=_courierTypeOf(c);
        return `<button type="button" class="cour-card" role="radio" aria-checked="false" data-courier="${esc(c)}" onclick="pickCourier(this.dataset.courier)">
          <span class="cc-ic">${_courierSvg(t)}</span>
          <span class="cc-body"><span class="cc-name">${esc(_courierLabel(c,t))}</span></span>
          <span class="cc-radio"></span>
        </button>`;
      }).join('')
    : `<div class="ferr show" style="position:static">Sin couriers configurados</div>`;

  const datesChips=buildDatesChips(dispatch);

  setApp(`
    ${headerHtml()}
    <div class="wz-wrap">
      <div id="wzProgress" class="wz-progress"></div>
      <!-- ★ ELEGIR CÓMO RECIBIR ES LO PRIMERO — 15/10/2026.
           Lo pidió el dueño mirando su pantalla: al entrar se veía una
           etiqueta EN BLANCO ocupando el primer tercio del móvil, y debajo
           tres campos. La etiqueta en blanco no dice nada; elegir cómo
           quieres recibir el pedido sí, y además es la decisión de la que
           cuelga todo lo demás —qué se pregunta en el paso 3, y si hay
           paso 3 siquiera—.

           ⚠️ SE INTERCAMBIÓ EL CONTENIDO, NO LA NUMERACIÓN. Los pasos se
           mueven por data-step, y wzSeq() devuelve [1,2,3,4] o [1,2,4]
           según el courier. Renumerar habría tocado la secuencia, la barra,

           (Y sin comillas invertidas aquí dentro: este comentario vive
           DENTRO de un template literal de JavaScript, así que una sola
           comilla invertida cierra la cadena y revienta el archivo entero.
           Me acaba de pasar al escribirlo.)
           el botón Atrás y el salto del paso 3; mover el contenido no toca
           nada de eso. Tres ediciones en vez de un barrido.

           De regalo arregla la barra: hasta hoy decía «Paso 1 de 4» y
           cambiaba a «de 3» a mitad de camino, porque el total depende del
           courier y todavía no se había elegido. -->
      <div class="wz-step" data-step="1">
      <div class="section-ttl" style="margin-top:4px">¿Cómo quieres recibir tu pedido? *</div>
      <div class="fg">
        <div id="courierCards" role="radiogroup" aria-label="¿Cómo quieres recibir tu pedido?">${courierCards}</div>
        <select class="fi sel" id="f_courier" onchange="onCourierChange(this.value)" style="display:none" tabindex="-1" aria-hidden="true">
          ${courierOpts}
        </select>
        <div class="ferr" id="err_courier">Selecciona cómo recibir tu pedido</div>
      </div>
      <!-- Sin «Atrás»: es la primera pantalla, y un botón que no lleva a
           ningún sitio es un botón que se toca una vez y ya no se cree. -->
      <button class="btn-main" onclick="wzNext()" style="margin-top:8px">Continuar →</button>
      </div>

      <div class="wz-step" data-step="2" hidden>
      ${_wzUnico?'<div id="courierBadge" style="display:none"></div>':''}
      <!-- ★ «DATOS DE LA PERSONA QUE RECIBE», y no «tus datos».
           En un envío a agencia quien recoge puede NO ser quien pide: lo
           manda a su madre, a su socio, al vecino. El DNI que va en esta
           pantalla es el que Shalom va a exigir en el mostrador, así que
           llamarlo «tus datos» invita a poner el del que paga. -->
      <div class="section-ttl" style="margin-top:4px">Datos de la persona que recibe</div>
      <!-- ★ EL DNI VA PRIMERO, Y ES UN CAMBIO DE ORDEN, NO DE LÓGICA.
           Lo pidió el dueño y tiene su razón: el DNI es el único dato que
           puede RELLENAR a los otros. Pedirlo al final es pedir que el
           cliente escriba un nombre que ya íbamos a saber — y escrito a mano
           llega con faltas, sin tildes o con el apellido delante, que es
           justo lo que Shalom rechaza al registrar.
           La validación, los ids de los campos y los mensajes de error son
           EXACTAMENTE los de antes: solo cambia en qué orden se ven. -->
      <div class="fg">
        <input class="fi" id="f_dni" type="text" inputmode="numeric" pattern="[0-9]*"
          placeholder="🪪 DNI *" maxlength="8" autocomplete="off" data-wz-focus
          oninput="onDniInput(this.value)">
        <div class="ferr" id="err_dni">Ingresa el DNI (8 dígitos)</div>
        <div id="dniBadge" style="display:none;margin-top:8px"></div>
      </div>
      <div class="fg">
        <input class="fi" id="f_name" type="text" placeholder="Nombre completo *"
          autocomplete="name" oninput="onNombreInput(this)">
        <div class="ferr" id="err_name">Ingresa tu nombre completo</div>
        <!-- ★ LA MARCA, no el recibo. Cuando RENIEC contesta y el nombre ya
             está en el campo de arriba, repetirlo aquí es decir dos veces lo
             mismo a dos dedos de distancia. Una confirmación se encoge a una
             marca; un problema conserva sus palabras — y las palabras, si
             hacen falta, salen bajo el DNI, que es donde está la causa. -->
        <div id="dniMarca" style="display:none;font-size:11.5px;margin-top:5px"></div>
      </div>
      <div class="fg">
        <input class="fi phone-norm" id="f_phone" type="tel" inputmode="numeric" pattern="[0-9]*"
          placeholder="Número WhatsApp *" autocomplete="tel"
          oninput="onPhoneInput(this.value)">
        <div class="ferr" id="err_phone">Ingresa un número de 9 dígitos</div>
        <div id="knownBadge" style="display:none;margin-top:8px"></div>
      </div>
      ${extraHtml}
      <div class="wz-nav">
        <button class="wz-back" onclick="wzBack()">← Atrás</button>
        <button class="btn-main" onclick="wzNext()">Continuar →</button>
      </div>
      </div>

      <div class="wz-step" data-step="3" hidden>
      <div id="agencyBox" style="display:none"></div>

      <div id="encomiendaBox" style="display:none;margin-top:4px">
        <div class="section-ttl">📦 Datos de envío</div>
        <div class="fg">
          <input class="fi" id="f_ciudad" type="text" placeholder="Ciudad de destino *" autocomplete="off" data-wz-focus>
          <div class="ferr" id="err_ciudad">Ingresa la ciudad de destino</div>
        </div>
        <div class="fg" style="margin-top:8px;margin-bottom:0">
          <input class="fi" id="f_agencia" type="text" placeholder="Nombre de la agencia (opcional)" autocomplete="off">
        </div>
      </div>

      <!-- DIRECCIÓN DE ENTREGA — UNA SOLA VERDAD.
           El textarea ES la dirección. El botón de ubicación lo RELLENA (no lo
           reemplaza) y adjunta las coordenadas como un chip que el cliente
           puede quitar: corregir el texto ya nunca borra el pin exacto. -->
      <div id="deliveryAddrBox" style="display:none;margin-top:4px">
        <div class="section-ttl">📍 ¿A dónde enviamos tu pedido?</div>
        <div id="addrShortcut" style="display:none"></div>
        <!-- Mismo botón nativo que en sedes (Chrome 144+), aquí con precisión
             fina: el motorizado necesita la PUERTA, no el barrio. Dentro, el
             botón de siempre para los navegadores sin él. -->
        <geolocation id="dlvGeoNativo" class="ag-geo dlv-geo" accuracymode="precise">
        <button type="button" id="addrGpsBtn" class="addr-gps-btn" onclick="usarMiUbicacion()">📍 Usar mi ubicación</button>
        </geolocation>
        <div id="addrGpsMsg" style="display:none;margin-bottom:8px"></div>
        <div id="dlvPrev" class="dlv-prev" style="display:none"></div>
        <div id="dlvConfirma" class="dlv-confirma" style="display:none"></div>
        <textarea class="fi" id="addrManualInput" rows="2" data-wz-focus
          placeholder="Calle y número, Mz/Lt o dpto *" autocomplete="street-address"
          oninput="onDireccionInput()"></textarea>
        <div id="dlvPista" class="dlv-pista" style="display:none">✏️ Puedes agregar número, Mz/Lt o dpto (opcional)</div>
        <div class="ferr" id="err_deliveryAddr" style="margin-top:4px">Ingresa la dirección de entrega</div>
        <div class="fg" id="refField" style="margin-top:10px;margin-bottom:0">
          <input class="fi" id="f_ref" type="text"
            placeholder="Referencia (opcional): frente al mercado, casa azul…">
        </div>
      </div>
      <div class="wz-nav">
        <button class="wz-back" onclick="wzBack()">← Atrás</button>
        <button class="btn-main" onclick="wzNext()">Continuar →</button>
      </div>
      </div>

      <div class="wz-step" data-step="4" hidden>
      <div style="margin-top:18px">
        <div class="section-ttl">Fecha de envío *</div>
        <div class="dates-wrap"><div class="dates-scroll" id="datesGrid">${datesChips}</div></div>
        <div class="tt-ok" id="dateOk" aria-live="polite"></div>
        <div class="ferr" id="err_date" style="margin-top:6px">Selecciona una fecha</div>
      </div>

      <div class="fg" style="margin-top:16px">
        <textarea class="fi" id="f_notes" rows="2" maxlength="600" placeholder="Notas u observaciones (opcional)" oninput="_notesCount()"></textarea>
        <div id="f_notes_count" style="text-align:right;font-size:11px;color:var(--muted,#8b949e);margin-top:3px">0 / 600</div>
      </div>

      <div id="submitErrBox" class="error-box" style="display:none;margin-top:4px"></div>
      <div class="wz-nav">
        <button class="wz-back" onclick="wzBack()">← Atrás</button>
        <button class="btn-main" id="confirmBtn" onclick="submitOrder()">Confirmar pedido →</button>
      </div>
      </div>
    </div>
    ${brandFooterHtml()}
  `);

  if(!selDateIso){
    const first=document.querySelector('.date-opt');
    if(first) first.click();
  } else {
    const el=$('dopt_'+selDateIso);
    if(el) el.classList.add('active');
  }

  if(_prefillName){ const el=$('f_name'); if(el) el.value=_prefillName; }
  if(_prefillPhone){ const el=$('f_phone'); if(el){ el.value=_prefillPhone; onPhoneInput(_prefillPhone); } }

  wzInit();
}
