import { useState, useCallback, useMemo, useRef } from 'react';
import { useAppState } from '../state/AppContext';
import { useAuth, useAuthActions } from '../state/AuthContext';
import { useAudioPreview } from '../hooks/useAudioPreview';
import { useExportTracks } from '../hooks/useExportTracks';
import { buildSpotifySearchUrl, formatTrackLinks, generateCSV } from '../utils/exportUtils';
import { createSharedPlaylist } from '../api/authClient';
import '../styles/export.css';

function ExportDrawer({ onClose, seedArtists }) {
  const { galaxyData } = useAppState();
  const { user, dislikes } = useAuth();
  const { showAuthModal } = useAuthActions();

  const [playlistName, setPlaylistName] = useState(() => {
    const names = (seedArtists || []).map((a) => a.name).join(', ');
    return `Stellar: ${names || 'Galaxy'}`;
  });
  const [linkFormat, setLinkFormat] = useState('with-names');
  const [excludeDislikes, setExcludeDislikes] = useState(true);
  const [copied, setCopied] = useState(false);
  const [shareLinkCopied, setShareLinkCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [autoplay, setAutoplay] = useState(true);
  const autoplayStartedRef = useRef(false);

  // Filter nodes based on dislike toggle
  const allNodes = useMemo(() => galaxyData?.nodes || [], [galaxyData]);
  const dislikeNames = useMemo(
    () => new Set((dislikes || []).map((d) => d.artistName)),
    [dislikes]
  );

  const hasDislikesOnMap = useMemo(
    () => dislikeNames.size > 0 && allNodes.some((n) => dislikeNames.has(n.name)),
    [allNodes, dislikeNames]
  );

  const filteredNodes = useMemo(() => {
    if (!excludeDislikes || !hasDislikesOnMap) return allNodes;
    return allNodes.filter((n) => !dislikeNames.has(n.name));
  }, [allNodes, excludeDislikes, hasDislikesOnMap, dislikeNames]);

  const excludedCount = allNodes.length - filteredNodes.length;

  // Batch-fetch tracks for filtered nodes
  const { tracks, progress, isLoading } = useExportTracks(filteredNodes);

  const trackList = useMemo(() => {
    const list = [];
    for (const node of filteredNodes) {
      const track = tracks.get(node.id);
      if (track) list.push({ ...track, nodeId: node.id });
    }
    return list;
  }, [filteredNodes, tracks]);

  // Refs so the onEnded callback reads fresh values without re-creating audio
  const trackListRef = useRef(trackList);
  trackListRef.current = trackList;
  const autoplayRef = useRef(autoplay);
  autoplayRef.current = autoplay;

  // Autoplay: when a track ends, play the next one with a preview
  const handleTrackEnded = useCallback(() => {
    if (!autoplayRef.current || !autoplayStartedRef.current) return;
    const list = trackListRef.current;
    const currentId = audioInstanceRef.current?.currentTrack?.id;
    const currentIdx = list.findIndex((t) => t.id === currentId);
    if (currentIdx === -1) return;

    // Find the next track with a preview, starting after current
    for (let i = currentIdx + 1; i < list.length; i++) {
      if (list[i].previewUrl) {
        audioInstanceRef.current?.play(list[i]);
        return;
      }
    }
    // Reached end of playlist, stop
  }, []);

  // Independent audio preview for the drawer
  const audio = useAudioPreview({ onEnded: handleTrackEnded });
  const audioInstanceRef = useRef(audio);
  audioInstanceRef.current = audio;

  // Copy Spotify links
  const handleCopyLinks = useCallback(async () => {
    if (trackList.length === 0) return;
    const text = formatTrackLinks(trackList, linkFormat);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [trackList, linkFormat]);

  // Export CSV
  const handleExportCSV = useCallback(() => {
    if (trackList.length === 0) return;
    const csv = generateCSV(trackList);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${playlistName.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [trackList, playlistName]);

  // Share link
  const handleShare = useCallback(async () => {
    if (!user) {
      showAuthModal('login');
      return;
    }
    if (trackList.length === 0) return;

    setSharing(true);
    try {
      const shareTrackList = trackList.map((t) => ({
        name: t.name,
        artistName: t.artistName,
        albumName: t.albumName,
        albumImage: t.albumImage,
        previewUrl: t.previewUrl,
        durationMs: t.durationMs,
        deezerUrl: t.externalUrl,
        spotifyUrl: buildSpotifySearchUrl(t),
      }));

      const res = await createSharedPlaylist({
        playlistName,
        trackList: shareTrackList,
        seedArtists: (seedArtists || []).map((a) => a.name),
        nodeCount: allNodes.length,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Share failed');

      const fullUrl = `${window.location.origin}/p/${data.id}`;

      // On mobile/iOS, open the native share sheet directly
      if (navigator.share) {
        try {
          await navigator.share({
            title: playlistName,
            text: `Check out this playlist: ${playlistName}`,
            url: fullUrl,
          });
        } catch {}
      } else {
        setShareUrl(fullUrl);
        try { await navigator.clipboard.writeText(fullUrl); } catch {}
      }
    } catch (err) {
      console.warn('Share failed:', err.message);
    } finally {
      setSharing(false);
    }
  }, [user, showAuthModal, trackList, playlistName, seedArtists, allNodes.length]);

  // Preview toggle — starts autoplay chain on first manual play
  const handlePreviewToggle = useCallback(
    (track) => {
      if (audio.isPlaying && audio.currentTrack?.id === track.id) {
        audio.pause();
      } else {
        audio.play(track);
        autoplayStartedRef.current = true;
      }
    },
    [audio]
  );

  return (
    <div className="export-drawer">
      <button className="export-drawer-close" onClick={onClose}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      <div className="export-drawer-content">
        {/* Header */}
        <div className="export-drawer-header">
          <h3 className="export-drawer-title">Share Playlist</h3>
          <input
            className="export-playlist-name-input"
            type="text"
            value={playlistName}
            onChange={(e) => setPlaylistName(e.target.value)}
            maxLength={100}
          />
          <div className="export-meta-row">
            <span className="export-track-count">
              {isLoading
                ? `Loading tracks... ${progress.fetched}/${progress.total}`
                : `${trackList.length} track${trackList.length !== 1 ? 's' : ''}`}
            </span>
          </div>
        </div>

        {/* Progress bar */}
        {isLoading && (
          <div className="export-progress-bar">
            <div
              className="export-progress-fill"
              style={{ width: `${progress.total > 0 ? (progress.fetched / progress.total) * 100 : 0}%` }}
            />
          </div>
        )}

        {/* Dislike filter */}
        {user && hasDislikesOnMap && (
          <div className="export-dislike-filter">
            <button
              className={`export-dislike-toggle ${excludeDislikes ? 'active' : ''}`}
              onClick={() => setExcludeDislikes((v) => !v)}
              aria-label="Toggle exclude dislikes"
            />
            <span className="export-dislike-label">Exclude dislikes</span>
            {excludedCount > 0 && (
              <span className="export-dislike-count">
                {excludedCount} artist{excludedCount !== 1 ? 's' : ''} excluded
              </span>
            )}
          </div>
        )}

        {/* Autoplay toggle */}
        <div className="export-autoplay-filter">
          <button
            className={`export-dislike-toggle ${autoplay ? 'active' : ''}`}
            onClick={() => setAutoplay((v) => !v)}
            aria-label="Toggle autoplay"
          />
          <span className="export-dislike-label">Autoplay</span>
          <span className="export-autoplay-hint">
            {autoplay ? 'Plays next after preview ends' : 'Off'}
          </span>
        </div>

        {/* Actions */}
        <div className="export-actions">
          <button
            className="export-action-btn primary"
            onClick={handleShare}
            disabled={trackList.length === 0 || isLoading || sharing}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            {sharing ? 'Creating link...' : 'Share Link'}
          </button>

          {shareUrl && (
            <div className="export-share-url">
              <input
                className="export-share-url-input"
                type="text"
                value={shareUrl}
                readOnly
                onClick={(e) => e.target.select()}
              />
              <button
                className="export-share-url-copy"
                onClick={async () => {
                  try { await navigator.clipboard.writeText(shareUrl); } catch {}
                  setShareLinkCopied(true);
                  setTimeout(() => setShareLinkCopied(false), 2000);
                }}
                title="Copy link"
              >
                {shareLinkCopied ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" width="14" height="14">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                )}
              </button>
              <a className="export-share-url-open" href={shareUrl} target="_blank" rel="noopener noreferrer">
                Open
              </a>
            </div>
          )}

          <button
            className="export-action-btn export-action-btn-csv"
            onClick={handleExportCSV}
            disabled={trackList.length === 0 || isLoading}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export CSV
          </button>

          <button
            className="export-action-btn export-action-btn-copy"
            onClick={handleCopyLinks}
            disabled={trackList.length === 0 || isLoading}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            {copied ? 'Copied!' : 'Copy Spotify Links'}
          </button>

          <div className="export-link-format">
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
        <div className="export-tracklist">
          {filteredNodes.map((node, i) => {
            const track = tracks.get(node.id);

            if (!track) {
              return (
                <div key={node.id} className="export-track-skeleton">
                  <span className="export-track-number">{i + 1}</span>
                  <div className="export-skeleton-art" />
                  <div className="export-skeleton-text">
                    <div className="export-skeleton-line" style={{ width: '80%' }} />
                    <div className="export-skeleton-line short" />
                  </div>
                </div>
              );
            }

            const isCurrentlyPlaying = audio.isPlaying && audio.currentTrack?.id === track.id;

            return (
              <div key={node.id} className="export-track-row">
                <span className="export-track-number">{i + 1}</span>
                {track.albumImage ? (
                  <img className="export-track-art" src={track.albumImage} alt="" loading="lazy" />
                ) : (
                  <div className="export-track-art-placeholder" />
                )}
                <div className="export-track-info">
                  <span className="export-track-name">{track.name}</span>
                  <span className="export-track-artist">{track.artistName}</span>
                </div>
                {track.previewUrl && (
                  <button
                    className={`export-track-preview-btn ${isCurrentlyPlaying ? 'playing' : ''}`}
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
                <a
                  className="export-track-spotify-link"
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

          {!isLoading && trackList.length === 0 && (
            <div className="export-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="32" height="32" style={{ color: 'rgba(255,255,255,0.2)' }}>
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              <span className="export-empty-text">No tracks available to export</span>
            </div>
          )}
        </div>
      </div>

      {copied && <div className="export-toast">Copied to clipboard!</div>}
    </div>
  );
}

export default ExportDrawer;
