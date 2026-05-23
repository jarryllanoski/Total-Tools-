/**
 * Firebase Functions v7+ — Proxy Shalom API
 * total-tools-24ce8
 *
 * API key guardada como variable de entorno en Firebase.
 * Para configurarla (solo una vez):
 *   firebase functions:secrets:set SHALOM_KEY
 *   (te pedirá el valor: sk_be883ea11609f97321db6e0ef243d8a83578a96841fb986506fd12b0e6924652)
 *
 * Funciones:
 *   agenciasShalom → lista/busca agencias Shalom
 *   shalomTracking → tracking de guías Shalom
 */

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const fetch = require('node-fetch');

// ── API key como Secret de Firebase (nunca en código) ──────────────
const SHALOM_KEY = defineSecret('SHALOM_KEY');
const SHALOM_BASE = 'https://shalom-api.lat';

// ── CORS ───────────────────────────────────────────────────────────
function setCORS(res) {
  res.set('Access-Control-Allow-Origin',  '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
}

/* ══════════════════════════════════════════════════════════════════
   agenciasShalom
   GET  /agenciasShalom?q=lima  → busca agencias
   GET  /agenciasShalom         → lista todas las agencias
══════════════════════════════════════════════════════════════════ */
exports.agenciasShalom = onRequest(
  { secrets: [SHALOM_KEY] },
  async (req, res) => {
    setCORS(res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

    const key = SHALOM_KEY.value();
    if (!key) {
      res.status(500).json({ error: true, message: 'API key no configurada' });
      return;
    }

    try {
      const q   = req.query.q || (req.body && req.body.q) || '';
      const url = q
        ? `${SHALOM_BASE}/api/buscar?q=${encodeURIComponent(q)}`
        : `${SHALOM_BASE}/api/listar`;

      const r    = await fetch(url, { headers: { 'x-api-key': key } });
      const data = await r.json();
      res.json(data);
    } catch (e) {
      console.error('[agenciasShalom]', e.message);
      res.status(500).json({ error: true, message: e.message });
    }
  }
);

/* ══════════════════════════════════════════════════════════════════
   shalomTracking
   POST /shalomTracking
   Body: { orderNumber: "82037653", orderCode: "TT9C" }
══════════════════════════════════════════════════════════════════ */
exports.shalomTracking = onRequest(
  { secrets: [SHALOM_KEY] },
  async (req, res) => {
    setCORS(res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') {
      res.status(405).json({ error: true, message: 'Usar POST' });
      return;
    }

    const key = SHALOM_KEY.value();
    if (!key) {
      res.status(500).json({ error: true, message: 'API key no configurada' });
      return;
    }

    const body        = req.body || {};
    const orderNumber = String(body.orderNumber || '').trim();
    const orderCode   = String(body.orderCode   || '').trim();

    if (!orderNumber) {
      res.status(400).json({ error: true, message: 'orderNumber es requerido' });
      return;
    }

    try {
      const r = await fetch(`${SHALOM_BASE}/api/track`, {
        method:  'POST',
        headers: {
          'x-api-key':    key,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ orderNumber, orderCode })
      });

      const data = await r.json();
      res.status(r.ok ? 200 : r.status).json(
        r.ok ? data : { error: true, message: 'Error Shalom API', data }
      );
    } catch (e) {
      console.error('[shalomTracking]', e.message);
      res.status(500).json({ error: true, message: e.message });
    }
  }
);
