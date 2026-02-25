import { useRef, useEffect } from 'react';
import { useAuth, useAuthActions } from '../state/AuthContext';
import { renderUniverseMiniViz } from '../galaxy/universeMiniViz';
import '../styles/universe.css';

function MyUniverseSection() {
  const { user, favorites, discoveredArtists, universeData, universeStatus } = useAuth();
  const { showAuthModal, refreshUniverse } = useAuthActions();
  const canvasRef = useRef(null);

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
  const displayName = user?.displayName || 'My';

  return (
    <div className="universe-section">
      <h3 className="universe-title">
        <svg viewBox="0 0 24 24" fill="none" width="16" height="16">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="12" cy="12" r="3.5" fill="currentColor" />
          <ellipse cx="12" cy="12" rx="10" ry="3.5" stroke="currentColor" strokeWidth="0.8" opacity="0.5" />
        </svg>
        {displayName}&rsquo;s Universe
        {universeData && universeData.clusters && (
          <span className="section-count">{universeData.clusters.length} clusters</span>
        )}
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

      {/* Ready — show visualization + clusters */}
      {user && universeData && (universeStatus === 'ready' || universeStatus === 'stale') && (
        <div className="universe-content">
          {/* Mini visualization canvas */}
          <div className="universe-viz-container">
            <canvas ref={canvasRef} className="universe-viz-canvas" />
          </div>

          {/* Stats summary */}
          <div className="universe-stats">
            <span className="universe-stat">{universeData.artistCount} artists</span>
            <span className="universe-stat-dot">&middot;</span>
            <span className="universe-stat">{universeData.clusters?.length} taste clouds</span>
            {universeData.bridges?.length > 0 && (
              <>
                <span className="universe-stat-dot">&middot;</span>
                <span className="universe-stat">{universeData.bridges.length} bridges</span>
              </>
            )}
          </div>

          {/* Cluster cards — horizontal scroll */}
          <div className="universe-clusters-scroll">
            {universeData.clusters.map((cluster) => (
              <div
                key={cluster.id}
                className="universe-cluster-card"
                style={{
                  borderColor: `hsla(${cluster.color.h}, ${cluster.color.s}%, ${cluster.color.l}%, 0.3)`,
                }}
              >
                <div className="universe-cluster-header">
                  <div
                    className="universe-cluster-dot"
                    style={{
                      background: `hsl(${cluster.color.h}, ${cluster.color.s}%, ${cluster.color.l}%)`,
                    }}
                  />
                  <h4 className="universe-cluster-label">{cluster.label}</h4>
                  <span className="universe-cluster-count">{cluster.members.length}</span>
                </div>

                {/* Member avatars */}
                <div className="universe-cluster-members">
                  {cluster.members.slice(0, 4).map((m) => (
                    m.image ? (
                      <img key={m.name} className="universe-member-avatar" src={m.image} alt={m.name} title={m.name} />
                    ) : (
                      <div key={m.name} className="universe-member-avatar universe-member-placeholder" title={m.name}>
                        {m.name.charAt(0)}
                      </div>
                    )
                  ))}
                  {cluster.members.length > 4 && (
                    <span className="universe-member-more">+{cluster.members.length - 4}</span>
                  )}
                </div>

                {/* Top tags */}
                <div className="universe-cluster-tags">
                  {cluster.topTags.slice(0, 3).map((tag) => (
                    <span key={tag} className="universe-tag">{tag}</span>
                  ))}
                </div>

                {/* Recommendations */}
                {cluster.recommendations.length > 0 && (
                  <div className="universe-cluster-recs">
                    <span className="universe-recs-label">Try:</span>
                    {cluster.recommendations.slice(0, 3).map((rec) => (
                      <span key={rec.name} className="universe-rec-name">{rec.name}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Bridge artists */}
          {universeData.bridges?.length > 0 && (
            <div className="universe-bridges">
              <span className="universe-bridges-label">Bridges:</span>
              {universeData.bridges.slice(0, 5).map((b) => (
                <span key={b.name} className="universe-bridge-name">{b.name}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default MyUniverseSection;
