// ============================================================
// firebase.js — Firebase Firestore REST API
// Edita este archivo si cambias proyecto o credenciales
// ============================================================

const KEY = "AIzaSyBkbY-CFtNHfbaG864sXVnaAwBKZGW6SRI";
const PRJ = "total-tools-24ce8";
const BASE = `https://firestore.googleapis.com/v1/projects/${PRJ}/databases/(default)/documents`;

const cfgPath  = () => `panel/config`;
const shipPath = (id) => `panel/shipments/items/${id}`;
const shipCol  = () => `panel/shipments/items`;
const suppPath = (id) => `panel/suppliers/items/${id}`;
const suppCol  = () => `panel/suppliers/items`;

function toFs(v){
  if(v===null||v===undefined) return{nullValue:null};
  if(typeof v==="boolean") return{booleanValue:v};
  if(typeof v==="number") return Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v};
  if(typeof v==="string") return{stringValue:v};
  if(Array.isArray(v)) return{arrayValue:{values:v.map(toFs)}};
  if(typeof v==="object"){const f={};Object.keys(v).forEach(k=>{f[k]=toFs(v[k])});return{mapValue:{fields:f}};}
  return{stringValue:String(v)};
}
function fromFs(fv){
  if(!fv) return null;
  if("nullValue"in fv) return null;
  if("booleanValue"in fv) return fv.booleanValue;
  if("integerValue"in fv) return parseInt(fv.integerValue);
  if("doubleValue"in fv) return fv.doubleValue;
  if("stringValue"in fv) return fv.stringValue;
  if("arrayValue"in fv) return(fv.arrayValue.values||[]).map(fromFs);
  if("mapValue"in fv){const o={};Object.keys(fv.mapValue.fields||{}).forEach(k=>{o[k]=fromFs(fv.mapValue.fields[k])});return o;}
  return null;
}
async function fsGet(path){
  const r=await fetch(`${BASE}/${path}?key=${KEY}`);
  if(r.status===404) return null;
  if(!r.ok) throw new Error(await r.text());
  const doc=await r.json();
  if(!doc.fields) return null;
  const o={};Object.keys(doc.fields).forEach(k=>{o[k]=fromFs(doc.fields[k])});
  return o;
}
async function fsPatch(path,obj){
  const fields={};Object.keys(obj).forEach(k=>{fields[k]=toFs(obj[k])});
  const r=await fetch(`${BASE}/${path}?key=${KEY}`,{
    method:"PATCH",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({fields})
  });
  if(!r.ok) throw new Error(await r.text());
}
async function fsDel(path){
  await fetch(`${BASE}/${path}?key=${KEY}`,{method:"DELETE"});
}
async function fsList(col){
  const r=await fetch(`${BASE}/${col}?key=${KEY}&pageSize=500`);
  if(!r.ok) return[];
  const data=await r.json();
  return(data.documents||[]).map(doc=>{
    const o={};
    Object.keys(doc.fields||{}).forEach(k=>{o[k]=fromFs(doc.fields[k])});
    o._id=doc.name.split("/").pop();
    return o;
  });
}
function slimShipment(s){
  return{...s,
    docGuia:s.docGuia?{t:s.docGuia.t,n:s.docGuia.n,d:"[img]"}:null,
    docTicket:s.docTicket?{t:s.docTicket.t,n:s.docTicket.n,d:"[img]"}:null
  };
}
function slimSupplier(sup){
  return{...sup,cotiz:sup.cotiz?{t:sup.cotiz.t,n:sup.cotiz.n,d:"[img]"}:null};
}

// ── Exports — usados por app.js ───────────────────────────────────────
export async function fbSave(data){
  try{
    const saves=[];
    saves.push(fsPatch(cfgPath(),{
      couriers:data.couriers||[],extraFields:data.extraFields||[],
      labels:data.labels||[],msgTemplates:data.msgTemplates||{},
      courierActive:data.courierActive||{},statusPin:data.statusPin||"1234",
      dispatch:data.dispatch||{},config:data.config||{},
      trash:data.trash||[],ts:Date.now()
    }));
    for(const s of(data.shipments||[])) saves.push(fsPatch(shipPath(s.id),slimShipment(s)));
    for(const sup of(data.suppliers||[])) saves.push(fsPatch(suppPath(sup.id),slimSupplier(sup)));
    await Promise.all(saves);
    return "ok";
  }catch(e){console.warn("Firebase save error:",e);return "err";}
}

export async function fbSaveShipment(s){
  try{await fsPatch(shipPath(s.id),slimShipment(s));return "ok";}
  catch(e){return "err";}
}

export async function fbDeleteShipment(id){
  try{await fsDel(shipPath(id));}catch(e){}
}

export async function fbLoad(){
  try{
    const [cfg,shipDocs,suppDocs]=await Promise.all([
      fsGet(cfgPath()),fsList(shipCol()),fsList(suppCol())
    ]);
    if(!cfg&&shipDocs.length===0) return null;
    const result=cfg||{};
    result.shipments=shipDocs.map(d=>{const{_id,...rest}=d;return rest;});
    result.suppliers=suppDocs.map(d=>{const{_id,...rest}=d;return rest;});
    return result;
  }catch(e){console.warn("Firebase load error:",e);return null;}
}

export async function fbGetConfig(){
  return await fsGet(cfgPath());
}
