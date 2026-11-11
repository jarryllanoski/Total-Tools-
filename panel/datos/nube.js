/**
 * panel/datos/nube.js — la capa de Firestore: leer, escribir, sincronizar
 * =================================================================
 * Fase 3 (10/11/2026): el panel en módulos. Antes vivía en index.html.
 * Script CLÁSICO a propósito: sus funciones y variables son globales, igual
 * que cuando estaban en un solo archivo — moverlas no cambió ni una llamada.
 * El orden de los <script> en index.html es el orden de ejecución.
 */
(function(){
  const KEY = window.FBConfig.KEY;
  const PRJ = window.FBConfig.PRJ;
  const BASE = `https://firestore.googleapis.com/v1/projects/${PRJ}/databases/(default)/documents`;

  /* ── DÓNDE VIVEN LOS DATOS ───────────────────────────────────────────
     TODAS las rutas de Firestore salen de aquí. Ninguna se escribe suelta
     en medio del código.

     No es manía de orden: es la puerta por la que este panel podrá servir a
     más de un negocio. El día que haya un segundo, `RAIZ` pasa a valer
     `negocios/<id>` y no hay que ir a cazar rutas por cuatro archivos —
     que es la parte que, con datos vivos dentro, duele de verdad.

     HOY NO SE MIGRA NADA. `RAIZ` vale `panel`, exactamente como estaba, y
     los ~1042 pedidos se quedan donde están. Mover mil documentos para
     ganar cero hoy sería el tipo de riesgo que no se paga solo.

     ⚠️ Si cambias RAIZ, hay tres sitios más que apuntan a lo mismo y NO se
     enteran: firestore.rules, functions/index.js (CFG_DOC, SHIP_COL,
     TOK_COL, FORMCFG_COL) y storage.rules. Los cuatro cambian juntos o no
     cambia ninguno. */
  const RAIZ = 'panel';

  const cfgPath   = () => `${RAIZ}/config`;
  const shipPath  = (id) => `${RAIZ}/shipments/items/${id}`;
  const shipCol   = () => `${RAIZ}/shipments/items`;
  const suppPath  = (id) => `${RAIZ}/suppliers/items/${id}`;
  const suppCol   = () => `${RAIZ}/suppliers/items`;
  const trashPath = (id) => `${RAIZ}/trash/items/${id}`;
  const formCfgPath = (id) => `${RAIZ}/forms/configs/${id}`;
  const erroresPath = (id) => `${RAIZ}/errores/items/${id}`;
  // El interruptor de la puerta a Shalom. Lo escribe sobre todo el servidor
  // (functions/interruptor.js); el panel solo lee el estado y enciende/apaga.
  const shalomPath  = () => `${RAIZ}/shalom`;

  // ── Firestore value converters ────────────────────────────────────────
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
    // `_mts` (hora de cambio, Fase 2) es un timestamp de Firestore. Antes
    // este lector devolvía null para cualquier timestamp.
    if('timestampValue'in fv) return fv.timestampValue;
    if('arrayValue'in fv) return(fv.arrayValue.values||[]).map(fromFs);
    if('mapValue'in fv){const o={};Object.keys(fv.mapValue.fields||{}).forEach(k=>{o[k]=fromFs(fv.mapValue.fields[k])});return o;}
    return null;
  }

  // ── Cabeceras de cada petición a Firestore (punto único) ──────────────
  // Dos pruebas independientes, cada una con su propio try/catch: que una
  // falle no debe tumbar a la otra ni a la petición.
  //   Authorization      → QUIÉN sos (el token de sesión de auth.js).
  //   X-Firebase-AppCheck → DESDE DÓNDE se llama (appcheck.js). Hoy Firestore
  //     está en modo Supervisión: si esta cabecera falta, la petición igual
  //     funciona, solo queda contada como "no verificada" en Firebase. El día
  //     que se active el bloqueo, ahí sí pasa a ser obligatoria — y para
  //     entonces ya se habrá confirmado que llega bien desde acá.

  /* Un aviso de sesión, y UNO SOLO cada medio minuto.
     Un guardado de 971 documentos que falla no puede producir 971 avisos: el
     panel quedaría inservible justo en el momento en que hace falta leerlo.
     Y el texto distingue las dos causas, porque se arreglan distinto: una se
     espera, la otra se resuelve volviendo a entrar. */
  let _avisoSesionTs = 0;
  function _avisarSesion(motivo){
    const ahora = Date.now();
    if(ahora - _avisoSesionTs < 30000) return;
    _avisoSesionTs = ahora;
    // Las palabras viven en auth.js, que es quien conoce los motivos.
    const txt = (window._authTextoMotivo && window._authTextoMotivo({auth: motivo}))
      || '🔒 Tu sesión venció — ingresa de nuevo';
    // Datos avisa; la pantalla lo muestra (Fase 7). Sin estado.js, como antes.
    try{ window._avisar ? window._avisar('tt:aviso', txt) : (window.toast && window.toast(txt)); }catch(e){}
  }

  function _errorAuth(motivo){
    const e = new Error('sesion:' + motivo);
    e.auth = motivo;
    return e;
  }

  /* ★ ESTO ES UNA PUERTA, NO UN INTENTO.
     Antes, cuando no había token, devolvía `{}` y la petición salía SIN
     IDENTIFICAR. Las reglas exigen sesión, así que Firestore respondía 403 a
     todo lo que escribieras durante esa hora — y el único aviso era el mismo
     punto rojo que significa "mal internet", con lo que seguías trabajando.
     Ahora se niega antes de salir, y dice cuál de los dos problemas es. */
  async function _authHeaders(){
    const headers = {};
    let tok = '';
    if(typeof window._authToken === 'function'){
      try {
        tok = await window._authToken(); // lanza con .auth si no hay sesión
      } catch(e){
        _avisarSesion(e && e.auth);
        throw e;
      }
    } else {
      /* auth.js viejo en caché. No se degrada a anónimo —que es justo el
         agujero que se está tapando— pero tampoco se tumba el panel entero
         por un archivo desfasado: se exige el token por el camino de antes. */
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
    }catch(e){ /* sin token de App Check → seguir sin esa cabecera */ }
    return headers;
  }

  // ── REST helpers ──────────────────────────────────────────────────────
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

  /* Un error de Firestore que SÍ dice qué pasó.
     Sin el código HTTP, un 403 —esta sesión ya no tiene permiso— se veía igual
     que un corte de red, y el panel decía "sin conexión" cuando lo que había
     vencido era la sesión. Mandar a revisar el internet por un problema de
     permisos es el mismo error de mezclar dos lados que costó días en Shalom. */
  function _errorFs(r, texto){
    const e = new Error('Firestore ' + r.status + ' ' + String(texto).slice(0, 200));
    e.http = r.status;
    return e;
  }

  async function fsPatch(path,obj){
    /* ★ FASE 2: pedidos y proveedores van por `:commit` con la hora del
       SERVIDOR en `_mts` (functions/sincro.js). Mismo merge por campos que
       el PATCH de abajo; solo cambia el método. Si `:commit` no sirve, se
       cae al PATCH de siempre y se anota que esa escritura salió SIN marca:
       las otras PCs harán la carga completa en vez de perderla. */
    if(_estampable(path)){
      let caer = _commitApagado;   // el camino rápido ya falló en esta sesión
      if(!caer){
        const w=_aWrite(path,obj);
        if(!w) return;
        const hc=await _authHeaders();
        hc['Content-Type']='application/json';
        const rc=await fetch(`${BASE}:commit?key=${KEY}`,{method:'POST',headers:hc,
          body:JSON.stringify({writes:[w]})});
        if(rc.ok) return;
        const txt=await rc.text();
        // Pasajero (5xx, 429) o sin sesión (401): se lanza, como siempre, y
        // el guardado lo reintenta. Cualquier otro rechazo (403, 400…): el
        // PATCH de siempre, para NO guardar nunca menos que antes.
        if(rc.status===401||rc.status===429||rc.status>=500) throw _errorFs(rc, txt);
        caer = true;
      }
      window._syncSinMarca=true;
      try{ window.Errores && window.Errores.anotar('fs.sinMarca', new Error('escritura sin hora de cambio'), {path}); }catch(_){}
      obj=Object.assign({},obj); delete obj._mts;
    }
    const keys=Object.keys(obj);
    // Guard: nunca mandar un PATCH sin campos. Sin fields NI mask, Firestore
    // reemplazaría el documento con {} y borraría todo. Con 0 campos: no-op.
    if(!keys.length) return;
    const fields={};keys.forEach(k=>{fields[k]=toFs(obj[k])});
    const h=await _authHeaders();
    h['Content-Type']='application/json';
    // ★ Escritura incremental por updateMask (merge real). SIN mask, un PATCH de
    // Firestore REEMPLAZA el documento entero y BORRA los campos no enviados —
    // por eso un dispositivo con copia vieja pisaba trackingStatus (motor B u
    // otro device). Con updateMask solo se tocan ESTOS campos; el resto del doc
    // queda intacto. Cada field path va entre backticks (escapados) para admitir
    // cualquier nombre de campo sin romper el path. Para "borrar" un campo se
    // envía con valor null (queda en el mask): quitar por omisión ya no borra.
    const mask=keys.map(k=>'updateMask.fieldPaths='+
      encodeURIComponent('`'+k.replace(/([\\`])/g,'\\$1')+'`')).join('&');
    const r=await fetch(`${BASE}/${path}?key=${KEY}&${mask}`,{
      method:'PATCH',
      headers:h,
      body:JSON.stringify({fields})
    });
    if(!r.ok) throw _errorFs(r, await r.text());
  }
  /* ── ESCRITURA POR TANDAS ────────────────────────────────────────────
     Antes, guardar todo era `Promise.all` de un fsPatch por documento: con
     971 pedidos eso son 971 peticiones sueltas a la vez. Firestore devolvía
     429 a buena parte, `Promise.all` se rompía con la primera y el reintento
     volvía a mandar las 971 — unas 4.000 escrituras en medio minuto. Eso era
     el punto rojo.

     `documents:commit` acepta hasta 500 escrituras en UNA petición, cada una
     con su propio updateMask (o sea, la misma fusión por campos de antes: un
     dispositivo con copia vieja sigue sin poder pisar trackingStatus).
     971 documentos pasan de 971 peticiones a 2.

     ⚠️ NO USAR `documents:batchWrite`. Se probó y devuelve 403
     PERMISSION_DENIED "Missing or insufficient permissions." desde el
     navegador, con las mismas credenciales con las que un PATCH suelto entra
     sin problema: las reglas de seguridad no se evalúan para ese método, así
     que lo rechaza siempre. `:commit` es el que usa el SDK oficial por debajo
     para writeBatch(), y sí pasa por reglas.

     El precio de `:commit` es que la tanda es TODO-O-NADA y no dice cuál
     documento la tumbó. Por eso, cuando una tanda falla, esa tanda —y solo
     esa— se rehace documento por documento: es la única forma de saber con
     exactitud qué quedó fuera, y así el reintento manda 3 y no 971. El camino
     bueno sigue costando 2 peticiones; el desglose solo se paga al fallar. */
  const LOTE_MAX   = 500;             // tope duro de Firestore por commit
  const LOTE_BYTES = 4 * 1024 * 1024; // techo propio, holgado bajo el de 10 MiB

  const _docName = (path) => `projects/${PRJ}/databases/(default)/documents/${path}`;

  // Un {path,obj} → un Write de la API. Devuelve null si no hay campos: misma
  // guarda que fsPatch, un write sin fields borraría el documento entero.
  function _aWrite(path, obj){
    const marca = _estampable(path);
    // `_mts` lo pone SOLO el servidor: el que traiga el pedido en memoria
    // (leído de la nube) no viaja como dato.
    const keys = Object.keys(obj).filter(k => !(marca && k === '_mts'));
    if(!keys.length) return null;
    const fields = {};
    keys.forEach(k => { fields[k] = toFs(obj[k]); });
    const w = {
      update: { name: _docName(path), fields },
      // Mismo escapado con backticks que fsPatch: la sintaxis de field path es
      // la misma en la URL y en el cuerpo, y admite cualquier nombre de campo.
      updateMask: { fieldPaths: keys.map(k => '`' + k.replace(/([\\`])/g,'\\$1') + '`') }
    };
    if(marca) w.updateTransforms = [{ fieldPath: '_mts', setToServerValue: 'REQUEST_TIME' }];
    return w;
  }
  /* ¿Este documento lleva hora de cambio? Pedidos y proveedores: lo que el
     panel sincroniza por cambios (Fase 2). */
  function _estampable(path){
    return /^panel\/(shipments|suppliers)\/items\/[^/]+$/.test(String(path||''));
  }
  /* Borrar + LÁPIDA en una sola operación atómica: o pasan las dos o
     ninguna. Sin lápida, otra PC que solo pide lo cambiado no se enteraría
     del borrado. Si `:commit` no sirve, se borra como siempre y la lápida
     se intenta aparte (y se anota). */
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

  // Reparte respetando a la vez el tope de 500 y un techo de bytes:
  // `trackingHistory` crece con cada consulta y una tanda de 500 pedidos con
  // mucho historial no debe acercarse al límite de la petición.
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

  // Uno por uno, pero con tope de peticiones simultáneas. Nunca lanza: cada
  // documento cae en ok o en fail por su cuenta, que es lo que hace falta para
  // saber exactamente qué quedó sin guardar.
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

  // Si `:commit` no sirve en este proyecto, no se vuelve a intentar en toda la
  // sesión. Ver abajo cómo se distingue "el endpoint no sirve" de "un
  // documento concreto está mal": no es lo mismo y no se apaga por lo segundo.
  let _commitApagado = false;

  // items: [{clave, path, obj}] → {ok:[clave], fail:[clave]}. No lanza.
  async function _escribirVarios(items){
    if(!items.length) return { ok: [], fail: [] };

    const ok = [], fail = [], conWrite = [];
    for(const it of items){
      const w = _aWrite(it.path, it.obj);
      if(w) conWrite.push({ clave: it.clave, path: it.path, obj: it.obj, write: w });
      else ok.push(it.clave); // 0 campos: nada que escribir, cuenta como hecho
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
          e.http = r.status; // se mira abajo para decidir si apagar el camino
          throw e;
        }
        const j  = await r.json();
        const wr = j.writeResults || [];
        // Si no vuelve un resultado por escritura no se puede afirmar que
        // entraron todas. Antes de inventarlo, se rehace de uno en uno.
        if(wr.length !== tanda.length){
          throw new Error('commit devolvió ' + wr.length + ' resultados para ' +
                          tanda.length + ' escrituras');
        }
        tanda.forEach(x => ok.push(x.clave)); // commit es atómico: entró entera
      } catch(e){ fallo = e; }

      /* Un fallo de SESIÓN no es un fallo de este documento ni de este
         endpoint: hasta que vuelva a haber sesión no va a entrar ni una sola
         escritura. Rehacer la tanda uno por uno daría el mismo error tantas
         veces como documentos haya, y peor: si `_patchLimitado` los entrega
         todos fallados, la regla de abajo apagaría `:commit` para el resto de
         la sesión por algo que no tiene nada que ver con `:commit`.
         Se marca como no guardado TODO lo que quede —que es lo que mantiene
         el registro de sucios— y se corta. */
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
        /* Cómo se distingue una cosa de la otra:
           si uno por uno entraron TODOS, no había ningún documento malo — el
           problema era el endpoint, y solo entonces se apaga el camino rápido.
           Si alguno falló también suelto, el culpable era ese documento y el
           camino rápido sigue sirviendo para los demás.
           Y solo se apaga ante un 4xx: un 5xx o un 429 son pasajeros y no
           deben degradar el resto de la sesión. */
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
    // 404 = el documento ya no existe → tratar como borrado exitoso
    if(!r.ok && r.status!==404) throw _errorFs(r, 'fsDel'); // ★ Mejora 1: ahora el reintento sí funciona
  }
  async function fsList(col){
    const h=await _authHeaders();
    let all=[];
    let pageToken='';
    let _pages=0;
    const MAX_PAGES=200; // 200 × 300 = 60 000 docs máximo
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
  window._fsList = fsList; // ★ exponer globalmente para tokens

  /* ★ CONSULTA, NO LISTADO. `fsList` baja la colección ENTERA; Firestore
     cobra cada documento devuelto. `runQuery` cobra solo los que cumplen el
     filtro. `padre` es la ruta del documento que contiene la colección
     (p. ej. 'panel/tokens'), `coleccion` su id ('items').
     Devuelve los documentos como fsList, más `_name` (la ruta completa,
     que hace falta como cursor para paginar sin saltarse ninguno). */
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
      const doc=f&&f.document; if(!doc) return;   // filas sin doc: solo readTime
      const o={};
      Object.keys(doc.fields||{}).forEach(k=>{o[k]=fromFs(doc.fields[k])});
      o._id=doc.name.split('/').pop();
      o._name=doc.name;
      out.push(o);
    });
    return out;
  }
  // Latido de salud a demanda: UNA lectura del doc de config, sin arrastrar la
  // recarga completa de pedidos. El poll normal solo recarga cuando cambia `ts`
  // (que el backend NO toca al escribir el latido) — y hacer que lo tocara
  // obligaría a releer los ~700 pedidos cada 30 min, justo lo que se optimizó.
  window._fbLeerSalud = async () => {
    try{ const cfg = await fsGet(cfgPath()); return (cfg && cfg.salud) || null; }
    catch(e){ return null; }
  };
  // ── Strip images for cloud (too heavy) ───────────────────────────────
  function _slimDoc(doc){
    if(!doc) return null;
    // Storage URL → guardar completa (no pesa nada)
    if(doc.d && doc.d.startsWith('https://firebasestorage')) return doc;
    // Base64 → placeholder [img]
    return {t:doc.t, n:doc.n, d:'[img]'};
  }
  function slimShipment(s){
    // `sel` (pedido marcado) NO sube. Es estado de pantalla de ESTE
    // dispositivo y vive en seleccion.js; si viajara dentro del pedido, otro
    // dispositivo lo recibiría y vería marcado lo que marcaste tú. Se quita
    // acá, en la puerta de subida, porque el spread de arriba copia el objeto
    // entero y cualquier campo nuevo se colaría igual.
    const {sel, ...limpio} = s;
    const out = {...limpio,
      docGuia:    _slimDoc(s.docGuia),
      docEmbalado:_slimDoc(s.docEmbalado),
      docTicket:  _slimDoc(s.docTicket)
    };
    /* ★ UNA FOTO PENDIENTE NO SUBE NADA EN SU LUGAR. Antes subía «[img]» y
       la foto quedaba perdida. Ahora el campo se OMITE: la cola de fotos
       (fotos.js) lo escribe cuando la foto sube, y mientras tanto ninguna
       PC con la marca vieja puede pisar el enlace bueno. */
    ['docGuia','docEmbalado','docTicket'].forEach(k=>{
      if(s[k] && s[k].pendiente) delete out[k];
    });
    return out;
  }
  function slimSupplier(sup){
    // Conserva las URLs de Storage; solo recorta base64 (reusa _slimDoc).
    return{...sup,cotiz:_slimDoc(sup.cotiz)};
  }

  // ★ Mejora 3: copia del estado adelgazada SOLO para el respaldo localStorage.
  // Conserva las URLs de Firebase Storage (pesan poco y se siguen viendo) y
  // reemplaza las imágenes base64 pesadas por '[img]' para no llenar el local
  // (~5MB). NO modifica el S real en memoria — solo la copia que se guarda.
  window._slimStateForLocal = (state) => {
    try{
      const copy = {...state};
      if(Array.isArray(state.shipments)) copy.shipments = state.shipments.map(slimShipment);
      if(Array.isArray(state.suppliers)) copy.suppliers = state.suppliers.map(slimSupplier);
      return copy;
    }catch(e){
      // Si algo falla, mejor guardar el estado completo que perder el respaldo
      return state;
    }
  };

  /* ★ LO QUE VIAJA EN EL DOCUMENTO DE CONFIGURACIÓN — una sola lista.
     Devuelve una COPIA (JSON) con los valores tal como se guardan: la usan
     el guardado, la base de la mezcla (`window._cfgBase`) y `_mergeRemote`.
     Una copia, no referencias: `S.labels.splice(...)` no puede tocar la base. */
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
      /* ★ HERMANA de `config`, jamás dentro. `handleConfig` devuelve el
         objeto `config` ENTERO al formulario público, así que meter aquí
         los recursos publicaría los precios mayoristas y los comunicados
         internos a quien pidiera esa URL. Misma razón por la que
         `msgTemplates` y `labels` están fuera. */
      recursos:data.recursos||[],
      /* ★ También HERMANA de `config`, por lo mismo: `handleConfig`
         devuelve el objeto `config` entero al formulario público, y aunque
         tu agencia de despacho no sea un secreto, la regla se comprueba
         antes de guardar, no después. El formulario del cliente no la
         necesita, así que no viaja. */
      agenciaOrigen:data.agenciaOrigen||null,
      /* `shalomInstancia` YA NO VA AQUÍ (11/11/2026): la escribe SOLO el
         servidor al conectar la cuenta (functions/cuentaShalom.js). Si
         viajara desde el panel, un equipo con un id viejo lo pisaría — que
         es justo como el panel quedó apuntando a una cuenta que no existe. */
      /* ★ El interruptor del simulacro de REGISTRO. Hermana de `config`
         por lo mismo que las dos de arriba, y aquí sí o sí: lo lee la
         Cloud Function. Si no viajara, apagarlo en el panel no lo
         apagaría en el servidor y el registro se quedaría en simulacro
         para siempre sin que nada lo explicara.
         ⚠️ Se guarda tal cual, y el servidor solo lo apaga con un `false`
         EXPLÍCITO: ausente, nulo o con basura deja el simulacro puesto.
         En una operación que cuesta dinero, la duda se resuelve del lado
         de no gastar. */
      shalomRegistroSimulacro:data.shalomRegistroSimulacro,
    };
    if(o.shalomRegistroSimulacro === undefined) o.shalomRegistroSimulacro = null;
    return JSON.parse(JSON.stringify(o));
  };

  // ── SAVE ─────────────────────────────────────────────────────────────
  window._fbSave = async (data) => {
    /* ★ CAPA 3 · LA ÚLTIMA RED: NUNCA ESCRIBIR LOS VALORES POR DEFECTO.
       Las capas 1 y 2 deberían bastar. Esta existe por el camino que todavía
       no vimos — como el que se descubrió el 24/10/2026: que guardar un
       PEDIDO también reescribe la configuración entera.

       La huella es inconfundible: «Mi Negocio» / 999000000 es lo que pone el
       código cuando no hay nada. Si la memoria tiene eso y la nube tiene un
       negocio real, esta escritura borraría etiquetas, recursos y la cuenta
       de Shalom. Se niega.

       Se eligió esta huella y no «no escribir si hay menos recursos que
       antes» porque esa otra regla impediría borrar el último recurso a
       propósito. Nadie llama «Mi Negocio» a su negocio: no da falsos
       positivos. Va ANTES de `_isSaving`, para no dejar esa marca puesta. */
    const _cfgM = (data && data.config) || {};
    const _real = window._nubeNombre && window._nubeNombre !== 'Mi Negocio';
    if(_real && _cfgM.name === 'Mi Negocio' && _cfgM.phone === '999000000'){
      const _e = new Error('escritura de valores por defecto bloqueada');
      _e.bloqueadoPorDefecto = true;
      throw _e;
    }
    window._isSaving = true; // ★ Mejora 2: cerrar la ventana de carrera con _mergeRemote
    // ★ Guardado incremental: decidir qué shipments subir
    // Modo solo-config: si solo cambió config y no hay pedidos sucios pendientes,
    // no se sube ningún pedido (idsASubir = set vacío).
    const nadaEspecifico = _dirtyShips.size === 0 && _dirtySupps.size === 0;
    const soloConfig = _dirtyConfigOnly && nadaEspecifico && !_dirtyAll;
    // ★ "Nada marcado" ya NO significa "sube los 971". Si nadie marcó nada es
    // que nada cambió: sube solo config. El único que ordena subir todo es
    // _dirtyAll, que se enciende a propósito (arranque sin saber qué quedó
    // pendiente, respaldo restaurado, cambio masivo).
    const subirTodos = !soloConfig && _dirtyAll;
    const idsASubir   = soloConfig ? new Set() : (subirTodos ? null : new Set(_dirtyShips));
    const suppsASubir = soloConfig ? new Set() : (subirTodos ? null : new Set(_dirtySupps));
    const saveTs = Date.now(); // capturar antes de writes para que _S_TS coincida exactamente
    try {
      // Cada escritura lleva una `clave` para poder casar la respuesta de
      // Firestore con el documento exacto que la produjo.
      const _cfgTodo = window._cfgProy(data);
      /* ★ SOLO LO QUE CAMBIÓ, MEZCLADO CON LO DE LOS OTROS (06/11/2026).
         Antes cada guardado —hasta editar un pedido— reescribía etiquetas,
         recursos y mensajes desde la memoria de ESTE equipo. Un teléfono
         con la lista vieja borraba la etiqueta que acababas de crear en la
         PC. Ahora:
           · si la configuración no cambió aquí, no se sube (solo la hora);
           · si cambió, se lee la nube (1 lectura, solo al tocar Config o
             Recursos) y se mezcla elemento por elemento
             (mezclaConfig.js): lo tuyo y lo de ellos, nada pisado. */
      let _cfgSube = {}, _cfgQueda = null;
      const _base = window._cfgBase;
      if(!_base || !window.MezclaConfig){
        _cfgSube = _cfgTodo; _cfgQueda = _cfgTodo;
      } else if(MezclaConfig.distintas(_cfgTodo, _base).length){
        const nube = await fsGet(cfgPath());
        const suya = window._cfgProy(nube || {});
        const mezcla = MezclaConfig.mezclar(_base, _cfgTodo, suya);
        // Lo que trajo el otro equipo también se ve aquí, ya.
        const ajenas = MezclaConfig.distintas(mezcla, _cfgTodo);
        ajenas.forEach(k => { data[k] = MezclaConfig.copia(mezcla[k]); });
        if(ajenas.length) window._cfgAjenoPintar = true;
        MezclaConfig.distintas(mezcla, suya).forEach(k => { _cfgSube[k] = mezcla[k]; });
        _cfgQueda = mezcla;
      }
      const items = [{ clave: 'config', path: cfgPath(), obj: Object.assign(_cfgSube, {
        ts:saveTs // usar saveTs fijo para que _S_TS y config.ts coincidan tras la escritura
      })}];
      /* La lista completa de lo que viaja en la configuración vive en
         `window._cfgProy` (más abajo): una sola fuente. */
      for(const s of(data.shipments||[])){
        // Incremental: subir solo los pedidos marcados como sucios (o todos)
        if(idsASubir && !idsASubir.has(s.id)) continue;
        items.push({ clave:'ship:'+s.id, path: shipPath(s.id), obj: slimShipment(s) });
      }
      // Suppliers: incremental igual que los pedidos (suppsASubir=null → todos).
      for(const sup of(data.suppliers||[])){
        if(suppsASubir && !suppsASubir.has(sup.id)) continue;
        items.push({ clave:'supp:'+sup.id, path: suppPath(sup.id), obj: slimSupplier(sup) });
      }

      // La pista dice la VERDAD de este guardado: si subió pedidos/proveedores.
      items[0].obj.syncHint = {ts: saveTs, pedidos: items.length > 1};
      const res = await _escribirVarios(items);
      const hechos = new Set(res.ok);
      /* Si alguna escritura de este guardado cayó al PATCH sin hora de
         cambio, se avisa en la pista: las otras PCs harán la carga completa
         en vez de quedarse sin ese cambio. */
      if(window._syncSinMarca && hechos.has('config')){
        window._syncSinMarca = false;
        try{ await fsPatch(cfgPath(), {syncHint:{ts:saveTs, pedidos:true, sinMarca:true}}); }catch(_){}
      }

      // config es lo que fija el reloj compartido: solo si ENTRÓ se puede
      // adelantar _S_TS, o _poll recargaría creyendo que hay datos nuevos.
      if(hechos.has('config')){
        window._S_TS = saveTs;
        // Lo que acaba de quedar en la nube es la nueva base.
        if(_cfgQueda) window._cfgBase = _cfgQueda;
      }
      /* Si la mezcla trajo algo de otro equipo, que se vea sin esperar.
         La capa de datos AVISA y la pantalla repinta (pantalla/inicio.js):
         datos no llama hacia arriba (Fase 7). */
      if(window._cfgAjenoPintar){
        window._cfgAjenoPintar = false;
        try{ window.dispatchEvent(new Event('tt:config-cambiada')); }catch(_){}
      }

      // ★ El éxito parcial cuenta. Se descuenta lo que Firestore confirmó,
      // documento por documento. Antes la limpieza estaba toda al final: un
      // solo fallo dejaba sucios los 971 y el reintento los mandaba de nuevo.
      res.ok.forEach(k => {
        if(k.indexOf('ship:') === 0) _dirtyShips.delete(k.slice(5));
        else if(k.indexOf('supp:') === 0) _dirtySupps.delete(k.slice(5));
      });

      if(res.fail.length){
        // Lo que falló queda marcado uno por uno y se apaga _dirtyAll: el
        // reintento manda ESOS documentos, no la lista entera otra vez.
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
      // Backup en localStorage con timestamp de último sync exitoso
      lsSet('dpanel_last_sync', String(saveTs));
      // ★ Éxito completo: limpiar el registro de sucios
      _dirtyShips.clear();
      _dirtySupps.clear();
      _dirtyAll = false;
      _dirtyConfigOnly = false;
      window._guardarSucios && window._guardarSucios();
    } catch(e){
      console.warn('Firebase save error:',e);
      window._fbStatus&&window._fbStatus('err');
      throw e; // re-lanzar para que _fbSaveWithRetry lo capture
    } finally {
      window._isSaving = false; // ★ Mejora 2: liberar el candado pase lo que pase
    }
  };

  window._fbSaveShipment = async (s) => {
    try{
      await fsPatch(shipPath(s.id),slimShipment(s));
      window._fbStatus&&window._fbStatus('ok');
    }catch(e){
      /* Antes esto solo pintaba el punto rojo y se olvidaba del pedido: el
         cambio no estaba en la nube y tampoco quedaba marcado, así que nadie
         lo reintentaba nunca. Ahora queda sucio —y el registro de sucios
         sobrevive a cerrar la pestaña—, así que el siguiente guardado lo
         sube. Es la diferencia entre "falló" y "se perdió". */
      try{
        if(s && s.id && typeof _dirtyShips !== 'undefined'){
          _dirtyShips.add(s.id);
          window._guardarSucios && window._guardarSucios();
        }
      }catch(_){}
      window._fbStatus&&window._fbStatus('err');
    }
  };

  /* Escribe SOLO estos campos de un pedido (updateMask: lo demás no se
     toca). La usa la cola de fotos: cuando una foto pendiente por fin sube,
     se escribe su campo y nada más — no el pedido entero de esta PC, que
     podría estar desfasado respecto de otra. */
  window._fbPatchShipment = async (id, campos) => {
    if(!id || !campos || !Object.keys(campos).length) return;
    await fsPatch(shipPath(id), campos);
  };

  // Guardar un shipment individual inmediatamente (sin debounce)
  window._fbSaveShipmentNow = async (ship) => {
    window._isSaving = true;
    try {
      // Reintentos: si falla la subida (red intermitente), reintenta hasta 3 veces.
      for(let i=0; i<3; i++){
        try {
          await fsPatch(shipPath(ship.id), slimShipment(ship));
          return; // éxito
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
        return; // éxito
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

  // ── TRASH SUBCOLLECTION ────────────────────────────────────────────
  window._fbWriteTrashItem = async (id, item) => {
    await fsPatch(trashPath(id), item);
  };
  window._fbDeleteTrashItem = async (id) => {
    await fsDel(trashPath(id));
  };

  // ── FORM CONFIG SNAPSHOTS ──────────────────────────────────────────
  window._fbSaveFormConfig = async (id, snap) => {
    await fsPatch(formCfgPath(id), snap);
  };

  /* Anotar un fallo. Deliberadamente distinto de todo lo demás: NO reintenta,
     NO marca nada como sucio y NO avisa si falla. Si el registro de errores
     tropieza, se calla — reintentarlo justo cuando algo va mal es la forma
     más rápida de convertir un fallo en una tormenta de escrituras. La
     política (topes, deduplicación, qué se guarda) vive en errores.js. */
  /* El estado de la puerta a Shalom. Devuelve null si el documento no existe
     todavía — y eso significa ABIERTA, no apagada: un archivo que nadie creó
     no puede dejar el negocio sin rastreo. */
  window._fbLeerPuerta = () => fsGet(shalomPath()).catch(() => null);

  /* Encender o apagar a mano. NO toca la cuenta de fallos ni el descanso: eso
     es del motor, y escribirlo desde acá sería pisarle la mano al servidor. */
  // El informe del último barrido. Solo se lee: lo escribe el servidor.
  window._fbLeerBarrido = () => fsGet(`${RAIZ}/barrido`).catch(() => null);

  window._fbEncenderPuerta = (on) =>
    fsPatch(shalomPath(), {encendida: !!on, ultimoCambio: Date.now()});

  window._fbEscribirError = (id, doc) => {
    fsPatch(erroresPath(id), doc).catch(() => {});
  };

  // ── TOKENS ────────────────────────────────────────────────────────
  const tokPath = (id) => `${RAIZ}/tokens/items/${id}`;
  const tokCol  = () => `${RAIZ}/tokens/items`;

  window._fbSaveTok = async (tok) => {
    await fsPatch(tokPath(tok.id), tok);
  };

  window._fbListToks = async () => {
    const docs = await fsList(tokCol());
    // Asignar el id desde _id si no está
    return docs.map(d => ({ ...d, id: d.id || d._id }));
  };

  /* ★ LINKS GENERADOS SIN BAJAR LA COLECCIÓN ENTERA (26/10/2026).
     Antes cada apertura de Compartir, cada 🔄 y cada vez que un cliente
     usaba un link se leían TODOS los tokens desde el primero. Ahora:
       · recientes  = por usar (used == false) + usados desde `desdeISO`;
       · anteriores = usados antes de `antesISO`, de `limite` en limite,
                      del más reciente al más viejo, a pedido.
     Filtros de un solo campo: Firestore ya tiene esos índices, no hay que
     crear nada. La lista completa (`_fbListToks`) sigue existiendo para
     «Cargar todo» y como respaldo si una consulta falla. */
  const _tokConId = d => ({ ...d, id: d.id || d._id });
  window._fbListToksRecientes = async (desdeISO) => {
    const [porUsar, usados] = await Promise.all([
      fsQuery(`${RAIZ}/tokens`, 'items', {where:{fieldFilter:{
        field:{fieldPath:'used'}, op:'EQUAL', value:{booleanValue:false}}}}),
      fsQuery(`${RAIZ}/tokens`, 'items', {where:{fieldFilter:{
        field:{fieldPath:'usedAt'}, op:'GREATER_THAN_OR_EQUAL', value:{stringValue:desdeISO}}}}),
    ]);
    // Un link usado ENTRE las dos consultas puede salir en las dos: uno solo.
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
    // Cursor = (usedAt, ruta) del último ya cargado: dos links usados en el
    // mismo milisegundo no se saltan ni se repiten.
    if(cursor && cursor.usedAt && cursor.name){
      consulta.startAt = {values:[{stringValue:cursor.usedAt}, {referenceValue:cursor.name}], before:false};
    }
    return (await fsQuery(`${RAIZ}/tokens`, 'items', consulta)).map(_tokConId);
  };

  window._fbDelTok = async (id) => {
    await fsDel(tokPath(id));
  };

  /* ★ FASE 2 · SOLO LO QUE CAMBIÓ. Tres consultas pequeñas: pedidos,
     proveedores y lápidas con `_mts` posterior a `desde`. */
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
  /* La sincronización rápida se puede apagar EN ESTA PC (📦 → Sincronización),
     sin desplegar nada: entonces todo vuelve a la carga completa de siempre. */
  window._syncRapidaActiva = () => { try{ return localStorage.getItem('tt_sync_rapida') !== 'off'; }catch(e){ return true; } };
  window._syncUltimo = null;

  /* `opc.huboCambio`: el latido vio que la nube cambió. Si entonces la
     consulta no trae NADA, alguien escribió sin `_mts` (una pestaña con el
     panel viejo, o una escritura que cayó al PATCH): carga completa.
     `opc.completa`: «Sincronizar todo». */
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
          /* Novedad REAL (no lo repetido por el margen): pedidos o proveedores
             que no se tenían o con otra hora, más lápidas de algo que aún
             está aquí. */
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
      // null SOLO cuando Firebase confirmó (con respuestas OK) que no hay nada
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
      throw e; // ★ propagar: un error NO es "Firebase vacío" — evita pisar la nube con local
    }
  };

  window._fbListen = () => {
    // Poll adaptativo: rápido mientras el usuario trabaja, lento en reposo (ahorra lecturas).
    const POLL_FAST = 5000;   // hubo actividad reciente
    const POLL_SLOW = 15000;  // en reposo (sin toques por más de IDLE_MS)
    const IDLE_MS   = 120000; // 2 min sin interacción → reposo
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
          // formTs: escrito solo por Cloud Function o formulario — el panel nunca lo toca
          const hasFormNew  = formTs > (window._lastFormTs||0);
          const hasPanelNew = remoteTs > (window._S_TS||0)+500;
          /* ★ SI NUNCA SE CARGÓ, SE CARGA. El latido solo traía datos cuando
             la nube tenía algo MÁS NUEVO que lo de aquí. Pero si la carga
             inicial falló —sin sesión, sin red— `_S_TS` es la hora de
             arranque, la nube es más vieja que eso, y el latido NUNCA la
             traía: el panel se quedaba con lo del localStorage, o con los
             valores por defecto en un navegador nuevo. Para siempre. */
          const nuncaCargo = !window._nubeLista;
          if(hasFormNew || hasPanelNew || nuncaCargo){
            if(hasFormNew) window._lastFormTs = formTs;
            const remote = await window._fbLoad({huboCambio: hasFormNew || hasPanelNew});
            if(remote && window._mergeRemote) {
              window._mergeRemote(remote);
              window._S_TS = remoteTs; // registrar hasta qué ts se cargó
            }
            // Refrescar lista de tokens si la pestaña Compartir está abierta
            if(hasFormNew && document.getElementById('page-compartir')&&
               document.getElementById('page-compartir').classList.contains('active')&&
               typeof loadTokenList==='function') loadTokenList(true); // cambio remoto (cliente usó link) → forzar
          }
        }
      }catch(e){
        _listenFails++;
      }
      // Delay: backoff exponencial ante fallos; si hay conexión, adaptativo por actividad.
      if(_listenFails > 0){
        _listenDelay = Math.min(5000 * Math.pow(2, _listenFails), 60000); // 5→10→20→40→máx 60s
      } else {
        const idle = (Date.now() - (window._lastActivity||0)) > IDLE_MS;
        _listenDelay = idle ? POLL_SLOW : POLL_FAST;
      }
      window._lastPollDelay = _listenDelay; // exponer para diagnóstico/pruebas
      _listenTimer = setTimeout(_poll, _listenDelay);
    }

    // Cualquier interacción del usuario cuenta como actividad → poll rápido.
    const _bumpActivity = () => { window._lastActivity = Date.now(); };
    document.addEventListener('pointerdown', _bumpActivity, {passive:true});
    document.addEventListener('keydown',     _bumpActivity, {passive:true});

    // Pausar cuando la pestaña está oculta (ahorra lecturas)
    document.addEventListener('visibilitychange', () => {
      if(document.hidden){
        clearTimeout(_listenTimer);
      } else {
        _listenFails = 0;
        _listenDelay = POLL_FAST;
        window._lastActivity = Date.now(); // volver del fondo = actividad → poll rápido
        _poll();
      }
    });

    _poll();
  };

  window._fbReady=true;
})();
