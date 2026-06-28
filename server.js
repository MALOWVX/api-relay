const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors()); // autorise les requêtes depuis le navigateur (Janitor.ai)
app.use(express.json({ limit: '10mb' }));

// ─── CONFIG ───────────────────────────────────────────────────────────────────
// Remplace ces valeurs ou utilise des variables d'environnement (recommandé)
const AGENT_ROUTER_BASE_URL = process.env.AGENT_ROUTER_BASE_URL || 'https://VOTRE-URL-AGENT-ROUTER.com';
const API_KEY               = process.env.API_KEY               || 'VOTRE-CLE-API-ICI';
// ─────────────────────────────────────────────────────────────────────────────

// Relaie toutes les routes /v1/...  (chat/completions, models, etc.)
app.all('/v1*', async (req, res) => {
  const targetUrl = `${AGENT_ROUTER_BASE_URL}${req.originalUrl}`;

  const headers = {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${API_KEY}`,
    // On n'envoie PAS les headers d'origine → Agent Router ne sait pas que ça vient de Janitor.ai
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

    // Réponse en streaming (Server-Sent Events)
    if (isStream) {
      res.setHeader('Content-Type',  'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection',    'keep-alive');

      const reader  = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) { res.end(); break; }
        res.write(decoder.decode(value, { stream: true }));
      }
    } else {
      // Réponse normale JSON
      const text = await response.text();
      res.status(response.status)
         .set('Content-Type', 'application/json')
         .send(text);
    }
  } catch (err) {
    console.error('[Relay Error]', err.message);
    res.status(500).json({ error: { message: err.message } });
  }
});

// Route de sanité pour vérifier que le relai tourne
app.get('/', (req, res) => res.json({ status: 'Relay OK ✅' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Relai actif sur le port ${PORT}`));
