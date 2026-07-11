/**
 * print.js — Módulo de impresión para Total Tools
 * Formatos: Etiqueta (pegar en paquete) · Lista (registro interno)
 * Integración: reemplaza doPrint() en index.html
 */

(function(){

/* ── MODAL HTML ─────────────────────────────────────────────────── */
function _injectModal(){
  if(document.getElementById('printModal')) return;
  const el = document.createElement('div');
  el.id = 'printModal';
  el.innerHTML = `
<div id="printBackdrop" onclick="PrintModule.close()" style="
  display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);
  z-index:9998;backdrop-filter:blur(4px)"></div>
<div id="printSheet" style="
  display:none;position:fixed;left:0;right:0;bottom:0;z-index:9999;
  background:#1c2333;border-radius:20px 20px 0 0;border-top:1px solid #30363d;
  padding:0 0 env(safe-area-inset-bottom);max-height:90vh;overflow-y:auto;
  transform:translateY(100%);transition:transform .3s cubic-bezier(.32,0,.67,0)">

  <!-- Handle -->
  <div style="width:40px;height:4px;background:#30363d;border-radius:2px;margin:12px auto 0"></div>

  <!-- Header -->
  <div style="padding:16px 20px 0;display:flex;align-items:center;justify-content:space-between">
    <div>
      <div style="font-size:18px;font-weight:700;font-family:'Syne',sans-serif">🖨️ Imprimir envíos</div>
      <div id="printSubtitle" style="font-size:12px;color:#8b949e;margin-top:2px"></div>
    </div>
    <button onclick="PrintModule.close()" style="
      background:none;border:none;color:#8b949e;font-size:20px;cursor:pointer;
      width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center">✕</button>
  </div>

  <div style="padding:16px 20px">

    <!-- Selector qué imprimir -->
    <div id="printScopeRow" style="display:flex;gap:8px;margin-bottom:16px"></div>

    <!-- Bultos -->
    <div style="margin-bottom:16px">
      <div style="font-size:10px;font-weight:700;color:#8b949e;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px">BULTOS POR ENVÍO</div>
      <div style="display:flex;align-items:center;gap:0;background:#161b22;border:1px solid #30363d;border-radius:12px;overflow:hidden">
        <button onclick="PrintModule.addBultos(-1)" style="
          background:none;border:none;color:#e6edf3;font-size:20px;cursor:pointer;
          width:52px;height:48px;display:flex;align-items:center;justify-content:center;flex-shrink:0">−</button>
        <div style="flex:1;text-align:center">
          <span id="printBultosNum" style="font-size:20px;font-weight:700;font-family:'Syne',sans-serif">1</span>
          <span style="font-size:13px;color:#8b949e;margin-left:4px">bulto(s)</span>
        </div>
        <button onclick="PrintModule.addBultos(1)" style="
          background:none;border:none;color:#e6edf3;font-size:20px;cursor:pointer;
          width:52px;height:48px;display:flex;align-items:center;justify-content:center;flex-shrink:0">+</button>
      </div>
    </div>

    <!-- Formatos -->
    <div style="font-size:10px;font-weight:700;color:#8b949e;letter-spacing:1px;text-transform:uppercase;margin-bottom:10px">FORMATO DE IMPRESIÓN</div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px">

      <div id="fmt_etiqueta" class="print-fmt-opt" onclick="PrintModule.selectFmt('etiqueta')" style="
        background:#161b22;border:1.5px solid #30363d;border-radius:12px;padding:14px 16px;cursor:pointer;
        display:flex;align-items:center;gap:12px;transition:border-color .15s">
        <div style="font-size:22px">📦</div>
        <div style="flex:1">
          <div style="font-weight:600;font-size:14px">Etiqueta de envío</div>
          <div style="font-size:11px;color:#8b949e;margin-top:2px">Para pegar en el paquete · nombre grande · dirección clara · QR</div>
        </div>
        <div class="fmt-check" style="width:20px;height:20px;border-radius:50%;border:2px solid #30363d;flex-shrink:0"></div>
      </div>

      <div id="fmt_lista" class="print-fmt-opt" onclick="PrintModule.selectFmt('lista')" style="
        background:#161b22;border:1.5px solid #30363d;border-radius:12px;padding:14px 16px;cursor:pointer;
        display:flex;align-items:center;gap:12px;transition:border-color .15s">
        <div style="font-size:22px">📋</div>
        <div style="flex:1">
          <div style="font-weight:600;font-size:14px">Lista de despacho</div>
          <div style="font-size:11px;color:#8b949e;margin-top:2px">Para tu registro interno · tabla compacta · todos los datos · QR</div>
        </div>
        <div class="fmt-check" style="width:20px;height:20px;border-radius:50%;border:2px solid #30363d;flex-shrink:0"></div>
      </div>

    </div>

    <!-- Tip impresora -->
    <div id="printTip" style="
      background:rgba(56,139,253,.08);border:1px solid rgba(56,139,253,.2);
      border-radius:10px;padding:11px 14px;margin-bottom:16px;font-size:11px;
      color:#8b949e;line-height:1.6;display:none"></div>

    <!-- Botón imprimir -->
    <button onclick="PrintModule.print()" style="
      width:100%;padding:15px;background:#388bfd;border:none;border-radius:12px;
      color:#fff;font-weight:700;font-size:15px;font-family:'Syne',sans-serif;cursor:pointer">
      🖨️ Imprimir ahora
    </button>

    <button onclick="PrintModule.close()" style="
      width:100%;padding:13px;background:none;border:none;
      color:#8b949e;font-size:14px;cursor:pointer;margin-top:4px">
      Cancelar
    </button>

  </div>
</div>`;
  document.body.appendChild(el);
}

/* ── ESTADO ─────────────────────────────────────────────────────── */
let _scope   = 'sel';   // 'sel' | 'new'
let _fmt     = 'etiqueta';
let _bultos  = 1;
let _list    = [];

const TIPS = {
  etiqueta: '💡 <b>Impresora A4:</b> sin márgenes, orientación vertical · <b>Térmica 100×150mm:</b> configura el papel en el diálogo de impresión',
  lista:    '💡 <b>Impresora A4:</b> márgenes normales, orientación horizontal para más columnas · <b>Térmica:</b> no recomendado para este formato',
};

/* ── API PÚBLICA ─────────────────────────────────────────────────── */
window.PrintModule = {

  open(){
    _injectModal();
    const S = window.S;
    if(!S||!S.shipments||!S.shipments.length){ window.toast&&toast('Sin envíos'); return; }

    const sel = S.shipments.filter(x=>x.sel);
    const newOnes = S.shipments.filter(x=>x.status==='NUEVO PEDIDO'&&!x.printed);

    // Decidir scope inicial
    _scope = sel.length ? 'sel' : 'new';
    _list  = _scope==='sel' ? sel : newOnes;
    _bultos = 1;  // siempre empieza en 1 por impresión (no persistir valor viejo)
    _fmt    = localStorage.getItem('print_fmt') || 'etiqueta';

    this._renderScope(sel, newOnes);
    this._updateBultos();
    this.selectFmt(_fmt);
    this._show();
  },

  // Abre el modal directo con un solo pedido — ignora seleccionados del panel
  openOne(id){
    _injectModal();
    const S = window.S;
    if(!S) return;
    const ship = S.shipments.find(x=>x.id===id);
    if(!ship){ window.toast&&toast('Pedido no encontrado'); return; }
    _scope  = 'one';
    _list   = [ship];
    _bultos = 1;  // siempre empieza en 1 por impresión (no persistir valor viejo)
    _fmt    = localStorage.getItem('print_fmt') || 'etiqueta';
    // Mostrar chip "1 pedido" sin opciones de scope
    const row = document.getElementById('printScopeRow');
    if(row) row.innerHTML = '<div style="font-size:12px;color:#8b949e;padding:4px 0">📦 1 pedido — <b style="color:#e6edf3">'+esc(ship.name)+'</b></div>';
    this._updateBultos();
    this.selectFmt(_fmt);
    this._updateSubtitle();
    this._show();
  },

  // Imprime una LISTA específica de pedidos (por id) — independiente de la
  // selección del panel (x.sel). La usa Compartir para imprimir etiquetas
  // de los envíos vinculados a tokens usados, sin tocar nada de Envíos.
  openList(ids){
    _injectModal();
    const S = window.S;
    if(!S || !S.shipments){ window.toast&&toast('Sin envíos'); return; }
    const list = (ids||[]).map(id => S.shipments.find(x=>x.id===id)).filter(Boolean);
    if(!list.length){ window.toast&&toast('Sin pedidos para imprimir'); return; }
    _scope  = 'list';
    _list   = list;
    _bultos = 1;
    _fmt    = localStorage.getItem('print_fmt') || 'etiqueta';
    const row = document.getElementById('printScopeRow');
    if(row) row.innerHTML = '<div style="font-size:12px;color:#8b949e;padding:4px 0">📦 '+list.length+' pedido'+(list.length>1?'s':'')+' seleccionado'+(list.length>1?'s':'')+'</div>';
    this._updateBultos();
    this.selectFmt(_fmt);
    this._updateSubtitle();
    this._show();
  },

  _show(){
    document.getElementById('printBackdrop').style.display = 'block';
    const sheet = document.getElementById('printSheet');
    sheet.style.display = 'block';
    requestAnimationFrame(()=>{ sheet.style.transform = 'translateY(0)'; });
  },

  close(){
    const sheet = document.getElementById('printSheet');
    if(!sheet) return;
    sheet.style.transform = 'translateY(100%)';
    setTimeout(()=>{
      sheet.style.display = 'none';
      document.getElementById('printBackdrop').style.display = 'none';
    }, 300);
  },

  _renderScope(sel, newOnes){
    const row = document.getElementById('printScopeRow');
    if(!row) return;
    const opts = [];
    if(sel.length){
      opts.push({ key:'sel', label:`✅ Seleccionados · ${sel.length}` });
    }
    if(newOnes.length){
      opts.push({ key:'new', label:`✨ Nuevos · ${newOnes.length}` });
    }
    if(!opts.length){
      opts.push({ key:'all', label:`📦 Todos · ${window.S.shipments.length}` });
      _scope = 'all';
    }
    row.innerHTML = opts.map(o=>`
      <button id="scope_${o.key}" onclick="PrintModule.setScope('${o.key}')" style="
        flex:1;padding:12px 8px;border-radius:10px;font-weight:600;font-size:13px;
        cursor:pointer;font-family:inherit;transition:all .15s;
        background:${_scope===o.key?'#388bfd':'#161b22'};
        border:${_scope===o.key?'none':'1.5px solid #30363d'};
        color:${_scope===o.key?'#fff':'#8b949e'}">${o.label}</button>
    `).join('');

    this._updateSubtitle();
  },

  setScope(key){
    const S = window.S;
    _scope = key;
    if(key==='sel') _list = S.shipments.filter(x=>x.sel);
    else if(key==='new') _list = S.shipments.filter(x=>x.status==='NUEVO PEDIDO'&&!x.printed);
    else _list = S.shipments;

    // Actualizar estilos botones
    ['sel','new','all'].forEach(k=>{
      const btn = document.getElementById('scope_'+k);
      if(!btn) return;
      btn.style.background = k===key ? '#388bfd' : '#161b22';
      btn.style.border = k===key ? 'none' : '1.5px solid #30363d';
      btn.style.color = k===key ? '#fff' : '#8b949e';
    });
    this._updateSubtitle();
  },

  _updateSubtitle(){
    const el = document.getElementById('printSubtitle');
    if(el) el.textContent = `${_list.length} envío${_list.length!==1?'s':''} · ${_bultos} bulto${_bultos!==1?'s':''} c/u`;
  },

  addBultos(delta){
    _bultos = Math.max(1, Math.min(10, _bultos + delta));
    localStorage.setItem('print_bultos', _bultos);
    this._updateBultos();
    this._updateSubtitle();
  },

  _updateBultos(){
    const el = document.getElementById('printBultosNum');
    if(el) el.textContent = _bultos;
  },

  selectFmt(fmt){
    _fmt = fmt;
    localStorage.setItem('print_fmt', fmt);
    // Estilos opciones
    ['etiqueta','lista'].forEach(f=>{
      const el = document.getElementById('fmt_'+f);
      const chk = el ? el.querySelector('.fmt-check') : null;
      if(!el||!chk) return;
      if(f===fmt){
        el.style.borderColor = '#388bfd';
        el.style.background = 'rgba(56,139,253,.08)';
        chk.style.background = '#388bfd';
        chk.style.borderColor = '#388bfd';
      } else {
        el.style.borderColor = '#30363d';
        el.style.background = '#161b22';
        chk.style.background = 'none';
        chk.style.borderColor = '#30363d';
      }
    });
    // Tip
    const tip = document.getElementById('printTip');
    if(tip){
      tip.innerHTML = TIPS[fmt]||'';
      tip.style.display = 'block';
    }
  },

  print(){
    if(!_list.length){ window.toast&&toast('No hay envíos para imprimir'); return; }
    const S = window.S;
    // Refrescar _list con los datos más recientes de window.S
    const ids = _list.map(x=>x.id);
    _list = S.shipments.filter(x=>ids.includes(x.id));
    if(!_list.length){ window.toast&&toast('No hay envíos para imprimir'); return; }
    const bizName = (S.config&&S.config.name)||'Mi Negocio';
    const bizPhone = (S.config&&S.config.phone)||'';
    const bizCity  = (S.config&&S.config.city)||'';
    const fecha = new Date().toLocaleDateString('es-PE',{day:'2-digit',month:'long',year:'numeric'});
    const qrUrl = v => `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(v)}`;

    let html = '';
    if(_fmt==='etiqueta'){
      html = _htmlEtiqueta(_list, _bultos, bizName, bizPhone, bizCity, fecha, qrUrl);
    } else {
      html = _htmlLista(_list, _bultos, bizName, bizPhone, bizCity, fecha, qrUrl);
    }

    // Blob URL evita document.write síncrono que congela el hilo principal
    let blobUrl;
    try {
      const blob = new Blob([html], {type:'text/html;charset=utf-8'});
      blobUrl = URL.createObjectURL(blob);
    } catch(e){ blobUrl = null; }
    const w = blobUrl ? window.open(blobUrl,'_blank') : window.open('','_blank');
    if(!w){ window.toast&&toast('⚠️ Permitir popups para imprimir'); if(blobUrl) URL.revokeObjectURL(blobUrl); return; }
    if(!blobUrl){ w.document.write(html); w.document.close(); }
    // Limpiar URL del blob tras 2 minutos
    if(blobUrl) setTimeout(()=>URL.revokeObjectURL(blobUrl), 120000);

    // Marcar como impresos
    _list.forEach(s=>{ s.printed = true; });
    window.save&&save();

    this.close();
  }
};

/* ── FORMATO 1: ETIQUETA ─────────────────────────────────────────── */
function _htmlEtiqueta(list, bultos, bizName, bizPhone, bizCity, fecha, qrUrl){
  const cards = [];
  list.forEach(s=>{
    for(let b=0; b<bultos; b++){
      const bLabel = bultos>1 ? ` (${b+1}/${bultos})` : '';
      const addr = s.address || s.ciudadDestino || '—';
      const notes = s.notes ? `<div class="notes">📝 ${esc(s.notes)}</div>` : '';
      const agencia = s.courier&&s.courier.toUpperCase().includes('SHALOM') && s.address
        ? `<div class="agencia">🏢 ${esc(s.address)}</div>` : '';
      cards.push(`
        <div class="card">
          <div class="card-top">
            <div class="remitente">
              <div class="rem-label">REMITENTE</div>
              <div class="rem-name">${esc(bizName)}</div>
              ${bizPhone?`<div class="rem-sub">Tel: ${esc(bizPhone)}</div>`:''}
              ${bizCity?`<div class="rem-sub">${esc(bizCity)}</div>`:''}
            </div>
            <div class="qr-box">
              <img src="${qrUrl(s.phone)}" alt="QR" width="90" height="90">
              <div class="qr-label">${esc(s.phone)}</div>
            </div>
          </div>
          <div class="divider"></div>
          <div class="destinatario">
            <span class="dest-label">PARA:${bLabel}</span>
            <div class="dest-name">${esc(s.name)}</div>
            <div class="dest-phone">${esc(s.phone)}</div>
            ${(s.dniRecoger||s.dni)?`<div class="dest-dni"><b>DNI:</b> ${esc(s.dniRecoger||s.dni)}</div>`:''}
            <div style="font-size:clamp(7.5pt,1.4vw,9pt);font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#555;margin:2mm 0 1mm">DESTINO:</div>
            <div class="dest-addr">${esc(addr)}</div>
            ${s.referencia?`<div class="agencia"><b>Ref:</b> ${esc(s.referencia)}</div>`:''}
            ${notes}
          </div>
          <div class="card-footer">
            <span class="courier">${esc(s.courier||'—')}</span>
            <span class="fecha">${esc(s.date||'—')}</span>
            <span class="codigo">#${esc(s.id?s.id.slice(-4).toUpperCase():'???')}</span>
          </div>
          <div class="card-thanks">
            <span class="card-thanks-txt">Gracias por su preferencia — ${esc(bizName)}</span>
            <span class="card-thanks-time">${new Date().toLocaleString('es-PE',{weekday:'short',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}</span>
          </div>
        </div>`);
    }
  });

  return `<!DOCTYPE html><html lang="es"><head>
<meta charset="UTF-8">
<title>Etiquetas — ${esc(bizName)}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:100%; font-family:'Arial',sans-serif; background:#fff; color:#000; }
  body { padding:4mm; }

  .header { text-align:center; margin-bottom:4mm; padding-bottom:3mm; border-bottom:2px solid #000; }
  .header h1 { font-size:clamp(11pt,2.5vw,15pt); font-weight:900; letter-spacing:1px; text-transform:uppercase; }
  .header p  { font-size:clamp(8pt,1.5vw,9pt); color:#555; margin-top:1mm; }

  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(85mm,1fr)); gap:5mm; }

  .card {
    border:1.5px solid #000; border-radius:3px;
    padding:3mm; page-break-inside:avoid; break-inside:avoid;
    background:#fff;
  }

  /* REMITENTE — línea compacta arriba */
  .card-top { display:flex; justify-content:space-between; align-items:flex-start; gap:3mm; margin-bottom:2.5mm; padding-bottom:2mm; border-bottom:1px solid #000; }
  .remitente { flex:1; min-width:0; }
  .rem-label { font-size:clamp(6pt,1.1vw,7pt); font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#555; margin-bottom:0.5mm; }
  .rem-name  { font-size:clamp(9pt,1.8vw,11pt); font-weight:700; color:#000; }
  .rem-sub   { font-size:clamp(7pt,1.3vw,8.5pt); color:#444; margin-top:0.5mm; }
  .qr-box    { text-align:center; flex-shrink:0; }
  .qr-box img { display:block; width:clamp(18mm,12vw,26mm); height:clamp(18mm,12vw,26mm); }
  .qr-label  { font-size:clamp(6pt,1vw,7pt); color:#555; margin-top:0.5mm; text-align:center; }

  .divider { display:none; }

  /* DESTINATARIO */
  .destinatario { }
  .dest-label { font-size:clamp(6.5pt,1.2vw,8pt); font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#555; margin-bottom:1mm; display:block; }
  .dest-name  { font-size:clamp(13pt,3vw,17pt); font-weight:900; line-height:1.15; margin-bottom:2mm; color:#000; text-transform:uppercase; }
  .dest-phone { font-size:clamp(10pt,2.2vw,13pt); font-weight:700; color:#000; margin-bottom:1.5mm; }
  .dest-addr  { font-size:clamp(8pt,1.6vw,10pt); color:#000; margin-bottom:1.5mm; line-height:1.5; font-weight:400; }
  .dest-ref   { font-size:clamp(8pt,1.5vw,9.5pt); color:#000; margin-bottom:1mm; font-weight:700; display:block; }
  .dest-dni   { font-size:clamp(12pt,2.4vw,15pt); color:#000; margin-bottom:2mm; font-weight:900; display:block; letter-spacing:1px; }
  .agencia    { font-size:clamp(8pt,1.5vw,9.5pt); color:#000; margin-bottom:1mm; font-weight:700; display:block; }
  .notes      { font-size:clamp(7.5pt,1.4vw,9pt); color:#333; font-style:italic; margin-top:1mm; display:block; }

  /* FOOTER */
  .card-footer {
    display:flex; justify-content:space-between; align-items:center;
    margin-top:2.5mm; padding-top:2mm; border-top:1.5px solid #000;
  }
  .courier { font-size:clamp(8pt,1.6vw,10pt); font-weight:900; color:#000; text-transform:uppercase; letter-spacing:1px; }
  .fecha   { font-size:clamp(7.5pt,1.4vw,9pt); color:#333; font-weight:700; }
  .codigo  { font-size:clamp(10pt,2.2vw,13pt); font-weight:900; color:#000; letter-spacing:2px; }

  .card-thanks { display:flex; justify-content:space-between; align-items:center; margin-top:2mm; padding-top:1.5mm; border-top:1px dashed #aaa; }
  .card-thanks-txt  { font-size:clamp(6pt,1vw,7.5pt); color:#555; font-style:italic; }
  .card-thanks-time { font-size:clamp(6pt,1vw,7pt); color:#777; }

  @media print {
    body { padding:2mm; }
    .grid { gap:3mm; }
    @page { margin:3mm; size:auto; }
  }
</style>
</head><body>
<div class="header">
  <h1>${esc(bizName)} — ETIQUETAS DE ENVÍO</h1>
  <p>${fecha} · ${list.length} envío${list.length!==1?'s':''} · ${bultos} bulto${bultos!==1?'s':''} c/u</p>
</div>
<div class="grid">${cards.join('')}</div>
<script>window.onload=()=>{ window.print(); }<\/script>
</body></html>`;
}

/* ── FORMATO 2: LISTA DE DESPACHO ────────────────────────────────── */
function _htmlLista(list, bultos, bizName, bizPhone, bizCity, fecha, qrUrl){
  const rows = list.map((s,i)=>{
    const addr = s.address || s.ciudadDestino || '—';
    const bultosLabel = bultos > 1 ? `<span style="background:#fef3c7;padding:1px 5px;border-radius:3px;font-size:9pt">${bultos} bultos</span>` : '';
    return `<tr class="${i%2===0?'even':'odd'}">
      <td class="num">${i+1}</td>
      <td>
        <div class="row-name">${esc(s.name)}</div>
        <div class="row-phone">${esc(s.phone)}</div>
      </td>
      <td>
        <div class="row-addr">${esc(addr)}</div>
        ${s.dniRecoger?`<div class="row-sub">DNI: ${esc(s.dniRecoger)}</div>`:''}
        ${s.referencia?`<div class="row-sub">Ref: ${esc(s.referencia)}</div>`:''}
      </td>
      <td>
        <div>${esc(s.courier||'—')}</div>
        <div class="row-sub">${esc(s.date||'—')}</div>
      </td>
      <td>${s.notes?`<div class="row-sub">${esc(s.notes)}</div>`:''}</td>
      <td class="center">
        <img src="${qrUrl(s.phone)}" width="60" height="60" alt="">
        ${bultosLabel}
      </td>
      <td class="center check-col">☐</td>
    </tr>`;
  });

  return `<!DOCTYPE html><html lang="es"><head>
<meta charset="UTF-8">
<title>Lista — ${esc(bizName)}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; font-size:9pt; background:#fff; padding:10mm; }
  .header { margin-bottom:6mm; }
  .header h1 { font-size:14pt; font-weight:900; letter-spacing:1px; margin-bottom:1mm; }
  .header p  { font-size:9pt; color:#555; }
  .header-meta { display:flex; gap:12mm; margin-top:2mm; font-size:8pt; color:#777; }
  table { width:100%; border-collapse:collapse; }
  thead tr { background:#000; color:#fff; }
  th { padding:3mm 2mm; text-align:left; font-size:8pt; letter-spacing:.5px; text-transform:uppercase; white-space:nowrap; }
  td { padding:2.5mm 2mm; vertical-align:top; border-bottom:1px solid #e5e7eb; }
  .even td { background:#fafafa; }
  .odd  td { background:#fff; }
  .num  { font-size:8pt; color:#999; text-align:center; width:6mm; }
  .row-name  { font-weight:700; font-size:10pt; }
  .row-phone { font-size:8pt; color:#555; margin-top:1px; }
  .row-addr  { font-size:9pt; line-height:1.4; }
  .row-sub   { font-size:7.5pt; color:#777; margin-top:1px; }
  .center    { text-align:center; vertical-align:middle; }
  .check-col { width:12mm; font-size:16pt; color:#000; }
  tfoot td   { border-top:2px solid #000; padding-top:3mm; font-size:8pt; color:#555; }
  @media print {
    body { padding:5mm; }
    @page { margin:5mm; size:A4 landscape; }
    thead { display:table-header-group; }
  }
</style>
</head><body>
<div class="header">
  <h1>${esc(bizName)} — LISTA DE DESPACHO</h1>
  <div class="header-meta">
    <span>${fecha}</span>
    ${bizPhone?`<span>Tel: ${esc(bizPhone)}</span>`:''}
    ${bizCity?`<span>${esc(bizCity)}</span>`:''}
    <span>${list.length} envío${list.length!==1?'s':''}</span>
    ${bultos>1?`<span>${bultos} bultos c/u</span>`:''}
  </div>
</div>
<table>
  <thead>
    <tr>
      <th>#</th>
      <th>Cliente</th>
      <th>Dirección / Destino</th>
      <th>Courier / Fecha</th>
      <th>Notas</th>
      <th>QR</th>
      <th>✓</th>
    </tr>
  </thead>
  <tbody>${rows.join('')}</tbody>
  <tfoot>
    <tr>
      <td colspan="7">
        Total: ${list.length} envío${list.length!==1?'s':''} · 
        ${bultos>1?`${list.length*bultos} bultos en total · `:''} 
        Impreso: ${fecha} · ${esc(bizName)}
      </td>
    </tr>
  </tfoot>
</table>
<script>window.onload=()=>{ window.print(); }<\/script>
</body></html>`;
}

/* ── HELPER ─────────────────────────────────────────────────────── */
function esc(s){
  return String(s||'')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}
window.esc = esc;

  /* ── CAMPANA DE IMPRESIÓN EN HEADER ─────────────────────────────── */
  function _injectPrintBell(){
    var slot = document.getElementById('printBellSlot');
    if(!slot || slot.querySelector('#printBellBtn')) return;
    slot.innerHTML =
      '<button id="printBellBtn" onclick="PrintModule.open()" title="Pedidos sin imprimir" style="'+
        'position:relative;background:none;border:none;cursor:pointer;'+
        'font-size:18px;padding:2px 4px;flex-shrink:0;line-height:1;'+
        'display:flex;align-items:center;gap:2px;color:#e6edf3">'+
        '<span style="font-size:15px">🖨️</span>'+
        '<span style="font-size:16px">🔔</span>'+
        '<span id="printBellBadge" style="'+
          'display:none;position:absolute;top:-3px;right:-3px;'+
          'background:#f78166;color:#fff;font-size:9px;font-weight:900;'+
          'min-width:16px;height:16px;border-radius:8px;'+
          'align-items:center;justify-content:center;'+
          'padding:0 3px;line-height:1;font-family:inherit">0</span>'+
      '</button>';
  }

  // Exponer updateBadge para que index.html lo llame desde updateStats
  window.PrintModule.updateBadge = function(){
    var S = window.S;
    if(!S || !S.shipments) return;
    _injectPrintBell();
    var sinImprimir = S.shipments.filter(function(x){ return !x.printed && x.status !== 'FINALIZADO'; }).length;
    var badge = document.getElementById('printBellBadge');
    var bell  = document.getElementById('printBellBtn');
    if(badge){
      badge.textContent = sinImprimir;
      badge.style.display = sinImprimir > 0 ? 'flex' : 'none';
    }
    if(bell){
      bell.style.opacity = sinImprimir > 0 ? '1' : '0.45';
      bell.title = sinImprimir > 0
        ? sinImprimir + ' pedido' + (sinImprimir !== 1 ? 's' : '') + ' sin imprimir'
        : 'Todo impreso';
    }
  };

  // Inyectar al cargar
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', _injectPrintBell);
  } else {
    setTimeout(_injectPrintBell, 200);
  }

})();
