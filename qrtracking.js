/**
 * qrtracking.js — Módulo QR para tracking manual Shalom v2
 * =========================================================
 * - Botón QR en header del bloque tracking (junto a Ayuda)
 * - Genera QR automático con fórmula: orderNumber + 3473503
 * - Opción de escanear ticket físico con cámara como alternativa
 */
(function(global){
'use strict';

/* ── Cargar librería QR ──────────────────────────────────────────── */
function _loadQRLib(cb){
  if(global.QRCode){ cb(); return; }
  var s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
  s.onload = cb;
  s.onerror = function(){ console.warn('[QRTracking] No se pudo cargar qrcode.js'); };
  document.head.appendChild(s);
}

/* ── CSS ─────────────────────────────────────────────────────────── */
function _injectCSS(){
  if(document.getElementById('qrTrkCSS')) return;
  var s = document.createElement('style');
  s.id = 'qrTrkCSS';
  s.textContent = [
    '#qrTrkOv{display:none;position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:900;align-items:center;justify-content:center;}',
    '#qrTrkOv.open{display:flex;}',
    '#qrTrkSheet{background:#161b22;border-radius:18px;padding:20px;width:calc(100% - 32px);max-width:320px;border:1px solid #30363d;text-align:center;}',
    '#qrTrkCanvas{display:flex;align-items:center;justify-content:center;margin:12px auto;}',
    '#qrTrkCanvas canvas,#qrTrkCanvas img{border-radius:10px;}',
    '.qrtrk-ttl{font-family:Syne,sans-serif;font-weight:800;font-size:15px;color:#e6edf3;margin-bottom:2px;}',
    '.qrtrk-guia{font-family:monospace;font-size:17px;font-weight:700;color:#388bfd;margin-bottom:4px;letter-spacing:1px;}',
    '.qrtrk-sub{font-size:11px;color:#8b949e;margin-bottom:4px;line-height:1.5;}',
    '.qrtrk-hint{font-size:11px;color:#8b949e;margin-top:10px;line-height:1.6;background:rgba(56,139,253,.08);border:1px solid rgba(56,139,253,.15);border-radius:8px;padding:8px 10px;}',
    '.qrtrk-scan-btn{width:100%;margin-top:10px;padding:11px;background:rgba(163,113,247,.15);border:1px solid rgba(163,113,247,.3);border-radius:10px;color:#a371f7;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;}',
    '.qrtrk-close{width:100%;margin-top:8px;padding:11px;background:#1c2333;border:1px solid #30363d;border-radius:10px;color:#8b949e;font-size:13px;cursor:pointer;font-family:inherit;}',
    '.qrtrk-scan-result{font-size:11px;color:#22c55e;margin-top:6px;padding:6px 10px;background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.2);border-radius:8px;display:none;}',
    /* Botón QR en header del bloque tracking */
    '.trk-btn-qr-hdr{background:none;border:none;color:#8b949e;font-size:10px;cursor:pointer;padding:0;margin-left:6px;font-family:inherit;}',
    '.trk-btn-qr-hdr:hover{color:#a371f7;}',
  ].join('');
  document.head.appendChild(s);
}

/* ── Overlay ─────────────────────────────────────────────────────── */
function _injectOverlay(){
  if(document.getElementById('qrTrkOv')) return;
  var ov = document.createElement('div');
  ov.id = 'qrTrkOv';
  ov.innerHTML =
    '<div id="qrTrkSheet">' +
      '<div class="qrtrk-ttl">📦 QR de seguimiento</div>' +
      '<div class="qrtrk-sub">Escanea con la app oficial de Shalom</div>' +
      '<div class="qrtrk-guia" id="qrTrkGuiaTxt"></div>' +
      '<div id="qrTrkCanvas"></div>' +
      '<div class="qrtrk-scan-result" id="qrTrkScanResult"></div>' +
      '<div class="qrtrk-hint">1️⃣ Abre la app de Shalom<br>2️⃣ Ve a <b>Seguimiento</b> → <b>Escanear QR</b><br>3️⃣ Apunta la cámara a este código</div>' +
      '<button class="qrtrk-scan-btn" onclick="QRTracking.escanarFisico()">📷 Escanear ticket físico</button>' +
      '<button class="qrtrk-close" onclick="QRTracking.cerrar()">Cerrar</button>' +
    '</div>';
  ov.addEventListener('click', function(e){
    if(e.target === ov) QRTracking.cerrar();
  });
  document.body.appendChild(ov);
}

/* ── Generar QR en canvas ────────────────────────────────────────── */
function _generarQR(qrData, guia){
  var canvas = document.getElementById('qrTrkCanvas');
  var guiaTxt = document.getElementById('qrTrkGuiaTxt');
  var scanResult = document.getElementById('qrTrkScanResult');
  if(!canvas) return;
  canvas.innerHTML = '<div style="color:#8b949e;font-size:12px;padding:20px">Generando QR...</div>';
  if(guiaTxt) guiaTxt.textContent = guia;
  if(scanResult) scanResult.style.display = 'none';

  _loadQRLib(function(){
    if(!global.QRCode){
      canvas.innerHTML = '<div style="color:#f87171;font-size:12px;padding:20px">Error al generar QR.<br>Verifica tu conexión.</div>';
      return;
    }
    canvas.innerHTML = '';
    try {
      new global.QRCode(canvas, {
        text:         qrData,
        width:        200,
        height:       200,
        colorDark:    '#000000',
        colorLight:   '#ffffff',
        correctLevel: global.QRCode.CorrectLevel.M
      });
    } catch(e) {
      canvas.innerHTML = '<div style="color:#f87171;font-size:12px;padding:20px">Error: '+e.message+'</div>';
    }
  });
}

/* ── Fórmula QR Shalom ───────────────────────────────────────────── */
function _calcQRData(orderNumber){
  var qrId = Number(orderNumber) + 3473503;
  return String(qrId) + '/document/1/';
}

/* ── Variables de estado ─────────────────────────────────────────── */
var _currentGuia = '';
var _scanStream   = null;
var _scanCanvas   = null;
var _scanCtx      = null;
var _scanAF       = null;

/* ── API Pública ─────────────────────────────────────────────────── */
var QRTracking = {};

QRTracking.abrir = function(guia){
  if(!guia){ if(typeof window.toast==='function') window.toast('⚠️ Sin número de guía'); return; }
  _currentGuia = guia;
  var ov = document.getElementById('qrTrkOv');
  if(!ov) return;
  ov.classList.add('open');
  var qrData = _calcQRData(guia);
  _generarQR(qrData, guia);
};

QRTracking.cerrar = function(){
  var ov = document.getElementById('qrTrkOv');
  if(ov) ov.classList.remove('open');
  _stopScan();
};

/* ── Escanear ticket físico ──────────────────────────────────────── */
QRTracking.escanarFisico = function(){
  // Crear overlay de cámara encima del overlay QR
  var existing = document.getElementById('qrScanCam');
  if(existing) existing.remove();

  var div = document.createElement('div');
  div.id = 'qrScanCam';
  div.style.cssText = 'position:fixed;inset:0;background:#000;z-index:1000;display:flex;flex-direction:column;align-items:center;justify-content:center;';
  div.innerHTML =
    '<div style="position:absolute;top:0;left:0;right:0;padding:14px 16px;background:rgba(0,0,0,.7);display:flex;justify-content:space-between;align-items:center;z-index:10">' +
      '<div style="color:#fff;font-weight:700;font-size:14px">📷 Escanear ticket físico</div>' +
      '<button onclick="QRTracking._cerrarCamara()" style="background:rgba(255,255,255,.15);border:none;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:15px">✕</button>' +
    '</div>' +
    '<video id="qrScanVideo" playsinline muted autoplay style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"></video>' +
    '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-55%);width:220px;height:220px;border:3px solid #388bfd;border-radius:14px;box-shadow:0 0 0 9999px rgba(0,0,0,.5);z-index:5"></div>' +
    '<div style="position:absolute;bottom:0;left:0;right:0;padding:18px;text-align:center;color:rgba(255,255,255,.8);font-size:13px;background:rgba(0,0,0,.7);z-index:10">Apunta al QR del ticket físico de Shalom</div>';
  document.body.appendChild(div);

  // Iniciar cámara
  navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}})
    .then(function(stream){
      _scanStream = stream;
      var video = document.getElementById('qrScanVideo');
      if(!video){ _stopScan(); return; }
      video.srcObject = stream;
      video.play();
      _scanCanvas = document.createElement('canvas');
      _scanCtx    = _scanCanvas.getContext('2d');
      video.addEventListener('loadedmetadata', function(){
        _scanCanvas.width  = video.videoWidth;
        _scanCanvas.height = video.videoHeight;
        _scanLoop(video);
      });
    })
    .catch(function(e){
      _stopScan();
      if(typeof window.toast==='function') window.toast('⚠️ No se pudo acceder a la cámara');
    });
};

function _scanLoop(video){
  if(!video.srcObject) return;
  _scanCtx.drawImage(video, 0, 0, _scanCanvas.width, _scanCanvas.height);
  var found = null;

  // Intentar BarcodeDetector primero
  if('BarcodeDetector' in global){
    var bd = new global.BarcodeDetector({formats:['qr_code']});
    bd.detect(_scanCanvas).then(function(codes){
      if(codes.length){ _onScanResult(codes[0].rawValue); return; }
      _scanAF = requestAnimationFrame(function(){ _scanLoop(video); });
    }).catch(function(){
      _scanAF = requestAnimationFrame(function(){ _scanLoop(video); });
    });
  } else if(global.jsQR){
    var img = _scanCtx.getImageData(0, 0, _scanCanvas.width, _scanCanvas.height);
    var code = global.jsQR(img.data, img.width, img.height);
    if(code){ _onScanResult(code.data); return; }
    _scanAF = requestAnimationFrame(function(){ _scanLoop(video); });
  } else {
    // Cargar jsQR si no está
    var s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js';
    s.onload = function(){ _scanAF = requestAnimationFrame(function(){ _scanLoop(video); }); };
    document.head.appendChild(s);
  }
}

function _onScanResult(raw){
  _stopScan();
  // Mostrar mensaje de escaneado
  var scanResult = document.getElementById('qrTrkScanResult');
  if(scanResult){
    scanResult.textContent = '✅ Escaneado: ' + raw;
    scanResult.style.display = 'block';
  }
  // Limpiar completamente el canvas antes de regenerar
  var c = document.getElementById('qrTrkCanvas');
  if(c){
    // Destruir cualquier instancia anterior de QRCode
    c.innerHTML = '';
    // Forzar reflow para que el DOM se limpie
    void c.offsetHeight;
  }
  // Pequeño delay para asegurar limpieza del DOM
  setTimeout(function(){
    _loadQRLib(function(){
      if(!global.QRCode) return;
      var canvas = document.getElementById('qrTrkCanvas');
      if(!canvas) return;
      canvas.innerHTML = '';
      try {
        new global.QRCode(canvas, {
          text:         raw,
          width:        200,
          height:       200,
          colorDark:    '#000000',
          colorLight:   '#ffffff',
          correctLevel: global.QRCode.CorrectLevel.M
        });
      } catch(e){ console.warn('[QRTracking] Error generando QR:', e); }
    });
  }, 100);
  if(typeof window.toast==='function') window.toast('✅ QR del ticket cargado');
}

function _stopScan(){
  if(_scanAF) cancelAnimationFrame(_scanAF);
  if(_scanStream) _scanStream.getTracks().forEach(function(t){ t.stop(); });
  _scanStream = null; _scanAF = null;
  var cam = document.getElementById('qrScanCam');
  if(cam) cam.remove();
}

QRTracking._cerrarCamara = _stopScan;

/* ── Patch renderCardBlock — botón QR en header ──────────────────── */
QRTracking.patchTrackingBlock = function(){
  if(!global.Tracking || !global.Tracking.renderCardBlock) return;
  var _orig = global.Tracking.renderCardBlock.bind(global.Tracking);
  global.Tracking.renderCardBlock = function(s){
    var html = _orig(s);
    if(!html) return html;
    var guia = s.trackingOrderNumber || s.shalomGuia || '';
    if(!guia) return html;
    // Insertar solo botón 📷 QR en el header junto a "Ayuda"
    var qrBtn = '<button class="trk-btn-qr-hdr" onclick="QRTracking.abrir(\''+guia+'\')" title="Ver QR de seguimiento">📷 QR</button>';
    html = html.replace(
      '<button onclick="Tracking.abrirManual()" style="background:none;border:none;color:#8b949e;font-size:10px;cursor:pointer;padding:0" title="Instrucciones">📖 Ayuda</button>',
      '<button onclick="Tracking.abrirManual()" style="background:none;border:none;color:#8b949e;font-size:10px;cursor:pointer;padding:0" title="Instrucciones">📖 Ayuda</button>' + qrBtn
    );
    return html;
  };
};

/* ── Init ────────────────────────────────────────────────────────── */
QRTracking.init = function(){
  _injectCSS();
  _injectOverlay();
  var attempts = 0;
  function tryPatch(){
    if(global.Tracking && global.Tracking.renderCardBlock){
      QRTracking.patchTrackingBlock();
      console.log('[QRTracking] v2 listo — fórmula: orderNumber + 3473503');
    } else if(attempts < 20){
      attempts++;
      setTimeout(tryPatch, 300);
    }
  }
  tryPatch();
};

global.QRTracking = QRTracking;

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', QRTracking.init);
} else {
  QRTracking.init();
}

})(window);
