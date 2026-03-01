const https = require('https');
const url = require('url');
const crypto = require('crypto');

const LASTFM_API_KEY = process.env.LASTFM_API_KEY;

// --- Rate-limited Last.fm client (shared queue) ---

let activeRequests = 0;
const requestQueue = [];
const MAX_CONCURRENT = 3;
const DELAY_MS = 300;

function enqueueRequest(fn) {
  return new Promise((resolve, reject) => {
    requestQueue.push({ fn, resolve, reject });
    processQueue();
  });
}

function processQueue() {
  if (activeRequests >= MAX_CONCURRENT || requestQueue.length === 0) return;
  const { fn, resolve, reject } = requestQueue.shift();
  activeRequests++;
  fn()
    .then(resolve)
    .catch(reject)
    .finally(() => {
      activeRequests--;
      setTimeout(processQueue, DELAY_MS);
    });
}

function lastfmFetch(method, params = {}) {
  return enqueueRequest(() => {
    const query = new URLSearchParams({
      method,
      ...params,
      api_key: LASTFM_API_KEY,
      format: 'json',
    });
    const fetchUrl = `https://ws.audioscrobbler.com/2.0/?${query.toString()}`;

    return new Promise((resolve, reject) => {
      const parsed = url.parse(fetchUrl);
      const req = https.request(
        { hostname: parsed.hostname, path: parsed.path, method: 'GET' },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            try {
              const data = JSON.parse(body);
              if (data.error) {
                reject(new Error(data.message || `Last.fm error ${data.error}`));
              } else {
                resolve(data);
              }
            } catch (e) {
              reject(e);
            }
          });
        }
      );
      req.on('error', reject);
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Last.fm request timeout'));
      });
      req.end();
    });
  });
}

async function fetchSimilarArtists(artistName, limit = 60) {
  try {
    const data = await lastfmFetch('artist.getSimilar', {
      artist: artistName,
      limit: String(limit),
    });
    const artists = data.similarartists?.artist || [];
    const list = Array.isArray(artists) ? artists : [artists];
    return list.map((a) => ({
      name: a.name,
      matchScore: parseFloat(a.match) || 0,
    }));
  } catch {
    return [];
  }
}

async function fetchArtistTags(artistName) {
  try {
    const data = await lastfmFetch('artist.getTopTags', { artist: artistName });
    const tags = data.toptags?.tag || [];
    const list = Array.isArray(tags) ? tags : [tags];
    return list
      .filter((t) => {
        const name = (t.name || '').toLowerCase().trim();
        return name.length > 0 && (t.count === undefined || t.count > 0);
      })
      .slice(0, 10)
      .map((t) => ({ name: t.name.toLowerCase().trim(), count: parseInt(t.count || '100', 10) }));
  } catch {
    return [];
  }
}

// --- Collision hash ---

function computeCollisionHash(userFavs, userDiscovered, friendFavs, friendDiscovered) {
  const allNames = [
    ...userFavs.map((f) => `u:${f.artist_name.toLowerCase().trim()}`),
    ...userDiscovered.map((d) => `u:${d.artist_name.toLowerCase().trim()}`),
    ...friendFavs.map((f) => `f:${f.artist_name.toLowerCase().trim()}`),
    ...friendDiscovered.map((d) => `f:${d.artist_name.toLowerCase().trim()}`),
  ].sort();
  return crypto.createHash('sha256').update(allNames.join('|')).digest('hex');
}

// --- Main collision compute ---

async function computeCollision(userId, friendId, db) {
  const userFavs = db.getUserFavorites(userId);
  const userDiscovered = db.getUserDiscoveredArtists(userId);
  const friendFavs = db.getUserFavorites(friendId);
  const friendDiscovered = db.getUserDiscoveredArtists(friendId);

  // Build name sets
  const userArtistSet = new Set();
  const userArtists = [];
  for (const f of userFavs) {
    const key = f.artist_name.toLowerCase().trim();
    if (!userArtistSet.has(key)) {
      userArtistSet.add(key);
      userArtists.push({ name: f.artist_name, key, source: 'favorite', image: f.artist_image });
    }
  }
  for (const d of userDiscovered) {
    const key = d.artist_name.toLowerCase().trim();
    if (!userArtistSet.has(key)) {
      userArtistSet.add(key);
      userArtists.push({ name: d.artist_name, key, source: 'discovered', image: d.artist_image });
    }
  }

  const friendArtistSet = new Set();
  const friendArtists = [];
  for (const f of friendFavs) {
    const key = f.artist_name.toLowerCase().trim();
    if (!friendArtistSet.has(key)) {
      friendArtistSet.add(key);
      friendArtists.push({ name: f.artist_name, key, source: 'favorite', image: f.artist_image });
    }
  }
  for (const d of friendDiscovered) {
    const key = d.artist_name.toLowerCase().trim();
    if (!friendArtistSet.has(key)) {
      friendArtistSet.add(key);
      friendArtists.push({ name: d.artist_name, key, source: 'discovered', image: d.artist_image });
    }
  }

  // --- Zone 1: Core Overlap ---
  // Artists both users have favorited or discovered
  const coreOverlap = userArtists
    .filter((a) => friendArtistSet.has(a.key))
    .map((a) => ({ name: a.name, image: a.image, zone: 'core_overlap' }));
  const coreOverlapKeys = new Set(coreOverlap.map((a) => a.name.toLowerCase().trim()));

  // Non-overlap artists
  const userOnly = userArtists.filter((a) => !friendArtistSet.has(a.key));
  const friendOnly = friendArtists.filter((a) => !userArtistSet.has(a.key));

  // --- Fetch similar artists for connection discovery ---
  // We need similarities to categorize exploration zones and shared frontier
  const allUniqueArtists = [...new Set([...userArtists, ...friendArtists].map((a) => a.name))];

  // Limit API calls: fetch similar for a representative sample
  const samplesToFetch = allUniqueArtists.slice(0, 40);
  const similarityMap = new Map(); // artist -> [{ name, matchScore }]

  const batchSize = 5;
  for (let i = 0; i < samplesToFetch.length; i += batchSize) {
    const batch = samplesToFetch.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map((name) => fetchSimilarArtists(name, 40))
    );
    for (let j = 0; j < batch.length; j++) {
      similarityMap.set(batch[j].toLowerCase().trim(), results[j]);
    }
  }

  // Build connection graph: which artists are similar to which
  function getConnections(artistKey) {
    const similar = similarityMap.get(artistKey) || [];
    return similar
      .filter((s) => s.matchScore >= 0.15)
      .map((s) => ({ name: s.name, key: s.name.toLowerCase().trim(), score: s.matchScore }));
  }

  // --- Zone 5: Your Exploration Zone ---
  // Friend's exclusive artists that connect to YOUR exclusive artists
  const userOnlyKeys = new Set(userOnly.map((a) => a.key));
  const friendOnlyKeys = new Set(friendOnly.map((a) => a.key));

  const yourExplorationZone = [];
  const friendExplorationZone = [];
  const usedExplorationKeys = new Set();

  for (const friendArtist of friendOnly) {
    const connections = getConnections(friendArtist.key);
    const connectsToUser = connections.some((c) => userOnlyKeys.has(c.key));
    if (connectsToUser) {
      yourExplorationZone.push({
        name: friendArtist.name,
        image: friendArtist.image,
        zone: 'your_exploration',
        connectedTo: connections.filter((c) => userOnlyKeys.has(c.key)).map((c) => c.name),
      });
      usedExplorationKeys.add(friendArtist.key);
    }
  }

  // --- Zone 6: Friend's Exploration Zone ---
  // Your exclusive artists that connect to THEIR exclusive artists
  for (const userArtist of userOnly) {
    const connections = getConnections(userArtist.key);
    const connectsToFriend = connections.some((c) => friendOnlyKeys.has(c.key));
    if (connectsToFriend) {
      friendExplorationZone.push({
        name: userArtist.name,
        image: userArtist.image,
        zone: 'friend_exploration',
        connectedTo: connections.filter((c) => friendOnlyKeys.has(c.key)).map((c) => c.name),
      });
      usedExplorationKeys.add(userArtist.key);
    }
  }

  // --- Zone 4: Shared Frontier ---
  // Artists that connect to core overlap artists but neither user has
  const sharedFrontier = [];
  const sharedFrontierKeys = new Set();

  for (const coreArtist of coreOverlap) {
    const connections = getConnections(coreArtist.name.toLowerCase().trim());
    for (const conn of connections) {
      if (
        !userArtistSet.has(conn.key) &&
        !friendArtistSet.has(conn.key) &&
        !sharedFrontierKeys.has(conn.key) &&
        conn.score >= 0.2
      ) {
        sharedFrontier.push({
          name: conn.name,
          zone: 'shared_frontier',
          score: conn.score,
          suggestedBy: coreArtist.name,
        });
        sharedFrontierKeys.add(conn.key);
      }
    }
  }
  // Limit shared frontier to top 20 by score
  sharedFrontier.sort((a, b) => b.score - a.score);
  const trimmedFrontier = sharedFrontier.slice(0, 20);

  // --- Zone 2 & 3: Your Artists / Friend's Artists (remaining) ---
  const yourArtists = userOnly
    .filter((a) => !usedExplorationKeys.has(a.key))
    .map((a) => ({ name: a.name, image: a.image, zone: 'your_artists' }));

  const friendsArtists = friendOnly
    .filter((a) => !usedExplorationKeys.has(a.key))
    .map((a) => ({ name: a.name, image: a.image, zone: 'friend_artists' }));

  // --- Fetch tags for core overlap for cluster coloring ---
  const coreTagSample = coreOverlap.slice(0, 10).map((a) => a.name);
  const tagResults = await Promise.all(coreTagSample.map(fetchArtistTags));
  const topTagCounts = new Map();
  for (const tags of tagResults) {
    for (const tag of tags) {
      topTagCounts.set(tag.name, (topTagCounts.get(tag.name) || 0) + tag.count);
    }
  }
  const topTags = Array.from(topTagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]) => name);

  // --- Build connection links for visualization ---
  const links = [];

  // Core overlap interconnections
  for (let i = 0; i < coreOverlap.length && i < 15; i++) {
    const connections = getConnections(coreOverlap[i].name.toLowerCase().trim());
    for (const conn of connections) {
      if (coreOverlapKeys.has(conn.key) && conn.key !== coreOverlap[i].name.toLowerCase().trim()) {
        links.push({
          source: coreOverlap[i].name,
          target: conn.name,
          strength: conn.score,
          type: 'core',
        });
      }
    }
  }

  // Exploration zone connections
  for (const artist of yourExplorationZone) {
    for (const connName of (artist.connectedTo || []).slice(0, 2)) {
      links.push({
        source: artist.name,
        target: connName,
        strength: 0.3,
        type: 'exploration',
      });
    }
  }
  for (const artist of friendExplorationZone) {
    for (const connName of (artist.connectedTo || []).slice(0, 2)) {
      links.push({
        source: artist.name,
        target: connName,
        strength: 0.3,
        type: 'exploration',
      });
    }
  }

  // Shared frontier connections to core
  for (const artist of trimmedFrontier) {
    links.push({
      source: artist.name,
      target: artist.suggestedBy,
      strength: artist.score,
      type: 'frontier',
    });
  }

  const user = db.getUserById(userId);
  const friend = db.getUserById(friendId);

  return {
    zones: {
      coreOverlap,
      yourArtists,
      friendArtists: friendsArtists,
      sharedFrontier: trimmedFrontier,
      yourExploration: yourExplorationZone,
      friendExploration: friendExplorationZone,
    },
    links,
    topTags,
    stats: {
      totalArtists: coreOverlap.length + yourArtists.length + friendsArtists.length +
        trimmedFrontier.length + yourExplorationZone.length + friendExplorationZone.length,
      coreOverlapCount: coreOverlap.length,
      yourArtistCount: userArtists.length,
      friendArtistCount: friendArtists.length,
      sharedFrontierCount: trimmedFrontier.length,
    },
    userInfo: {
      id: userId,
      displayName: user?.display_name || 'You',
      username: user?.username,
      hasAvatar: !!(user?.avatar),
    },
    friendInfo: {
      id: friendId,
      displayName: friend?.display_name || 'Friend',
      username: friend?.username,
      hasAvatar: !!(friend?.avatar),
    },
    computedAt: new Date().toISOString(),
  };
}

module.exports = { computeCollision, computeCollisionHash };
