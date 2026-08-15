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

/* ── Estado del sistema (latido que escribe el backend) ──────────────
   Viaja dentro de panel/config, que el panel ya descarga en cada poll → se
   lee sin una sola lectura extra. */
function _salud(){ return (global.S && global.S.salud) || null; }

function _haceCuanto(iso){
  var t = Date.parse(iso || '');
  if (!isFinite(t)) return '—';
  var m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'hace un momento';
  if (m < 60) return 'hace ' + m + ' min';
  var h = Math.round(m / 60);
  if (h < 24) return 'hace ' + h + ' h';
  return 'hace ' + Math.round(h / 24) + ' d';
}

// Severidad del sistema: 'ok' | 'aviso' | 'error'
Alertas.estadoSistema = function(){
  var s = _salud();
  if (!s) return { nivel: 'aviso', txt: 'Sin datos todavía', detalle: 'Aún no hay ninguna corrida registrada.' };
  if (s.activo === false) return { nivel: 'error', txt: 'Apagado', detalle: 'El seguimiento automático no está corriendo (motor: ' + (s.motor || '—') + ').' };
  var vieja = Date.parse(s.ultimaCorrida || '');
  if (isFinite(vieja) && (Date.now() - vieja) > 3 * 3600000) {
    return { nivel: 'error', txt: 'Sin señal', detalle: 'La última corrida fue ' + _haceCuanto(s.ultimaCorrida) + '.' };
  }
  if (s.errores > 0) return { nivel: 'aviso', txt: 'Con errores', detalle: s.errores + ' error(es) en la última corrida.' };
  return { nivel: 'ok', txt: 'Activo', detalle: 'Última corrida ' + _haceCuanto(s.ultimaCorrida) + '.' };
};

/* ── CSS ─────────────────────────────────────────────────────────── */
function _css(){
  if (document.getElementById('alertasCSS')) return;
  var st = document.createElement('style'); st.id = 'alertasCSS';
  st.textContent = [
    '#alertasBtn{position:relative;display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border:none;background:none;padding:0;cursor:pointer;color:var(--text2);flex-shrink:0}',
    '#alertasBtn svg{width:16px;height:16px;display:block}',
    '#alertasBtn.on{color:#f59e0b}',
    '#alertasBtn.err{color:var(--red)}',
    '#alertasBadge{position:absolute;top:-4px;right:-6px;min-width:14px;height:14px;padding:0 3px;border-radius:7px;background:#f59e0b;color:#0d1117;font-size:9px;font-weight:800;display:none;align-items:center;justify-content:center;line-height:1}',
    '#alertasBadge.show{display:flex}',
    '#alertasBadge.err{background:var(--red);color:#fff}',
    '.al-sis{display:flex;align-items:center;gap:9px;padding:10px 11px;border-radius:9px;margin-bottom:8px;border:1px solid}',
    '.al-sis.ok{background:rgba(46,160,67,.08);border-color:rgba(46,160,67,.3)}',
    '.al-sis.aviso{background:rgba(245,158,11,.08);border-color:rgba(245,158,11,.3)}',
    '.al-sis.error{background:rgba(247,129,102,.10);border-color:rgba(247,129,102,.35)}',
    '.al-sis-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0}',
    '.al-sis.ok .al-sis-dot{background:var(--green)}',
    '.al-sis.aviso .al-sis-dot{background:#f59e0b}',
    '.al-sis.error .al-sis-dot{background:var(--red)}',
    '.al-kpis{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}',
    '.al-kpi{flex:1;min-width:70px;background:var(--bg2);border:1px solid var(--bd);border-radius:8px;padding:7px 6px;text-align:center}',
    '.al-kpi-n{font-size:15px;font-weight:800;font-family:Syne,sans-serif;color:var(--text)}',
    '.al-kpi-l{font-size:9px;color:var(--text2);text-transform:uppercase;margin-top:1px}',
    '.al-ev{font-size:11px;color:var(--text2);padding:6px 8px;background:var(--bg2);border:1px solid var(--bd);border-radius:7px;margin-bottom:5px;cursor:pointer}',
    '.al-ev b{color:var(--red);font-family:monospace}',
    '.al-btns{display:flex;gap:7px;margin-top:4px}',
    '.al-btns button{flex:1;padding:9px;border-radius:8px;border:1px solid var(--bd);background:var(--bg2);color:var(--text2);font-size:11.5px;font-weight:700;cursor:pointer;font-family:inherit}',
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
  var a   = Alertas.calcular();
  var sis = Alertas.estadoSistema();
  // Rojo manda: un sistema caído es más grave que pedidos por atender.
  btn.classList.remove('on', 'err');
  if (sis.nivel === 'error') btn.classList.add('err');
  else if (a.total > 0)      btn.classList.add('on');

  if (a.total > 0) {
    bad.textContent = a.total > 99 ? '99+' : String(a.total);
    bad.classList.add('show');
    bad.classList.toggle('err', sis.nivel === 'error');
  } else if (sis.nivel === 'error') {
    bad.textContent = '!';
    bad.classList.add('show', 'err');
  } else {
    bad.classList.remove('show', 'err');
  }

  btn.title = (sis.nivel === 'error' ? '⚠️ ' + sis.txt + ' · ' : '') +
    (a.total > 0 ? a.total + ' por atender' : 'Todo en orden');
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

// Eventos AGRUPADOS por código: "SHALOM_SIN_RESPUESTA ×12 · hace 3 h".
// Un log que repite doce veces lo mismo no se lee; agrupado sí.
function _eventosHtml(){
  var s = _salud();
  var ev = (s && Array.isArray(s.eventos)) ? s.eventos : [];
  if (!ev.length) return '';
  var g = {};
  ev.forEach(function(e){
    var k = e.codigo || 'ERROR';
    if (!g[k]) g[k] = { n: 0, ultimo: e.ts, pedidoId: e.pedidoId, pedido: e.pedido, msg: e.msg };
    g[k].n++;
    if (String(e.ts) > String(g[k].ultimo)) { g[k].ultimo = e.ts; g[k].pedidoId = e.pedidoId; g[k].pedido = e.pedido; g[k].msg = e.msg; }
  });
  var filas = Object.keys(g).sort(function(a,b){ return g[b].n - g[a].n; }).map(function(k){
    var x = g[k];
    var ir = x.pedidoId ? ' onclick="Alertas.ir(\'' + String(x.pedidoId).replace(/'/g,"\\'") + '\')"' : '';
    return '<div class="al-ev"' + ir + '><b>' + _esc(k) + '</b> ×' + x.n + ' · ' + _haceCuanto(x.ultimo) +
      (x.pedido ? '<br>último: ' + _esc(x.pedido) : '') + '</div>';
  }).join('');
  return '<div class="al-sec"><div class="al-sec-ttl"><span>🧾 Últimos problemas</span></div>' + filas + '</div>';
}

function _sistemaHtml(){
  var s = _salud();
  var e = Alertas.estadoSistema();
  var kpis = s ? ('<div class="al-kpis">' +
      '<div class="al-kpi"><div class="al-kpi-n">' + (s.enCola != null ? s.enCola : '—') + '</div><div class="al-kpi-l">En cola</div></div>' +
      '<div class="al-kpi"><div class="al-kpi-n">' + (s.procesados != null ? s.procesados : '—') + '</div><div class="al-kpi-l">Procesados</div></div>' +
      '<div class="al-kpi"><div class="al-kpi-n">' + (s.errores != null ? s.errores : '—') + '</div><div class="al-kpi-l">Errores</div></div>' +
      '<div class="al-kpi"><div class="al-kpi-n">' + (s.sinGuia != null ? s.sinGuia : '—') + '</div><div class="al-kpi-l">Sin guía</div></div>' +
    '</div>') : '';
  return '<div class="al-sec">' +
    '<div class="al-sec-ttl"><span>⚙️ Estado del sistema</span></div>' +
    '<div class="al-sis ' + e.nivel + '"><span class="al-sis-dot"></span>' +
      '<div style="flex:1;min-width:0"><div style="font-size:12.5px;font-weight:700;color:var(--text)">Seguimiento automático: ' + _esc(e.txt) + '</div>' +
      '<div style="font-size:11px;color:var(--text2);margin-top:2px">' + _esc(e.detalle) +
      (s && s.hayMas ? ' · quedan pedidos en cola' : '') + '</div></div>' +
    '</div>' + kpis +
    '<div class="al-btns">' +
      '<button onclick="Alertas.sincronizar(this)">🔄 Sincronizar ahora</button>' +
      '<button onclick="Alertas.reprogramar(this)">⏱️ Reprogramar cola</button>' +
    '</div>' +
  '</div>';
}

Alertas.abrir = function(){
  _montarPanel();
  var a = Alertas.calcular();
  var body = document.getElementById('alertasBody');
  var inp  = document.getElementById('alertasDias');
  if (inp) inp.value = _diasCierre();
  if (body) {
    var atencion = a.total ?
      (_seccion('⏰ Retrasados', a.retrasados, function(s){ return 'Debía salir el ' + _esc(s.date) + ' · ' + _esc(s.status); }) +
       _seccion('📋 Shalom sin guía', a.sinGuia, function(){ return 'Falta guía o código — no se puede seguir'; }) +
       _seccion('💰 Sin finalizar', a.sinCerrar, function(s){ return 'Enviado el ' + _esc(s.date) + ' · ' + _esc(s.status); }))
      : '<div class="al-ok">✅<br>Todo en orden<br><span style="font-size:11.5px">No hay pedidos retrasados ni datos faltantes.</span></div>';
    body.innerHTML = atencion + _sistemaHtml() + _eventosHtml();
  }
  global.openOverlay('alertasOverlay');
};

/* Botones del bloque de sistema — reusan las funciones del panel. */
Alertas.sincronizar = function(btn){
  if (typeof global.syncShalomWebNow !== 'function') return;
  if (btn) { btn.disabled = true; btn.textContent = '⏳…'; }
  global.closeOverlay('alertasOverlay');
  global.goPage && global.goPage('configurar');
  global.syncShalomWebNow();
};
Alertas.reprogramar = async function(btn){
  if (typeof global.reprogramarColaShalom !== 'function') return;
  if (btn) { btn.disabled = true; btn.textContent = '⏳…'; }
  var r = await global.reprogramarColaShalom();
  if (r && r.ok && global.toast) global.toast('✅ Cola: ' + r.enCola + ' pedidos');
  Alertas.abrir();
  Alertas.refrescar();
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
