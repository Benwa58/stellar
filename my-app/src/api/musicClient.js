/**
 * Unified music API client — combines Last.fm (similarity + tags) with Deezer (images + previews).
 * Replaces spotifyClient.js with the same exported function signatures.
 */
import * as lastfm from './lastfmClient';
import * as deezer from './deezerClient';

// Cache Last.fm similar-artist results so bridge discovery (Phase 4)
// can reuse data fetched during standard discovery (Phase 1).
const similarCache = new Map();

// ===================================================================
// Name-match false-positive filter (copied from spotifyClient.js)
// ===================================================================

// Detect when a candidate artist likely only appeared in search results because
// of a superficial name fragment match rather than genuine musical relevance.
// Returns true if the candidate should be REJECTED (it's a false positive).
export function isLikelyNameOnlyMatch(seedName, candidateName) {
  const seed = seedName.toLowerCase().trim();
  const candidate = candidateName.toLowerCase().trim();

  // Exact match is never a false positive
  if (seed === candidate) return false;

  // One contains the other fully — likely a variant, keep it
  if (seed.includes(candidate) || candidate.includes(seed)) return false;

  // Tokenize into words, strip common filler words
  const fillerWords = new Set(['the', 'a', 'an', 'of', 'and', '&', 'de', 'la', 'el', 'le', 'los', 'las', 'les', 'von', 'van', 'der', 'die', 'das']);
  const tokenize = (s) => s.split(/[\s\-_.,!?&]+/)
    .map(t => t.replace(/[^a-z0-9]/g, ''))
    .filter(t => t.length > 0 && !fillerWords.has(t));

  const seedTokens = tokenize(seed);
  const candidateTokens = tokenize(candidate);

  if (seedTokens.length === 0 || candidateTokens.length === 0) return false;

  // Find shared tokens (exact word matches)
  const sharedExact = seedTokens.filter(t => candidateTokens.includes(t));

  // Also check for prefix/substring matches (e.g., "super" matching "superheaven" tokens)
  const sharedPartial = candidateTokens.filter(ct =>
    !sharedExact.includes(ct) &&
    seedTokens.some(st =>
      (st.length >= 4 && ct.length >= 3 && (st.startsWith(ct) || ct.startsWith(st)))
    )
  );

  const totalShared = sharedExact.length + sharedPartial.length;

  // No shared tokens at all — this is a musical-relevance match, KEEP it
  if (totalShared === 0) return false;

  // Check if shared tokens are all "weak" (short or numeric)
  const allSharedTokens = [...sharedExact, ...sharedPartial];
  const isWeakToken = (t) => t.length <= 2 || /^\d+$/.test(t);
  const allWeak = allSharedTokens.every(isWeakToken);

  // If the only shared tokens are weak ones (like "10", "dj", "mc"), it's almost
  // certainly a false positive
  if (allWeak) return true;

  // For stronger shared tokens: check what percentage of the candidate's name
  // is made up of shared content.
  const candidateNonShared = candidateTokens.filter(ct =>
    !sharedExact.includes(ct) && !sharedPartial.includes(ct)
  );

  if (candidateNonShared.length >= 1 && sharedExact.length <= 1 && sharedPartial.length <= 1) {
    const sharedCharLen = allSharedTokens.reduce((sum, t) => sum + t.length, 0);
    const totalCharLen = candidateTokens.reduce((sum, t) => sum + t.length, 0);
    const sharedRatio = sharedCharLen / totalCharLen;

    // If less than half the candidate's name is shared content, reject
    if (sharedRatio < 0.5) return true;
  }

  return false;
}

// ===================================================================
// Artist search (for SearchBar)
// ===================================================================

/**
 * Search for artists by name.
 * Uses Deezer for search results (images + fan counts),
 * then enriches with Last.fm tags for genre data.
 */
export async function searchArtists(query, limit = 6) {
  if (!query || query.trim().length < 2) return [];

  // Get Deezer search results (has images)
  const deezerResults = await deezer.searchArtists(query, limit);

  if (deezerResults.length === 0) return [];

  // Enrich with Last.fm tags in parallel (best-effort)
  const tagPromises = deezerResults.map((artist) =>
    lastfm.getArtistTags(artist.name, 5).catch(() => [])
  );
  const allTags = await Promise.all(tagPromises);

  // Merge into unified artist objects
  return deezerResults.map((artist, i) => ({
    id: artist.id,
    name: artist.name,
    genres: allTags[i] || [],
    popularity: 0, // Not available; nbFan used instead
    nbFan: artist.nbFan,
    image: artist.image,
    imageLarge: artist.imageLarge,
    externalUrl: artist.externalUrl,
  }));
}

// ===================================================================
// Discovery functions (for recommendation engine)
// ===================================================================

/**
 * Discover related artists using Last.fm's scored similarity data.
 * This replaces the old multi-strategy search-based approach.
 */
export async function discoverRelatedArtists(seedArtist, allSeedNames = [], limit = 25) {
  const seedNamesLower = new Set(allSeedNames.map((n) => n.toLowerCase().trim()));

  // Get similar artists from Last.fm (up to 100, scored)
  let similar = similarCache.get(seedArtist.name.toLowerCase().trim());
  if (!similar) {
    similar = await lastfm.getSimilarArtists(seedArtist.name, 100);
    similarCache.set(seedArtist.name.toLowerCase().trim(), similar);
  }

  // Filter out seed artists and name-only matches
  const filtered = similar.filter((a) => {
    const nameLower = a.name.toLowerCase().trim();
    if (seedNamesLower.has(nameLower)) return false;
    if (isLikelyNameOnlyMatch(seedArtist.name, a.name)) return false;
    return true;
  });

  // Take top results by match score
  const top = filtered.slice(0, limit);

  // Enrich with Deezer data (images, IDs, fan counts)
  const enrichedMap = await deezer.enrichArtistsFromDeezer(top.map((a) => a.name));

  // Build unified artist objects
  const results = [];
  for (const similar of top) {
    const deezerData = enrichedMap.get(similar.name.toLowerCase().trim());

    results.push({
      id: deezerData?.id || `lastfm-${similar.mbid || similar.name}`,
      name: similar.name,
      genres: [], // Will be enriched later if needed
      popularity: 0,
      nbFan: deezerData?.nbFan || 0,
      image: deezerData?.image || null,
      imageLarge: deezerData?.imageLarge || null,
      externalUrl: deezerData?.externalUrl || similar.lastfmUrl || '',
      matchScore: similar.matchScore,
    });
  }

  return results;
}

/**
 * Deep cut discovery — "second hop" from intermediate artists.
 * Gets Last.fm similar artists for intermediates (artists found in Phase 1).
 */
export async function discoverDeepCuts(intermediateArtists, seedIds, limit = 15) {
  const seedIdSet = new Set(seedIds);
  const intermediateNames = new Set(intermediateArtists.map((a) => a.name.toLowerCase().trim()));
  const candidates = new Map(); // name → artist

  for (const intermediate of intermediateArtists) {
    // Get similar artists for this intermediate
    let similar = similarCache.get(intermediate.name.toLowerCase().trim());
    if (!similar) {
      similar = await lastfm.getSimilarArtists(intermediate.name, 30);
      similarCache.set(intermediate.name.toLowerCase().trim(), similar);
    }

    for (const s of similar) {
      const nameLower = s.name.toLowerCase().trim();

      // Skip seeds, intermediates, already found
      if (seedIdSet.has(nameLower)) continue;
      if (intermediateNames.has(nameLower)) continue;
      if (candidates.has(nameLower)) continue;

      // Name-match filter
      if (isLikelyNameOnlyMatch(intermediate.name, s.name)) continue;

      candidates.set(nameLower, {
        name: s.name,
        matchScore: s.matchScore,
        mbid: s.mbid,
        lastfmUrl: s.lastfmUrl,
        discoveredVia: intermediate.id,
        discoveredViaName: intermediate.name,
      });

      if (candidates.size >= limit) break;
    }

    if (candidates.size >= limit) break;
  }

  // Enrich with Deezer data
  const names = Array.from(candidates.values()).map((c) => c.name);
  const enrichedMap = await deezer.enrichArtistsFromDeezer(names);

  const results = [];
  for (const [, candidate] of candidates) {
    const deezerData = enrichedMap.get(candidate.name.toLowerCase().trim());

    results.push({
      id: deezerData?.id || `lastfm-${candidate.mbid || candidate.name}`,
      name: candidate.name,
      genres: [],
      popularity: 0,
      nbFan: deezerData?.nbFan || 0,
      image: deezerData?.image || null,
      imageLarge: deezerData?.imageLarge || null,
      externalUrl: deezerData?.externalUrl || candidate.lastfmUrl || '',
      matchScore: candidate.matchScore,
      discoveredVia: candidate.discoveredVia,
      discoveredViaName: candidate.discoveredViaName,
    });
  }

  return results;
}

/**
 * Bridge discovery — find artists that connect two disconnected seeds.
 * Intersects the similar-artist lists from Last.fm for both seeds.
 */
export async function discoverBridgeArtists(seedA, seedB, limit = 8) {
  // Get similar artists for both seeds (should be cached from Phase 1)
  let similarA = similarCache.get(seedA.name.toLowerCase().trim());
  if (!similarA) {
    similarA = await lastfm.getSimilarArtists(seedA.name, 100);
    similarCache.set(seedA.name.toLowerCase().trim(), similarA);
  }

  let similarB = similarCache.get(seedB.name.toLowerCase().trim());
  if (!similarB) {
    similarB = await lastfm.getSimilarArtists(seedB.name, 100);
    similarCache.set(seedB.name.toLowerCase().trim(), similarB);
  }

  // Find intersection — artists similar to BOTH seeds
  const setB = new Map(similarB.map((a) => [a.name.toLowerCase().trim(), a]));
  const bridges = [];

  for (const a of similarA) {
    const nameLower = a.name.toLowerCase().trim();
    const matchB = setB.get(nameLower);

    if (matchB) {
      // Skip if name-matches either seed
      if (isLikelyNameOnlyMatch(seedA.name, a.name) && isLikelyNameOnlyMatch(seedB.name, a.name)) {
        continue;
      }

      bridges.push({
        name: a.name,
        combinedScore: a.matchScore + matchB.matchScore,
        matchScoreA: a.matchScore,
        matchScoreB: matchB.matchScore,
        mbid: a.mbid,
        lastfmUrl: a.lastfmUrl,
      });
    }
  }

  // Sort by combined match score (strongest bridges first)
  bridges.sort((a, b) => b.combinedScore - a.combinedScore);
  const top = bridges.slice(0, limit);

  // Enrich with Deezer data
  const enrichedMap = await deezer.enrichArtistsFromDeezer(top.map((b) => b.name));

  return top.map((bridge) => {
    const deezerData = enrichedMap.get(bridge.name.toLowerCase().trim());

    return {
      id: deezerData?.id || `lastfm-${bridge.mbid || bridge.name}`,
      name: bridge.name,
      genres: [],
      popularity: 0,
      nbFan: deezerData?.nbFan || 0,
      image: deezerData?.image || null,
      imageLarge: deezerData?.imageLarge || null,
      externalUrl: deezerData?.externalUrl || bridge.lastfmUrl || '',
      matchScore: bridge.combinedScore / 2, // Average of both scores
      isBridge: true,
      bridgesBetween: [seedA.id, seedB.id],
      bridgeSeedNames: [seedA.name, seedB.name],
    };
  });
}

// ===================================================================
// Track lookup (for detail panel playback)
// ===================================================================

/**
 * Find a playable track for an artist using Deezer.
 * Returns a track object with a 30-second preview URL.
 */
export async function findArtistTrack(artistName) {
  try {
    const artist = await deezer.findArtistByName(artistName);
    if (!artist) return null;

    const tracks = await deezer.getArtistTopTracks(artist.id, 5);
    if (tracks.length === 0) return null;

    // Prefer tracks with preview URLs
    const withPreview = tracks.find((t) => t.previewUrl);
    return withPreview || tracks[0];
  } catch (err) {
    console.warn(`findArtistTrack failed for "${artistName}":`, err.message);
    return null;
  }
}

// ===================================================================
// Enrichment (for recommendation engine Phase 5)
// ===================================================================

/**
 * Enrich artists that are missing images by looking them up on Deezer.
 * Also fetches Last.fm tags for genre data.
 * Runs Deezer and Last.fm lookups in parallel for speed.
 * Returns a Map of lowercase name → enriched data.
 */
export async function enrichArtists(artistNames) {
  // Run Deezer and Last.fm lookups in parallel
  const [deezerMap, tagResults] = await Promise.all([
    deezer.enrichArtistsFromDeezer(artistNames),
    Promise.all(
      artistNames.map((name) => lastfm.getArtistTags(name, 5).catch(() => []))
    ),
  ]);

  const result = new Map();
  artistNames.forEach((name, i) => {
    const lower = name.toLowerCase().trim();
    const dz = deezerMap.get(lower);
    result.set(lower, {
      id: dz?.id || null,
      image: dz?.image || null,
      imageLarge: dz?.imageLarge || null,
      nbFan: dz?.nbFan || 0,
      externalUrl: dz?.externalUrl || '',
      genres: tagResults[i] || [],
    });
  });

  return result;
}

/**
 * Clear caches (useful between recommendation runs).
 */
export function clearCache() {
  similarCache.clear();
  deezer.clearCache();
}
