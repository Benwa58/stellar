import { useState, useEffect, useRef, useCallback } from 'react';
import { useDispatch } from '../state/AppContext';
import { LOAD_SAVED_MAP, SELECT_NODE } from '../state/actions';
import { getGalaxyShare } from '../api/authClient';
import GalaxyCanvas from '../galaxy/GalaxyCanvas';
import ArtistDetailPanel from './ArtistDetailPanel';
import { useAppState } from '../state/AppContext';
import '../styles/shareGalaxyPage.css';

function ShareGalaxyPage({ galaxyId }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [shareData, setShareData] = useState(null);
  const dispatch = useDispatch();
  const { selectedNode } = useAppState();
  const canvasRef = useRef(null);

  useEffect(() => {
    getGalaxyShare(galaxyId)
      .then((data) => {
        setShareData(data);
        // Load galaxy data into AppContext so GalaxyCanvas can render it
        dispatch({
          type: LOAD_SAVED_MAP,
          payload: {
            seedArtists: data.seedArtists,
            galaxyData: data.galaxyData,
          },
        });
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [galaxyId, dispatch]);

  const handleClosePanel = useCallback(() => {
    dispatch({ type: SELECT_NODE, payload: null });
  }, [dispatch]);

  if (loading) {
    return (
      <div className="share-galaxy-page">
        <div className="share-galaxy-page-loading">
          <div className="share-galaxy-page-spinner" />
          <p>Loading galaxy...</p>
        </div>
      </div>
    );
  }

  if (error || !shareData) {
    return (
      <div className="share-galaxy-page">
        <div className="share-galaxy-page-error">
          <h2>Galaxy Not Found</h2>
          <p>This galaxy may have been removed or the link is invalid.</p>
          <a href="/" className="share-galaxy-page-cta-btn">Create Your Own Galaxy</a>
        </div>
      </div>
    );
  }

  return (
    <div className="share-galaxy-page">
      {/* Header */}
      <header className="share-galaxy-page-header">
        <a href="/" className="share-galaxy-page-logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="20" height="20">
            <circle cx="12" cy="12" r="3" />
            <circle cx="12" cy="12" r="8" opacity="0.4" />
            <circle cx="12" cy="12" r="11" opacity="0.15" />
          </svg>
          Stellar
        </a>
        <a href="/" className="share-galaxy-page-cta-link">Create Your Own Galaxy</a>
      </header>

      {/* Hero section */}
      <div className="share-galaxy-page-hero">
        <h1 className="share-galaxy-page-title">{shareData.mapName}</h1>
        <div className="share-galaxy-page-meta">
          <span>{shareData.nodeCount} artist{shareData.nodeCount !== 1 ? 's' : ''}</span>
          <span className="share-galaxy-page-meta-sep">&middot;</span>
          <span>{shareData.linkCount} connection{shareData.linkCount !== 1 ? 's' : ''}</span>
          {shareData.seedArtists && shareData.seedArtists.length > 0 && (
            <>
              <span className="share-galaxy-page-meta-sep">&middot;</span>
              <span className="share-galaxy-page-meta-seeds">
                from {shareData.seedArtists.map((a) => a.name).join(', ')}
              </span>
            </>
          )}
        </div>
        <div className="share-galaxy-page-badge">Generated with Stellar</div>
      </div>

      {/* Galaxy canvas — read-only (pan, zoom, tap to select) */}
      <div className="share-galaxy-page-canvas">
        <GalaxyCanvas ref={canvasRef} />
      </div>

      {/* Open in Stellar CTA */}
      <div className="share-galaxy-page-footer">
        <a href="/" className="share-galaxy-page-cta-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
            <circle cx="12" cy="12" r="3" />
            <circle cx="12" cy="12" r="8" opacity="0.4" />
          </svg>
          Open in Stellar
        </a>
      </div>

      {/* Artist detail panel (tap a node to open) */}
      {selectedNode && (
        <ArtistDetailPanel
          node={selectedNode}
          onClose={handleClosePanel}
        />
      )}
    </div>
  );
}

export default ShareGalaxyPage;
