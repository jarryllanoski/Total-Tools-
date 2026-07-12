/**
 * ayuda.js — Módulo de Ayuda y Documentación centralizada para Total Tools
 *
 * OBJETIVO: que cualquier usuario entienda cómo funciona cada módulo sin
 * depender de memoria ni capacitación. Toda la documentación vive aquí, en
 * un solo lugar, y se muestra con el mismo formato visual del Manual Shalom.
 *
 * USO:
 *   Ayuda.abrir('envios')   → abre la ayuda del módulo "Envíos"
 *   Ayuda.abrir('config')   → abre la ayuda de "Configuración"
 *   ... etc. (ver claves en DOCS abajo)
 *
 * Para agregar/editar ayuda: solo edita el objeto DOCS. No hay que tocar
 * ninguna pantalla — los botones 📖 Ayuda llaman a Ayuda.abrir('clave').
 *
 * DEPENDENCIAS: ninguna obligatoria. Usa document y (si existe) el estilo
 * .trk-manual-step de tracking.js; si no está, inyecta su propio CSS.
 *
 * NO MODIFICA NADA EXISTENTE. Se auto-registra como window.Ayuda.
 * Para desactivar: quitar <script src="ayuda.js"> del index.html
 *
 * Última actualización: 2026-06
 */
(function(){
  'use strict';

  var Ayuda = {};
  window.Ayuda = Ayuda;

  var ACTUALIZADO = '2026-06-14';

  /* ══════════════════════════════════════════════════════════════════
     DOCUMENTACIÓN CENTRALIZADA
     Cada entrada: { titulo, icono, pasos:[], faq:[], tips:[] }
     - pasos: lista numerada (círculos azules, como el Manual Shalom)
     - faq:   preguntas frecuentes [{q, a}]
     - tips:  recomendaciones (lista con viñeta)
     Usa <b>...</b> para resaltar.
  ══════════════════════════════════════════════════════════════════ */
  var DOCS = {

    envios: {
      titulo: 'Envíos (Panel principal)',
      icono: '🚚',
      pasos: [
        'El panel muestra todos tus pedidos agrupados por courier.',
        'Cada tarjeta tiene el nombre, teléfono, dirección y estado del pedido.',
        'Usa el buscador de arriba para filtrar por nombre, teléfono o dirección.',
        'Toca los chips de estado (NUEVO PEDIDO, EN PROCESO, etc.) para ver solo esos pedidos.',
        'El botón ✏️ edita el pedido; el 🗑️ lo manda a la papelera.',
        'El botón 💬 abre WhatsApp con el cliente.'
      ],
      faq: [
        {q:'¿Cómo cambio el estado de un pedido?', a:'Toca la etiqueta de estado grande de la tarjeta y elige el nuevo estado.'},
        {q:'¿Puedo seleccionar varios pedidos a la vez?', a:'Sí, usa las casillas de cada tarjeta para aplicar un cambio a varios.'}
      ],
      tips: [
        'Los pedidos finalizados dejan de consultar Shalom automáticamente para ahorrar recursos.',
        'Si un dato no aparece, revisa que el pedido no esté en la papelera.'
      ]
    },

    tracking: {
      titulo: 'Tracking Shalom',
      icono: '📦',
      pasos: [
        'El cliente elige agencia Shalom en el formulario.',
        'El pedido llega al panel como <b>NUEVO PEDIDO</b>.',
        'Edita el pedido y coloca número de orden y código.',
        'Guarda tracking → el pedido pasa automáticamente a <b>ENVIADO</b>.',
        'Presiona ⟳ <b>Consultar</b> en cualquier momento para actualizar al instante.',
        'El sistema consulta Shalom automáticamente cada <b>12 horas</b> (en tránsito) y cada <b>24 horas</b> al llegar a destino. Al entregarse deja de consultar.',
        'Shalom dice "En tránsito" → etiqueta <b>ENVIADO</b>.',
        'Shalom dice "En destino" → cambia a <b>LLEGÓ A DESTINO</b>.',
        'Si tiene saldo pendiente → <b>PENDIENTE DE PAGO</b>.',
        'Shalom dice "Entregado" → cambia a <b>FINALIZADO</b>.'
      ],
      faq: [
        {q:'¿Por qué no se actualiza solo?', a:'El auto-tracking corre cada 12-24h. Si quieres ver el estado al instante, usa ⟳ Consultar.'},
        {q:'¿Qué pasa si Shalom no responde?', a:'La consulta se cancela a los 12 segundos y el sistema sigue con el siguiente pedido, sin trabarse.'}
      ],
      tips: [
        'El código de la guía no distingue mayúsculas: se convierte solo.',
        'Si cambias la guía de un pedido, su estado de tracking se reinicia.'
      ]
    },

    nuevoPedido: {
      titulo: 'Nuevo Pedido',
      icono: '➕',
      pasos: [
        'Toca el botón de nuevo pedido para abrir el formulario.',
        'Completa nombre, teléfono y dirección del cliente.',
        'Elige el courier (Shalom, Olva, Delivery, etc.).',
        'Agrega costo y notas si lo necesitas.',
        'Guarda → el pedido aparece en el panel como NUEVO PEDIDO.'
      ],
      faq: [
        {q:'¿Puedo editarlo después?', a:'Sí, con el botón ✏️ de la tarjeta.'},
        {q:'¿El teléfono es obligatorio?', a:'Es muy recomendable, porque se usa para los botones de WhatsApp y para que el cliente reciba su tracking.'}
      ],
      tips: [
        'Solo se guarda ese pedido nuevo, no toda la base — es rápido y eficiente.'
      ]
    },

    nuevoEnvio: {
      titulo: 'Nuevo Envío',
      icono: '➕',
      pasos: [
        '📲 ¿Tu cliente ya pidió antes y te llegó un nuevo pedido? Pega el mensaje de su pedido anterior en la barra de arriba y toca "Rellenar": se completan Nombre, Teléfono, DNI, Dirección, Courier, Fecha y Notas. Es opcional.',
        'Revisa y corrige los campos si hace falta.',
        'El courier viene en SHALOM por defecto; cámbialo si es otro.',
        'Agrega costo, notas o documentos si lo necesitas.',
        'Guarda → el pedido aparece resaltado en su etiqueta (NUEVO PEDIDO) y en la campana de notificaciones.'
      ],
      faq: [
        {q:'¿El pegado es obligatorio?', a:'No, es opcional. Si prefieres, llena los campos a mano.'},
        {q:'¿Cómo borro lo que pegué?', a:'Con la ✕ que aparece dentro de la barra de pegar.'},
        {q:'¿Puedo editarlo después?', a:'Sí, con el botón ✏️ de la tarjeta.'}
      ],
      tips: [
        'El pegado entiende el formato del mensaje que genera tu propio formulario público de pedidos.',
        'Solo se guarda ese pedido nuevo, no toda la base — es rápido.'
      ]
    },

    config: {
      titulo: 'Configuración',
      icono: '⚙️',
      pasos: [
        'Aquí defines los couriers disponibles y cuáles se ven en el formulario público.',
        'Prende o apaga un courier con su interruptor.',
        'Configura los días de despacho y la hora de corte.',
        'Personaliza las etiquetas de estado y sus mensajes de WhatsApp.',
        'Cambia el nombre y teléfono de tu negocio.'
      ],
      faq: [
        {q:'¿Qué hace ocultar un courier?', a:'Deja de aparecer en el formulario público, pero los pedidos que ya lo usan se mantienen.'},
        {q:'¿Para qué sirve la clave (PIN)?', a:'Pide confirmación antes de ciertos cambios de estado, para evitar toques accidentales.'}
      ],
      tips: [
        'Cambiar config solo guarda la configuración, no reescribe todos los pedidos.',
        'Las etiquetas fijas (NUEVO PEDIDO, ENVIADO, etc.) no se pueden borrar, solo personalizar.'
      ]
    },

    compartir: {
      titulo: 'Compartir',
      icono: '🔗',
      pasos: [
        'Genera un enlace para que el cliente vea el seguimiento de su pedido.',
        'El cliente abre el enlace y ve el progreso (Recibido → Preparando → En camino → En destino → Entregado).',
        'El enlace es único y seguro por cada pedido.'
      ],
      faq: [
        {q:'¿El cliente ve datos de otros pedidos?', a:'No. Cada enlace solo muestra el pedido correspondiente.'}
      ],
      tips: [
        'Puedes enviar el enlace por WhatsApp directamente desde la tarjeta del pedido.'
      ]
    },

    importExport: {
      titulo: 'Importar / Exportar Excel',
      icono: '📊',
      pasos: [
        'Exportar: descarga un archivo .xlsx con todos tus pedidos actuales.',
        'Sirve para ver tus pedidos en Excel o Google Sheets.',
        'Importar: sube un Excel con el mismo formato para agregar pedidos masivamente.',
        'Las columnas son: Nombre, Teléfono, Dirección, Courier, Fecha, Estado, Costo, Notas.'
      ],
      faq: [
        {q:'¿El Excel sirve de respaldo?', a:'Solo parcial: guarda los datos básicos. Para un respaldo COMPLETO (con tracking y config), usa el módulo 🛡️ Respaldo.'}
      ],
      tips: [
        'Para respaldar todo el sistema de forma fiel, usa Respaldo (.json), no Excel.'
      ]
    },

    respaldo: {
      titulo: 'Respaldo completo',
      icono: '🛡️',
      pasos: [
        'Crear respaldo: descarga un archivo .json con <b>TODO</b> el sistema (pedidos, tracking, config, couriers, días, notas).',
        'Guarda ese archivo en un lugar seguro (tu PC, Drive, etc.).',
        'Restaurar: sube un archivo de respaldo para dejar la app exactamente como estaba en esa fecha.',
        'Antes de restaurar, el sistema crea un respaldo de seguridad del estado actual por si necesitas deshacer.',
        'Siempre se pide confirmación antes de restaurar.'
      ],
      faq: [
        {q:'¿En qué se diferencia del Excel?', a:'El respaldo .json guarda TODO (incluido tracking y configuración); el Excel solo guarda columnas básicas de pedidos.'},
        {q:'¿Restaurar borra lo que tengo ahora?', a:'Sí, reemplaza todo por el respaldo. Por eso se crea un respaldo de seguridad automático antes, y se pide confirmación.'},
        {q:'¿Cada cuánto debo respaldar?', a:'Se recomienda un respaldo semanal, o antes de hacer cambios grandes.'}
      ],
      tips: [
        'Haz un respaldo antes de importar Excel o de hacer cambios masivos.',
        'Guarda los respaldos con su fecha; el nombre del archivo ya la incluye.'
      ]
    },

    participantes: {
      titulo: 'Participantes / Usuarios',
      icono: '👥',
      pasos: [
        'Esta sección lista las personas con acceso al panel.',
        'Cada participante puede ver y gestionar los pedidos según su rol.'
      ],
      faq: [
        {q:'¿Cómo agrego un usuario?', a:'Desde la configuración de acceso del panel. (Función en evolución.)'}
      ],
      tips: [
        'Comparte el acceso solo con personas de confianza: el panel maneja datos de clientes.'
      ]
    },

    notificaciones: {
      titulo: 'Notificaciones',
      icono: '🔔',
      pasos: [
        'La campana 🔔 muestra avisos del sistema (pedidos que llegaron a destino, cambios importantes).',
        'Un punto verde indica que hay novedades sin revisar.',
        'Toca la campana para ver el detalle.'
      ],
      faq: [
        {q:'¿Las notificaciones llegan al cliente?', a:'No, son avisos internos para ti en el panel.'}
      ],
      tips: [
        'Revisa las notificaciones al inicio del día para ver qué pedidos avanzaron.'
      ]
    }

  };

  /* ══════════════════════════════════════════════════════════════════
     RENDERIZADO (mismo formato visual del Manual Shalom)
  ══════════════════════════════════════════════════════════════════ */

  function _esc(s){
    return String(s==null?'':s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  // Permite <b> en los textos de DOCS pero escapa el resto
  function _fmt(s){
    var e = _esc(s);
    return e.replace(/&lt;b&gt;/g,'<b>').replace(/&lt;\/b&gt;/g,'</b>');
  }

  function _injectCSS(){
    if(document.getElementById('ayuda-css')) return;
    // Si tracking.js ya definió .trk-manual-step, lo reutilizamos. Igual
    // definimos clases propias .ay-* por si este módulo va solo.
    var css = [
      '.ay-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99999;display:none;align-items:flex-end;justify-content:center}',
      '.ay-overlay.open{display:flex}',
      '.ay-sheet{background:#0d1117;border:1px solid #30363d;border-radius:18px 18px 0 0;width:100%;max-width:520px;max-height:85vh;overflow-y:auto;padding:20px;animation:aySlide .25s ease}',
      '@keyframes aySlide{from{transform:translateY(100%)}to{transform:translateY(0)}}',
      '.ay-title{font-family:Syne,sans-serif;font-weight:800;font-size:18px;margin-bottom:4px;color:#e6edf3}',
      '.ay-sub{font-size:11px;color:#8b949e;margin-bottom:14px}',
      '.ay-section{font-size:11px;font-weight:800;letter-spacing:.8px;color:#388bfd;margin:16px 0 8px;text-transform:uppercase}',
      '.ay-step{display:flex;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.05)}',
      '.ay-step:last-child{border-bottom:none}',
      '.ay-num{width:22px;height:22px;border-radius:50%;background:rgba(56,139,253,.15);border:1px solid rgba(56,139,253,.3);color:#388bfd;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0}',
      '.ay-text{font-size:13px;color:#e6edf3;line-height:1.5}',
      '.ay-faq{padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05)}',
      '.ay-faq:last-child{border-bottom:none}',
      '.ay-q{font-size:13px;color:#e6edf3;font-weight:700;margin-bottom:3px}',
      '.ay-a{font-size:12px;color:#8b949e;line-height:1.5}',
      '.ay-tip{font-size:12px;color:#8b949e;line-height:1.6;padding-left:18px;position:relative}',
      '.ay-tip:before{content:"💡";position:absolute;left:0}',
      '.ay-close{width:100%;margin-top:18px;padding:12px;background:#1c2333;border:1px solid #30363d;border-radius:9px;color:#8b949e;font-size:13px;cursor:pointer;font-family:inherit}'
    ].join('');
    var st = document.createElement('style');
    st.id = 'ayuda-css';
    st.textContent = css;
    document.head.appendChild(st);
  }

  function _overlay(){
    var ov = document.getElementById('ayudaOverlay');
    if(!ov){
      ov = document.createElement('div');
      ov.id = 'ayudaOverlay';
      ov.className = 'ay-overlay';
      ov.innerHTML = '<div class="ay-sheet" id="ayudaSheet"></div>';
      ov.addEventListener('click', function(e){ if(e.target===ov) ov.classList.remove('open'); });
      document.body.appendChild(ov);
    }
    return ov;
  }

  /* ── Abrir la ayuda de un módulo ─────────────────────────────────── */
  Ayuda.abrir = function(clave){
    var doc = DOCS[clave];
    if(!doc){
      if(typeof window.toast==='function') window.toast('Sin ayuda para esta sección');
      console.warn('[Ayuda] No existe documentación para:', clave);
      return;
    }
    _injectCSS();
    var ov = _overlay();
    var sheet = document.getElementById('ayudaSheet');

    var html = '';
    html += '<div class="ay-title">'+_esc(doc.icono||'📖')+' '+_esc(doc.titulo)+'</div>';
    html += '<div class="ay-sub">Guía del módulo · actualizado '+_esc(ACTUALIZADO)+'</div>';

    // Pasos
    if(doc.pasos && doc.pasos.length){
      html += '<div class="ay-section">Cómo funciona — paso a paso</div>';
      html += doc.pasos.map(function(p,i){
        return '<div class="ay-step"><div class="ay-num">'+(i+1)+'</div><div class="ay-text">'+_fmt(p)+'</div></div>';
      }).join('');
    }

    // FAQ
    if(doc.faq && doc.faq.length){
      html += '<div class="ay-section">Preguntas frecuentes</div>';
      html += doc.faq.map(function(f){
        return '<div class="ay-faq"><div class="ay-q">'+_fmt(f.q)+'</div><div class="ay-a">'+_fmt(f.a)+'</div></div>';
      }).join('');
    }

    // Tips
    if(doc.tips && doc.tips.length){
      html += '<div class="ay-section">Recomendaciones</div>';
      html += '<div style="display:flex;flex-direction:column;gap:8px">'+
        doc.tips.map(function(t){ return '<div class="ay-tip">'+_fmt(t)+'</div>'; }).join('')+
        '</div>';
    }

    html += '<button class="ay-close" onclick="document.getElementById(\'ayudaOverlay\').classList.remove(\'open\')">Cerrar</button>';

    sheet.innerHTML = html;
    sheet.scrollTop = 0;
    ov.classList.add('open');
  };

  /* ── Utilidad: lista de módulos con ayuda disponible ─────────────── */
  Ayuda.modulos = function(){ return Object.keys(DOCS); };

  console.log('[Ayuda] Módulo listo ✓ ('+Object.keys(DOCS).length+' secciones documentadas)');
})();
