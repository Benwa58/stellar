import { useState, useRef, useEffect, useCallback } from 'react';

export function useAudioPreview() {
  const audioRef = useRef(null);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

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
      setProgress(0);
    }

    function onError() {
      setIsPlaying(false);
    }

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      audio.pause();
      audio.src = '';
    };
  }, []);

  const play = useCallback((track) => {
    const audio = audioRef.current;
    if (!audio || !track?.previewUrl) return;

    if (currentTrack?.id === track.id && !isPlaying) {
      audio.play().catch(() => {});
      setIsPlaying(true);
      return;
    }

    audio.pause();
    audio.src = track.previewUrl;
    audio.load();
    audio.play().catch(() => {});
    setCurrentTrack(track);
    setIsPlaying(true);
    setProgress(0);
  }, [currentTrack, isPlaying]);

  const pause = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      setIsPlaying(false);
    }
  }, []);

  const toggle = useCallback(() => {
    if (isPlaying) {
      pause();
    } else if (currentTrack) {
      audioRef.current?.play().catch(() => {});
      setIsPlaying(true);
    }
  }, [isPlaying, currentTrack, pause]);

  const seek = useCallback((fraction) => {
    const audio = audioRef.current;
    if (audio && audio.duration) {
      audio.currentTime = fraction * audio.duration;
      setProgress(fraction);
    }
  }, []);

  return { currentTrack, isPlaying, progress, duration, play, pause, toggle, seek };
}
