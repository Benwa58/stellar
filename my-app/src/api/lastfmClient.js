import { createRateLimiter } from './rateLimiter';
import { API_BASE } from './config';

const LASTFM_PROXY = API_BASE + '/lastfm';

// Tags that are user noise, not real genres
const TAG_BLACKLIST = new Set([
  'seen live', 'favorites', 'favourite', 'my music', 'check out',
  'awesome', 'love', 'beautiful', 'cool', 'amazing', 'epic',
  'under 2000 listeners', 'spotify', 'all', 'albums i own',
]);

// Separate rate limiter for Last.fm (~5/sec informal limit)
const limiter = createRateLimiter(4, 120);

async function lastfmFetch(method, params = {}) {
  const query = new URLSearchParams({ method, ...params });
  const fetchUrl = `${LASTFM_PROXY}?${query.toString()}`;

  const response = await fetch(fetchUrl);

  if (!response.ok) {
    const err = new Error(`Last.fm API error: ${response.status}`);
    err.status = response.status;
    throw err;
  }

  const data = await response.json();

  // Last.fm returns errors inside 200 responses
  if (data.error) {
    const err = new Error(data.message || `Last.fm error ${data.error}`);
    err.status = data.error;
    throw err;
  }

  return data;
}

function rateLimitedFetch(method, params) {
  return limiter.enqueue(() => lastfmFetch(method, params));
}

/**
 * Get similar artists for a given artist name.
 * Returns up to `limit` similar artists with match scores.
 */
export async function getSimilarArtists(artistName, limit = 100) {
  try {
    const data = await rateLimitedFetch('artist.getSimilar', {
      artist: artistName,
      limit: String(limit),
    });

    const artists = data.similarartists?.artist || [];
    // Last.fm sometimes returns a single object instead of array
    const list = Array.isArray(artists) ? artists : [artists];

    return list.map((a) => ({
      name: a.name,
      matchScore: parseFloat(a.match) || 0,
      mbid: a.mbid || null,
      lastfmUrl: a.url || null,
    }));
  } catch (err) {
    console.warn(`Last.fm getSimilar failed for "${artistName}":`, err.message);
    return [];
  }
}

/**
 * Get top tags (genres/styles) for an artist.
 * Filters out noise tags and returns clean genre strings.
 */
export async function getArtistTags(artistName, limit = 10) {
  try {
    const data = await rateLimitedFetch('artist.getTopTags', {
      artist: artistName,
    });

    const tags = data.toptags?.tag || [];
    const list = Array.isArray(tags) ? tags : [tags];

    return list
      .filter((t) => {
        const name = (t.name || '').toLowerCase().trim();
        return name.length > 0 && !TAG_BLACKLIST.has(name) && (t.count === undefined || t.count > 0);
      })
      .slice(0, limit)
      .map((t) => t.name.toLowerCase().trim());
  } catch (err) {
    console.warn(`Last.fm getTopTags failed for "${artistName}":`, err.message);
    return [];
  }
}

/**
 * Get full artist info including stats, tags, and bio.
 */
export async function getArtistInfo(artistName) {
  try {
    const data = await rateLimitedFetch('artist.getInfo', {
      artist: artistName,
    });

    const artist = data.artist;
    if (!artist) return null;

    return {
      name: artist.name,
      mbid: artist.mbid || null,
      listeners: parseInt(artist.stats?.listeners || '0', 10),
      playcount: parseInt(artist.stats?.playcount || '0', 10),
      tags: (artist.tags?.tag || []).map((t) => t.name.toLowerCase()),
      bio: artist.bio?.summary || '',
      url: artist.url || null,
    };
  } catch (err) {
    console.warn(`Last.fm getArtistInfo failed for "${artistName}":`, err.message);
    return null;
  }
}

/**
 * Search for artists by name on Last.fm.
 * Returns basic artist info (name, listeners, mbid).
 */
export async function searchArtists(artistName, limit = 5) {
  try {
    const data = await rateLimitedFetch('artist.search', {
      artist: artistName,
      limit: String(limit),
    });

    const artists = data.results?.artistmatches?.artist || [];
    const list = Array.isArray(artists) ? artists : [artists];

    return list.map((a) => ({
      name: a.name,
      listeners: parseInt(a.listeners || '0', 10),
      mbid: a.mbid || null,
      lastfmUrl: a.url || null,
    }));
  } catch (err) {
    console.warn(`Last.fm search failed for "${artistName}":`, err.message);
    return [];
  }
}

/**
 * Get top artists for a given tag (genre).
 * Uses tag.getTopArtists to find genre-adjacent artists for drift discovery.
 */
export async function getTopArtistsByTag(tag, limit = 50) {
  try {
    const data = await rateLimitedFetch('tag.getTopArtists', {
      tag,
      limit: String(limit),
    });

    const artists = data.topartists?.artist || [];
    const list = Array.isArray(artists) ? artists : [artists];

    return list
      .filter((a) => a.name)
      .map((a) => ({
        name: a.name,
        listeners: parseInt(a.stats?.listeners || a.listeners || '0', 10),
        mbid: a.mbid || null,
      }));
  } catch (err) {
    console.warn(`Last.fm getTopArtistsByTag failed for "${tag}":`, err.message);
    return [];
  }
}
