/**
 * Expand Universe — Drift Tier Discovery
 *
 * Discovers genre-adjacent outlier artists using Last.fm tag.getTopArtists.
 * These "drift" nodes represent the outer orbit of the galaxy: musically
 * adjacent but not found through standard similarity chains.
 */
import { getTopArtistsByTag, enrichArtists } from '../api/musicClient';

const DRIFT_TAGS_TO_QUERY = 8;
const DRIFT_ARTISTS_PER_TAG = 30;

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

  // Pick top N most common tags
  const topTags = Array.from(tagFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, DRIFT_TAGS_TO_QUERY)
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
  // Score = tag overlap (how many of the top tags they appear in) + listener midrange bonus
  const allListeners = Array.from(candidateMap.values())
    .map((c) => c.listeners)
    .filter((l) => l > 0)
    .sort((a, b) => a - b);
  const medianListeners = allListeners.length > 0
    ? allListeners[Math.floor(allListeners.length / 2)]
    : 50000;

  const scored = Array.from(candidateMap.values()).map((candidate) => {
    // Tag overlap score (0-1): how many of the top tags this artist appears in
    const tagScore = candidate.tagCount / topTags.length;

    // Listener midrange bonus: prefer artists in the mid-popularity range
    // (not superstars, not unknowns)
    let listenerScore = 0;
    if (candidate.listeners > 0) {
      const ratio = candidate.listeners / medianListeners;
      // Peak at 0.3-3x median, drops off for very popular or very obscure
      if (ratio >= 0.3 && ratio <= 3) {
        listenerScore = 0.8;
      } else if (ratio > 3 && ratio <= 10) {
        listenerScore = 0.5;
      } else if (ratio > 0.1 && ratio < 0.3) {
        listenerScore = 0.6;
      } else {
        listenerScore = 0.3;
      }
    }

    const score = tagScore * 0.7 + listenerScore * 0.3;

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
