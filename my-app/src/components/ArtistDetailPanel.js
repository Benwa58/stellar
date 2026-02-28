import { useState, useEffect, useRef } from 'react';
import { findArtistTrack } from '../api/musicClient';
import { getArtistTopTracks, findArtistByName } from '../api/deezerClient';
import { getArtistInfo } from '../api/lastfmClient';
import { useAudioPreview } from '../hooks/useAudioPreview';
import { buildSpotifySearchUrl } from '../utils/exportUtils';
import FavoriteButton from './FavoriteButton';
import DislikeButton from './DislikeButton';
import KnownButton from './KnownButton';
import DiscoveredButton from './DiscoveredButton';
import '../styles/panel.css';

function getBadgeInfo(node) {
  if (node.type === 'seed') return { label: 'Your Artist', className: 'badge-seed' };
  if (node.isDrift || node.tier === 'drift') return { label: 'Drift', className: 'badge-drift' };
  if (node.discoveryMethod === 'chain_bridge') return { label: 'Chain Bridge', className: 'badge-chain' };
  if (node.tier === 'hidden_gem') return { label: 'Hidden Gem', className: 'badge-gem' };
  return { label: 'Top Pick', className: 'badge-rec' };
}

function ArtistDetailPanel({ node, onClose, onQueueSeed, onUnqueueSeed, pendingSeeds = [] }) {
  const [topTrack, setTopTrack] = useState(null);
  const [loadingTrack, setLoadingTrack] = useState(false);
  const [listeners, setListeners] = useState(null);
  const [moreTracks, setMoreTracks] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [enrichedImage, setEnrichedImage] = useState(null);
  const [enrichedDeezerId, setEnrichedDeezerId] = useState(null);
  const panelRef = useRef(null);
  const audio = useAudioPreview();

  // Reset scroll position and stop audio when node changes
  useEffect(() => {
    audio.pause();
    if (panelRef.current) panelRef.current.scrollTop = 0;
  }, [node]); // eslint-disable-line react-hooks/exhaustive-deps

  // Enrich image + Deezer ID from Deezer when the node doesn't have them
  useEffect(() => {
    if (!node) return;
    setEnrichedImage(null);
    setEnrichedDeezerId(null);

    if (node.imageLarge || node.image) return; // already have image

    let cancelled = false;
    findArtistByName(node.name)
      .then((deezerArtist) => {
        if (!cancelled && deezerArtist) {
          setEnrichedImage(deezerArtist.imageLarge || deezerArtist.image);
          setEnrichedDeezerId(deezerArtist.id);
        }
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [node]);

  // Determine the best available Deezer ID for track fetching
  const effectiveDeezerId = /^\d+$/.test(node?.id) ? node.id : enrichedDeezerId;

  useEffect(() => {
    if (!node) return;
    setTopTrack(null);
    setMoreTracks(null);
    setLoadingMore(false);
    setLoadingTrack(true);

    let cancelled = false;

    findArtistTrack(node.name, effectiveDeezerId)
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
  }, [node, effectiveDeezerId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const loadMoreSongs = async () => {
    const deezerId = /^\d+$/.test(node?.id) ? node.id : enrichedDeezerId;
    if (!deezerId) return;
    setLoadingMore(true);
    try {
      const tracks = await getArtistTopTracks(deezerId, 10);
      const additional = tracks.filter(t => t.id !== topTrack?.id).slice(0, 5);
      setMoreTracks(additional);
    } catch {
      setMoreTracks([]);
    } finally {
      setLoadingMore(false);
    }
  };

  if (!node) return null;

  const isSeed = node.type === 'seed';
  const badge = getBadgeInfo(node);
  const scorePercent = node.compositeScore
    ? Math.round(node.compositeScore * 100)
    : null;

  return (
    <div className="detail-panel" ref={panelRef}>
      <button className="panel-close" onClick={onClose}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      <div className="panel-content">
        <div className="panel-artist-image-wrapper">
          {node.imageLarge || node.image || enrichedImage ? (
            <img
              className="panel-artist-image"
              src={node.imageLarge || node.image || enrichedImage}
              alt={node.name}
            />
          ) : (
            <div className="panel-artist-image panel-image-placeholder">
              {node.name.charAt(0)}
            </div>
          )}
        </div>

        <div className="panel-info-col">
          <div className="panel-name-row">
            <h3 className="panel-artist-name">{node.name}</h3>
            <FavoriteButton artistName={node.name} artistId={node.id || enrichedDeezerId} artistImage={node.image || enrichedImage} />
            <DislikeButton artistName={node.name} artistId={node.id || enrichedDeezerId} artistImage={node.image || enrichedImage} />
            <KnownButton artistName={node.name} artistId={node.id || enrichedDeezerId} artistImage={node.image || enrichedImage} />
            <DiscoveredButton artistName={node.name} artistId={node.id || enrichedDeezerId} artistImage={node.image || enrichedImage} />
          </div>

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

          {/* Drift note: genre-adjacent outlier */}
          {(node.isDrift || node.tier === 'drift') && node.relatedSeedNames && node.relatedSeedNames.length > 0 && (
            <span className="panel-discovery-note">
              Genre-adjacent to {node.relatedSeedNames.join(' & ')}
            </span>
          )}

          {/* Standard recommendation / hidden gem note (only for types without a specific note above) */}
          {node.type !== 'seed' &&
           !node.isDrift && node.tier !== 'drift' &&
           node.discoveryMethod !== 'bridge' &&
           node.discoveryMethod !== 'deep_cut' &&
           node.discoveryMethod !== 'chain_bridge' &&
           node.relatedSeedNames && node.relatedSeedNames.length > 0 && (
            <span className="panel-discovery-note">
              {node.tier === 'hidden_gem' ? 'Hidden gem — similar' : 'Similar'} to {node.relatedSeedNames.join(' & ')}
            </span>
          )}

          {listeners > 0 && (
            <div className="panel-listeners">
              {listeners.toLocaleString()} listeners
            </div>
          )}
        </div>

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

              <div className="panel-action-row">
                {topTrack.previewUrl && (
                  <button
                    className={`panel-action-circle panel-action-play ${audio.isPlaying && audio.currentTrack?.id === topTrack.id ? 'playing' : ''}`}
                    onClick={() => {
                      if (audio.isPlaying && audio.currentTrack?.id === topTrack.id) {
                        audio.pause();
                      } else {
                        audio.play(topTrack);
                      }
                    }}
                    title={audio.isPlaying && audio.currentTrack?.id === topTrack.id ? 'Pause preview' : 'Play preview'}
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                      {audio.isPlaying && audio.currentTrack?.id === topTrack.id ? (
                        <>
                          <rect x="6" y="4" width="4" height="16" rx="1" />
                          <rect x="14" y="4" width="4" height="16" rx="1" />
                        </>
                      ) : (
                        <polygon points="6,3 20,12 6,21" />
                      )}
                    </svg>
                  </button>
                )}

                <a
                  className="panel-action-circle panel-action-spotify"
                  href={`https://open.spotify.com/search/${encodeURIComponent(`"${node.name}"`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open in Spotify"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
                    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                  </svg>
                </a>

                {!isSeed && onQueueSeed && (() => {
                  const isQueued = pendingSeeds.some((s) => s.id === node.id);
                  return (
                    <button
                      className={`panel-action-circle panel-action-seed ${isQueued ? 'queued' : ''}`}
                      onClick={() => isQueued ? onUnqueueSeed(node.id) : onQueueSeed(node)}
                      title={isQueued ? 'Remove from queue' : 'Add as seed'}
                    >
                      {isQueued ? (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
                          <line x1="12" y1="5" x2="12" y2="19" />
                          <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                      )}
                    </button>
                  );
                })()}
              </div>
            </div>
          ) : (
            <div className="panel-no-preview">No preview available</div>
          )}

          {/* More Songs */}
          {topTrack && moreTracks === null && !loadingMore && (/^\d+$/.test(node.id) || enrichedDeezerId) && (
            <button className="panel-more-songs-btn" onClick={loadMoreSongs}>
              More Songs
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          )}

          {loadingMore && (
            <div className="panel-loading-track">Loading more songs...</div>
          )}

          {moreTracks && moreTracks.length > 0 && (
            <div className="panel-more-tracks">
              {moreTracks.map((track) => {
                const isTrackPlaying = audio.isPlaying && audio.currentTrack?.id === track.id;
                return (
                  <div key={track.id} className="panel-track-row">
                    {track.albumImage ? (
                      <img className="panel-track-row-art" src={track.albumImage} alt="" loading="lazy" />
                    ) : (
                      <div className="panel-track-row-art-placeholder" />
                    )}
                    <div className="panel-track-row-info">
                      <span className="panel-track-row-name">{track.name}</span>
                      <span className="panel-track-row-album">{track.albumName}</span>
                    </div>
                    {track.previewUrl && (
                      <button
                        className={`panel-track-row-play ${isTrackPlaying ? 'playing' : ''}`}
                        onClick={() => {
                          if (isTrackPlaying) {
                            audio.pause();
                          } else {
                            audio.play(track);
                          }
                        }}
                        title={isTrackPlaying ? 'Pause' : 'Play preview'}
                      >
                        {isTrackPlaying ? (
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
                    <a
                      className="panel-track-row-spotify"
                      href={buildSpotifySearchUrl(track)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Search in Spotify"
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                      </svg>
                    </a>
                  </div>
                );
              })}
            </div>
          )}

          {moreTracks && moreTracks.length === 0 && (
            <div className="panel-no-preview">No additional songs found</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ArtistDetailPanel;
