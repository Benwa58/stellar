import { useCallback } from 'react';
import { useAppState, useDispatch } from '../state/AppContext';
import { SELECT_NODE, GO_TO_INPUT } from '../state/actions';
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
        />
      )}
    </div>
  );
}

export default GalaxyView;
