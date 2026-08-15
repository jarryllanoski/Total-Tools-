/**
 * storage.js — Firebase Storage para Total Tools
 * ================================================
 * Sube documentos (guía, embalado, ticket) a Firebase Storage
 * en lugar de guardarlos como base64 en Firestore.
 *
 * Modo compatible:
 *   - Si doc.d empieza con "https://" → es URL de Storage (nuevo)
 *   - Si doc.d empieza con "data:"    → es base64 (legacy)
 *   - Si doc.d === "[img]"            → placeholder de Firebase
 *
 * Uso: agregar <script src="storage.js"></script> en index.html
 * ANTES de config.js
 */
(function(global){
'use strict';

/* ── CONFIG ──────────────────────────────────────────────────────── */
var STORAGE_BASE = (window.FBConfig && window.FBConfig.STORAGE_BASE) || 'https://firebasestorage.googleapis.com/v0/b/total-tools-24ce8.firebasestorage.app/o';
var FB_KEY       = (window.FBConfig && window.FBConfig.KEY)          || 'AIzaSyBkbY-CFtNHfbaG864sXVnaAwBKZGW6SRI';

/* ── HELPERS ─────────────────────────────────────────────────────── */

/**
 * Determina si un documento usa Storage URL o base64 legacy
 */
function isStorageUrl(doc) {
  return doc && doc.d && doc.d.startsWith('https://firebasestorage');
}

function isBase64(doc) {
  return doc && doc.d && doc.d.startsWith('data:');
}

function isPlaceholder(doc) {
  return doc && doc.d === '[img]';
}

/**
 * Codifica el path para Firebase Storage REST API
 * shipments/id_123/guia.jpg → shipments%2Fid_123%2Fguia.jpg
 */
function encodePath(path) {
  return encodeURIComponent(path);
}

/**
 * Obtiene la URL de descarga de un documento
 * Compatible con base64 (devuelve el data: directamente)
 * y con Storage URL (devuelve la URL)
 */
function getDisplayUrl(doc) {
  if (!doc) return null;
  if (isStorageUrl(doc)) return doc.d;
  if (isBase64(doc)) return doc.d;
  return null;
}

/* ── UPLOAD ──────────────────────────────────────────────────────── */

/**
 * Sube un archivo a Firebase Storage
 * @param {File} file - archivo a subir
 * @param {string} shipId - ID del shipment
 * @param {string} slot - 'guia' | 'embalado' | 'ticket'
 * @returns {Promise<{d: string, n: string, t: string, storage: true}>}
 */
async function uploadFile(file, shipId, slot) {
  if (!file || !shipId || !slot) throw new Error('Parámetros incompletos');

  // Determinar extensión
  var ext = 'jpg';
  if (file.type.includes('pdf'))  ext = 'pdf';
  else if (file.type.includes('png'))  ext = 'png';
  else if (file.type.includes('jpeg') || file.type.includes('jpg')) ext = 'jpg';
  else if (file.type.includes('webp')) ext = 'webp';

  var path    = 'shipments/' + shipId + '/' + slot + '.' + ext;
  var encoded = encodePath(path);
  var url     = STORAGE_BASE + '/' + encoded + '?uploadType=media&name=' + encoded + '&key=' + FB_KEY;

  // Renovar idToken si está por vencer antes de subir
  if (typeof window._authEnsureToken === 'function') await window._authEnsureToken();
  var _idTok = localStorage.getItem('tt_id_token') || '';
  var _uploadHdrs = { 'Content-Type': file.type };
  if (_idTok) _uploadHdrs['Authorization'] = 'Bearer ' + _idTok;

  var response = await fetch(url, {
    method:  'POST',
    headers: _uploadHdrs,
    body:    file
  });

  if (!response.ok) {
    var err = await response.text();
    throw new Error('Storage upload error: ' + err);
  }

  var data = await response.json();

  // Construir download URL con token
  var downloadUrl = STORAGE_BASE + '/' + encoded
    + '?alt=media'
    + (data.downloadTokens ? '&token=' + data.downloadTokens : '')
    + '&key=' + FB_KEY;

  return {
    d:       downloadUrl,
    n:       file.name,
    t:       file.type,
    storage: true,
    path:    path
  };
}

/**
 * Elimina un archivo de Firebase Storage
 * @param {string} path - path del archivo en Storage
 */
async function deleteFile(path) {
  if (!path) return;
  var encoded = encodePath(path);
  var url = STORAGE_BASE + '/' + encoded + '?key=' + FB_KEY;
  try {
    if (typeof window._authEnsureToken === 'function') await window._authEnsureToken();
    var _idTok = localStorage.getItem('tt_id_token') || '';
    var _delHdrs = _idTok ? { 'Authorization': 'Bearer ' + _idTok } : {};
    await fetch(url, { method: 'DELETE', headers: _delHdrs });
  } catch(e) {
    console.warn('[Storage] Error eliminando:', path, e.message);
  }
}

/* ── INTEGRACIÓN CON loadDoc ─────────────────────────────────────── */

/**
 * Versión mejorada de loadDoc que usa Storage cuando está disponible.
 * Reemplaza la función loadDoc de config.js.
 *
 * Modo compatible:
 * - Si el shipment tiene ID → sube a Storage
 * - Si es nuevo pedido (sin ID aún) → usa base64 como antes
 *   (se migrará a Storage al guardar)
 */
function patchLoadDoc() {
  if (!global.loadDoc) {
    console.warn('[Storage] loadDoc no encontrada — esperando config.js');
    return false;
  }

  var _origLoadDoc = global.loadDoc;

  global.loadDoc = function(input, slot) {
    var file = input.files[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { if(typeof global.toast==='function') global.toast('⚠️ Máximo 8MB'); return; }

    // Obtener el ID del shipment en edición
    var shipId = typeof _editId !== 'undefined' ? _editId : null;

    if (!shipId) {
      // Pedido nuevo — usar base64 como siempre (se sube al guardar)
      _origLoadDoc(input, slot);
      return;
    }

    // Pedido existente — subir directo a Storage
    if (typeof global.toast === 'function') global.toast('⏳ Subiendo documento...');

    uploadFile(file, shipId, slot)
      .then(function(docObj) {
        // Actualizar _docs con la URL de Storage
        if (typeof _docs !== 'undefined') {
          _docs[slot] = docObj;
        }
        // Refrescar UI
        if (typeof refreshSlot === 'function') refreshSlot(slot);

        // Confirmación de subida por slot
        var subMsg = slot === 'guia'     ? '🚚 Guía / Ticket subido ✓'
                   : slot === 'embalado' ? '📦 Embalado subido ✓'
                   :                        '🧾 Boleta / Factura subida ✓';
        global.toast(subMsg);

        // Auto-avanzar estado (escalera monotónica, respeta el toggle de config).
        // Fuente única: index.html → autoEstadoPorDoc.
        if (shipId && typeof global.autoEstadoPorDoc === 'function') {
          global.autoEstadoPorDoc(shipId, slot);
        }

      })
      .catch(function(e) {
        console.warn('[Storage] Error subiendo, usando base64:', e.message);
        global.toast('⚠️ Error Storage — guardando localmente');
        // Fallback a base64
        _origLoadDoc(input, slot);
      });
  };

  return true;
}

/**
 * Al guardar un pedido NUEVO (sin ID previo), migra los docs base64 a Storage.
 * Se llama desde saveShipment después de asignar el ID.
 * @param {string} shipId - ID recién asignado
 * @param {object} docs   - {guia, embalado, ticket}
 * @returns {Promise<object>} docs actualizados con URLs de Storage
 */
async function migrarDocsNuevos(shipId, docs) {
  var resultado = { guia: docs.guia, embalado: docs.embalado, ticket: docs.ticket };
  var slots = ['guia', 'embalado', 'ticket'];

  for (var i = 0; i < slots.length; i++) {
    var slot = slots[i];
    var doc  = docs[slot];
    if (!doc || !isBase64(doc)) continue; // ya es Storage URL o null

    try {
      // Convertir base64 a File
      var file = base64ToFile(doc.d, doc.n || (slot + '.jpg'), doc.t || 'image/jpeg');
      var storageDoc = await uploadFile(file, shipId, slot);
      resultado[slot] = storageDoc;
    } catch(e) {
      console.warn('[Storage] Error migrando', slot, '— manteniendo base64:', e.message);
    }
  }

  return resultado;
}

/**
 * Convierte un base64 data URL a File
 */
function base64ToFile(dataUrl, filename, mimeType) {
  var arr    = dataUrl.split(',');
  var bstr   = atob(arr[1]);
  var n      = bstr.length;
  var u8arr  = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  return new File([u8arr], filename, { type: mimeType });
}

/* ── PATCH saveShipment ──────────────────────────────────────────── */

function patchSaveShipment() {
  if (!global.saveShipment) {
    console.warn('[Storage] saveShipment no encontrada — esperando config.js');
    return false;
  }

  var _origSave = global.saveShipment;

  global.saveShipment = async function() {
    // Para pedidos NUEVOS: migrar base64 a Storage antes de guardar
    var isNew = (typeof _editId === 'undefined' || !_editId);

    if (isNew) {
      // Generar ID anticipado para poder subir a Storage
      var anticipatedId = 'id_' + Date.now();

      // Migrar docs si hay base64
      var docsActuales = typeof _docs !== 'undefined' ? _docs : { guia: null, embalado: null, ticket: null };
      var tieneBase64  = ['guia','embalado','ticket'].some(function(s){ return docsActuales[s] && isBase64(docsActuales[s]); });

      if (tieneBase64) {
        if (typeof global.toast === 'function') global.toast('⏳ Subiendo documentos...');
        try {
          var migrados = await migrarDocsNuevos(anticipatedId, docsActuales);
          // Actualizar _docs con las URLs de Storage
          if (typeof _docs !== 'undefined') {
            _docs.guia     = migrados.guia;
            _docs.embalado = migrados.embalado;
            _docs.ticket   = migrados.ticket;
          }
        } catch(e) {
          console.warn('[Storage] Error en migración, continuando con base64:', e.message);
        }
      }
    }

    // Llamar al saveShipment original
    _origSave();
  };

  return true;
}

/* ── PATCH openViewer — soportar Storage URLs ────────────────────── */
function patchOpenViewer() {
  if (!global.openViewer) return false;
  var _orig = global.openViewer;
  global.openViewer = function(doc, title) {
    if (!doc) return;
    // Si es Storage URL y es PDF → abrir en nueva pestaña
    if (isStorageUrl(doc) && doc.t && doc.t.includes('pdf')) {
      var a = document.createElement('a');
      a.href = doc.d; a.target = '_blank'; a.click();
      return;
    }
    // Si es Storage URL de imagen → mostrar en viewer
    if (isStorageUrl(doc) && doc.t && doc.t.startsWith('image/')) {
      _orig(doc, title);
      return;
    }
    _orig(doc, title);
  };
  return true;
}

/* ── API PÚBLICA ─────────────────────────────────────────────────── */
var StorageModule = {
  uploadFile:        uploadFile,
  deleteFile:        deleteFile,
  migrarDocsNuevos:  migrarDocsNuevos,
  isStorageUrl:      isStorageUrl,
  isBase64:          isBase64,
  getDisplayUrl:     getDisplayUrl,
  base64ToFile:      base64ToFile,

  init: function() {
    // Esperar a que config.js cargue sus funciones
    var attempts = 0;
    function tryPatch() {
      var ok1 = patchLoadDoc();
      var ok2 = patchSaveShipment();
      patchOpenViewer();
      if ((!ok1 || !ok2) && attempts < 30) {
        attempts++;
        setTimeout(tryPatch, 200);
      } else {
      }
    }
    setTimeout(tryPatch, 500);
  }
};

global.StorageModule = StorageModule;

// Auto-init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', StorageModule.init);
} else {
  StorageModule.init();
}

})(window);
