/* ═══════════════════════════════════════════════════════════════════════
   COTIZACIÓN — módulo aislado (Fase 1)
   ---------------------------------------------------------------------------
   Captura la boleta/cotización de un pedido: subís un PDF (o pegás el texto),
   se extrae { código · descripción · cantidad } en una lista EDITABLE y se
   guarda en el pedido (shipment.cotizItems).

   Aislamiento: todo vive en window.Cotizacion. Reusa los globales existentes
   (save, render, toast, $, escH) igual que config.js — sin monkey-patch. El
   panel se auto-inyecta en el DOM desde aquí (no ensucia el <body>).

   Fase 2 (cruce con Excel de proveedores + volcado a Proveedores) y Fase 3
   (OCR de imágenes) se enchufan después sin reescribir esto: el parser
   (parseTexto) y el modelo (cotizItems) ya quedan listos.
   ═══════════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  // pdf.js se baja del CDN sólo la primera vez que se abre el panel.
  var PDFJS_SRC    = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  var PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  var _pdfLoading  = null;

  var _curId = null; // pedido abierto en el panel

  // ── STOCK: API por FUENTE (tienda o proveedor) ──────────────────────────
  // Cada fuente guarda su catálogo bajo 'tt_stock_<id>'. La UI NUNCA toca el
  // almacenamiento directo: usa esta API. Así el backend es intercambiable
  // (localStorage hoy; IndexedDB si el volumen crece) sin tocar la UI —
  // "funciona con cualquier carga de trabajo".
  var STOCK_PREFIX = 'tt_stock_';
  var TIENDA_ID    = 'sup_tienda';   // fuente fija: mi tienda (stock propio)
  function _stockKey(pid){ return STOCK_PREFIX + pid; }
  var Stock = {
    get: function(pid){ try{ var r=localStorage.getItem(_stockKey(pid)); return r?JSON.parse(r):null; }catch(e){ return null; } },
    set: function(pid,data){ try{ localStorage.setItem(_stockKey(pid), JSON.stringify(data)); return true; }catch(e){ return false; } },
    del: function(pid){ try{ localStorage.removeItem(_stockKey(pid)); }catch(e){} },
    // Lookup O(1) por código.
    find: function(pid,cod){ var s=this.get(pid); if(!s||!s.catalog||!cod) return null; return s.catalog[String(cod).trim().toUpperCase()]||null; },
    // Parsea el Excel (array-of-arrays) y lo guarda. Devuelve nº de productos.
    importAOA: function(pid,aoa,fileName){ var res=_detectAndBuild(aoa); if(!res||!res.meta.count) return 0; this.set(pid,{catalog:res.catalog,meta:res.meta,fileName:fileName||'',ts:Date.now()}); return res.meta.count; }
  };
  // Migración única del stock global viejo → stock de tienda.
  try{ if(!localStorage.getItem(_stockKey(TIENDA_ID))){ var _old=localStorage.getItem('tt_cotiz_stock'); if(_old){ localStorage.setItem(_stockKey(TIENDA_ID), _old); localStorage.removeItem('tt_cotiz_stock'); } } }catch(e){}

  // Id real de la fuente "tienda" (por si se creó con otro id vía el formulario).
  function _tiendaProvId(){ var t=((window.S&&S.suppliers)||[]).find(function(x){ return x.tipo==='tienda'; }); return t?t.id:TIENDA_ID; }
  function _tiendaStock(){ return Stock.get(_tiendaProvId()); }         // stock de tienda (Excel del panel 🧾)
  function _stockFind(cod){ return Stock.find(_tiendaProvId(), cod); }  // ¿está en tienda?
  function _provs(){ return ((window.S&&S.suppliers)||[]).filter(function(x){ return x.tipo!=='tienda'; }); }
  function _provName(id){ var p=((window.S&&S.suppliers)||[]).find(function(x){ return x.id===id; }); return p?(p.name||'proveedor'):'proveedor'; }
  // ¿hay alguna fuente de stock cargada (tienda o algún proveedor)?
  function _haySources(){
    if(_tiendaStock()) return true;
    return _provs().some(function(pv){ return !!Stock.get(pv.id); });
  }
  // Clasifica un ítem: 🏬 en tienda / 🏭 en proveedor(es) / ⚠️ faltante.
  function _clasificarItem(r){
    if(r.enTienda || _stockFind(r.codigo)) return { tipo:'tienda' };
    var enProvs=_provs().filter(function(pv){ return !!Stock.find(pv.id, r.codigo); });
    if(enProvs.length) return { tipo:'proveedor', provs:enProvs };
    return { tipo:'faltante' };
  }

  // Helpers seguros (por si el global no existe en algún contexto)
  function _esc(s){ return (typeof escH==='function') ? escH(s) : String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function _toast(m){ if(typeof toast==='function') toast(m); }
  function _find(id){ return (window.S&&S.shipments||[]).find(function(x){return x.id===id;}); }

  /* ── PARSER (núcleo, testeable) ──────────────────────────────────────────
     Máquina de estados por líneas sobre el texto de la boleta:
       · Detecta un CÓDIGO (ej. THT1320503, o "THT1320801 - Prensa ...").
       · Acumula la DESCRIPCIÓN en las líneas siguientes.
       · Cierra el ítem al ver la línea de CANTIDAD ("2  UND  12.50  25.00").
     Tolera el código y la descripción juntos o separados. Devuelve:
       [{ codigo, desc, cant }]
  */
  var RE_CODIGO = /^([A-Z]{2,5}[-]?\d{4,})\b\s*[-–—]?\s*(.*)$/;   // código al inicio (+ resto opcional)
  var RE_CANT   = /^(\d{1,5})\s*(?:UND|UNID|U|PZA|PZS|PCS)\b/i;   // "2 UND ..."
  var RE_SOLO_NUM = /^\d[\d.,]*$/;                                // línea de solo números (precios)

  function parseTexto(raw){
    var out = [];
    if(!raw) return out;
    var lines = String(raw).replace(/\r/g,'').split('\n')
      .map(function(l){ return l.trim(); })
      .filter(function(l){ return l.length>0; });

    var cur = null;
    function push(){ if(cur && cur.codigo){ cur.desc=(cur.desc||'').trim(); out.push(cur); } cur=null; }

    for(var i=0;i<lines.length;i++){
      var ln = lines[i];
      var mCant = ln.match(RE_CANT);
      if(mCant && cur){
        // Línea de cantidad → cierra el ítem actual.
        cur.cant = parseInt(mCant[1],10) || 1;
        push();
        continue;
      }
      var mCod = ln.match(RE_CODIGO);
      if(mCod){
        // Nuevo código → cierra el anterior (si quedó sin cantidad) y abre uno nuevo.
        push();
        cur = { codigo: mCod[1].toUpperCase(), desc: (mCod[2]||'').trim(), cant: 1 };
        continue;
      }
      // Línea intermedia: parte de la descripción (ignora líneas de solo precios).
      if(cur && !RE_SOLO_NUM.test(ln) && !/^(SUBTOTAL|I\.?G\.?V|TOTAL|MONTO|SON:|CANT|P\.?UNIT|IMPORTE|FORMA DE PAGO|CAJERO|CLIENTE|DIRECC|DNI|RUC|BOLETA|FECHA|GRACIAS)/i.test(ln)){
        cur.desc = (cur.desc ? cur.desc+' ' : '') + ln;
      }
    }
    push();
    return out;
  }

  /* ── DETECTOR DE COLUMNAS DEL EXCEL DE STOCK ─────────────────────────────
     Recibe la hoja como array-of-arrays (SheetJS header:1). Auto-detecta:
       · CÓDIGO: la columna con más celdas tipo código (letras+dígitos).
       · DESCRIPCIÓN: encabezado 'desc/nombre/producto' o la columna de texto
         más larga.
       · PRECIO: encabezado 'precio/pvp/costo/importe' (usa la ÚLTIMA, que suele
         ser la de distribuidor) o la última columna numérica con decimales.
       · STOCK: encabezado 'stock/cantidad/disponible'.
     Tolera encabezados en cualquier fila (usa la fila anterior al primer código).
     Devuelve { catalog, meta } o null si no hay columna de código.            */
  var CODE_RE = /^[A-Z]{2,6}[-]?\d{3,}/i;
  function _detectAndBuild(aoa){
    if(!aoa || !aoa.length) return null;
    var nCols = aoa.reduce(function(m,r){ return Math.max(m, (r||[]).length); }, 0);
    var v = function(r,c){ return (aoa[r] && aoa[r][c]!=null) ? String(aoa[r][c]).trim() : ''; };

    // Columna de código = la de más coincidencias
    var codeCol=-1, best=0;
    for(var c=0;c<nCols;c++){ var cnt=0; for(var r=0;r<aoa.length;r++){ if(CODE_RE.test(v(r,c))) cnt++; } if(cnt>best){ best=cnt; codeCol=c; } }
    if(codeCol<0 || best===0) return null;

    // Primera fila de datos y fila de encabezados (la anterior)
    var firstData=0; for(var r2=0;r2<aoa.length;r2++){ if(CODE_RE.test(v(r2,codeCol))){ firstData=r2; break; } }
    var header = firstData>0 ? (aoa[firstData-1]||[]).map(function(h){ return String(h==null?'':h).trim(); }) : [];
    var hkw = function(c,kw){ return new RegExp(kw,'i').test(header[c]||''); };

    // Descripción
    var descCol=-1;
    for(var c3=0;c3<nCols;c3++){ if(c3!==codeCol && hkw(c3,'desc|nombre|producto|articul|detalle')){ descCol=c3; break; } }
    if(descCol<0){ var bl=0; for(var c4=0;c4<nCols;c4++){ if(c4===codeCol) continue; var tot=0,n=0; for(var r4=firstData;r4<aoa.length;r4++){ var s=v(r4,c4); if(s && isNaN(Number(s.replace(/[^\d.,-]/g,'')))){ tot+=s.length; n++; } } var avg=n?tot/n:0; if(avg>bl){ bl=avg; descCol=c4; } } }

    // Precio (última columna candidata)
    var precioCols=[];
    for(var c5=0;c5<nCols;c5++){ if(c5===codeCol||c5===descCol) continue; if(hkw(c5,'precio|pvp|costo|importe|valor')) precioCols.push(c5); }
    if(!precioCols.length){ for(var c6=0;c6<nCols;c6++){ if(c6===codeCol||c6===descCol) continue; var num=0,tn=0; for(var r6=firstData;r6<aoa.length;r6++){ var raw=v(r6,c6); if(raw){ tn++; if(/\d/.test(raw)&&/[.,]/.test(raw)) num++; } } if(tn && num/tn>0.5) precioCols.push(c6); } }
    var precioCol = precioCols.length ? precioCols[precioCols.length-1] : -1;

    // Stock
    var stockCol=-1;
    for(var c7=0;c7<nCols;c7++){ if(c7===codeCol) continue; if(hkw(c7,'stock|cantidad|dispon|exist|saldo')){ stockCol=c7; break; } }

    var catalog={};
    for(var r7=firstData;r7<aoa.length;r7++){
      var cod=v(r7,codeCol).toUpperCase();
      if(!CODE_RE.test(cod)) continue;
      catalog[cod]={
        codigo: cod,
        desc:   descCol>=0   ? v(r7,descCol)   : '',
        precio: precioCol>=0 ? v(r7,precioCol) : '',
        stock:  stockCol>=0  ? v(r7,stockCol)  : ''
      };
    }
    return { catalog: catalog, meta: { count:Object.keys(catalog).length, codeCol:codeCol, descCol:descCol, precioCol:precioCol, stockCol:stockCol, header:header } };
  }

  function _renderStockBar(){
    var info=document.getElementById('cotizStockInfo'); if(!info) return;
    var t=_tiendaStock();
    if(t && t.meta){ info.innerHTML='🏬 Stock de tienda: <b>'+t.meta.count+'</b> productos'+(t.fileName?(' · '+_esc(t.fileName)):''); }
    else { info.textContent='🏬 Sin stock de tienda cargado'; }
  }

  /* ── CARGA PEREZOSA DE pdf.js ────────────────────────────────────────── */
  function _ensurePdfjs(){
    if(window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if(_pdfLoading) return _pdfLoading;
    _pdfLoading = new Promise(function(resolve,reject){
      var s=document.createElement('script');
      s.src=PDFJS_SRC;
      s.onload=function(){
        if(window.pdfjsLib){
          try{ window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; }catch(e){}
          resolve(window.pdfjsLib);
        } else reject(new Error('pdf.js no cargó'));
      };
      s.onerror=function(){ reject(new Error('No se pudo descargar pdf.js')); };
      document.head.appendChild(s);
    });
    return _pdfLoading;
  }

  // Extrae todo el texto de un PDF (ArrayBuffer) usando pdf.js.
  function _pdfToText(arrayBuffer){
    return _ensurePdfjs().then(function(pdfjs){
      return pdfjs.getDocument({data:arrayBuffer}).promise.then(function(pdf){
        var pages=[];
        for(var p=1;p<=pdf.numPages;p++) pages.push(p);
        return pages.reduce(function(chain,p){
          return chain.then(function(acc){
            return pdf.getPage(p).then(function(page){
              return page.getTextContent().then(function(tc){
                // Reconstruir líneas por su posición Y (pdf.js entrega items sueltos).
                var rows={};
                tc.items.forEach(function(it){
                  var y=Math.round((it.transform&&it.transform[5])||0);
                  (rows[y]=rows[y]||[]).push({x:(it.transform&&it.transform[4])||0, s:it.str});
                });
                var ys=Object.keys(rows).map(Number).sort(function(a,b){return b-a;}); // arriba→abajo
                var txt=ys.map(function(y){
                  return rows[y].sort(function(a,b){return a.x-b.x;}).map(function(o){return o.s;}).join(' ');
                }).join('\n');
                return acc + '\n' + txt;
              });
            });
          });
        }, Promise.resolve(''));
      });
    });
  }

  /* ── PANEL (auto-inyectado) ──────────────────────────────────────────── */
  function _ensurePanel(){
    if(document.getElementById('cotizOverlay')) return;
    var ov=document.createElement('div');
    ov.id='cotizOverlay';
    ov.className='overlay';
    // OJO: sin display:none inline — la clase .overlay ya lo oculta y .overlay.open
    // lo muestra; un estilo inline le ganaría a la clase y el panel quedaría invisible.
    ov.innerHTML=''
      + '<div class="sheet" onclick="event.stopPropagation()" style="max-height:88vh;display:flex;flex-direction:column">'
      +   '<div class="sheet-handle"></div>'
      +   '<div class="sheet-title" style="display:flex;align-items:center;justify-content:space-between;gap:8px">'
      +     '<span>🧾 Cotización — <span id="cotizWho"></span></span>'
      +     '<span style="display:flex;align-items:center;gap:10px;flex-shrink:0">'
      +       '<span id="cotizCount" style="font-size:11px;color:var(--text2);font-weight:400"></span>'
      +       '<span onclick="if(window.Ayuda)Ayuda.abrir(\'cotizacion\')" style="font-size:12px;color:#a78bfa;cursor:pointer;font-weight:600" title="Ayuda">📖</span>'
      +     '</span>'
      +   '</div>'
      +   '<div style="font-size:11px;color:var(--text2);line-height:1.5;margin-bottom:10px">Subí el <b>PDF</b> de la boleta o <b>pegá el texto</b>. Se extrae código, descripción y cantidad — todo editable.</div>'
      +   '<div style="display:flex;gap:8px;margin-bottom:10px">'
      +     '<label style="flex:1;padding:12px 8px;background:var(--bg2);border:1.5px solid var(--bd);border-radius:12px;color:var(--text);font-weight:600;font-size:13px;text-align:center;cursor:pointer">📄 Subir PDF'
      +       '<input type="file" accept="application/pdf,.pdf" style="display:none" onchange="Cotizacion._onPdf(this)"></label>'
      +     '<button onclick="Cotizacion._togglePaste()" style="flex:1;padding:12px 8px;background:var(--bg2);border:1.5px solid var(--bd);border-radius:12px;color:var(--text);font-weight:600;font-size:13px;cursor:pointer;font-family:inherit">📋 Pegar texto</button>'
      +   '</div>'
      +   '<div id="cotizPasteBox" style="display:none;margin-bottom:10px">'
      +     '<textarea id="cotizPaste" placeholder="Pegá aquí el texto de la boleta…" style="width:100%;min-height:90px;background:var(--bg2);border:1px solid var(--bd);border-radius:10px;color:var(--text);padding:10px;font-size:12px;font-family:inherit;box-sizing:border-box"></textarea>'
      +     '<button onclick="Cotizacion._parsePasted()" style="width:100%;margin-top:6px;padding:10px;background:var(--blue);border:none;border-radius:10px;color:#fff;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit">✨ Extraer</button>'
      +   '</div>'
      +   '<div id="cotizStockBar" style="display:flex;align-items:center;justify-content:space-between;gap:8px;background:var(--bg2);border:1px solid var(--bd);border-radius:10px;padding:8px 10px;margin-bottom:10px">'
      +     '<span id="cotizStockInfo" style="font-size:11px;color:var(--text2)">🏬 Sin stock de tienda cargado</span>'
      +     '<label style="font-size:11px;color:var(--blue);cursor:pointer;font-weight:600;white-space:nowrap">Stock de tienda<input type="file" accept=".xlsx,.xls,.csv" style="display:none" onchange="Cotizacion._onStock(this)"></label>'
      +   '</div>'
      +   '<div id="cotizJalarBox"></div>'
      +   '<div id="cotizStatus" style="font-size:12px;color:var(--text2);margin-bottom:6px"></div>'
      +   '<div id="cotizList" style="overflow-y:auto;flex:1;min-height:40px"></div>'
      +   '<div style="display:flex;gap:8px;margin-top:10px">'
      +     '<button onclick="Cotizacion._addRow()" style="flex:1;padding:12px;background:var(--bg2);border:1.5px solid var(--bd);border-radius:12px;color:var(--text);font-weight:600;font-size:13px;cursor:pointer;font-family:inherit">➕ Fila</button>'
      +     '<button onclick="Cotizacion.guardar()" style="flex:2;padding:12px;background:var(--green,#2ea043);border:none;border-radius:12px;color:#fff;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit">💾 Guardar</button>'
      +   '</div>'
      +   '<button onclick="Cotizacion._guardarYEnviar()" style="width:100%;margin-top:8px;padding:12px;background:rgba(56,139,253,.15);border:1.5px solid rgba(56,139,253,.4);border-radius:12px;color:var(--blue);font-weight:700;font-size:13px;cursor:pointer;font-family:inherit">📤 Enviar faltantes a proveedor</button>'
      + '</div>';
    // Cerrar sólo al tocar el fondo (no dentro del panel). El listener nativo de
    // fondo se engancha al cargar, y este overlay se inyecta después → lo ponemos acá.
    ov.addEventListener('click', function(e){ if(e.target===ov) Cotizacion.cerrar(); });
    document.body.appendChild(ov);
  }

  var _rows = []; // estado de edición: [{codigo, desc, cant, enTienda}]
  var _envioId=null, _envioItems=[]; // estado del diálogo "enviar a proveedor" (Fase 2b)

  function _renderRows(){
    var el=document.getElementById('cotizList'); if(!el) return;
    var cnt=document.getElementById('cotizCount'); if(cnt) cnt.textContent=_rows.length?(_rows.length+' ítem'+(_rows.length>1?'s':'')):'';
    if(!_rows.length){ el.innerHTML='<div style="text-align:center;color:var(--text2);font-size:12px;padding:18px">Sin ítems todavía. Subí un PDF o pegá el texto.</div>'; return; }
    var html='';
    var hay=_haySources();
    // Resumen multi-fuente (sólo si hay alguna fuente de stock cargada)
    if(hay){
      var cls=Cotizacion.clasificar(_rows);
      html+='<div style="font-size:11px;color:var(--text2);margin-bottom:8px;line-height:1.6">'
        +'🏬 en tienda: <b style="color:var(--green,#2ea043)">'+cls.tienda.length+'</b> · 🏭 en proveedor: <b style="color:var(--blue)">'+cls.proveedor.length+'</b> · ⚠️ faltante: <b style="color:#d29922">'+cls.faltante.length+'</b>'
        +'</div>';
    }
    html+=_rows.map(function(r,i){
      var stockLine='';
      if(!r.enTienda && r.proveedor){
        // Ya enviado a cotizar → mostrar a quién (con opción de quitar).
        stockLine='<div style="font-size:10.5px;color:var(--blue);margin-top:5px;padding-left:38px">📤 Enviado a <b>'+_esc(_provName(r.proveedor))+'</b> <span onclick="Cotizacion._quitarEnvio('+i+')" style="color:var(--red);cursor:pointer;margin-left:6px">✕ quitar</span></div>';
      } else if(hay && !r.enTienda){
        var c=_clasificarItem(r);
        if(c.tipo==='tienda'){
          var m=_stockFind(r.codigo);
          stockLine='<div style="font-size:10.5px;color:var(--green,#2ea043);margin-top:5px;padding-left:38px">🏬 En tienda'+(m&&m.precio?(' · '+_esc(m.precio)):'')+(m&&m.stock?(' · stock '+_esc(m.stock)):'')+'</div>';
        } else if(c.tipo==='proveedor'){
          stockLine='<div style="font-size:10.5px;color:var(--blue);margin-top:5px;padding-left:38px">🏭 Disponible en: '+c.provs.map(function(pv){ return _esc(pv.name||'?'); }).join(', ')+'</div>';
        } else {
          stockLine='<div style="font-size:10.5px;color:#d29922;margin-top:5px;padding-left:38px">⚠️ Faltante — no está en tienda ni en proveedores</div>';
        }
      }
      return '<div style="border:1px solid var(--bd);border-radius:8px;padding:6px;margin-bottom:6px;background:'+(r.enTienda?'rgba(46,160,67,.08)':'transparent')+'">'
        + '<div style="display:flex;gap:6px;align-items:center">'
        +   '<button onclick="Cotizacion._togTienda('+i+')" title="'+(r.enTienda?'En tienda (tocá si falta)':'Falta — conseguir (tocá si ya lo tenés)')+'" style="background:none;border:1px solid var(--bd);border-radius:8px;width:30px;height:30px;font-size:15px;cursor:pointer;flex-shrink:0;padding:0">'+(r.enTienda?'🏬':'🛒')+'</button>'
        +   '<input value="'+_esc(r.codigo)+'" oninput="Cotizacion._edit('+i+',\'codigo\',this.value)" placeholder="Código" style="width:84px;background:var(--bg2);border:1px solid var(--bd);border-radius:8px;color:var(--text);padding:8px;font-size:12px;font-family:monospace;box-sizing:border-box">'
        +   '<input value="'+_esc(r.desc)+'" oninput="Cotizacion._edit('+i+',\'desc\',this.value)" placeholder="Descripción" style="flex:1;min-width:0;background:var(--bg2);border:1px solid var(--bd);border-radius:8px;color:var(--text);padding:8px;font-size:12px;box-sizing:border-box">'
        +   '<input value="'+_esc(r.cant)+'" oninput="Cotizacion._edit('+i+',\'cant\',this.value)" inputmode="numeric" style="width:40px;background:var(--bg2);border:1px solid var(--bd);border-radius:8px;color:var(--text);padding:8px;font-size:12px;text-align:center;box-sizing:border-box">'
        +   '<button onclick="Cotizacion._del('+i+')" style="background:none;border:none;color:var(--red);font-size:18px;cursor:pointer;padding:0 2px;flex-shrink:0">✕</button>'
        + '</div>'
        + stockLine
        + '</div>';
    }).join('');
    el.innerHTML=html;
  }

  function _setStatus(msg,color){
    var el=document.getElementById('cotizStatus'); if(!el) return;
    el.textContent=msg||''; el.style.color=color||'var(--text2)';
  }

  // Persiste _rows en el pedido (sin cerrar el panel). Devuelve el shipment.
  function _persist(){
    var s=_find(_curId); if(!s) return null;
    var items=_rows
      .map(function(r){ return { codigo:(r.codigo||'').trim().toUpperCase(), desc:(r.desc||'').trim(), cant:parseInt(r.cant,10)||1, enTienda:!!r.enTienda, proveedor:(r.enTienda?null:(r.proveedor||null)), ean:r.ean||'' }; })
      .filter(function(r){ return r.codigo || r.desc; });
    s.cotizItems=items;
    if(typeof save==='function') save(s.id); // incremental
    return s;
  }

  /* ── EXTRACCIÓN ON-DEMAND DESDE EL COMPROBANTE (Fase 2) ────────────────────
     Al abrir el 🧾: si el pedido tiene link apisale y aún no fue procesado,
     llama la Cloud Function (con el token del panel) una sola vez y rellena los
     productos. Si ya está procesado, no llama (muestra lo guardado).           */
  var FUNC_EXTRAER = 'https://us-central1-total-tools-24ce8.cloudfunctions.net/extraerComprobante';
  function _apisaleLink(s){
    var arr=(s&&s.links)||[];
    for(var i=0;i<arr.length;i++){ var u=(arr[i]&&arr[i].u)||''; if(/apisale\.institucional\.pe/i.test(u)) return u; }
    return '';
  }
  function _getToken(){
    var p=Promise.resolve();
    try{ if(typeof window._authEnsureToken==='function') p=Promise.resolve(window._authEnsureToken()); }catch(e){}
    return p.then(function(){ try{ return localStorage.getItem('tt_id_token')||''; }catch(e){ return ''; } });
  }
  // Estados donde SÍ se jala automáticamente al abrir (fase de preparación).
  var _AUTO_STATES = ['NUEVO PEDIDO', 'EN PROCESO', 'POR ALISTAR'];
  // Botón manual: hay link apisale y todavía no hay ítems (aunque un intento
  // previo haya quedado "procesado" pero vacío → vuelve a ofrecer jalar).
  function _puedeJalar(s){
    return !!_apisaleLink(s) &&
      !(Array.isArray(s.cotizItems) && s.cotizItems.length);
  }
  // Auto-jalar (una sola vez): solo si aún no fue procesado, para no re-jalar
  // solo en cada apertura si un PDF genuinamente no tiene productos.
  function _puedeAuto(s){
    return _puedeJalar(s) &&
      !(s.extraccion && s.extraccion.estado==='procesado');
  }
  function _renderJalarBox(s){
    var box=document.getElementById('cotizJalarBox'); if(!box) return;
    box.innerHTML = _puedeJalar(s)
      ? '<button onclick="Cotizacion._jalarAhora()" style="width:100%;margin-bottom:10px;padding:11px;background:rgba(56,139,253,.15);border:1.5px solid rgba(56,139,253,.4);border-radius:12px;color:var(--blue);font-weight:700;font-size:13px;cursor:pointer;font-family:inherit">📥 Jalar del comprobante</button>'
      : '';
  }
  // Al abrir: si va a auto-jalar (estado de preparación), va directo a extraer
  // (muestra ⏳) sin dibujar el botón ni un instante; si no, muestra el manual.
  function _maybeExtraer(s){
    if(!s || !window.fetch) return;
    if(_puedeAuto(s) && _AUTO_STATES.indexOf(s.status)>=0){ _extraer(s); return; }
    _renderJalarBox(s);
  }
  // Llama la Cloud Function y rellena los productos.
  function _extraer(s){
    if(!s || !window.fetch) return;
    var box=document.getElementById('cotizJalarBox'); if(box) box.innerHTML='';
    _setStatus('⏳ Extrayendo del comprobante…');
    _getToken().then(function(tok){
      var headers = tok ? {'Authorization':'Bearer '+tok} : {};
      return fetch(FUNC_EXTRAER+'?pedidoId='+encodeURIComponent(s.id), {headers:headers});
    }).then(function(r){ return r.json(); }).then(function(data){
      if(_curId!==s.id) return;                                    // el usuario cambió de pedido
      if(data && data.ok && Array.isArray(data.cotizItems)){
        s.cotizItems=data.cotizItems;
        s.extraccion=s.extraccion||{}; s.extraccion.estado='procesado';
        _rows=data.cotizItems.map(function(r){ return {codigo:r.codigo||'', desc:r.desc||'', cant:r.cant||1, enTienda:!!r.enTienda, proveedor:r.proveedor||null, ean:r.ean||''}; });
        _renderJalarBox(s); _renderRows();
        _setStatus(_rows.length?('✓ '+_rows.length+' producto(s) del comprobante — revisá y corregí si hace falta.'):'El comprobante no arrojó productos — cargá el PDF a mano.', _rows.length?'var(--green,#2ea043)':'#d29922');
        if(typeof render==='function') render();
      } else {
        _renderJalarBox(s);
        _setStatus('⚠️ '+((data&&data.motivo)||'No se pudo leer el comprobante')+' — podés subir el PDF a mano.','var(--red)');
      }
    }).catch(function(){
      if(_curId===s.id){ _renderJalarBox(s); _setStatus('⚠️ Error al leer el comprobante — subí el PDF a mano.','var(--red)'); }
    });
  }

  /* ── PANEL "ENVIAR A PROVEEDOR" (Fase 2b, auto-inyectado) ──────────────── */
  function _ensureEnvioPanel(){
    if(document.getElementById('cotizEnvioOverlay')) return;
    var ov=document.createElement('div');
    ov.id='cotizEnvioOverlay'; ov.className='overlay';
    ov.innerHTML=''
      + '<div class="sheet" onclick="event.stopPropagation()" style="max-height:85vh;display:flex;flex-direction:column">'
      +   '<div class="sheet-handle"></div>'
      +   '<div class="sheet-title">🏭 Enviar a cotizar — <span id="cotizEnvWho"></span></div>'
      +   '<div id="cotizEnvInfo" style="font-size:11.5px;color:var(--text2);line-height:1.5;margin-bottom:10px"></div>'
      +   '<div id="cotizEnvList" style="overflow-y:auto;flex:1;min-height:40px;margin-bottom:10px"></div>'
      +   '<label style="font-size:11px;color:var(--text2);display:block;margin-bottom:4px">Enviar a proveedor:</label>'
      +   '<select id="cotizEnvSup" style="width:100%;background:var(--bg2);border:1px solid var(--bd);border-radius:10px;color:var(--text);padding:11px;font-size:14px;font-family:inherit;margin-bottom:10px;box-sizing:border-box"></select>'
      +   '<div style="display:flex;gap:8px">'
      +     '<button onclick="Cotizacion._closeEnvio()" style="flex:1;padding:12px;background:var(--bg2);border:1.5px solid var(--bd);border-radius:12px;color:var(--text);font-weight:600;font-size:13px;cursor:pointer;font-family:inherit">Ahora no</button>'
      +     '<button onclick="Cotizacion._confirmEnvio()" style="flex:2;padding:12px;background:var(--blue);border:none;border-radius:12px;color:#fff;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit">📤 Enviar a proveedor</button>'
      +   '</div>'
      + '</div>';
    ov.addEventListener('click', function(e){ if(e.target===ov) Cotizacion._closeEnvio(); });
    document.body.appendChild(ov);
  }

  function _openEnvio(s, aEnviar, sups){
    Cotizacion.cerrar(); // cerrar el panel de cotización si estaba abierto
    _envioId=s.id; _envioItems=aEnviar;
    _ensureEnvioPanel();
    // ¿qué proveedor tiene cada ítem? + sugerir el que cubre más.
    var cobertura={}; // supId → nº de ítems que tiene
    aEnviar.forEach(function(r){
      sups.forEach(function(pv){ if(Stock.find(pv.id, r.codigo)){ cobertura[pv.id]=(cobertura[pv.id]||0)+1; } });
    });
    var sugerido=null, mejor=0;
    sups.forEach(function(pv){ var c=cobertura[pv.id]||0; if(c>mejor){ mejor=c; sugerido=pv; } });

    document.getElementById('cotizEnvWho').textContent=s.name||'—';
    document.getElementById('cotizEnvInfo').innerHTML=
      '<b>'+aEnviar.length+'</b> faltante(s) a cotizar'
      + (sugerido?(' · sugerido: <b style="color:var(--blue)">'+_esc(sugerido.name)+'</b> ('+mejor+'/'+aEnviar.length+')'):'');
    document.getElementById('cotizEnvList').innerHTML=aEnviar.map(function(r){
      var enProvs=sups.filter(function(pv){ return !!Stock.find(pv.id, r.codigo); });
      var tag = enProvs.length
        ? '<span style="color:var(--blue)">🏭 '+enProvs.map(function(pv){ return _esc(pv.name||'?'); }).join(', ')+'</span>'
        : '<span style="color:#d29922">⚠️ ningún proveedor</span>';
      return '<div style="padding:7px 0;border-bottom:1px solid var(--bd);font-size:12.5px">'
        + '<b style="font-family:monospace">'+_esc(r.codigo)+'</b> · '+_esc(r.desc||'')+' · <b>'+_esc(r.cant)+'</b>u'
        + '<div style="font-size:10.5px;margin-top:2px">'+tag+'</div>'
        + '</div>';
    }).join('');
    var sel=document.getElementById('cotizEnvSup');
    if(!sups.length){ sel.innerHTML='<option value="">Sin proveedores — agregá uno en Proveedores</option>'; }
    else { sel.innerHTML=sups.map(function(su){ return '<option value="'+_esc(su.id)+'">'+_esc(su.name||su.id)+'</option>'; }).join(''); }
    if(sel && sugerido) sel.value=sugerido.id; // preselecciona el sugerido
    if(typeof openOverlay==='function') openOverlay('cotizEnvioOverlay');
  }

  /* ── API pública ─────────────────────────────────────────────────────── */
  var Cotizacion = {
    parseTexto: parseTexto,

    abrir: function(id){
      var s=_find(id); if(!s){ _toast('Pedido no encontrado'); return; }
      _curId=id;
      _ensurePanel();
      document.getElementById('cotizWho').textContent = (s.name||'—');
      _rows = Array.isArray(s.cotizItems) ? s.cotizItems.map(function(r){ return {codigo:r.codigo||'', desc:r.desc||'', cant:r.cant||1, enTienda:!!r.enTienda, proveedor:r.proveedor||null, ean:r.ean||''}; }) : [];
      var pb=document.getElementById('cotizPasteBox'); if(pb) pb.style.display='none';
      var pt=document.getElementById('cotizPaste'); if(pt) pt.value='';
      _setStatus('');
      _renderStockBar();
      _renderRows();
      if(typeof openOverlay==='function') openOverlay('cotizOverlay');
      else document.getElementById('cotizOverlay').style.display='flex';
      _maybeExtraer(s);   // on-demand: si tiene comprobante apisale y no fue procesado
    },

    cerrar: function(){
      var o=document.getElementById('cotizOverlay'); if(!o) return; // aún no inyectado
      if(typeof closeOverlay==='function') closeOverlay('cotizOverlay'); else o.classList.remove('open');
    },

    _togglePaste: function(){
      var b=document.getElementById('cotizPasteBox'); if(!b) return;
      b.style.display = b.style.display==='none' ? 'block' : 'none';
      if(b.style.display==='block'){ var t=document.getElementById('cotizPaste'); if(t) t.focus(); }
    },

    _parsePasted: function(){
      var t=document.getElementById('cotizPaste'); if(!t) return;
      var items=parseTexto(t.value);
      if(!items.length){ _setStatus('No se reconocieron ítems. Revisá el texto o agregá filas a mano.','var(--red)'); return; }
      _rows=items; _renderRows();
      _setStatus('✓ '+items.length+' ítem(s) extraído(s) — revisá y corregí si hace falta.','var(--green,#2ea043)');
    },

    _onPdf: function(input){
      var file=input && input.files && input.files[0]; if(!file) return;
      _setStatus('⏳ Leyendo PDF…');
      var reader=new FileReader();
      reader.onload=function(e){
        _pdfToText(e.target.result).then(function(text){
          var items=parseTexto(text);
          if(!items.length){
            _setStatus('No se reconocieron ítems en el PDF. Probá "Pegar texto" o agregá filas a mano.','var(--red)');
            var pb=document.getElementById('cotizPasteBox'); if(pb) pb.style.display='block';
            var pt=document.getElementById('cotizPaste'); if(pt) pt.value=text;
            return;
          }
          _rows=items; _renderRows();
          _setStatus('✓ '+items.length+' ítem(s) desde el PDF — revisá y corregí si hace falta.','var(--green,#2ea043)');
        }).catch(function(err){
          _setStatus('⚠️ '+(err&&err.message||'Error leyendo el PDF')+'. Usá "Pegar texto".','var(--red)');
          var pb=document.getElementById('cotizPasteBox'); if(pb) pb.style.display='block';
        });
      };
      reader.onerror=function(){ _setStatus('⚠️ No se pudo leer el archivo.','var(--red)'); };
      reader.readAsArrayBuffer(file);
      input.value='';
    },

    _edit: function(i,campo,val){ if(_rows[i]) _rows[i][campo]=val; },
    _del:  function(i){ _rows.splice(i,1); _renderRows(); },
    _addRow: function(){ _rows.push({codigo:'',desc:'',cant:1,enTienda:false}); _renderRows();
      var el=document.getElementById('cotizList'); if(el) el.scrollTop=el.scrollHeight; },

    // Alternar "en tienda" (🏬) vs "falta" (🛒). Exclusivo: en tienda limpia el
    // proveedor. Persiste al toque para que la vista de la Tienda quede en sync.
    _togTienda: function(i){ if(_rows[i]){ _rows[i].enTienda=!_rows[i].enTienda; if(_rows[i].enTienda) _rows[i].proveedor=null; _persist(); _renderRows(); } },
    // Quitar el envío a proveedor de un ítem (vuelve a faltante/disponible).
    _quitarEnvio: function(i){ if(_rows[i]){ _rows[i].proveedor=null; _persist(); _renderRows(); if(typeof render==='function') render(); } },

    // ── STOCK: API pública (usada por el panel 🧾 y por la UI de Proveedores) ─
    stock: Stock,          // Cotizacion.stock.get/set/del/find/importAOA(pid,...)
    TIENDA_ID: TIENDA_ID,

    // Asegura (en memoria) que exista la fuente fija "🏬 Tienda" en S.suppliers.
    ensureTienda: function(){
      if(!window.S) return null;
      if(!S.suppliers) S.suppliers=[];
      var t=S.suppliers.find(function(x){ return x.tipo==='tienda'; });
      if(!t){ t={ id:TIENDA_ID, name:'Tienda', tipo:'tienda', phone:'', items:[] }; S.suppliers.unshift(t); }
      return t;
    },

    // importarAOA (panel 🧾): carga el Excel como STOCK DE TIENDA. Testeable.
    importarAOA: function(aoa, fileName){
      var n=Stock.importAOA(_tiendaProvId(), aoa, fileName);
      if(!n) return 0;
      _renderStockBar(); _renderRows();
      return n;
    },

    // ── VISTAS DERIVADAS (modelo relacional) ──────────────────────────────
    // Todos los ítems de cotización (de todos los pedidos) asignados a una
    // fuente. fuente tienda → enTienda=true; proveedor → proveedor===id.
    // Se calcula al vuelo (no se copia) → siempre en sync.
    itemsDeFuente: function(fuenteId){
      var f=((window.S&&S.suppliers)||[]).find(function(x){ return x.id===fuenteId; });
      var esTienda = f && f.tipo==='tienda';
      var out=[];
      ((window.S&&S.shipments)||[]).forEach(function(s){
        (s.cotizItems||[]).forEach(function(it){
          var match = esTienda ? !!it.enTienda : (it.proveedor===fuenteId);
          if(match) out.push({ codigo:it.codigo, desc:it.desc, cant:it.cant, pedidoId:s.id, cliente:s.name });
        });
      });
      return out;
    },
    // Reasignar un ítem (pedido+código) a: 'tienda' | providerId | null (quitar).
    asignar: function(pedidoId, codigo, dest){
      var s=((window.S&&S.shipments)||[]).find(function(x){ return x.id===pedidoId; }); if(!s) return;
      var it=(s.cotizItems||[]).find(function(x){ return x.codigo===codigo; }); if(!it) return;
      if(dest==='tienda'){ it.enTienda=true; it.proveedor=null; }
      else if(dest){ it.enTienda=false; it.proveedor=dest; }
      else { it.enTienda=false; it.proveedor=null; }
      if(typeof save==='function') save(s.id);   // incremental
    },
    _onStock: function(input){
      var file=input && input.files && input.files[0]; if(!file) return;
      if(typeof XLSX==='undefined'){ _setStatus('⚠️ Librería de Excel no disponible.','var(--red)'); return; }
      _setStatus('⏳ Leyendo Excel…');
      var reader=new FileReader();
      reader.onload=function(e){
        try{
          var wb=XLSX.read(e.target.result,{type:'array'});
          var ws=wb.Sheets[wb.SheetNames[0]];
          var aoa=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
          var n=Cotizacion.importarAOA(aoa, file.name);
          if(!n){ _setStatus('⚠️ No se reconoció una columna de código en el Excel.','var(--red)'); return; }
          _setStatus('✓ '+n+' productos cargados como stock de tienda.','var(--green,#2ea043)');
        }catch(err){ _setStatus('⚠️ '+((err&&err.message)||'Error leyendo el Excel'),'var(--red)'); }
      };
      reader.onerror=function(){ _setStatus('⚠️ No se pudo leer el Excel.','var(--red)'); };
      reader.readAsArrayBuffer(file);
      input.value='';
    },
    // clasificar (Fase B): agrupa los ítems en tienda / proveedor / faltante.
    clasificar: function(items){
      var res={ tienda:[], proveedor:[], faltante:[] };
      (items||[]).forEach(function(r){
        var c=_clasificarItem(r);
        if(c.tipo==='tienda') res.tienda.push(r);
        else if(c.tipo==='proveedor') res.proveedor.push({item:r, provs:c.provs});
        else res.faltante.push(r);
      });
      return res;
    },
    // comparar (compat): faltantes según el stock de tienda.
    comparar: function(items){
      var faltantes=(items||[]).filter(function(r){ return !r.enTienda; });
      var enStock=[], sinStock=[];
      faltantes.forEach(function(r){ var m=_stockFind(r.codigo); if(m) enStock.push({item:r, match:m}); else sinStock.push(r); });
      return { faltantes:faltantes.length, enStock:enStock, sinStock:sinStock };
    },
    getStock: function(){ return _tiendaStock(); },

    // Botón manual "📥 Jalar del comprobante" (estados no automáticos).
    _jalarAhora: function(){ var s=_find(_curId); if(s) _extraer(s); },

    // ── ENVIAR A PROVEEDOR (Fase 2b) ──────────────────────────────────────
    // Compara los faltantes con el Excel; abre el diálogo para elegir proveedor.
    enviarProveedor: function(id){
      var s=_find(id); if(!s){ _toast('Pedido no encontrado'); return; }
      var items=Array.isArray(s.cotizItems)?s.cotizItems:[];
      // Faltantes = lo que NO tenés en tienda (por marca 🏬 o por el Excel de tienda).
      var aEnviar=items.filter(function(r){ return _clasificarItem(r).tipo!=='tienda'; });
      if(!aEnviar.length){ _toast('Todo está en tienda — no hay faltantes'); return; }
      _openEnvio(s, aEnviar, _provs()); // proveedores secundarios (no la Tienda)
    },

    // Hook: se llama al cambiar el estado de un pedido. Sólo actúa en EN PROCESO.
    onEstado: function(id, st){
      if(!/PROCESO/i.test(st||'')) return;
      var s=_find(id); if(!s || !Array.isArray(s.cotizItems) || !s.cotizItems.length) return;
      var faltantes=s.cotizItems.filter(function(r){ return !r.enTienda; });
      if(!faltantes.length) return;       // nada que conseguir → no molesta
      this.enviarProveedor(id);           // abre el diálogo (con confirmación)
    },

    _closeEnvio: function(){
      if(typeof closeOverlay==='function') closeOverlay('cotizEnvioOverlay');
      else { var o=document.getElementById('cotizEnvioOverlay'); if(o) o.classList.remove('open'); }
    },

    _confirmEnvio: function(){
      var s=_find(_envioId); if(!s){ this._closeEnvio(); return; }
      var sel=document.getElementById('cotizEnvSup');
      var supId=sel?sel.value:'';
      var sup=((window.S&&S.suppliers)||[]).find(function(x){ return x.id===supId; });
      if(!sup){ _toast('Elegí un proveedor (o agregá uno en Proveedores)'); return; }
      // Modelo relacional: NO se copia texto al proveedor. Solo se asigna el
      // ítem (fuente única). La ficha del proveedor deriva su lista de acá.
      _envioItems.forEach(function(r){
        var ci=(s.cotizItems||[]).find(function(p){ return p.codigo===r.codigo; });
        if(ci){ ci.proveedor=sup.id; ci.enTienda=false; }
      });
      if(typeof save==='function') save(s.id);  // incremental: solo el pedido
      if(typeof render==='function') render();
      this._closeEnvio();
      _toast('📤 '+_envioItems.length+' ítem(s) asignados a '+(sup.name||'proveedor')+'. Míralo en su ficha.');
    },

    guardar: function(){
      var s=_persist(); if(!s){ _toast('Pedido no encontrado'); return; }
      if(typeof render==='function') render();
      this.cerrar();
      var n=(s.cotizItems||[]).length;
      _toast('💾 Cotización guardada ('+n+' ítem'+(n!==1?'s':'')+')');
    },

    // Guarda y abre el diálogo de envío a proveedor (botón del panel).
    _guardarYEnviar: function(){
      var s=_persist(); if(!s){ _toast('Pedido no encontrado'); return; }
      if(typeof render==='function') render();
      this.enviarProveedor(s.id);
    },

    // Para la tarjeta: ¿cuántos ítems tiene la cotización de este pedido?
    count: function(id){ var s=_find(id); return (s&&Array.isArray(s.cotizItems))?s.cotizItems.length:0; }
  };

  window.Cotizacion = Cotizacion;

  /* ══════════════════════════════════════════════════════════════════════
     AYUDA (co-locada con el módulo — se auto-registra en window.Ayuda).
     ⚠️ IMPORTANTE: si cambiás el flujo de Cotización, actualizá TAMBIÉN este
     bloque y su fecha `actualizado`. La ayuda vive acá, junto al código, para
     que no se desactualice.
     ══════════════════════════════════════════════════════════════════════ */
  var AYUDA_COTIZ = {
    titulo: 'Cotización',
    icono: '🧾',
    actualizado: '2026-07-14',
    pasos: [
      'En cualquier pedido, tocá el icono <b>🧾</b> (al lado del 💬) para abrir la cotización.',
      'Subí el <b>PDF</b> de la boleta o <b>pegá el texto</b>: se extraen <b>código, descripción y cantidad</b> automáticamente. Todo es editable — corregí, agregá (➕ Fila) o borrá (✕) lo que haga falta.',
      'Marcá lo que ya tenés con <b>🏬 en tienda</b>. Lo que quede en <b>🛒</b> son los <b>faltantes</b> (lo que hay que conseguir).',
      'Subí tu <b>Stock de tienda</b> (Excel) desde acá y el <b>Excel de cada proveedor</b> en la sección Proveedores. El sistema detecta las columnas solo.',
      'Cada ítem se clasifica automáticamente: <b>🏬 en tienda</b>, <b>🏭 en proveedor</b> (te dice cuál) o <b>⚠️ faltante</b> (no está en ningún lado). Arriba ves el resumen.',
      'Tocá <b>📤 Enviar faltantes a proveedor</b> (o pasá el pedido a <b>EN PROCESO</b>): te <b>sugiere</b> el proveedor que tiene más ítems; elegís y los faltantes se agregan a su lista en <b>Proveedores</b> para que cotice.',
      'Desde <b>Proveedores</b> le enviás la lista por WhatsApp para que te cotice.'
    ],
    faq: [
      {q:'¿Guarda el PDF o la imagen?', a:'No. Solo se guarda el texto extraído (código, descripción, cantidad). Es liviano y no ocupa espacio ni consume datos.'},
      {q:'¿De dónde sale el “stock de tienda”?', a:'De un Excel que vos subís (tu inventario). Se guarda en este dispositivo y sirve para todos los pedidos, hasta que subas otro.'},
      {q:'¿Qué significa “en tienda” (🏬)?', a:'Que ese producto ya lo tenés. Se excluye de los faltantes y no se manda a cotizar.'},
      {q:'¿Y si un código no aparece en el Excel?', a:'Se marca ⚠️ “sin stock”. Podés conseguirlo por otro lado, o revisar que el código coincida con el del Excel.'},
      {q:'¿Puedo subir una foto/imagen de la boleta?', a:'Por ahora solo PDF o texto pegado. El reconocimiento de imágenes (OCR) llega más adelante.'}
    ],
    tips: [
      'La lista siempre es editable: si el PDF trae un código o cantidad mal, corregilo a mano.',
      'El Excel puede tener casi cualquier formato: el sistema detecta solo la columna de código y las de precio/stock.',
      'Enviar dos veces no duplica: si un ítem ya está en el proveedor, no se agrega de nuevo.'
    ]
  };
  if(window.Ayuda && window.Ayuda.register) window.Ayuda.register('cotizacion', AYUDA_COTIZ);

  /* Ayuda de PROVEEDORES — co-locada acá porque la lógica de stock (Excel por
     proveedor / tienda) vive en este módulo. ⚠️ Actualizá este bloque y su fecha
     si cambiás el flujo de proveedores/stock. */
  var AYUDA_PROVEEDORES = {
    titulo: 'Proveedores y stock',
    icono: '🏭',
    actualizado: '2026-07-14',
    pasos: [
      'La sección Proveedores es tu registro de <b>fuentes de stock</b>: tu <b>🏬 Tienda</b> (fija) y tus <b>proveedores</b>.',
      'Al <b>añadir</b>, elegís el tipo: <b>🏭 Proveedor</b> (secundario) o <b>🏬 Mi tienda</b> (tu stock propio). Solo puede haber una tienda.',
      'Entrá a cualquier fuente para: subir su <b>PDF/imagen</b> de cotización, subir su <b>Excel de stock</b>, y ver/gestionar su lista de pendientes.',
      'El <b>Excel de stock</b> se lee solo (detecta las columnas de código, descripción, precio y stock). El de la <b>Tienda</b> es el mismo que subís en el 🧾 del pedido (“Stock de tienda”).',
      'Podés <b>eliminar</b> un proveedor (la Tienda no se borra). Al borrarlo se elimina también su Excel de stock.',
      'Cada ficha muestra <b>“De cotizaciones”</b>: los ítems de pedidos asignados a esa fuente (los que marcaste 🏬 en tienda, o los que enviaste 📤 a ese proveedor). Es una vista <b>en vivo</b> — no se copia, se calcula, así nunca se desincroniza.',
      'En una cotización, los <b>faltantes</b> (lo que no tenés en tienda) se envían al proveedor que elijas para que cotice; aparecen al instante en su ficha.'
    ],
    faq: [
      {q:'¿Dónde subo mi stock de tienda?', a:'En el 🧾 de cualquier pedido, botón “Stock de tienda”, o en la fuente 🏬 Tienda dentro de Proveedores. Es el mismo stock.'},
      {q:'¿El Excel y las imágenes se sincronizan entre celulares?', a:'No por ahora: se guardan en este dispositivo (localStorage). La sincronización entre equipos llega más adelante.'},
      {q:'¿Puedo cambiar cuál es mi tienda?', a:'Sí: al añadir una fuente como “Mi tienda”, la anterior pasa a proveedor. Siempre hay una sola tienda.'},
      {q:'¿Qué formato tiene que tener el Excel?', a:'Casi cualquiera: el sistema detecta solo la columna de código y las de precio/stock, con encabezados en cualquier fila.'}
    ],
    tips: [
      'Un Excel por fuente: la tienda tiene el suyo y cada proveedor el suyo.',
      'El sistema escala: buscar un código es instantáneo aunque el Excel tenga miles de productos.'
    ]
  };
  if(window.Ayuda && window.Ayuda.register) window.Ayuda.register('proveedores', AYUDA_PROVEEDORES);
})();
