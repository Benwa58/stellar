import { useCallback } from 'react';
import '../styles/player.css';

function PreviewPlayer({
  currentTrack,
  isPlaying,
  isLoading,
  progress,
  onToggle,
  onSeek,
  onNext,
  onPrev,
  mode,
  onModeToggle,
  currentIndex,
  totalCount,
}) {
  const handleSeek = useCallback(
    (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const fraction = (e.clientX - rect.left) / rect.width;
      onSeek(Math.max(0, Math.min(1, fraction)));
    },
    [onSeek]
  );

  if (!currentTrack && !isLoading) return null;

  const totalSeconds = 30;
  const elapsed = Math.floor((progress || 0) * totalSeconds);
  const remaining = totalSeconds - elapsed;
  const fmtElapsed = `${Math.floor(elapsed / 60)}:${(elapsed % 60).toString().padStart(2, '0')}`;
  const fmtRemaining = `-${Math.floor(remaining / 60)}:${(remaining % 60).toString().padStart(2, '0')}`;

  return (
    <div className="preview-player">
      {/* Full-width progress bar across the top */}
      <div className="player-progress-bar" onClick={handleSeek}>
        <div
          className="player-progress-fill"
          style={{ width: `${(progress || 0) * 100}%` }}
        />
      </div>

      <div className="player-main">
        <div className="player-left">
          <button
            className={`player-mode-btn ${mode === 'shuffle' ? 'active' : ''}`}
            onClick={onModeToggle}
            title={mode === 'shuffle' ? 'Switch to sequential (clockwise)' : 'Switch to shuffle'}
          >
            {mode === 'shuffle' ? (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                  <polyline points="16 3 21 3 21 8" />
                  <line x1="4" y1="20" x2="21" y2="3" />
                  <polyline points="21 16 21 21 16 21" />
                  <line x1="15" y1="15" x2="21" y2="21" />
                  <line x1="4" y1="4" x2="9" y2="9" />
                </svg>
                <span className="player-mode-label">Shuffle</span>
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                  <polyline points="1 4 1 10 7 10" />
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                </svg>
                <span className="player-mode-label">Sequential</span>
              </>
            )}
          </button>

          <span className="player-position">
            {currentIndex + 1} / {totalCount}
          </span>
        </div>

        <div className="player-center">
          <span className="player-time player-time-left">{fmtElapsed}</span>

          <button className="player-nav-btn" onClick={onPrev} title="Previous">
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <polygon points="19,20 9,12 19,4" />
              <rect x="5" y="4" width="2" height="16" />
            </svg>
          </button>

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

          <button className="player-nav-btn" onClick={onNext} title="Next">
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <polygon points="5,4 15,12 5,20" />
              <rect x="17" y="4" width="2" height="16" />
            </svg>
          </button>

          <span className="player-time player-time-right">{fmtRemaining}</span>
        </div>

        <div className="player-right">
          {currentTrack?.albumImage ? (
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
            <span className="player-track-name">
              {isLoading ? 'Loading...' : currentTrack?.name || ''}
            </span>
            <span className="player-artist-name">
              {currentTrack?.artistName || ''}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PreviewPlayer;
