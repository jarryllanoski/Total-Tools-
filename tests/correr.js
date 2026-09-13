#!/usr/bin/env node
/**
 * tests/correr.js — el corredor de pruebas del panel
 * ==================================================
 *   node tests/correr.js              todas
 *   node tests/correr.js seleccion    solo las que coincidan
 *
 * POR QUÉ EXISTE ESTE ARCHIVO Y NO UN FRAMEWORK
 * La raíz del proyecto no tiene package.json ni node_modules a propósito: son
 * <script> clásicos que el navegador carga directo. Meter Jest o Vitest
 * significaría meter un build, y el build es lo que hace que un proyecto de una
 * persona se vuelva imposible de tocar seis meses después.
 *
 * Cuarenta líneas de corredor cubren lo que hace falta: correr, contar, y salir
 * con código 1 si algo falla para que el CI lo vea.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const filtro = process.argv[2] || '';
const archivos = fs.readdirSync(__dirname)
    .filter((f) => f.endsWith('.test.js'))
    .filter((f) => !filtro || f.indexOf(filtro) >= 0)
    .sort();

if (!archivos.length) {
  console.error('No hay pruebas que coincidan con "' + filtro + '"');
  process.exit(1);
}

let totalOk = 0, totalMal = 0;
const fallos = [];

/* El corredor es asíncrono porque el panel lo es: la puerta de Shalom devuelve
   promesas. Una suite que devuelve una promesa se ESPERA — si no, una promesa
   colgada pasaría por prueba verde, que es peor que no tener prueba. */
(async () => {
for (const archivo of archivos) {
  const nombre = archivo.replace('.test.js', '');
  const suite = require(path.join(__dirname, archivo));
  const casos = [];

  // La API que ve cada archivo de pruebas: `bloque` agrupa, `ok` afirma.
  const api = {
    bloque: (titulo) => casos.push({tipo: 'bloque', titulo}),
    ok: (condicion, titulo) => {
      casos.push({tipo: 'caso', bien: !!condicion, titulo});
      if (condicion) totalOk++; else { totalMal++; fallos.push(nombre + ' · ' + titulo); }
    }
  };

  try {
    await suite(api);
  } catch (e) {
    totalMal++;
    fallos.push(nombre + ' · REVENTÓ: ' + (e && e.message));
    casos.push({tipo: 'caso', bien: false, titulo: 'REVENTÓ: ' + (e && e.message)});
  }

  console.log('\n\x1b[1m── ' + nombre + ' ──\x1b[0m');
  casos.forEach((c) => {
    if (c.tipo === 'bloque') console.log('\n  ' + c.titulo);
    else console.log('   ' + (c.bien ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m') + ' ' + c.titulo);
  });
}

console.log('\n' + '─'.repeat(58));
if (totalMal) {
  console.log('\x1b[31m' + totalMal + ' FALLAS\x1b[0m · ' + totalOk + ' bien');
  console.log('\nLo que falló:');
  fallos.forEach((f) => console.log('  ✗ ' + f));
  process.exit(1);
}
console.log('\x1b[32m' + totalOk + ' pruebas, todas bien\x1b[0m · ' +
            archivos.length + ' archivo' + (archivos.length !== 1 ? 's' : ''));
})().catch((e) => {
  // Un fallo del corredor mismo no puede salir con código 0: el CI lo vería
  // verde y nadie se enteraría.
  console.error('\n\x1b[31mEl corredor reventó:\x1b[0m', e && e.stack || e);
  process.exit(1);
});
