import { discoverRelatedArtists, discoverDeepCuts, discoverBridgeArtists, enrichArtists, clearCache } from '../api/musicClient';
import {
  MAX_RECOMMENDATIONS,
  HIDDEN_GEM_FAN_THRESHOLD,
  DEEP_CUT_INTERMEDIATE_COUNT,
  DEEP_CUT_LIMIT,
  BRIDGE_SEARCH_LIMIT,
  MAX_BRIDGE_PAIRS,
} from '../utils/constants';
import { clusterByGenre } from './genreAnalysis';

export async function generateRecommendations(seedArtists, onProgress) {
  // Clear similar-artist cache from previous runs
  clearCache();

  const seedIds = new Set(seedArtists.map((a) => a.id));
  const seedIdArray = Array.from(seedIds);

  // ================================================================
  // Phase 1: Standard discovery — search for related artists per seed
  // ================================================================
  onProgress({ phase: 'discover', current: 0, total: seedArtists.length, message: 'Discovering related artists...' });

  const candidates = new Map(); // candidateId -> { artist, relatedToSeeds: Set, discoveryMethod }
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
          if (seedIds.has(artist.id)) continue;

          if (candidates.has(artist.id)) {
            candidates.get(artist.id).relatedToSeeds.add(seed.id);
          } else {
            candidates.set(artist.id, {
              artist,
              relatedToSeeds: new Set([seed.id]),
              discoveryMethod: 'standard',
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

  console.log(`Phase 1: ${successCount}/${seedArtists.length} seeds produced results, ${candidates.size} unique candidates`);

  // ================================================================
  // Phase 2: Identify intermediates + disconnected seed pairs
  // ================================================================
  onProgress({ phase: 'discover', current: seedArtists.length, total: seedArtists.length, message: 'Analyzing connections...' });

  // Score phase-1 candidates by overlap to pick intermediates
  const phase1Scored = [];
  for (const [id, candidate] of candidates) {
    phase1Scored.push({
      id,
      name: candidate.artist.name,
      overlapCount: candidate.relatedToSeeds.size,
      relatedToSeeds: candidate.relatedToSeeds,
    });
  }
  phase1Scored.sort((a, b) => b.overlapCount - a.overlapCount);

  // Pick top intermediates (must have overlap >= 1, prefer >= 2)
  const intermediates = phase1Scored
    .filter((c) => c.overlapCount >= 1)
    .slice(0, DEEP_CUT_INTERMEDIATE_COUNT)
    .map((c) => candidates.get(c.id).artist);

  // Find disconnected seed pairs (no shared candidates)
  const disconnectedPairs = [];
  for (let i = 0; i < seedIdArray.length; i++) {
    for (let j = i + 1; j < seedIdArray.length; j++) {
      const a = seedIdArray[i];
      const b = seedIdArray[j];
      let shared = false;
      for (const [, candidate] of candidates) {
        if (candidate.relatedToSeeds.has(a) && candidate.relatedToSeeds.has(b)) {
          shared = true;
          break;
        }
      }
      if (!shared) {
        disconnectedPairs.push([
          seedArtists.find((s) => s.id === a),
          seedArtists.find((s) => s.id === b),
        ]);
      }
    }
  }

  console.log(`Phase 2: ${intermediates.length} intermediates, ${disconnectedPairs.length} disconnected pairs`);

  // ================================================================
  // Phase 3: Deep cut discovery — "second hop" from intermediates
  // ================================================================
  const deepCutCandidates = new Map();

  if (intermediates.length > 0) {
    onProgress({ phase: 'deep_cuts', current: 0, total: 1, message: 'Searching for hidden gems...' });

    try {
      const deepCuts = await discoverDeepCuts(intermediates, seedIdArray, DEEP_CUT_LIMIT);

      for (const artist of deepCuts) {
        if (seedIds.has(artist.id)) continue;

        if (candidates.has(artist.id)) {
          // Already found in standard discovery — enrich with deep cut info
          const existing = candidates.get(artist.id);
          existing.artist.discoveredVia = artist.discoveredVia;
          existing.artist.discoveredViaName = artist.discoveredViaName;
          continue;
        }

        if (deepCutCandidates.has(artist.id)) continue;

        // Find which seeds the intermediate is connected to
        const intermediateCandidate = candidates.get(artist.discoveredVia);
        const relatedSeeds = intermediateCandidate
          ? new Set(intermediateCandidate.relatedToSeeds)
          : new Set();

        // If no seed connection through intermediate, link to first seed
        if (relatedSeeds.size === 0 && seedIdArray.length > 0) {
          relatedSeeds.add(seedIdArray[0]);
        }

        deepCutCandidates.set(artist.id, {
          artist,
          relatedToSeeds: relatedSeeds,
          discoveryMethod: 'deep_cut',
        });
      }
    } catch (err) {
      console.warn('Deep cut discovery failed:', err.message);
    }

    onProgress({ phase: 'deep_cuts', current: 1, total: 1, message: `Found ${deepCutCandidates.size} hidden gems` });
  }

  console.log(`Phase 3: ${deepCutCandidates.size} deep cut candidates`);

  // ================================================================
  // Phase 4: Bridge discovery — connect disconnected seed pairs
  // ================================================================
  const bridgeCandidates = new Map();

  if (disconnectedPairs.length > 0) {
    const pairsToSearch = disconnectedPairs.slice(0, MAX_BRIDGE_PAIRS);
    onProgress({ phase: 'bridges', current: 0, total: pairsToSearch.length, message: 'Building bridges between styles...' });

    for (let i = 0; i < pairsToSearch.length; i++) {
      const [seedA, seedB] = pairsToSearch[i];
      onProgress({
        phase: 'bridges',
        current: i,
        total: pairsToSearch.length,
        message: `Connecting ${seedA.name} & ${seedB.name}...`,
      });

      try {
        const bridges = await discoverBridgeArtists(seedA, seedB, BRIDGE_SEARCH_LIMIT);

        for (const artist of bridges) {
          if (seedIds.has(artist.id)) continue;

          if (candidates.has(artist.id)) {
            // Already in standard candidates — add both seeds as connections
            const existing = candidates.get(artist.id);
            existing.relatedToSeeds.add(seedA.id);
            existing.relatedToSeeds.add(seedB.id);
            existing.artist.isBridge = true;
            existing.artist.bridgesBetween = artist.bridgesBetween;
            existing.artist.bridgeSeedNames = artist.bridgeSeedNames;
            continue;
          }

          if (deepCutCandidates.has(artist.id)) {
            const existing = deepCutCandidates.get(artist.id);
            existing.relatedToSeeds.add(seedA.id);
            existing.relatedToSeeds.add(seedB.id);
            continue;
          }

          if (bridgeCandidates.has(artist.id)) {
            const existing = bridgeCandidates.get(artist.id);
            existing.relatedToSeeds.add(seedA.id);
            existing.relatedToSeeds.add(seedB.id);
            continue;
          }

          bridgeCandidates.set(artist.id, {
            artist,
            relatedToSeeds: new Set([seedA.id, seedB.id]),
            discoveryMethod: 'bridge',
          });
        }
      } catch (err) {
        console.warn(`Bridge discovery failed for ${seedA.name} & ${seedB.name}:`, err.message);
      }

      onProgress({
        phase: 'bridges',
        current: i + 1,
        total: pairsToSearch.length,
        message: `Connected ${seedA.name} & ${seedB.name}`,
      });
    }
  }

  console.log(`Phase 4: ${bridgeCandidates.size} bridge candidates`);

  // ================================================================
  // Phase 5: Enrich candidates — images (Deezer) + tags (Last.fm)
  // Split into two lists: those missing images vs those only missing tags.
  // Discovery phases already enriched most with Deezer data (cached),
  // so the image list is usually small. Tags are fetched in parallel.
  // ================================================================
  onProgress({ phase: 'details', current: 0, total: 1, message: 'Gathering artist details...' });

  const allCandidateMaps = [candidates, deepCutCandidates, bridgeCandidates];
  const needsImages = new Set();  // Artists missing images (need Deezer lookup)
  const needsTags = new Set();    // Artists missing genres (need Last.fm tags)

  for (const map of allCandidateMaps) {
    for (const [, candidate] of map) {
      const name = candidate.artist.name;
      if (!candidate.artist.image && !candidate.artist.imageLarge) {
        needsImages.add(name);
      }
      if (!candidate.artist.genres || candidate.artist.genres.length === 0) {
        needsTags.add(name);
      }
    }
  }

  // Combine into one enrichment call (musicClient runs Deezer + Last.fm in parallel)
  const allNeedEnrichment = new Set([...needsImages, ...needsTags]);

  if (allNeedEnrichment.size > 0) {
    console.log(`Enriching: ${needsImages.size} need images, ${needsTags.size} need tags (${allNeedEnrichment.size} unique)`);
    try {
      const enrichedData = await enrichArtists(Array.from(allNeedEnrichment));
      for (const map of allCandidateMaps) {
        for (const [, candidate] of map) {
          const data = enrichedData.get(candidate.artist.name.toLowerCase().trim());
          if (data) {
            if (!candidate.artist.image && data.image) {
              candidate.artist.image = data.image;
            }
            if (!candidate.artist.imageLarge && data.imageLarge) {
              candidate.artist.imageLarge = data.imageLarge;
            }
            if (data.id && candidate.artist.id.startsWith('lastfm-')) {
              candidate.artist.id = data.id;
            }
            if (data.nbFan && !candidate.artist.nbFan) {
              candidate.artist.nbFan = data.nbFan;
            }
            if (data.externalUrl && !candidate.artist.externalUrl) {
              candidate.artist.externalUrl = data.externalUrl;
            }
            if (data.genres && data.genres.length > 0 && (!candidate.artist.genres || candidate.artist.genres.length === 0)) {
              candidate.artist.genres = data.genres;
            }
          }
        }
      }
    } catch (err) {
      console.warn('Failed to enrich artist details:', err);
    }
  }

  onProgress({ phase: 'details', current: 1, total: 1, message: 'Details gathered.' });

  // ================================================================
  // Phase 6: Score, classify tiers, select top recommendations
  // ================================================================
  onProgress({ phase: 'scoring', current: 0, total: 1, message: 'Analyzing connections...' });

  const seedCount = seedArtists.length;

  // Merge all candidates for scoring
  const allCandidates = new Map();
  for (const map of allCandidateMaps) {
    for (const [id, candidate] of map) {
      if (!allCandidates.has(id)) {
        allCandidates.set(id, candidate);
      }
    }
  }

  // Compute dynamic fan-count threshold
  const allFanCounts = Array.from(allCandidates.values())
    .map((c) => c.artist.nbFan || 0)
    .filter((f) => f > 0)
    .sort((a, b) => a - b);

  const fanThreshold = allFanCounts.length > 0
    ? allFanCounts[Math.floor(allFanCounts.length * 0.3)]
    : HIDDEN_GEM_FAN_THRESHOLD;

  console.log(`Fan threshold for tier classification: ${fanThreshold}`);

  // Score and classify each candidate
  const popularScored = [];
  const hiddenGemScored = [];

  for (const [candidateId, candidate] of allCandidates) {
    const overlapCount = candidate.relatedToSeeds.size;
    const overlapScore = overlapCount / seedCount;
    const fans = candidate.artist.nbFan || 0;
    const method = candidate.discoveryMethod;

    // Classify tier — use matchScore + fan count + discovery method
    const matchScore = candidate.artist.matchScore || 0;
    let tier;
    if (method === 'deep_cut') {
      tier = 'hidden_gem';
    } else if (method === 'bridge') {
      tier = 'hidden_gem';
    } else if (matchScore >= 0.3 && fans >= fanThreshold && overlapCount >= 2) {
      // Strong similarity + well-known + multi-seed overlap → popular
      tier = 'popular';
    } else if (matchScore >= 0.2 && fans >= fanThreshold) {
      // Decent similarity + well-known → popular
      tier = 'popular';
    } else {
      // Low similarity score, low fan count, or single-seed overlap → hidden gem
      tier = 'hidden_gem';
    }

    // Score based on tier
    let compositeScore;
    if (tier === 'popular') {
      // Blend overlap (how many seeds connect) with Last.fm match strength
      compositeScore = overlapScore * 0.6 + matchScore * 0.4;
    } else {
      // Hidden gem scoring — blend overlap with match strength
      compositeScore = overlapScore * 0.2 + matchScore * 0.2;

      // Bridge bonus
      if (candidate.artist.isBridge || method === 'bridge') {
        compositeScore += 0.4;
      }

      // Deep cut bonus
      if (method === 'deep_cut') {
        compositeScore += 0.2;
      }

      // Uniqueness bonus (fewer fans = more unique)
      if (fans > 0) {
        const fanScore = 1 - Math.min(fans / 500000, 1);
        compositeScore += fanScore * 0.1;
      } else {
        compositeScore += 0.05;
      }

      compositeScore = Math.min(compositeScore, 1);
    }

    const scored = {
      ...candidate.artist,
      id: candidateId,
      compositeScore,
      overlapScore,
      overlapCount,
      tier,
      discoveryMethod: method,
      relatedToSeeds: Array.from(candidate.relatedToSeeds),
      relatedSeedNames: Array.from(candidate.relatedToSeeds)
        .map((id) => seedArtists.find((s) => s.id === id)?.name)
        .filter(Boolean),
    };

    if (tier === 'popular') {
      popularScored.push(scored);
    } else {
      hiddenGemScored.push(scored);
    }
  }

  // Sort each tier
  popularScored.sort((a, b) => b.compositeScore - a.compositeScore || a.name.localeCompare(b.name));
  hiddenGemScored.sort((a, b) => b.compositeScore - a.compositeScore || a.name.localeCompare(b.name));

  // Allocate slots: guarantee at least 30% hidden gems (min 15), up to 50%
  const MIN_GEM_RATIO = 0.30;
  const TARGET_GEM_RATIO = 0.45;

  const minGemSlots = Math.max(15, Math.round(MAX_RECOMMENDATIONS * MIN_GEM_RATIO));
  const targetGemSlots = Math.round(MAX_RECOMMENDATIONS * TARGET_GEM_RATIO);

  // Start with target allocation
  let gemSlots = Math.min(targetGemSlots, hiddenGemScored.length);
  let popularSlots = MAX_RECOMMENDATIONS - gemSlots;

  // If not enough popular to fill their slots, give more to gems
  if (popularScored.length < popularSlots) {
    popularSlots = popularScored.length;
    gemSlots = Math.min(MAX_RECOMMENDATIONS - popularSlots, hiddenGemScored.length);
  }

  // If not enough gems to fill target, give more to popular but enforce minimum
  if (hiddenGemScored.length < gemSlots) {
    gemSlots = hiddenGemScored.length;
    popularSlots = Math.min(MAX_RECOMMENDATIONS - gemSlots, popularScored.length);
  }

  // Enforce minimum gem slots if gems are available
  if (gemSlots < minGemSlots && hiddenGemScored.length >= minGemSlots) {
    gemSlots = minGemSlots;
    popularSlots = Math.min(MAX_RECOMMENDATIONS - gemSlots, popularScored.length);
  }

  let selectedPopular = popularScored.slice(0, popularSlots);
  let selectedGems = hiddenGemScored.slice(0, gemSlots);

  const topRecommendations = [...selectedPopular, ...selectedGems];

  console.log(
    `Phase 6: ${selectedPopular.length} popular + ${selectedGems.length} hidden gems = ${topRecommendations.length} total`
  );

  if (topRecommendations.length === 0 && candidates.size === 0) {
    throw new Error(
      'No artists discovered. Try different or more well-known artists.'
    );
  }

  onProgress({ phase: 'scoring', current: 1, total: 1, message: 'Connections mapped.' });

  // ================================================================
  // Phase 7: Build graph
  // ================================================================
  onProgress({ phase: 'building', current: 0, total: 1, message: 'Forming your galaxy...' });

  const graphData = buildGraph(seedArtists, topRecommendations, candidates);

  onProgress({ phase: 'building', current: 1, total: 1, message: 'Galaxy ready!' });

  return graphData;
}

function buildGraph(seedArtists, recommendations, standardCandidates) {
  const nodes = [];
  const links = [];
  const nodeMap = new Map();

  // Add seed nodes
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

  // Add recommendation nodes with tier info
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
      tier: rec.tier,
      discoveryMethod: rec.discoveryMethod,
      relatedSeedNames: rec.relatedSeedNames,
      relatedToSeeds: rec.relatedToSeeds,
      discoveredViaName: rec.discoveredViaName,
      isBridge: rec.isBridge,
      bridgeSeedNames: rec.bridgeSeedNames,
    };
    nodes.push(node);
    nodeMap.set(rec.id, node);
  }

  // Link each recommendation to its related seeds
  for (const rec of recommendations) {
    for (const seedId of rec.relatedToSeeds) {
      if (nodeMap.has(seedId)) {
        const isBridgeLink = rec.isBridge && rec.bridgesBetween?.includes(seedId);
        links.push({
          source: rec.id,
          target: seedId,
          strength: rec.tier === 'hidden_gem'
            ? 0.15 + rec.compositeScore * 0.3
            : 0.2 + rec.compositeScore * 0.5,
          isBridgeLink: isBridgeLink || false,
        });
      }
    }
  }

  // Link deep cuts to their intermediate artist (if present in graph)
  for (const rec of recommendations) {
    if (rec.discoveryMethod === 'deep_cut' && rec.discoveredVia && nodeMap.has(rec.discoveredVia)) {
      links.push({
        source: rec.id,
        target: rec.discoveredVia,
        strength: 0.15,
        isDeepCutLink: true,
      });
    }
  }

  // Link seeds that share at least 1 recommendation
  const seedArray = seedArtists.map((s) => s.id);
  const seedConnections = new Map(); // seedId -> Set of connected seedIds

  for (const seedId of seedArray) {
    seedConnections.set(seedId, new Set());
  }

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
        seedConnections.get(a).add(b);
        seedConnections.get(b).add(a);
      }
    }
  }

  // Guarantee full seed connectivity — no floating islands
  // Find isolated seeds and connect them to the most-connected seed (hub)
  for (const seedId of seedArray) {
    const connections = seedConnections.get(seedId);
    if (connections.size === 0) {
      // Find the seed with the most connections to act as hub
      let hubId = null;
      let maxConnections = -1;
      for (const otherId of seedArray) {
        if (otherId === seedId) continue;
        const otherConns = seedConnections.get(otherId).size;
        if (otherConns > maxConnections) {
          maxConnections = otherConns;
          hubId = otherId;
        }
      }

      if (hubId) {
        links.push({
          source: seedId,
          target: hubId,
          strength: 0.05,
          isBridgeLink: true,
        });
        seedConnections.get(seedId).add(hubId);
        seedConnections.get(hubId).add(seedId);
        console.log(`Connected isolated seed "${seedArtists.find((s) => s.id === seedId)?.name}" to hub`);
      }
    }
  }

  const genreClusters = clusterByGenre(nodes);

  return { nodes, links, genreClusters };
}
