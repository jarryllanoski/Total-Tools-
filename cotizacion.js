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

  // ── STOCK DE PROVEEDOR (Fase 2a) ────────────────────────────────────────
  // Catálogo cargado desde un Excel subido. Vive en localStorage (es grande,
  // no va a Firestore) y sirve para TODOS los pedidos hasta que subas otro.
  var STOCK_KEY = 'tt_cotiz_stock';
  var _stock = null; // { catalog:{COD:{codigo,desc,precio,stock}}, meta, fileName, ts }
  try{ var _sraw = localStorage.getItem(STOCK_KEY); if(_sraw) _stock = JSON.parse(_sraw); }catch(e){}
  function _stockFind(cod){ if(!_stock||!_stock.catalog||!cod) return null; return _stock.catalog[String(cod).trim().toUpperCase()]||null; }

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
    if(_stock && _stock.meta){ info.innerHTML='📊 <b>'+_stock.meta.count+'</b> productos'+(_stock.fileName?(' · '+_esc(_stock.fileName)):''); }
    else { info.textContent='📊 Sin Excel de stock cargado'; }
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
    ov.style.cssText='display:none';
    ov.innerHTML=''
      + '<div class="sheet" onclick="event.stopPropagation()" style="max-height:88vh;display:flex;flex-direction:column">'
      +   '<div class="sheet-handle"></div>'
      +   '<div class="sheet-title" style="display:flex;align-items:center;justify-content:space-between">'
      +     '<span>🧾 Cotización — <span id="cotizWho"></span></span>'
      +     '<span id="cotizCount" style="font-size:11px;color:var(--text2);font-weight:400"></span>'
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
      +     '<span id="cotizStockInfo" style="font-size:11px;color:var(--text2)">📊 Sin Excel de stock cargado</span>'
      +     '<label style="font-size:11px;color:var(--blue);cursor:pointer;font-weight:600;white-space:nowrap">Subir Excel<input type="file" accept=".xlsx,.xls,.csv" style="display:none" onchange="Cotizacion._onStock(this)"></label>'
      +   '</div>'
      +   '<div id="cotizStatus" style="font-size:12px;color:var(--text2);margin-bottom:6px"></div>'
      +   '<div id="cotizList" style="overflow-y:auto;flex:1;min-height:40px"></div>'
      +   '<div style="display:flex;gap:8px;margin-top:10px">'
      +     '<button onclick="Cotizacion._addRow()" style="flex:1;padding:12px;background:var(--bg2);border:1.5px solid var(--bd);border-radius:12px;color:var(--text);font-weight:600;font-size:13px;cursor:pointer;font-family:inherit">➕ Fila</button>'
      +     '<button onclick="Cotizacion.guardar()" style="flex:2;padding:12px;background:var(--green,#2ea043);border:none;border-radius:12px;color:#fff;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit">💾 Guardar</button>'
      +   '</div>'
      + '</div>';
    ov.addEventListener('click', function(){ Cotizacion.cerrar(); });
    document.body.appendChild(ov);
  }

  var _rows = []; // estado de edición: [{codigo, desc, cant}]

  function _renderRows(){
    var el=document.getElementById('cotizList'); if(!el) return;
    var cnt=document.getElementById('cotizCount'); if(cnt) cnt.textContent=_rows.length?(_rows.length+' ítem'+(_rows.length>1?'s':'')):'';
    if(!_rows.length){ el.innerHTML='<div style="text-align:center;color:var(--text2);font-size:12px;padding:18px">Sin ítems todavía. Subí un PDF o pegá el texto.</div>'; return; }
    var html='';
    // Resumen del cruce (sólo si hay Excel de stock cargado)
    if(_stock){
      var cmp=Cotizacion.comparar(_rows);
      html+='<div style="font-size:11px;color:var(--text2);margin-bottom:8px;line-height:1.6">'
        +'🛒 Faltantes: <b>'+cmp.faltantes+'</b> · 📦 en stock proveedor: <b style="color:var(--green,#2ea043)">'+cmp.enStock.length+'</b> · ⚠️ sin stock: <b style="color:#d29922">'+cmp.sinStock.length+'</b>'
        +'</div>';
    }
    html+=_rows.map(function(r,i){
      var m = (_stock && !r.enTienda) ? _stockFind(r.codigo) : null;
      var stockLine='';
      if(_stock && !r.enTienda){
        stockLine = m
          ? '<div style="font-size:10.5px;color:var(--green,#2ea043);margin-top:5px;padding-left:38px">📦 '+_esc(m.desc||'')+(m.precio?(' · '+_esc(m.precio)):'')+' · stock '+_esc(m.stock||'—')+'</div>'
          : '<div style="font-size:10.5px;color:#d29922;margin-top:5px;padding-left:38px">⚠️ No está en el Excel de stock</div>';
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

  /* ── API pública ─────────────────────────────────────────────────────── */
  var Cotizacion = {
    parseTexto: parseTexto,

    abrir: function(id){
      var s=_find(id); if(!s){ _toast('Pedido no encontrado'); return; }
      _curId=id;
      _ensurePanel();
      document.getElementById('cotizWho').textContent = (s.name||'—');
      _rows = Array.isArray(s.cotizItems) ? s.cotizItems.map(function(r){ return {codigo:r.codigo||'', desc:r.desc||'', cant:r.cant||1, enTienda:!!r.enTienda}; }) : [];
      var pb=document.getElementById('cotizPasteBox'); if(pb) pb.style.display='none';
      var pt=document.getElementById('cotizPaste'); if(pt) pt.value='';
      _setStatus('');
      _renderStockBar();
      _renderRows();
      if(typeof openOverlay==='function') openOverlay('cotizOverlay');
      else document.getElementById('cotizOverlay').style.display='flex';
    },

    cerrar: function(){
      if(typeof closeOverlay==='function') closeOverlay('cotizOverlay');
      else { var o=document.getElementById('cotizOverlay'); if(o) o.style.display='none'; }
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

    // Alternar "en tienda" (🏬) vs "falta" (🛒) de un ítem.
    _togTienda: function(i){ if(_rows[i]){ _rows[i].enTienda=!_rows[i].enTienda; _renderRows(); } },

    // ── STOCK: importar Excel y comparar ──────────────────────────────────
    // importarAOA: construye el catálogo desde array-of-arrays (testeable).
    importarAOA: function(aoa, fileName){
      var res=_detectAndBuild(aoa);
      if(!res || !res.meta.count) return 0;
      _stock={ catalog:res.catalog, meta:res.meta, fileName:fileName||'', ts:Date.now() };
      try{ localStorage.setItem(STOCK_KEY, JSON.stringify(_stock)); }catch(e){}
      _renderStockBar(); _renderRows();
      return res.meta.count;
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
          _setStatus('✓ '+n+' productos cargados del Excel de stock.','var(--green,#2ea043)');
        }catch(err){ _setStatus('⚠️ '+((err&&err.message)||'Error leyendo el Excel'),'var(--red)'); }
      };
      reader.onerror=function(){ _setStatus('⚠️ No se pudo leer el Excel.','var(--red)'); };
      reader.readAsArrayBuffer(file);
      input.value='';
    },
    // comparar: separa faltantes (no en tienda) en encontrados/no-encontrados en stock.
    comparar: function(items){
      var faltantes=(items||[]).filter(function(r){ return !r.enTienda; });
      var enStock=[], sinStock=[];
      faltantes.forEach(function(r){ var m=_stockFind(r.codigo); if(m) enStock.push({item:r, match:m}); else sinStock.push(r); });
      return { faltantes:faltantes.length, enStock:enStock, sinStock:sinStock };
    },
    getStock: function(){ return _stock; },

    guardar: function(){
      var s=_find(_curId); if(!s){ _toast('Pedido no encontrado'); return; }
      var items=_rows
        .map(function(r){ return { codigo:(r.codigo||'').trim().toUpperCase(), desc:(r.desc||'').trim(), cant:parseInt(r.cant,10)||1, enTienda:!!r.enTienda, proveedor:null }; })
        .filter(function(r){ return r.codigo || r.desc; });
      // Preservar el proveedor asignado (Fase 2b) por código, para no perderlo.
      if(Array.isArray(s.cotizItems)){
        items.forEach(function(r){
          var prev=s.cotizItems.find(function(p){ return p.codigo===r.codigo; });
          if(prev) r.proveedor=prev.proveedor||null;
        });
      }
      s.cotizItems=items;
      if(typeof save==='function') save(s.id);   // incremental: sólo este pedido (1 escritura)
      if(typeof render==='function') render();
      this.cerrar();
      _toast('💾 Cotización guardada ('+items.length+' ítem'+(items.length!==1?'s':'')+')');
    },

    // Para la tarjeta: ¿cuántos ítems tiene la cotización de este pedido?
    count: function(id){ var s=_find(id); return (s&&Array.isArray(s.cotizItems))?s.cotizItems.length:0; }
  };

  window.Cotizacion = Cotizacion;
})();
