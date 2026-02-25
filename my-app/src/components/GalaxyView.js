import { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import { useAppState, useDispatch } from '../state/AppContext';
import { useAuth, useAuthActions } from '../state/AuthContext';
import { SELECT_NODE, GO_TO_INPUT, ADD_SEED_AND_REGENERATE, SET_LOADING_PROGRESS, SET_GALAXY_DATA, SET_ERROR, MERGE_DRIFT_NODES, REMOVE_DRIFT_NODES, QUEUE_SEED, UNQUEUE_SEED, SET_MAP_NAME } from '../state/actions';
import { generateMapName } from '../utils/mapNameUtil';
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
import ReleaseNotesModal from './ReleaseNotesModal';
import '../styles/galaxy.css';

function GalaxyView() {
  const { selectedNode, seedArtists, galaxyData, pendingSeedQueue, currentMapName } = useAppState();
  const dispatch = useDispatch();
  const { user, favorites, dislikes, knownArtists, discoveredArtists } = useAuth();
  const { showAuthModal } = useAuthActions();
  const canvasRef = useRef(null);
  const [showTools, setShowTools] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [showLegend, setShowLegend] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);
  const defaultMapName = useMemo(() => generateMapName(seedArtists), [seedArtists]);

  const handleMapNameChange = useCallback((name) => {
    dispatch({ type: SET_MAP_NAME, payload: name });
  }, [dispatch]);

  const [isExpanding, setIsExpanding] = useState(false);
  const [hasExpanded, setHasExpanded] = useState(false);
  const [isContracting, setIsContracting] = useState(false);

  // Compute unknown artists count — non-seed nodes not in known, favorites, dislikes, or discovered
  const unknownCount = useMemo(() => {
    if (!user || !galaxyData?.nodes) return 0;
    const knownSet = new Set(knownArtists.map((k) => k.artistName));
    const favSet = new Set(favorites.map((f) => f.artistName));
    const dislikeSet = new Set(dislikes.map((d) => d.artistName));
    const discoveredSet = new Set(discoveredArtists.map((d) => d.artistName));
    let count = 0;
    for (const node of galaxyData.nodes) {
      if (node.type === 'seed') continue;
      const name = node.name;
      if (!knownSet.has(name) && !favSet.has(name) && !dislikeSet.has(name) && !discoveredSet.has(name)) {
        count++;
      }
    }
    return count;
  }, [user, galaxyData, knownArtists, favorites, dislikes, discoveredArtists]);

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

  const handleContractUniverse = useCallback(() => {
    if (isContracting || !hasExpanded) return;
    setIsContracting(true);
    // Trigger canvas fade-out animation, then clean up state
    canvasRef.current?.contractUniverse();
    // Wait for the fade to finish (~1s) before updating Redux and resetting flags
    setTimeout(() => {
      dispatch({ type: REMOVE_DRIFT_NODES });
      setHasExpanded(false);
      setIsContracting(false);
    }, 1100);
  }, [isContracting, hasExpanded, dispatch]);

  const handleQueueSeed = useCallback((node) => {
    const seed = {
      id: node.id,
      name: node.name,
      image: node.image,
      imageLarge: node.imageLarge,
      genres: node.genres || [],
      externalUrl: node.externalUrl,
    };
    dispatch({ type: QUEUE_SEED, payload: seed });
  }, [dispatch]);

  const handleUnqueueSeed = useCallback((id) => {
    dispatch({ type: UNQUEUE_SEED, payload: id });
  }, [dispatch]);

  const handleRegenerateWithQueue = useCallback(async () => {
    if (pendingSeedQueue.length === 0) return;
    const allSeeds = [...seedArtists, ...pendingSeedQueue];
    dispatch({ type: ADD_SEED_AND_REGENERATE, payload: pendingSeedQueue });

    try {
      const galaxyData = await generateRecommendations(
        allSeeds,
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
  }, [seedArtists, pendingSeedQueue, dispatch]);

  return (
    <div className="galaxy-view">
      <div className="galaxy-header-overlay">
        <Header
          showBack
          onBack={handleBack}
          artistCount={seedArtists.length}
          mapName={currentMapName}
          defaultMapName={defaultMapName}
          onMapNameChange={handleMapNameChange}
        />
      </div>

      <GalaxyCanvas ref={canvasRef} />

      {/* Expand / Contract Universe — upper-left ghost button */}
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
      {hasExpanded && galaxyData && (
        <button
          className="expand-universe-btn contract-universe-btn"
          onClick={handleContractUniverse}
          disabled={isContracting}
          title="Hide drift nodes and return to core galaxy"
        >
          {isContracting ? (
            <span className="expand-universe-spinner" />
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
              <circle cx="12" cy="12" r="10" strokeDasharray="3 3" />
              <line x1="12" y1="9" x2="12" y2="15" />
            </svg>
          )}
          <span>Contract Universe</span>
        </button>
      )}

      {/* Unknown artists badge */}
      {user && unknownCount > 0 && galaxyData && (
        <div className="unknown-artists-badge">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="14" height="14">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span>{unknownCount} unknown</span>
        </div>
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

        {/* Save */}
        <button
          className={`toolbar-btn toolbar-icon ${showSaveConfirm ? 'saved' : ''}`}
          onClick={() => {
            if (!user) {
              showAuthModal('register');
            } else {
              setShowSaveModal(true);
            }
          }}
          title={showSaveConfirm ? 'Saved!' : (!user ? 'Sign in to save' : 'Save map')}
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

        {/* Share / Playlist / Explore — grouped so they wrap together on mobile */}
        <div className="toolbar-actions-group">
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

          <GalaxyPlayerController canvasRef={canvasRef} />
        </div>
      </div>

      {showLegend && <GalaxyLegend onClose={() => setShowLegend(false)} />}
      {showInfo && <GalaxyInfoModal onClose={() => setShowInfo(false)} />}
      {showReleaseNotes && <ReleaseNotesModal onClose={() => setShowReleaseNotes(false)} />}
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
      {/* Regenerate Map — floating CTA when seeds are queued */}
      {pendingSeedQueue.length > 0 && (
        <button className="regenerate-queue-btn" onClick={handleRegenerateWithQueue}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
            <path d="M23 4v6h-6" />
            <path d="M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          <span>Regenerate Map</span>
          <span className="regenerate-queue-count">
            {pendingSeedQueue.length} artist{pendingSeedQueue.length !== 1 ? 's' : ''}
          </span>
        </button>
      )}

      {selectedNode && !showExport && !showShare && (
        <ArtistDetailPanel
          node={selectedNode}
          onClose={handleClosePanel}
          onQueueSeed={handleQueueSeed}
          onUnqueueSeed={handleUnqueueSeed}
          pendingSeeds={pendingSeedQueue}
        />
      )}
    </div>
  );
}

export default GalaxyView;
