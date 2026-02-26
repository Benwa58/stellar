import { useState, useRef, useEffect, useCallback } from 'react';

export function useAudioPreview({ onEnded: onEndedCallback, onNext: onNextCallback, onPrev: onPrevCallback } = {}) {
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

  // Cache album artwork as blob URLs so iOS doesn't re-fetch on metadata
  // recreation, which causes the Now Playing widget to fall back to the site icon.
  const artworkBlobCache = useRef(new Map());

  useEffect(() => {
    currentTrackRef.current = currentTrack;
  }, [currentTrack]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    const audio = new Audio();
    audio.volume = 0.7;
    audioRef.current = audio;

    function onTimeUpdate() {
      if (audio.duration) {
        setProgress(audio.currentTime / audio.duration);
        // Keep lock screen scrubber in sync
        if ('mediaSession' in navigator && isFinite(audio.duration)) {
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
    function onPlaying() {
      if (currentTrackRef.current) {
        updateMediaSessionRef.current(currentTrackRef.current);
      }
    }

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    audio.addEventListener('playing', onPlaying);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('playing', onPlaying);
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
    if (!('mediaSession' in navigator)) return;
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

  // Wire up MediaSession action handlers (play, pause, seek)
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const actions = {
      play: () => {
        if (currentTrackRef.current && !isPlayingRef.current) {
          audioRef.current?.play().catch(() => {});
          setIsPlaying(true);
          isPlayingRef.current = true;
          updateMediaSession(currentTrackRef.current);
        }
      },
      pause: () => {
        audioRef.current?.pause();
        setIsPlaying(false);
        isPlayingRef.current = false;
      },
      nexttrack: () => {
        if (onNextRef.current) onNextRef.current();
      },
      previoustrack: () => {
        if (onPrevRef.current) onPrevRef.current();
      },
      seekto: (details) => {
        const audio = audioRef.current;
        if (!audio || details.seekTime == null) return;
        audio.currentTime = Math.max(0, Math.min(details.seekTime, audio.duration || 30));
        updateMediaSession(currentTrackRef.current);
      },
    };
    for (const [action, handler] of Object.entries(actions)) {
      try { navigator.mediaSession.setActionHandler(action, handler); } catch {}
    }
    return () => {
      for (const action of Object.keys(actions)) {
        try { navigator.mediaSession.setActionHandler(action, null); } catch {}
      }
    };
  }, [updateMediaSession]);

  const play = useCallback((track) => {
    const audio = audioRef.current;
    if (!audio || !track?.previewUrl) return;

    // Resume same track
    if (currentTrackRef.current?.id === track.id && !isPlayingRef.current) {
      audio.play().catch(() => {});
      setIsPlaying(true);
      isPlayingRef.current = true;
      updateMediaSession(track);
      return;
    }

    // Play new track — do NOT call audio.pause() first; setting src directly
    // transitions the audio element without triggering iOS to deactivate the
    // media session (which causes the Now Playing widget to revert to the site icon).
    audio.src = track.previewUrl;
    audio.load();
    setCurrentTrack(track);
    currentTrackRef.current = track;
    setIsPlaying(true);
    isPlayingRef.current = true;
    setProgress(0);

    // Set metadata after play() resolves so iOS sees an active session
    audio.play()
      .then(() => updateMediaSession(track))
      .catch(() => {});

    // Cache artwork blob, then re-set metadata with the blob URL so the
    // lock screen gets the proper image instead of falling back to the site icon.
    if (track.albumImage) {
      cacheArtwork(track.albumImage).then(() => {
        if (currentTrackRef.current?.id === track.id) {
          updateMediaSession(track);
        }
      });
    }
  }, [updateMediaSession, cacheArtwork]);

  const pause = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      setIsPlaying(false);
      isPlayingRef.current = false;
      // Do NOT call updateMediaSession here — on iOS, recreating MediaMetadata
      // while paused causes the Now Playing widget to tear down and show the
      // site icon instead of album artwork.
    }
  }, []);

  const toggle = useCallback(() => {
    if (isPlayingRef.current) {
      pause();
    } else if (currentTrackRef.current) {
      audioRef.current?.play().catch(() => {});
      setIsPlaying(true);
      isPlayingRef.current = true;
      updateMediaSession(currentTrackRef.current);
    }
  }, [pause, updateMediaSession]);

  const seek = useCallback((fraction) => {
    const audio = audioRef.current;
    if (audio && audio.duration) {
      audio.currentTime = fraction * audio.duration;
      setProgress(fraction);
    }
  }, []);

  return { currentTrack, isPlaying, progress, duration, play, pause, toggle, seek };
}
