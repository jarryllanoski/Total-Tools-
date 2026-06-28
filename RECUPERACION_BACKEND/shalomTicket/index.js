const { onRequest }    = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');

const SHALOM_KEY = defineSecret('SHALOM_KEY');

exports.shalomTicket = onRequest(
  { secrets: [SHALOM_KEY], cors: true, region: 'us-central1' },
  async (req, res) => {
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST')    { res.status(405).send('Method Not Allowed'); return; }

    const { orderNumber, orderCode } = req.body || {};
    if (!orderNumber || !orderCode) {
      res.status(400).json({ error: 'Falta orderNumber o orderCode' });
      return;
    }

    try {
      const r = await fetch('https://shalom-api.lat/api/ticket-image', {
        method:  'POST',
        headers: { 'x-api-key': SHALOM_KEY.value(), 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          orderNumber: String(orderNumber),
          orderCode:   String(orderCode)
        })
      });

      if (!r.ok) {
        const txt = await r.text().catch(() => '');
        res.status(r.status).json({ error: 'Shalom ' + r.status, detail: txt.slice(0, 200) });
        return;
      }

      const ct  = r.headers.get('content-type') || 'image/png';
      const buf = Buffer.from(await r.arrayBuffer());
      res.set('Content-Type', ct);
      res.set('Cache-Control', 'no-store');
      res.status(200).send(buf);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);