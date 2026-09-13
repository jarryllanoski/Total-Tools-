/**
 * shalom.js — Puerta única a Shalom
 * ==================================
 * TODO lo que habla con Shalom pasa por aquí: consultar una guía, jalar el
 * ticket, traer agencias y registrar pedidos. Un solo dueño, un solo contrato.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DESCONECTADA A PROPÓSITO — 2026-09-13
 * ══════════════════════════════════════════════════════════════════════════
 * La integración se está rehaciendo desde cero, endpoint por endpoint. Se
 * retiró el cliente entero (functions/shalomApi.js) y los dos endpoints del
 * backend (shalomApi, shalomWebhook). La clave anterior se rota.
 *
 * Y ESTE ARCHIVO ES EL MOTIVO DE QUE NO SE ROMPA NADA. La interfaz —el botón
 * ⟳ de cada tarjeta, el masivo, el extractor de agencias, el ticket, el
 * verificador de sesión— no sabe que Shalom existe: le habla a esta puerta.
 * Con las respuestas en DESCONECTADO, cada pantalla ya sabe qué decir
 * ("Rastreo Shalom en reconstrucción") sin que haya que tocar una línea.
 *
 * RECONECTAR = rellenar los métodos de abajo. Nada más.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ES I/O PURO: no toca la UI (nada de toasts ni DOM). Devuelve datos; quien
 * llama decide qué mostrar. Así la misma puerta sirve para el botón manual, el
 * auto-check del panel o un Cloud Scheduler, sin acoplarse a ninguno.
 *
 * CÓMO LLEGARÁ A SHALOM (y por qué nunca directo):
 *   navegador → Cloud Function → API de Shalom
 * La API key es un secreto y vive en Secret Manager, del lado del servidor. Si
 * viajara al navegador, cualquiera con F12 la vería y gastaría el plan del
 * negocio. La función además exige que seas administrador y solo permite las
 * operaciones de una lista blanca — no es un proxy ciego.
 *
 * CONTRATO (lo que devolverá cada método; una promesa):
 *   consultarGuia(guia, codigo) → {
 *       ok:true, estado:'En destino', fecha:'2026-08-19T16:10:00Z', pasos:2 }
 *     · estado : texto tal cual de Shalom (se muestra al operador y al cliente)
 *     · pasos  : 0..3 de la barra (0 origen · 1 tránsito · 2 destino · 3 entregado)
 *     · fecha  : ISO del evento, si Shalom la da (opcional)
 *   ticket(guia, codigo)   → { ok:true, url:'https://…' }  |  { ok:true, dataUrl:'data:image/png;…' }
 *   agencias()             → { ok:true, lista:[…] }        (formato del catálogo)
 *   registrar(pedido)      → { ok:true, guia:'…', codigo:'…' }
 *
 *   En error, todos: { ok:false, motivo:CODIGO }
 *     Del lado de SHALOM:
 *       NO_ENCONTRADO · BLOQUEADO (su clave o su plan) · LIMITE (cuota agotada)
 *       · ERROR_SHALOM (tropiezo temporal suyo, no del dato)
 *       · FORMATO_DESCONOCIDO (respondió algo que no reconocemos)
 *     Del lado del PANEL (nada que ver con Shalom, y por eso van aparte):
 *       SIN_SESION (tu sesión venció) · SIN_PERMISO (tu cuenta no está en la
 *       lista de administradores) · SIN_RED · DESCONECTADO · SIN_DATO
 *   Mezclar los dos lados manda a revisar la cuenta de Shalom cuando el
 *   problema es la sesión del panel. Ya pasó una vez; por eso están separados.
 *
 *   REGLA DE ORO: jamás ok:true sin dato real. Sin estado → ok:false. (La
 *   lección más cara: el éxito falso ocultó días de fallo.)
 */
(function (global) {
  'use strict';

  /* Los métodos que todavía no se han reconstruido responden lo mismo. No es
     un fallo: es el estado honesto del sistema, y la interfaz lo sabe leer. */
  var OFF = {ok: false, motivo: 'DESCONECTADO'};
  function _off() { return Promise.resolve(OFF); }

  /* ── La única dirección hacia Shalom ────────────────────────────────────
     El navegador NUNCA habla con api.shalom-api.lat. Habla con esta función,
     que guarda la clave del lado servidor, exige que seas administrador y
     solo acepta operaciones de una lista blanca. */
  var FUNCION = 'https://us-central1-total-tools-24ce8.cloudfunctions.net/' +
                'shalomPuerta';

  /* El token de sesión, refrescado si está por vencer. Sin token no se
     intenta siquiera: SIN_SESION es del panel, no de Shalom, y confundirlos
     manda a revisar la cuenta de Shalom cuando lo que venció es tu sesión. */
  function _token() {
    try {
      if (typeof global._authEnsureToken === 'function') {
        return global._authEnsureToken().then(function (vale) {
          return vale ? (localStorage.getItem('tt_id_token') || '') : '';
        }).catch(function () { return ''; });
      }
      return Promise.resolve(localStorage.getItem('tt_id_token') || '');
    } catch (e) {
      return Promise.resolve('');
    }
  }

  /* Una petición a la puerta. Nunca lanza: siempre resuelve con el contrato.
     Los códigos HTTP son de las barreras; lo que diga Shalom llega en 200
     dentro del cuerpo. */
  function _pedir(cuerpo) {
    return _token().then(function (tok) {
      if (!tok) return {ok: false, motivo: 'SIN_SESION'};
      return fetch(FUNCION, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + tok
        },
        body: JSON.stringify(cuerpo)
      }).then(function (r) {
        if (r.status === 401) return {ok: false, motivo: 'SIN_SESION'};
        if (r.status === 403) return {ok: false, motivo: 'SIN_PERMISO'};
        if (r.status === 405) return {ok: false, motivo: 'NO_PERMITIDO'};
        return r.json().catch(function () {
          return {ok: false, motivo: 'FORMATO_DESCONOCIDO'};
        });
      }).catch(function () {
        return {ok: false, motivo: 'SIN_RED'};
      });
    });
  }

  var Shalom = {

    /* Interruptor maestro. Lo miran el auto-check y el extractor de agencias
       para no intentar siquiera.
       SIGUE EN FALSE aunque `consultarGuia` ya funcione, y es a propósito:
       el botón ⟳ de cada tarjeta NO mira esta bandera, así que ya se puede
       usar a mano — que es justo como se calibra, guía por guía, contra lo
       que muestra la web de Shalom. El barrido automático SÍ la mira, y no
       se enciende hasta que la calibración esté hecha. Encenderlo antes es
       soltar 484 consultas confiando en un traductor sin comprobar. */
    DISPONIBLE: false,

    /* ── Los métodos, en el orden en que se van a reconstruir ────────────
       Cada uno vuelve cuando su endpoint esté medido y probado. Ver el plan
       en docs/SHALOM.md, que conserva las formas REALES ya medidas de
       /track y /instances/status — eso no se vuelve a medir. */

    /* ✅ CONECTADO · POST /track — 2026-09-13
       El árbol de 7 ramas de Shalom traducido al contrato de siempre.
       → {ok:true, estado, pasos, fecha, demora, recibio, arbol}
       `demora` viaja como bandera y NUNCA como estado: un paquete entregado
       no puede volver a mostrarse como "Demora de envíos". */
    consultarGuia: function (guia, codigo) {
      var g = String(guia || '').trim();
      if (!g) return Promise.resolve({ok: false, motivo: 'SIN_DATO'});
      return _pedir({op: 'track', datos: {
        orderNumber: g,
        orderCode: String(codigo || '').trim()
      }});
    },

    ticket: _off,            // 2 · el PNG del ticket
    agencias: _off,          // 3 · GET /agencies
    estadoInstancia: _off,   // 5 · POST /instances/status
    registrar: _off,         // 6 · alta de envío

    /* ✅ CONECTADO · GET /validate — 2026-09-13
       Dice si la clave sirve y cuánto se ha consumido. Es el primero a
       propósito: no toca ni un envío, así que si algo está mal en la
       autenticación se ve aquí y no a mitad de una consulta masiva.
       → {ok:true, valida:true, limite, usado, restante, ilimitado}
       ⚠️ `limite: null` con `ilimitado: true` es PLAN ILIMITADO, no "sin
       cuota". La documentación muestra 1000; con plan ilimitado llega null. */
    validar: function () { return _pedir({op: 'validate'}); },

    /* Diagnóstico: la FORMA de la respuesta de un endpoint, sin un solo
       valor dentro. Es la herramienta con la que se escribe cada contrato
       contra lo que la API devuelve de verdad — la documentación y la
       realidad ya se contradijeron seis veces. */
    esquema: function (de, datos) {
      return _pedir({op: 'esquema', de: de || 'validate', datos: datos});
    },

    /* Catálogo de cajas de Shalom (medidas oficiales de su app, ver
       docs/SHALOM.md). No son rangos: son cajas fijas, así que la regla
       correcta es "la más chica en la que el paquete entra" — nunca "el rango
       donde cae la medida más grande". Las dimensiones se guardan YA
       ordenadas de mayor a menor: comparar así deja elegir cualquier cara
       como largo/ancho/alto sin perder el ajuste (una caja no distingue de
       qué lado la acostás). "Sobre" queda afuera a propósito: es una
       categoría de contenido (documentos), no un tamaño — no hay umbral
       numérico que lo distinga de un paquete real. */
    CATALOGO_CAJAS: [
      {tipo: 'XXS', dims: [15, 10, 10], pesoMaxKg: 0.25},
      {tipo: 'XS',  dims: [20, 15, 12], pesoMaxKg: 0.5},
      {tipo: 'S',   dims: [30, 20, 12], pesoMaxKg: 2},
      {tipo: 'M',   dims: [30, 24, 20], pesoMaxKg: 5},
      {tipo: 'L',   dims: [42, 30, 23], pesoMaxKg: 10}
    ],

    /* Clasifica un paquete por sus medidas y peso.
       → {tipo:'S', etiqueta:'Paquete S'}      la caja donde entra
       → {tipo:'OTRA', etiqueta:'Otra Medida'} no entra en ninguna (grande o pesada)
       → null                                  faltan datos: no se puede clasificar
       Nunca lanza — datos incompletos o inválidos devuelven null, no un error. */
    clasificarPaquete: function (largo, ancho, alto, peso) {
      var l = parseFloat(largo), a = parseFloat(ancho),
          h = parseFloat(alto), p = parseFloat(peso);
      if (!(l > 0) || !(a > 0) || !(h > 0) || !(p > 0)) return null;
      var dims = [l, a, h].sort(function (x, y) { return y - x; });
      var cajas = this.CATALOGO_CAJAS;
      for (var i = 0; i < cajas.length; i++) {
        var c = cajas[i];
        if (dims[0] <= c.dims[0] && dims[1] <= c.dims[1] &&
            dims[2] <= c.dims[2] && p <= c.pesoMaxKg) {
          return {tipo: c.tipo, etiqueta: 'Paquete ' + c.tipo};
        }
      }
      return {tipo: 'OTRA', etiqueta: 'Otra Medida'};
    }
  };

  global.Shalom = Shalom;

})(window);
