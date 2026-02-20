import { useState, useEffect, useCallback } from 'react';
import { getSharedPlaylist } from '../api/authClient';
import { useAudioPreview } from '../hooks/useAudioPreview';
import { formatTrackLinks, generateCSV } from '../utils/exportUtils';
import '../styles/share.css';

function SharePage({ playlistId }) {
  const [playlist, setPlaylist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [linkFormat, setLinkFormat] = useState('with-names');
  const audio = useAudioPreview({});

  useEffect(() => {
    getSharedPlaylist(playlistId)
      .then((data) => setPlaylist(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [playlistId]);

  const handleCopyLinks = useCallback(async () => {
    if (!playlist) return;
    const text = formatTrackLinks(
      playlist.trackList.map((t) => ({
        ...t,
        externalUrl: t.deezerUrl || t.externalUrl,
      })),
      linkFormat
    );
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [playlist, linkFormat]);

  const handleExportCSV = useCallback(() => {
    if (!playlist) return;
    const csv = generateCSV(
      playlist.trackList.map((t) => ({
        ...t,
        externalUrl: t.deezerUrl || t.externalUrl,
      }))
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(playlist.playlistName || 'playlist').replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [playlist]);

  const handlePreviewToggle = useCallback(
    (track) => {
      if (audio.isPlaying && audio.currentTrack?.id === track.name) {
        audio.pause();
      } else {
        audio.play({ ...track, id: track.name });
      }
    },
    [audio]
  );

  if (loading) {
    return (
      <div className="share-page">
        <div className="share-loading">
          <div className="share-loading-spinner" />
          <p>Loading playlist...</p>
        </div>
      </div>
    );
  }

  if (error || !playlist) {
    return (
      <div className="share-page">
        <div className="share-error">
          <h2>Playlist Not Found</h2>
          <p>This playlist may have been removed or the link is invalid.</p>
          <a href="/" className="share-cta-btn">Create Your Own Galaxy</a>
        </div>
      </div>
    );
  }

  const { playlistName, trackList, seedArtists } = playlist;

  return (
    <div className="share-page">
      {/* Header */}
      <header className="share-header">
        <a href="/" className="share-logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="20" height="20">
            <circle cx="12" cy="12" r="3" />
            <circle cx="12" cy="12" r="8" opacity="0.4" />
            <circle cx="12" cy="12" r="11" opacity="0.15" />
          </svg>
          Stellar
        </a>
        <a href="/" className="share-cta-link">Create Your Own Galaxy</a>
      </header>

      {/* Playlist Info */}
      <div className="share-content">
        <div className="share-info">
          <h1 className="share-title">{playlistName}</h1>
          <div className="share-meta">
            <span>{trackList.length} track{trackList.length !== 1 ? 's' : ''}</span>
            {seedArtists && seedArtists.length > 0 && (
              <span className="share-meta-seeds">
                from {seedArtists.join(', ')}
              </span>
            )}
          </div>
          <div className="share-badge">Generated with Stellar</div>
        </div>

        {/* Actions */}
        <div className="share-actions">
          <button className="share-action-btn primary" onClick={handleExportCSV}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export CSV
          </button>

          <button className="share-action-btn" onClick={handleCopyLinks}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            {copied ? 'Copied!' : 'Copy Spotify Links'}
          </button>

          <div className="share-link-format">
            <button
              className={linkFormat === 'links-only' ? 'active' : ''}
              onClick={() => setLinkFormat('links-only')}
            >
              Links Only
            </button>
            <button
              className={linkFormat === 'with-names' ? 'active' : ''}
              onClick={() => setLinkFormat('with-names')}
            >
              With Names
            </button>
          </div>
        </div>

        {/* Tracklist */}
        <div className="share-tracklist">
          {trackList.map((track, i) => {
            const isCurrentlyPlaying = audio.isPlaying && audio.currentTrack?.id === track.name;

            return (
              <div key={i} className="share-track-row">
                <span className="share-track-number">{i + 1}</span>
                {track.albumImage ? (
                  <img className="share-track-art" src={track.albumImage} alt="" loading="lazy" />
                ) : (
                  <div className="share-track-art-placeholder" />
                )}
                <div className="share-track-info">
                  <span className="share-track-name">{track.name}</span>
                  <span className="share-track-artist">{track.artistName}</span>
                </div>
                {track.previewUrl && (
                  <button
                    className={`share-track-preview-btn ${isCurrentlyPlaying ? 'playing' : ''}`}
                    onClick={() => handlePreviewToggle(track)}
                    title={isCurrentlyPlaying ? 'Pause preview' : 'Play preview'}
                  >
                    {isCurrentlyPlaying ? (
                      <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
                        <rect x="6" y="4" width="4" height="16" />
                        <rect x="14" y="4" width="4" height="16" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
                        <polygon points="6,3 20,12 6,21" />
                      </svg>
                    )}
                  </button>
                )}
                {track.spotifyUrl && (
                  <a
                    className="share-track-spotify-link"
                    href={track.spotifyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Search in Spotify"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                    </svg>
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Mini player bar when preview playing */}
      {audio.currentTrack && (
        <div className="share-player-bar">
          <div className="share-player-info">
            <span className="share-player-name">{audio.currentTrack.name || audio.currentTrack.id}</span>
            <span className="share-player-artist">{audio.currentTrack.artistName}</span>
          </div>
          <button
            className="share-player-toggle"
            onClick={() => audio.toggle()}
          >
            {audio.isPlaying ? (
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <polygon points="6,3 20,12 6,21" />
              </svg>
            )}
          </button>
        </div>
      )}

      {copied && <div className="share-toast">Copied to clipboard!</div>}
    </div>
  );
}

export default SharePage;
