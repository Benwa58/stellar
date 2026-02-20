const express = require('express');
const https = require('https');
const url = require('url');
const path = require('path');
const cookieParser = require('cookie-parser');

const LASTFM_API_KEY = process.env.LASTFM_API_KEY;
const PORT = process.env.PORT || 3000;
const buildPath = path.join(__dirname, 'build');

const app = express();

// --- Middleware ---
app.use(cookieParser());
app.use('/api', express.json({ limit: '5mb' }));

// CORS for dev (when CRA runs separately)
app.use((req, res, next) => {
  // Don't set wide-open CORS on /api routes — those use same-origin cookies
  if (!req.path.startsWith('/api')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

// --- Last.fm proxy (unchanged logic) ---
function proxyToLastfm(queryString) {
  return new Promise((resolve, reject) => {
    const fullUrl = `https://ws.audioscrobbler.com/2.0/?${queryString}&api_key=${LASTFM_API_KEY}&format=json`;
    const parsed = url.parse(fullUrl);
    const req = https.request(
      { hostname: parsed.hostname, path: parsed.path, method: 'GET' },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ statusCode: res.statusCode, body }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

app.get('/lastfm', async (req, res) => {
  try {
    const parsed = url.parse(req.url);
    const queryString = (parsed.query || '').replace(/[&?]?(api_key|format)=[^&]*/g, '').replace(/^&/, '');
    const result = await proxyToLastfm(queryString);
    res.status(result.statusCode).set('Content-Type', 'application/json').send(result.body);
  } catch (err) {
    console.error('Last.fm proxy error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- Deezer proxy (unchanged logic) ---
function proxyToDeezer(reqPath) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: 'api.deezer.com', path: reqPath, method: 'GET' },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ statusCode: res.statusCode, body }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

app.get('/deezer/*path', async (req, res) => {
  try {
    const parsed = url.parse(req.url);
    const deezerPath = parsed.path.replace(/^\/deezer/, '');
    const result = await proxyToDeezer(deezerPath);
    res.status(result.statusCode).set('Content-Type', 'application/json').send(result.body);
  } catch (err) {
    console.error('Deezer proxy error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- Health check ---
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

// --- API routes ---
app.use('/api/auth', require('./server/auth'));
app.use('/api/maps', require('./server/maps'));
app.use('/api/favorites', require('./server/favorites'));
app.use('/api/dislikes', require('./server/dislikes'));
app.use('/api/playlists', require('./server/playlists'));

// --- Static files from React build ---
app.use(express.static(buildPath, {
  maxAge: '1y',
  immutable: true,
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

// --- SPA fallback ---
app.get('*path', (req, res) => {
  const indexPath = path.join(buildPath, 'index.html');
  res.set('Cache-Control', 'no-cache').sendFile(indexPath, (err) => {
    if (err) {
      res.status(404).send('Not found. Run "npm run build" first.');
    }
  });
});

// --- Start server ---
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Stellar running on http://localhost:${PORT}`);
  console.log(`Last.fm API Key: ${LASTFM_API_KEY ? LASTFM_API_KEY.slice(0, 8) + '...' : 'MISSING'}`);
  console.log(`Serving static files from: ${buildPath}`);
});
