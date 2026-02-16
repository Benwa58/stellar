const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');

const LASTFM_API_KEY = process.env.LASTFM_API_KEY;
const PORT = process.env.PORT || 3000;

// --- Last.fm proxy ---
function proxyToLastfm(queryString) {
  return new Promise((resolve, reject) => {
    const fullUrl = `https://ws.audioscrobbler.com/2.0/?${queryString}&api_key=${LASTFM_API_KEY}&format=json`;
    const parsed = url.parse(fullUrl);

    const req = https.request(
      {
        hostname: parsed.hostname,
        path: parsed.path,
        method: 'GET',
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          resolve({ statusCode: res.statusCode, headers: res.headers, body });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

// --- Deezer proxy (needed because Deezer doesn't set CORS headers) ---
function proxyToDeezer(reqPath) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.deezer.com',
        path: reqPath,
        method: 'GET',
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          resolve({ statusCode: res.statusCode, headers: res.headers, body });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

// Content-type map for static files
const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
  '.txt': 'text/plain',
  '.webmanifest': 'application/manifest+json',
};

const buildPath = path.join(__dirname, 'build');

const server = http.createServer(async (req, res) => {
  // CORS headers (needed for dev when CRA runs separately)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsed = url.parse(req.url);
  const pathname = parsed.pathname;

  // Health check
  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // Last.fm API proxy — /lastfm?method=X&artist=Y&...
  if (pathname === '/lastfm') {
    try {
      // Forward all query params except api_key and format (server adds those)
      const queryString = (parsed.query || '').replace(/[&?]?(api_key|format)=[^&]*/g, '').replace(/^&/, '');
      const result = await proxyToLastfm(queryString);

      res.writeHead(result.statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(result.body);
    } catch (err) {
      console.error('Last.fm proxy error:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Deezer API proxy — /deezer/* → api.deezer.com/*
  if (pathname.startsWith('/deezer/')) {
    try {
      const deezerPath = parsed.path.replace(/^\/deezer/, ''); // strip /deezer prefix, keep query
      const result = await proxyToDeezer(deezerPath);

      res.writeHead(result.statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(result.body);
    } catch (err) {
      console.error('Deezer proxy error:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Static file serving from React build folder
  const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(buildPath, safePath);

  try {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      // Cache static assets (JS/CSS have content hashes from CRA build)
      const cacheControl = ext === '.html'
        ? 'no-cache'
        : 'public, max-age=31536000, immutable';

      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': cacheControl,
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }
  } catch (err) {
    // Fall through to SPA fallback
  }

  // SPA fallback — serve index.html for all unmatched routes
  const indexPath = path.join(buildPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' });
    fs.createReadStream(indexPath).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found. Run "npm run build" first to create the production bundle.');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Galaxy Music running on http://localhost:${PORT}`);
  console.log(`Last.fm API Key: ${LASTFM_API_KEY ? LASTFM_API_KEY.slice(0, 8) + '...' : 'MISSING'}`);
  console.log(`Serving static files from: ${buildPath}`);
});
