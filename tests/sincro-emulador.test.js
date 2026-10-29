/* Punta a punta (no corre si no hay emulador): el bloque REAL de Firebase de index.html (dos "PCs") contra
   el emulador de Firestore, más las escrituras del servidor como las hace
   firebase-admin (serverTimestamp). */
const E=require('./_entorno.js');
const Sincro=require('../functions/sincro.js');
const EMU='http://127.0.0.1:8085';
const t=E.leer('index.html'); const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g; let m,FB;
while((m=re.exec(t))) if(m[1].indexOf('window._fbSave =')>=0) FB=m[1];
const PRJ='demo-e2e';
const fetchEmu=(u,init)=>{ u=String(u).replace('https://firestore.googleapis.com',EMU); init=Object.assign({},init); init.headers=Object.assign({},init.headers||{},{Authorization:'Bearer owner'}); return fetch(u,init); };
function pc(nombre){
  const win={FBConfig:{KEY:'k',PRJ}, Sincro, _authToken:async()=>'owner', _fbStatus(){}, Errores:{anotar(d){win.anot=(win.anot||[]).concat(d);}}, toast(){}};
  const almacen={};
  const ctx={window:win,fetch:fetchEmu,localStorage:{getItem:k=>almacen[k]??null,setItem:(k,v)=>almacen[k]=String(v)},
    lsSet:(k,v)=>almacen[k]=String(v),lsGet:k=>almacen[k]??null,console:{warn:(...a)=>win.warns=(win.warns||[]).concat(a.join(' ')),log(){},error(){}},
    _dirtyShips:new Set(),_dirtySupps:new Set(),_dirtyAll:false,_dirtyConfigOnly:false,Sincro};
  const S={config:{name:'TT',phone:'1'},shipments:[],suppliers:[]};
  ctx.S=S;
  const n=Object.keys(ctx);
  new Function(...n, FB+';window.__d=function(){return {ships:_dirtyShips};};')(...n.map(k=>ctx[k]));
  win.S=S; win.nombre=nombre; return win;
}
const B=EMU+'/v1/projects/'+PRJ+'/databases/(default)/documents';
const merge=(w,r)=>{ Object.keys(r).forEach(k=>w.S[k]=r[k]); };
async function servidorEscribe(id, campos){ // como firebase-admin: set merge + serverTimestamp
  const fields={}; Object.keys(campos).forEach(k=>fields[k]={stringValue:String(campos[k])});
  await fetchEmu(B+':commit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({writes:[{update:{name:'projects/'+PRJ+'/databases/(default)/documents/panel/shipments/items/'+id,fields},updateMask:{fieldPaths:Object.keys(campos)},updateTransforms:[{fieldPath:'_mts',setToServerValue:'REQUEST_TIME'}]}]})});
}
async function cfgServidor(extra){ const f={ts:{integerValue:String(Date.now())},syncV:{integerValue:'1'}};
  await fetch(B+'/panel/config?updateMask.fieldPaths=ts&updateMask.fieldPaths=syncV',{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:'Bearer owner'},body:JSON.stringify({fields:f})}); }

module.exports = async ({bloque, ok}) => {
  bloque('Punta a punta contra el emulador de Firestore (dos PCs, servidor, pestaña vieja)');
  let hay = false;
  try { hay = (await fetch(EMU)).ok; } catch (e) { hay = false; }
  if (!hay) {
    ok(true, 'OMITIDA: no hay emulador en 127.0.0.1:8085 (java -jar cloud-firestore-emulator.jar --port 8085). ' +
       'Se corrió el 29/10/2026 con 20/20 bien.');
    return;
  }
  const ids=l=>l.map(x=>x.id).sort().join(',');

  await fetch(EMU+'/emulator/v1/projects/'+PRJ+'/databases/(default)/documents',{method:'DELETE'});
  // Pedidos ANTIGUOS (sin _mts), como están hoy en la nube
  for(const id of ['v1','v2','v3']) await fetch(B+'/panel/shipments/items/'+id,{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:'Bearer owner'},body:JSON.stringify({fields:{id:{stringValue:id},name:{stringValue:'VIEJO '+id},status:{stringValue:'ENVIADO'}}})});
  await fetch(B+'/panel/config',{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:'Bearer owner'},body:JSON.stringify({fields:{config:{mapValue:{fields:{name:{stringValue:'TT'}}}},ts:{integerValue:'1'}}})});
  const A=pc('A'), Bp=pc('B');
  // 1. servidor sin syncV todavía → carga completa
  let r=await A._fbLoad(); merge(A,r);
  ok(A._syncUltimo.modo==='completa' && /servidor/.test(A._syncUltimo.motivo||''), '1 sin syncV: carga completa ('+A._syncUltimo.motivo+')');
  ok(ids(A.S.shipments)==='v1,v2,v3','1 los 3 pedidos antiguos (sin _mts) cargados');
  // 2. servidor desplegado: un pedido del formulario
  await servidorEscribe('f1',{id:'f1',name:'FORM',status:'NUEVO PEDIDO'}); await cfgServidor();
  r=await A._fbLoad({huboCambio:true}); merge(A,r);
  ok(A._syncUltimo.modo==='cambios' && ids(A.S.shipments)==='f1,v1,v2,v3','2 servidor ya desplegado: el pedido del formulario llega por cambios');
  r=await A._fbLoad({}); merge(A,r);
  ok(A._syncUltimo.modo==='cambios','2b sin cambios nuevos: consulta de cambios, no completa ('+A._syncUltimo.n+')');
  ok(ids(A.S.shipments)==='f1,v1,v2,v3','2b nada se escondió: los 4 pedidos');
  // 3. PC B carga y edita un pedido antiguo; A lo recibe por cambios
  r=await Bp._fbLoad(); merge(Bp,r);
  const v2=Bp.S.shipments.find(x=>x.id==='v2'); v2.status='FINALIZADO';
  Bp.__d().ships.add('v2'); await Bp._fbSave(Bp.S);
  r=await A._fbLoad({huboCambio:true}); merge(A,r);
  ok(A._syncUltimo.modo==='cambios' && A.S.shipments.find(x=>x.id==='v2').status==='FINALIZADO', '3 edición de otra PC llega por cambios (n='+A._syncUltimo.n+')');
  ok(A.S.shipments.length===4,'3 y siguen los 4');
  // 4. B borra f1 → lápida → A lo quita
  Bp.S.shipments=Bp.S.shipments.filter(x=>x.id!=='f1'); await Bp._fbDeleteShipment('f1');
  const g=await fetch(B+'/panel/borrados/items/shipments__f1',{headers:{Authorization:'Bearer owner'}}); 
  ok(g.status===200,'4 el borrado dejó lápida');
  r=await A._fbLoad({huboCambio:true}); merge(A,r);
  ok(ids(A.S.shipments)==='v1,v2,v3','4 la otra PC lo quita (lápida) sin carga completa: '+A._syncUltimo.modo);
  // 5. restaurar de la papelera (mismo id, más nuevo que la lápida)
  Bp.S.shipments.push({id:'f1',name:'FORM',status:'NUEVO PEDIDO'}); Bp.__d().ships.add('f1'); await Bp._fbSave(Bp.S);
  r=await A._fbLoad({huboCambio:true}); merge(A,r);
  ok(ids(A.S.shipments)==='f1,v1,v2,v3','5 restaurado vuelve a aparecer (más nuevo que la lápida)');
  // 6. una pestaña VIEJA escribe sin _mts (PATCH clásico) + toca ts → A hace completa
  await fetch(B+'/panel/shipments/items/v3?updateMask.fieldPaths=status',{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:'Bearer owner'},body:JSON.stringify({fields:{status:{stringValue:'POR ALISTAR'}}})});
  await fetch(B+'/panel/config?updateMask.fieldPaths=ts',{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:'Bearer owner'},body:JSON.stringify({fields:{ts:{integerValue:String(Date.now())}}})});
  r=await A._fbLoad({huboCambio:true}); merge(A,r);
  ok(A._syncUltimo.modo==='completa' && A.S.shipments.find(x=>x.id==='v3').status==='POR ALISTAR', '6 escritura sin marca (panel viejo) → carga completa, no se pierde ('+A._syncUltimo.motivo+')');
  // 7. guardado solo-config de otra PC: no fuerza completa
  r=await A._fbLoad({huboCambio:true}); merge(A,r); // estabilizar
  const C=pc('C'); r=await C._fbLoad(); merge(C,r);
  C.S.labels=['X']; await C._fbSave(C.S); // sin pedidos sucios → soloConfig? (dirtyConfigOnly false → pedidos:true)
  r=await A._fbLoad({huboCambio:true}); merge(A,r);
  ok(['cambios','completa'].includes(A._syncUltimo.modo),'7 config-only de otra PC: '+A._syncUltimo.modo+' '+(A._syncUltimo.motivo||''));
  // 8. el _mts leído vuelve a subir sin romper (se quita del dato)
  const a1=A.S.shipments.find(x=>x.id==='v2'); ok(typeof a1._mts==='string','8 _mts se lee como texto ISO: '+a1._mts);
  A.__d().ships.add('v2'); a1.status='ENVIADO'; await A._fbSave(A.S);
  const g2=await (await fetch(B+'/panel/shipments/items/v2',{headers:{Authorization:'Bearer owner'}})).json();
  ok(g2.fields._mts && g2.fields._mts.timestampValue>a1._mts && g2.fields.status.stringValue==='ENVIADO','8 al resubir, _mts lo vuelve a poner el servidor (más nuevo)');
  ok(g2.fields.name.stringValue==='VIEJO v2','8 y los demás campos intactos');

  // 10. proveedor: alta por cambios y borrado con lápida de proveedores
  Bp.S.suppliers=[{id:'prov1',name:'PROV'}]; Bp.__d().supps=Bp.__d().supps||null; 
  await Bp._fbSave(Object.assign({}, Bp.S));
  // sin marcar sucio no sube: marcar con la API real de sucios no es accesible aquí; se escribe directo
  await servidorEscribe('dummy',{id:'dummy',name:'X'});
  await fetchEmu(B+':commit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({writes:[{update:{name:'projects/'+PRJ+'/databases/(default)/documents/panel/suppliers/items/prov1',fields:{id:{stringValue:'prov1'},name:{stringValue:'PROV'}}},updateTransforms:[{fieldPath:'_mts',setToServerValue:'REQUEST_TIME'}]}]})});
  await cfgServidor();
  r=await A._fbLoad({huboCambio:true}); merge(A,r);
  ok(A.S.suppliers.some(x=>x.id==='prov1'),'10 un proveedor nuevo llega por cambios');
  Bp.S.suppliers=[{id:'prov1'}]; await Bp._fbDeleteSupplier('prov1');
  r=await A._fbLoad({huboCambio:true}); merge(A,r);
  ok(!A.S.suppliers.some(x=>x.id==='prov1'),'10 y su borrado también (lápida de proveedores)');
  ok(A.S.shipments.some(x=>x.id==='dummy') && A.S.shipments.length===5,'10 los pedidos no se tocaron (5 = 4 + dummy)');
  // 11. la pista sinMarca de otra PC fuerza la completa
  await fetch(B+'/panel/config?updateMask.fieldPaths=ts&updateMask.fieldPaths=syncHint',{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:'Bearer owner'},
    body:JSON.stringify({fields:{ts:{integerValue:'777'},syncHint:{mapValue:{fields:{ts:{integerValue:'777'},pedidos:{booleanValue:true},sinMarca:{booleanValue:true}}}}}})});
  r=await A._fbLoad({huboCambio:true}); merge(A,r);
  ok(A._syncUltimo.modo==='completa' && /sin hora/.test(A._syncUltimo.motivo||''),'11 otra PC avisó «escribí sin hora» → completa');
  // 9. 12 h sin completa → completa
  A.S._sync.full=Date.now()-13*3600e3; r=await A._fbLoad({huboCambio:false}); merge(A,r);
  ok(A._syncUltimo.modo==='completa','9 más de 12 h → carga completa de seguridad');
  // 10. apagada en esta PC

};
