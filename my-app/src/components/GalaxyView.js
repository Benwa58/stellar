import { useCallback, useRef, useState, useEffect } from 'react';
import { useAppState, useDispatch } from '../state/AppContext';
import { SELECT_NODE, GO_TO_INPUT, ADD_SEED_AND_REGENERATE, SET_LOADING_PROGRESS, SET_GALAXY_DATA, SET_ERROR, MERGE_DRIFT_NODES } from '../state/actions';
import { generateRecommendations } from '../engine/recommendationEngine';
import { expandUniverse } from '../engine/expandUniverse';
import Header from './Header';
import GalaxyCanvas from '../galaxy/GalaxyCanvas';
import ArtistDetailPanel from './ArtistDetailPanel';
import GalaxyInfoModal from './GalaxyInfoModal';
import SaveMapModal from './SaveMapModal';
import GalaxyPlayerController from './GalaxyPlayerController';
import GalaxyLegend from './GalaxyLegend';
import ExportDrawer from './ExportDrawer';
import ShareGalaxyDrawer from './ShareGalaxyDrawer';
import '../styles/galaxy.css';

function GalaxyView() {
  const { selectedNode, seedArtists, galaxyData } = useAppState();
  const dispatch = useDispatch();
  const canvasRef = useRef(null);
  const [showTools, setShowTools] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [isExpanding, setIsExpanding] = useState(false);
  const [hasExpanded, setHasExpanded] = useState(false);

  // Reset expand state when galaxy data changes (new galaxy generation)
  const galaxyGenRef = useRef(null);
  useEffect(() => {
    if (galaxyData && !galaxyData._driftMergeGen) {
      // Only reset when it's a fresh galaxy, not a drift merge
      if (galaxyGenRef.current !== galaxyData) {
        galaxyGenRef.current = galaxyData;
        setHasExpanded(false);
      }
    }
  }, [galaxyData]);

  const handleSaved = useCallback(() => {
    setShowSaveModal(false);
    setShowSaveConfirm(true);
    setTimeout(() => setShowSaveConfirm(false), 2000);
  }, []);

  const handleBack = useCallback(() => {
    dispatch({ type: GO_TO_INPUT });
  }, [dispatch]);

  const handleClosePanel = useCallback(() => {
    dispatch({ type: SELECT_NODE, payload: null });
  }, [dispatch]);

  const handleOpenExport = useCallback(() => {
    dispatch({ type: SELECT_NODE, payload: null });
    setShowShare(false);
    setShowExport(true);
  }, [dispatch]);

  const handleCloseExport = useCallback(() => {
    setShowExport(false);
  }, []);

  const handleOpenShare = useCallback(() => {
    dispatch({ type: SELECT_NODE, payload: null });
    setShowExport(false);
    setShowShare(true);
  }, [dispatch]);

  const handleCloseShare = useCallback(() => {
    setShowShare(false);
  }, []);

  const handleExpandUniverse = useCallback(async () => {
    if (isExpanding || hasExpanded || !galaxyData) return;
    setIsExpanding(true);
    try {
      const existingNodes = canvasRef.current?.getNodes() || galaxyData.nodes;
      const result = await expandUniverse(existingNodes, seedArtists, () => {});
      if (result.nodes.length > 0) {
        dispatch({ type: MERGE_DRIFT_NODES, payload: result });
      }
      setHasExpanded(true);
    } catch (err) {
      console.error('Expand Universe failed:', err);
    } finally {
      setIsExpanding(false);
    }
  }, [isExpanding, hasExpanded, galaxyData, seedArtists, dispatch]);

  const handleAddSeed = useCallback(async (node) => {
    const newSeed = {
      id: node.id,
      name: node.name,
      image: node.image,
      imageLarge: node.imageLarge,
      genres: node.genres || [],
      externalUrl: node.externalUrl,
    };

    const updatedSeeds = seedArtists.some((a) => a.id === node.id)
      ? seedArtists
      : [...seedArtists, newSeed];

    dispatch({ type: ADD_SEED_AND_REGENERATE, payload: newSeed });

    try {
      const galaxyData = await generateRecommendations(
        updatedSeeds,
        (progress) => {
          dispatch({ type: SET_LOADING_PROGRESS, payload: progress });
        }
      );
      dispatch({ type: SET_GALAXY_DATA, payload: galaxyData });
    } catch (err) {
      console.error('Regeneration failed:', err);
      dispatch({
        type: SET_ERROR,
        payload: err.message || 'Failed to regenerate. Please try again.',
      });
    }
  }, [seedArtists, dispatch]);

  return (
    <div className="galaxy-view">
      <div className="galaxy-header-overlay">
        <Header
          showBack
          onBack={handleBack}
          artistCount={seedArtists.length}
        />
      </div>

      <GalaxyCanvas ref={canvasRef} />

      {/* Expand Universe — upper-left ghost button */}
      {!hasExpanded && galaxyData && (
        <button
          className="expand-universe-btn"
          onClick={handleExpandUniverse}
          disabled={isExpanding}
          title="Discover genre-adjacent outliers"
        >
          {isExpanding ? (
            <span className="expand-universe-spinner" />
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
              <circle cx="12" cy="12" r="10" strokeDasharray="3 3" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
          )}
          <span>Expand Universe</span>
        </button>
      )}

      {/* Zoom controls — stacked above toolbar */}
      <div className="zoom-controls">
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
              </div>
            </>
          )}
        </div>

        {/* Save */}
        <button
          className={`toolbar-btn toolbar-icon ${showSaveConfirm ? 'saved' : ''}`}
          onClick={() => setShowSaveModal(true)}
          title={showSaveConfirm ? 'Saved!' : 'Save map'}
        >
          {showSaveConfirm ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
          )}
        </button>

        {/* Share */}
        <button
          className="toolbar-btn toolbar-pill"
          onClick={handleOpenShare}
          title="Share galaxy"
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

        {/* Playlist */}
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

        {/* Explore */}
        <GalaxyPlayerController canvasRef={canvasRef} />
      </div>

      {showLegend && <GalaxyLegend onClose={() => setShowLegend(false)} />}
      {showInfo && <GalaxyInfoModal onClose={() => setShowInfo(false)} />}
      {showSaveModal && (
        <SaveMapModal
          onClose={() => setShowSaveModal(false)}
          onSaved={handleSaved}
        />
      )}
      {showShare && (
        <ShareGalaxyDrawer
          onClose={handleCloseShare}
          canvasRef={canvasRef}
          seedArtists={seedArtists}
        />
      )}
      {showExport && (
        <ExportDrawer
          onClose={handleCloseExport}
          seedArtists={seedArtists}
        />
      )}
      {selectedNode && !showExport && !showShare && (
        <ArtistDetailPanel
          node={selectedNode}
          onClose={handleClosePanel}
          onAddSeed={handleAddSeed}
        />
      )}
    </div>
  );
}

export default GalaxyView;
