import { createRateLimiter } from './rateLimiter';
import { API_BASE } from './config';

const DEEZER_PROXY = API_BASE + '/deezer';

// Separate rate limiter for Deezer
const limiter = createRateLimiter(5, 60);

// Cache Deezer lookups by artist name to avoid redundant searches
const deezerCache = new Map();

async function deezerFetch(path) {
  const fetchUrl = `${DEEZER_PROXY}${path}`;
  const response = await fetch(fetchUrl);

  if (!response.ok) {
    const err = new Error(`Deezer API error: ${response.status}`);
    err.status = response.status;
    throw err;
  }

  const data = await response.json();

  // Deezer returns errors inside 200 responses
  if (data.error) {
    const err = new Error(data.error.message || `Deezer error ${data.error.type}`);
    err.status = data.error.code;
    throw err;
  }

  return data;
}

function rateLimitedFetch(path) {
  return limiter.enqueue(() => deezerFetch(path));
}

// --- Mappers ---

function mapDeezerArtist(artist) {
  return {
    id: String(artist.id),
    name: artist.name,
    nbFan: artist.nb_fan || 0,
    image: artist.picture_medium || artist.picture || null,
    imageLarge: artist.picture_big || artist.picture_xl || null,
    externalUrl: artist.link || `https://www.deezer.com/artist/${artist.id}`,
  };
}

function mapDeezerTrack(track) {
  return {
    id: String(track.id),
    name: track.title || track.title_short,
    previewUrl: track.preview || null,
    durationMs: (track.duration || 30) * 1000,
    albumName: track.album?.title || '',
    albumImage: track.album?.cover_medium || track.album?.cover || null,
    albumImageLarge: track.album?.cover_big || track.album?.cover_xl || null,
    artistName: track.artist?.name || '',
    artistId: String(track.artist?.id || ''),
    externalUrl: track.link || `https://www.deezer.com/track/${track.id}`,
  };
}

// --- Public API ---

/**
 * Search for artists by name.
 * Returns Deezer artists with images and fan counts.
 */
export async function searchArtists(query, limit = 6) {
  if (!query || query.trim().length < 2) return [];

  try {
    const data = await rateLimitedFetch(
      `/search/artist?q=${encodeURIComponent(query)}&limit=${limit}`
    );
    return (data.data || []).map(mapDeezerArtist);
  } catch (err) {
    console.warn(`Deezer search failed for "${query}":`, err.message);
    return [];
  }
}

/**
 * Get related artists for a Deezer artist ID.
 */
export async function getRelatedArtists(deezerId) {
  try {
    const data = await rateLimitedFetch(`/artist/${deezerId}/related`);
    return (data.data || []).map(mapDeezerArtist);
  } catch (err) {
    console.warn(`Deezer related failed for ${deezerId}:`, err.message);
    return [];
  }
}

/**
 * Get top tracks for an artist (includes 30-second preview URLs).
 */
export async function getArtistTopTracks(deezerId, limit = 5) {
  try {
    const data = await rateLimitedFetch(`/artist/${deezerId}/top?limit=${limit}`);
    return (data.data || []).map(mapDeezerTrack);
  } catch (err) {
    console.warn(`Deezer top tracks failed for ${deezerId}:`, err.message);
    return [];
  }
}

/**
 * Get full artist details by Deezer ID.
 */
export async function getArtist(deezerId) {
  try {
    const data = await rateLimitedFetch(`/artist/${deezerId}`);
    return mapDeezerArtist(data);
  } catch (err) {
    console.warn(`Deezer getArtist failed for ${deezerId}:`, err.message);
    return null;
  }
}

/**
 * Normalize an artist name for matching: lowercase, strip "the", punctuation.
 */
function normalizeName(s) {
  return s.toLowerCase()
    .trim()
    .replace(/^the\s+/, '')
    .replace(/[''`]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if a Deezer search result name matches the expected artist name.
 * Prevents returning a wrong artist when a smaller band shares a name fragment
 * with a more popular one.
 */
function isDeezerNameMatch(expected, actual) {
  const a = normalizeName(expected);
  const b = normalizeName(actual);

  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;

  return false;
}

/**
 * Find a Deezer artist by name (cross-reference from Last.fm).
 * Returns the best match or null. Results are cached to avoid redundant lookups.
 * Validates the returned name matches the query to avoid wrong-artist results.
 */
export async function findArtistByName(artistName) {
  if (!artistName || artistName.trim().length < 1) return null;

  const cacheKey = artistName.toLowerCase().trim();

  // Check cache first
  if (deezerCache.has(cacheKey)) {
    return deezerCache.get(cacheKey);
  }

  try {
    // Fetch a few results so we can find a validated match
    const results = await searchArtists(artistName, 5);
    if (results.length === 0) {
      deezerCache.set(cacheKey, null);
      return null;
    }

    // Prefer exact case-insensitive match first
    const exact = results.find((a) => a.name.toLowerCase().trim() === cacheKey);
    if (exact) {
      deezerCache.set(cacheKey, exact);
      return exact;
    }

    // Then try fuzzy match — pick the first result whose name is close enough
    const fuzzy = results.find((a) => isDeezerNameMatch(artistName, a.name));
    if (fuzzy) {
      deezerCache.set(cacheKey, fuzzy);
      return fuzzy;
    }

    // No matching result — don't return a wrong artist
    console.warn(`Deezer: no name match for "${artistName}" in results: [${results.map(r => r.name).join(', ')}]`);
    deezerCache.set(cacheKey, null);
    return null;
  } catch (err) {
    console.warn(`Deezer findByName failed for "${artistName}":`, err.message);
    return null;
  }
}

/**
 * Batch enrichment: find Deezer data for multiple artist names.
 * Returns a Map of lowercase name → Deezer artist data.
 * Uses cache to skip already-looked-up artists and runs lookups concurrently.
 */
export async function enrichArtistsFromDeezer(artistNames) {
  const enriched = new Map();
  const uncached = [];

  // Separate cached from uncached
  for (const name of artistNames) {
    const key = name.toLowerCase().trim();
    if (deezerCache.has(key)) {
      const cached = deezerCache.get(key);
      if (cached) enriched.set(key, cached);
    } else {
      uncached.push(name);
    }
  }

  // Fetch uncached in larger concurrent batches
  const BATCH_SIZE = 10;
  for (let i = 0; i < uncached.length; i += BATCH_SIZE) {
    const batch = uncached.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map((name) => findArtistByName(name))
    );

    batch.forEach((name, idx) => {
      if (results[idx]) {
        enriched.set(name.toLowerCase().trim(), results[idx]);
      }
    });
  }

  return enriched;
}

/**
 * Clear the Deezer lookup cache.
 */
export function clearCache() {
  deezerCache.clear();
}
