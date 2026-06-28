const express = require('express');
const cors = require('cors');
const { Readable } = require('stream'); // Nécessaire pour le fix du streaming

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const AGENT_ROUTER_BASE_URL = 'https://agentrouter.org';
const API_KEY               = 'sk-TACLÉ'; // remplace par ta vraie clé
// ─────────────────────────────────────────────────────────────────────────────

app.get('/', (req, res) => res.json({ status: 'Relay OK ✅' }));

app.all('/*', async (req, res) => {
  if (req.method === 'GET' && req.originalUrl === '/') return;

  let path = req.originalUrl;
  
  // S'assure que le path commence par /v1
  if (!path.startsWith('/v1')) {
    path = '/v1' + path;
  }

  const targetUrl = `${AGENT_ROUTER_BASE_URL}${path}`;
  console.log(`\n[→ REQUEST] ${req.method} ${targetUrl}`);
  console.log('[→ MODEL]', req.body?.model);

  const headers = {
    'Content-Type':     'application/json',
    'Authorization':    `Bearer ${API_KEY}`,
    'User-Agent':       'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Accept':           'application/json, text/event-stream, */*',
    'Accept-Language':  'en-US,en;q=0.9',
    'Origin':           'https://agentrouter.org',
    'Referer':          'https://agentrouter.org/',
  };

  try {
    const isStream = req.body?.stream === true;

    // Utilisation du fetch natif de Node.js (pas besoin de node-fetch)
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
      
      // FIX STREAMING : Conversion du Web Stream en Node Stream
      Readable.fromWeb(response.body).pipe(res);
      
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
