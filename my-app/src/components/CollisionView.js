import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppState, useDispatch } from '../state/AppContext';
import { useAuth } from '../state/AuthContext';
import { GO_TO_INPUT } from '../state/actions';
import { getCollision, triggerCollisionCompute, getCollisionStatus, getAvatarUrl } from '../api/authClient';
import Header from './Header';
import CollisionCanvas from '../galaxy/CollisionCanvas';
import ArtistDetailPanel from './ArtistDetailPanel';
import GalaxyLegend from './GalaxyLegend';
import { ZONE_COLORS } from '../galaxy/collisionGraphBuilder';
import { useBottomBarDetect } from '../hooks/useBottomBarDetect';
import '../styles/collision.css';
import '../styles/galaxy.css';

function CollisionView() {
  useBottomBarDetect();
  const { collisionFriendId } = useAppState();
  const dispatch = useDispatch();
  const { user, friends, favorites, discoveredArtists, dislikes } = useAuth();
  const canvasRef = useRef(null);

  const [collisionData, setCollisionData] = useState(null);
  const [status, setStatus] = useState('loading'); // loading, none, computing, ready, error
  const [error, setError] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [showLegend, setShowLegend] = useState(false);
  const [recomputing, setRecomputing] = useState(false);

  const friend = friends.find((f) => f.id === collisionFriendId);
  const pollRef = useRef(null);

  // Fetch collision data on mount
  useEffect(() => {
    if (!collisionFriendId) return;

    async function fetchCollision() {
      setStatus('loading');
      try {
        const res = await getCollision(collisionFriendId);
        const data = await res.json();

        if (data.collision && data.status === 'ready') {
          setCollisionData(data.collision);
          setStatus('ready');
          // If stale, backend auto-triggered recompute — poll for the update
          if (data.isStale) {
            setRecomputing(true);
            startPolling(true);
          }
        } else if (data.status === 'computing') {
          setStatus('computing');
          startPolling();
        } else {
          // No collision computed yet — trigger compute
          setStatus('computing');
          await triggerCompute();
        }
      } catch (err) {
        setError(err.message);
        setStatus('error');
      }
    }

    fetchCollision();

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [collisionFriendId]);

  async function triggerCompute() {
    try {
      const res = await triggerCollisionCompute(collisionFriendId);
      const data = await res.json();
      if (data.status === 'ready') {
        // Already up to date, re-fetch
        const collRes = await getCollision(collisionFriendId);
        const collData = await collRes.json();
        if (collData.collision) {
          setCollisionData(collData.collision);
          setStatus('ready');
        }
      } else if (data.status === 'computing') {
        setStatus('computing');
        startPolling();
      } else if (data.error) {
        setError(data.error);
        setStatus('error');
      }
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }

  function startPolling(silentUpdate = false) {
    if (pollRef.current) clearInterval(pollRef.current);
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      if (attempts > 60) {
        clearInterval(pollRef.current);
        pollRef.current = null;
        if (silentUpdate) {
          setRecomputing(false);
        } else {
          setError('Computation timed out');
          setStatus('error');
        }
        return;
      }
      try {
        const res = await getCollisionStatus(collisionFriendId);
        const data = await res.json();
        if (data.status === 'ready' && !data.isComputing) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          const collRes = await getCollision(collisionFriendId);
          const collData = await collRes.json();
          if (collData.collision) {
            setCollisionData(collData.collision);
            setStatus('ready');
            if (silentUpdate) setRecomputing(false);
          }
        } else if (data.status === 'error') {
          clearInterval(pollRef.current);
          pollRef.current = null;
          if (silentUpdate) {
            setRecomputing(false);
          } else {
            setError('Computation failed');
            setStatus('error');
          }
        }
      } catch {
        // continue polling
      }
    }, 5000);
  }

  const handleBack = useCallback(() => {
    dispatch({ type: GO_TO_INPUT });
  }, [dispatch]);

  const handleSelectNode = useCallback((node) => {
    setSelectedNode(node);
  }, []);

  const handleHoverNode = useCallback(() => {}, []);

  const handleCloseCard = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const userLabel = user?.displayName || 'You';
  const friendLabel = friend?.displayName || collisionData?.friendInfo?.displayName || 'Friend';
  const mapLabel = `${userLabel} × ${friendLabel}`;

  // Computing / loading state
  if (status !== 'ready' || !collisionData) {
    return (
      <div className="collision-view">
        <div className="collision-header-overlay">
          <Header showBack onBack={handleBack} mapName="Collide Universes" />
        </div>

        <div className="collision-status-container">
          {status === 'loading' && (
            <div className="collision-status-card">
              <div className="collision-status-spinner" />
              <p className="collision-status-text">Loading collision data...</p>
            </div>
          )}
          {status === 'computing' && (
            <div className="collision-status-card">
              <div className="collision-status-spinner" />
              <p className="collision-status-text">Computing collision between universes...</p>
              <p className="collision-status-hint">This may take a minute as we analyze artist connections.</p>
            </div>
          )}
          {status === 'error' && (
            <div className="collision-status-card collision-status-error">
              <p className="collision-status-text">{error || 'Something went wrong.'}</p>
              <button className="collision-retry-btn" onClick={() => triggerCompute()}>
                Retry
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="collision-view">
      {/* Header */}
      <div className="collision-header-overlay">
        <Header showBack onBack={handleBack} mapName={mapLabel} />
      </div>

      {/* Collision identity badges */}
      <div className="collision-identity-badges">
        <div className="collision-badge collision-badge-user">
          {user?.hasAvatar ? (
            <img src={getAvatarUrl(user.id)} alt="" className="collision-badge-avatar" />
          ) : (
            <span className="collision-badge-initials">{userLabel[0]}</span>
          )}
          <span className="collision-badge-name">{userLabel}</span>
        </div>
        <span className="collision-badge-x">×</span>
        <div className="collision-badge collision-badge-friend">
          {(friend?.hasAvatar || collisionData.friendInfo?.hasAvatar) ? (
            <img src={getAvatarUrl(collisionFriendId)} alt="" className="collision-badge-avatar" />
          ) : (
            <span className="collision-badge-initials">{friendLabel[0]}</span>
          )}
          <span className="collision-badge-name">{friendLabel}</span>
        </div>
      </div>

      {/* Canvas */}
      <CollisionCanvas
        ref={canvasRef}
        collisionData={collisionData}
        favorites={favorites}
        discoveredArtists={discoveredArtists}
        dislikes={dislikes}
        onSelectNode={handleSelectNode}
        onHoverNode={handleHoverNode}
      />

      {/* Zoom controls */}
      <div className="zoom-controls collision-zoom-override">
        <button
          className="zoom-btn"
          onClick={() => canvasRef.current?.zoomBy(1.4)}
          title="Zoom in"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
            <line x1="12" y1="8" x2="12" y2="16" />
            <line x1="8" y1="12" x2="16" y2="12" />
          </svg>
        </button>
        <button
          className="zoom-btn"
          onClick={() => canvasRef.current?.zoomBy(0.7)}
          title="Zoom out"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
            <line x1="8" y1="12" x2="16" y2="12" />
          </svg>
        </button>
      </div>

      {/* Bottom toolbar */}
      <div className="galaxy-toolbar">
        <div className="toolbar-tools-wrapper">
          <button
            className="toolbar-btn toolbar-icon"
            onClick={() => canvasRef.current?.resetView()}
            title="Reset zoom"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
              <path d="M15 3h6v6" />
              <path d="M9 21H3v-6" />
              <path d="M21 3l-7 7" />
              <path d="M3 21l7-7" />
            </svg>
          </button>
        </div>

        <div className="toolbar-actions-group">
          <button
            className="toolbar-btn toolbar-pill"
            onClick={() => setShowLegend((prev) => !prev)}
            title="Legend"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <line x1="14" y1="6.5" x2="21" y2="6.5" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <line x1="14" y1="17.5" x2="21" y2="17.5" />
            </svg>
            <span>Legend</span>
          </button>
        </div>
      </div>

      {/* Recomputing indicator */}
      {recomputing && (
        <div className="collision-recomputing-pill">
          <div className="collision-recomputing-spinner" />
          <span>Recomputing...</span>
        </div>
      )}

      {/* Stats bar */}
      {collisionData.stats && (
        <div className="collision-stats-bar">
          <div className="collision-stat">
            <span className="collision-stat-value">{collisionData.stats.coreOverlapCount}</span>
            <span className="collision-stat-label">Shared</span>
          </div>
          <div className="collision-stat">
            <span className="collision-stat-value">{collisionData.stats.totalArtists}</span>
            <span className="collision-stat-label">Total</span>
          </div>
          <div className="collision-stat">
            <span className="collision-stat-value">{collisionData.stats.sharedFrontierCount}</span>
            <span className="collision-stat-label">Frontier</span>
          </div>
        </div>
      )}

      {/* Legend */}
      {showLegend && (
        <CollisionLegend onClose={() => setShowLegend(false)} />
      )}

      {/* Artist detail panel */}
      {selectedNode && !selectedNode._isZoneCenter && (
        <ArtistDetailPanel
          node={selectedNode}
          onClose={handleCloseCard}
        />
      )}
    </div>
  );
}

function CollisionLegend({ onClose }) {
  const zones = [
    { key: 'core_overlap', label: 'Core Overlap', desc: 'Artists you both know and love' },
    { key: 'your_artists', label: 'Your Artists', desc: 'Your exclusive favorites' },
    { key: 'friend_artists', label: "Friend's Artists", desc: 'Their exclusive favorites' },
    { key: 'shared_frontier', label: 'Shared Frontier', desc: 'New artists to explore together' },
    { key: 'your_exploration', label: 'Your Exploration', desc: "Their artists that connect to yours" },
    { key: 'friend_exploration', label: "Friend's Exploration", desc: 'Your artists that connect to theirs' },
  ];

  return (
    <div className="collision-legend-card">
      <div className="collision-legend-header">
        <span>Collision Zones</span>
        <button className="collision-legend-close" onClick={onClose}>&times;</button>
      </div>
      {zones.map((z) => {
        const color = ZONE_COLORS[z.key];
        return (
          <div key={z.key} className="collision-legend-item">
            <span
              className="collision-legend-dot"
              style={{ background: `hsl(${color.h}, ${color.s}%, ${color.l}%)` }}
            />
            <div className="collision-legend-text">
              <span className="collision-legend-name">{z.label}</span>
              <span className="collision-legend-desc">{z.desc}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default CollisionView;
