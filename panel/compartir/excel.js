/**
 * panel/compartir/excel.js — exportar e importar Excel / CSV
 * ================================================
 * Fase 3 (10/11/2026): el panel en módulos. Antes vivía en config.js.
 * Script CLÁSICO a propósito: sus funciones y variables son globales, igual
 * que cuando estaban en un solo archivo — moverlas no cambió ni una llamada.
 * El orden de los <script> en index.html es el orden de ejecución.
 */
/* EXCEL EXPORT / IMPORT */
function exportExcel(){
  if(!S.shipments.length){ toast('Sin envíos para exportar'); return; }
  if(typeof XLSX==='undefined'){ toast('⚠️ Cargando librería...'); return; }
  const rows=S.shipments.map(s=>({
    'N° Orden':          s.id||'',
    'Nombre':            s.name||'',
    'Teléfono':          s.phone||'',
    'DNI':               _dniDe(s),
    'Dirección':         s.address||'',
    'Ciudad destino':    s.ciudadDestino||'',
    'Referencia':        s.referencia||'',
    'Courier':           s.courier||'',
    'Fecha':             s.date||'',
    'Estado':            s.status||'',
    'Costo':             s.cost||'',
    'Notas':             s.notes||'',
    'Nota privada':      s.privateNote||'',
    'N° Guía Shalom':    s.trackingOrderNumber||s.shalomGuia||'',
    'Código Shalom':     s.trackingOrderCode||s.shalomCodigo||'',
    'Links':             (s.links||[]).map(l=>l.u||l.url||'').filter(Boolean).join(' | '),
    'Creado':            s.createdAt ? s.createdAt.split('T')[0] : '',
  }));
  const ws=XLSX.utils.json_to_sheet(rows);
  ws['!cols']=[{wch:28},{wch:25},{wch:13},{wch:10},{wch:35},{wch:15},{wch:18},{wch:12},{wch:12},{wch:18},{wch:8},{wch:30},{wch:20},{wch:16},{wch:12},{wch:40},{wch:12}];
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Envíos');
  const date=new Date().toLocaleDateString('es-PE').replace(/\//g,'-');
  XLSX.writeFile(wb,`TotalTools_Envios_${date}.xlsx`);
  toast('📊 Excel descargado');
}

function importExcel(input){
  const file=input.files[0]; if(!file) return;
  const res=$('importResult');
  res.style.display='block'; res.innerHTML='⏳ Procesando...'; res.style.color='var(--text2)';
  const reader=new FileReader();
  reader.onload=e=>{
    try{
      const wb=XLSX.read(e.target.result,{type:'binary'});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const rows=XLSX.utils.sheet_to_json(ws);
      if(!rows.length){ res.innerHTML='⚠️ El archivo está vacío'; return; }
      let added=0, skipped=0;
      rows.forEach(row=>{
        const name=(row['Nombre']||row['nombre']||'').toString().trim();
        const phone=(row['Teléfono']||row['Telefono']||row['telefono']||'').toString().trim();
        const address=(row['Dirección']||row['Direccion']||row['direccion']||'').toString().trim();
        if(!name||!phone){ skipped++; return; }
        const importedId=(row['N° Orden']||'').toString().trim();
        if(importedId && S.shipments.find(x=>x.id===importedId)){ skipped++; return; }
        if(!importedId && S.shipments.find(x=>x.name===name&&x.phone===phone)){ skipped++; return; }
        const guia=(row['N° Guía Shalom']||'').toString().trim();
        const cod=(row['Código Shalom']||'').toString().trim();
        S.shipments.push({
          id: importedId || 'xl_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),
          name, phone, address,
          /* ★ EL DNI VA EN `dni`, QUE ES SU CAMPO.
             Esto escribía SOLO `dniDestinatario`, y el exportador lee `dni`:
             exportar e importar perdía el documento. El pedido volvía sin
             DNI, la etiqueta salía sin DNI, y registrarlo en Shalom —que
             mira `dni`— contestaba «el DNI debe tener 8 dígitos» con el
             número delante, en la pantalla. `dniDestinatario` se mantiene
             por si algún Excel viejo se vuelve a importar. */
          dni:             (row['DNI']||'').toString().trim(),
          dniDestinatario: (row['DNI']||'').toString().trim(),
          ciudadDestino:   (row['Ciudad destino']||'').toString().trim(),
          referencia:      (row['Referencia']||'').toString().trim(),
          courier:(row['Courier']||row['courier']||S.couriers[0]||'').toString().trim(),
          date:(row['Fecha']||row['fecha']||new Date().toISOString().split('T')[0]).toString().trim(),
          status:(row['Estado']||row['estado']||'NUEVO PEDIDO').toString().trim(),
          cost:(row['Costo']||row['costo']||'').toString().trim(),
          notes:(row['Notas']||row['notas']||'').toString().trim(),
          privateNote:(row['Nota privada']||'').toString().trim(),
          trackingOrderNumber: guia, shalomGuia: guia,
          trackingOrderCode: cod, shalomCodigo: cod,
          links: ((row['Links']||row['Links adicionales']||'').toString().split(' | ').map(u=>u.trim()).filter(Boolean)).map(u=>({u, n:u.length>36?u.slice(0,36)+'…':u})),
          extra:{},docGuia:null,docEmbalado:null,docTicket:null,
          sel:false,chkGuia:false,chkEmbalado:false,chkTicket:false,
          createdAt: row['Creado'] ? row['Creado']+'T00:00:00.000Z' : new Date().toISOString(),
        });
        added++;
      });
      save(); render();
      res.style.color=added>0?'var(--green)':'var(--red)';
      res.innerHTML=`✅ ${added} pedido${added!==1?'s':''} importado${added!==1?'s':''}${skipped>0?` · ${skipped} omitido${skipped!==1?'s':''} (duplicados o sin datos)`:''}`;
      if(added>0) toast(`✅ ${added} pedidos importados`);
    }catch(err){
      res.style.color='var(--red)';
      res.innerHTML='❌ Error al leer el archivo.';
    }
    input.value='';
  };
  reader.readAsBinaryString(file);
}

/* EXPORT CSV */
function doCSV(){if(!S.shipments.length){toast('Sin envíos');return}const h=['Nombre','Teléfono','Dirección','Courier','Fecha','Estado','Costo','Notas','Factura/Boleta'];const rows=S.shipments.map(s=>[s.name,s.phone,`"${s.address}"`,s.courier,s.date,s.status,s.cost,`"${s.notes}"`,_nroDe(s)]);const csv=[h,...rows].map(r=>r.join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download=`envios_${new Date().toLocaleDateString('es')}.csv`;a.click();toast('📊 CSV exportado')}

function doPrint(){
  if(window.PrintModule){ PrintModule.open(); }
  else { toast('⚠️ Módulo de impresión no cargado'); }
}
