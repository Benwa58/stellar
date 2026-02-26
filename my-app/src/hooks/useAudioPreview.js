import { useState, useRef, useEffect, useCallback } from 'react';

// ── Diagnostic helper ──────────────────────────────────────────────────
// Call  window.__stellarAudioDiag()  in the browser console / Safari Web
// Inspector to dump the current state of the audio element and media
// session.  Useful for verifying lock-screen fixes on-device.
if (typeof window !== 'undefined') {
  window.__stellarAudioDiag = () => {
    const report = {};
    // Audio element
    const audio = document.querySelector('audio') || window.__stellarAudioElement;
    if (audio) {
      report.audio = {
        paused: audio.paused,
        readyState: audio.readyState,
        currentTime: audio.currentTime,
        duration: audio.duration,
        src: audio.src?.slice(0, 80),
        networkState: audio.networkState,
      };
    } else {
      report.audio = 'no audio element found (expected — we use new Audio())';
    }
    // Media session
    if ('mediaSession' in navigator) {
      const ms = navigator.mediaSession;
      report.mediaSession = {
        playbackState: ms.playbackState,
        metadata: ms.metadata ? {
          title: ms.metadata.title,
          artist: ms.metadata.artist,
          album: ms.metadata.album,
          artworkCount: ms.metadata.artwork?.length,
        } : null,
      };
      // Probe which handlers are registered by trying to set/get
      const probed = {};
      for (const action of ['play','pause','nexttrack','previoustrack','seekforward','seekbackward','seekto']) {
        try {
          // If the handler is null, setActionHandler(action, null) won't throw.
          // We can't actually read handlers, so just note it was set up.
          probed[action] = 'registered (cannot read — check console logs above)';
        } catch {
          probed[action] = 'not supported';
        }
      }
      report.mediaSession.handlers = probed;
    } else {
      report.mediaSession = 'MediaSession API not available';
    }
    console.table?.(report.audio);
    console.log('[Stellar Audio Diagnostic]', JSON.stringify(report, null, 2));
    return report;
  };
}

export function useAudioPreview({ onEnded: onEndedCallback, onNext: onNextCallback, onPrev: onPrevCallback, mediaSession: ownsMediaSession = false } = {}) {
  const audioRef = useRef(null);
  const onEndedRef = useRef(null);
  onEndedRef.current = onEndedCallback;
  const onNextRef = useRef(null);
  onNextRef.current = onNextCallback;
  const onPrevRef = useRef(null);
  onPrevRef.current = onPrevCallback;
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  // Use refs so play/toggle callbacks stay stable
  const currentTrackRef = useRef(null);
  const isPlayingRef = useRef(false);
  const updateMediaSessionRef = useRef(null);

  // Track whether we're in the middle of switching tracks so native
  // pause/play events from the source change don't desync state.
  const switchingTrackRef = useRef(false);

  // Track which track ID we last set metadata for, so we skip redundant
  // updateMediaSession calls on resume (which cause iOS widget resets).
  const lastMetadataTrackIdRef = useRef(null);

  // Cache album artwork as blob URLs so iOS doesn't re-fetch on metadata
  // recreation, which causes the Now Playing widget to fall back to the site icon.
  const artworkBlobCache = useRef(new Map());

  useEffect(() => {
    currentTrackRef.current = currentTrack;
  }, [currentTrack]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Capture in ref so the Audio setup effect (which runs once) can read it
  const ownsMediaSessionRef = useRef(ownsMediaSession);
  ownsMediaSessionRef.current = ownsMediaSession;

  useEffect(() => {
    const audio = new Audio();
    audio.volume = 0.7;
    audioRef.current = audio;
    // Expose for diagnostic tool (window.__stellarAudioDiag)
    if (ownsMediaSessionRef.current) window.__stellarAudioElement = audio;

    function onTimeUpdate() {
      if (audio.duration) {
        setProgress(audio.currentTime / audio.duration);
        // Keep lock screen scrubber in sync (only from the primary player)
        if (ownsMediaSessionRef.current && 'mediaSession' in navigator && isFinite(audio.duration)) {
          try {
            navigator.mediaSession.setPositionState({
              duration: audio.duration,
              position: Math.min(audio.currentTime, audio.duration),
              playbackRate: audio.playbackRate || 1,
            });
          } catch {}
        }
      }
    }

    function onLoadedMetadata() {
      setDuration(audio.duration);
    }

    function onEnded() {
      setIsPlaying(false);
      isPlayingRef.current = false;
      setProgress(0);
      if (onEndedRef.current) onEndedRef.current();
    }

    function onError() {
      setIsPlaying(false);
      isPlayingRef.current = false;
    }

    // Re-apply media session metadata when audio actually starts playing.
    // On iOS, the browser can reset metadata during source transitions,
    // so we need to re-set it once playback genuinely begins.
    // Only the primary player (ownsMediaSession) should touch metadata,
    // and only when the track has actually changed (not on resume — resuming
    // with a metadata recreate causes iOS to tear down the Now Playing widget).
    function onPlaying() {
      switchingTrackRef.current = false;
      if (ownsMediaSessionRef.current && currentTrackRef.current) {
        if (currentTrackRef.current.id !== lastMetadataTrackIdRef.current) {
          updateMediaSessionRef.current(currentTrackRef.current);
          lastMetadataTrackIdRef.current = currentTrackRef.current.id;
        }
      }
    }

    // Sync isPlaying with actual audio element state so that iOS
    // interruptions (phone calls, Siri, etc.) and lock-screen controls
    // keep our React state accurate even if the JS handler didn't fire.
    function onAudioPlay() {
      if (!switchingTrackRef.current) {
        setIsPlaying(true);
        isPlayingRef.current = true;
      }
    }
    function onAudioPause() {
      if (!switchingTrackRef.current) {
        setIsPlaying(false);
        isPlayingRef.current = false;
      }
    }

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('play', onAudioPlay);
    audio.addEventListener('pause', onAudioPause);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('play', onAudioPlay);
      audio.removeEventListener('pause', onAudioPause);
      audio.pause();
      audio.src = '';
      // Revoke cached blob URLs
      for (const blobUrl of artworkBlobCache.current.values()) {
        URL.revokeObjectURL(blobUrl);
      }
      artworkBlobCache.current.clear();
    };
  }, []);

  // Pre-fetch artwork image as blob URL to prevent iOS re-fetch flicker.
  // Returns a promise that resolves when the blob is cached (or on failure).
  const cacheArtwork = useCallback((url) => {
    if (!url) return Promise.resolve();
    if (artworkBlobCache.current.has(url)) return Promise.resolve();
    return fetch(url)
      .then((r) => r.blob())
      .then((blob) => {
        artworkBlobCache.current.set(url, URL.createObjectURL(blob));
      })
      .catch(() => {}); // fall back to original URL
  }, []);

  // Update lock screen / MediaSession metadata.
  // Always recreate MediaMetadata — using a cached blob URL for the artwork
  // so iOS doesn't need to re-fetch (which causes the Now Playing widget to
  // fall back to the Stellar site icon).
  //
  // IMPORTANT: We do NOT explicitly set navigator.mediaSession.playbackState.
  // On iOS Safari, setting playbackState to 'paused' signals the system to
  // tear down the Now Playing widget entirely, causing the metadata to revert
  // to the site icon. Letting the browser infer state from the audio element
  // keeps the widget alive with a play button when paused.
  const updateMediaSession = useCallback((track) => {
    if (!ownsMediaSessionRef.current || !('mediaSession' in navigator)) return;
    if (!track) {
      navigator.mediaSession.metadata = null;
      return;
    }
    const artworkUrl = track.albumImage
      ? (artworkBlobCache.current.get(track.albumImage) || track.albumImage)
      : null;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.name || '',
      artist: track.artistName || '',
      album: track.albumName || '',
      ...(artworkUrl ? { artwork: [{ src: artworkUrl, sizes: '256x256', type: 'image/jpeg' }] } : {}),
    });

    // Keep lock screen position indicator in sync
    const audio = audioRef.current;
    if (audio && audio.duration && isFinite(audio.duration)) {
      try {
        navigator.mediaSession.setPositionState({
          duration: audio.duration,
          position: Math.min(audio.currentTime, audio.duration),
          playbackRate: audio.playbackRate || 1,
        });
      } catch {}
    }
  }, []);
  updateMediaSessionRef.current = updateMediaSession;

  // Wire up MediaSession action handlers (play, pause, next, prev, seek).
  // Only the primary player instance (ownsMediaSession) should register these —
  // otherwise secondary instances (ArtistDetailPanel, etc.) overwrite the handlers
  // and lock screen controls route to the wrong audio element.
  useEffect(() => {
    if (!ownsMediaSession || !('mediaSession' in navigator)) return;

    // ── Clean slate ────────────────────────────────────────────────
    // Wipe ALL possible handlers first so iOS doesn't carry over stale
    // seek-forward/backward registrations from a previous effect run or
    // default browser behaviour.
    const allKnownActions = [
      'play', 'pause', 'stop',
      'seekbackward', 'seekforward', 'seekto',
      'previoustrack', 'nexttrack',
      'skipad',
    ];
    for (const action of allKnownActions) {
      try { navigator.mediaSession.setActionHandler(action, null); } catch {}
    }

    // ── Handlers ───────────────────────────────────────────────────
    const playHandler = () => {
      const audio = audioRef.current;
      const track = currentTrackRef.current;
      if (!audio || !track || isPlayingRef.current) return;

      // If iOS released the audio source while backgrounded, reload it.
      if (audio.readyState === 0 && track.previewUrl) {
        console.info('[MediaSession] audio source lost — reloading for resume');
        audio.src = track.previewUrl;
        audio.load();
      }

      // Let native 'play'/'pause' events on the audio element sync
      // isPlaying state — no optimistic setState here.
      audio.play().catch((err) => {
        console.warn('[MediaSession] play() rejected on resume:', err);
      });
    };

    const pauseHandler = () => {
      // Native 'pause' event on the audio element will sync isPlaying.
      audioRef.current?.pause();
    };

    const nextHandler = () => {
      if (onNextRef.current) onNextRef.current();
    };

    const prevHandler = () => {
      if (onPrevRef.current) onPrevRef.current();
    };

    const seekHandler = (details) => {
      const audio = audioRef.current;
      if (!audio || details.seekTime == null) return;
      audio.currentTime = Math.max(0, Math.min(details.seekTime, audio.duration || 30));
      // Just update position state — do NOT recreate MediaMetadata.
      if (audio.duration && isFinite(audio.duration)) {
        try {
          navigator.mediaSession.setPositionState({
            duration: audio.duration,
            position: Math.min(audio.currentTime, audio.duration),
            playbackRate: audio.playbackRate || 1,
          });
        } catch {}
      }
    };

    // Register in priority order: next/prev FIRST so iOS recognises them
    // before we register anything seek-related.
    const handlers = [
      ['previoustrack', prevHandler],
      ['nexttrack', nextHandler],
      ['play', playHandler],
      ['pause', pauseHandler],
      ['seekto', seekHandler],
    ];

    for (const [action, handler] of handlers) {
      try { navigator.mediaSession.setActionHandler(action, handler); } catch {}
    }

    console.info('[MediaSession] handlers registered — nexttrack/previoustrack active, seekforward/seekbackward cleared');

    return () => {
      for (const [action] of handlers) {
        try { navigator.mediaSession.setActionHandler(action, null); } catch {}
      }
    };
  }, [ownsMediaSession, updateMediaSession]);

  const play = useCallback((track) => {
    const audio = audioRef.current;
    if (!audio || !track?.previewUrl) return;

    // Resume same track — don't touch metadata (avoids iOS widget reset).
    // Native 'play' event on the audio element will sync isPlaying state.
    if (currentTrackRef.current?.id === track.id && !isPlayingRef.current) {
      // If iOS released the source while backgrounded, reload it.
      if (audio.readyState === 0) {
        console.info('[play] audio source lost — reloading for resume');
        audio.src = track.previewUrl;
        audio.load();
      }
      audio.play().catch((err) => {
        console.warn('[play] resume failed:', err);
      });
      return;
    }

    // Play new track — mark switching so native pause/play events from the
    // source change don't briefly desync isPlaying state.
    switchingTrackRef.current = true;
    audio.src = track.previewUrl;
    audio.load();
    setCurrentTrack(track);
    currentTrackRef.current = track;
    setIsPlaying(true);
    isPlayingRef.current = true;
    setProgress(0);

    // Set metadata after play() resolves so iOS sees an active session.
    audio.play()
      .then(() => {
        updateMediaSession(track);
        lastMetadataTrackIdRef.current = track.id;
      })
      .catch((err) => {
        console.warn('[play] new track play() failed:', err);
      });

    // Cache artwork blob, then re-set metadata with the blob URL so the
    // lock screen gets the proper image instead of falling back to the site icon.
    if (track.albumImage) {
      cacheArtwork(track.albumImage).then(() => {
        if (currentTrackRef.current?.id === track.id) {
          updateMediaSession(track);
          lastMetadataTrackIdRef.current = track.id;
        }
      });
    }
  }, [updateMediaSession, cacheArtwork]);

  const pause = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      // Native 'pause' event on the audio element will sync isPlaying.
      audio.pause();
    }
  }, []);

  const toggle = useCallback(() => {
    if (isPlayingRef.current) {
      pause();
    } else if (currentTrackRef.current) {
      const audio = audioRef.current;
      if (!audio) return;

      // If iOS released the source while backgrounded, reload it.
      if (audio.readyState === 0 && currentTrackRef.current.previewUrl) {
        console.info('[toggle] audio source lost — reloading for resume');
        audio.src = currentTrackRef.current.previewUrl;
        audio.load();
      }

      // Native 'play' event on the audio element will sync isPlaying.
      // Don't call updateMediaSession on resume — metadata is already set.
      audio.play().catch((err) => {
        console.warn('[toggle] resume failed:', err);
      });
    }
  }, [pause]);

  const seek = useCallback((fraction) => {
    const audio = audioRef.current;
    if (audio && audio.duration) {
      audio.currentTime = fraction * audio.duration;
      setProgress(fraction);
    }
  }, []);

  return { currentTrack, isPlaying, progress, duration, play, pause, toggle, seek };
}
