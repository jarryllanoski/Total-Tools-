(function(){
  const KEY = window.FBConfig.KEY;
  const PRJ = window.FBConfig.PRJ;
  const BASE = `https://firestore.googleapis.com/v1/projects/${PRJ}/databases/(default)/documents`;

  const RAIZ = 'panel';

  const cfgPath   = () => `${RAIZ}/config`;
  const shipPath  = (id) => `${RAIZ}/shipments/items/${id}`;
  const shipCol   = () => `${RAIZ}/shipments/items`;
  const suppPath  = (id) => `${RAIZ}/suppliers/items/${id}`;
  const suppCol   = () => `${RAIZ}/suppliers/items`;
  const trashPath = (id) => `${RAIZ}/trash/items/${id}`;
  const formCfgPath = (id) => `${RAIZ}/forms/configs/${id}`;
  const erroresPath = (id) => `${RAIZ}/errores/items/${id}`;
  const shalomPath  = () => `${RAIZ}/shalom`;

  function toFs(v){
    if(v===null||v===undefined) return{nullValue:null};
    if(typeof v==='boolean') return{booleanValue:v};
    if(typeof v==='number') return Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v};
    if(typeof v==='string') return{stringValue:v};
    if(Array.isArray(v)) return{arrayValue:{values:v.map(toFs)}};
    if(typeof v==='object'){const f={};Object.keys(v).forEach(k=>{f[k]=toFs(v[k])});return{mapValue:{fields:f}};}
    return{stringValue:String(v)};
  }
  function fromFs(fv){
    if(!fv) return null;
    if('nullValue'in fv) return null;
    if('booleanValue'in fv) return fv.booleanValue;
    if('integerValue'in fv) return parseInt(fv.integerValue);
    if('doubleValue'in fv) return fv.doubleValue;
    if('stringValue'in fv) return fv.stringValue;
    if('timestampValue'in fv) return fv.timestampValue;
    if('arrayValue'in fv) return(fv.arrayValue.values||[]).map(fromFs);
    if('mapValue'in fv){const o={};Object.keys(fv.mapValue.fields||{}).forEach(k=>{o[k]=fromFs(fv.mapValue.fields[k])});return o;}
    return null;
  }

  let _avisoSesionTs = 0;
  function _avisarSesion(motivo){
    try{ if(document.getElementById('authOverlay')) return; }catch(e){}
    const ahora = Date.now();
    if(ahora - _avisoSesionTs < 30000) return;
    _avisoSesionTs = ahora;
    const txt = (window._authTextoMotivo && window._authTextoMotivo({auth: motivo}))
      || '🔒 Tu sesión venció — ingresa de nuevo';
    try{ window._avisar ? window._avisar('tt:aviso', txt) : (window.toast && window.toast(txt)); }catch(e){}
  }

  function _errorAuth(motivo){
    const e = new Error('sesion:' + motivo);
    e.auth = motivo;
    return e;
  }

  async function _authHeaders(){
    const headers = {};
    let tok = '';
    if(typeof window._authToken === 'function'){
      try {
        tok = await window._authToken();
      } catch(e){
        _avisarSesion(e && e.auth);
        throw e;
      }
    } else {
      try{
        if(typeof window._authEnsureToken === 'function') await window._authEnsureToken();
        tok = localStorage.getItem('tt_id_token') || '';
      }catch(e){ tok = ''; }
      if(!tok){ _avisarSesion('sin_token'); throw _errorAuth('sin_token'); }
    }
    headers['Authorization'] = 'Bearer ' + tok;
    try{
      if(typeof window._appCheckToken === 'function'){
        const ac = await window._appCheckToken();
        if(ac) headers['X-Firebase-AppCheck'] = ac;
      }
    }catch(e){  }
    return headers;
  }

  async function fsGet(path){
    const h=await _authHeaders();
    const r=await fetch(`${BASE}/${path}?key=${KEY}`,{headers:h});
    if(r.status===404) return null;
    if(!r.ok) throw _errorFs(r, await r.text());
    const doc=await r.json();
    if(!doc.fields) return null;
    const o={};Object.keys(doc.fields).forEach(k=>{o[k]=fromFs(doc.fields[k])});
    return o;
  }

  function _errorFs(r, texto){
    const e = new Error('Firestore ' + r.status + ' ' + String(texto).slice(0, 200));
    e.http = r.status;
    return e;
  }

  async function fsPatch(path,obj){
    if(_estampable(path)){
      let caer = _commitApagado;
      if(!caer){
        const w=_aWrite(path,obj);
        if(!w) return;
        const hc=await _authHeaders();
        hc['Content-Type']='application/json';
        const rc=await fetch(`${BASE}:commit?key=${KEY}`,{method:'POST',headers:hc,
          body:JSON.stringify({writes:[w]})});
        if(rc.ok) return;
        const txt=await rc.text();
        if(rc.status===401||rc.status===429||rc.status>=500) throw _errorFs(rc, txt);
        caer = true;
      }
      window._syncSinMarca=true;
      try{ window.Errores && window.Errores.anotar('fs.sinMarca', new Error('escritura sin hora de cambio'), {path}); }catch(_){}
      obj=Object.assign({},obj); delete obj._mts;
    }
    const keys=Object.keys(obj);
    if(!keys.length) return;
    const fields={};keys.forEach(k=>{fields[k]=toFs(obj[k])});
    const h=await _authHeaders();
    h['Content-Type']='application/json';
    const mask=keys.map(k=>'updateMask.fieldPaths='+
      encodeURIComponent('`'+k.replace(/([\\`])/g,'\\$1')+'`')).join('&');
    const r=await fetch(`${BASE}/${path}?key=${KEY}&${mask}`,{
      method:'PATCH',
      headers:h,
      body:JSON.stringify({fields})
    });
    if(!r.ok) throw _errorFs(r, await r.text());
  }
  const LOTE_MAX   = 500;
  const LOTE_BYTES = 4 * 1024 * 1024;

  const _docName = (path) => `projects/${PRJ}/databases/(default)/documents/${path}`;

  function _aWrite(path, obj){
    const marca = _estampable(path);
    const keys = Object.keys(obj).filter(k => !(marca && k === '_mts'));
    if(!keys.length) return null;
    const fields = {};
    keys.forEach(k => { fields[k] = toFs(obj[k]); });
    const w = {
      update: { name: _docName(path), fields },
      updateMask: { fieldPaths: keys.map(k => '`' + k.replace(/([\\`])/g,'\\$1') + '`') }
    };
    if(marca) w.updateTransforms = [{ fieldPath: '_mts', setToServerValue: 'REQUEST_TIME' }];
    return w;
  }
  function _estampable(path){
    return /^panel\/(shipments|suppliers)\/items\/[^/]+$/.test(String(path||''));
  }
  async function fsBorrarConLapida(path, col, id){
    const lid = Sincro.idLapida(col, id);
    const lapida = { update: { name: _docName(`${RAIZ}/borrados/items/${lid}`),
      fields: { id: toFs(String(id)), col: toFs(col) } },
      updateTransforms: [{ fieldPath: '_mts', setToServerValue: 'REQUEST_TIME' }] };
    if(!_commitApagado){
      const h = await _authHeaders();
      h['Content-Type'] = 'application/json';
      const r = await fetch(`${BASE}:commit?key=${KEY}`, { method:'POST', headers:h,
        body: JSON.stringify({ writes: [{ delete: _docName(path) }, lapida] }) });
      if(r.ok) return;
      const txt = await r.text();
      if(r.status===401||r.status===429||r.status>=500) throw _errorFs(r, txt);
    }
    await fsDel(path);
    window._syncSinMarca = true;
    try{ window.Errores && window.Errores.anotar('fs.sinLapida', new Error('commit '+r.status), {path}); }catch(_){}
  }

  function _tandas(lista){
    const out = []; let cur = []; let bytes = 0;
    for(const x of lista){
      const b = JSON.stringify(x.write).length;
      if(cur.length && (cur.length >= LOTE_MAX || bytes + b > LOTE_BYTES)){
        out.push(cur); cur = []; bytes = 0;
      }
      cur.push(x); bytes += b;
    }
    if(cur.length) out.push(cur);
    return out;
  }

  async function _patchLimitado(items, tope){
    const ok = [], fail = [];
    let i = 0;
    const obrero = async () => {
      while(i < items.length){
        const it = items[i++];
        try { await fsPatch(it.path, it.obj); ok.push(it.clave); }
        catch(e){ fail.push(it.clave); }
      }
    };
    const n = Math.min(tope || 6, items.length);
    await Promise.all(Array.from({length: n}, obrero));
    return { ok, fail };
  }

  let _commitApagado = false;

  async function _escribirVarios(items){
    if(!items.length) return { ok: [], fail: [] };

    const ok = [], fail = [], conWrite = [];
    for(const it of items){
      const w = _aWrite(it.path, it.obj);
      if(w) conWrite.push({ clave: it.clave, path: it.path, obj: it.obj, write: w });
      else ok.push(it.clave);
    }

    if(_commitApagado){
      const r = await _patchLimitado(conWrite, 6);
      return { ok: ok.concat(r.ok), fail: r.fail };
    }

    for(const tanda of _tandas(conWrite)){
      let fallo = null;
      try {
        const h = await _authHeaders();
        h['Content-Type'] = 'application/json';
        const r = await fetch(`${BASE}:commit?key=${KEY}`, {
          method: 'POST', headers: h,
          body: JSON.stringify({ writes: tanda.map(x => x.write) })
        });
        if(!r.ok){
          const e = new Error('commit ' + r.status + ' ' + await r.text());
          e.http = r.status;
          throw e;
        }
        const j  = await r.json();
        const wr = j.writeResults || [];
        if(wr.length !== tanda.length){
          throw new Error('commit devolvió ' + wr.length + ' resultados para ' +
                          tanda.length + ' escrituras');
        }
        tanda.forEach(x => ok.push(x.clave));
      } catch(e){ fallo = e; }

      if(fallo && fallo.auth){
        const decididos = new Set(ok.concat(fail));
        conWrite.forEach(x => { if(!decididos.has(x.clave)) fail.push(x.clave); });
        try{ window.Errores && window.Errores.anotar('fs.sesion', fallo, {
          documentos: conWrite.length, motivo: fallo.auth
        }); }catch(_){}
        break;
      }

      if(fallo){
        console.warn('commit falló, se rehace la tanda uno por uno:', fallo && fallo.message);
        const r = await _patchLimitado(tanda, 6);
        r.ok.forEach(k => ok.push(k));
        r.fail.forEach(k => fail.push(k));
        const est = fallo.http;
        if(!r.fail.length && est && est !== 429 && est < 500) _commitApagado = true;
        try{ window.Errores && window.Errores.anotar('fs.commit', fallo, {
          documentos: tanda.length, sueltosFallidos: r.fail.length, apagado: _commitApagado
        }); }catch(_){}
      }
    }
    return { ok, fail };
  }

  async function fsDel(path){
    const h=await _authHeaders();
    const r=await fetch(`${BASE}/${path}?key=${KEY}`,{method:'DELETE',headers:h});
    if(!r.ok && r.status!==404) throw _errorFs(r, 'fsDel');
  }
  async function fsList(col){
    const h=await _authHeaders();
    let all=[];
    let pageToken='';
    let _pages=0;
    const MAX_PAGES=200;
    do{
      const url=`${BASE}/${col}?key=${KEY}&pageSize=300${pageToken?'&pageToken='+encodeURIComponent(pageToken):''}`;
      const r=await fetch(url,{headers:h});
      if(!r.ok) throw _errorFs(r, 'fsList');
      const data=await r.json();
      (data.documents||[]).forEach(doc=>{
        const o={};
        Object.keys(doc.fields||{}).forEach(k=>{o[k]=fromFs(doc.fields[k])});
        o._id=doc.name.split('/').pop();
        all.push(o);
      });
      pageToken=data.nextPageToken||'';
      _pages++;
      if(_pages>=MAX_PAGES){console.warn('[fsList] Límite de páginas alcanzado ('+MAX_PAGES+')');break;}
    }while(pageToken);
    return all;
  }
  window._fsList = fsList;

  async function fsQuery(padre, coleccion, consulta){
    const h=await _authHeaders();
    h['Content-Type']='application/json';
    const cuerpo={structuredQuery:Object.assign({from:[{collectionId:coleccion}]}, consulta||{})};
    const r=await fetch(`${BASE}/${padre}:runQuery?key=${KEY}`,
      {method:'POST', headers:h, body:JSON.stringify(cuerpo)});
    if(!r.ok) throw _errorFs(r, 'fsQuery '+(await r.text().catch(()=>'')));
    const filas=await r.json();
    const out=[];
    (filas||[]).forEach(f=>{
      const doc=f&&f.document; if(!doc) return;
      const o={};
      Object.keys(doc.fields||{}).forEach(k=>{o[k]=fromFs(doc.fields[k])});
      o._id=doc.name.split('/').pop();
      o._name=doc.name;
      out.push(o);
    });
    return out;
  }
  window._fbLeerSalud = async () => {
    try{ const cfg = await fsGet(cfgPath()); return (cfg && cfg.salud) || null; }
    catch(e){ return null; }
  };
  function _slimDoc(doc){
    if(!doc) return null;
    if(doc.d && doc.d.startsWith('https://firebasestorage')) return doc;
    return {t:doc.t, n:doc.n, d:'[img]'};
  }
  function slimShipment(s){
    const {sel, ...limpio} = s;
    const out = {...limpio,
      docGuia:    _slimDoc(s.docGuia),
      docEmbalado:_slimDoc(s.docEmbalado),
      docTicket:  _slimDoc(s.docTicket)
    };
    ['docGuia','docEmbalado','docTicket'].forEach(k=>{
      if(s[k] && s[k].pendiente) delete out[k];
    });
    return out;
  }
  function slimSupplier(sup){
    return{...sup,cotiz:_slimDoc(sup.cotiz)};
  }

  window._slimStateForLocal = (state) => {
    try{
      const copy = {...state};
      if(Array.isArray(state.shipments)) copy.shipments = state.shipments.map(slimShipment);
      if(Array.isArray(state.suppliers)) copy.suppliers = state.suppliers.map(slimSupplier);
      return copy;
    }catch(e){
      return state;
    }
  };

  window._cfgProy = (data) => {
    data = data || {};
    const o = {
      couriers:data.couriers||[],
      extraFields:data.extraFields||[],
      labels:data.labels||[],
      msgTemplates:data.msgTemplates||{},
      courierActive:data.courierActive||{},
      statusPin:data.statusPin||'1234',
      dispatch:data.dispatch||{},
      config:data.config||{},
      trash:data.trash||[],
      recursos:data.recursos||[],
      agenciaOrigen:data.agenciaOrigen||null,
      shalomRegistroSimulacro:data.shalomRegistroSimulacro,
    };
    if(o.shalomRegistroSimulacro === undefined) o.shalomRegistroSimulacro = null;
    return JSON.parse(JSON.stringify(o));
  };

  window._fbSave = async (data) => {
    const _cfgM = (data && data.config) || {};
    const _real = window._nubeNombre && window._nubeNombre !== 'Mi Negocio';
    if(_real && _cfgM.name === 'Mi Negocio' && _cfgM.phone === '999000000'){
      const _e = new Error('escritura de valores por defecto bloqueada');
      _e.bloqueadoPorDefecto = true;
      throw _e;
    }
    window._isSaving = true;
    const nadaEspecifico = _dirtyShips.size === 0 && _dirtySupps.size === 0;
    const soloConfig = _dirtyConfigOnly && nadaEspecifico && !_dirtyAll;
    const subirTodos = !soloConfig && _dirtyAll;
    const idsASubir   = soloConfig ? new Set() : (subirTodos ? null : new Set(_dirtyShips));
    const suppsASubir = soloConfig ? new Set() : (subirTodos ? null : new Set(_dirtySupps));
    const saveTs = Date.now();
    try {
      const _cfgTodo = window._cfgProy(data);
      let _cfgSube = {}, _cfgQueda = null;
      const _base = window._cfgBase;
      if(!_base || !window.MezclaConfig){
        _cfgSube = _cfgTodo; _cfgQueda = _cfgTodo;
      } else if(MezclaConfig.distintas(_cfgTodo, _base).length){
        const nube = await fsGet(cfgPath());
        const suya = window._cfgProy(nube || {});
        const mezcla = MezclaConfig.mezclar(_base, _cfgTodo, suya);
        const ajenas = MezclaConfig.distintas(mezcla, _cfgTodo);
        ajenas.forEach(k => { data[k] = MezclaConfig.copia(mezcla[k]); });
        if(ajenas.length) window._cfgAjenoPintar = true;
        MezclaConfig.distintas(mezcla, suya).forEach(k => { _cfgSube[k] = mezcla[k]; });
        _cfgQueda = mezcla;
      }
      const items = [{ clave: 'config', path: cfgPath(), obj: Object.assign(_cfgSube, {
        ts:saveTs
      })}];
      for(const s of(data.shipments||[])){
        if(idsASubir && !idsASubir.has(s.id)) continue;
        items.push({ clave:'ship:'+s.id, path: shipPath(s.id), obj: slimShipment(s) });
      }
      for(const sup of(data.suppliers||[])){
        if(suppsASubir && !suppsASubir.has(sup.id)) continue;
        items.push({ clave:'supp:'+sup.id, path: suppPath(sup.id), obj: slimSupplier(sup) });
      }

      items[0].obj.syncHint = {ts: saveTs, pedidos: items.length > 1};
      const res = await _escribirVarios(items);
      const hechos = new Set(res.ok);
      if(window._syncSinMarca && hechos.has('config')){
        window._syncSinMarca = false;
        try{ await fsPatch(cfgPath(), {syncHint:{ts:saveTs, pedidos:true, sinMarca:true}}); }catch(_){}
      }

      if(hechos.has('config')){
        window._S_TS = saveTs;
        if(_cfgQueda) window._cfgBase = _cfgQueda;
      }
      if(window._cfgAjenoPintar){
        window._cfgAjenoPintar = false;
        try{ window.dispatchEvent(new Event('tt:config-cambiada')); }catch(_){}
      }

      res.ok.forEach(k => {
        if(k.indexOf('ship:') === 0) _dirtyShips.delete(k.slice(5));
        else if(k.indexOf('supp:') === 0) _dirtySupps.delete(k.slice(5));
      });

      if(res.fail.length){
        _dirtyAll = false;
        res.fail.forEach(k => {
          if(k.indexOf('ship:') === 0) _dirtyShips.add(k.slice(5));
          else if(k.indexOf('supp:') === 0) _dirtySupps.add(k.slice(5));
        });
        window._guardarSucios && window._guardarSucios();
        window._fbStatus&&window._fbStatus('err');
        throw new Error('quedaron '+res.fail.length+' de '+items.length+' documentos sin guardar');
      }

      window._fbStatus&&window._fbStatus('ok');
      lsSet('dpanel_last_sync', String(saveTs));
      _dirtyShips.clear();
      _dirtySupps.clear();
      _dirtyAll = false;
      _dirtyConfigOnly = false;
      window._guardarSucios && window._guardarSucios();
    } catch(e){
      console.warn('Firebase save error:',e);
      window._fbStatus&&window._fbStatus('err');
      throw e;
    } finally {
      window._isSaving = false;
    }
  };

  window._fbSaveShipment = async (s) => {
    try{
      await fsPatch(shipPath(s.id),slimShipment(s));
      window._fbStatus&&window._fbStatus('ok');
    }catch(e){
      try{
        if(s && s.id && typeof _dirtyShips !== 'undefined'){
          _dirtyShips.add(s.id);
          window._guardarSucios && window._guardarSucios();
        }
      }catch(_){}
      window._fbStatus&&window._fbStatus('err');
    }
  };

  window._fbPatchShipment = async (id, campos) => {
    if(!id || !campos || !Object.keys(campos).length) return;
    await fsPatch(shipPath(id), campos);
  };

  window._fbSaveShipmentNow = async (ship) => {
    window._isSaving = true;
    try {
      for(let i=0; i<3; i++){
        try {
          await fsPatch(shipPath(ship.id), slimShipment(ship));
          return;
        } catch(e) {
          if(i < 2) await new Promise(r=>setTimeout(r, 2000*(i+1)));
          else console.warn('Error guardando shipment tras 3 intentos:', e);
        }
      }
    } finally {
      window._isSaving = false;
    }
  };

  window._fbDeleteShipment = async (id) => {
    for(let i=0; i<3; i++){
      try{
        await fsBorrarConLapida(shipPath(id), 'shipments', id);
        return;
      }catch(e){
        if(i < 2) await new Promise(r=>setTimeout(r, 2000*(i+1)));
        else console.warn('No se pudo eliminar de Firebase:', id, e.message);
      }
    }
  };

  window._fbDeleteSupplier = async (id) => {
    for(let i=0; i<3; i++){
      try{ await fsBorrarConLapida(suppPath(id), 'suppliers', id); return; }
      catch(e){ if(i < 2) await new Promise(r=>setTimeout(r, 2000*(i+1))); else console.warn('No se pudo eliminar proveedor:', id, e.message); }
    }
  };

  window._fbWriteTrashItem = async (id, item) => {
    await fsPatch(trashPath(id), item);
  };
  window._fbDeleteTrashItem = async (id) => {
    await fsDel(trashPath(id));
  };

  window._fbSaveFormConfig = async (id, snap) => {
    await fsPatch(formCfgPath(id), snap);
  };

  window._fbLeerPuerta = () => fsGet(shalomPath()).catch(() => null);

  window._fbLeerBarrido = () => fsGet(`${RAIZ}/barrido`).catch(() => null);

  window._fbEncenderPuerta = (on) =>
    fsPatch(shalomPath(), {encendida: !!on, ultimoCambio: Date.now()});

  window._fbEscribirError = (id, doc) => {
    fsPatch(erroresPath(id), doc).catch(() => {});
  };

  const tokPath = (id) => `${RAIZ}/tokens/items/${id}`;
  const tokCol  = () => `${RAIZ}/tokens/items`;

  window._fbSaveTok = async (tok) => {
    await fsPatch(tokPath(tok.id), tok);
  };

  window._fbListToks = async () => {
    const docs = await fsList(tokCol());
    return docs.map(d => ({ ...d, id: d.id || d._id }));
  };

  const _tokConId = d => ({ ...d, id: d.id || d._id });
  window._fbListToksRecientes = async (desdeISO) => {
    const [porUsar, usados] = await Promise.all([
      fsQuery(`${RAIZ}/tokens`, 'items', {where:{fieldFilter:{
        field:{fieldPath:'used'}, op:'EQUAL', value:{booleanValue:false}}}}),
      fsQuery(`${RAIZ}/tokens`, 'items', {where:{fieldFilter:{
        field:{fieldPath:'usedAt'}, op:'GREATER_THAN_OR_EQUAL', value:{stringValue:desdeISO}}}}),
    ]);
    const vistos = {};
    return porUsar.concat(usados).map(_tokConId).filter(d => {
      if(vistos[d.id]) return false; vistos[d.id] = true; return true;
    });
  };
  window._fbListToksAnteriores = async (antesISO, cursor, limite) => {
    const consulta = {
      where:{fieldFilter:{field:{fieldPath:'usedAt'}, op:'LESS_THAN', value:{stringValue:antesISO}}},
      orderBy:[{field:{fieldPath:'usedAt'}, direction:'DESCENDING'},
               {field:{fieldPath:'__name__'}, direction:'DESCENDING'}],
      limit: limite,
    };
    if(cursor && cursor.usedAt && cursor.name){
      consulta.startAt = {values:[{stringValue:cursor.usedAt}, {referenceValue:cursor.name}], before:false};
    }
    return (await fsQuery(`${RAIZ}/tokens`, 'items', consulta)).map(_tokConId);
  };

  window._fbDelTok = async (id) => {
    await fsDel(tokPath(id));
  };

  const _conId = d => { const {_id, _name, ...rest} = d; if(!rest.id) rest.id = _id; return rest; };
  async function _traerCambios(desde){
    const f = {where:{fieldFilter:{field:{fieldPath:'_mts'}, op:'GREATER_THAN',
      value:{timestampValue:desde}}}, limit: Sincro.MAX_DELTA + 1};
    const [ships, supps, laps] = await Promise.all([
      fsQuery(`${RAIZ}/shipments`, 'items', f),
      fsQuery(`${RAIZ}/suppliers`, 'items', f),
      fsQuery(`${RAIZ}/borrados`, 'items', f),
    ]);
    return { ships: ships.map(_conId), supps: supps.map(_conId),
      lapidas: laps.map(_conId).map(l => ({id: l.id, col: l.col, _mts: l._mts})) };
  }
  window._syncRapidaActiva = () => { try{ return localStorage.getItem('tt_sync_rapida') !== 'off'; }catch(e){ return true; } };
  window._syncUltimo = null;

  window._fbLoad = async (opc) => {
    opc = opc || {};
    try {
      const cfg = await fsGet(cfgPath());
      const sync = (typeof S !== 'undefined' && S) ? S._sync : null;
      const tieneLocal = !!(typeof S !== 'undefined' && S && Array.isArray(S.shipments) && S.shipments.length);
      const dec = window.Sincro ? Sincro.decidir({ activo: window._syncRapidaActiva(), cfg, sync,
        tieneLocal, ahora: Date.now(), forzarCompleta: !!opc.completa }) : { modo: 'completa', motivo: 'sin sincro.js' };
      let motivo = dec.motivo;
      if(dec.modo === 'cambios'){
        try {
          const r = await _traerCambios(Sincro.desde(sync));
          const n = Sincro.total(r);
          const h = (cfg && cfg.syncHint) || {};
          const hintVale = h.ts === cfg.ts;
          if(n > Sincro.MAX_DELTA) throw new Error('demasiados cambios (' + n + ')');
          if(hintVale && h.sinMarca) throw new Error('otra PC escribió sin hora de cambio');
          const nuevo = Sincro.novedadTotal({shipments: S.shipments, suppliers: S.suppliers || []}, r);
          if(!nuevo && opc.huboCambio && !(hintVale && h.pedidos === false)) throw new Error('cambio sin rastro');
          const result = cfg || {};
          result.shipments = Sincro.aplicar(S.shipments, r.ships, r.lapidas.filter(l => l.col === 'shipments'));
          result.suppliers = Sincro.aplicar(S.suppliers || [], r.supps, r.lapidas.filter(l => l.col === 'suppliers'));
          result._sync = Sincro.marcaTras(sync, r.ships.concat(r.supps, r.lapidas), false, Date.now());
          window._syncUltimo = { modo: 'cambios', n: n, ts: Date.now() };
          window._fbStatus&&window._fbStatus('ok');
          return result;
        } catch(e){
          if(e && e.auth) throw e;
          motivo = e && e.message;
          console.warn('[sync] solo-cambios → carga completa:', motivo);
        }
      }
      const [shipDocs, suppDocs] = await Promise.all([
        fsList(shipCol()),
        fsList(suppCol())
      ]);
      if(!cfg && shipDocs.length===0) return null;
      const result = cfg||{};
      result.shipments = shipDocs.map(d=>{const{_id,...rest}=d;if(!rest.id){rest.id=_id;fsPatch(shipPath(_id),{id:_id}).catch(()=>{});}return rest;});
      result.suppliers = suppDocs.map(d=>{const{_id,...rest}=d;if(!rest.id){rest.id=_id;fsPatch(suppPath(_id),{id:_id}).catch(()=>{});}return rest;});
      if(window.Sincro) result._sync = Sincro.marcaTras(sync, result.shipments.concat(result.suppliers), true, Date.now());
      window._syncUltimo = { modo: 'completa', n: result.shipments.length + result.suppliers.length,
        ts: Date.now(), motivo: motivo };
      window._fbStatus&&window._fbStatus('ok');
      return result;
    } catch(e){
      console.warn('Firebase load error:',e);
      window._fbStatus&&window._fbStatus('err');
      throw e;
    }
  };

  window._fbListen = () => {
    const POLL_FAST = 5000;
    const POLL_SLOW = 15000;
    const IDLE_MS   = 120000;
    let _listenDelay = POLL_FAST;
    let _listenTimer = null;
    let _listenFails = 0;
    window._lastActivity = window._lastActivity || Date.now();

    async function _poll(){
      try{
        const cfg = await fsGet(cfgPath());
        if(!cfg){ _listenFails++; }
        else {
          _listenFails = 0;
          const remoteTs = cfg.ts||0;
          const formTs   = cfg.formTs||0;
          const hasFormNew  = formTs > (window._lastFormTs||0);
          const hasPanelNew = remoteTs > (window._S_TS||0)+500;
          const nuncaCargo = !window._nubeLista;
          if(hasFormNew || hasPanelNew || nuncaCargo){
            if(hasFormNew) window._lastFormTs = formTs;
            const remote = await window._fbLoad({huboCambio: hasFormNew || hasPanelNew});
            if(remote && window._mergeRemote) {
              window._mergeRemote(remote);
              window._S_TS = remoteTs;
            }
            if(hasFormNew && document.getElementById('page-compartir')&&
               document.getElementById('page-compartir').classList.contains('active')&&
               typeof loadTokenList==='function') loadTokenList(true);
          }
        }
      }catch(e){
        _listenFails++;
      }
      if(_listenFails > 0){
        _listenDelay = Math.min(5000 * Math.pow(2, _listenFails), 60000);
      } else {
        const idle = (Date.now() - (window._lastActivity||0)) > IDLE_MS;
        _listenDelay = idle ? POLL_SLOW : POLL_FAST;
      }
      window._lastPollDelay = _listenDelay;
      _listenTimer = setTimeout(_poll, _listenDelay);
    }

    const _bumpActivity = () => { window._lastActivity = Date.now(); };
    document.addEventListener('pointerdown', _bumpActivity, {passive:true});
    document.addEventListener('keydown',     _bumpActivity, {passive:true});

    document.addEventListener('visibilitychange', () => {
      if(document.hidden){
        clearTimeout(_listenTimer);
      } else {
        _listenFails = 0;
        _listenDelay = POLL_FAST;
        window._lastActivity = Date.now();
        _poll();
      }
    });

    _poll();
  };

  window._fbReady=true;
})();
