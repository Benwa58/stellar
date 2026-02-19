import { useState } from 'react';
import { exportPlaylist } from '../api/authClient';
import '../styles/auth.css';

function ExportPlaylistModal({ galaxyData, mapName, onClose }) {
  const [playlistName, setPlaylistName] = useState(`Stellar: ${mapName || 'Galaxy'}`);
  const [tracksPerArtist, setTracksPerArtist] = useState(1);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  if (!galaxyData) return null;

  const artists = galaxyData.nodes
    .filter((n) => n.name)
    .map((n) => ({ name: n.name }));

  const handleExport = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await exportPlaylist({
        name: playlistName,
        artists,
        tracksPerArtist,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Export failed');
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-modal-overlay" onClick={onClose}>
      <div className="auth-modal export-modal" onClick={(e) => e.stopPropagation()}>
        <button className="auth-modal-close" onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {result ? (
          <div className="export-success">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="48" height="48" className="export-success-icon">
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <h2 className="auth-modal-title">Playlist Created</h2>
            <p className="export-success-text">
              {result.trackCount} track{result.trackCount !== 1 ? 's' : ''} added to your Spotify
            </p>
            <a
              className="export-open-link"
              href={result.playlistUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in Spotify
            </a>
            <button className="auth-submit-btn export-done-btn" onClick={onClose}>
              Done
            </button>
          </div>
        ) : (
          <>
            <h2 className="auth-modal-title">Export to Spotify</h2>

            <div className="auth-field">
              <label className="auth-label" htmlFor="playlist-name">Playlist Name</label>
              <input
                id="playlist-name"
                className="auth-input"
                type="text"
                value={playlistName}
                onChange={(e) => setPlaylistName(e.target.value)}
                maxLength={100}
              />
            </div>

            <div className="auth-field">
              <label className="auth-label">Tracks per Artist</label>
              <div className="export-tracks-selector">
                {[1, 2, 3].map((n) => (
                  <button
                    key={n}
                    className={`export-track-option ${tracksPerArtist === n ? 'active' : ''}`}
                    onClick={() => setTracksPerArtist(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <p className="export-summary">
              {artists.length} artist{artists.length !== 1 ? 's' : ''} &middot; ~{artists.length * tracksPerArtist} tracks
            </p>

            {error && <div className="auth-error">{error}</div>}

            <button className="auth-submit-btn" onClick={handleExport} disabled={loading || !playlistName.trim()}>
              {loading ? 'Creating playlist...' : 'Export to Spotify'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default ExportPlaylistModal;
