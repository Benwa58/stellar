import { createRateLimiter } from './rateLimiter';

const DEEZER_PROXY = '/deezer';

// Separate rate limiter for Deezer
const limiter = createRateLimiter(5, 60);

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
 * Find a Deezer artist by name (cross-reference from Last.fm).
 * Returns the best match or null.
 */
export async function findArtistByName(artistName) {
  if (!artistName || artistName.trim().length < 1) return null;

  try {
    const results = await searchArtists(artistName, 5);
    if (results.length === 0) return null;

    // Prefer exact case-insensitive match
    const lower = artistName.toLowerCase().trim();
    const exact = results.find((a) => a.name.toLowerCase().trim() === lower);
    if (exact) return exact;

    // Fall back to first result if it's reasonably close
    // (Deezer search relevance is usually good)
    return results[0];
  } catch (err) {
    console.warn(`Deezer findByName failed for "${artistName}":`, err.message);
    return null;
  }
}

/**
 * Batch enrichment: find Deezer data for multiple artist names.
 * Returns a Map of lowercase name → Deezer artist data.
 */
export async function enrichArtistsFromDeezer(artistNames) {
  const enriched = new Map();

  // Process in batches of 5 to avoid overwhelming the API
  const BATCH_SIZE = 5;
  for (let i = 0; i < artistNames.length; i += BATCH_SIZE) {
    const batch = artistNames.slice(i, i + BATCH_SIZE);
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
