/**
 * qrtracking.js — Módulo QR para tracking manual Shalom
 * ======================================================
 * Genera un QR con el número de guía para escanear
 * desde la app oficial de Shalom cuando la API falla.
 *
 * Formato QR: NUMERODEGUIA/document/1/
 * Uso: agrega <script src="qrtracking.js"></script> en index.html
 */
(function(global){
'use strict';

/* ── Inyectar librería QR si no está ─────────────────────────────── */
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
    '#qrTrkSheet{background:#161b22;border-radius:18px;padding:24px 20px;width:calc(100% - 32px);max-width:320px;border:1px solid #30363d;text-align:center;}',
    '#qrTrkCanvas{display:flex;align-items:center;justify-content:center;margin:16px auto;}',
    '#qrTrkCanvas canvas,#qrTrkCanvas img{border-radius:10px;}',
    '.qrtrk-ttl{font-family:Syne,sans-serif;font-weight:800;font-size:16px;color:#e6edf3;margin-bottom:4px;}',
    '.qrtrk-sub{font-size:11px;color:#8b949e;margin-bottom:4px;line-height:1.5;}',
    '.qrtrk-guia{font-family:monospace;font-size:18px;font-weight:700;color:#388bfd;margin-bottom:16px;letter-spacing:1px;}',
    '.qrtrk-hint{font-size:11px;color:#8b949e;margin-top:12px;line-height:1.6;background:rgba(56,139,253,.08);border:1px solid rgba(56,139,253,.15);border-radius:8px;padding:8px 10px;}',
    '.qrtrk-close{width:100%;margin-top:14px;padding:12px;background:#1c2333;border:1px solid #30363d;border-radius:10px;color:#8b949e;font-size:13px;cursor:pointer;font-family:inherit;}',
    '.trk-btn-qr{background:rgba(163,113,247,.15);border:1px solid rgba(163,113,247,.3);color:#a371f7;}',
  ].join('');
  document.head.appendChild(s);
}

/* ── Overlay HTML ────────────────────────────────────────────────── */
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
      '<div class="qrtrk-hint">1️⃣ Abre la app de Shalom<br>2️⃣ Ve a <b>Seguimiento</b> → <b>Escanear QR</b><br>3️⃣ Apunta la cámara a este código</div>' +
      '<button class="qrtrk-close" onclick="QRTracking.cerrar()">Cerrar</button>' +
    '</div>';
  ov.addEventListener('click', function(e){
    if(e.target === ov) QRTracking.cerrar();
  });
  document.body.appendChild(ov);
}

/* ── API Pública ─────────────────────────────────────────────────── */
var QRTracking = {};

QRTracking.abrir = function(guia){
  if(!guia){ if(typeof window.toast==='function') window.toast('⚠️ Sin número de guía'); return; }

  var ov = document.getElementById('qrTrkOv');
  var canvas = document.getElementById('qrTrkCanvas');
  var guiaTxt = document.getElementById('qrTrkGuiaTxt');
  if(!ov || !canvas || !guiaTxt) return;

  guiaTxt.textContent = guia;
  canvas.innerHTML = '';
  ov.classList.add('open');

  // Texto que codifica el QR — mismo formato que el ticket físico de Shalom
  var qrData = guia + '/document/1/';

  _loadQRLib(function(){
    if(!global.QRCode){ canvas.innerHTML = '<div style="color:#f87171;font-size:12px;padding:20px">Error al generar QR.<br>Verifica tu conexión.</div>'; return; }
    try {
      new global.QRCode(canvas, {
        text:         qrData,
        width:        220,
        height:       220,
        colorDark:    '#000000',
        colorLight:   '#ffffff',
        correctLevel: global.QRCode.CorrectLevel.M
      });
    } catch(e) {
      canvas.innerHTML = '<div style="color:#f87171;font-size:12px;padding:20px">Error: '+e.message+'</div>';
    }
  });
};

QRTracking.cerrar = function(){
  var ov = document.getElementById('qrTrkOv');
  if(ov) ov.classList.remove('open');
};

/* ── Patch: agregar botón QR al bloque de tracking ──────────────── */
QRTracking.patchTrackingBlock = function(){
  // Override renderCardBlock de Tracking para inyectar botón QR
  if(!global.Tracking || !global.Tracking.renderCardBlock) return;
  var _orig = global.Tracking.renderCardBlock.bind(global.Tracking);
  global.Tracking.renderCardBlock = function(s){
    var html = _orig(s);
    if(!html) return html;
    var guia = s.trackingOrderNumber || s.shalomGuia || '';
    if(!guia) return html;
    // Insertar botón QR entre Consultar e Historial
    var qrBtn = '<button class="trk-btn trk-btn-qr" onclick="QRTracking.abrir(\''+guia+'\')">📷 QR</button>';
    // Insertar después del botón Consultar
    html = html.replace(
      /(<button[^>]*btn-consult[^>]*>.*?<\/button>)/,
      '$1' + qrBtn
    );
    return html;
  };
};

/* ── Init ────────────────────────────────────────────────────────── */
QRTracking.init = function(){
  _injectCSS();
  _injectOverlay();
  // Esperar a que Tracking esté listo
  var attempts = 0;
  function tryPatch(){
    if(global.Tracking && global.Tracking.renderCardBlock){
      QRTracking.patchTrackingBlock();
      console.log('[QRTracking] Módulo listo');
    } else if(attempts < 20){
      attempts++;
      setTimeout(tryPatch, 300);
    }
  }
  tryPatch();
};

global.QRTracking = QRTracking;

// Auto-init
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', QRTracking.init);
} else {
  QRTracking.init();
}

})(window);
