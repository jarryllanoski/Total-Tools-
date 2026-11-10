/**
 * panel/shalom/shalom-origen.js — agencia de origen y cuenta de Shalom Pro
 * =================================================================
 * Fase 3 (10/11/2026): el panel en módulos. Antes vivía en config.js.
 * Script CLÁSICO a propósito: sus funciones y variables son globales, igual
 * que cuando estaban en un solo archivo — moverlas no cambió ni una llamada.
 * El orden de los <script> en index.html es el orden de ejecución.
 */
/* ── TU AGENCIA DE ORIGEN ─────────────────────────────────────────────────
   `POST /account/register` pide `origen`, y también es un `ter_id`. Como es
   siempre la misma, se elige UNA VEZ aquí en vez de en cada envío.

   Se guarda con el MISMO `Agencias.elegida()` que el destino: una segunda
   forma de guardar un ter_id acabaría aceptando aquí lo que allá se rechaza.

   Vive en `S.agenciaOrigen`, HERMANA de `config` y no dentro: ese objeto lo
   devuelve entero la función pública, y aunque tu agencia de despacho no sea
   un secreto, la regla se comprueba antes de guardar, no después. */
let _orTimer = null;

/* El origen, en UNA línea. El buscador estaba siempre abierto ocupando un
   campo para algo que se elige una vez al año; ahora sale con «cambiar». */
function cfgOrigenAbrir(){
  const c = $('cfgOrigenCaja'); if(!c) return;
  const abierto = c.style.display !== 'none';
  c.style.display = abierto ? 'none' : 'block';
  if(!abierto){ const i = $('cfgOrigenInput'); if(i) i.focus(); }
}

function _pintarOrigen(){
  const b = $('cfgOrigenBadge'); if(!b) return;
  const o = S.agenciaOrigen;
  const ok = window.Agencias && Agencias.identificada(o);
  const enlace = (t, fn) => '<span onclick="'+fn+'" style="font-size:11px;'+
    'color:#388bfd;cursor:pointer;font-weight:700;white-space:nowrap">'+t+'</span>';
  b.style.display='block';
  if(!ok){
    b.innerHTML = '<div style="display:flex;align-items:center;gap:8px;font-size:12px;'+
      'color:var(--text2);line-height:1.5"><span>⚠️</span>'+
      '<span style="flex:1"><b style="color:var(--text)">Origen</b> '+
      '<span style="color:#f59e0b">sin elegir</span></span>'+
      enlace('elegir', 'cfgOrigenAbrir()')+'</div>';
    return;
  }
  b.innerHTML = '<div style="display:flex;align-items:center;gap:8px;font-size:12px;'+
    'color:var(--text2);line-height:1.5"><span>🏢</span>'+
    '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;'+
    'white-space:nowrap">Despachas desde <b style="color:var(--text)">'+
    escH(o.agenciaNombre)+'</b></span>'+
    enlace('cambiar', 'cfgOrigenAbrir()')+'<span style="opacity:.3">·</span>'+
    enlace('quitar', 'quitarOrigen()')+'</div>';
}

/* `pre` existe para que el MISMO buscador sirva en Config y en el pedido.
   La alternativa era copiarlo, y una copia habría divergido: dos buscadores
   escribiendo sobre la MISMA `S.agenciaOrigen` con reglas distintas es como
   se despacha desde la agencia equivocada sin que nadie lo note. */
function onOrigenInput(val, pre){
  pre = pre || 'cfg';
  const drop = $(pre+'OrigenDrop'); if(!drop) return;
  clearTimeout(_orTimer);
  const q = (val||'').trim();
  if(q.length < 2){ drop.style.display='none'; return; }
  _orTimer = setTimeout(async () => {
    await _panelShalomLoad();
    const res = _panelShalomSearch(q);
    window._origenCache = res;
    if(!res.length){
      drop.innerHTML = '<div style="padding:12px 14px;text-align:center;font-size:12px;color:var(--text2)">🔍 Sin resultados</div>';
      drop.style.display='block'; return;
    }
    drop.innerHTML = res.map((ag,i)=>{
      const nombre = ag.lugar_over||ag.nombre||'—';
      const geo = [ag.zona||ag.distrito, ag.provincia, ag.departamento].filter(Boolean).join(' · ');
      return '<div onclick="pickOrigen('+i+',\''+pre+'\')" style="padding:9px 12px;border-bottom:1px solid var(--bd);cursor:pointer">'+
        '<div style="font-weight:700;font-size:12px;color:var(--text)">'+escH(nombre)+'</div>'+
        (geo?'<div style="font-size:11px;color:var(--blue);margin-top:2px">'+escH(geo)+'</div>':'')+
        (ag.direccion?'<div style="font-size:11px;color:var(--text2);margin-top:2px;line-height:1.4">'+escH(ag.direccion)+'</div>':'')+
        '</div>';
    }).join('');
    drop.style.display='block';
  }, 300);
}

function pickOrigen(i, pre){
  pre = pre || 'cfg';
  const ag = (window._origenCache||[])[i]; if(!ag) return;
  // SHALOM fijo, no el courier del formulario: esta es TU agencia de
  // despacho, y el registro que la va a usar es el de Shalom.
  const el = window.Agencias ? Agencias.elegida(ag, 'SHALOM') : null;
  if(!el){ toast('⚠️ Esa agencia no tiene un id utilizable'); return; }
  S.agenciaOrigen = el;
  save('config');
  const inp = $(pre+'OrigenInput'); if(inp) inp.value='';
  const drop = $(pre+'OrigenDrop'); if(drop) drop.style.display='none';
  const caja = $('regOrigenCaja'); if(caja) caja.style.display='none';
  const caja2 = $('cfgOrigenCaja'); if(caja2) caja2.style.display='none';
  _pintarOrigen();
  // El bloque del pedido depende de esto: sin repintar, seguiría diciendo
  // "sin agencia de origen" con la agencia ya elegida.
  if(typeof _pintarRegistroShalom==='function') _pintarRegistroShalom();
  toast('🏢 Origen: '+el.agenciaNombre);
}

/* ★ CUAL de tus cuentas de Shalom Pro usa el panel.
   Se guarda el id Y EL NOMBRE. El id solo es un UUID que no le dice nada a
   nadie: el nombre es lo que permite avisar con sentido el dia que esa
   cuenta desaparezca ("la cuenta Total ya no esta"), en vez de escupir un
   identificador.
   La decision de CUAL no se toma aqui — vive en `Shalom.elegirInstancia`,
   un solo sitio. Esto solo persiste lo que el dueño eligio. */
function elegirInstanciaShalom(json){
  let el=null;
  try{ el=JSON.parse(json); }catch(e){}
  if(!el||!el.id){ toast('⚠️ Esa cuenta no tiene un id utilizable'); return; }
  S.shalomInstancia={id:String(el.id), nombre:String(el.nombre||'')};
  save('config');
  toast('🔌 Cuenta de Shalom: '+(el.nombre||el.id));
  if(typeof verificarInstanciaShalom==='function') verificarInstanciaShalom();
}

function quitarOrigen(){
  S.agenciaOrigen = null;
  save('config');
  _pintarOrigen();
  toast('🏢 Agencia de origen quitada');
}

document.addEventListener('click', function(e){
  const drop = $('cfgOrigenDrop'); if(!drop) return;
  if(e.target && (e.target.id==='cfgOrigenInput' || (e.target.closest && e.target.closest('#cfgOrigenDrop')))) return;
  drop.style.display='none';
});
