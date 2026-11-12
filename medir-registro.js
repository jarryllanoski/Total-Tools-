'use strict';

const {execSync} = require('child_process');
const {forma} = require('./functions/shalomPuerta.js');

const BASE = 'https://api.shalom-api.lat';
const CRUDO = process.argv.includes('--crudo');
const REGISTRAR = process.argv.includes('--registrar');

const ENVIO = {
  origen: '',
  destino: '',
  documento: '',
  name: '',
  firstname: '',
  lastname: '',
  phone: '',
  content: 'PAQUETE XS',
  clave: '',
};

function clave() {
  const delEntorno = String(process.env.SHALOM_API_KEY || '').trim();
  if (delEntorno) {
    console.log('   (leída de la variable de entorno SHALOM_API_KEY)');
    return delEntorno;
  }
  let detalle = '';
  try {
    const salida = execSync(
        'firebase functions:secrets:access SHALOM_API_KEY --project total-tools-24ce8',
        {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
    const k = String(salida).split('\n').map((x) => x.trim())
        .filter(Boolean).pop() || '';
    if (k) return k;
    detalle = 'la orden terminó bien pero no devolvió nada';
  } catch (e) {
    detalle = String((e && (e.stderr || e.stdout || e.message)) || '').trim();
  }

  console.error('\n❌ No se pudo leer la clave de Secret Manager.');
  console.error('\n   Lo que dijo la orden:');
  console.error('   ' + (detalle || '(sin mensaje)').split('\n').join('\n   '));
  console.error('\n   El camino que sí funciona, en PowerShell:');
  console.error('');
  console.error('     $env:SHALOM_API_KEY = (firebase functions:secrets:access SHALOM_API_KEY --project total-tools-24ce8).Trim()');
  console.error('     node medir-registro.js');
  console.error('     Remove-Item Env:\\SHALOM_API_KEY');
  console.error('');
  console.error('   Así la lee PowerShell —que ya sabe hacerlo— y este script');
  console.error('   la recoge del entorno. Sigue sin imprimirse nunca.\n');
  process.exit(1);
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
  try { json = JSON.parse(txt); } catch (e) {  }
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

  mostrar('1 · POST /account/get-user — tu perfil (no crea nada)',
      await pedir('POST', '/account/get-user', {instanceId}, k));

  mostrar('2 · POST /account/pending-shipments — envíos pendientes (no crea nada)',
      await pedir('POST', '/account/pending-shipments', {instanceId}, k));

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

  console.log('\n🔎 Comprobando en pending-shipments si quedó creado…');
  mostrar('5 · POST /account/pending-shipments — DESPUÉS de registrar',
      await pedir('POST', '/account/pending-shipments', {instanceId}, k));
  console.log('\nCompara con el paso 2: lo que aparezca de más es tu envío.\n');
})();
