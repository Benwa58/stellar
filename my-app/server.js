const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || process.env.REACT_APP_SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || process.env.REACT_APP_SPOTIFY_CLIENT_SECRET;
const PORT = process.env.PORT || 3000;

let cachedToken = null;
let tokenExpiry = 0;

function getToken() {
  return new Promise((resolve, reject) => {
    if (cachedToken && Date.now() < tokenExpiry - 60000) {
      return resolve(cachedToken);
    }

    const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    const postData = 'grant_type=client_credentials';

    const req = https.request(
      {
        hostname: 'accounts.spotify.com',
        path: '/api/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${credentials}`,
          'Content-Length': Buffer.byteLength(postData),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            return reject(new Error(`Token request failed: ${res.statusCode} ${body}`));
          }
          const data = JSON.parse(body);
          cachedToken = data.access_token;
          tokenExpiry = Date.now() + data.expires_in * 1000;
          resolve(cachedToken);
        });
      }
    );
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function proxyToSpotify(reqPath, token) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.spotify.com',
        path: reqPath,
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
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

  // Spotify API proxy — handle /v1/* paths
  if (pathname.startsWith('/v1/')) {
    try {
      const token = await getToken();
      const spotifyPath = parsed.path; // includes query string
      const result = await proxyToSpotify(spotifyPath, token);

      res.writeHead(result.statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(result.body);
    } catch (err) {
      console.error('Proxy error:', err.message);
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

server.listen(PORT, () => {
  console.log(`Galaxy Music running on http://localhost:${PORT}`);
  console.log(`Spotify Client ID: ${CLIENT_ID ? CLIENT_ID.slice(0, 8) + '...' : 'MISSING'}`);
  console.log(`Serving static files from: ${buildPath}`);
});
