const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const AGENT_ROUTER_BASE_URL = process.env.AGENT_ROUTER_BASE_URL || 'https://agentrouter.org';
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

  console.log(`\n[→ REQUEST] ${req.method} ${targetUrl}`);
  console.log('[→ MODEL]', req.body?.model);

  // Headers qui imitent un vrai navigateur pour contourner le WAF Alibaba
  const headers = {
    'Content-Type':     'application/json',
    'Authorization':    `Bearer ${API_KEY}`,
    'User-Agent':       'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Accept':           'application/json, text/event-stream, */*',
    'Accept-Language':  'en-US,en;q=0.9',
    'Accept-Encoding':  'gzip, deflate, br',
    'Origin':           'https://agentrouter.org',
    'Referer':          'https://agentrouter.org/',
    'sec-ch-ua':        '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'Sec-Fetch-Dest':   'empty',
    'Sec-Fetch-Mode':   'cors',
    'Sec-Fetch-Site':   'same-origin',
    'Connection':       'keep-alive',
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

    // Vérifie si la réponse est du HTML (WAF bloqué) plutôt que du JSON
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      const html = await response.text();
      console.error('[✖ WAF BLOCK] Réponse HTML reçue au lieu de JSON');
      console.error('[✖ HTML snippet]', html.slice(0, 200));
      return res.status(502).json({
        error: { message: 'Bloqué par WAF - réponse HTML reçue' }
      });
    }

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
          console.log('[← FIRST CHUNK]', chunk.slice(0, 300));
          firstChunk = false;
        }
        res.write(chunk);
      }
    } else {
      const text = await response.text();
      console.log('[← RESPONSE]', text.slice(0, 500));
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
