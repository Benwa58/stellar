import { useCallback } from 'react';
import { useAppState, useDispatch } from '../state/AppContext';
import { SELECT_NODE, GO_TO_INPUT, ADD_SEED_AND_REGENERATE, SET_LOADING_PROGRESS, SET_GALAXY_DATA, SET_ERROR } from '../state/actions';
import { generateRecommendations } from '../engine/recommendationEngine';
import Header from './Header';
import GalaxyCanvas from '../galaxy/GalaxyCanvas';
import ArtistDetailPanel from './ArtistDetailPanel';
import '../styles/galaxy.css';

function GalaxyView() {
  const { selectedNode, seedArtists } = useAppState();
  const dispatch = useDispatch();

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

      <GalaxyCanvas />

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
