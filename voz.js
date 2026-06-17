/* voz.js — Asistente de voz "Jarvy" (Fase 1: push-to-talk)
   ────────────────────────────────────────────────────────────────────────
   AISLADO: no toca Shalom, delivery, tracking ni la lógica del panel.
   Solo LEE el estado local `window.S` (ya está en memoria) y, cuando hay una
   ACCIÓN, llama funciones que YA existen en index.html (save, render, waOpen).

   CERO lecturas a Firebase: todas las consultas (buscar, contar, estado) se
   resuelven sobre window.S en memoria. La ÚNICA escritura a Firebase ocurre al
   cambiar una etiqueta, y usa save(idPedido) → sube SOLO ese pedido.

   Push-to-talk: el micrófono NO queda encendido. Tocas el botón, escucha UNA
   frase, ejecuta y se apaga. Sin polling, sin MutationObserver, sin mic activo.
   ──────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  // ── Configuración rápida ────────────────────────────────────────────────
  const LANG = 'es-PE';        // idioma del reconocimiento de voz
  const SALTO_LIBRE = false;   // false = solo avanzar/retroceder 1 paso (SEGURO).
                               // true  = permite saltar a cualquier etiqueta.
  const HABLAR = true;         // true = Jarvy responde por voz (síntesis)

  // ── Helpers seguros hacia el panel (nunca lanzan) ───────────────────────
  const _S      = () => (window.S || {});
  const _ships  = () => (_S().shipments || []);
  const _labels = () => (typeof allStatuses === 'function' ? allStatuses() : (_S().labels || []));
  const _save   = (id) => { try { if (typeof save === 'function') save(id); } catch (e) {} };
  const _render = () => { try { if (typeof render === 'function') render(); } catch (e) {} };
  const _toast  = (m) => { try { if (typeof toast === 'function') toast(m); else console.log(m); } catch (e) {} };

  // normaliza: minúsculas y sin acentos (para comparar nombres y etiquetas)
  const norm = (t) => String(t || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

  // ── Voz de salida ───────────────────────────────────────────────────────
  function decir(texto) {
    _toast('🗣️ ' + texto);
    if (!HABLAR) return;
    try {
      if (!('speechSynthesis' in window)) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(texto);
      u.lang = 'es-ES';
      u.rate = 1.05;
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }

  // ── Búsqueda de pedidos por nombre (substring, sin acentos) ─────────────
  function buscarPedidos(txt) {
    const q = norm(txt);
    if (!q) return [];
    return _ships().filter((s) => norm(s.name).includes(q));
  }

  // ── Resolver etiqueta hablada → etiqueta real del sistema ───────────────
  const ALIAS_ETIQUETA = {
    'nuevo': 'NUEVO PEDIDO', 'nuevo pedido': 'NUEVO PEDIDO',
    'en proceso': 'EN PROCESO', 'proceso': 'EN PROCESO',
    'por alistar': 'POR ALISTAR', 'alistar': 'POR ALISTAR',
    'alistado': 'ALISTADO',
    'enviado': 'ENVIADO', 'enviar': 'ENVIADO',
    'llego a destino': 'LLEGÓ A DESTINO', 'destino': 'LLEGÓ A DESTINO', 'llego': 'LLEGÓ A DESTINO',
    'pendiente de pago': 'PENDIENTE DE PAGO', 'pendiente': 'PENDIENTE DE PAGO', 'pago': 'PENDIENTE DE PAGO',
    'finalizado': 'FINALIZADO', 'entregado': 'FINALIZADO', 'terminado': 'FINALIZADO'
  };
  function resolverEtiqueta(txt) {
    const q = norm(txt);
    // 1) match exacto contra etiquetas reales (incluye personalizadas)
    for (const l of _labels()) { if (norm(l) === q) return l; }
    // 2) alias hablados comunes
    if (ALIAS_ETIQUETA[q]) return ALIAS_ETIQUETA[q];
    // 3) match parcial contra etiquetas reales
    for (const l of _labels()) { if (norm(l).includes(q) || q.includes(norm(l))) return l; }
    return null;
  }

  // ── ACCIÓN: cambiar etiqueta (con guardia de 1 paso, igual que el panel) ─
  function cambiarEtiqueta(nombre, etiquetaTxt) {
    const matches = buscarPedidos(nombre);
    if (matches.length === 0) { decir('No encontré ningún pedido de ' + nombre); return; }
    if (matches.length > 1) {
      const inp = document.getElementById('fSearch');
      if (inp) { inp.value = nombre; _render(); }
      decir('Encontré ' + matches.length + ' pedidos de ' + nombre + '. Sé más específico.');
      return;
    }
    const s = matches[0];
    const destino = resolverEtiqueta(etiquetaTxt);
    if (!destino) { decir('No reconocí la etiqueta ' + etiquetaTxt); return; }
    if (s.status === destino) { decir(s.name + ' ya está en ' + destino); return; }

    const all = _labels();
    const cur = all.indexOf(s.status);
    const tgt = all.indexOf(destino);
    const canFwd  = tgt === cur + 1;
    const canBck  = tgt === cur - 1;
    const canJump = all[cur] === 'NUEVO PEDIDO' && destino === 'POR ALISTAR';
    const ok = SALTO_LIBRE || canFwd || canBck || canJump;
    if (!ok) {
      decir('No puedo saltar de ' + s.status + ' a ' + destino + '. Solo avanzo o retrocedo un paso.');
      return;
    }

    // Aplicar — mismo patrón que applyStatus() del panel: incremental
    s.status = destino;
    s.sel = false;
    _save(s.id);   // ← SOLO este pedido sube a Firebase
    _render();
    decir(s.name + ' ahora está en ' + destino);
  }

  // ── CONSULTA: contar por etiqueta (cero Firebase) ───────────────────────
  function contar(etiquetaTxt) {
    const etiqueta = resolverEtiqueta(etiquetaTxt);
    if (!etiqueta) {
      const q = norm(etiquetaTxt);
      if (q.includes('pendiente') || q.includes('nuevo') || q.includes('proceso')) {
        const lista = _ships().filter((s) => s.status === 'NUEVO PEDIDO' || s.status === 'EN PROCESO');
        decir('Hay ' + lista.length + ' pedidos nuevos o en proceso');
        return;
      }
      decir('No reconocí esa etiqueta');
      return;
    }
    const lista = _ships().filter((s) => s.status === etiqueta);
    decir('Hay ' + lista.length + ' pedidos en ' + etiqueta);
  }

  // ── CONSULTA: estado de un pedido (cero Firebase) ───────────────────────
  function estadoDe(nombre) {
    const m = buscarPedidos(nombre);
    if (m.length === 0) { decir('No encontré a ' + nombre); return; }
    if (m.length > 1) { decir('Encontré ' + m.length + ' pedidos de ' + nombre + '. Sé más específico.'); return; }
    decir(m[0].name + ' está en ' + m[0].status);
  }

  // ── CONSULTA: buscar (llena el buscador del panel, cero Firebase) ───────
  function buscar(txt) {
    const inp = document.getElementById('fSearch');
    if (inp) { inp.value = txt; _render(); decir('Buscando ' + txt); }
    else decir('No encontré el buscador');
  }

  // ── ACCIÓN: abrir WhatsApp del pedido (usa waOpen existente) ────────────
  function whatsapp(nombre) {
    const m = buscarPedidos(nombre);
    if (m.length === 0) { decir('No encontré a ' + nombre); return; }
    if (m.length > 1) { decir('Hay ' + m.length + ' pedidos de ' + nombre + '. Sé más específico.'); return; }
    const s = m[0];
    if (!s.phone) { decir(s.name + ' no tiene teléfono'); return; }
    if (typeof waOpen === 'function') { waOpen(s.phone, ''); decir('Abriendo WhatsApp de ' + s.name); }
    else decir('WhatsApp no disponible');
  }

  // ── Ayuda hablada ───────────────────────────────────────────────────────
  function ayudaVoz() {
    decir('Puedes decir: buscar nombre. Cuántos nuevos. Estado de nombre. ' +
          'Marca a nombre como enviado. WhatsApp a nombre.');
  }

  // ── Interpretar el texto reconocido → comando ───────────────────────────
  function interpretar(texto) {
    const t = norm(texto);
    let mm;

    // Cambiar etiqueta: "marca a juan como enviado" / "cambia a juan a enviado" / "pon a juan en enviado"
    mm = t.match(/^(?:marca|cambia|pon|mueve|pasa)\s+(?:a\s+)?(.+?)\s+(?:como|a|en|al)\s+(.+)$/);
    if (mm) { cambiarEtiqueta(mm[1], mm[2]); return; }

    // Estado de X
    mm = t.match(/^(?:estado|status)\s+(?:de\s+)?(.+)$/);
    if (mm) { estadoDe(mm[1]); return; }

    // Cuántos X
    mm = t.match(/^(?:cuantos|cuantas|cuenta)\s+(.+)$/);
    if (mm) { contar(mm[1]); return; }

    // WhatsApp a X
    mm = t.match(/^(?:whatsapp|wasap|wasa|whats|wsp)\s+(?:a\s+|de\s+)?(.+)$/);
    if (mm) { whatsapp(mm[1]); return; }

    // Buscar X
    mm = t.match(/^(?:buscar|busca|encuentra)\s+(?:a\s+)?(.+)$/);
    if (mm) { buscar(mm[1]); return; }

    // Ayuda
    if (/^(ayuda|que puedo decir|comandos)/.test(t)) { ayudaVoz(); return; }

    decir('No entendí. Di ayuda para ver los comandos.');
  }

  // ── Motor de reconocimiento (push-to-talk) ──────────────────────────────
  let rec = null;
  let escuchando = false;

  function getRec() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    const r = new SR();
    r.lang = LANG;
    r.continuous = false;     // una sola frase, luego se apaga
    r.interimResults = false;
    r.maxAlternatives = 1;
    return r;
  }

  // ── Indicador de estado: grabando vs inactivo ──────────────────────────
  // El botón cambia 🎤→🔴 con anillo pulsante, y aparece una píldora
  // "🔴 Escuchando…" para que sea inequívoco cuándo está grabando.
  function setBtn(on) {
    const b = document.getElementById('voiceBtn');
    if (b) {
      b.textContent = on ? '🔴' : '🎤';
      b.style.background = on ? 'rgba(247,129,102,.20)' : 'transparent';
      b.style.animation = on ? 'vozPulse 1.1s infinite' : 'none';
      b.title = on ? 'Escuchando… (toca para detener)' : 'Jarvy — asistente de voz';
    }
    const pill = document.getElementById('vozStatus');
    if (pill) pill.style.display = on ? 'flex' : 'none';
  }

  function toggle() {
    if (escuchando) { try { rec && rec.stop(); } catch (e) {} return; }
    rec = getRec();
    if (!rec) { _toast('⚠️ Tu navegador no soporta reconocimiento de voz'); return; }
    escuchando = true;
    setBtn(true);
    rec.onresult = (ev) => {
      const txt = (ev.results[0] && ev.results[0][0] && ev.results[0][0].transcript) || '';
      _toast('🎤 ' + txt);
      try { interpretar(txt); } catch (e) { decir('Ocurrió un error'); }
    };
    rec.onerror = (ev) => { if (ev.error !== 'no-speech') _toast('⚠️ Voz: ' + ev.error); };
    rec.onend = () => { escuchando = false; setBtn(false); };
    try { rec.start(); } catch (e) { escuchando = false; setBtn(false); }
  }

  // ── Triple toque sobre el 🎤 → abre la ayuda ────────────────────────────
  let taps = 0, tapTimer = null;
  function onTap() {
    taps++;
    clearTimeout(tapTimer);
    if (taps >= 3) {                      // 3 toques seguidos → ayuda
      taps = 0;
      if (escuchando) { try { rec && rec.stop(); } catch (e) {} }
      abrirAyuda();
      return;
    }
    tapTimer = setTimeout(() => {          // 1 toque → grabar / detener
      const n = taps; taps = 0;
      if (n === 1) toggle();
    }, 320);
  }

  // ── Panel de ayuda (se inyecta solo, no toca index.html) ────────────────
  function ensureAyuda() {
    if (document.getElementById('vozAyuda')) return;
    const ov = document.createElement('div');
    ov.id = 'vozAyuda';
    ov.style.cssText = 'display:none;position:fixed;inset:0;z-index:100000;' +
      'background:rgba(0,0,0,.6);align-items:center;justify-content:center;padding:18px';
    ov.addEventListener('click', (e) => { if (e.target === ov) cerrarAyuda(); });
    ov.innerHTML =
      '<div style="background:var(--bg2,#161b22);border:1px solid var(--bd,#30363d);' +
        'border-radius:14px;max-width:420px;width:100%;max-height:82vh;overflow:auto;' +
        'padding:18px;color:var(--text,#e6edf3);font-family:inherit">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">' +
          '<div style="font-size:18px;font-weight:800;flex:1">🎤 Jarvy — Asistente de voz</div>' +
          '<button onclick="window.Voz.cerrarAyuda()" style="background:none;border:1px solid var(--bd,#30363d);' +
            'border-radius:8px;color:var(--text,#e6edf3);font-size:16px;cursor:pointer;padding:2px 9px">✕</button>' +
        '</div>' +
        '<div style="font-size:12px;color:var(--text2,#8b949e);line-height:1.6;margin-bottom:14px">' +
          'Toca el 🎤, habla <b>una frase</b> y se apaga solo. Cuando grabe verás <b>🔴 Escuchando…</b>. ' +
          'Triple toque sobre el 🎤 = abrir esta ayuda.</div>' +
        cmd('🔍 Buscar', '“buscar Daniel”') +
        cmd('🔢 Contar', '“cuántos nuevos”, “cuántos enviados”') +
        cmd('📊 Ver estado', '“estado de Daniel”') +
        cmd('🏷️ Cambiar etiqueta', '“marca a Daniel como enviado” — avanza o retrocede 1 paso') +
        cmd('💬 WhatsApp', '“whatsapp a Daniel”') +
        cmd('❓ Ayuda por voz', '“ayuda”') +
      '</div>';
    document.body.appendChild(ov);
  }
  function cmd(titulo, ejemplo) {
    return '<div style="background:var(--bg3,#0d1117);border:1px solid var(--bd,#30363d);' +
      'border-radius:10px;padding:10px 12px;margin-bottom:8px">' +
      '<div style="font-size:13px;font-weight:700;margin-bottom:3px">' + titulo + '</div>' +
      '<div style="font-size:12px;color:var(--text2,#8b949e)">' + ejemplo + '</div></div>';
  }
  function abrirAyuda() { ensureAyuda(); const o = document.getElementById('vozAyuda'); if (o) o.style.display = 'flex'; }
  function cerrarAyuda() { const o = document.getElementById('vozAyuda'); if (o) o.style.display = 'none'; }

  // ── Estilos inyectados (anillo pulsante + píldora de estado) ────────────
  function ensureEstilos() {
    if (document.getElementById('vozEstilos')) return;
    const st = document.createElement('style');
    st.id = 'vozEstilos';
    st.textContent =
      '@keyframes vozPulse{0%{box-shadow:0 0 0 0 rgba(247,129,102,.55)}' +
      '70%{box-shadow:0 0 0 7px rgba(247,129,102,0)}100%{box-shadow:0 0 0 0 rgba(247,129,102,0)}}';
    document.head.appendChild(st);
  }
  function ensurePill() {
    if (document.getElementById('vozStatus')) return;
    const p = document.createElement('div');
    p.id = 'vozStatus';
    p.style.cssText = 'display:none;position:fixed;top:10px;left:50%;transform:translateX(-50%);' +
      'z-index:100001;align-items:center;gap:7px;background:rgba(247,129,102,.16);' +
      'border:1px solid rgba(247,129,102,.5);color:#f78166;border-radius:20px;' +
      'padding:6px 14px;font-size:13px;font-weight:700;font-family:inherit;' +
      'animation:vozPulse 1.1s infinite';
    p.textContent = '🔴 Escuchando…';
    document.body.appendChild(p);
  }

  // ── Auto-montaje del botón 🎤 (antes del punto verde #fbDot) ────────────
  // No necesitas editar el header a mano: el botón se crea solo.
  // Idempotente: si ya existe #voiceBtn no lo duplica.
  function montarBoton() {
    ensureEstilos();
    ensurePill();
    if (document.getElementById('voiceBtn')) return;
    const dot = document.getElementById('fbDot');
    const b = document.createElement('button');
    b.id = 'voiceBtn';
    b.type = 'button';
    b.title = 'Jarvy — asistente de voz';
    b.textContent = '🎤';
    b.style.cssText = 'background:transparent;border:1px solid var(--bd);border-radius:8px;' +
      'font-size:14px;line-height:1;padding:3px 6px;cursor:pointer;flex-shrink:0;color:inherit';
    b.addEventListener('click', onTap);
    if (dot && dot.parentNode) {
      dot.parentNode.insertBefore(b, dot); // ← justo antes del punto verde
    } else {
      // Respaldo: si no encuentra el punto verde, botón flotante arriba a la derecha
      b.style.cssText += ';position:fixed;top:12px;right:120px;z-index:99999';
      document.body.appendChild(b);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', montarBoton);
  } else {
    montarBoton();
  }

  // API pública
  window.Voz = {
    toggle: toggle, decir: decir, interpretar: interpretar,
    montarBoton: montarBoton, abrirAyuda: abrirAyuda, cerrarAyuda: cerrarAyuda
  };
})();
