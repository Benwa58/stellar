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
  function getConnections(artistKey, minScore = 0.15) {
    const similar = similarityMap.get(artistKey) || [];
    return similar
      .filter((s) => s.matchScore >= minScore)
      .map((s) => ({ name: s.name, key: s.name.toLowerCase().trim(), score: s.matchScore }));
  }

  // Build a reverse index: for each artist that appears as a similar result,
  // record which sampled artists listed it. This lets us detect connections
  // even when an artist wasn't sampled itself (the similarity API isn't
  // symmetric — A→B doesn't guarantee B→A in the response).
  const reverseIndex = new Map(); // artistKey -> [{ from: artistKey, score }]
  for (const [sampledKey, similarList] of similarityMap) {
    for (const s of similarList) {
      if (s.matchScore < 0.15) continue;
      const targetKey = s.name.toLowerCase().trim();
      if (!reverseIndex.has(targetKey)) reverseIndex.set(targetKey, []);
      reverseIndex.get(targetKey).push({ from: sampledKey, score: s.matchScore });
    }
  }

  // Lookup table for display names (avoids repeated array scans)
  const displayNameByKey = new Map();
  for (const a of [...userArtists, ...friendArtists]) {
    if (!displayNameByKey.has(a.key)) displayNameByKey.set(a.key, a.name);
  }

  // Check if artistA connects to any artist in targetKeys, using both
  // forward (A's similar list) and reverse (who lists A as similar) lookups.
  function findConnectedNames(artistKey, targetKeys) {
    const connected = new Set();

    // Forward: artistKey's own similar-artist list
    const forward = getConnections(artistKey);
    for (const c of forward) {
      if (targetKeys.has(c.key)) connected.add(c.name);
    }

    // Reverse: sampled artists that list artistKey as similar
    const reverseEntries = reverseIndex.get(artistKey) || [];
    for (const entry of reverseEntries) {
      if (targetKeys.has(entry.from)) {
        const name = displayNameByKey.get(entry.from);
        if (name) connected.add(name);
      }
    }

    return Array.from(connected);
  }

  // --- Zone 5: Your Exploration Zone ---
  // Friend's exclusive artists that connect to YOUR artists (exclusive + core overlap)
  const userOnlyKeys = new Set(userOnly.map((a) => a.key));
  const friendOnlyKeys = new Set(friendOnly.map((a) => a.key));
  const userReachableKeys = new Set([...userOnlyKeys, ...coreOverlapKeys]);

  const yourExplorationZone = [];
  const friendExplorationZone = [];
  const usedExplorationKeys = new Set();

  for (const friendArtist of friendOnly) {
    const connectedNames = findConnectedNames(friendArtist.key, userReachableKeys);
    if (connectedNames.length > 0) {
      yourExplorationZone.push({
        name: friendArtist.name,
        image: friendArtist.image,
        zone: 'your_exploration',
        connectedTo: connectedNames,
      });
      usedExplorationKeys.add(friendArtist.key);
    }
  }

  // --- Zone 6: Friend's Exploration Zone ---
  // Your exclusive artists that connect to THEIR artists (exclusive + core overlap)
  const friendReachableKeys = new Set([...friendOnlyKeys, ...coreOverlapKeys]);

  for (const userArtist of userOnly) {
    const connectedNames = findConnectedNames(userArtist.key, friendReachableKeys);
    if (connectedNames.length > 0) {
      friendExplorationZone.push({
        name: userArtist.name,
        image: userArtist.image,
        zone: 'friend_exploration',
        connectedTo: connectedNames,
      });
      usedExplorationKeys.add(userArtist.key);
    }
  }

  // --- Zone 4: Shared Frontier ---
  // Artists that connect to core overlap artists but neither user has.
  // Diversified: candidates that bridge multiple core artists score higher,
  // and selection spreads picks across core artists rather than clustering.

  // Phase 1: Gather ALL candidates from ALL core overlap artists (lower
  // threshold than exploration zones — frontier is about new discovery).
  const frontierCandidates = new Map(); // key -> { name, sources }

  for (const coreArtist of coreOverlap) {
    const connections = getConnections(coreArtist.name.toLowerCase().trim(), 0.1);
    for (const conn of connections) {
      if (userArtistSet.has(conn.key) || friendArtistSet.has(conn.key)) continue;

      if (!frontierCandidates.has(conn.key)) {
        frontierCandidates.set(conn.key, {
          name: conn.name,
          key: conn.key,
          sources: [],
        });
      }
      frontierCandidates.get(conn.key).sources.push({
        coreArtist: coreArtist.name,
        score: conn.score,
      });
    }
  }

  // Phase 2: Score candidates — reward connections to multiple core artists.
  for (const [, candidate] of frontierCandidates) {
    const avgScore = candidate.sources.reduce((sum, s) => sum + s.score, 0) / candidate.sources.length;
    // Breadth bonus: each additional core artist connection adds 30% weight
    const breadthMultiplier = 1 + (candidate.sources.length - 1) * 0.3;
    candidate.compositeScore = avgScore * breadthMultiplier;
    candidate.suggestedBy = candidate.sources.map((s) => s.coreArtist);
  }

  // Phase 3: Percentage-based limit — 25% of the total unique artists in the
  // collision, with a floor of 5 so small maps still get recommendations.
  const totalUniqueCount = new Set([...userArtists, ...friendArtists].map((a) => a.key)).size;
  const frontierLimit = Math.max(5, Math.round(totalUniqueCount * 0.25));

  // Phase 4: Diversity-aware selection — spread picks across core artists.
  const sortedCandidates = Array.from(frontierCandidates.values())
    .sort((a, b) => b.compositeScore - a.compositeScore);

  const maxPerSource = Math.max(3, Math.ceil(frontierLimit / Math.max(coreOverlap.length, 1)));
  const sourceCounts = new Map(); // coreArtist name -> count of picks sourced from it
  const trimmedFrontier = [];

  // Pass 1: multi-source candidates first (they're inherently diverse)
  for (const c of sortedCandidates) {
    if (trimmedFrontier.length >= frontierLimit) break;
    if (c.sources.length > 1) {
      trimmedFrontier.push({
        name: c.name,
        zone: 'shared_frontier',
        score: c.compositeScore,
        suggestedBy: c.suggestedBy,
      });
      for (const s of c.sources) {
        sourceCounts.set(s.coreArtist, (sourceCounts.get(s.coreArtist) || 0) + 1);
      }
    }
  }

  // Pass 2: single-source candidates, respecting per-source cap
  for (const c of sortedCandidates) {
    if (trimmedFrontier.length >= frontierLimit) break;
    if (c.sources.length === 1) {
      const src = c.sources[0].coreArtist;
      if ((sourceCounts.get(src) || 0) < maxPerSource) {
        trimmedFrontier.push({
          name: c.name,
          zone: 'shared_frontier',
          score: c.compositeScore,
          suggestedBy: c.suggestedBy,
        });
        sourceCounts.set(src, (sourceCounts.get(src) || 0) + 1);
      }
    }
  }

  // Pass 3: if still under limit, relax per-source cap
  if (trimmedFrontier.length < frontierLimit) {
    const usedKeys = new Set(trimmedFrontier.map((f) => f.name.toLowerCase().trim()));
    for (const c of sortedCandidates) {
      if (trimmedFrontier.length >= frontierLimit) break;
      if (!usedKeys.has(c.key)) {
        trimmedFrontier.push({
          name: c.name,
          zone: 'shared_frontier',
          score: c.compositeScore,
          suggestedBy: c.suggestedBy,
        });
        usedKeys.add(c.key);
      }
    }
  }

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

  // Shared frontier connections to core (one link per source artist)
  for (const artist of trimmedFrontier) {
    const sources = Array.isArray(artist.suggestedBy) ? artist.suggestedBy : [artist.suggestedBy];
    for (const sourceName of sources) {
      links.push({
        source: artist.name,
        target: sourceName,
        strength: artist.score,
        type: 'frontier',
      });
    }
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
