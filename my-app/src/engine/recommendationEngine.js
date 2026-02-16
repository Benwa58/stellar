import { discoverRelatedArtists, getMultipleArtists } from '../api/spotifyClient';
import { MAX_RECOMMENDATIONS } from '../utils/constants';
import { clusterByGenre } from './genreAnalysis';

export async function generateRecommendations(seedArtists, onProgress) {
  const seedIds = new Set(seedArtists.map((a) => a.id));

  // Phase 1: Discover related artists via search for each seed
  onProgress({ phase: 'discover', current: 0, total: seedArtists.length, message: 'Discovering related artists...' });

  const candidates = new Map(); // candidateId -> { artist, relatedToSeeds: Set }
  let successCount = 0;
  const allSeedNames = seedArtists.map((a) => a.name);

  for (let i = 0; i < seedArtists.length; i++) {
    const seed = seedArtists[i];
    onProgress({
      phase: 'discover',
      current: i,
      total: seedArtists.length,
      message: `Exploring music near ${seed.name}...`,
    });

    try {
      const discovered = await discoverRelatedArtists(seed, allSeedNames, 25);
      if (discovered && discovered.length > 0) {
        successCount++;
        for (const artist of discovered) {
          // Skip any artist that is itself a seed
          if (seedIds.has(artist.id)) continue;

          if (candidates.has(artist.id)) {
            candidates.get(artist.id).relatedToSeeds.add(seed.id);
          } else {
            candidates.set(artist.id, {
              artist,
              relatedToSeeds: new Set([seed.id]),
            });
          }
        }
      }
    } catch (err) {
      console.warn(`Discovery failed for ${seed.name}:`, err.message);
    }

    onProgress({
      phase: 'discover',
      current: i + 1,
      total: seedArtists.length,
      message: `Explored ${seed.name} (${candidates.size} artists found)`,
    });
  }

  console.log(`Discovery phase: ${successCount}/${seedArtists.length} seeds produced results, ${candidates.size} unique candidates`);

  if (candidates.size === 0) {
    throw new Error(
      'No artists discovered. Try different or more well-known artists.'
    );
  }

  // Phase 2: Enrich candidates that lack images with full artist details
  // Artists found via artist-type search already have images; only those
  // discovered through track search (name + ID only) need enrichment.
  onProgress({ phase: 'details', current: 0, total: 1, message: 'Gathering artist details...' });

  const needsEnrichment = [];
  for (const [id, candidate] of candidates) {
    if (!candidate.artist.image && !candidate.artist.imageLarge) {
      needsEnrichment.push(id);
    }
  }

  if (needsEnrichment.length > 0) {
    console.log(`Enriching ${needsEnrichment.length} of ${candidates.size} candidates`);
    try {
      const fullArtists = await getMultipleArtists(needsEnrichment);
      for (const artist of fullArtists) {
        if (candidates.has(artist.id)) {
          const existing = candidates.get(artist.id);
          existing.artist = { ...existing.artist, ...artist };
        }
      }
    } catch (err) {
      console.warn('Failed to fetch artist details:', err);
    }
  }

  onProgress({ phase: 'details', current: 1, total: 1, message: 'Details gathered.' });

  // Phase 3: Score candidates
  // Primary signal: how many seed artists this candidate appeared near (overlap count)
  onProgress({ phase: 'scoring', current: 0, total: 1, message: 'Analyzing connections...' });

  const seedCount = seedArtists.length;
  const scored = [];

  for (const [candidateId, candidate] of candidates) {
    const overlapCount = candidate.relatedToSeeds.size;
    const overlapScore = overlapCount / seedCount;

    scored.push({
      ...candidate.artist,
      id: candidateId,
      compositeScore: overlapScore,
      overlapScore,
      overlapCount,
      relatedToSeeds: Array.from(candidate.relatedToSeeds),
      relatedSeedNames: Array.from(candidate.relatedToSeeds)
        .map((id) => seedArtists.find((s) => s.id === id)?.name)
        .filter(Boolean),
    });
  }

  // Sort: most overlaps first, then alphabetically for ties
  scored.sort((a, b) => b.compositeScore - a.compositeScore || a.name.localeCompare(b.name));

  const topRecommendations = scored.slice(0, MAX_RECOMMENDATIONS);

  const multiOverlap = topRecommendations.filter((r) => r.overlapCount > 1);
  console.log(
    `Showing ${topRecommendations.length} of ${scored.length} candidates. ` +
    `${multiOverlap.length} connected to 2+ seeds.`
  );

  onProgress({ phase: 'scoring', current: 1, total: 1, message: 'Connections mapped.' });

  // Phase 4: Build graph
  onProgress({ phase: 'building', current: 0, total: 1, message: 'Forming your galaxy...' });

  const graphData = buildGraph(seedArtists, topRecommendations);

  onProgress({ phase: 'building', current: 1, total: 1, message: 'Galaxy ready!' });

  return graphData;
}

function buildGraph(seedArtists, recommendations) {
  const nodes = [];
  const links = [];
  const nodeMap = new Map();

  for (const seed of seedArtists) {
    const node = {
      id: seed.id,
      type: 'seed',
      name: seed.name,
      genres: seed.genres,
      popularity: seed.popularity,
      image: seed.image,
      imageLarge: seed.imageLarge,
      externalUrl: seed.externalUrl,
      compositeScore: 1,
    };
    nodes.push(node);
    nodeMap.set(seed.id, node);
  }

  for (const rec of recommendations) {
    const node = {
      id: rec.id,
      type: 'recommendation',
      name: rec.name,
      genres: rec.genres || [],
      popularity: rec.popularity || 0,
      image: rec.image,
      imageLarge: rec.imageLarge,
      externalUrl: rec.externalUrl,
      compositeScore: rec.compositeScore,
      overlapScore: rec.overlapScore,
      overlapCount: rec.overlapCount,
      relatedSeedNames: rec.relatedSeedNames,
      relatedToSeeds: rec.relatedToSeeds,
    };
    nodes.push(node);
    nodeMap.set(rec.id, node);
  }

  // Link each recommendation to its related seeds
  for (const rec of recommendations) {
    for (const seedId of rec.relatedToSeeds) {
      if (nodeMap.has(seedId)) {
        links.push({
          source: rec.id,
          target: seedId,
          strength: 0.2 + rec.compositeScore * 0.5,
        });
      }
    }
  }

  // Link seeds that share at least 1 recommendation
  const seedArray = seedArtists.map((s) => s.id);
  for (let i = 0; i < seedArray.length; i++) {
    for (let j = i + 1; j < seedArray.length; j++) {
      const a = seedArray[i];
      const b = seedArray[j];
      let sharedCount = 0;
      for (const rec of recommendations) {
        if (rec.relatedToSeeds.includes(a) && rec.relatedToSeeds.includes(b)) {
          sharedCount++;
        }
      }
      if (sharedCount >= 1) {
        links.push({
          source: a,
          target: b,
          strength: Math.min(0.8, 0.1 + sharedCount * 0.05),
        });
      }
    }
  }

  const genreClusters = clusterByGenre(nodes);

  return { nodes, links, genreClusters };
}
