import { useCallback } from 'react';
import '../styles/player.css';

function PreviewPlayer({ currentTrack, isPlaying, progress, onToggle, onSeek }) {
  const handleSeek = useCallback(
    (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const fraction = (e.clientX - rect.left) / rect.width;
      onSeek(Math.max(0, Math.min(1, fraction)));
    },
    [onSeek]
  );

  if (!currentTrack) return null;

  const elapsed = Math.floor((progress || 0) * 30);
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;

  return (
    <div className="preview-player">
      <div className="player-left">
        {currentTrack.albumImage ? (
          <img
            className="player-album-art"
            src={currentTrack.albumImage}
            alt={currentTrack.albumName || 'Album'}
          />
        ) : (
          <div className="player-album-art player-album-placeholder">
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
            </svg>
          </div>
        )}
        <div className="player-info">
          <span className="player-track-name">{currentTrack.name}</span>
          <span className="player-artist-name">{currentTrack.artistName}</span>
        </div>
      </div>

      <div className="player-center">
        <button className="player-toggle" onClick={onToggle}>
          {isPlaying ? (
            <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
              <polygon points="5,3 19,12 5,21" />
            </svg>
          )}
        </button>
      </div>

      <div className="player-right">
        <span className="player-time">
          {minutes}:{seconds.toString().padStart(2, '0')} / 0:30
        </span>
        <div className="player-progress" onClick={handleSeek}>
          <div
            className="player-progress-fill"
            style={{ width: `${(progress || 0) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export default PreviewPlayer;
