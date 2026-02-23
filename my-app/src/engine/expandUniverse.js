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

  // Phase 1: Collect genre tags PER SEED so each seed contributes equally.
  // This prevents a dominant seed from flooding the tag pool.
  onProgress({ phase: 'drift', current: 0, total: 3, message: 'Analyzing genre landscape...' });

  const seedTagMaps = new Map(); // seedId → Map<tag, count>
  for (const seed of seedArtists) {
    seedTagMaps.set(seed.id, new Map());
  }

  // Assign each node's tags to the seed(s) it's related to
  for (const node of existingNodes) {
    if (!node.genres) continue;
    const relatedSeeds = node.relatedToSeeds || [];
    // If no related seeds (e.g. the node IS a seed), match by name
    const seedIds = relatedSeeds.length > 0
      ? relatedSeeds
      : seedArtists.filter((s) => s.name.toLowerCase().trim() === node.name.toLowerCase().trim()).map((s) => s.id);

    for (const seedId of seedIds) {
      const tagMap = seedTagMaps.get(seedId);
      if (!tagMap) continue;
      for (const genre of node.genres) {
        const g = genre.toLowerCase().trim();
        if (g.length > 0) {
          tagMap.set(g, (tagMap.get(g) || 0) + 1);
        }
      }
    }
  }

  // Sample tags evenly across seeds: pick the top mid-frequency tags from each
  // seed, round-robin, to ensure balanced genre coverage
  const tagsPerSeed = Math.max(1, Math.ceil(DRIFT_TAGS_TO_QUERY / seedArtists.length));
  const selectedTags = new Set();
  const tagToSeeds = new Map(); // tag → Set<seedId> that contributed it

  for (const [seedId, tagMap] of seedTagMaps) {
    const sorted = Array.from(tagMap.entries())
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1]);

    // Skip the top 1-2 most common tags per seed (too broad for that seed)
    const skip = Math.min(2, Math.floor(sorted.length * 0.2));
    let added = 0;

    for (let i = skip; i < sorted.length && added < tagsPerSeed; i++) {
      const tag = sorted[i][0];
      selectedTags.add(tag);
      if (!tagToSeeds.has(tag)) tagToSeeds.set(tag, new Set());
      tagToSeeds.get(tag).add(seedId);
      added++;
    }
  }

  const topTags = Array.from(selectedTags).slice(0, DRIFT_TAGS_TO_QUERY);

  if (topTags.length === 0) {
    console.warn('Expand Universe: No genre tags found in existing nodes');
    return { nodes: [], links: [] };
  }

  console.log(`Expand Universe: querying ${topTags.length} tags: ${topTags.join(', ')}`);

  // Phase 2: Fetch top artists for each tag, tracking which seed(s) each tag came from
  onProgress({ phase: 'drift', current: 1, total: 3, message: `Exploring ${topTags.length} genres...` });

  const candidateMap = new Map(); // name_lower → { name, tagCount, tags, sourceSeedIds }

  for (const tag of topTags) {
    const seedsForTag = tagToSeeds.get(tag) || new Set();
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
          for (const sid of seedsForTag) existing.sourceSeedIds.add(sid);
        } else {
          candidateMap.set(nameLower, {
            name: artist.name,
            tagCount: 1,
            tags: [tag],
            mbid: artist.mbid,
            sourceSeedIds: new Set(seedsForTag),
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

  // Sort by final score, then distribute across seeds with a per-seed cap.
  // This prevents one seed from claiming all drift nodes.
  scored.sort((a, b) => b.score - a.score || b.tagCount - a.tagCount);

  const maxPerSeed = Math.max(3, Math.ceil(targetCount / seedArtists.length * 1.5));
  const seedCounts = new Map(); // seedId → count of drift nodes assigned
  for (const seed of seedArtists) seedCounts.set(seed.id, 0);

  // Build seed genre maps for link assignment
  const seedGenreSets = seedArtists.map((seed) => ({
    id: seed.id,
    genres: new Set((seed.genres || []).map((g) => g.toLowerCase().trim())),
  }));

  const selected = [];
  for (const candidate of scored) {
    if (selected.length >= targetCount) break;

    // Find the best matching seed, respecting the per-seed cap
    const candidateGenres = new Set(candidate.tags.map((t) => t.toLowerCase().trim()));

    // Score each seed by genre overlap, preferring seeds the candidate was sourced from
    const seedScores = seedGenreSets.map((seed) => {
      let overlap = 0;
      for (const g of candidateGenres) {
        if (seed.genres.has(g)) overlap++;
      }
      // Small bonus if this candidate came from this seed's tags
      const sourceBonus = candidate.sourceSeedIds.has(seed.id) ? 0.5 : 0;
      return { id: seed.id, overlap: overlap + sourceBonus };
    });

    seedScores.sort((a, b) => b.overlap - a.overlap);

    // Try to assign to the best seed that hasn't hit its cap
    let assignedSeedId = null;
    for (const ss of seedScores) {
      if ((seedCounts.get(ss.id) || 0) < maxPerSeed) {
        assignedSeedId = ss.id;
        break;
      }
    }

    // If all seeds are at cap, skip this candidate
    if (!assignedSeedId) continue;

    seedCounts.set(assignedSeedId, (seedCounts.get(assignedSeedId) || 0) + 1);
    selected.push({ ...candidate, assignedSeedId });
  }

  console.log(`Expand Universe: selected ${selected.length} drift candidates (target: ${targetCount})`);
  for (const [seedId, count] of seedCounts) {
    if (count > 0) {
      const seed = seedArtists.find((s) => s.id === seedId);
      console.log(`  → ${seed?.name || seedId}: ${count} drift nodes`);
    }
  }

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

    const bestSeedId = candidate.assignedSeedId;
    node.relatedToSeeds = [bestSeedId];
    const bestSeed = seedArtists.find((s) => s.id === bestSeedId);
    if (bestSeed) {
      node.relatedSeedNames = [bestSeed.name];
    }

    driftNodes.push(node);

    // Create a weak link to the assigned seed
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
