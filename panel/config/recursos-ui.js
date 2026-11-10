/**
 * panel/config/recursos-ui.js — la pantalla del centro de recursos
 * =========================================================
 * Fase 3 (10/11/2026): el panel en módulos. Antes vivía en index.html.
 * Script CLÁSICO a propósito: sus funciones y variables son globales, igual
 * que cuando estaban en un solo archivo — moverlas no cambió ni una llamada.
 * El orden de los <script> en index.html es el orden de ejecución.
 */
/* ══ CENTRO DE RECURSOS ══════════════════════════════════════════════════
   Página propia con la MISMA cara que Envíos: sus clases de panel.css no
   dicen "envío" en ningún nombre, así que se reutilizan tal cual.

   NO CUESTA NI UNA LECTURA NI UNA ESCRITURA NUEVAS: `S.recursos` viaja en el
   documento de configuración que el panel ya lee al arrancar, y se guarda con
   `save('config')` — ESE documento, no los 1169 pedidos.

   ⚠️ La selección vive AQUÍ, en memoria, y NUNCA en `seleccion.js`: ese es el
   marcado de pedidos, y compartirlo haría que marcar un catálogo marcara un
   envío —y que el 🗑️ de Envíos borrara lo que marcaste aquí—. */
let _recCat = '';      // categoría (chips)
let _recTipo = '';     // tipo de archivo (tarjetas de arriba)
let _recQ = '';        // búsqueda
let _recOrden = 'categoria';
let _recMosaico = false;
let _recSel = new Set();
let _recEditId = null;

const _REC_ORDEN_TXT = {categoria: 'Por categoría', az: 'A – Z', nuevos: 'Más nuevos'};

function recLista(){ return window.Recursos ? Recursos.normalizar(S.recursos) : []; }

function recLimpiarBusca(){ const e=$('recSearch'); if(e) e.value=''; _recQ=''; recRender(); }
function recBuscar(v){ _recQ = v||''; recRender(); }
function recFiltrar(c){ _recCat = c||''; recRender(); }
function recTipo(t){ _recTipo = (_recTipo===t) ? '' : (t||''); recRender(); }
function recVista(){ _recMosaico = !_recMosaico; recRender(); }
function recOrdenSig(){
  const i = Recursos.ORDENES.indexOf(_recOrden);
  _recOrden = Recursos.ORDENES[(i+1) % Recursos.ORDENES.length];
  toast('↕️ ' + _REC_ORDEN_TXT[_recOrden]);
  recRender();
}

/* El tipo de archivo, para las tarjetas de arriba. Es un eje DISTINTO al de
   los chips (categoría): "enséñame los videos" y "enséñame los manuales" son
   dos preguntas, y las dos se hacen. */
function _recEsTipo(r, t){
  if(!t) return true;
  const e = Recursos.tipoDe(r.u).etiqueta;
  if(t === 'archivos') return e !== 'Carpeta de Drive' && e !== 'Video';
  return e === t;
}

function recRender(){
  const cont = $('recCards'); if(!cont) return;
  if(!window.Recursos){
    cont.innerHTML = '<div class="cgroup" style="padding:22px;text-align:center;color:var(--text2);font-size:12.5px">No se pudo cargar el centro de recursos. Recarga la página.</div>';
    return;
  }
  const todos = recLista();

  const c = Recursos.cuentas(todos);
  if($('recNTotal')) $('recNTotal').textContent = c.total;
  if($('recNCarp'))  $('recNCarp').textContent  = c.carpetas;
  if($('recNVid'))   $('recNVid').textContent   = c.videos;
  if($('recNArch'))  $('recNArch').textContent  = c.archivos;

  const cats = Recursos.categoriasConAlgo(todos);
  const chips = $('recChips');
  if(chips){
    chips.innerHTML = cats.map(x =>
      '<div class="chip'+(_recCat===x?' active':'')+'" onclick="recFiltrar(\''+escJs(x)+'\')">'+escH(x)+'</div>'
    ).join('');
  }
  const td = $('recChipTodos'); if(td) td.classList.toggle('active', !_recCat);
  const vb = $('recVistaBtn'); if(vb) vb.textContent = _recMosaico ? '☰' : '▦';

  // Los filtros activos se VEN y se quitan de un toque. Un filtro puesto que
  // no se ve es la causa número uno de "me desaparecieron las cosas".
  const bar = $('recFiltroBar');
  if(bar){
    const act = [];
    if(_recTipo) act.push(['tipo', _recTipo==='archivos'?'📄 Archivos':_recTipo]);
    if(_recOrden!=='categoria') act.push(['orden', _REC_ORDEN_TXT[_recOrden]]);
    bar.style.display = act.length ? '' : 'none';
    bar.innerHTML = act.map(a =>
      '<span class="chip active" style="margin-right:5px" onclick="'+
      (a[0]==='tipo' ? 'recTipo(\'\')' : 'recOrden0()')+'">'+escH(a[1])+' ✕</span>'
    ).join('');
  }

  if(!todos.length){
    cont.innerHTML = '<div class="cgroup" style="padding:30px 18px;text-align:center">'+
      '<div style="font-size:34px;margin-bottom:8px">📚</div>'+
      '<div style="font-size:13px;color:var(--text2);line-height:1.6">Todavía no hay recursos.<br>'+
      'Toca <b style="color:var(--blue)">➕</b> para agregar el primero: un manual, un video, un catálogo.</div></div>';
    return;
  }

  let vis = Recursos.filtrar(todos, _recCat || 'Todos', _recQ).filter(r => _recEsTipo(r, _recTipo));
  if(!vis.length){
    cont.innerHTML = '<div class="cgroup" style="padding:26px;text-align:center;color:var(--text2);font-size:12.5px">Nada con esos filtros.</div>';
    return;
  }
  vis = Recursos.ordenar(vis, _recOrden);

  // Agrupado por categoría solo cuando ese es el orden: con "A–Z" o "más
  // nuevos" los grupos romperían justo el orden que pediste.
  const grupos = (_recOrden === 'categoria')
    ? Recursos.agrupar(vis)
    : [{cat: _REC_ORDEN_TXT[_recOrden], items: vis}];

  cont.innerHTML = grupos.map(g =>
    '<div class="cgroup">'+
      '<div class="cgroup-hdr"><div class="cgroup-bar"></div>'+
      '<div class="cgroup-name">'+escH(g.cat)+'</div><div class="cgroup-spacer"></div>'+
      '<div class="cgroup-cnt">'+g.items.length+'</div></div>'+
      (_recMosaico
        ? '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:9px;padding:11px">'+
          g.items.map(_recMosaicoCard).join('')+'</div>'
        : g.items.map(_recFila).join(''))+
    '</div>'
  ).join('');
}
function recOrden0(){ _recOrden='categoria'; recRender(); }

/* Una imagen que no carga cae al icono y la tarjeta queda entera. Es lo que
   permite usar la miniatura de Drive, que NO está garantizada, sin riesgo de
   que se vea una foto rota. */
const _REC_ONERR = "this.style.display='none';this.nextElementSibling.style.display='flex'";

function _recFila(r){
  const t = Recursos.tipoDe(r.u);
  const m = _recSel.has(r.id);
  return '<div class="card" style="display:flex;align-items:center;gap:10px">'+
    '<input type="checkbox" '+(m?'checked ':'')+'onclick="event.stopPropagation();recMarcar(\''+escJs(r.id)+'\')" style="flex-shrink:0;width:17px;height:17px">'+
    '<a href="'+escH(r.u)+'" target="_blank" rel="noopener noreferrer" style="flex:1;min-width:0;display:flex;align-items:center;gap:10px;text-decoration:none">'+
      '<div style="font-size:19px;flex-shrink:0">'+t.icono+'</div>'+
      '<div style="flex:1;min-width:0">'+
        '<div style="font-size:13px;font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+escH(r.t)+'</div>'+
        '<div style="font-size:10.5px;color:var(--text2);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+
          escH(t.etiqueta)+(r.n?' · '+escH(r.n):'')+'</div>'+
      '</div></a>'+
    '<button onclick="recEditar(\''+escJs(r.id)+'\')" title="Editar" style="background:none;border:none;color:var(--text2);cursor:pointer;font-size:14px;padding:4px 6px;flex-shrink:0">✏️</button>'+
    '</div>';
}

function _recMosaicoCard(r){
  const t = Recursos.tipoDe(r.u);
  const p = Recursos.portadaDe(r);
  const m = _recSel.has(r.id);
  return '<div style="border:1.5px solid '+(m?'var(--blue)':'var(--bd)')+';border-radius:10px;overflow:hidden;background:var(--bg2)">'+
    '<a href="'+escH(r.u)+'" target="_blank" rel="noopener noreferrer" style="display:block;text-decoration:none">'+
      '<div style="position:relative;height:88px;background:var(--bg3)">'+
        (p ? '<img src="'+escH(p)+'" loading="lazy" onerror="'+_REC_ONERR+'" style="width:100%;height:100%;object-fit:cover;display:block">' : '')+
        '<div style="'+(p?'display:none;':'display:flex;')+'width:100%;height:100%;align-items:center;justify-content:center;font-size:30px">'+t.icono+'</div>'+
      '</div>'+
      '<div style="padding:7px 8px">'+
        '<div style="font-size:11.5px;font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+escH(r.t)+'</div>'+
        '<div style="font-size:9.5px;color:var(--text2);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+escH(r.n||t.etiqueta)+'</div>'+
      '</div></a>'+
    '<div style="display:flex;border-top:1px solid var(--bd)">'+
      '<button onclick="recMarcar(\''+escJs(r.id)+'\')" style="flex:1;background:none;border:none;color:'+(m?'var(--blue)':'var(--text2)')+';cursor:pointer;font-size:12px;padding:5px">'+(m?'☑️':'☐')+'</button>'+
      '<button onclick="recEditar(\''+escJs(r.id)+'\')" style="flex:1;background:none;border:none;color:var(--text2);cursor:pointer;font-size:12px;padding:5px;border-left:1px solid var(--bd)">✏️</button>'+
    '</div></div>';
}

/* ── Marcar ──────────────────────────────────────────────────────────── */
function recMarcar(id){ if(_recSel.has(id)) _recSel.delete(id); else _recSel.add(id); recRender(); }
function recSelTodo(){
  const vis = Recursos.filtrar(recLista(), _recCat||'Todos', _recQ).filter(r=>_recEsTipo(r,_recTipo));
  // Marca lo VISIBLE, no la lista entera: marcar cosas que no ves y borrarlas
  // después es exactamente cómo se pierde algo sin enterarse.
  if(vis.every(r=>_recSel.has(r.id))) vis.forEach(r=>_recSel.delete(r.id));
  else vis.forEach(r=>_recSel.add(r.id));
  recRender();
}
function _recMarcados(){ return recLista().filter(r=>_recSel.has(r.id)); }

/* ── Compartir ───────────────────────────────────────────────────────── */
function recWhatsApp(){
  const sel = _recMarcados();
  if(!sel.length){ toast('☑️ Marca al menos un recurso'); return; }
  window.open('https://wa.me/?text='+encodeURIComponent(Recursos.textoCompartir(sel)), '_blank', 'noopener');
}
function recCopiar(){
  const sel = _recMarcados();
  if(!sel.length){ toast('☑️ Marca al menos un recurso'); return; }
  const txt = Recursos.textoCompartir(sel);
  const listo = () => toast('🔗 '+sel.length+' enlace(s) copiado(s)');
  try{
    if(navigator.clipboard && navigator.clipboard.writeText)
      navigator.clipboard.writeText(txt).then(listo).catch(()=>_copiarFallback(txt,listo));
    else _copiarFallback(txt, listo);
  }catch(e){ _copiarFallback(txt, listo); }
}

/* ── Quitar ──────────────────────────────────────────────────────────── */
function recQuitar(){
  const sel = _recMarcados();
  if(!sel.length){ toast('☑️ Marca lo que quieras quitar'); return; }
  confirmar({
    texto: 'Quitar '+sel.length+' recurso(s) del centro. Los archivos en Drive NO se tocan.',
    textoSi: 'Quitar',
    alConfirmar: function(){
      const fuera = new Set(sel.map(r=>r.id));
      S.recursos = (Array.isArray(S.recursos)?S.recursos:[]).filter(x=>{
        const l = Recursos.normalizar([x])[0];
        return !l || !fuera.has(l.id);
      });
      _recSel.clear(); save('config'); recRender();
      toast('🗑️ '+sel.length+' quitado(s)');
    }
  });
}

/* ── Editar / crear ──────────────────────────────────────────────────── */
function recEditar(id){
  if(!window.Recursos) return;
  _recEditId = id || null;
  const r = id ? recLista().find(x=>x.id===id) : null;
  const sel = $('recFCat');
  if(sel) sel.innerHTML = Recursos.CATEGORIAS.map(c=>'<option>'+escH(c)+'</option>').join('');
  $('recEditTtl').textContent = r ? '✏️ Editar recurso' : '📚 Nuevo recurso';
  $('recFTit').value = r ? r.t : '';
  $('recFUrl').value = r ? r.u : '';
  $('recFNota').value = r ? r.n : '';
  $('recFImg').value = r ? r.img : '';
  if(sel) sel.value = r ? r.c : Recursos.CATEGORIAS[0];
  $('recEditAviso').style.display='none';
  recPrevia();
  openOverlay('recEditOverlay');
}

function _recAviso(txt, color){
  const e = $('recEditAviso'); if(!e) return;
  if(!txt){ e.style.display='none'; return; }
  e.style.display='block'; e.style.color = color||'#f59e0b'; e.textContent = txt;
}

function recPrevia(){
  const box = $('recPreviaBox'); if(!box) return;
  const u = ($('recFUrl')||{value:''}).value.trim();
  const img = ($('recFImg')||{value:''}).value.trim();
  const p = Recursos.portadaDe({u:u, img: Recursos.urlValida(img) ? img : ''});
  if(!p){ box.style.display='none'; box.innerHTML=''; return; }
  box.style.display='block';
  box.innerHTML = '<img src="'+escH(p)+'" onerror="'+_REC_ONERR+'" style="width:100%;max-height:120px;object-fit:cover;border-radius:9px;border:1px solid var(--bd);display:block">'+
    '<div style="display:none;padding:14px;text-align:center;color:var(--text2);font-size:11.5px;border:1px dashed var(--bd);border-radius:9px">Esa portada no se pudo cargar. Se usará el icono.</div>';
}

async function recSubirPortada(input){
  const f = input && input.files && input.files[0];
  input.value = '';
  if(!f) return;
  if(f.size > 3*1024*1024){ _recAviso('⚠️ Máximo 3MB para una portada.'); return; }
  if(!window.StorageModule || !StorageModule.uploadFile){ _recAviso('No se puede subir ahora. Pega la URL de una imagen.'); return; }
  _recAviso('⏳ Subiendo portada…', '#8b949e');
  try{
    // El id se fija ANTES de subir: sin él, dos portadas seguidas se pisarían
    // en Storage por caer en el mismo nombre de archivo.
    const id = _recEditId || ('r_'+Date.now()+'_'+Math.random().toString(36).slice(2,7));
    _recEditId = _recEditId || id;
    const doc = await StorageModule.uploadFile(f, 'portadas', id, 'recursos');
    $('recFImg').value = doc.d;
    recPrevia();
    _recAviso('✅ Portada subida.', 'var(--green,#2ea043)');
  }catch(e){
    const t = window._authTextoMotivo && window._authTextoMotivo(e);
    _recAviso(t || ('No se pudo subir: '+((e&&e.message)||'error')));
  }
}

function recGuardar(){
  const url = ($('recFUrl')||{value:''}).value.trim();
  if(!Recursos.urlValida(url)){
    _recAviso('El enlace tiene que empezar por https:// y ser una dirección completa.');
    return;
  }
  const img = ($('recFImg')||{value:''}).value.trim();
  if(img && !Recursos.urlValida(img)){
    _recAviso('La portada tiene que ser una URL https:// de una imagen, o súbela con 📁.');
    return;
  }
  const datos = {
    t: ($('recFTit')||{value:''}).value.trim(),
    u: url,
    c: ($('recFCat')||{value:''}).value,
    n: ($('recFNota')||{value:''}).value.trim(),
    img: img
  };
  S.recursos = Array.isArray(S.recursos) ? S.recursos : [];
  let i = -1;
  if(_recEditId){
    i = S.recursos.findIndex(x=>{ const l=Recursos.normalizar([x])[0]; return l && l.id===_recEditId; });
  }
  if(i >= 0) S.recursos[i] = Object.assign({}, S.recursos[i], datos);
  else S.recursos.push(Object.assign({id: _recEditId || ('r_'+Date.now()+'_'+Math.random().toString(36).slice(2,7)),
    publico:false}, datos));
  save('config');            // ★ sube SOLO el documento de config
  closeOverlay('recEditOverlay');
  recRender();
  // El fallo más probable de todo esto no es el código: es una carpeta de
  // Drive sin compartir. Quien la abra vería "solicitar acceso" y pensaría
  // que el panel está roto.
  if(/drive\.google\.com|docs\.google\.com/.test(url))
    toast('✅ Guardado — comprueba que en Drive esté compartido con «cualquiera con el enlace»');
  else toast('✅ Guardado');
}

async function _pintarPuertaShalom(){
  const fila = $('shalomPuertaEstado'), tgl = $('tglShalomPuerta');
  if(!fila || !tgl) return;
  const estado = (window._fbLeerPuerta ? await window._fbLeerPuerta() : null) || {};
  // Sin documento, encendida: un archivo que nadie creó no puede dejar el
  // negocio sin rastreo.
  tgl.classList.toggle('on', estado.encendida !== false);
  const v = (window.Shalom && Shalom.textoPuerta) ?
    Shalom.textoPuerta(estado, Date.now()) :
    {icono:'', color:'#8b949e', texto:''};
  fila.textContent = v.icono + ' ' + v.texto;
  fila.style.color = v.color;
}
function toggleShalomPuerta(){ _pinShalom(_toggleShalomPuertaHecho); }
async function _toggleShalomPuertaHecho(){
  const tgl = $('tglShalomPuerta'); if(!tgl) return;
  const on = !tgl.classList.contains('on');
  tgl.classList.toggle('on', on);   // respuesta inmediata; se confirma abajo
  try{
    await window._fbEncenderPuerta(on);
    toast(on ? '🚪 Puerta a Shalom encendida' :
               '🔌 Puerta a Shalom apagada — el panel sigue funcionando igual');
  }catch(e){
    // No se pudo guardar: se deshace el toggle en vez de mentir sobre el estado.
    tgl.classList.toggle('on', !on);
    toast('⚠️ No se pudo cambiar el interruptor — reintenta');
  }
  _pintarPuertaShalom();
}
