/**
 * Build a Spotify search URL for a track.
 * Since we don't have Spotify track IDs, we use search queries.
 */
export function buildSpotifySearchUrl(track) {
  const query = `"${track.name}" "${track.artistName}"`;
  return `https://open.spotify.com/search/${encodeURIComponent(query)}`;
}

/**
 * Format track links for clipboard copy.
 * @param {Array} tracks - Array of track objects
 * @param {'links-only' | 'with-names'} format
 * @returns {string}
 */
export function formatTrackLinks(tracks, format = 'with-names') {
  return tracks
    .map((track, i) => {
      const url = buildSpotifySearchUrl(track);
      if (format === 'with-names') {
        return `${i + 1}. ${track.name} — ${track.artistName}\n${url}`;
      }
      return url;
    })
    .join('\n');
}

/**
 * Generate a CSV string from track data.
 * @param {Array} tracks - Array of track objects
 * @returns {string}
 */
export function generateCSV(tracks) {
  const headers = [
    'Track Name',
    'Artist',
    'Album',
    'Duration (s)',
    'Deezer URL',
    'Spotify Search URL',
    'Preview URL',
  ];

  const escapeCSV = (val) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = tracks.map((t) => [
    t.name,
    t.artistName,
    t.albumName,
    Math.round((t.durationMs || 30000) / 1000),
    t.externalUrl || t.deezerUrl || '',
    buildSpotifySearchUrl(t),
    t.previewUrl || '',
  ]);

  return [headers, ...rows].map((row) => row.map(escapeCSV).join(',')).join('\n');
}
