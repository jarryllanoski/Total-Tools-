const { onRequest }    = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');

const SHALOM_KEY = defineSecret('SHALOM_KEY');

exports.shalomListar = onRequest(
  { secrets: [SHALOM_KEY], cors: true, region: 'us-central1' },
  async (req, res) => {
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

    try {
      const r = await fetch('https://shalom-api.lat/api/listar', {
        headers: { 'x-api-key': SHALOM_KEY.value() }
      });

      if (!r.ok) {
        const txt = await r.text().catch(() => '');
        res.status(r.status).json({ error: 'Shalom ' + r.status, detail: txt.slice(0, 200) });
        return;
      }

      const data = await r.json();
      res.set('Cache-Control', 'no-store');
      res.status(200).json(data);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);