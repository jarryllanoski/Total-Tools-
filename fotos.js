/**
 * fotos.js — los documentos de los pedidos: comprimir, subir, y NO PERDER.
 * ========================================================================
 * ⚠️ EL FALLO QUE CIERRA. Si subir a Storage fallaba (sin internet, sesión
 * vencida), el panel guardaba la foto «en el navegador» como texto base64 y
 * seguía. Pero al subir el pedido a la nube, `slimShipment` cambia a
 * propósito ese texto por «[img]» (un pedido no puede pasar de 1 MB en
 * Firestore). La foto quedaba perdida: en otra PC el documento vacío, y en
 * esta, hasta recargar.
 *
 * Ahora una foto que no se pudo subir queda PENDIENTE:
 *   · en el formulario se ve (vista previa local) con «⏳ se subirá al
 *     guardar»;
 *   · al guardar el pedido entra en una COLA en IndexedDB —sobrevive a
 *     cerrar la pestaña y a reiniciar la PC— y se reintenta sola: al
 *     arrancar, al volver internet y cada minuto;
 *   · cuando sube, se escribe SOLO ese campo del pedido en la nube;
 *   · mientras tanto el pedido NO sube un «[img]» ni nada en su lugar: el
 *     campo se omite (ver slimShipment), así una PC con la marca vieja
 *     nunca pisa el enlace bueno.
 *
 * Y las fotos se COMPRIMEN antes de subir (máx. 1600 px, ~300 KB) con una
 * MINIATURA de ~20 KB para las tarjetas. Antes cada tarjeta descargaba la
 * foto original de 3–8 MB para enseñarla en 52×66 px. Los PDF no se tocan.
 *
 * El núcleo es puro (`crear(deps)`): red, bucket, IndexedDB y canvas
 * entran como dependencias, así que se prueba sin ninguno.
 */
(function (global) {
  'use strict';

  var CAMPO = {guia: 'docGuia', embalado: 'docEmbalado', ticket: 'docTicket'};
  var MAX_LADO = 1600, CALIDAD = 0.82;
  var MINI_LADO = 320, MINI_CALIDAD = 0.7;
  var NO_TOCAR_BYTES = 400 * 1024;   // ya liviana y chica: se sube tal cual

  /** Los pedidos con documentos que NO están en la nube:
        perdido   «[img]»: la foto nunca llegó (el fallo de antes). No se
                  puede recuperar: hay que volver a subirla.
        local     base64 solo en ESTE navegador: todavía se puede salvar
                  abriendo el pedido y guardándolo.
      Las fotos pendientes en cola no salen aquí: ya se están subiendo. */
  function documentosPerdidos(pedidos) {
    var etiqueta = {docGuia: 'Guía / Ticket', docEmbalado: 'Embalado', docTicket: 'Boleta / Factura'};
    var out = [];
    (pedidos || []).forEach(function (s) {
      if (!s || !s.id) return;
      var faltan = [];
      Object.keys(etiqueta).forEach(function (k) {
        var d = s[k];
        if (!d || d.pendiente) return;
        var v = String(d.d || '');
        if (v === '[img]') faltan.push({campo: k, nombre: etiqueta[k], tipo: 'perdido'});
        else if (v.indexOf('data:') === 0) faltan.push({campo: k, nombre: etiqueta[k], tipo: 'local'});
      });
      if (faltan.length) out.push({id: s.id, name: s.name || '', status: s.status || '', faltan: faltan});
    });
    return out;
  }

  function crear(deps) {
    var d = deps || {};
    var cola = d.cola;           // {poner(item), todos(), quitar(clave)}
    var subiendo = false;
    var avisar = d.avisar || function () {};

    /** ¿Se puede comprimir? Solo lo que un <canvas> sabe leer. HEIC, GIF,
        SVG y PDF se suben tal cual. */
    function comprimible(t) { return /^image\/(jpeg|jpg|png|webp)$/i.test(String(t || '')); }

    async function comprimir(file) {
      if (!file || !comprimible(file.type) || !d.redimensionar) return file;
      try {
        var r = await d.redimensionar(file, MAX_LADO, CALIDAD);
        if (!r) return file;
        // Ya era liviana y no hizo falta achicarla: la original, intacta.
        if (file.size <= NO_TOCAR_BYTES && !r.achico) return file;
        if (r.archivo && r.archivo.size < file.size) return r.archivo;
        return file;
      } catch (e) { return file; }
    }

    async function miniatura(file) {
      if (!file || !comprimible(file.type) || !d.redimensionar) return null;
      try {
        var r = await d.redimensionar(file, MINI_LADO, MINI_CALIDAD);
        return (r && r.archivo) || null;
      } catch (e) { return null; }
    }

    /** Sube un documento (comprimido) y su miniatura. La miniatura es una
        mejora: si falla, el documento sube igual. */
    async function subirDoc(file, shipId, slot) {
      var principal = await comprimir(file);
      var doc = await d.subir(principal, shipId, slot);
      var mini = await miniatura(file);
      if (mini) {
        try {
          var dm = await d.subir(mini, shipId, slot + '_mini');
          if (dm && dm.d) doc.m = dm.d;
        } catch (e) { /* sin miniatura: la tarjeta usa la grande */ }
      }
      doc.n = (file && file.name) || doc.n;
      return doc;
    }

    /** La marca de un documento que todavía no subió. Vive SOLO en memoria
        (la vista previa es local) y nunca sube a la nube. */
    function marcaPendiente(file) {
      return {d: d.urlLocal ? d.urlLocal(file) : '', n: file && file.name,
        t: file && file.type, pendiente: true, _archivo: file};
    }

    function esPendiente(doc) { return !!(doc && doc.pendiente && doc._archivo); }

    /** Tras guardar el pedido: lo pendiente entra a la cola PRIMERO (así
        cerrar la pestaña ya no lo pierde) y luego se intenta subir. */
    async function trasGuardar(shipId) {
      var s = d.pedido(shipId);
      if (!s) return 0;
      var n = 0;
      var slots = Object.keys(CAMPO);
      for (var i = 0; i < slots.length; i++) {
        var campo = CAMPO[slots[i]];
        var doc = s[campo];
        if (!esPendiente(doc)) continue;
        await cola.poner({clave: shipId + '|' + campo, shipId: shipId, slot: slots[i],
          campo: campo, archivo: doc._archivo, nombre: doc.n, tipo: doc.t, ts: Date.now()});
        n++;
      }
      if (n) { avisar(); procesar(); }
      return n;
    }

    /** Intenta subir todo lo pendiente. Uno a la vez; lo que falla se queda
        para el próximo intento. Devuelve cuántos subieron. */
    async function procesar() {
      if (subiendo) return 0;
      subiendo = true;
      var hechos = 0;
      try {
        var items = await cola.todos();
        for (var i = 0; i < items.length; i++) {
          var it = items[i];
          var s = d.pedido(it.shipId);
          // El pedido ya no existe (se borró): no se resucita con un campo.
          if (!s) { await cola.quitar(it.clave); continue; }
          try {
            var doc = await subirDoc(it.archivo, it.shipId, it.slot);
            // `forma: 'url'` = el campo guarda solo el enlace (la foto de
            // entrega del delivery); si no, el documento completo.
            var valor = it.forma === 'url' ? doc.d : doc;
            await d.patch(it.shipId, (function () { var o = {}; o[it.campo] = valor; return o; })());
            await cola.quitar(it.clave);
            // Solo si en memoria sigue la MISMA marca: si mientras tanto se
            // cambió o quitó el documento, eso manda.
            var cur = s[it.campo];
            if (!cur || cur.pendiente || it.forma === 'url') s[it.campo] = valor;
            hechos++;
          } catch (e) { /* sigue en la cola; próximo intento */ }
        }
      } finally {
        subiendo = false;
        avisar();
        if (hechos && d.repintar) d.repintar();
      }
      return hechos;
    }

    /** Encolar un archivo suelto para un campo que guarda solo el enlace. */
    async function encolarUrl(shipId, campo, slot, archivo) {
      await cola.poner({clave: shipId + '|' + campo, shipId: shipId, slot: slot, campo: campo,
        forma: 'url', archivo: archivo, nombre: archivo && archivo.name,
        tipo: archivo && archivo.type, ts: Date.now()});
      avisar(); procesar();
    }

    async function cuantos() {
      try { return (await cola.todos()).length; } catch (e) { return 0; }
    }

    return {CAMPO: CAMPO, documentosPerdidos: documentosPerdidos, comprimible: comprimible, comprimir: comprimir,
      miniatura: miniatura, subirDoc: subirDoc, marcaPendiente: marcaPendiente,
      esPendiente: esPendiente, trasGuardar: trasGuardar, procesar: procesar,
      encolarUrl: encolarUrl,
      cuantos: cuantos};
  }

  /* ── EL NAVEGADOR DE VERDAD ─────────────────────────────────────────── */

  /** Cola en IndexedDB. Si no hay (modo privado), en memoria: funciona
      igual mientras la pestaña siga abierta. */
  function colaIndexedDB() {
    var mem = {};
    var abrir = function () {
      return new Promise(function (ok, mal) {
        if (!global.indexedDB) return mal(new Error('sin indexedDB'));
        var r = global.indexedDB.open('tt_fotos', 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('pendientes', {keyPath: 'clave'}); };
        r.onsuccess = function () { ok(r.result); };
        r.onerror = function () { mal(r.error); };
      });
    };
    var tx = function (modo, fn) {
      return abrir().then(function (db) {
        return new Promise(function (ok, mal) {
          var t = db.transaction('pendientes', modo);
          var res = fn(t.objectStore('pendientes'));
          t.oncomplete = function () { ok(res && res.result !== undefined ? res.result : res); };
          t.onerror = function () { mal(t.error); };
        });
      });
    };
    return {
      poner: function (it) {
        return tx('readwrite', function (st) { return st.put(it); })
          .catch(function () { mem[it.clave] = it; });
      },
      todos: function () {
        return tx('readonly', function (st) { return st.getAll(); })
          .then(function (l) { return (l || []).concat(Object.keys(mem).map(function (k) { return mem[k]; })); })
          .catch(function () { return Object.keys(mem).map(function (k) { return mem[k]; }); });
      },
      quitar: function (clave) {
        delete mem[clave];
        return tx('readwrite', function (st) { return st.delete(clave); }).catch(function () {});
      },
    };
  }

  /** Redimensiona con canvas, respetando la orientación de la cámara. */
  async function redimensionar(file, lado, calidad) {
    var img;
    if (global.createImageBitmap) {
      try { img = await global.createImageBitmap(file, {imageOrientation: 'from-image'}); } catch (e) { img = null; }
    }
    if (!img) {
      img = await new Promise(function (ok, mal) {
        var u = URL.createObjectURL(file), im = new Image();
        im.onload = function () { URL.revokeObjectURL(u); ok(im); };
        im.onerror = function () { URL.revokeObjectURL(u); mal(new Error('no se pudo leer la imagen')); };
        im.src = u;
      });
    }
    var w = img.width, h = img.height;
    var k = Math.min(1, lado / Math.max(w, h));
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    var cx = c.getContext('2d');
    cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);   // PNG transparente → fondo blanco
    cx.drawImage(img, 0, 0, c.width, c.height);
    var blob = await new Promise(function (ok) { c.toBlob(ok, 'image/jpeg', calidad); });
    if (!blob) return null;
    var nombre = String(file.name || 'foto').replace(/\.[a-z0-9]+$/i, '') + '.jpg';
    return {archivo: new File([blob], nombre, {type: 'image/jpeg'}), achico: k < 1};
  }

  /* Indicador visible: «📤 N fotos por subir». Toca para reintentar. */
  function pintarIndicador(n) {
    var el = document.getElementById('ttFotosPend');
    if (!n) { if (el) el.style.display = 'none'; return; }
    if (!el) {
      el = document.createElement('button');
      el.id = 'ttFotosPend';
      el.type = 'button';
      el.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:9500;padding:8px 12px;' +
        'border-radius:20px;border:1px solid rgba(210,153,34,.45);background:#2a2110;color:#e3b341;' +
        'font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.4)';
      el.onclick = function () { if (global.FotosModule) global.FotosModule.procesar(); };
      document.body.appendChild(el);
    }
    el.textContent = '📤 ' + n + ' foto' + (n === 1 ? '' : 's') + ' por subir · reintentar';
    el.style.display = 'block';
  }

  if (typeof document === 'undefined' || !global.document) {
    global.FotosModuleCrear = crear;
    global.FotosDocumentosPerdidos = documentosPerdidos;
    return;
  }

  var M = crear({
    cola: colaIndexedDB(),
    redimensionar: redimensionar,
    urlLocal: function (f) { try { return URL.createObjectURL(f); } catch (e) { return ''; } },
    subir: function (f, id, slot) {
      if (!global.StorageModule || !global.StorageModule.uploadFile) {
        return Promise.reject(new Error('Storage no cargó'));
      }
      return global.StorageModule.uploadFile(f, id, slot);
    },
    patch: function (id, campos) {
      if (typeof global._fbPatchShipment !== 'function') return Promise.reject(new Error('sin nube'));
      return global._fbPatchShipment(id, campos);
    },
    pedido: function (id) {
      return ((global.S && global.S.shipments) || []).find(function (x) { return x && x.id === id; }) || null;
    },
    repintar: function () { if (typeof global.render === 'function') global.render(); },
    avisar: function () { M.cuantos().then(pintarIndicador); },
  });
  M.crear = crear;
  /* Pinta la lista de documentos perdidos (📦 → Documentos perdidos). */
  M.pintarPerdidos = function () {
    var el = document.getElementById('docsPerdidosList'); if (!el) return;
    var l = documentosPerdidos((global.S && global.S.shipments) || []);
    var esc = function (t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
    if (!l.length) { el.innerHTML = '<div style="color:var(--green)">✅ Ningún documento perdido.</div>'; return; }
    el.innerHTML = '<div style="margin-bottom:6px">' + l.length + ' pedido' + (l.length === 1 ? '' : 's') + ' con documentos que no están en la nube:</div>' +
      l.map(function (p) {
        return '<div style="padding:6px 0;border-top:1px solid var(--bd)"><a href="#" data-id="' + esc(p.id) + '" class="docPerdidoIr" style="color:var(--blue);font-weight:700;text-decoration:none">' + esc(p.name || p.id) + '</a> <span style="opacity:.7">· ' + esc(p.status) + '</span><br>' +
          p.faltan.map(function (f) {
            return (f.tipo === 'perdido' ? '⚠️ ' + esc(f.nombre) + ': perdido — vuelve a subirlo' : '💾 ' + esc(f.nombre) + ': solo en este navegador — abre el pedido y guárdalo');
          }).join('<br>') + '</div>';
      }).join('');
    el.querySelectorAll('.docPerdidoIr').forEach(function (a) {
      a.onclick = function (e) {
        e.preventDefault();
        if (typeof global.closeOverlay === 'function') global.closeOverlay('excelOverlay');
        if (typeof global.irAlPedido === 'function') global.irAlPedido(a.getAttribute('data-id'));
      };
    });
  };
  M.redimensionar = redimensionar;
  global.FotosModule = M;

  // Reintentos: al arrancar (con margen para la sesión), al volver
  // internet, y cada minuto mientras haya algo pendiente.
  setTimeout(function () { M.procesar(); }, 6000);
  global.addEventListener('online', function () { M.procesar(); });
  setInterval(function () { M.cuantos().then(function (n) { if (n) M.procesar(); }); }, 60000);
})(typeof window !== 'undefined' ? window : globalThis);
