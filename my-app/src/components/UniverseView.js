import { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch } from '../state/AppContext';
import { useAuth } from '../state/AuthContext';
import { useAuthActions } from '../state/AuthContext';
import { GO_TO_INPUT } from '../state/actions';
import Header from './Header';
import UniverseCanvas from '../galaxy/UniverseCanvas';
import UniverseSearch from './UniverseSearch';
import ArtistDetailPanel from './ArtistDetailPanel';
import GalaxyInfoModal from './GalaxyInfoModal';
import GalaxyLegend from './GalaxyLegend';
import GalaxyPlayerController from './GalaxyPlayerController';
import ExportDrawer from './ExportDrawer';
import ShareUniverseDrawer from './ShareUniverseDrawer';
import ReleaseNotesModal from './ReleaseNotesModal';
import { useBottomBarDetect } from '../hooks/useBottomBarDetect';
import '../styles/universe.css';
import '../styles/galaxy.css';

function UniverseView() {
  useBottomBarDetect();
  const dispatch = useDispatch();
  const { user, universeData, universeStatus, favorites, discoveredArtists, dislikes } = useAuth();
  const { refreshUniverse } = useAuthActions();
  const canvasRef = useRef(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [showTools, setShowTools] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);

  // Only recompute a stale universe on mount (e.g. navigating back after
  // marking favorites elsewhere).  Do NOT recompute while actively viewing —
  // that resets the zoom/pan transform and snaps the view to LOD 1.
  const mountedRef = useRef(false);
  useEffect(() => {
    if (user && universeStatus === 'stale' && !mountedRef.current) {
      refreshUniverse();
    }
    mountedRef.current = true;
  }, [user, universeStatus, refreshUniverse]);

  const universeLabel = user?.displayName ? `${user.displayName}\u2019s Universe` : 'My Universe';

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

  const handleOpenExport = useCallback(() => {
    setSelectedNode(null);
    setShowShare(false);
    setShowExport(true);
  }, []);

  const handleCloseExport = useCallback(() => {
    setShowExport(false);
  }, []);

  const handleOpenShare = useCallback(() => {
    setSelectedNode(null);
    setShowExport(false);
    setShowShare(true);
  }, []);

  const handleCloseShare = useCallback(() => {
    setShowShare(false);
  }, []);

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
        universeData={universeData}
        favorites={favorites}
        discoveredArtists={discoveredArtists}
        dislikes={dislikes}
        onSelectNode={handleSelectNode}
        onHoverNode={handleHoverNode}
      />

      {/* Search */}
      <UniverseSearch canvasRef={canvasRef} />

      {/* Zoom controls — stacked above toolbar */}
      <div className="zoom-controls universe-zoom-override">
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

      {/* Bottom-left toolbar */}
      <div className="galaxy-toolbar">
        {/* Tools — expandable */}
        <div className="toolbar-tools-wrapper">
          <button
            className={`toolbar-btn toolbar-icon toolbar-tools-trigger ${showTools ? 'active' : ''}`}
            onClick={() => setShowTools((prev) => !prev)}
            title="Tools"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          {showTools && (
            <>
              <div className="toolbar-tools-backdrop" onClick={() => setShowTools(false)} />
              <div className="toolbar-tools-menu">
                <button onClick={() => { canvasRef.current?.resetView(); setShowTools(false); }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                    <path d="M15 3h6v6" />
                    <path d="M9 21H3v-6" />
                    <path d="M21 3l-7 7" />
                    <path d="M3 21l7-7" />
                  </svg>
                  <span>Reset Zoom</span>
                </button>
                <button onClick={() => { setShowInfo(true); setShowTools(false); }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  <span>Info</span>
                </button>
                <button onClick={() => { setShowLegend((prev) => !prev); setShowTools(false); }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <line x1="14" y1="6.5" x2="21" y2="6.5" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <line x1="14" y1="17.5" x2="21" y2="17.5" />
                  </svg>
                  <span>Legend</span>
                </button>
                <button onClick={() => { setShowReleaseNotes(true); setShowTools(false); }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="9" y1="13" x2="15" y2="13" />
                    <line x1="9" y1="17" x2="13" y2="17" />
                  </svg>
                  <span>Release Notes</span>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Share / Playlist / Explore — grouped so they wrap together on mobile */}
        <div className="toolbar-actions-group">
          <button
            className="toolbar-btn toolbar-pill"
            onClick={handleOpenShare}
            title="Share universe"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            <span>Share</span>
          </button>

          <button
            className="toolbar-btn toolbar-pill"
            onClick={handleOpenExport}
            title="Playlist"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
            <span>Playlist</span>
          </button>

          <GalaxyPlayerController
            canvasRef={canvasRef}
            externalSelectedNode={selectedNode}
            onExternalSelectNode={handleSelectNode}
            portalSelector=".universe-view"
          />
        </div>
      </div>

      {showLegend && <GalaxyLegend onClose={() => setShowLegend(false)} />}
      {showInfo && <GalaxyInfoModal onClose={() => setShowInfo(false)} />}
      {showReleaseNotes && <ReleaseNotesModal onClose={() => setShowReleaseNotes(false)} />}
      {showShare && (
        <ShareUniverseDrawer
          onClose={handleCloseShare}
          canvasRef={canvasRef}
          universeLabel={universeLabel}
          universeData={universeData}
          overrideNodes={canvasRef.current?.getNodes() || []}
          overrideLinks={canvasRef.current?.getLinks() || []}
        />
      )}
      {showExport && (
        <ExportDrawer
          onClose={handleCloseExport}
          seedArtists={[{ name: universeLabel }]}
          overrideNodes={canvasRef.current?.getNodes() || []}
          showRecsOnlyFilter
        />
      )}

      {/* Artist detail panel */}
      {selectedNode && !selectedNode._isClusterCenter && !showExport && !showShare && (
        <ArtistDetailPanel
          node={selectedNode}
          onClose={handleCloseCard}
        />
      )}
    </div>
  );
}

export default UniverseView;
