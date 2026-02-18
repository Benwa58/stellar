import { useState, useEffect } from 'react';
import { findArtistTrack } from '../api/musicClient';
import { getArtistInfo } from '../api/lastfmClient';
import '../styles/panel.css';

function getBadgeInfo(node) {
  if (node.type === 'seed') return { label: 'Your Artist', className: 'badge-seed' };
  if (node.discoveryMethod === 'chain_bridge') return { label: 'Chain Bridge', className: 'badge-chain' };
  if (node.tier === 'hidden_gem') return { label: 'Hidden Gem', className: 'badge-gem' };
  return { label: 'Top Pick', className: 'badge-rec' };
}

function ArtistDetailPanel({ node, onClose, onAddSeed }) {
  const [topTrack, setTopTrack] = useState(null);
  const [loadingTrack, setLoadingTrack] = useState(false);
  const [listeners, setListeners] = useState(null);

  useEffect(() => {
    if (!node) return;
    setTopTrack(null);
    setLoadingTrack(true);

    let cancelled = false;

    findArtistTrack(node.name, node.id)
      .then((track) => {
        if (!cancelled) setTopTrack(track);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingTrack(false);
      });

    return () => {
      cancelled = true;
    };
  }, [node]);

  useEffect(() => {
    if (!node) return;
    setListeners(null);

    let cancelled = false;

    getArtistInfo(node.name)
      .then((info) => {
        if (!cancelled && info) setListeners(info.listeners);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [node]);

  if (!node) return null;

  const isSeed = node.type === 'seed';
  const badge = getBadgeInfo(node);
  const scorePercent = node.compositeScore
    ? Math.round(node.compositeScore * 100)
    : null;

  return (
    <div className="detail-panel">
      <button className="panel-close" onClick={onClose}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      <div className="panel-content">
        <div className="panel-artist-image-wrapper">
          {node.imageLarge || node.image ? (
            <img
              className="panel-artist-image"
              src={node.imageLarge || node.image}
              alt={node.name}
            />
          ) : (
            <div className="panel-artist-image panel-image-placeholder">
              {node.name.charAt(0)}
            </div>
          )}
        </div>

        <h3 className="panel-artist-name">{node.name}</h3>

        <span className={`panel-type-badge ${badge.className}`}>
          {badge.label}
        </span>

        {/* Bridge note: shows which seeds this artist connects */}
        {node.discoveryMethod === 'bridge' && node.bridgeSeedNames && node.bridgeSeedNames.length > 0 && (
          <span className="panel-discovery-note">
            Bridges {node.bridgeSeedNames.join(' & ')}
          </span>
        )}

        {/* Deep cut note: shows how this artist was discovered */}
        {node.discoveryMethod === 'deep_cut' && node.discoveredViaName && (
          <span className="panel-discovery-note">
            Discovered via {node.discoveredViaName}
          </span>
        )}

        {/* Chain bridge note: shows the path this artist is part of */}
        {node.discoveryMethod === 'chain_bridge' && node.chainBridgeSeedNames && (
          <span className="panel-discovery-note">
            Chain bridge between {node.chainBridgeSeedNames.join(' & ')}
            {node.chainPosition && node.chainLength && (
              <> (step {node.chainPosition} of {node.chainLength})</>
            )}
          </span>
        )}

        {listeners > 0 && (
          <div className="panel-listeners">
            {listeners.toLocaleString()} listeners
          </div>
        )}

        {!isSeed && scorePercent != null && (
          <div className="panel-score">
            <span className="score-label">Relevance</span>
            <div className={`score-bar ${node.tier === 'hidden_gem' ? 'score-bar-gem' : ''}`}>
              <div
                className={`score-bar-fill ${node.tier === 'hidden_gem' ? 'score-bar-fill-gem' : ''}`}
                style={{ width: `${scorePercent}%` }}
              />
            </div>
            <span className="score-value">{scorePercent}%</span>
          </div>
        )}

        {!isSeed && node.relatedSeedNames && node.relatedSeedNames.length > 0 && (
          <div className="panel-related">
            <span className="related-label">Connected to:</span>
            <div className="related-names">
              {node.relatedSeedNames.map((name) => (
                <span key={name} className="related-name-tag">{name}</span>
              ))}
            </div>
          </div>
        )}

        {node.genres && node.genres.length > 0 && (
          <div className="panel-genres">
            {node.genres.slice(0, 5).map((genre) => (
              <span key={genre} className="genre-tag">{genre}</span>
            ))}
          </div>
        )}

        <div className="panel-actions">
          {loadingTrack ? (
            <div className="panel-loading-track">Loading preview...</div>
          ) : topTrack ? (
            <div className="panel-audio-player">
              <div className="panel-track-info">
                {topTrack.albumImage && (
                  <img className="panel-track-album" src={topTrack.albumImage} alt={topTrack.albumName} />
                )}
                <div className="panel-track-details">
                  <span className="panel-track-name">{topTrack.name}</span>
                  <span className="panel-track-album-name">{topTrack.albumName}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="panel-no-preview">No preview available</div>
          )}

          <a
            className="panel-external-link"
            href={`https://open.spotify.com/search/${encodeURIComponent(node.name)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open in Spotify
          </a>

          {!isSeed && onAddSeed && (
            <button
              className="panel-add-seed-button"
              onClick={() => onAddSeed(node)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add as Seed & Regenerate
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ArtistDetailPanel;
