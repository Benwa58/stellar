import { useCallback, useRef, useState } from 'react';
import { useDispatch } from '../state/AppContext';
import { useAuth } from '../state/AuthContext';
import { GO_TO_INPUT } from '../state/actions';
import Header from './Header';
import UniverseCanvas from '../galaxy/UniverseCanvas';
import ArtistDetailPanel from './ArtistDetailPanel';
import { useBottomBarDetect } from '../hooks/useBottomBarDetect';
import '../styles/universe.css';

function UniverseView() {
  useBottomBarDetect();
  const dispatch = useDispatch();
  const { user, universeData } = useAuth();
  const canvasRef = useRef(null);
  const [selectedNode, setSelectedNode] = useState(null);

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
        onSelectNode={handleSelectNode}
        onHoverNode={handleHoverNode}
      />

      {/* Zoom controls */}
      <div className="universe-zoom-controls">
        <button
          className="zoom-btn"
          onClick={() => canvasRef.current?.resetView()}
          title="Fit all"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
            <path d="M15 3h6v6" />
            <path d="M9 21H3v-6" />
            <path d="M21 3l-7 7" />
            <path d="M3 21l7-7" />
          </svg>
        </button>
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

      {/* Artist detail panel */}
      {selectedNode && !selectedNode._isClusterCenter && (
        <ArtistDetailPanel
          node={selectedNode}
          onClose={handleCloseCard}
        />
      )}
    </div>
  );
}

export default UniverseView;
