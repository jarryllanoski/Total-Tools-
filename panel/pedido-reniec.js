/**
 * panel/pedido-reniec.js — DNI → RENIEC y la agencia identificada
 * ===============================================================
 * Fase 3 (10/11/2026): el panel en módulos. Antes vivía en config.js.
 * Script CLÁSICO a propósito: sus funciones y variables son globales, igual
 * que cuando estaban en un solo archivo — moverlas no cambió ni una llamada.
 * El orden de los <script> en index.html es el orden de ejecución.
 */
/* ── RENIEC: EL NOMBRE REAL A PARTIR DEL DNI ──────────────────────────────
   `POST /account/register` pide el nombre PARTIDO en nombres, apellido
   paterno y apellido materno. Partir "JARLYN LLANOS ARTEAGA" a ojo se
   equivoca con cualquier nombre compuesto; RENIEC ya los da separados.

   TRES REGLAS, y las tres cuestan dinero o confianza si se rompen:
   1. Se pregunta al llegar a 8 dígitos, y UNA SOLA VEZ por DNI. Cada consulta
      gasta cuota del plan, así que disparar en cada tecla saldría carísimo.
   2. NO SE PISA lo que escribiste. RENIEC se OFRECE con un botón; el nombre
      con el que tú llamas a un cliente y el que dice su documento no tienen
      por qué ser el mismo, y el tuyo es el que usas para hablarle.
   3. Un 404 es un DNI MAL ESCRITO, y eso se avisa AQUÍ — un envío registrado
      con DNI malo es un envío que tu cliente no puede recoger. */
let _dniPedido = '';   // el último DNI por el que ya se preguntó

/* ★ UNA CONFIRMACIÓN SE ENCOGE A UNA MARCA; UN PROBLEMA CONSERVA SUS
   PALABRAS. «✅ Coincide con RENIEC» ocupaba una línea entera del formulario
   para decir que todo estaba bien — y casi siempre está bien. Ahora es un ✓
   dentro de la etiqueta del campo: cero líneas, y el dato sigue ahí para
   quien lo busque (con `title`, y leíble por un lector de pantalla).
   Lo que NO se encoge: que RENIEC diga otro nombre (es una decisión tuya) y
   que el DNI esté mal escrito (bloquea el envío).
   @param {string} marca el símbolo corto, o '' para quitarlo
   @param {string} titulo qué significa, al pasar el ratón */
function _dniMarca(marca, titulo){
  const m = $('fDniMarca'); if(!m) return;
  m.textContent = marca || '';
  m.title = titulo || '';
  m.setAttribute('aria-label', titulo || '');
  m.style.cssText = marca ?
    'color:var(--green,#2ea043);font-weight:700;font-size:11px' : 'display:none';
}

function _dniAviso(html, color){
  const el = $('fDniReniec'); if(!el) return;
  if(!html){ el.style.display='none'; el.innerHTML=''; return; }
  el.style.display='block';
  el.style.cssText = 'display:block;font-size:10.5px;line-height:1.5;margin-top:5px;color:'+(color||'#8b949e');
  el.innerHTML = html;
}

function _dniUsar(){
  const p = window._dniUltima; if(!p) return;
  $('fName').value = p.completo;
  _dniMarca('✓', 'Nombre puesto desde RENIEC'); _dniAviso('');
}

async function _dniReniec(valor){
  const n = String(valor||'').replace(/\D/g,'');
  if(n.length !== 8){ _dniPedido=''; _dniAviso(''); _dniMarca(''); return; }
  // Una vez por DNI: volver a escribir el mismo número no vuelve a preguntar.
  if(n === _dniPedido) return;
  _dniPedido = n;
  if(!window.Shalom || typeof Shalom.dni !== 'function'){ _dniAviso(''); return; }
  _dniMarca('…', 'Consultando RENIEC'); _dniAviso('');
  let r;
  try{ r = await Shalom.dni(n); }catch(e){ r = null; }
  // Si mientras consultaba cambiaste el DNI, este resultado ya no corresponde.
  if(($('fDni')||{value:''}).value.replace(/\D/g,'') !== n) return;
  // El bloque de registro depende de esta respuesta: que se entere ya.
  if(r && r.ok) window._dniUltima = r.persona;
  if(typeof _pintarRegistroShalom==='function') _pintarRegistroShalom();
  if(!r || !r.ok){
    const m = (r&&r.motivo)||'';
    /* ★ NINGÚN MOTIVO SE CALLA.
       Aquí había un `else` que dejaba el aviso en blanco cuando el motivo no
       estaba previsto: salía "Consultando…", desaparecía, y no pasaba nada
       más. Sin error, sin pista. Es el patrón que este proyecto lleva
       semanas cazando —algo falla y nadie se entera— y lo escribí yo mismo,
       con un comentario que lo justificaba. Pasó de verdad con
       SIN_TRADUCTOR. `Shalom.textoMotivo` nunca devuelve vacío. */
    if(m === 'NO_ENCONTRADO'){
      _dniAviso('⚠️ <b>Ese DNI no existe en RENIEC.</b> Revísalo: un envío registrado con DNI malo no se puede recoger.', '#f59e0b');
    } else {
      const txt = (window.Shalom && Shalom.textoMotivo) ? Shalom.textoMotivo(m)
        : ('No se pudo consultar ('+(m||'sin motivo')+').');
      _dniAviso('🪪 '+escH(txt), m==='SIN_RED' ? '#8b949e' : '#f59e0b');
    }
    return;
  }
  window._dniUltima = r.persona;
  const actual = ($('fName')||{value:''}).value.trim();
  if(!actual){
    // Vacío: no hay nada que pisar, así que se rellena y se ahorra un toque.
    $('fName').value = r.persona.completo;
    _dniMarca('✓', 'Nombre puesto desde RENIEC'); _dniAviso('');
    return;
  }
  if(actual.toUpperCase() === r.persona.completo.toUpperCase()){
    _dniMarca('✓', 'Coincide con RENIEC'); _dniAviso('');
    return;
  }
  // Distinto: se OFRECE, no se impone. Esto SÍ conserva sus palabras.
  _dniMarca('', '');
  _dniAviso('🪪 RENIEC dice: <b>'+escH(r.persona.completo)+'</b> '+
    '<button type="button" onclick="_dniUsar()" style="background:rgba(56,139,253,.15);'+
    'border:1px solid rgba(56,139,253,.4);border-radius:6px;color:var(--blue);'+
    'font-size:10px;font-weight:700;padding:2px 7px;cursor:pointer;font-family:inherit;'+
    'margin-left:4px">Usar este</button>');
}

/* ── LA AGENCIA IDENTIFICADA ──────────────────────────────────────────────
   `_agElegida` guarda los cuatro campos mientras el formulario está abierto.
   Se pone SOLO al elegir de la lista —el único momento en que el `ter_id` se
   conoce sin adivinar— y se borra en cuanto la dirección cambia por
   cualquier otra vía.

   La regla que no se negocia: el id y el texto no pueden divergir. Un id
   viejo pegado a una dirección nueva es exactamente cómo se manda un paquete
   pagado a otra ciudad. Ver functions/agencias.js. */
let _agElegida = null;
let _agTexto   = '';   // la dirección EXACTA que escribió el selector

/* La única puerta: el id sigue vivo solo si la dirección es literalmente la
   que puso el selector Y el courier sigue siendo el del mismo catálogo.

   Se compara el TEXTO y no se escucha ningún evento, a propósito: `fAddr`
   dispara `onAddrInput` también al recibir el foco, así que colgarse de los
   eventos borraría el id por solo tocar el campo. Comparando el texto quedan
   cubiertos de una vez escribir, pegar, el relleno desde WhatsApp y
   cualquier cambio por código que venga mañana — sin acordarse de nada. */
function _agVigente(){
  if(!_agElegida) return null;
  const txt = ($('fAddr')||{value:''}).value;
  const cur = window.Agencias ? Agencias.courierDe(($('fCourier')||{value:''}).value) : '';
  // El courier importa tanto como el texto: el 3 de Olva no es el 3 de
  // Shalom, y cambiar de courier deja el id apuntando a otro catálogo.
  if(txt !== _agTexto || cur !== _agElegida.agenciaCourier){
    _agElegida = null; _agTexto = '';
  }
  return _agElegida;
}

function _agPintar(){
  const el = $('fAgenciaEstado'); if(!el) return;
  const marca = $('fAgenciaMarca');
  const ponMarca = (t, tit) => {
    if(!marca) return;
    marca.textContent = t || '';
    marca.title = tit || '';
    marca.setAttribute('aria-label', tit || '');
    marca.style.cssText = t ? 'color:var(--green,#2ea043);font-size:11px' : 'display:none';
  };
  const viva = _agVigente();
  if(viva){
    /* ⚠️ Y AQUÍ HABÍA DUPLICACIÓN PURA: la línea repetía «ANCASH / HUARAZ /
       HUARAZ / HUARAZ CO», que ya está escrito en el campo Dirección justo
       encima. Dos veces el mismo texto no informa el doble. */
    ponMarca('🏢', 'Agencia identificada · '+viva.agenciaNombre);
    el.innerHTML = ''; el.style.cssText = 'display:none';
    if(typeof _pintarRegistroShalom==='function') _pintarRegistroShalom();
    return;
  }
  ponMarca('', '');
  if(typeof _pintarRegistroShalom==='function') _pintarRegistroShalom();
  {
    const c = window.Agencias ? Agencias.courierDe(($('fCourier')||{value:''}).value) : '';
    // Sin catálogo (DELIVERY, ENCOMIENDA…) no hay nada que identificar: el
    // aviso solo sale donde de verdad hace falta.
    if(!c){ el.innerHTML=''; el.style.cssText='display:none'; return; }
    // Un problema sí conserva sus palabras — pero las justas.
    el.innerHTML = '⚠️ Elígela de la lista';
    el.style.cssText = 'font-size:10.5px;line-height:1.5;margin-top:5px;color:#d29922';
  }
}

function pickShalomAgency(i){
  const ag=(window._panelShCache||[])[i]; if(!ag) return;
  const nombre=ag.lugar_over||ag.nombre||'';
  const dir=ag.direccion||'';
  $('fAddr').value = dir ? (nombre+' – '+dir) : nombre;
  // ★ El instante en que el ter_id se conoce sin adivinar. Antes se tiraba.
  _agElegida = window.Agencias ? Agencias.elegida(ag, ($('fCourier')||{value:''}).value) : null;
  _agTexto = $('fAddr').value;   // el texto contra el que se comparará después
  _agPintar();
  const drop=$('shDrop'); if(drop) drop.style.display='none';
  toast(_agElegida ? '🏢 Agencia identificada' : '🏢 Agencia seleccionada');
}
// Cerrar dropdown al hacer click fuera
document.addEventListener('click',function(e){
  const drop=$('shDrop'); if(!drop) return;
  if(e.target && (e.target.id==='fAddr' || (e.target.closest && e.target.closest('#shDrop')))) return;
  drop.style.display='none';
});
