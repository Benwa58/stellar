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
const DRIFT_MAX_FANS = 500000; // Hard ceiling: exclude artists above 500K Deezer fans

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

  const candidateMap = new Map(); // name_lower → { name, tagCount, tags }

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
        } else {
          candidateMap.set(nameLower, {
            name: artist.name,
            tagCount: 1,
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

  // Phase 3: Pre-score by adjacency, take a shortlist, enrich with Deezer for
  // real popularity data, then apply the hard fan ceiling and final scoring.
  //
  // Last.fm's tag.getTopArtists does NOT return listener counts, so we must
  // enrich via Deezer to get nbFan before we can filter by popularity.
  // We take 3× the target to have enough headroom after filtering.
  const presorted = Array.from(candidateMap.values()).map((candidate) => {
    let adjacencyScore;
    if (candidate.tagCount === 1) {
      adjacencyScore = 0.7;
    } else if (candidate.tagCount === 2) {
      adjacencyScore = 1.0;
    } else if (candidate.tagCount === 3) {
      adjacencyScore = 0.6;
    } else {
      adjacencyScore = 0.3;
    }
    return { ...candidate, adjacencyScore };
  });

  presorted.sort((a, b) => b.adjacencyScore - a.adjacencyScore || a.tagCount - b.tagCount);
  const shortlist = presorted.slice(0, targetCount * 3);

  console.log(`Expand Universe: shortlisted ${shortlist.length} candidates for enrichment`);

  // Enrich shortlist with Deezer data (images, nbFan, genres)
  onProgress({ phase: 'drift', current: 2, total: 3, message: `Loading ${shortlist.length} drift artists...` });

  let enrichedData = new Map();
  try {
    enrichedData = await enrichArtists(shortlist.map((c) => c.name));
  } catch (err) {
    console.warn('Expand Universe: enrichment failed:', err.message);
  }

  // Apply hard fan ceiling using actual Deezer nbFan data and compute final scores
  const scored = [];
  for (const candidate of shortlist) {
    const enriched = enrichedData.get(candidate.name.toLowerCase().trim());
    const nbFan = enriched?.nbFan || 0;

    // Hard ceiling: exclude artists above 500K Deezer fans
    if (nbFan > DRIFT_MAX_FANS) {
      continue;
    }

    // Compute popularity score from Deezer fan count
    let popularityScore;
    if (nbFan <= 0) {
      popularityScore = 0.5; // unknown — decent but risky
    } else if (nbFan <= 50000) {
      popularityScore = 1.0; // sweet spot: under the radar
    } else if (nbFan <= 150000) {
      popularityScore = 0.7; // moderate — acceptable
    } else if (nbFan <= 300000) {
      popularityScore = 0.4; // popular — less interesting for drift
    } else {
      popularityScore = 0.2; // well-known — strongly penalized
    }

    const score = candidate.adjacencyScore * 0.5 + popularityScore * 0.5;
    scored.push({ ...candidate, nbFan, score, enriched });
  }

  console.log(`Expand Universe: ${shortlist.length} → ${scored.length} after fan ceiling (max ${DRIFT_MAX_FANS.toLocaleString()} fans)`);

  // Sort by final score, take top targetCount
  scored.sort((a, b) => b.score - a.score || b.tagCount - a.tagCount);
  const selected = scored.slice(0, targetCount);

  console.log(`Expand Universe: selected ${selected.length} drift candidates (target: ${targetCount})`);

  // Build seed genre maps for link assignment
  const seedGenreSets = seedArtists.map((seed) => ({
    id: seed.id,
    genres: new Set((seed.genres || []).map((g) => g.toLowerCase().trim())),
  }));

  // Build drift nodes and links
  const driftNodes = [];
  const driftLinks = [];

  for (const candidate of selected) {
    const enriched = candidate.enriched;
    const genres = enriched?.genres || candidate.tags || [];

    const node = {
      id: enriched?.id || `drift-${candidate.name}`,
      type: 'recommendation',
      name: candidate.name,
      genres,
      popularity: 0,
      nbFan: candidate.nbFan,
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
