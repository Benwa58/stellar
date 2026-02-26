import { useState, useRef, useEffect, useCallback } from 'react';

export function useAudioPreview({ onEnded: onEndedCallback } = {}) {
  const audioRef = useRef(null);
  const onEndedRef = useRef(null);
  onEndedRef.current = onEndedCallback;
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  // Use refs so play/toggle callbacks stay stable
  const currentTrackRef = useRef(null);
  const isPlayingRef = useRef(false);
  const updateMediaSessionRef = useRef(null);

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
        updateMediaSessionRef.current(currentTrackRef.current, true);
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
    };
  }, []);

  // Update lock screen / MediaSession metadata
  const updateMediaSession = useCallback((track, playing) => {
    if (!('mediaSession' in navigator)) return;
    if (!track) {
      navigator.mediaSession.metadata = null;
      return;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.name || '',
      artist: track.artistName || '',
      album: track.albumName || '',
      ...(track.albumImage ? { artwork: [{ src: track.albumImage, sizes: '256x256', type: 'image/jpeg' }] } : {}),
    });
    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  }, []);
  updateMediaSessionRef.current = updateMediaSession;

  // Wire up MediaSession action handlers
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const actions = {
      play: () => {
        if (currentTrackRef.current && !isPlayingRef.current) {
          audioRef.current?.play().catch(() => {});
          setIsPlaying(true);
          isPlayingRef.current = true;
          updateMediaSession(currentTrackRef.current, true);
        }
      },
      pause: () => {
        audioRef.current?.pause();
        setIsPlaying(false);
        isPlayingRef.current = false;
        updateMediaSession(currentTrackRef.current, false);
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
      updateMediaSession(track, true);
      return;
    }

    // Play new track
    audio.pause();
    audio.src = track.previewUrl;
    audio.load();
    audio.play().catch(() => {});
    setCurrentTrack(track);
    currentTrackRef.current = track;
    setIsPlaying(true);
    isPlayingRef.current = true;
    setProgress(0);
    updateMediaSession(track, true);
  }, [updateMediaSession]); // Stable — updateMediaSession is stable, reads from refs

  const pause = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      setIsPlaying(false);
      isPlayingRef.current = false;
      updateMediaSession(currentTrackRef.current, false);
    }
  }, [updateMediaSession]);

  const toggle = useCallback(() => {
    if (isPlayingRef.current) {
      pause();
    } else if (currentTrackRef.current) {
      audioRef.current?.play().catch(() => {});
      setIsPlaying(true);
      isPlayingRef.current = true;
      updateMediaSession(currentTrackRef.current, true);
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
