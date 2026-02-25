import { useCallback, useRef, useState, useMemo, useEffect } from 'react';
import { useDispatch } from '../state/AppContext';
import { useAuth } from '../state/AuthContext';
import { GO_TO_INPUT } from '../state/actions';
import { findArtistTrack } from '../api/musicClient';
import { useAudioPreview } from '../hooks/useAudioPreview';
import Header from './Header';
import UniverseCanvas from '../galaxy/UniverseCanvas';
import FavoriteButton from './FavoriteButton';
import DislikeButton from './DislikeButton';
import DiscoveredButton from './DiscoveredButton';
import '../styles/universe.css';

function UniverseView() {
  const dispatch = useDispatch();
  const { user, universeData } = useAuth();
  const canvasRef = useRef(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [focusedCluster, setFocusedCluster] = useState(null);

  const universeLabel = user?.displayName ? `${user.displayName}\u2019s Universe` : 'My Universe';

  // Build enriched node array from universe visualization data
  const { nodes, clusterCenters, bridgeLinks } = useMemo(() => {
    if (!universeData?.visualization) return { nodes: [], clusterCenters: [], bridgeLinks: [] };

    const viz = universeData.visualization;

    // Add radius field for hit testing (setupInteractions expects node.radius)
    const enrichedNodes = viz.nodes.map((n) => ({
      ...n,
      radius: n.size,
    }));

    return {
      nodes: enrichedNodes,
      clusterCenters: viz.clusterCenters || [],
      bridgeLinks: viz.bridgeLinks || [],
    };
  }, [universeData]);

  const handleBack = useCallback(() => {
    dispatch({ type: GO_TO_INPUT });
  }, [dispatch]);

  const handleSelectNode = useCallback((node) => {
    setSelectedNode(node);
    if (!node) {
      // Clicked empty space — could zoom to nearest cluster
    }
  }, []);

  const handleHoverNode = useCallback(() => {
    // Hover state is managed in canvas stateRef
  }, []);

  const handleCloseCard = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const handleZoomToCluster = useCallback((clusterId) => {
    canvasRef.current?.zoomToCluster(clusterId);
    setFocusedCluster(clusterId);
    setSelectedNode(null);
  }, []);

  const handleBackToOverview = useCallback(() => {
    canvasRef.current?.resetView();
    setFocusedCluster(null);
    setSelectedNode(null);
  }, []);

  // Compute stats
  const stats = useMemo(() => {
    if (!universeData) return null;
    const recCount = universeData.visualization?.totalRecs || 0;
    return {
      artists: universeData.artistCount || 0,
      clusters: universeData.clusters?.length || 0,
      recs: recCount,
      bridges: universeData.bridges?.length || 0,
    };
  }, [universeData]);

  if (!universeData) return null;

  return (
    <div className="universe-view">
      {/* Header overlay */}
      <div className="universe-header-overlay">
        <Header
          showBack
          onBack={handleBack}
          mapName={universeLabel}
        />
      </div>

      {/* Canvas */}
      <UniverseCanvas
        ref={canvasRef}
        nodes={nodes}
        clusterCenters={clusterCenters}
        bridgeLinks={bridgeLinks}
        onSelectNode={handleSelectNode}
        onHoverNode={handleHoverNode}
      />

      {/* Stats bar */}
      {stats && (
        <div className="universe-stats-bar">
          <span className="universe-stat-item">{stats.artists} artists</span>
          <span className="universe-stat-sep">&middot;</span>
          <span className="universe-stat-item">{stats.clusters} clouds</span>
          <span className="universe-stat-sep">&middot;</span>
          <span className="universe-stat-item">{stats.recs} recommendations</span>
          {stats.bridges > 0 && (
            <>
              <span className="universe-stat-sep">&middot;</span>
              <span className="universe-stat-item">{stats.bridges} bridges</span>
            </>
          )}
        </div>
      )}

      {/* Cluster chips — tap to zoom */}
      <div className="universe-cluster-chips">
        {clusterCenters.map((c, i) => (
          <button
            key={i}
            className={`universe-cluster-chip ${focusedCluster === i ? 'active' : ''}`}
            onClick={() => handleZoomToCluster(i)}
            style={{ borderColor: `hsla(${c.color.h}, ${c.color.s}%, ${c.color.l}%, 0.5)` }}
          >
            <span
              className="universe-chip-dot"
              style={{ background: `hsl(${c.color.h}, ${c.color.s}%, ${c.color.l}%)` }}
            />
            <span className="universe-chip-label">{c.label}</span>
          </button>
        ))}
      </div>

      {/* Back to overview button */}
      {focusedCluster !== null && (
        <button className="universe-back-overview-btn" onClick={handleBackToOverview}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <path d="M15 3h6v6" />
            <path d="M9 21H3v-6" />
            <path d="M21 3l-7 7" />
            <path d="M3 21l7-7" />
          </svg>
          <span>Overview</span>
        </button>
      )}

      {/* Zoom controls */}
      <div className="universe-zoom-controls">
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

      {/* Artist detail card */}
      {selectedNode && (
        <UniverseArtistCard
          node={selectedNode}
          cluster={clusterCenters[selectedNode.clusterId]}
          onClose={handleCloseCard}
        />
      )}
    </div>
  );
}

// --- Artist detail card overlay ---

function UniverseArtistCard({ node, cluster, onClose }) {
  const [topTrack, setTopTrack] = useState(null);
  const [loadingTrack, setLoadingTrack] = useState(false);
  const audio = useAudioPreview();

  // Fetch preview track
  useEffect(() => {
    audio.pause();
    setTopTrack(null);
    setLoadingTrack(true);

    let cancelled = false;
    findArtistTrack(node.name)
      .then((track) => { if (!cancelled) setTopTrack(track); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingTrack(false); });

    return () => { cancelled = true; };
  }, [node]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePlayPause = () => {
    if (!topTrack?.preview) return;
    if (audio.currentTrack?.id === topTrack.id) {
      audio.toggle();
    } else {
      audio.play(topTrack);
    }
  };

  return (
    <div className="universe-artist-card">
      <button className="universe-card-close" onClick={onClose}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      <div className="universe-card-header">
        {node.image ? (
          <img className="universe-card-image" src={node.image} alt={node.name} />
        ) : (
          <div className="universe-card-image universe-card-image-placeholder">
            {node.name.charAt(0)}
          </div>
        )}
        <div className="universe-card-info">
          <h3 className="universe-card-name">{node.name}</h3>
          <div className="universe-card-badges">
            {node.isRecommendation ? (
              <span className="universe-card-badge badge-rec">
                Recommendation
                {node.matchScore != null && (
                  <span className="universe-card-score">
                    {Math.round(node.matchScore * 100)}%
                  </span>
                )}
              </span>
            ) : (
              <span className={`universe-card-badge badge-${node.source}`}>
                {node.source === 'favorite' ? 'Favorite' : 'Discovered'}
              </span>
            )}
            {cluster && (
              <span className="universe-card-cluster">
                <span
                  className="universe-card-cluster-dot"
                  style={{ background: `hsl(${cluster.color.h}, ${cluster.color.s}%, ${cluster.color.l}%)` }}
                />
                {cluster.label}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Suggested by (for recommendations) */}
      {node.isRecommendation && node.suggestedBy?.length > 0 && (
        <div className="universe-card-suggested">
          Suggested by {node.suggestedBy.join(', ')}
        </div>
      )}

      {/* Audio preview */}
      <div className="universe-card-preview">
        {loadingTrack ? (
          <span className="universe-card-preview-loading">Loading preview...</span>
        ) : topTrack?.preview ? (
          <button className="universe-card-play-btn" onClick={handlePlayPause}>
            {audio.isPlaying && audio.currentTrack?.id === topTrack.id ? (
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <polygon points="5,3 19,12 5,21" />
              </svg>
            )}
            <span>{topTrack.title}</span>
          </button>
        ) : (
          <span className="universe-card-preview-none">No preview available</span>
        )}
      </div>

      {/* Action buttons */}
      <div className="universe-card-actions">
        <FavoriteButton artistName={node.name} artistId={null} artistImage={node.image} />
        <DislikeButton artistName={node.name} artistId={null} artistImage={node.image} />
        <DiscoveredButton artistName={node.name} artistId={null} artistImage={node.image} />
      </div>
    </div>
  );
}

export default UniverseView;
