/**
 * Expand Universe — Drift Tier Discovery
 *
 * Discovers genre-adjacent outlier artists using Last.fm tag.getTopArtists.
 * These "drift" nodes represent the outer orbit of the galaxy: musically
 * adjacent but not found through standard similarity chains.
 */
import { getTopArtistsByTag, enrichArtists } from '../api/musicClient';

const DRIFT_TAGS_TO_QUERY = 10;
const DRIFT_ARTISTS_PER_TAG = 40;

/**
 * Discover drift nodes for an existing galaxy.
 *
 * @param {Array} existingNodes - Current nodes in the galaxy (seeds + recs + gems)
 * @param {Array} seedArtists - Original seed artists
 * @param {Function} onProgress - Progress callback
 * @returns {{ nodes: Array, links: Array }} - Drift nodes and links to merge
 */
export async function expandUniverse(existingNodes, seedArtists, onProgress = () => {}) {
  const existingNames = new Set(existingNodes.map((n) => n.name.toLowerCase().trim()));
  const seedNames = new Set(seedArtists.map((s) => s.name.toLowerCase().trim()));
  const targetCount = Math.max(10, Math.round(existingNodes.length * 0.25));

  // Phase 1: Collect genre tags from all existing nodes
  onProgress({ phase: 'drift', current: 0, total: 3, message: 'Analyzing genre landscape...' });

  const tagFreq = new Map();
  for (const node of existingNodes) {
    if (!node.genres) continue;
    for (const genre of node.genres) {
      const g = genre.toLowerCase().trim();
      if (g.length > 0) {
        tagFreq.set(g, (tagFreq.get(g) || 0) + 1);
      }
    }
  }

  // Pick mid-frequency tags — not the most common (which yield superstars)
  // but not the rarest (which have too few results). This targets the
  // genre-adjacent fringe rather than the mainstream core.
  const sortedTags = Array.from(tagFreq.entries())
    .filter(([, count]) => count >= 2) // skip tags that appear only once
    .sort((a, b) => b[1] - a[1]);

  // Skip the top 3 most common tags (too broad), take the next slice
  const skipTop = Math.min(3, Math.floor(sortedTags.length * 0.2));
  const topTags = sortedTags
    .slice(skipTop, skipTop + DRIFT_TAGS_TO_QUERY)
    .map(([tag]) => tag);

  if (topTags.length === 0) {
    console.warn('Expand Universe: No genre tags found in existing nodes');
    return { nodes: [], links: [] };
  }

  console.log(`Expand Universe: querying ${topTags.length} tags: ${topTags.join(', ')}`);

  // Phase 2: Fetch top artists for each tag
  onProgress({ phase: 'drift', current: 1, total: 3, message: `Exploring ${topTags.length} genres...` });

  const candidateMap = new Map(); // name_lower → { name, tagCount, listeners, tags }

  for (const tag of topTags) {
    try {
      const artists = await getTopArtistsByTag(tag, DRIFT_ARTISTS_PER_TAG);
      for (const artist of artists) {
        const nameLower = artist.name.toLowerCase().trim();

        // Skip anyone already in the galaxy or who is a seed
        if (existingNames.has(nameLower)) continue;
        if (seedNames.has(nameLower)) continue;

        if (candidateMap.has(nameLower)) {
          const existing = candidateMap.get(nameLower);
          existing.tagCount++;
          existing.tags.push(tag);
          // Keep the higher listener count
          if (artist.listeners > existing.listeners) {
            existing.listeners = artist.listeners;
          }
        } else {
          candidateMap.set(nameLower, {
            name: artist.name,
            tagCount: 1,
            listeners: artist.listeners,
            tags: [tag],
            mbid: artist.mbid,
          });
        }
      }
    } catch (err) {
      console.warn(`Expand Universe: tag query failed for "${tag}":`, err.message);
    }
  }

  console.log(`Expand Universe: ${candidateMap.size} unique candidates from tag queries`);

  if (candidateMap.size === 0) {
    return { nodes: [], links: [] };
  }

  // Phase 3: Score and select top candidates
  // Drift should feel *adjacent* — artists from the fringe of the genre map,
  // not the mainstream core. We prefer artists who:
  // - appear in 1-2 of our queried tags (niche edge, not genre-spanning superstars)
  // - have moderate-to-low listener counts (not household names)
  const allListeners = Array.from(candidateMap.values())
    .map((c) => c.listeners)
    .filter((l) => l > 0)
    .sort((a, b) => a - b);
  const medianListeners = allListeners.length > 0
    ? allListeners[Math.floor(allListeners.length / 2)]
    : 50000;

  const scored = Array.from(candidateMap.values()).map((candidate) => {
    // Adjacency score: artists in 1-2 tags are more "adjacent" than those
    // appearing in many tags (who are likely mainstream genre-spanning acts)
    let adjacencyScore;
    if (candidate.tagCount === 1) {
      adjacencyScore = 0.7; // single-tag match = interesting outlier
    } else if (candidate.tagCount === 2) {
      adjacencyScore = 1.0; // sweet spot: connects two genre areas
    } else if (candidate.tagCount === 3) {
      adjacencyScore = 0.6; // still ok
    } else {
      adjacencyScore = 0.3; // too many tags = likely a superstar
    }

    // Listener score: strongly favor less popular artists
    // Drift should surface artists you're less likely to already know
    let listenerScore = 0;
    if (candidate.listeners > 0) {
      const ratio = candidate.listeners / medianListeners;
      if (ratio <= 0.15) {
        listenerScore = 0.5; // very obscure — decent but may lack content
      } else if (ratio <= 0.5) {
        listenerScore = 1.0; // sweet spot: under the radar
      } else if (ratio <= 1.5) {
        listenerScore = 0.7; // around median — acceptable
      } else if (ratio <= 5) {
        listenerScore = 0.3; // popular — less interesting for drift
      } else {
        listenerScore = 0.1; // superstar — penalize heavily
      }
    }

    const score = adjacencyScore * 0.5 + listenerScore * 0.5;

    return { ...candidate, score };
  });

  // Sort by score, take top targetCount
  scored.sort((a, b) => b.score - a.score || b.tagCount - a.tagCount);
  const selected = scored.slice(0, targetCount);

  console.log(`Expand Universe: selected ${selected.length} drift candidates (target: ${targetCount})`);

  // Phase 4: Enrich with Deezer images + Last.fm tags
  onProgress({ phase: 'drift', current: 2, total: 3, message: `Loading ${selected.length} drift artists...` });

  let enrichedData = new Map();
  try {
    enrichedData = await enrichArtists(selected.map((c) => c.name));
  } catch (err) {
    console.warn('Expand Universe: enrichment failed:', err.message);
  }

  // Build seed genre maps for link assignment
  const seedGenreSets = seedArtists.map((seed) => ({
    id: seed.id,
    genres: new Set((seed.genres || []).map((g) => g.toLowerCase().trim())),
  }));

  // Build drift nodes and links
  const driftNodes = [];
  const driftLinks = [];

  for (const candidate of selected) {
    const enriched = enrichedData.get(candidate.name.toLowerCase().trim());
    const genres = enriched?.genres || candidate.tags || [];

    const node = {
      id: enriched?.id || `drift-${candidate.name}`,
      type: 'recommendation',
      name: candidate.name,
      genres,
      popularity: 0,
      nbFan: enriched?.nbFan || candidate.listeners || 0,
      image: enriched?.image || null,
      imageLarge: enriched?.imageLarge || null,
      externalUrl: enriched?.externalUrl || '',
      compositeScore: candidate.score,
      overlapScore: 0,
      overlapCount: 0,
      tier: 'drift',
      discoveryMethod: 'drift',
      relatedSeedNames: [],
      relatedToSeeds: [],
      isDrift: true,
    };

    // Link to the seed whose genres overlap most with this drift node's tags
    const candidateGenres = new Set(candidate.tags.map((t) => t.toLowerCase().trim()));
    let bestSeedId = seedArtists[0]?.id;
    let bestOverlap = 0;

    for (const seed of seedGenreSets) {
      let overlap = 0;
      for (const g of candidateGenres) {
        if (seed.genres.has(g)) overlap++;
      }
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestSeedId = seed.id;
      }
    }

    node.relatedToSeeds = [bestSeedId];
    const bestSeed = seedArtists.find((s) => s.id === bestSeedId);
    if (bestSeed) {
      node.relatedSeedNames = [bestSeed.name];
    }

    driftNodes.push(node);

    // Create a weak link to the best-matching seed
    driftLinks.push({
      source: node.id,
      target: bestSeedId,
      strength: 0.08 + candidate.score * 0.12,
      isDriftLink: true,
    });
  }

  onProgress({ phase: 'drift', current: 3, total: 3, message: `Found ${driftNodes.length} drift artists` });

  console.log(`Expand Universe: returning ${driftNodes.length} drift nodes, ${driftLinks.length} links`);

  return { nodes: driftNodes, links: driftLinks };
}
