(function(global){
'use strict';

var STORAGE_BASE = (window.FBConfig && window.FBConfig.STORAGE_BASE) || 'https://firebasestorage.googleapis.com/v0/b/total-tools-24ce8.firebasestorage.app/o';
var FB_KEY       = (window.FBConfig && window.FBConfig.KEY)          || 'AIzaSyBkbY-CFtNHfbaG864sXVnaAwBKZGW6SRI';

function isStorageUrl(doc) {
  return doc && doc.d && doc.d.startsWith('https://firebasestorage');
}

function isBase64(doc) {
  return doc && doc.d && doc.d.startsWith('data:');
}

function isPlaceholder(doc) {
  return doc && doc.d === '[img]';
}

function encodePath(path) {
  return encodeURIComponent(path);
}

function getDisplayUrl(doc) {
  if (!doc) return null;
  if (isStorageUrl(doc)) return doc.d;
  if (isBase64(doc)) return doc.d;
  return null;
}

async function uploadFile(file, shipId, slot, carpeta) {
  if (!file || !shipId || !slot) throw new Error('Parámetros incompletos');
  var raiz = (carpeta === 'recursos') ? 'recursos' : 'shipments';

  var ext = 'jpg';
  if (file.type.includes('pdf'))  ext = 'pdf';
  else if (file.type.includes('png'))  ext = 'png';
  else if (file.type.includes('jpeg') || file.type.includes('jpg')) ext = 'jpg';
  else if (file.type.includes('webp')) ext = 'webp';

  var path    = raiz + '/' + shipId + '/' + slot + '.' + ext;
  var encoded = encodePath(path);
  var url     = STORAGE_BASE + '/' + encoded + '?uploadType=media&name=' + encoded + '&key=' + FB_KEY;

  if (typeof window._authToken !== 'function') {
    throw new Error('Storage: auth.js no está cargado — no se sube sin sesión');
  }
  var _idTok = await window._authToken();
  var _uploadHdrs = { 'Content-Type': file.type, 'Authorization': 'Bearer ' + _idTok };

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

async function deleteFile(path) {
  if (!path) return;
  var encoded = encodePath(path);
  var url = STORAGE_BASE + '/' + encoded + '?key=' + FB_KEY;
  try {
    if (typeof window._authToken !== 'function') {
      throw new Error('Storage: auth.js no está cargado — no se borra sin sesión');
    }
    var _idTok = await window._authToken();
    await fetch(url, {
      method: 'DELETE', headers: { 'Authorization': 'Bearer ' + _idTok }
    });
  } catch(e) {
    console.warn('[Storage] Error eliminando:', path, e.message);
  }
}

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

    var shipId = typeof _editId !== 'undefined' ? _editId : null;

    if (!shipId) {
      _origLoadDoc(input, slot);
      return;
    }

    if (typeof global.toast === 'function') global.toast('⏳ Subiendo documento...');

    uploadFile(file, shipId, slot)
      .then(function(docObj) {
        if (typeof _docs !== 'undefined') {
          _docs[slot] = docObj;
        }
        if (typeof refreshSlot === 'function') refreshSlot(slot);

        var subMsg = slot === 'guia'     ? '🚚 Guía / Ticket subido ✓'
                   : slot === 'embalado' ? '📦 Embalado subido ✓'
                   :                        '🧾 Boleta / Factura subida ✓';
        global.toast(subMsg);

      })
      .catch(function(e) {
        console.warn('[Storage] Error subiendo, usando base64:', e.message);
        var t = global._authTextoMotivo && global._authTextoMotivo(e);
        global.toast(t || '⚠️ Error Storage — guardando localmente');
        _origLoadDoc(input, slot);
      });
  };

  return true;
}

async function migrarDocsNuevos(shipId, docs) {
  var resultado = { guia: docs.guia, embalado: docs.embalado, ticket: docs.ticket };
  var slots = ['guia', 'embalado', 'ticket'];

  for (var i = 0; i < slots.length; i++) {
    var slot = slots[i];
    var doc  = docs[slot];
    if (!doc || !isBase64(doc)) continue;

    try {
      var file = base64ToFile(doc.d, doc.n || (slot + '.jpg'), doc.t || 'image/jpeg');
      var storageDoc = await uploadFile(file, shipId, slot);
      resultado[slot] = storageDoc;
    } catch(e) {
      console.warn('[Storage] Error migrando', slot, '— manteniendo base64:', e.message);
    }
  }

  return resultado;
}

function base64ToFile(dataUrl, filename, mimeType) {
  var arr    = dataUrl.split(',');
  var bstr   = atob(arr[1]);
  var n      = bstr.length;
  var u8arr  = new Uint8Array(n);
  while (n--) u8arr[n] = bstr.charCodeAt(n);
  return new File([u8arr], filename, { type: mimeType });
}

function patchSaveShipment() {
  if (!global.saveShipment) {
    console.warn('[Storage] saveShipment no encontrada — esperando config.js');
    return false;
  }

  var _origSave = global.saveShipment;

  global.saveShipment = async function() {
    var isNew = (typeof _editId === 'undefined' || !_editId);

    if (isNew) {
      var anticipatedId = 'id_' + Date.now();

      var docsActuales = typeof _docs !== 'undefined' ? _docs : { guia: null, embalado: null, ticket: null };
      var tieneBase64  = ['guia','embalado','ticket'].some(function(s){ return docsActuales[s] && isBase64(docsActuales[s]); });

      if (tieneBase64) {
        if (typeof global.toast === 'function') global.toast('⏳ Subiendo documentos...');
        try {
          var migrados = await migrarDocsNuevos(anticipatedId, docsActuales);
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

    _origSave();
  };

  return true;
}

function patchOpenViewer() {
  if (!global.openViewer) return false;
  var _orig = global.openViewer;
  global.openViewer = function(doc, title) {
    if (!doc) return;
    if (isStorageUrl(doc) && doc.t && doc.t.includes('pdf')) {
      var a = document.createElement('a');
      a.href = doc.d; a.target = '_blank'; a.click();
      return;
    }
    if (isStorageUrl(doc) && doc.t && doc.t.startsWith('image/')) {
      _orig(doc, title);
      return;
    }
    _orig(doc, title);
  };
  return true;
}

var StorageModule = {
  uploadFile:        uploadFile,
  deleteFile:        deleteFile,
  migrarDocsNuevos:  migrarDocsNuevos,
  isStorageUrl:      isStorageUrl,
  isBase64:          isBase64,
  getDisplayUrl:     getDisplayUrl,
  base64ToFile:      base64ToFile,

  init: function() {
    var attempts = 0;
    function tryPatch() {
      var ok1 = true;
      patchOpenViewer();
      if (!ok1 && attempts < 30) {
        attempts++;
        setTimeout(tryPatch, 200);
      } else {
      }
    }
    setTimeout(tryPatch, 500);
  }
};

global.StorageModule = StorageModule;

if (document.readyState !== 'complete') {
  document.addEventListener('DOMContentLoaded', StorageModule.init);
} else {
  StorageModule.init();
}

})(window);
