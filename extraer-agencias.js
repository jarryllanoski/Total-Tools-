/**
 * extraer-agencias.js
 * ═══════════════════════════════════════════════════════════
 * Extrae TODAS las agencias de Shalom API y las guarda como
 * /data/agencias-shalom.json normalizado.
 *
 * CÓMO EJECUTAR (elige una opción):
 *
 * OPCIÓN A — Node.js (recomendado, 1 vez en tu PC):
 *   node extraer-agencias.js
 *   → genera  data/agencias-shalom.json
 *   → sube ese archivo a GitHub, listo.
 *
 * OPCIÓN B — Navegador (consola DevTools en shalom-api.lat o localhost):
 *   Pega este script en la consola del navegador.
 *   Descarga automáticamente el JSON resultante.
 *
 * La API key se usa UNA SOLA VEZ para extracción local.
 * NO queda en ningún HTML ni JS de tu app.
 * ═══════════════════════════════════════════════════════════
 */

const API_KEY  = 'sk_mpgcq745_iuo6illh79h';
const ENDPOINT = 'https://shalom-api.lat/api/listar';
const OUT_FILE = './data/agencias-shalom.json';  // relativo a donde ejecutas el script

// ── Normalización de campos reales de la API ─────────────────────────────────
// Campos documentados: ter_id, lugar_over, direccion, zona, provincia,
//   departamento, telefono, hora_atencion, hora_domingo, latitud, longitud
function normalizar(raw) {
  return {
    id:           String(raw.ter_id          || raw.id           || '').trim(),
    nombre:       String(raw.lugar_over      || raw.nombre       || '').trim(),
    departamento: String(raw.departamento    || '').trim(),
    provincia:    String(raw.provincia       || '').trim(),
    distrito:     String(raw.zona            || raw.distrito     || raw.district || '').trim(),
    direccion:    String(raw.direccion       || raw.address      || '').trim(),
    referencia:   String(raw.referencia      || raw.ref          || '').trim(),
    telefono:     String(raw.telefono        || raw.phone        || '').trim(),
    horario:      String(raw.hora_atencion   || raw.horario      || '').trim(),
    horarioDom:   String(raw.hora_domingo    || '').trim(),
    latitud:      raw.latitud   != null ? Number(raw.latitud)  : null,
    longitud:     raw.longitud  != null ? Number(raw.longitud) : null,
    tipo:         String(raw.tipo            || raw.type         || '').trim(),
  };
}

// ── Ejecución ────────────────────────────────────────────────────────────────
async function extraer() {
  console.log('⏳ Consultando ' + ENDPOINT + ' ...');

  let raw;
  try {
    const r = await fetch(ENDPOINT, {
      headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' }
    });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' — ' + await r.text());
    raw = await r.json();
  } catch (e) {
    console.error('❌ Error al llamar la API:', e.message);
    process.exit(1);
  }

  // La API puede devolver array directo o { data: [...] }
  const lista = Array.isArray(raw) ? raw
              : Array.isArray(raw.data)    ? raw.data
              : Array.isArray(raw.agencias)? raw.agencias
              : [];

  if (!lista.length) {
    console.error('❌ La respuesta no contiene agencias. Respuesta recibida:');
    console.error(JSON.stringify(raw).substring(0, 500));
    process.exit(1);
  }

  const agencias = lista.map(normalizar);

  // ── Stats antes de guardar ────────────────────────────────────────────────
  const depts = [...new Set(agencias.map(a => a.departamento).filter(Boolean))].sort();
  console.log('\n📊 RESUMEN:');
  console.log('   Total agencias  :', agencias.length);
  console.log('   Departamentos   :', depts.length);
  console.log('   Con coordenadas :', agencias.filter(a => a.latitud && a.longitud).length);
  console.log('   Con teléfono    :', agencias.filter(a => a.telefono).length);
  console.log('   Con horario     :', agencias.filter(a => a.horario).length);
  console.log('\n🗺  Departamentos:', depts.join(', '));

  console.log('\n📌 3 ejemplos:\n');
  agencias.slice(0, 3).forEach((a, i) => {
    console.log(`[${i+1}] ${JSON.stringify(a, null, 2)}`);
  });

  // ── Output JSON ───────────────────────────────────────────────────────────
  const output = {
    meta: {
      fuente:        'shalom-api.lat/api/listar',
      total:         agencias.length,
      departamentos: depts.length,
      generado:      new Date().toISOString(),
      version:       '1.0',
    },
    agencias: agencias,
  };

  // ─ Node.js: guardar archivo ────────────────────────────────────────────────
  if (typeof process !== 'undefined' && typeof require !== 'undefined') {
    const fs   = require('fs');
    const path = require('path');
    const dir  = path.dirname(OUT_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(OUT_FILE, JSON.stringify(output, null, 2), 'utf8');
    console.log('\n✅ Guardado en:', OUT_FILE);
    console.log('   Tamaño:', (fs.statSync(OUT_FILE).size / 1024).toFixed(1), 'KB');
    console.log('\n📁 Sube el archivo data/agencias-shalom.json a tu repositorio GitHub.');
    console.log('   La API key NO quedará en ningún archivo del proyecto.\n');
  }

  // ─ Navegador: descargar ────────────────────────────────────────────────────
  else {
    const blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'agencias-shalom.json'; a.click();
    URL.revokeObjectURL(url);
    console.log('✅ Descarga iniciada: agencias-shalom.json');
    console.log('   Mueve el archivo a la carpeta data/ de tu proyecto.');
  }

  return output;
}

// Compatibilidad Node.js / navegador
if (typeof module !== 'undefined') {
  extraer();
} else {
  extraer().then(r => { window._shalomExtraccion = r; });
}
