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

// CORS — allow Capacitor iOS origin on all routes, wide-open on non-API routes
const CAPACITOR_ORIGIN = 'capacitor://localhost';

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin === CAPACITOR_ORIGIN) {
    // Capacitor iOS app — allow credentialed cross-origin requests on all routes
    res.setHeader('Access-Control-Allow-Origin', CAPACITOR_ORIGIN);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  } else if (!req.path.startsWith('/api')) {
    // Non-API routes — wide-open CORS for dev
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
app.use('/api/known-artists', require('./server/knownArtists'));
app.use('/api/discovered-artists', require('./server/discoveredArtists'));
app.use('/api/playlists', require('./server/playlists'));
app.use('/api/galaxy-shares', require('./server/galaxyShares'));
app.use('/api/universe', require('./server/universe'));

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

// --- SPA fallback (with OG meta injection for shared galaxies) ---
const fs = require('fs');
const db = require('./server/db');

app.get('*path', (req, res) => {
  const indexPath = path.join(buildPath, 'index.html');

  // Check if this is a shared galaxy page — inject OG meta tags for link previews
  const galaxyMatch = req.path.match(/^\/galaxy\/([a-f0-9-]+)$/);
  if (galaxyMatch) {
    try {
      const share = db.getSharedGalaxy(galaxyMatch[1]);
      if (share) {
        let html = fs.readFileSync(indexPath, 'utf8');
        const origin = `${req.protocol}://${req.get('host')}`;
        const shareUrl = `${origin}/galaxy/${share.id}`;
        const imageUrl = `${origin}/api/galaxy-shares/${share.id}/image`;
        const seedArtists = JSON.parse(share.seed_artists);
        const description = `A galaxy of ${share.node_count} artists and ${share.link_count} connections${seedArtists.length ? ' — from ' + seedArtists.map(a => a.name).join(', ') : ''}. Explore it on Stellar.`;

        const ogTags = `
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${share.map_name.replace(/"/g, '&quot;')} — Stellar" />
    <meta property="og:description" content="${description.replace(/"/g, '&quot;')}" />
    <meta property="og:image" content="${imageUrl}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:url" content="${shareUrl}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${share.map_name.replace(/"/g, '&quot;')} — Stellar" />
    <meta name="twitter:description" content="${description.replace(/"/g, '&quot;')}" />
    <meta name="twitter:image" content="${imageUrl}" />`;

        html = html.replace('</head>', `${ogTags}\n  </head>`);
        html = html.replace(
          /<title>.*?<\/title>/,
          `<title>${share.map_name.replace(/</g, '&lt;')} — Stellar</title>`
        );

        return res.set('Cache-Control', 'no-cache').type('html').send(html);
      }
    } catch (err) {
      console.error('OG meta injection error:', err.message);
      // Fall through to normal SPA serving
    }
  }

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
