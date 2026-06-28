const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const AGENT_ROUTER_BASE_URL = process.env.AGENT_ROUTER_BASE_URL || 'https://VOTRE-URL-AGENT-ROUTER.com';
const API_KEY               = process.env.API_KEY               || 'VOTRE-CLE-API-ICI';
// ─────────────────────────────────────────────────────────────────────────────

// Route de sanité
app.get('/', (req, res) => res.json({ status: 'Relay OK ✅' }));

// Catch-all : relaie tout vers Agent Router
app.all('/*', async (req, res) => {
  if (req.method === 'GET' && req.originalUrl === '/') return;

  // Normalise le chemin : ajoute /v1 si absent
  let path = req.originalUrl;
  if (!path.startsWith('/v1')) {
    path = '/v1' + path;
  }

  const targetUrl = `${AGENT_ROUTER_BASE_URL}${path}`;

  // ── LOG de la requête entrante ──────────────────────────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`[→ REQUEST] ${req.method} ${targetUrl}`);
  console.log('[→ BODY]', JSON.stringify(req.body, null, 2));
  // ───────────────────────────────────────────────────────────────────────────

  const headers = {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${API_KEY}`,
  };

  try {
    const isStream = req.body?.stream === true;

    const response = await fetch(targetUrl, {
      method:  req.method,
      headers,
      body: ['POST', 'PUT', 'PATCH'].includes(req.method)
        ? JSON.stringify(req.body)
        : undefined,
    });

    console.log(`[← STATUS] ${response.status}`);

    if (isStream) {
      res.setHeader('Content-Type',  'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection',    'keep-alive');

      const reader  = response.body.getReader();
      const decoder = new TextDecoder();
      let firstChunk = true;

      while (true) {
        const { done, value } = await reader.read();
        if (done) { res.end(); break; }
        const chunk = decoder.decode(value, { stream: true });
        if (firstChunk) {
          console.log('[← FIRST CHUNK]', chunk.slice(0, 300)); // log les 300 premiers chars
          firstChunk = false;
        }
        res.write(chunk);
      }
    } else {
      const text = await response.text();
      console.log('[← RESPONSE BODY]', text.slice(0, 500)); // log les 500 premiers chars
      res.status(response.status)
         .set('Content-Type', 'application/json')
         .send(text);
    }
  } catch (err) {
    console.error('[✖ ERROR]', err.message);
    res.status(500).json({ error: { message: err.message } });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Relai actif sur le port ${PORT}`));
