#!/usr/bin/env node
/**
 * medir-registro.js — medir qué responde Shalom al registrar un envío
 * =====================================================================
 * Se corre DESDE TU PC:   node medir-registro.js
 *
 * ⚠️ POR QUÉ ESTE ARCHIVO EXISTE Y POR QUÉ TIENE TANTAS REJAS
 * `POST /account/register` CREA UN ENVÍO DE VERDAD Y SE PAGA. La API de
 * Shalom **no tiene endpoint para cancelarlo ni anularlo** (comprobado en
 * docs/SHALOM-API.md): una vez creado, está creado. Y no tiene clave de
 * idempotencia, así que llamarlo dos veces son dos envíos y dos cobros.
 *
 * Por eso, por defecto este script SOLO HACE LO QUE NO CUESTA:
 *
 *   1 · POST /account/get-user          → tu perfil. No crea nada.
 *   2 · POST /account/pending-shipments → tus envíos pendientes. No crea nada,
 *       Y ADEMÁS enseña la forma de un envío YA registrado, que es la mitad
 *       del contrato que buscamos.
 *   3 · POST /account/register CON EL CUERPO VACÍO → la forma del ERROR.
 *       Sin `instanceId` la API no puede crear nada aunque quisiera, así que
 *       esto mide gratis la otra mitad.
 *
 * Para registrar DE VERDAD hace falta, las dos cosas:
 *   node medir-registro.js --registrar
 *   …y escribir REGISTRAR cuando lo pida.
 *
 * LA CLAVE NUNCA SE IMPRIME: se lee de Secret Manager y se usa en memoria.
 * Y de las respuestas se imprime LA FORMA (tipos, sin valores) con la misma
 * función que usa la puerta única, así que se puede pegar en el chat sin que
 * salga un dato de nadie. Con --crudo se ve todo, para mirarlo tú solo.
 */
'use strict';

const {execSync} = require('child_process');
const {forma} = require('./functions/shalomPuerta.js');

const BASE = 'https://api.shalom-api.lat';
const CRUDO = process.argv.includes('--crudo');
const REGISTRAR = process.argv.includes('--registrar');

/* ── LO QUE SE VA A REGISTRAR (solo se usa con --registrar) ──────────────
   Rellena esto ANTES de correr con --registrar. Son datos de un envío real:
   revísalos dos veces, porque no se puede deshacer. */
const ENVIO = {
  origen: '',            // ter_id de TU agencia (Config → agencia de origen)
  destino: '',           // ter_id de la agencia de destino
  documento: '',         // DNI del destinatario, 8 dígitos
  name: '',              // nombres        (de RENIEC)
  firstname: '',         // apellido paterno
  lastname: '',          // apellido materno
  phone: '',             // 9 dígitos
  content: 'PAQUETE XS', // el catálogo de cajas de Shalom
  clave: '',             // clave de recojo, 4 dígitos
};

function clave() {
  try {
    return execSync(
        'firebase functions:secrets:access SHALOM_API_KEY --project total-tools-24ce8',
        {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
  } catch (e) {
    console.error('\n❌ No se pudo leer la clave de Secret Manager.');
    console.error('   Comprueba que estás dentro de la carpeta del proyecto y');
    console.error('   que `firebase login` sigue vivo.\n');
    process.exit(1);
  }
}

async function pedir(metodo, ruta, cuerpo, k) {
  const op = {method: metodo, headers: {'x-api-key': k}};
  if (cuerpo !== undefined) {
    op.headers['Content-Type'] = 'application/json';
    op.body = JSON.stringify(cuerpo);
  }
  const r = await fetch(BASE + ruta, op);
  const txt = await r.text();
  let json = null;
  try { json = JSON.parse(txt); } catch (e) { /* no era json */ }
  return {http: r.status, json, txt};
}

function mostrar(titulo, r) {
  console.log('\n──────────────────────────────────────────────');
  console.log(titulo);
  console.log('HTTP ' + r.http);
  if (r.json === null) {
    console.log('(no devolvió JSON) ' + r.txt.slice(0, 300));
    return;
  }
  console.log(JSON.stringify(CRUDO ? r.json : forma(r.json), null, 1));
}

function preguntar(texto) {
  return new Promise((res) => {
    process.stdout.write(texto);
    process.stdin.resume();
    process.stdin.once('data', (d) => {
      process.stdin.pause();
      res(String(d).trim());
    });
  });
}

(async () => {
  console.log('\n🔑 Leyendo la clave de Secret Manager (no se imprime)…');
  const k = clave();
  console.log('   ok, ' + k.length + ' caracteres.');

  // ── 0 · la instancia. No cuesta nada y hace falta para todo lo demás.
  const inst = await pedir('GET', '/instances', undefined, k);
  mostrar('0 · GET /instances — tus cuentas de Shalom Pro', inst);
  const lista = (inst.json && inst.json.instances) || [];
  const uno = lista[0];
  if (!uno) {
    console.log('\n❌ Sin instancias: no se puede medir nada más.\n');
    return;
  }
  if (!uno.isLoggedIn) {
    console.log('\n⚠️  OJO: isLoggedIn = false. La cuenta de Shalom Pro está');
    console.log('    deslogueada, así que el registro fallaría igual. Entra en');
    console.log('    pro.shalom.pe antes de seguir.\n');
  }
  const instanceId = uno.id;

  // ── 1 · el perfil. De aquí salen remitente y remitente_id.
  mostrar('1 · POST /account/get-user — tu perfil (no crea nada)',
      await pedir('POST', '/account/get-user', {instanceId}, k));

  // ── 2 · los pendientes. Enseña la forma de un envío YA registrado.
  mostrar('2 · POST /account/pending-shipments — envíos pendientes (no crea nada)',
      await pedir('POST', '/account/pending-shipments', {instanceId}, k));

  // ── 3 · la forma del ERROR, gratis. Sin instanceId no puede crear nada.
  mostrar('3 · POST /account/register CON CUERPO VACÍO — la forma del error',
      await pedir('POST', '/account/register', {}, k));

  if (!REGISTRAR) {
    console.log('\n──────────────────────────────────────────────');
    console.log('✅ Listo. Nada de esto creó ningún envío ni costó nada.');
    console.log('');
    console.log('   Para registrar UNO DE VERDAD (se paga, no se puede anular):');
    console.log('     1. Rellena el bloque ENVIO de arriba en este archivo');
    console.log('     2. node medir-registro.js --registrar');
    console.log('');
    return;
  }

  // ── 4 · el registro DE VERDAD ────────────────────────────────────────
  const faltan = ['origen', 'destino', 'documento', 'name', 'firstname',
    'phone'].filter((c) => !String(ENVIO[c] || '').trim());
  if (faltan.length) {
    console.log('\n❌ Faltan campos del bloque ENVIO: ' + faltan.join(', '));
    console.log('   Rellénalos arriba en este archivo y vuelve a correr.\n');
    return;
  }

  const cuerpo = Object.assign({instanceId}, ENVIO);
  console.log('\n══════════════════════════════════════════════');
  console.log('⚠️  ESTO CREA UN ENVÍO REAL Y SE PAGA.');
  console.log('    La API de Shalom NO tiene forma de anularlo.');
  console.log('══════════════════════════════════════════════');
  console.log('\nSe va a mandar exactamente esto:\n');
  console.log(JSON.stringify(
      Object.assign({}, cuerpo, {instanceId: '(tu instancia)'}), null, 1));

  const resp = await preguntar('\nEscribe REGISTRAR para continuar: ');
  if (resp !== 'REGISTRAR') {
    console.log('\nCancelado. No se mandó nada.\n');
    return;
  }

  const reg = await pedir('POST', '/account/register', cuerpo, k);
  mostrar('4 · POST /account/register — LA RESPUESTA', reg);

  // Pase lo que pase, se mira si quedó creado: si la red se cayó a mitad, la
  // respuesta se pierde pero el envío puede existir igual. Reintentar a
  // ciegas es como se paga dos veces.
  console.log('\n🔎 Comprobando en pending-shipments si quedó creado…');
  mostrar('5 · POST /account/pending-shipments — DESPUÉS de registrar',
      await pedir('POST', '/account/pending-shipments', {instanceId}, k));
  console.log('\nCompara con el paso 2: lo que aparezca de más es tu envío.\n');
})();
