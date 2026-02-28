import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAppState, useDispatch } from '../state/AppContext';
import { useAuth } from '../state/AuthContext';
import { SELECT_NODE } from '../state/actions';
import { useAudioPreview } from '../hooks/useAudioPreview';
import { findArtistTrack } from '../api/musicClient';
import PreviewPlayer from './PreviewPlayer';
import '../styles/galaxy.css';

function buildSequentialOrder(nodes) {
  const positioned = nodes.filter((n) => n.x != null && n.y != null);
  if (positioned.length === 0) return [];

  const cx = positioned.reduce((s, n) => s + n.x, 0) / positioned.length;
  const cy = positioned.reduce((s, n) => s + n.y, 0) / positioned.length;

  return [...positioned].sort((a, b) => {
    const angleA = Math.atan2(a.x - cx, cy - a.y);
    const angleB = Math.atan2(b.x - cx, cy - b.y);
    return angleA - angleB;
  });
}

function buildShuffleOrder(nodes) {
  const positioned = nodes.filter((n) => n.x != null && n.y != null);
  const shuffled = [...positioned];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

const MAX_CONSECUTIVE_SKIPS = 5;

function GalaxyPlayerController({ canvasRef, externalSelectedNode, onExternalSelectNode, portalSelector }) {
  const { selectedNode: reduxSelectedNode, galaxyData } = useAppState();
  const dispatch = useDispatch();
  const { user, favorites, discoveredArtists } = useAuth();

  const externalMode = !!onExternalSelectNode;
  const selectedNode = externalMode ? externalSelectedNode : reduxSelectedNode;

  const [mode, setMode] = useState('sequential');
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isActive, setIsActive] = useState(false);
  const [currentNodeTrack, setCurrentNodeTrack] = useState(null);
  const [isLoadingTrack, setIsLoadingTrack] = useState(false);

  const [recsOnly, setRecsOnly] = useState(true);

  const trackCache = useRef(new Map());
  const sequentialOrder = useRef([]);
  const shuffleOrder = useRef([]);
  const navigationGenRef = useRef(0);
  const skipCountRef = useRef(0);
  const navigatingFromClickRef = useRef(false);
  const silentSyncRef = useRef(false);

  // Track current index imperatively so lock-screen handlers (which fire
  // while React effects are suspended on iOS) can compute the next index.
  const currentIndexRef = useRef(-1);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);

  // Ref for navigateToIndex — handlers are defined before it, so they
  // call through the ref to avoid a circular dependency.
  const navigateToIndexRef = useRef(null);

  // When a handler calls navigateToIndex directly, this flag prevents
  // the useEffect from triggering a duplicate navigation.
  const directNavRef = useRef(false);

  // Select node — dispatches to Redux or calls external handler
  const selectNode = useCallback((node) => {
    if (externalMode) {
      onExternalSelectNode(node);
    } else {
      dispatch({ type: SELECT_NODE, payload: node });
    }
  }, [externalMode, onExternalSelectNode, dispatch]);

  // Recommendations-only filter
  const favoriteNames = useMemo(
    () => new Set((favorites || []).map((f) => f.artistName)),
    [favorites]
  );
  const discoveredNames = useMemo(
    () => new Set((discoveredArtists || []).map((d) => d.artistName)),
    [discoveredArtists]
  );

  const filterNodes = useCallback((nodes) => {
    if (!recsOnly || !user) return nodes;
    return nodes.filter((n) => !favoriteNames.has(n.name) && !discoveredNames.has(n.name));
  }, [recsOnly, user, favoriteNames, discoveredNames]);

  const hasFilterableArtists = useMemo(() => {
    if (!user) return false;
    const allNodes = canvasRef.current?.getNodes() || [];
    return allNodes.some((n) => favoriteNames.has(n.name) || discoveredNames.has(n.name));
  }, [user, canvasRef, favoriteNames, discoveredNames]);

  const getPlaylist = useCallback(() => {
    return mode === 'shuffle' ? shuffleOrder.current : sequentialOrder.current;
  }, [mode]);

  // Auto-advance / next / prev handlers.
  // These call navigateToIndex directly (via ref) so that lock-screen and
  // auto-advance playback works even when the app is backgrounded on iOS
  // (where React effects are suspended and would never trigger navigation).
  const handleAutoAdvance = useCallback(() => {
    const playlist = mode === 'shuffle' ? shuffleOrder.current : sequentialOrder.current;
    if (playlist.length === 0) return;
    const next = currentIndexRef.current + 1 < playlist.length ? currentIndexRef.current + 1 : 0;
    currentIndexRef.current = next;
    directNavRef.current = true;
    setCurrentIndex(next);
    navigateToIndexRef.current?.(next);
  }, [mode]);

  const handleNext = useCallback(() => {
    const playlist = getPlaylist();
    if (playlist.length === 0) return;
    const next = currentIndexRef.current + 1 < playlist.length ? currentIndexRef.current + 1 : 0;
    currentIndexRef.current = next;
    directNavRef.current = true;
    setCurrentIndex(next);
    navigateToIndexRef.current?.(next);
  }, [getPlaylist]);

  const handlePrev = useCallback(() => {
    const playlist = getPlaylist();
    if (playlist.length === 0) return;
    const next = currentIndexRef.current - 1 >= 0 ? currentIndexRef.current - 1 : playlist.length - 1;
    currentIndexRef.current = next;
    directNavRef.current = true;
    setCurrentIndex(next);
    navigateToIndexRef.current?.(next);
  }, [getPlaylist]);

  const { isPlaying, progress, play: audioPlay, toggle: audioToggle, seek: audioSeek, prefetchArtwork, preloadAudio } = useAudioPreview({ onEnded: handleAutoAdvance, onNext: handleNext, onPrev: handlePrev, mediaSession: true });

  // Clear playlists when galaxy data changes (will rebuild on play start)
  useEffect(() => {
    if (externalMode || !galaxyData) return;
    sequentialOrder.current = [];
    shuffleOrder.current = [];
    trackCache.current.clear();
  }, [galaxyData, externalMode]);

  // Build playlists on demand from current (settled) node positions
  const ensurePlaylistsBuilt = useCallback(() => {
    const allNodes = canvasRef.current?.getNodes() || [];
    const nodes = filterNodes(allNodes);
    if (nodes.length === 0) return;
    if (sequentialOrder.current.length === 0) {
      sequentialOrder.current = buildSequentialOrder(nodes);
    }
    if (shuffleOrder.current.length === 0) {
      shuffleOrder.current = buildShuffleOrder(nodes);
    }
  }, [canvasRef, filterNodes]);

  // Rebuild playlists when recommendations filter changes during active playback
  const recsOnlyMountRef = useRef(true);
  useEffect(() => {
    if (recsOnlyMountRef.current) {
      recsOnlyMountRef.current = false;
      return;
    }
    sequentialOrder.current = [];
    shuffleOrder.current = [];
    if (!isActive) return;
    ensurePlaylistsBuilt();
    setCurrentIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recsOnly]);

  // Navigate to a node by index
  const navigateToIndex = useCallback(
    async (index) => {
      const playlist = mode === 'shuffle' ? shuffleOrder.current : sequentialOrder.current;
      if (index < 0 || index >= playlist.length) return;

      const gen = ++navigationGenRef.current;
      const node = playlist[index];

      // Select node (opens detail panel, highlights on canvas)
      navigatingFromClickRef.current = true;
      selectNode(node);
      setTimeout(() => { navigatingFromClickRef.current = false; }, 100);

      // Smoothly pan camera to follow the active node
      canvasRef.current?.followNode(node);

      // Fetch track
      setIsLoadingTrack(true);
      let track = trackCache.current.get(node.id);
      if (!track) {
        try {
          track = await findArtistTrack(node.name, node.id);
          if (track) trackCache.current.set(node.id, track);
        } catch (e) {
          console.warn('Failed to fetch track for', node.name);
        }
      }

      // Bail if a newer navigation happened while we were fetching
      if (gen !== navigationGenRef.current) return;
      setIsLoadingTrack(false);

      if (track && track.previewUrl) {
        setCurrentNodeTrack(track);
        audioPlay(track);
        skipCountRef.current = 0;

        // Pre-fetch next track metadata, artwork, AND audio data so the
        // transition is instant — especially on iOS lock screen where
        // network requests are throttled and play() would otherwise fail.
        const nextIdx = index + 1 < playlist.length ? index + 1 : 0;
        const nextNode = playlist[nextIdx];
        if (nextNode) {
          const cachedNext = trackCache.current.get(nextNode.id);
          if (cachedNext) {
            // Already have metadata — just pre-load audio
            if (cachedNext.previewUrl) preloadAudio(cachedNext.previewUrl);
          } else {
            findArtistTrack(nextNode.name, nextNode.id)
              .then((t) => {
                if (t) {
                  trackCache.current.set(nextNode.id, t);
                  if (t.albumImage) prefetchArtwork(t.albumImage);
                  if (t.previewUrl) preloadAudio(t.previewUrl);
                }
              })
              .catch(() => {});
          }
        }
      } else {
        // Skip nodes without previews
        skipCountRef.current++;
        if (skipCountRef.current < MAX_CONSECUTIVE_SKIPS && playlist.length > 1) {
          const next = index + 1 < playlist.length ? index + 1 : 0;
          setCurrentIndex(next);
        } else {
          skipCountRef.current = 0;
        }
      }
    },
    [mode, selectNode, audioPlay, canvasRef, prefetchArtwork]
  );
  navigateToIndexRef.current = navigateToIndex;

  // React to currentIndex changes (fallback for state updates that don't
  // come from the direct-nav handlers, e.g. clicking a node on the canvas).
  useEffect(() => {
    if (currentIndex >= 0 && isActive) {
      if (silentSyncRef.current) {
        silentSyncRef.current = false;
        return;
      }
      if (directNavRef.current) {
        directNavRef.current = false;
        return;
      }
      navigateToIndex(currentIndex);
    }
  }, [currentIndex, isActive, navigateToIndex]);

  // Sync when user clicks a node on the canvas.
  // Only update the player's position — don't auto-play if paused.
  useEffect(() => {
    if (!selectedNode || !isActive || navigatingFromClickRef.current) return;

    const playlist = mode === 'shuffle' ? shuffleOrder.current : sequentialOrder.current;
    const idx = playlist.findIndex((n) => n.id === selectedNode.id);
    if (idx < 0 || idx === currentIndex) return;

    if (isPlaying) {
      // Player is actively playing — navigate and play the clicked node
      setCurrentIndex(idx);
    } else {
      // Player is paused — sync position silently without auto-playing
      navigationGenRef.current++;
      silentSyncRef.current = true;
      setCurrentIndex(idx);
      // Fetch track info for display only (no playback)
      const node = playlist[idx];
      const cached = trackCache.current.get(node.id);
      if (cached) {
        setCurrentNodeTrack(cached);
      } else {
        setIsLoadingTrack(true);
        findArtistTrack(node.name, node.id)
          .then((track) => {
            if (track) {
              trackCache.current.set(node.id, track);
              setCurrentNodeTrack(track);
            }
          })
          .catch(() => {})
          .finally(() => setIsLoadingTrack(false));
      }
    }
  }, [selectedNode, isActive, mode, currentIndex, isPlaying]);

  const handlePlay = useCallback(() => {
    if (!isActive) {
      ensurePlaylistsBuilt();
      setIsActive(true);
      setCurrentIndex(0);
    } else {
      audioToggle();
    }
  }, [isActive, audioToggle, ensurePlaylistsBuilt]);

  const handleModeToggle = useCallback(() => {
    setMode((prev) => {
      const newMode = prev === 'sequential' ? 'shuffle' : 'sequential';

      const allNodes = filterNodes(canvasRef.current?.getNodes() || []);
      // Re-shuffle when switching to shuffle
      if (newMode === 'shuffle') {
        shuffleOrder.current = buildShuffleOrder(allNodes);
      } else if (sequentialOrder.current.length === 0) {
        // Ensure sequential order is built
        sequentialOrder.current = buildSequentialOrder(allNodes);
      }

      // Find current node in the new ordering
      const currentPlaylist = prev === 'shuffle' ? shuffleOrder.current : sequentialOrder.current;
      const currentNode = currentPlaylist[currentIndex];
      if (currentNode) {
        const newPlaylist = newMode === 'shuffle' ? shuffleOrder.current : sequentialOrder.current;
        const newIdx = newPlaylist.findIndex((n) => n.id === currentNode.id);
        if (newIdx >= 0) {
          setCurrentIndex(newIdx);
        }
      }

      return newMode;
    });
  }, [currentIndex, canvasRef, filterNodes]);

  const playlist = getPlaylist();

  // Portal target: render the player bar into the parent view so it isn't
  // trapped inside the .galaxy-toolbar (which is position: absolute).
  const portalTarget = document.querySelector(portalSelector || '.galaxy-view');

  return (
    <>
      {!isActive && (
        <button
          className="galaxy-player-start-button"
          onClick={handlePlay}
          title="Start Galaxy Player"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
            <polygon points="6,3 20,12 6,21" />
          </svg>
          <span>Explore</span>
        </button>
      )}

      {isActive && portalTarget && createPortal(
        <PreviewPlayer
          currentTrack={currentNodeTrack}
          isPlaying={isPlaying}
          isLoading={isLoadingTrack}
          progress={progress}
          onToggle={audioToggle}
          onSeek={audioSeek}
          onNext={handleNext}
          onPrev={handlePrev}
          mode={mode}
          onModeToggle={handleModeToggle}
          currentIndex={currentIndex}
          totalCount={playlist.length}
          recsOnly={recsOnly}
          onRecsOnlyToggle={() => setRecsOnly((v) => !v)}
          showRecsFilter={externalMode && hasFilterableArtists}
        />,
        portalTarget
      )}
    </>
  );
}

export default GalaxyPlayerController;
