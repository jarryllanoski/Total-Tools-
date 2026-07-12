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
    el.innerHTML=_rows.map(function(r,i){
      return '<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">'
        + '<input value="'+_esc(r.codigo)+'" oninput="Cotizacion._edit('+i+',\'codigo\',this.value)" placeholder="Código" style="width:96px;background:var(--bg2);border:1px solid var(--bd);border-radius:8px;color:var(--text);padding:8px;font-size:12px;font-family:monospace;box-sizing:border-box">'
        + '<input value="'+_esc(r.desc)+'" oninput="Cotizacion._edit('+i+',\'desc\',this.value)" placeholder="Descripción" style="flex:1;min-width:0;background:var(--bg2);border:1px solid var(--bd);border-radius:8px;color:var(--text);padding:8px;font-size:12px;box-sizing:border-box">'
        + '<input value="'+_esc(r.cant)+'" oninput="Cotizacion._edit('+i+',\'cant\',this.value)" inputmode="numeric" style="width:44px;background:var(--bg2);border:1px solid var(--bd);border-radius:8px;color:var(--text);padding:8px;font-size:12px;text-align:center;box-sizing:border-box">'
        + '<button onclick="Cotizacion._del('+i+')" style="background:none;border:none;color:var(--red);font-size:18px;cursor:pointer;padding:0 2px;flex-shrink:0">✕</button>'
        + '</div>';
    }).join('');
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
      _rows = Array.isArray(s.cotizItems) ? s.cotizItems.map(function(r){ return {codigo:r.codigo||'', desc:r.desc||'', cant:r.cant||1}; }) : [];
      var pb=document.getElementById('cotizPasteBox'); if(pb) pb.style.display='none';
      var pt=document.getElementById('cotizPaste'); if(pt) pt.value='';
      _setStatus('');
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
    _addRow: function(){ _rows.push({codigo:'',desc:'',cant:1}); _renderRows();
      var el=document.getElementById('cotizList'); if(el) el.scrollTop=el.scrollHeight; },

    guardar: function(){
      var s=_find(_curId); if(!s){ _toast('Pedido no encontrado'); return; }
      var items=_rows
        .map(function(r){ return { codigo:(r.codigo||'').trim().toUpperCase(), desc:(r.desc||'').trim(), cant:parseInt(r.cant,10)||1, enTienda:false, proveedor:null }; })
        .filter(function(r){ return r.codigo || r.desc; });
      // Preservar flags que ya existían (enTienda/proveedor) por código, para no perderlos.
      if(Array.isArray(s.cotizItems)){
        items.forEach(function(r){
          var prev=s.cotizItems.find(function(p){ return p.codigo===r.codigo; });
          if(prev){ r.enTienda=!!prev.enTienda; r.proveedor=prev.proveedor||null; }
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
