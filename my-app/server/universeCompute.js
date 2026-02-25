const https = require('https');
const url = require('url');
const crypto = require('crypto');

const LASTFM_API_KEY = process.env.LASTFM_API_KEY;

// Tags that are user noise, not real genres
const TAG_BLACKLIST = new Set([
  'seen live', 'favorites', 'favourite', 'my music', 'check out',
  'awesome', 'love', 'beautiful', 'cool', 'amazing', 'epic',
  'under 2000 listeners', 'spotify', 'all', 'albums i own',
]);

// Genre color map for cluster coloring
const GENRE_COLOR_MAP = {
  rock: { h: 10, s: 80, l: 55 },
  metal: { h: 0, s: 75, l: 45 },
  electronic: { h: 195, s: 85, l: 55 },
  dance: { h: 185, s: 80, l: 50 },
  'hip-hop': { h: 270, s: 70, l: 55 },
  rap: { h: 275, s: 65, l: 50 },
  pop: { h: 330, s: 80, l: 60 },
  jazz: { h: 35, s: 75, l: 55 },
  blues: { h: 25, s: 70, l: 50 },
  classical: { h: 230, s: 40, l: 70 },
  country: { h: 140, s: 60, l: 50 },
  folk: { h: 130, s: 50, l: 55 },
  'r&b': { h: 280, s: 60, l: 50 },
  soul: { h: 290, s: 55, l: 55 },
  indie: { h: 165, s: 65, l: 55 },
  alternative: { h: 170, s: 60, l: 50 },
  latin: { h: 45, s: 85, l: 55 },
  reggae: { h: 120, s: 65, l: 45 },
  punk: { h: 350, s: 75, l: 50 },
  'k-pop': { h: 310, s: 80, l: 60 },
};

// --- Rate-limited server-side Last.fm client ---

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

async function fetchArtistTags(artistName) {
  try {
    const data = await lastfmFetch('artist.getTopTags', { artist: artistName });
    const tags = data.toptags?.tag || [];
    const list = Array.isArray(tags) ? tags : [tags];
    return list
      .filter((t) => {
        const name = (t.name || '').toLowerCase().trim();
        return name.length > 0 && !TAG_BLACKLIST.has(name) && (t.count === undefined || t.count > 0);
      })
      .slice(0, 10)
      .map((t) => ({ name: t.name.toLowerCase().trim(), count: parseInt(t.count || '100', 10) }));
  } catch {
    return [];
  }
}

async function fetchSimilarArtists(artistName, limit = 50) {
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

// --- Tag vector construction ---

function buildTagVectors(artistTagData) {
  // Build global vocabulary from all tags
  const tagFrequency = new Map();
  for (const { tags } of artistTagData) {
    const seen = new Set();
    for (const tag of tags) {
      if (!seen.has(tag.name)) {
        tagFrequency.set(tag.name, (tagFrequency.get(tag.name) || 0) + 1);
        seen.add(tag.name);
      }
    }
  }

  // Keep tags used by at least 2 artists, cap at 100 dimensions
  const minCount = tagFrequency.size <= 30 ? 1 : 2;
  const vocabulary = Array.from(tagFrequency.entries())
    .filter(([, count]) => count >= minCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 100)
    .map(([tag]) => tag);

  const tagIndex = new Map(vocabulary.map((tag, i) => [tag, i]));

  // Build L2-normalized vectors
  const vectors = new Map();
  for (const { artistName, tags } of artistTagData) {
    const vec = new Float64Array(vocabulary.length);
    for (const tag of tags) {
      const idx = tagIndex.get(tag.name);
      if (idx !== undefined) {
        vec[idx] = tag.count / 100;
      }
    }
    // L2-normalize
    let norm = 0;
    for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < vec.length; i++) vec[i] /= norm;
    }
    vectors.set(artistName, vec);
  }

  return { vocabulary, vectors, tagIndex };
}

// --- K-Means clustering ---

function euclideanDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

function kMeansPlusPlusInit(vectors, artistNames, k, dim) {
  const n = artistNames.length;
  const centroids = [];

  // Pick first centroid randomly
  const firstIdx = Math.floor(Math.random() * n);
  centroids.push(Float64Array.from(vectors.get(artistNames[firstIdx])));

  for (let c = 1; c < k; c++) {
    const distances = new Float64Array(n);
    let totalDist = 0;
    for (let i = 0; i < n; i++) {
      const vec = vectors.get(artistNames[i]);
      let minDist = Infinity;
      for (const centroid of centroids) {
        const dist = euclideanDistance(vec, centroid);
        if (dist < minDist) minDist = dist;
      }
      distances[i] = minDist * minDist;
      totalDist += distances[i];
    }

    // Weighted random selection
    let r = Math.random() * totalDist;
    let picked = false;
    for (let i = 0; i < n; i++) {
      r -= distances[i];
      if (r <= 0) {
        centroids.push(Float64Array.from(vectors.get(artistNames[i])));
        picked = true;
        break;
      }
    }
    if (!picked) {
      centroids.push(Float64Array.from(vectors.get(artistNames[Math.floor(Math.random() * n)])));
    }
  }

  return centroids;
}

function kMeansClustering(vectors, k = 0, maxIterations = 50) {
  const artistNames = Array.from(vectors.keys());
  const n = artistNames.length;

  if (n === 0) return [];
  if (n <= 3) {
    return [{ centroid: null, members: artistNames }];
  }

  const dim = vectors.get(artistNames[0]).length;
  if (dim === 0) return [{ centroid: null, members: artistNames }];

  // Auto-determine k
  if (k <= 0) {
    k = Math.max(2, Math.min(8, Math.round(Math.sqrt(n / 2))));
  }
  k = Math.min(k, n);

  const centroids = kMeansPlusPlusInit(vectors, artistNames, k, dim);
  const assignments = new Int32Array(n);

  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      const vec = vectors.get(artistNames[i]);
      let minDist = Infinity;
      let bestCluster = 0;
      for (let c = 0; c < k; c++) {
        const dist = euclideanDistance(vec, centroids[c]);
        if (dist < minDist) {
          minDist = dist;
          bestCluster = c;
        }
      }
      if (assignments[i] !== bestCluster) {
        assignments[i] = bestCluster;
        changed = true;
      }
    }

    if (!changed) break;

    // Recompute centroids
    for (let c = 0; c < k; c++) {
      const newCentroid = new Float64Array(dim);
      let count = 0;
      for (let i = 0; i < n; i++) {
        if (assignments[i] === c) {
          const vec = vectors.get(artistNames[i]);
          for (let d = 0; d < dim; d++) newCentroid[d] += vec[d];
          count++;
        }
      }
      if (count > 0) {
        for (let d = 0; d < dim; d++) newCentroid[d] /= count;
        centroids[c] = newCentroid;
      }
    }
  }

  // Build cluster results, filter out empty
  const clusters = Array.from({ length: k }, (_, i) => ({
    centroid: centroids[i],
    members: [],
  }));
  for (let i = 0; i < n; i++) {
    clusters[assignments[i]].members.push(artistNames[i]);
  }

  return clusters.filter((c) => c.members.length > 0);
}

// --- Cluster labeling ---

function labelCluster(centroid, vocabulary) {
  if (!centroid || vocabulary.length === 0) return 'Mixed';

  const tagWeights = vocabulary
    .map((tag, i) => ({ tag, weight: centroid[i] }))
    .filter((tw) => tw.weight > 0.01)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3);

  if (tagWeights.length === 0) return 'Mixed';

  const capitalize = (s) =>
    s
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

  if (tagWeights.length === 1) return capitalize(tagWeights[0].tag);
  if (tagWeights.length === 2) return `${capitalize(tagWeights[0].tag)} & ${capitalize(tagWeights[1].tag)}`;
  return `${capitalize(tagWeights[0].tag)}, ${capitalize(tagWeights[1].tag)} & more`;
}

// --- Cluster color assignment ---

function assignClusterColor(centroid, vocabulary) {
  if (!centroid || vocabulary.length === 0) return { h: 220, s: 50, l: 60 };

  let bestTag = null;
  let bestWeight = -1;
  for (let i = 0; i < vocabulary.length; i++) {
    if (centroid[i] > bestWeight) {
      bestWeight = centroid[i];
      bestTag = vocabulary[i];
    }
  }

  if (!bestTag) return { h: 220, s: 50, l: 60 };

  for (const [key, color] of Object.entries(GENRE_COLOR_MAP)) {
    if (bestTag.includes(key)) return color;
  }

  // Hash-based fallback
  let hash = 0;
  for (let i = 0; i < bestTag.length; i++) hash = (hash * 31 + bestTag.charCodeAt(i)) & 0xffffffff;
  return { h: hash % 360, s: 55, l: 55 };
}

// --- Per-cluster recommendations ---

async function getClusterRecommendations(clusterMembers, allUserArtists, limit = 5) {
  const candidateScores = new Map();
  const membersToQuery = clusterMembers.slice(0, 5);

  for (const memberName of membersToQuery) {
    const similar = await fetchSimilarArtists(memberName, 30);
    for (const s of similar) {
      const nameLower = s.name.toLowerCase().trim();
      if (allUserArtists.has(nameLower)) continue;

      if (candidateScores.has(nameLower)) {
        const existing = candidateScores.get(nameLower);
        existing.totalScore += s.matchScore;
        existing.count++;
        if (!existing.suggestedBy.includes(memberName)) {
          existing.suggestedBy.push(memberName);
        }
      } else {
        candidateScores.set(nameLower, {
          name: s.name,
          totalScore: s.matchScore,
          count: 1,
          suggestedBy: [memberName],
        });
      }
    }
  }

  const scored = Array.from(candidateScores.values()).map((c) => ({
    name: c.name,
    score: (c.totalScore / c.count) * (1 + (c.count - 1) * 0.3),
    matchScore: c.totalScore / c.count,
    overlapCount: c.count,
    suggestedBy: c.suggestedBy,
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

// --- Bridge artist detection ---

function detectBridgeArtists(clusters, vectors) {
  const bridges = [];

  for (const [artistName, vec] of vectors) {
    const similarities = clusters.map((c, i) => ({
      index: i,
      similarity: c.centroid ? cosineSimilarity(vec, c.centroid) : 0,
    }));

    const strongMatches = similarities.filter((s) => s.similarity >= 0.3);
    if (strongMatches.length >= 2) {
      bridges.push({
        name: artistName,
        clusters: strongMatches.map((s) => s.index),
        strength: strongMatches.reduce((sum, s) => sum + s.similarity, 0) / strongMatches.length,
      });
    }
  }

  bridges.sort((a, b) => b.strength - a.strength);
  return bridges;
}

// --- Mini-visualization layout ---

function buildMiniVisualization(clusters, bridges) {
  const nodes = [];
  const clusterCenters = [];
  const totalClusters = clusters.length;
  const center = 400;
  const radius = 240;

  for (let i = 0; i < totalClusters; i++) {
    const angle = (2 * Math.PI * i) / totalClusters - Math.PI / 2;
    const cx = center + radius * Math.cos(angle);
    const cy = center + radius * Math.sin(angle);
    clusterCenters.push({ x: cx, y: cy });

    // Member nodes (favorites/discovered) — smaller anchors in inner ring
    const memberCount = clusters[i].members.length;
    const memberRadius = 40 + memberCount * 6;
    for (let j = 0; j < memberCount; j++) {
      const memberAngle = (2 * Math.PI * j) / memberCount;
      const jitter = (Math.random() - 0.5) * memberRadius * 0.4;
      const dist = memberRadius * 0.4 + Math.random() * memberRadius * 0.4;
      nodes.push({
        x: cx + dist * Math.cos(memberAngle) + jitter,
        y: cy + dist * Math.sin(memberAngle) + jitter,
        clusterId: i,
        name: clusters[i].members[j].name,
        source: clusters[i].members[j].source,
        image: clusters[i].members[j].image || null,
        isRecommendation: false,
        size: clusters[i].members[j].source === 'favorite' ? 5 : 4,
      });
    }

    // Recommendation nodes — larger, positioned in outer ring around cluster
    const recs = clusters[i].recommendations || [];
    const recRadius = memberRadius + 25 + recs.length * 3;
    for (let j = 0; j < recs.length; j++) {
      // Offset rec angles to sit in gaps between members
      const recAngle = (2 * Math.PI * j) / recs.length + Math.PI / recs.length;
      const jitter = (Math.random() - 0.5) * recRadius * 0.2;
      const dist = recRadius * 0.7 + Math.random() * recRadius * 0.3;
      nodes.push({
        x: cx + dist * Math.cos(recAngle) + jitter,
        y: cy + dist * Math.sin(recAngle) + jitter,
        clusterId: i,
        name: recs[j].name,
        isRecommendation: true,
        score: recs[j].score,
        matchScore: recs[j].matchScore,
        suggestedBy: recs[j].suggestedBy,
        size: 7,
      });
    }
  }

  const bridgeLinks = bridges.slice(0, 10).map((b) => ({
    name: b.name,
    from: clusterCenters[b.clusters[0]],
    to: clusterCenters[b.clusters.length > 1 ? b.clusters[1] : b.clusters[0]],
    strength: b.strength,
  }));

  const totalRecs = clusters.reduce((sum, c) => sum + (c.recommendations?.length || 0), 0);

  return {
    nodes,
    clusterCenters: clusterCenters.map((c, i) => ({
      ...c,
      label: clusters[i].label,
      color: clusters[i].color,
      memberCount: clusters[i].members.length,
      recCount: clusters[i].recommendations?.length || 0,
    })),
    bridgeLinks,
    width: 800,
    height: 800,
    totalRecs,
  };
}

// --- Change detection ---

function computeArtistHash(favorites, discoveredArtists) {
  const names = [];
  for (const f of favorites) names.push(f.artist_name.toLowerCase().trim());
  for (const d of discoveredArtists) names.push(d.artist_name.toLowerCase().trim());
  names.sort();
  return crypto.createHash('sha256').update(names.join('|')).digest('hex');
}

// --- Main compute pipeline ---

async function computeUniverse(userId, db) {
  const favorites = db.getUserFavorites(userId);
  const discovered = db.getUserDiscoveredArtists(userId);

  const allArtists = [];
  const seen = new Set();
  for (const f of favorites) {
    const key = f.artist_name.toLowerCase().trim();
    if (!seen.has(key)) {
      allArtists.push({ name: f.artist_name, source: 'favorite', image: f.artist_image });
      seen.add(key);
    }
  }
  for (const d of discovered) {
    const key = d.artist_name.toLowerCase().trim();
    if (!seen.has(key)) {
      allArtists.push({ name: d.artist_name, source: 'discovered', image: d.artist_image });
      seen.add(key);
    }
  }

  if (allArtists.length < 4) {
    return { error: 'Need at least 4 artists (favorites + discoveries) to build your universe.' };
  }

  // Fetch tags for all artists
  console.log(`[Universe] Fetching tags for ${allArtists.length} artists...`);
  const artistTagData = [];
  for (const artist of allArtists) {
    const tags = await fetchArtistTags(artist.name);
    artistTagData.push({ artistName: artist.name, tags, source: artist.source, image: artist.image });
  }

  // Filter out artists with no tags
  const artistsWithTags = artistTagData.filter((a) => a.tags.length > 0);
  if (artistsWithTags.length < 4) {
    return { error: 'Could not fetch enough tag data. Try adding more well-known artists.' };
  }

  // Build tag vectors
  console.log(`[Universe] Building vectors for ${artistsWithTags.length} artists...`);
  const { vocabulary, vectors } = buildTagVectors(artistsWithTags);

  // K-means clustering
  console.log(`[Universe] Clustering...`);
  const rawClusters = kMeansClustering(vectors);

  // Enrich clusters
  console.log(`[Universe] Enriching ${rawClusters.length} clusters with recommendations...`);
  const enrichedClusters = [];
  const allUserNamesLower = new Set(allArtists.map((a) => a.name.toLowerCase().trim()));

  for (let i = 0; i < rawClusters.length; i++) {
    const cluster = rawClusters[i];
    const label = labelCluster(cluster.centroid, vocabulary);
    const color = assignClusterColor(cluster.centroid, vocabulary);
    const recommendations = await getClusterRecommendations(cluster.members, allUserNamesLower, 5);

    const members = cluster.members.map((name) => {
      const data = artistsWithTags.find((a) => a.artistName === name);
      return {
        name,
        source: data?.source || 'unknown',
        image: data?.image || null,
      };
    });

    enrichedClusters.push({
      id: i,
      label,
      color,
      members,
      recommendations,
      topTags: vocabulary
        .map((tag, idx) => ({ tag, weight: cluster.centroid?.[idx] || 0 }))
        .filter((tw) => tw.weight > 0.05)
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 5)
        .map((tw) => tw.tag),
    });
  }

  // Detect bridge artists
  const bridges = detectBridgeArtists(rawClusters, vectors);

  // Build mini-visualization positions
  const vizData = buildMiniVisualization(enrichedClusters, bridges);

  console.log(`[Universe] Done. ${enrichedClusters.length} clusters, ${bridges.length} bridges.`);

  return {
    clusters: enrichedClusters,
    bridges: bridges.slice(0, 10),
    visualization: vizData,
    artistCount: allArtists.length,
    computedAt: new Date().toISOString(),
  };
}

module.exports = { computeUniverse, computeArtistHash };
