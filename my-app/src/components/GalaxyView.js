import { useCallback, useRef, useState } from 'react';
import { useAppState, useDispatch } from '../state/AppContext';
import { SELECT_NODE, GO_TO_INPUT, ADD_SEED_AND_REGENERATE, SET_LOADING_PROGRESS, SET_GALAXY_DATA, SET_ERROR } from '../state/actions';
import { generateRecommendations } from '../engine/recommendationEngine';
import Header from './Header';
import GalaxyCanvas from '../galaxy/GalaxyCanvas';
import ArtistDetailPanel from './ArtistDetailPanel';
import GalaxyInfoModal from './GalaxyInfoModal';
import SaveMapModal from './SaveMapModal';
import GalaxyPlayerController from './GalaxyPlayerController';
import '../styles/galaxy.css';

function GalaxyView() {
  const { selectedNode, seedArtists } = useAppState();
  const dispatch = useDispatch();
  const canvasRef = useRef(null);
  const [showInfo, setShowInfo] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);

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

  const handleAddSeed = useCallback(async (node) => {
    // Build the seed artist object from the node data
    const newSeed = {
      id: node.id,
      name: node.name,
      image: node.image,
      imageLarge: node.imageLarge,
      genres: node.genres || [],
      externalUrl: node.externalUrl,
    };

    // Compute updated seeds before dispatch (state won't update synchronously)
    const updatedSeeds = seedArtists.some((a) => a.id === node.id)
      ? seedArtists
      : [...seedArtists, newSeed];

    // This adds the seed and transitions to loading phase
    dispatch({ type: ADD_SEED_AND_REGENERATE, payload: newSeed });

    // Regenerate with the expanded seed list
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

      <button
        className="reset-zoom-button"
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

      <button
        className="info-button"
        onClick={() => setShowInfo(true)}
        title="How it works"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </button>

      <button
        className={`save-map-button ${showSaveConfirm ? 'saved' : ''}`}
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

      <GalaxyPlayerController canvasRef={canvasRef} />

      {showInfo && <GalaxyInfoModal onClose={() => setShowInfo(false)} />}
      {showSaveModal && (
        <SaveMapModal
          onClose={() => setShowSaveModal(false)}
          onSaved={handleSaved}
        />
      )}

      {selectedNode && (
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
