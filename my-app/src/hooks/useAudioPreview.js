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

  // Deduplicate in-flight artwork fetches so rapid track changes don't
  // kick off multiple fetches for the same URL.
  const artworkCachePromises = useRef(new Map());

  // Debounce timer for lock-screen metadata updates.  During rapid skipping
  // we defer the MediaMetadata rebuild until the user settles on a track,
  // avoiding the iOS Now Playing widget teardown/rebuild flicker.
  const metadataTimerRef = useRef(null);

  // Flag: true once we've triggered an early advance for the current track
  // (via timeupdate near end-of-track), so the real 'ended' event doesn't
  // double-advance.  Reset when a new track starts playing.
  const earlyAdvanceFiredRef = useRef(false);

  // Callable ref: re-registers this instance's MediaSession handlers.
  // Used by play()/toggle() to reclaim lock-screen controls when multiple
  // useAudioPreview instances have mediaSession: true (e.g. explore vs playlist).
  const registerMediaHandlersRef = useRef(null);

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

        // ── Lock-screen early advance ─────────────────────────────────
        // iOS suspends JS execution as soon as the audio element enters
        // the 'ended' state when the screen is locked, which prevents
        // the onEnded callback from starting the next track.  By
        // detecting that we're within the last 0.5 s of the current
        // preview and switching to the next track *before* 'ended'
        // fires, we keep the audio session active so iOS never suspends.
        if (
          !earlyAdvanceFiredRef.current &&
          onEndedRef.current &&
          audio.duration > 1 &&
          audio.duration - audio.currentTime < 0.5
        ) {
          earlyAdvanceFiredRef.current = true;
          onEndedRef.current();
        }
      }
    }

    function onLoadedMetadata() {
      setDuration(audio.duration);
    }

    function onEnded() {
      // If early advance already triggered the callback for this track,
      // skip to avoid double-advancing.
      if (earlyAdvanceFiredRef.current) {
        earlyAdvanceFiredRef.current = false;
        return;
      }
      // If we're in the middle of switching tracks (src changed by
      // audioPlay), this ended event is from the old source — ignore.
      if (switchingTrackRef.current) return;

      setIsPlaying(false);
      isPlayingRef.current = false;
      setProgress(0);
      if (onEndedRef.current) onEndedRef.current();
    }

    function onError() {
      setIsPlaying(false);
      isPlayingRef.current = false;
    }

    // Handle the 'playing' event from the audio element.
    // During rapid track changes a debounced timer (scheduleMetadataUpdate)
    // handles metadata, so we skip metadata here when a timer is pending.
    // On resume (no pending timer) we re-apply metadata in case iOS tore
    // down the Now Playing widget during an interruption (phone call, Siri).
    function onPlaying() {
      switchingTrackRef.current = false;
      if (!metadataTimerRef.current && ownsMediaSessionRef.current && currentTrackRef.current) {
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
      // Clear pending metadata debounce timer
      if (metadataTimerRef.current) {
        clearTimeout(metadataTimerRef.current);
        metadataTimerRef.current = null;
      }
      artworkCachePromises.current.clear();
      // Revoke cached blob URLs
      for (const blobUrl of artworkBlobCache.current.values()) {
        URL.revokeObjectURL(blobUrl);
      }
      artworkBlobCache.current.clear();
    };
  }, []);

  // Pre-fetch artwork image as blob URL to prevent iOS re-fetch flicker.
  // Returns a promise that resolves when the blob is cached (or on failure).
  // Deduplicates concurrent fetches for the same URL.
  const cacheArtwork = useCallback((url) => {
    if (!url) return Promise.resolve();
    if (artworkBlobCache.current.has(url)) return Promise.resolve();
    if (artworkCachePromises.current.has(url)) return artworkCachePromises.current.get(url);
    const promise = fetch(url)
      .then((r) => r.blob())
      .then((blob) => {
        artworkBlobCache.current.set(url, URL.createObjectURL(blob));
      })
      .catch(() => {}) // fall back to original URL
      .finally(() => {
        artworkCachePromises.current.delete(url);
      });
    artworkCachePromises.current.set(url, promise);
    return promise;
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

  // Schedule a debounced metadata update for the lock screen.
  // During rapid track changes this avoids repeatedly tearing down and
  // rebuilding the iOS Now Playing widget (which causes flicker / fallback
  // to the site icon).  Only the "settled" track gets its metadata pushed.
  const scheduleMetadataUpdate = useCallback((track) => {
    if (!ownsMediaSessionRef.current) return;
    if (metadataTimerRef.current) {
      clearTimeout(metadataTimerRef.current);
      metadataTimerRef.current = null;
    }

    // Start caching artwork immediately so it's likely ready when the timer fires
    if (track.albumImage) cacheArtwork(track.albumImage);

    // First track ever: update immediately. Subsequent: debounce 300ms.
    const delay = lastMetadataTrackIdRef.current ? 300 : 0;

    metadataTimerRef.current = setTimeout(() => {
      metadataTimerRef.current = null;
      // Only update if this track is still the current one
      if (currentTrackRef.current?.id !== track.id) return;

      updateMediaSession(track);
      lastMetadataTrackIdRef.current = track.id;

      // If artwork blob still isn't cached, wait for it and re-apply once ready
      if (track.albumImage && !artworkBlobCache.current.has(track.albumImage)) {
        cacheArtwork(track.albumImage).then(() => {
          if (currentTrackRef.current?.id === track.id) {
            updateMediaSession(track);
          }
        });
      }
    }, delay);
  }, [updateMediaSession, cacheArtwork]);

  // Wire up MediaSession action handlers (play, pause, next, prev, seek).
  // Instances with mediaSession: true register these handlers.  When multiple
  // instances coexist (e.g. explore + playlist), play()/toggle() re-call
  // registerMediaHandlersRef so the *last player to start* owns the lock screen.
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

    // ── Handlers ───────────────────────────────────────────────────
    const playHandler = () => {
      const audio = audioRef.current;
      const track = currentTrackRef.current;
      if (!audio || !track || isPlayingRef.current) return;

      // Always reload the source — mobile browsers silently lose audio
      // output after pause (audio session deactivates) even though the
      // element still reports readyState > 0 and fires timeupdate events.
      const resumeTime = audio.ended ? 0 : audio.currentTime;
      audio.src = track.previewUrl;
      audio.load();
      if (resumeTime > 0) {
        audio.addEventListener('loadedmetadata', () => {
          if (audio.duration) audio.currentTime = Math.min(resumeTime, audio.duration);
        }, { once: true });
      }

      setIsPlaying(true);
      isPlayingRef.current = true;

      audio.play().catch((err) => {
        console.warn('[MediaSession] play() rejected on resume:', err);
        setIsPlaying(false);
        isPlayingRef.current = false;
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

    const registerHandlers = () => {
      for (const action of allKnownActions) {
        try { navigator.mediaSession.setActionHandler(action, null); } catch {}
      }
      for (const [action, handler] of handlers) {
        try { navigator.mediaSession.setActionHandler(action, handler); } catch {}
      }
    };

    registerMediaHandlersRef.current = registerHandlers;
    registerHandlers();

    console.info('[MediaSession] handlers registered — nexttrack/previoustrack active, seekforward/seekbackward cleared');

    return () => {
      registerMediaHandlersRef.current = null;
      for (const [action] of handlers) {
        try { navigator.mediaSession.setActionHandler(action, null); } catch {}
      }
    };
  }, [ownsMediaSession, updateMediaSession]);

  const play = useCallback((track) => {
    const audio = audioRef.current;
    if (!audio || !track?.previewUrl) return;

    // Resume same track — don't touch metadata (avoids iOS widget reset).
    if (currentTrackRef.current?.id === track.id && !isPlayingRef.current) {
      // Always reload the source — mobile browsers silently lose audio
      // output after pause (audio session deactivates) even though the
      // element still reports readyState > 0 and fires timeupdate events.
      const resumeTime = audio.ended ? 0 : audio.currentTime;
      audio.src = track.previewUrl;
      audio.load();
      if (resumeTime > 0) {
        audio.addEventListener('loadedmetadata', () => {
          if (audio.duration) audio.currentTime = Math.min(resumeTime, audio.duration);
        }, { once: true });
      }
      setIsPlaying(true);
      isPlayingRef.current = true;
      audio.play().catch((err) => {
        console.warn('[play] resume failed:', err);
        setIsPlaying(false);
        isPlayingRef.current = false;
      });
      // Reclaim lock-screen handlers in case another player took over.
      registerMediaHandlersRef.current?.();
      return;
    }

    // Play new track — mark switching so native pause/play events from the
    // source change don't briefly desync isPlaying state.
    switchingTrackRef.current = true;
    earlyAdvanceFiredRef.current = false;
    audio.src = track.previewUrl;
    audio.load();
    setCurrentTrack(track);
    currentTrackRef.current = track;
    setIsPlaying(true);
    isPlayingRef.current = true;
    setProgress(0);

    audio.play().catch((err) => {
      console.warn('[play] new track play() failed:', err);
      // Clean up optimistic state so pause/resume isn't stuck.
      // Without this, switchingTrackRef stays true (onPlaying never
      // fires), suppressing all future pause/play event handlers.
      switchingTrackRef.current = false;
      setIsPlaying(false);
      isPlayingRef.current = false;
    });

    // Debounced metadata update — avoids rapid lock-screen churn on iOS.
    // Artwork caching starts immediately inside scheduleMetadataUpdate so
    // the blob is likely ready by the time the debounce timer fires.
    scheduleMetadataUpdate(track);

    // Reclaim lock-screen handlers in case another player took over.
    registerMediaHandlersRef.current?.();
  }, [scheduleMetadataUpdate]);

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
      const track = currentTrackRef.current;

      // Always reload the source — mobile browsers silently lose audio
      // output after pause (audio session deactivates) even though the
      // element still reports readyState > 0 and fires timeupdate events.
      const resumeTime = audio.ended ? 0 : audio.currentTime;
      audio.src = track.previewUrl;
      audio.load();
      if (resumeTime > 0) {
        audio.addEventListener('loadedmetadata', () => {
          if (audio.duration) audio.currentTime = Math.min(resumeTime, audio.duration);
        }, { once: true });
      }

      setIsPlaying(true);
      isPlayingRef.current = true;

      audio.play().catch((err) => {
        console.warn('[toggle] resume failed:', err);
        setIsPlaying(false);
        isPlayingRef.current = false;
      });

      // Reclaim lock-screen handlers in case another player took over.
      registerMediaHandlersRef.current?.();
    }
  }, [pause]);

  const seek = useCallback((fraction) => {
    const audio = audioRef.current;
    if (audio && audio.duration) {
      audio.currentTime = fraction * audio.duration;
      setProgress(fraction);
    }
  }, []);

  return { currentTrack, isPlaying, progress, duration, play, pause, toggle, seek, prefetchArtwork: cacheArtwork };
}
