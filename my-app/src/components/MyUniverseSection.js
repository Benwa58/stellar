import { useRef, useEffect, useCallback } from 'react';
import { useAuth, useAuthActions } from '../state/AuthContext';
import { useDispatch } from '../state/AppContext';
import { VIEW_UNIVERSE } from '../state/actions';
import { renderUniverseMiniViz } from '../galaxy/universeMiniViz';
import '../styles/universe.css';

function MyUniverseSection() {
  const { user, favorites, discoveredArtists, universeData, universeStatus } = useAuth();
  const { showAuthModal, refreshUniverse } = useAuthActions();
  const appDispatch = useDispatch();
  const canvasRef = useRef(null);

  const handleExplore = useCallback(() => {
    appDispatch({ type: VIEW_UNIVERSE });
  }, [appDispatch]);

  // Render mini visualization when data is available
  useEffect(() => {
    if (!universeData?.visualization || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const cleanup = renderUniverseMiniViz(canvas, universeData);
    return cleanup;
  }, [universeData]);

  // Auto-trigger compute when stale
  useEffect(() => {
    if (user && universeStatus === 'stale') {
      refreshUniverse();
    }
  }, [user, universeStatus, refreshUniverse]);

  const hasData = (favorites.length + discoveredArtists.length) >= 4;
  const universeLabel = user?.displayName ? `${user.displayName}\u2019s Universe` : 'My Universe';

  return (
    <div className="universe-section">
      <h3 className="universe-title">
        <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="12" cy="12" r="3.5" fill="currentColor" />
          <ellipse cx="12" cy="12" rx="10" ry="3.5" stroke="currentColor" strokeWidth="0.8" opacity="0.5" />
        </svg>
        {universeLabel}
      </h3>

      {/* Not signed in */}
      {!user && (
        <div className="universe-placeholder-wrap">
          <button
            className="section-placeholder-card"
            onClick={() => showAuthModal('register')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="20" height="20">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span className="section-placeholder-text">Sign in to see your personal music universe</span>
          </button>
        </div>
      )}

      {/* Signed in, not enough data */}
      {user && !hasData && universeStatus !== 'computing' && (
        <div className="universe-placeholder-wrap">
          <div className="section-placeholder-card empty">
            <span className="section-placeholder-text">
              Add favorites and discoveries to create your personal music universe
            </span>
          </div>
        </div>
      )}

      {/* Signed in, enough data but no universe yet */}
      {user && hasData && universeStatus === 'none' && (
        <div className="universe-build-prompt">
          <button className="universe-build-btn" onClick={refreshUniverse}>
            Build Your Universe
          </button>
          <span className="universe-build-hint">
            {favorites.length + discoveredArtists.length} artists ready to map
          </span>
        </div>
      )}

      {/* Computing */}
      {user && universeStatus === 'computing' && (
        <div className="universe-computing">
          <div className="universe-computing-spinner" />
          <span className="universe-computing-text">Mapping your musical universe...</span>
        </div>
      )}

      {/* Error */}
      {user && universeStatus === 'error' && (
        <div className="universe-error">
          <span>Something went wrong building your universe.</span>
          <button className="universe-retry-btn" onClick={refreshUniverse}>
            Try again
          </button>
        </div>
      )}

      {/* Ready — show visualization snapshot */}
      {user && universeData && (universeStatus === 'ready' || universeStatus === 'stale') && (
        <div className="universe-content">
          <div className="universe-viz-container" onClick={handleExplore} role="button" tabIndex={0}>
            <canvas ref={canvasRef} className="universe-viz-canvas" />
            <div className="universe-viz-explore-hint">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="14" height="14">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <span>Tap to explore</span>
            </div>
          </div>
          <span className="universe-artist-count">{favorites.length + discoveredArtists.length} artists</span>
        </div>
      )}
    </div>
  );
}

export default MyUniverseSection;
