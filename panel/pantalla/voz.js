(function () {
  'use strict';

  const LANG = 'es-PE';
  const SALTO_LIBRE = false;
  const HABLAR = true;

  const _S      = () => (window.S || {});
  const _ships  = () => (_S().shipments || []);
  const _labels = () => (typeof allStatuses === 'function' ? allStatuses() : (_S().labels || []));
  const _save   = (id) => { try { if (typeof save === 'function') save(id); } catch (e) {} };
  const _render = () => { try { if (typeof render === 'function') render(); } catch (e) {} };
  const _toast  = (m) => { try { if (typeof toast === 'function') toast(m); else console.log(m); } catch (e) {} };

  const norm = (t) => String(t || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

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

  function buscarPedidos(txt) {
    const q = norm(txt);
    if (!q) return [];
    return _ships().filter((s) => norm(s.name).includes(q));
  }

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
    for (const l of _labels()) { if (norm(l) === q) return l; }
    if (ALIAS_ETIQUETA[q]) return ALIAS_ETIQUETA[q];
    for (const l of _labels()) { if (norm(l).includes(q) || q.includes(norm(l))) return l; }
    return null;
  }

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

    s.status = destino;
    if (window.Seleccion) Seleccion.quitar(s.id);
    _save(s.id);
    _render();
    decir(s.name + ' ahora está en ' + destino);
  }

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

  function estadoDe(nombre) {
    const m = buscarPedidos(nombre);
    if (m.length === 0) { decir('No encontré a ' + nombre); return; }
    if (m.length > 1) { decir('Encontré ' + m.length + ' pedidos de ' + nombre + '. Sé más específico.'); return; }
    decir(m[0].name + ' está en ' + m[0].status);
  }

  function buscar(txt) {
    const inp = document.getElementById('fSearch');
    if (inp) { inp.value = txt; _render(); decir('Buscando ' + txt); }
    else decir('No encontré el buscador');
  }

  function whatsapp(nombre) {
    const m = buscarPedidos(nombre);
    if (m.length === 0) { decir('No encontré a ' + nombre); return; }
    if (m.length > 1) { decir('Hay ' + m.length + ' pedidos de ' + nombre + '. Sé más específico.'); return; }
    const s = m[0];
    if (!s.phone) { decir(s.name + ' no tiene teléfono'); return; }
    if (typeof waOpen === 'function') { waOpen(s.phone, ''); decir('Abriendo WhatsApp de ' + s.name); }
    else decir('WhatsApp no disponible');
  }

  function nuevoPedido() {
    if (typeof openForm === 'function') { openForm(null); decir('Nuevo pedido'); }
    else decir('No pude abrir el formulario');
  }

  function ayudaVoz() {
    decir('Puedes decir: buscar nombre. Cuántos nuevos. Estado de nombre. ' +
          'Marca a nombre como enviado. WhatsApp a nombre.');
  }

  const LS_KEY = 'vozFrasesPersonalizadas';
  function cargarFrases() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch (e) { return []; }
  }
  function guardarFrases(arr) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(arr)); } catch (e) {}
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function ejecutar(accion, capturado, argFijo) {
    capturado = (capturado || '').trim();
    argFijo = (argFijo || '').trim();
    switch (accion) {
      case 'buscar':   buscar(argFijo || capturado); return true;
      case 'contar':   contar(argFijo || capturado); return true;
      case 'estado':   estadoDe(argFijo || capturado); return true;
      case 'whatsapp': whatsapp(argFijo || capturado); return true;
      case 'etiqueta': cambiarEtiqueta(capturado, argFijo); return true;
      case 'nuevo':    nuevoPedido(); return true;
      case 'ayuda':    ayudaVoz(); return true;
      default: return false;
    }
  }

  function matchPersonalizada(t) {
    const reglas = cargarFrases();
    for (let i = 0; i < reglas.length; i++) {
      const r = reglas[i];
      const f = norm(r.frase);
      if (!f) continue;
      if (t === f) { ejecutar(r.accion, '', r.arg); return true; }
      if (t.indexOf(f + ' ') === 0) { ejecutar(r.accion, t.slice(f.length).trim(), r.arg); return true; }
    }
    return false;
  }

  function interpretar(texto) {
    const t = norm(texto);
    let mm;

    if (matchPersonalizada(t)) return;

    mm = t.match(/^(?:marca|cambia|pon|mueve|pasa)\s+(?:a\s+)?(.+?)\s+(?:como|a|en|al)\s+(.+)$/);
    if (mm) { cambiarEtiqueta(mm[1], mm[2]); return; }

    mm = t.match(/^(?:estado|status)\s+(?:de\s+)?(.+)$/);
    if (mm) { estadoDe(mm[1]); return; }

    mm = t.match(/^(?:cuantos|cuantas|cuenta)\s+(.+)$/);
    if (mm) { contar(mm[1]); return; }

    mm = t.match(/^(?:whatsapp|wasap|wasa|whats|wsp)\s+(?:a\s+|de\s+)?(.+)$/);
    if (mm) { whatsapp(mm[1]); return; }

    mm = t.match(/^(?:buscar|busca|encuentra)\s+(?:a\s+)?(.+)$/);
    if (mm) { buscar(mm[1]); return; }

    if (/^(nuevo pedido|nuevo envio|nuevo|crear pedido|crear envio|agregar pedido|crear nuevo)$/.test(t)) {
      nuevoPedido(); return;
    }

    if (/^(ayuda|que puedo decir|comandos)/.test(t)) { ayudaVoz(); return; }

    decir('No entendí. Di ayuda para ver los comandos.');
  }

  let rec = null;
  let escuchando = false;

  function getRec() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return null;
    const r = new SR();
    r.lang = LANG;
    r.continuous = false;
    r.interimResults = false;
    r.maxAlternatives = 1;
    return r;
  }

  function setBtn(on) {
    const b = document.getElementById('voiceBtn');
    if (b) {
      b.textContent = on ? '🔴' : '🎤';
      b.style.background = on ? 'rgba(247,129,102,.20)' : 'transparent';
      b.style.animation = on ? 'vozBlink 0.8s steps(1) infinite' : 'none';
      b.title = on ? 'Escuchando… (toca para detener)' : 'Jarvy — asistente de voz';
    }
  }

  function _motivoSinVoz() {
    if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) {
      return '⚠️ Este navegador no soporta dictado. Usa Chrome o Edge.';
    }
    if (navigator.brave) {
      return '🦁 Brave desactiva el dictado por privacidad. Abre el panel en Chrome o Edge.';
    }
    return null;
  }

  function toggle() {
    if (escuchando) { try { rec && rec.stop(); } catch (e) {} return; }
    const motivo = _motivoSinVoz();
    if (motivo) { _toast(motivo); return; }
    rec = getRec();
    if (!rec) { _toast('⚠️ Tu navegador no soporta reconocimiento de voz'); return; }
    escuchando = true;
    setBtn(true);
    rec.onresult = (ev) => {
      const txt = (ev.results[0] && ev.results[0][0] && ev.results[0][0].transcript) || '';
      _toast('🎤 ' + txt);
      try { interpretar(txt); } catch (e) { decir('Ocurrió un error'); }
    };
    rec.onerror = (ev) => {
      if (ev.error === 'no-speech') return;
      if (ev.error === 'network' || ev.error === 'service-not-allowed') {
        _toast('⚠️ El dictado no está disponible en este navegador. Usa Chrome o Edge.');
      } else if (ev.error === 'not-allowed') {
        _toast('🎤 Permite el micrófono para dictar.');
      } else { _toast('⚠️ Voz: ' + ev.error); }
    };
    rec.onend = () => { escuchando = false; setBtn(false); };
    try { rec.start(); } catch (e) { escuchando = false; setBtn(false); }
  }

  let taps = 0, tapTimer = null;
  function onTap() {
    taps++;
    clearTimeout(tapTimer);
    if (taps >= 3) {
      taps = 0;
      if (escuchando) { try { rec && rec.stop(); } catch (e) {} }
      abrirAyuda();
      return;
    }
    tapTimer = setTimeout(() => {
      const n = taps; taps = 0;
      if (n === 1) toggle();
    }, 320);
  }

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
          'Toca el 🎤, habla <b>una frase</b> y se apaga solo. Cuando grabe, el botón pasa a <b>🔴 y parpadea</b>. ' +
          'Triple toque sobre el 🎤 = abrir esta ayuda.</div>' +
        cmd('🔍 Buscar', '“buscar Daniel”') +
        cmd('🔢 Contar', '“cuántos nuevos”, “cuántos enviados”') +
        cmd('📊 Ver estado', '“estado de Daniel”') +
        cmd('🏷️ Cambiar etiqueta', '“marca a Daniel como enviado” — avanza o retrocede 1 paso') +
        cmd('💬 WhatsApp', '“whatsapp a Daniel”') +
        cmd('🆕 Nuevo pedido', '“nuevo pedido” — abre el formulario (botón +)') +
        cmd('❓ Ayuda por voz', '“ayuda”') +

        '<div style="border-top:1px solid var(--bd,#30363d);margin:14px 0 10px;padding-top:12px;' +
          'font-size:15px;font-weight:800">⭐ Mis frases</div>' +
        '<div style="font-size:12px;color:var(--text2,#8b949e);line-height:1.6;margin-bottom:10px">' +
          'Define tu palabra y qué acción ya programada ejecuta. Si dejas el <b>dato fijo</b> vacío, ' +
          'usa lo que digas después de tu palabra. Ej: “abre” + Buscar → dices “abre Daniel”. ' +
          'O “resumen” + Contar + dato “nuevos” → dices “resumen”.</div>' +
        '<div id="vozMisFrases"></div>' +
        '<div style="display:flex;flex-direction:column;gap:8px;background:var(--bg3,#0d1117);' +
          'border:1px solid var(--bd,#30363d);border-radius:10px;padding:10px 12px;margin-top:6px">' +
          '<input id="vozFraseInp" placeholder="Lo que dices (ej: abre)" ' +
            'style="' + inpCss() + '"/>' +
          '<select id="vozAccionSel" style="' + inpCss() + '">' +
            '<option value="buscar">Buscar</option>' +
            '<option value="contar">Contar</option>' +
            '<option value="estado">Ver estado</option>' +
            '<option value="whatsapp">WhatsApp</option>' +
            '<option value="etiqueta">Cambiar etiqueta a…</option>' +
            '<option value="nuevo">Nuevo pedido</option>' +
            '<option value="ayuda">Ayuda</option>' +
          '</select>' +
          '<input id="vozArgInp" placeholder="Dato fijo opcional (ej: nuevos / enviado)" ' +
            'style="' + inpCss() + '"/>' +
          '<button onclick="window.Voz.agregarFrase()" style="background:var(--ac,#388bfd);' +
            'border:none;border-radius:8px;color:#fff;font-weight:700;font-size:13px;' +
            'padding:9px;cursor:pointer">➕ Agregar frase</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
  }
  function inpCss() {
    return 'background:var(--bg2,#161b22);border:1px solid var(--bd,#30363d);border-radius:8px;' +
      'color:var(--text,#e6edf3);font-size:13px;padding:9px 10px;width:100%;box-sizing:border-box;' +
      'font-family:inherit';
  }
  function renderFrases() {
    const cont = document.getElementById('vozMisFrases');
    if (!cont) return;
    const reglas = cargarFrases();
    if (reglas.length === 0) {
      cont.innerHTML = '<div style="font-size:12px;color:var(--text2,#8b949e);margin-bottom:8px">' +
        'Aún no tienes frases personalizadas.</div>';
      return;
    }
    cont.innerHTML = reglas.map(function (r, i) {
      const det = r.arg
        ? (' → ' + esc(r.accion) + ' “' + esc(r.arg) + '”')
        : (' → ' + esc(r.accion) + ' (lo que sigas diciendo)');
      return '<div style="display:flex;align-items:center;gap:8px;background:var(--bg3,#0d1117);' +
        'border:1px solid var(--bd,#30363d);border-radius:10px;padding:8px 10px;margin-bottom:6px">' +
        '<div style="flex:1;font-size:12px"><b>“' + esc(r.frase) + '”</b>' +
        '<span style="color:var(--text2,#8b949e)">' + det + '</span></div>' +
        '<button onclick="window.Voz.borrarFrase(' + i + ')" style="background:none;' +
        'border:1px solid var(--bd,#30363d);border-radius:8px;color:#f78166;cursor:pointer;' +
        'padding:2px 8px">✕</button></div>';
    }).join('');
  }
  function agregarFrase() {
    const fr = document.getElementById('vozFraseInp');
    const ac = document.getElementById('vozAccionSel');
    const ar = document.getElementById('vozArgInp');
    if (!fr || !ac) return;
    const frase = (fr.value || '').trim();
    if (!frase) { _toast('Escribe la frase'); return; }
    if (ac.value === 'etiqueta' && !(ar && ar.value.trim())) {
      _toast('Para “Cambiar etiqueta”, pon la etiqueta destino en el dato fijo'); return;
    }
    const reglas = cargarFrases();
    reglas.push({ frase: frase, accion: ac.value, arg: (ar && ar.value || '').trim() });
    guardarFrases(reglas);
    fr.value = ''; if (ar) ar.value = '';
    renderFrases();
    _toast('✅ Frase agregada');
  }
  function borrarFrase(i) {
    const reglas = cargarFrases();
    reglas.splice(i, 1);
    guardarFrases(reglas);
    renderFrases();
  }
  function cmd(titulo, ejemplo) {
    return '<div style="background:var(--bg3,#0d1117);border:1px solid var(--bd,#30363d);' +
      'border-radius:10px;padding:10px 12px;margin-bottom:8px">' +
      '<div style="font-size:13px;font-weight:700;margin-bottom:3px">' + titulo + '</div>' +
      '<div style="font-size:12px;color:var(--text2,#8b949e)">' + ejemplo + '</div></div>';
  }
  function abrirAyuda() { ensureAyuda(); renderFrases(); const o = document.getElementById('vozAyuda'); if (o) o.style.display = 'flex'; }
  function cerrarAyuda() { const o = document.getElementById('vozAyuda'); if (o) o.style.display = 'none'; }

  function ensureEstilos() {
    if (document.getElementById('vozEstilos')) return;
    const st = document.createElement('style');
    st.id = 'vozEstilos';
    st.textContent =
      '@keyframes vozBlink{0%,100%{opacity:1}50%{opacity:.25}}';
    document.head.appendChild(st);
  }

  function montarBoton() {
    ensureEstilos();
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
      dot.parentNode.insertBefore(b, dot);
    } else {
      b.style.cssText += ';position:fixed;top:12px;right:120px;z-index:99999';
      document.body.appendChild(b);
    }
  }

  if (document.readyState !== 'complete') {
    document.addEventListener('DOMContentLoaded', montarBoton);
  } else {
    montarBoton();
  }

  window.Voz = {
    toggle: toggle, decir: decir, interpretar: interpretar,
    montarBoton: montarBoton, abrirAyuda: abrirAyuda, cerrarAyuda: cerrarAyuda,
    agregarFrase: agregarFrase, borrarFrase: borrarFrase, renderFrases: renderFrases
  };
})();
