/**
 * alertas.js — Centro de alertas del panel
 * =========================================
 * Un icono en la cabecera (debajo del nombre del negocio, junto al teléfono)
 * que concentra lo que REQUIERE TU ATENCIÓN. No es la campana: la campana son
 * cosas que PASARON (pedido nuevo, llegó a destino) y se marcan como leídas;
 * esto son cosas que SIGUEN pasando (un pedido retrasado sigue retrasado hasta
 * que actúas), así que no se descartan: desaparecen cuando las resuelves.
 *
 * Principios:
 *   • Silencio = todo bien. Sin badge cuando no hay nada que hacer.
 *   • El número cuenta ACCIONES, no eventos.
 *   • Todo es accionable: tocar una alerta abre ese pedido.
 *   • Las alertas se CALCULAN de los datos que ya existen (fecha, estado,
 *     guía). No se guarda nada nuevo → cero costo, cero desincronización, y
 *     funcionan hacia atrás con todos los pedidos actuales.
 *
 * Reutiliza: .overlay/.sheet del panel, openOverlay/closeOverlay, openForm,
 * stIcon, escH, save y toast. No toca ninguna lógica existente.
 */
(function(global){
'use strict';

var Alertas = {};

/* ── Config ──────────────────────────────────────────────────────── */
var DIAS_CIERRE_DEF = 7;
function _diasCierre(){
  var d = global.S && global.S.config && Number(global.S.config.alertaDiasCierre);
  return (d >= 1 && d <= 90) ? d : DIAS_CIERRE_DEF;
}

/* ── Helpers ─────────────────────────────────────────────────────── */
function _esc(s){ return (typeof global.escH === 'function') ? global.escH(s) : String(s == null ? '' : s); }
function _labels(){ return (global.S && global.S.labels) || []; }
function _idx(st){ return _labels().indexOf(st); }
// Fecha local en formato YYYY-MM-DD (comparable como texto).
function _hoy(){
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function _sumarDias(fecha, n){
  var t = Date.parse(String(fecha) + 'T12:00:00');
  if (!isFinite(t)) return null;
  var d = new Date(t + n*86400000);
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function _esFecha(v){ return /^\d{4}-\d{2}-\d{2}$/.test(String(v||'')); }

/* ── Cálculo de alertas (derivado, sin almacenar nada) ───────────── */
Alertas.calcular = function(){
  var ships = (global.S && global.S.shipments) || [];
  var hoy   = _hoy();
  var iEnv  = _idx('ENVIADO');      // si el usuario borró esta etiqueta, iEnv < 0
  var dias  = _diasCierre();
  var out   = { retrasados: [], sinGuia: [], sinCerrar: [] };

  ships.forEach(function(s){
    if (!s || !s.id) return;
    var st = s.status || '';
    if (st === 'FINALIZADO') return;         // terminal: nunca alerta
    var i = _idx(st);                        // -1 si el estado ya no existe

    // 1) RETRASADO — la fecha de envío ya pasó y el pedido aún no sale.
    if (iEnv >= 0 && i >= 0 && i < iEnv && _esFecha(s.date) && s.date < hoy) {
      out.retrasados.push(s);
    }

    // 2) SHALOM SIN GUÍA/CÓDIGO — no se puede hacer seguimiento.
    if (String(s.courier || '').toUpperCase().indexOf('SHALOM') >= 0) {
      var g = s.trackingOrderNumber || s.shalomGuia   || '';
      var c = s.trackingOrderCode   || s.shalomCodigo || '';
      if (!g || !c) out.sinGuia.push(s);
    }

    // 3) SIN CERRAR — ya salió y pasaron más de N días sin finalizar.
    if (iEnv >= 0 && i >= iEnv && _esFecha(s.date)) {
      var limite = _sumarDias(s.date, dias);
      if (limite && limite < hoy) out.sinCerrar.push(s);
    }
  });

  out.total = out.retrasados.length + out.sinGuia.length + out.sinCerrar.length;
  return out;
};

/* ── CSS ─────────────────────────────────────────────────────────── */
function _css(){
  if (document.getElementById('alertasCSS')) return;
  var st = document.createElement('style'); st.id = 'alertasCSS';
  st.textContent = [
    '#alertasBtn{position:relative;display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border:none;background:none;padding:0;cursor:pointer;color:var(--text2);flex-shrink:0}',
    '#alertasBtn svg{width:16px;height:16px;display:block}',
    '#alertasBtn.on{color:#f59e0b}',
    '#alertasBadge{position:absolute;top:-4px;right:-6px;min-width:14px;height:14px;padding:0 3px;border-radius:7px;background:#f59e0b;color:#0d1117;font-size:9px;font-weight:800;display:none;align-items:center;justify-content:center;line-height:1}',
    '#alertasBadge.show{display:flex}',
    '.al-sec{margin-bottom:14px}',
    '.al-sec-ttl{font-size:11px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:var(--text2);margin-bottom:7px;display:flex;align-items:center;justify-content:space-between}',
    '.al-sec-cnt{background:rgba(245,158,11,.15);color:#f59e0b;border-radius:10px;padding:1px 7px;font-size:10px;font-weight:800}',
    '.al-item{display:flex;align-items:center;gap:9px;padding:9px 10px;background:var(--bg2);border:1px solid var(--bd);border-radius:9px;margin-bottom:6px;cursor:pointer}',
    '.al-item:active{opacity:.75}',
    '.al-item-txt{flex:1;min-width:0}',
    '.al-item-name{font-size:13px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.al-item-sub{font-size:11px;color:var(--text2);margin-top:2px}',
    '.al-ok{text-align:center;padding:26px 10px;color:var(--text2);font-size:13px;line-height:1.7}',
    '.al-cfg{border-top:1px solid var(--bd);padding-top:11px;margin-top:2px;display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--text2)}',
    '.al-cfg input{width:56px;padding:6px 8px;border-radius:7px;border:1px solid var(--bd);background:var(--bg);color:var(--text);font-family:inherit;font-size:12px;text-align:center}'
  ].join('');
  document.head.appendChild(st);
}

/* ── Icono en la cabecera (junto al teléfono, debajo del nombre) ─── */
function _montarIcono(){
  if (document.getElementById('alertasBtn')) return;
  var slot = document.getElementById('alertasSlot');
  if (!slot) return;
  var b = document.createElement('button');
  b.id = 'alertasBtn';
  b.type = 'button';
  b.title = 'Alertas';
  b.setAttribute('onclick', 'Alertas.abrir()');
  // Icono de "pulso/estado" — a propósito NO es una campana (esa ya existe y
  // es para eventos que se leen y se descartan).
  b.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M3 12h4l2.5-6 4 12 2.5-6H21"/>' +
    '</svg>' +
    '<span id="alertasBadge"></span>';
  slot.appendChild(b);
}

/* ── Badge: silencio = todo bien ─────────────────────────────────── */
Alertas.refrescar = function(){
  var btn = document.getElementById('alertasBtn');
  var bad = document.getElementById('alertasBadge');
  if (!btn || !bad) return;
  var a = Alertas.calcular();
  if (a.total > 0) {
    bad.textContent = a.total > 99 ? '99+' : String(a.total);
    bad.classList.add('show');
    btn.classList.add('on');
    btn.title = a.total + ' cosa' + (a.total !== 1 ? 's' : '') + ' requiere' + (a.total !== 1 ? 'n' : '') + ' tu atención';
  } else {
    bad.classList.remove('show');
    btn.classList.remove('on');
    btn.title = 'Alertas — todo en orden';
  }
};

/* ── Panel ───────────────────────────────────────────────────────── */
function _montarPanel(){
  if (document.getElementById('alertasOverlay')) return;
  var ov = document.createElement('div');
  ov.className = 'overlay';
  ov.id = 'alertasOverlay';
  ov.innerHTML =
    '<div class="sheet">' +
      '<div class="sheet-handle"></div>' +
      '<div class="sheet-title">📣 Alertas</div>' +
      '<div id="alertasBody"></div>' +
      '<div class="al-cfg">Avisar si un envío lleva más de' +
        '<input id="alertasDias" type="number" min="1" max="90" inputmode="numeric" onchange="Alertas.guardarDias(this.value)">' +
        'días sin finalizar</div>' +
      '<button class="btn-sec" style="margin-top:12px" onclick="closeOverlay(\'alertasOverlay\')">Cerrar</button>' +
    '</div>';
  ov.addEventListener('click', function(e){ if (e.target === ov) global.closeOverlay('alertasOverlay'); });
  document.body.appendChild(ov);
}

function _item(s, sub){
  return '<div class="al-item" onclick="Alertas.ir(\'' + String(s.id).replace(/'/g,"\\'") + '\')">' +
    '<span style="font-size:15px">' + ((typeof global.stIcon === 'function') ? global.stIcon(s.status) : '📦') + '</span>' +
    '<div class="al-item-txt">' +
      '<div class="al-item-name">' + _esc(s.name) + '</div>' +
      '<div class="al-item-sub">' + sub + '</div>' +
    '</div>' +
    '<span style="color:var(--text2);font-size:13px">›</span>' +
  '</div>';
}

function _seccion(titulo, lista, subFn){
  if (!lista.length) return '';
  return '<div class="al-sec">' +
    '<div class="al-sec-ttl"><span>' + titulo + '</span><span class="al-sec-cnt">' + lista.length + '</span></div>' +
    lista.map(function(s){ return _item(s, subFn(s)); }).join('') +
  '</div>';
}

Alertas.abrir = function(){
  _montarPanel();
  var a = Alertas.calcular();
  var body = document.getElementById('alertasBody');
  var inp  = document.getElementById('alertasDias');
  if (inp) inp.value = _diasCierre();
  if (body) {
    if (!a.total) {
      body.innerHTML = '<div class="al-ok">✅<br>Todo en orden<br><span style="font-size:11.5px">No hay pedidos retrasados ni datos faltantes.</span></div>';
    } else {
      body.innerHTML =
        _seccion('⏰ Retrasados', a.retrasados, function(s){ return 'Debía salir el ' + _esc(s.date) + ' · ' + _esc(s.status); }) +
        _seccion('📋 Shalom sin guía', a.sinGuia, function(s){ return 'Falta guía o código — no se puede seguir'; }) +
        _seccion('💰 Sin finalizar', a.sinCerrar, function(s){ return 'Enviado el ' + _esc(s.date) + ' · ' + _esc(s.status); });
    }
  }
  global.openOverlay('alertasOverlay');
};

// Tocar una alerta → abrir ese pedido.
Alertas.ir = function(id){
  global.closeOverlay('alertasOverlay');
  if (typeof global.openForm === 'function') global.openForm(id);
};

Alertas.guardarDias = function(v){
  var n = parseInt(v, 10);
  if (!(n >= 1 && n <= 90)) { if (global.toast) global.toast('⚠️ Entre 1 y 90 días'); return; }
  global.S = global.S || {}; global.S.config = global.S.config || {};
  global.S.config.alertaDiasCierre = n;
  if (typeof global.save === 'function') global.save('config');
  Alertas.abrir();          // recalcular con el nuevo umbral
  Alertas.refrescar();
  if (global.toast) global.toast('⏱️ Aviso a los ' + n + ' días');
};

/* ── Init ────────────────────────────────────────────────────────── */
Alertas.init = function(){
  _css(); _montarIcono(); _montarPanel(); Alertas.refrescar();
};

global.Alertas = Alertas;
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', Alertas.init);
} else {
  Alertas.init();
}

})(window);
