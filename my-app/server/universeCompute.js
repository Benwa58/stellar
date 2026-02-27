const https = require('https');
const url = require('url');
const crypto = require('crypto');

const LASTFM_API_KEY = process.env.LASTFM_API_KEY;

// Bump this when compute logic changes to force recompute for all users
const UNIVERSE_COMPUTE_VERSION = 2;

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

async function fetchArtistListeners(artistName) {
  try {
    const data = await lastfmFetch('artist.getInfo', { artist: artistName });
    return parseInt(data.artist?.stats?.listeners || '0', 10);
  } catch {
    return 0;
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

async function getClusterRecommendations(clusterMembers, allUserArtists, limit = 20) {
  const candidateScores = new Map();
  // Query more members for broader, more evenly distributed recommendations
  const membersToQuery = clusterMembers.slice(0, Math.min(12, clusterMembers.length));

  for (const memberName of membersToQuery) {
    const similar = await fetchSimilarArtists(memberName, 50);
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
  return { topRecs: scored.slice(0, limit), allCandidates: scored };
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

// --- Hidden gem classification ---

async function classifyHiddenGems(enrichedClusters) {
  // Collect all recommendations across clusters
  const allRecs = [];
  for (const cluster of enrichedClusters) {
    for (const rec of (cluster.recommendations || [])) {
      allRecs.push(rec);
    }
  }

  if (allRecs.length === 0) return;

  // Fetch listener counts for all recommendations
  console.log(`[Universe] Fetching listener counts for ${allRecs.length} recommendations...`);
  const listenerCounts = [];
  for (const rec of allRecs) {
    const listeners = await fetchArtistListeners(rec.name);
    rec.listeners = listeners;
    if (listeners > 0) listenerCounts.push(listeners);
  }

  // Calculate threshold: 30th percentile of listener counts
  listenerCounts.sort((a, b) => a - b);
  const threshold = listenerCounts.length > 0
    ? listenerCounts[Math.floor(listenerCounts.length * 0.3)]
    : 100000;

  console.log(`[Universe] Hidden gem threshold: ${threshold.toLocaleString()} listeners`);

  // Classify: low listeners OR suggested by only 1 member with low match score
  for (const rec of allRecs) {
    const isLowListeners = rec.listeners > 0 && rec.listeners < threshold;
    const isSingleSuggestor = (rec.suggestedBy || []).length <= 1;
    const isLowMatch = (rec.matchScore || 0) < 0.4;

    rec.isHiddenGem = isLowListeners || (isSingleSuggestor && isLowMatch);
  }

  const gemCount = allRecs.filter((r) => r.isHiddenGem).length;
  console.log(`[Universe] Classified ${gemCount}/${allRecs.length} recommendations as hidden gems`);
}

// --- Chain link discovery ---

function discoverChainLinks(enrichedClusters, clusterCandidatePools) {
  const totalNodes = enrichedClusters.reduce(
    (sum, c) => sum + (c.members?.length || 0) + (c.recommendations?.length || 0), 0
  );
  const maxChains = Math.max(1, Math.floor(totalNodes * 0.10));
  const chainLinks = [];

  // Build a map of candidate name → which clusters they appear in
  const candidateClusterMap = new Map(); // nameLower → [{ clusterId, score, suggestedBy }]

  for (let ci = 0; ci < clusterCandidatePools.length; ci++) {
    const pool = clusterCandidatePools[ci];
    for (const candidate of pool) {
      const key = candidate.name.toLowerCase().trim();
      if (!candidateClusterMap.has(key)) {
        candidateClusterMap.set(key, []);
      }
      candidateClusterMap.get(key).push({
        clusterId: ci,
        score: candidate.score,
        matchScore: candidate.matchScore,
        suggestedBy: candidate.suggestedBy,
        name: candidate.name,
      });
    }
  }

  // Find candidates that appear in 2+ cluster pools
  const crossClusterCandidates = [];
  for (const [nameLower, appearances] of candidateClusterMap) {
    if (appearances.length < 2) continue;

    // Already a recommendation in some cluster? Skip if it's already a bridge artist
    const clusterIds = appearances.map((a) => a.clusterId);
    const avgScore = appearances.reduce((sum, a) => sum + a.score, 0) / appearances.length;
    const allSuggestors = [];
    for (const a of appearances) {
      for (const s of a.suggestedBy) {
        if (!allSuggestors.includes(s)) allSuggestors.push(s);
      }
    }

    crossClusterCandidates.push({
      name: appearances[0].name,
      nameLower,
      clusterIds,
      avgScore,
      suggestedBy: allSuggestors,
      appearances,
    });
  }

  // Sort by average score (best connectors first)
  crossClusterCandidates.sort((a, b) => b.avgScore - a.avgScore);

  // Select top N, ensuring we don't duplicate already-selected cluster pairs
  const selectedPairs = new Set();
  for (const candidate of crossClusterCandidates) {
    if (chainLinks.length >= maxChains) break;

    // Create a pair key for the two strongest clusters
    const sortedClusters = [...candidate.clusterIds].sort((a, b) => a - b);
    const pairKey = `${sortedClusters[0]}-${sortedClusters[1]}`;

    // Allow multiple chains per pair but prefer diversity
    if (selectedPairs.has(pairKey) && chainLinks.length > 0) continue;
    selectedPairs.add(pairKey);

    // Determine which cluster this candidate is already a recommendation in
    let homeClusterId = candidate.clusterIds[0];
    let bestScore = 0;
    for (const app of candidate.appearances) {
      if (app.score > bestScore) {
        bestScore = app.score;
        homeClusterId = app.clusterId;
      }
    }

    const remoteClusters = candidate.clusterIds.filter((ci) => ci !== homeClusterId);

    chainLinks.push({
      name: candidate.name,
      homeClusterId,
      remoteClusters,
      allClusters: candidate.clusterIds,
      avgScore: candidate.avgScore,
      suggestedBy: candidate.suggestedBy,
    });
  }

  console.log(`[Universe] Found ${crossClusterCandidates.length} cross-cluster candidates, selected ${chainLinks.length} chain links (max ${maxChains})`);
  return chainLinks;
}

// --- Mini-visualization layout ---

/**
 * Place clusters using force-relaxation for an organic, amorphous network
 * shape instead of a uniform ring or spiral.
 */
function relaxClusterPositions(clusters, canvasCenter, iterations = 80) {
  const n = clusters.length;
  if (n === 0) return [];
  if (n === 1) return [{ x: canvasCenter, y: canvasCenter }];

  // Seed with deterministic pseudo-random positions scattered around center
  const positions = [];
  for (let i = 0; i < n; i++) {
    // Use a hash-like seed from cluster label for determinism
    let hash = 0;
    const label = clusters[i].label || `c${i}`;
    for (let c = 0; c < label.length; c++) hash = (hash * 31 + label.charCodeAt(c)) & 0xffffffff;
    const a = ((hash & 0xffff) / 0xffff) * Math.PI * 2;
    const r = 50 + ((hash >>> 16) / 0xffff) * 70;
    positions.push({
      x: canvasCenter + r * Math.cos(a),
      y: canvasCenter + r * Math.sin(a),
    });
  }

  // Estimate visual weight per cluster for spacing
  const weights = clusters.map((c) => {
    const memberCount = c.members?.length || 1;
    const recCount = c.recommendations?.length || 0;
    return 50 + memberCount * 8 + recCount * 4;
  });

  // Iterate: repel overlapping clusters, gently attract toward center
  for (let iter = 0; iter < iterations; iter++) {
    const cooling = 1 - iter / iterations; // reduce forces over time

    for (let i = 0; i < n; i++) {
      let fx = 0, fy = 0;

      // Repulsion between clusters
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const dx = positions[i].x - positions[j].x;
        const dy = positions[i].y - positions[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const minDist = (weights[i] + weights[j]) * 0.6;
        if (dist < minDist) {
          const force = (minDist - dist) / dist * 0.4 * cooling;
          fx += dx * force;
          fy += dy * force;
        }
      }

      // Gentle pull toward center (keeps layout compact)
      const dcx = canvasCenter - positions[i].x;
      const dcy = canvasCenter - positions[i].y;
      fx += dcx * 0.025 * cooling;
      fy += dcy * 0.025 * cooling;

      positions[i].x += fx;
      positions[i].y += fy;
    }
  }

  return positions;
}

function buildMiniVisualization(clusters, bridges) {
  const nodes = [];
  const clusterCenters = [];
  const recLinks = [];
  const totalClusters = clusters.length;
  const canvasSize = 1000;
  const canvasCenter = canvasSize / 2;

  // Force-relaxed organic positions
  const clusterPositions = relaxClusterPositions(clusters, canvasCenter);

  // Track member positions for rec-to-member linking
  const memberPositions = new Map();

  for (let i = 0; i < totalClusters; i++) {
    const cx = clusterPositions[i].x;
    const cy = clusterPositions[i].y;
    clusterCenters.push({ x: cx, y: cy });

    // Member nodes (favorites/discovered) — form the nebula core
    const memberCount = clusters[i].members.length;
    const memberRadius = 45 + memberCount * 7;
    for (let j = 0; j < memberCount; j++) {
      const memberAngle = (2 * Math.PI * j) / memberCount;
      const jitter = (Math.random() - 0.5) * memberRadius * 0.35;
      const dist = memberRadius * 0.3 + Math.random() * memberRadius * 0.45;
      const nx = cx + dist * Math.cos(memberAngle) + jitter;
      const ny = cy + dist * Math.sin(memberAngle) + jitter;
      nodes.push({
        x: nx,
        y: ny,
        clusterId: i,
        name: clusters[i].members[j].name,
        source: clusters[i].members[j].source,
        image: clusters[i].members[j].image || null,
        isRecommendation: false,
        size: clusters[i].members[j].source === 'favorite' ? 5 : 4,
      });
      memberPositions.set(clusters[i].members[j].name, { x: nx, y: ny });
    }

    // Recommendation nodes — positioned outside nebula, connected by links
    const recs = clusters[i].recommendations || [];
    const recRadius = memberRadius + 40 + recs.length * 4;
    for (let j = 0; j < recs.length; j++) {
      const recAngle = (2 * Math.PI * j) / recs.length + Math.PI / recs.length;
      const jitter = (Math.random() - 0.5) * recRadius * 0.15;
      const dist = recRadius * 0.7 + Math.random() * recRadius * 0.3;
      const rx = cx + dist * Math.cos(recAngle) + jitter;
      const ry = cy + dist * Math.sin(recAngle) + jitter;
      nodes.push({
        x: rx,
        y: ry,
        clusterId: i,
        name: recs[j].name,
        isRecommendation: true,
        score: recs[j].score,
        matchScore: recs[j].matchScore,
        suggestedBy: recs[j].suggestedBy,
        size: 8,
      });

      // Create links from this rec to its suggestedBy members
      for (const suggestorName of (recs[j].suggestedBy || [])) {
        const memberPos = memberPositions.get(suggestorName);
        if (memberPos) {
          recLinks.push({
            from: { x: rx, y: ry },
            to: { x: memberPos.x, y: memberPos.y },
            strength: recs[j].matchScore || 0.5,
          });
        }
      }
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
    recLinks,
    width: canvasSize,
    height: canvasSize,
    totalRecs,
  };
}

// --- Change detection ---

function computeArtistHash(favorites, discoveredArtists) {
  const names = [`__v${UNIVERSE_COMPUTE_VERSION}`];
  for (const f of favorites) names.push(f.artist_name.toLowerCase().trim());
  for (const d of discoveredArtists) names.push(d.artist_name.toLowerCase().trim());
  names.sort();
  return crypto.createHash('sha256').update(names.join('|')).digest('hex');
}

// --- Main compute pipeline ---

async function computeUniverse(userId, db) {
  const favorites = db.getUserFavorites(userId);
  const discovered = db.getUserDiscoveredArtists(userId);
  const dislikes = db.getUserDislikes(userId);

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

  // Build set of disliked artist names to exclude from recommendations
  const dislikedNamesLower = new Set(
    dislikes.map((d) => d.artist_name.toLowerCase().trim())
  );

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
  // Also exclude disliked artists from recommendations
  for (const name of dislikedNamesLower) {
    allUserNamesLower.add(name);
  }

  const clusterCandidatePools = [];

  for (let i = 0; i < rawClusters.length; i++) {
    const cluster = rawClusters[i];
    const label = labelCluster(cluster.centroid, vocabulary);
    const color = assignClusterColor(cluster.centroid, vocabulary);
    const { topRecs, allCandidates } = await getClusterRecommendations(cluster.members, allUserNamesLower, 20);

    clusterCandidatePools.push(allCandidates);

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
      recommendations: topRecs,
      topTags: vocabulary
        .map((tag, idx) => ({ tag, weight: cluster.centroid?.[idx] || 0 }))
        .filter((tw) => tw.weight > 0.05)
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 5)
        .map((tw) => tw.tag),
    });
  }

  // Classify hidden gems (fetches listener counts)
  await classifyHiddenGems(enrichedClusters);

  // Discover chain links (cross-cluster recommendation overlaps)
  const chainLinks = discoverChainLinks(enrichedClusters, clusterCandidatePools);

  // Mark chain link recommendations in their home clusters.
  // If the candidate isn't in the top 20 recs, inject it so it appears as a node.
  for (const chain of chainLinks) {
    const cluster = enrichedClusters[chain.homeClusterId];
    if (!cluster) continue;

    let rec = (cluster.recommendations || []).find(
      (r) => r.name.toLowerCase().trim() === chain.name.toLowerCase().trim()
    );

    if (!rec) {
      // Find the candidate in the full pool and inject it
      const pool = clusterCandidatePools[chain.homeClusterId] || [];
      const poolCandidate = pool.find(
        (c) => c.name.toLowerCase().trim() === chain.name.toLowerCase().trim()
      );
      if (poolCandidate) {
        rec = { ...poolCandidate };
        cluster.recommendations.push(rec);
      }
    }

    if (rec) {
      rec.isChainLink = true;
      rec.chainClusters = chain.allClusters;
      rec.remoteClusters = chain.remoteClusters;
    }
  }

  // Detect bridge artists
  const bridges = detectBridgeArtists(rawClusters, vectors);

  // Build mini-visualization positions
  const vizData = buildMiniVisualization(enrichedClusters, bridges);

  console.log(`[Universe] Done. ${enrichedClusters.length} clusters, ${bridges.length} bridges, ${chainLinks.length} chain links.`);

  return {
    clusters: enrichedClusters,
    bridges: bridges.slice(0, 10),
    chainLinks,
    visualization: vizData,
    artistCount: allArtists.length,
    computedAt: new Date().toISOString(),
  };
}

module.exports = { computeUniverse, computeArtistHash };
