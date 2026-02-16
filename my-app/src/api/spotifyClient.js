import { getRateLimiter } from './rateLimiter';

const PROXY_BASE = '/v1';

async function spotifyFetch(endpoint, params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null) {
      query.set(key, String(val));
    }
  });
  const qs = query.toString();
  const fetchUrl = `${PROXY_BASE}${endpoint}${qs ? `?${qs}` : ''}`;

  const response = await fetch(fetchUrl);

  if (!response.ok) {
    const err = new Error(`Spotify API error: ${response.status}`);
    err.status = response.status;
    if (response.status === 429) {
      err.retryAfter = parseInt(response.headers.get('Retry-After') || '2', 10);
    }
    throw err;
  }

  return response.json();
}

function rateLimitedFetch(endpoint, params) {
  const limiter = getRateLimiter();
  return limiter.enqueue(() => spotifyFetch(endpoint, params));
}

export async function searchArtists(query, limit = 6) {
  if (!query || query.trim().length < 2) return [];
  const data = await rateLimitedFetch('/search', {
    q: query,
    type: 'artist',
    limit,
  });
  return (data.artists?.items || []).map(mapArtist);
}

export async function searchTracks(query, limit = 10) {
  if (!query || query.trim().length < 2) return [];
  const data = await rateLimitedFetch('/search', {
    q: query,
    type: 'track',
    limit: Math.min(limit, 10),
  });
  return (data.tracks?.items || []).map(mapTrack);
}

export async function getArtist(artistId) {
  const data = await rateLimitedFetch(`/artists/${artistId}`);
  return mapArtist(data);
}

export async function getMultipleArtists(artistIds) {
  if (artistIds.length === 0) return [];

  // Try batch endpoint first; fall back to individual requests if 403
  try {
    const firstBatch = artistIds.slice(0, Math.min(50, artistIds.length));
    const testData = await rateLimitedFetch('/artists', {
      ids: firstBatch.join(','),
    });
    const results = (testData.artists || []).filter(Boolean).map(mapArtist);

    // Batch works — continue with remaining batches
    for (let i = 50; i < artistIds.length; i += 50) {
      const batch = artistIds.slice(i, i + 50);
      const data = await rateLimitedFetch('/artists', {
        ids: batch.join(','),
      });
      results.push(...(data.artists || []).filter(Boolean).map(mapArtist));
    }
    return results;
  } catch (err) {
    if (err.status === 403) {
      console.warn('Batch artist endpoint restricted — using individual requests');
      // Fall back to individual artist fetches
      const results = [];
      for (const id of artistIds) {
        try {
          const data = await rateLimitedFetch(`/artists/${id}`);
          results.push(mapArtist(data));
        } catch (innerErr) {
          // Skip artists that fail individually
          if (innerErr.status !== 403) {
            console.warn(`Failed to fetch artist ${id}:`, innerErr.message);
          }
        }
      }
      return results;
    }
    throw err;
  }
}

// Max search limit for this Spotify app (newer Client Credentials apps are capped at 10)
const SEARCH_LIMIT = 10;

// Helper: paginated search that fetches multiple pages
async function paginatedSearch(query, type, totalWanted) {
  const allItems = [];
  const pages = Math.ceil(totalWanted / SEARCH_LIMIT);
  for (let page = 0; page < pages; page++) {
    try {
      const data = await rateLimitedFetch('/search', {
        q: query,
        type,
        limit: SEARCH_LIMIT,
        offset: page * SEARCH_LIMIT,
      });
      const key = type === 'artist' ? 'artists' : 'tracks';
      const items = data[key]?.items || [];
      allItems.push(...items);
      if (items.length < SEARCH_LIMIT) break; // no more results
    } catch (err) {
      // If limit/offset fails, just return what we have
      if (err.status === 400) break;
      throw err;
    }
  }
  return allItems;
}

// Search-based discovery: find artists related to a seed using multiple
// search strategies since related-artists endpoint is restricted.
// With Client Credentials on newer apps, only Search and basic Artist endpoints work.
// Genres and popularity fields often come back empty.
//
// Key finding: Spotify's artist-type search relevance algorithm naturally
// returns similar/related artists. Searching "Radiohead" as type=artist
// returns Thom Yorke, Nirvana, Billie Eilish, etc. This is our primary signal.
// Cross-searching "Radiohead Muse" returns artists in their musical intersection.
export async function discoverRelatedArtists(seedArtist, allSeedNames = [], limit = 25) {
  const allArtists = new Map();
  const seedName = seedArtist.name;
  const seedId = seedArtist.id;

  // Collect artists from artist-type search results (includes images, etc.)
  // filterName: if provided, reject candidates that look like false-positive name matches
  function collectFromArtistSearch(artists, filterName = null) {
    for (const artist of artists) {
      if (artist.id === seedId || allArtists.has(artist.id)) continue;
      if (filterName && isLikelyNameOnlyMatch(filterName, artist.name)) continue;
      allArtists.set(artist.id, {
        id: artist.id,
        name: artist.name,
        genres: artist.genres || [],
        popularity: artist.popularity || 0,
        followers: artist.followers?.total || 0,
        externalUrl: artist.external_urls?.spotify,
        image: getBestImage(artist.images, 160),
        imageLarge: getBestImage(artist.images, 320),
      });
    }
  }

  // Collect artists mentioned in track results (collaborators, features)
  // No name filtering here — track-based discovery uses associations, not name matching
  function collectFromTracks(tracks) {
    for (const track of tracks) {
      for (const artist of track.artists || []) {
        if (artist.id === seedId || allArtists.has(artist.id)) continue;
        allArtists.set(artist.id, {
          id: artist.id,
          name: artist.name,
          externalUrl: artist.external_urls?.spotify,
        });
      }
    }
  }

  // === PRIMARY: Artist search by name (paginated, 3 pages = 30 results) ===
  // Spotify's relevance algorithm returns artists in the same musical space.
  // Filter out false-positive name-fragment matches (e.g., "Super___" from "Superheaven").
  try {
    const artists = await paginatedSearch(seedName, 'artist', 30);
    collectFromArtistSearch(artists, seedName);
  } catch (err) {
    console.warn(`Artist search failed for "${seedName}":`, err.message);
  }

  // === CROSS-SEARCH: Combine with other seed names ===
  // "Radiohead Muse" returns artists in their musical intersection
  if (allSeedNames.length > 0) {
    const otherSeeds = allSeedNames.filter((n) => n !== seedName).slice(0, 4);
    for (const otherName of otherSeeds) {
      if (allArtists.size >= limit) break;
      try {
        const artists = await paginatedSearch(`${seedName} ${otherName}`, 'artist', 10);
        collectFromArtistSearch(artists, seedName);
      } catch (err) {
        console.warn(`Cross search failed for "${seedName} + ${otherName}":`, err.message);
      }
    }
  }

  // === TRACK SEARCH: Find collaborators via track results ===
  if (allArtists.size < limit) {
    try {
      const tracks = await paginatedSearch(seedName, 'track', 10);
      collectFromTracks(tracks);
    } catch (err) {
      console.warn(`Track search failed for "${seedName}":`, err.message);
    }
  }

  // === COLLABORATION SEARCH: "artist feat" for features ===
  if (allArtists.size < limit) {
    try {
      const tracks = await paginatedSearch(`${seedName} feat`, 'track', 10);
      collectFromTracks(tracks);
    } catch (err) {
      console.warn(`Collab search failed for "${seedName}":`, err.message);
    }
  }

  // === GENRE SEARCH: Only if genres are populated (often empty on newer apps) ===
  if (allArtists.size < limit && seedArtist.genres && seedArtist.genres.length > 0) {
    for (const genre of seedArtist.genres.slice(0, 2)) {
      if (allArtists.size >= limit) break;
      try {
        const artists = await paginatedSearch(`genre:"${genre}"`, 'artist', 10);
        collectFromArtistSearch(artists);
      } catch (err) {
        console.warn(`Genre search failed for "${genre}":`, err.message);
      }
    }
  }

  console.log(`Discovery for ${seedName}: found ${allArtists.size} unique artists`);
  return Array.from(allArtists.values()).slice(0, limit);
}

// "Second hop" discovery: search for artists near high-scoring intermediate
// discoveries rather than seeds directly. This finds less obvious connections.
export async function discoverDeepCuts(intermediateArtists, seedIds, limit = 15) {
  const allArtists = new Map();
  const seedIdSet = new Set(seedIds);
  const intermediateIds = new Set(intermediateArtists.map((a) => a.id));
  const modifiers = ['acoustic', 'underground', 'indie', 'live'];

  for (const intermediate of intermediateArtists.slice(0, 5)) {
    if (allArtists.size >= limit) break;

    // Strategy 1: Search by intermediate artist name
    try {
      const artists = await paginatedSearch(intermediate.name, 'artist', 10);
      for (const artist of artists) {
        if (seedIdSet.has(artist.id) || intermediateIds.has(artist.id) || allArtists.has(artist.id)) continue;
        if (isLikelyNameOnlyMatch(intermediate.name, artist.name)) continue;
        allArtists.set(artist.id, {
          id: artist.id,
          name: artist.name,
          genres: artist.genres || [],
          popularity: artist.popularity || 0,
          followers: artist.followers?.total || 0,
          externalUrl: artist.external_urls?.spotify,
          image: getBestImage(artist.images, 160),
          imageLarge: getBestImage(artist.images, 320),
          discoveredVia: intermediate.id,
          discoveredViaName: intermediate.name,
        });
      }
    } catch (err) {
      console.warn(`Deep cut search failed for "${intermediate.name}":`, err.message);
    }

    // Strategy 2: Modified queries for more lateral results
    for (const mod of modifiers.slice(0, 2)) {
      if (allArtists.size >= limit) break;
      try {
        const artists = await paginatedSearch(`${intermediate.name} ${mod}`, 'artist', 10);
        for (const artist of artists) {
          if (seedIdSet.has(artist.id) || intermediateIds.has(artist.id) || allArtists.has(artist.id)) continue;
          if (isLikelyNameOnlyMatch(intermediate.name, artist.name)) continue;
          allArtists.set(artist.id, {
            id: artist.id,
            name: artist.name,
            genres: artist.genres || [],
            popularity: artist.popularity || 0,
            followers: artist.followers?.total || 0,
            externalUrl: artist.external_urls?.spotify,
            image: getBestImage(artist.images, 160),
            imageLarge: getBestImage(artist.images, 320),
            discoveredVia: intermediate.id,
            discoveredViaName: intermediate.name,
          });
        }
      } catch (err) {
        // Skip modifier failures silently
      }
    }
  }

  console.log(`Deep cut discovery: found ${allArtists.size} unique artists`);
  return Array.from(allArtists.values()).slice(0, limit);
}

// Bridge discovery: find artists that connect two otherwise-disconnected seeds.
// Uses creative cross-queries to find artists in the intersection of two styles.
export async function discoverBridgeArtists(seedA, seedB, limit = 8) {
  const allArtists = new Map();
  const excludeIds = new Set([seedA.id, seedB.id]);

  function collectArtist(artist) {
    if (excludeIds.has(artist.id) || allArtists.has(artist.id)) return;
    // For bridges, reject only if the name is a false positive for BOTH seeds
    if (isLikelyNameOnlyMatch(seedA.name, artist.name) &&
        isLikelyNameOnlyMatch(seedB.name, artist.name)) return;
    allArtists.set(artist.id, {
      id: artist.id,
      name: artist.name,
      genres: artist.genres || [],
      popularity: artist.popularity || 0,
      followers: artist.followers?.total || 0,
      externalUrl: artist.external_urls?.spotify,
      image: getBestImage(artist.images, 160),
      imageLarge: getBestImage(artist.images, 320),
      isBridge: true,
      bridgesBetween: [seedA.id, seedB.id],
      bridgeSeedNames: [seedA.name, seedB.name],
    });
  }

  // Strategy 1: Reversed name combination search
  try {
    const artists = await paginatedSearch(`${seedB.name} ${seedA.name}`, 'artist', 20);
    artists.forEach(collectArtist);
  } catch (err) {
    console.warn(`Bridge search failed for "${seedB.name} ${seedA.name}":`, err.message);
  }

  // Strategy 2: Track search combining both names
  if (allArtists.size < limit) {
    try {
      const tracks = await paginatedSearch(`${seedA.name} ${seedB.name}`, 'track', 10);
      for (const track of tracks) {
        for (const artist of track.artists || []) {
          if (excludeIds.has(artist.id) || allArtists.has(artist.id)) continue;
          allArtists.set(artist.id, {
            id: artist.id,
            name: artist.name,
            externalUrl: artist.external_urls?.spotify,
            isBridge: true,
            bridgesBetween: [seedA.id, seedB.id],
            bridgeSeedNames: [seedA.name, seedB.name],
          });
        }
      }
    } catch (err) {
      console.warn(`Bridge track search failed:`, err.message);
    }
  }

  // Strategy 3: Genre cross-pollination (if genres available)
  if (allArtists.size < limit && seedA.genres?.length > 0) {
    try {
      const artists = await paginatedSearch(`${seedA.genres[0]} ${seedB.name}`, 'artist', 10);
      artists.forEach(collectArtist);
    } catch (err) { /* skip */ }
  }
  if (allArtists.size < limit && seedB.genres?.length > 0) {
    try {
      const artists = await paginatedSearch(`${seedB.genres[0]} ${seedA.name}`, 'artist', 10);
      artists.forEach(collectArtist);
    } catch (err) { /* skip */ }
  }

  console.log(`Bridge discovery (${seedA.name} ↔ ${seedB.name}): found ${allArtists.size} artists`);
  return Array.from(allArtists.values()).slice(0, limit);
}

// Search for tracks by an artist to get playable preview data
export async function findArtistTrack(artistName) {
  try {
    const data = await rateLimitedFetch('/search', {
      q: `artist:"${artistName}"`,
      type: 'track',
      limit: 10,
    });
    const tracks = (data.tracks?.items || []).map(mapTrack);
    // Prefer tracks with preview URLs
    const withPreview = tracks.find((t) => t.previewUrl);
    return withPreview || tracks[0] || null;
  } catch (err) {
    console.warn(`Track search failed for ${artistName}:`, err.message);
    return null;
  }
}

function mapArtist(artist) {
  return {
    id: artist.id,
    name: artist.name,
    genres: artist.genres || [],
    popularity: artist.popularity || 0,
    image: getBestImage(artist.images, 160),
    imageLarge: getBestImage(artist.images, 320),
    followers: artist.followers?.total || 0,
    externalUrl: artist.external_urls?.spotify,
  };
}

function mapTrack(track) {
  return {
    id: track.id,
    name: track.name,
    previewUrl: track.preview_url,
    durationMs: track.duration_ms,
    albumName: track.album?.name,
    albumImage: getBestImage(track.album?.images, 64),
    albumImageLarge: getBestImage(track.album?.images, 300),
    artistName: track.artists?.[0]?.name,
    artistId: track.artists?.[0]?.id,
    externalUrl: track.external_urls?.spotify,
  };
}

// Detect when a candidate artist likely only appeared in search results because
// of a superficial name fragment match rather than genuine musical relevance.
// Returns true if the candidate should be REJECTED (it's a false positive).
//
// Examples:
//   isLikelyNameOnlyMatch("Superheaven", "Super Cat")     → true  (shares "super", otherwise unrelated)
//   isLikelyNameOnlyMatch("Superheaven", "Superheaven")   → false (exact match)
//   isLikelyNameOnlyMatch("Superheaven", "Title Fight")   → false (no shared tokens — kept as musical relevance)
//   isLikelyNameOnlyMatch("10 Years", "10,000 Maniacs")   → true  (shares only "10")
//   isLikelyNameOnlyMatch("10 Years", "Chevelle")         → false (no shared tokens)
//   isLikelyNameOnlyMatch("Radiohead", "Thom Yorke")      → false (no shared tokens)
function isLikelyNameOnlyMatch(seedName, candidateName) {
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
  // A seed token like "superheaven" contains "super" as a prefix
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
  // certainly a false positive — the match is just a short/numeric coincidence
  if (allWeak) return true;

  // For stronger shared tokens: check what percentage of the candidate's name
  // is made up of shared content. If the candidate is mostly "new" words that
  // have nothing to do with the seed, it's a false positive.
  const candidateNonShared = candidateTokens.filter(ct =>
    !sharedExact.includes(ct) && !sharedPartial.includes(ct)
  );

  // If candidate has significant non-shared content, it's likely a different artist
  // that just happens to share a word. E.g., "Super Cat" shares "super" with
  // "Superheaven" but "cat" is completely unrelated.
  if (candidateNonShared.length >= 1 && sharedExact.length <= 1 && sharedPartial.length <= 1) {
    // The candidate shares at most 1 word with the seed and has other unrelated words
    // This is the classic false positive pattern
    const sharedCharLen = allSharedTokens.reduce((sum, t) => sum + t.length, 0);
    const totalCharLen = candidateTokens.reduce((sum, t) => sum + t.length, 0);
    const sharedRatio = sharedCharLen / totalCharLen;

    // If less than half the candidate's name is shared content, reject
    if (sharedRatio < 0.5) return true;
  }

  return false;
}

function getBestImage(images, targetSize) {
  if (!images || images.length === 0) return null;
  const sorted = [...images].sort(
    (a, b) =>
      Math.abs((a.width || 0) - targetSize) -
      Math.abs((b.width || 0) - targetSize)
  );
  return sorted[0]?.url || null;
}
