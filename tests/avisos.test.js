'use strict';
const crypto = require('crypto');
const E = require('./_entorno.js');
const A = require('../functions/avisosShalom.js');
const W = require('../functions/webhook.js');
const B = require('../functions/barrido.js');

const evento = (code, extra) => Object.assign({event: 'tracking.status_changed', orderNumber: '103379262',
  orderCode: 'D97M', status: 'En tránsito', statusCode: code, previousStatusCode: 'EN_ORIGIN',
  statusAt: '2026-11-12T20:07:00.000Z', delayed: false}, extra || {});

module.exports = async ({bloque, ok}) => {
  bloque('Del aviso de Shalom al estado de siempre (statusCode, no el texto)');
  {
    const r = (c) => (A.leer(evento(c)) || {}).res;
    ok(r('EN_ORIGIN').estado === 'En origen' && r('EN_ORIGIN').pasos === 0, 'EN_ORIGIN → En origen');
    ok(r('IN_TRANSIT').estado === 'En tránsito' && r('IN_TRANSIT').pasos === 1, 'IN_TRANSIT → En tránsito');
    ok(r('AT_DESTINATION').estado === 'En destino' && r('AT_DESTINATION').pasos === 2, 'AT_DESTINATION → En destino');
    ok(r('OUT_FOR_DELIVERY').estado === 'En reparto', 'OUT_FOR_DELIVERY → En reparto');
    ok(r('DELIVERED').estado === 'Entregado' && r('DELIVERED').pasos === 3, 'DELIVERED → Entregado');
    ok(r('REGISTERED') === null && r('UNKNOWN') === null && r(null) === null,
       '⚠️ Registrado / desconocido NO mueven nada (el paquete no entró)');
    ok(r('DELIVERED', {}).fecha === '2026-11-12T20:07:00.000Z', 'con la fecha del hito');
    ok((A.leer(evento('IN_TRANSIT', {delayed: true})) || {}).res.demora === true, 'la demora viaja como bandera');
    ok(A.leer({event: 'otra.cosa', orderNumber: '103379262'}) === null, 'otros eventos se ignoran');
    ok(A.leer({orderNumber: '12'}) === null && A.leer(null) === null, 'sin guia valida, nada');
    ok((A.leer({data: evento('IN_TRANSIT')}) || {}).guia === '103379262', 'tambien si viene envuelto en data');
    const res = A.leer(evento('IN_TRANSIT')).res;
    const c = B.cambiosDe({status: 'ALISTADO', trackingStatus: ''}, res, 'auto');
    ok(c && c.campos.trackingStatus === 'En tránsito', 'se aplica con la MISMA regla que los horarios');
    ok(B.cambiosDe({status: 'ENVIADO', trackingStatus: 'En destino'}, res, 'auto') === null ||
       B.cambiosDe({status: 'ENVIADO', trackingStatus: 'En destino'}, res, 'auto').campos.trackingStatus === undefined,
       'un aviso atrasado no desanda el camino');
  }

  bloque('Solo el pedido de ESA guia y ESE codigo');
  {
    const av = A.leer(evento('IN_TRANSIT'));
    ok(A.esDelPedido({shalomGuia: '103379262', shalomCodigo: 'D97M'}, av), 'misma guia y codigo: si');
    ok(A.esDelPedido({trackingOrderNumber: '103379262', trackingOrderCode: 'd97m'}, av), 'guia a mano y codigo en minusculas: si');
    ok(!A.esDelPedido({shalomGuia: '103379262', shalomCodigo: 'ZZZZ'}, av), '⚠️ misma guia con OTRO codigo: no');
    ok(!A.esDelPedido({shalomGuia: '103379263', shalomCodigo: 'D97M'}, av), 'otra guia: no');
  }

  bloque('La firma, la busque donde la busque');
  {
    const t = Math.floor(Date.now() / 1000);
    const cuerpo = JSON.stringify(evento('IN_TRANSIT'));
    const v1 = crypto.createHmac('sha256', 'whsec_prueba').update(t + '.' + cuerpo).digest('hex');
    const firma = 't=' + t + ',v1=' + v1;
    ok(A.buscarFirma({'content-type': 'application/json', 'x-shalom-signature': firma}) === firma, 'en X-Shalom-Signature');
    ok(A.buscarFirma({'x-webhook-signature': firma}) === firma, 'o con otro nombre: se reconoce por su forma');
    ok(A.buscarFirma({'x-otra': 't=1'}) === '' && A.buscarFirma(null) === '', 'sin firma: nada');
    ok(W.verificarFirma(A.buscarFirma({'x-sig': firma}), Buffer.from(cuerpo), 'whsec_prueba', Date.now()).ok,
       'y la firma encontrada se verifica de verdad');
  }

  bloque('Que guias se suscriben');
  {
    const base = {courier: 'Shalom', status: 'ALISTADO', shalomGuia: '103379262', shalomCodigo: 'D97M'};
    const L = A.porSuscribir([
      Object.assign({id: 'a'}, base),
      Object.assign({id: 'b'}, base, {shalomAvisos: '103379262'}),
      Object.assign({id: 'c'}, base, {status: 'FINALIZADO'}),
      Object.assign({id: 'd'}, base, {trackingStatus: 'Entregado'}),
      Object.assign({id: 'e'}, base, {courier: 'Olva'}),
      Object.assign({id: 'f'}, base, {shalomCodigo: ''}),
      Object.assign({id: 'g'}, base, {shalomGuia: '939726661'}),
      Object.assign({id: 'h'}, base, {shalomAvisos: '103300000'}),
    ]);
    ok(L.map((x) => x.id).join() === 'a,h', 'abiertas de Shalom con guia y codigo; no las ya suscritas, cerradas, entregadas, de otro courier o mal escritas');
    ok(L[0].guia === '103379262' && L[0].codigo === 'D97M', 'con su guia y codigo');
    ok(A.porSuscribir(Array.from({length: 100}, (_, i) => Object.assign({id: 'x' + i}, base)), 60).length === 60, 'como mucho 60 por vuelta');
  }

  bloque('Servidor: activar, recibir y suscribir');
  {
    const idx = E.leerReal('functions/index.js');
    const P = require('../functions/shalomPuerta.js');
    ok(P.ORQUESTADAS.activarAvisos === true && P.PERMITIDAS.suscribir.soloServidor && P.PERMITIDAS.avisosConfigurar.soloServidor,
       'activar es una orquestacion; suscribir y configurar, solo del servidor');
    const act = idx.slice(idx.indexOf('if (paso.orquestar === "activarAvisos")'), idx.indexOf('if (paso.orquestar === "jalarTicket")'));
    ok(/rotateSecret: true/.test(act) && /await _escribirSecreto\(SECRETO_AVISOS, secreto\)/.test(act),
       'el secreto va de Shalom directo a Secret Manager');
    const respuestas = act.match(/res\.status\(200\)\.json\([\s\S]*?\);/g) || [];
    ok(respuestas.length >= 3 && respuestas.every((x) => !/[:{,]\s*secreto\b|\bsecret\s*:|w\.secret|r\.json/.test(x)),
       '⚠️ ninguna respuesta lleva el secreto: el navegador solo sabe cuantas guias se suscribieron');
    const fn = idx.slice(idx.indexOf('const _shalomWebhook = onRequest'), idx.indexOf('if (WEBHOOK_ACTIVO) exports.shalomWebhook'));
    ok(/const WEBHOOK_ACTIVO = true;/.test(idx), 'el receptor queda encendido');
    ok(fn.indexOf('avisosShalom.buscarFirma(req.headers)') > 0 &&
       fn.indexOf('webhook.verificarFirma(') < fn.indexOf('_aplicarAviso(aviso)'), 'se verifica la firma ANTES de aplicar nada');
    ok(/if \(!v\.ok && \(v\.motivo === "FIRMA_INVALIDA" \|\| v\.motivo === "SIN_SECRETO"\)\) \{\s*v = webhook\.verificarFirma\(\s*firma, crudo, await _secretoWebhook\(true\), Date\.now\(\)\);/.test(fn),
       'si la firma no cuadra, relee el secreto una vez (por si se roto)');
    ok(!/secrets: \[/.test(fn), 'el secreto se lee en ejecucion: activar no pide otro deploy');
    const ap = idx.slice(idx.indexOf('async function _aplicarAviso'), idx.indexOf('async function _suscribirGuias'));
    ok(/avisosShalom\.esDelPedido\(p, aviso\)/.test(ap) && /barrido\.cambiosDe\(p, aviso\.res, modo\)/.test(ap),
       'aplica solo al pedido de esa guia y codigo, con la regla de los horarios');
    const bar = idx.slice(idx.indexOf('async function _correrBarrido'), idx.indexOf('exports.barridoShalom'));
    ok(/if \(await _avisosActivos\(\)\) \{\s*try \{\s*suscripcion = await _suscribirGuias\(docs\);/.test(bar),
       'los horarios suscriben las guias nuevas (y siguen como red de seguridad)');
    ok(/_rechazos\.n\+\+;/.test(fn) && /Date\.now\(\) - _rechazos\.ts > 60000/.test(fn),
       'los rechazos se cuentan en memoria y se escriben como mucho una vez por minuto');
  }

  bloque('Panel: estado y boton');
  {
    const aj = E.leerReal('panel/shalom/shalom-ajustes.js');
    ok(/async function activarAvisosShalom\(\)/.test(aj) && /async function _pintarAvisos\(\)/.test(aj), 'boton y estado en Config');
    ok(/id="btnActivarAvisos"/.test(E.leerCrudo('index.html')) && /id="avisosShalomLinea"/.test(E.leerCrudo('index.html')), 'en la seccion de Shalom');
    ok(/activarAvisos: function \(\) \{\s*return _pedir\(\{op: 'activarAvisos', datos: \{\}\}\);/.test(E.leerReal('panel/shalom/shalom.js')),
       'el panel no manda nada: el servidor arma todo');
  }
};
