import { useState, useEffect, useRef, useCallback } from 'react';
import { getUniverseShare } from '../api/authClient';
import UniverseCanvas from '../galaxy/UniverseCanvas';
import ArtistDetailPanel from './ArtistDetailPanel';
import '../styles/shareGalaxyPage.css';

function ShareUniversePage({ universeId }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [shareData, setShareData] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    getUniverseShare(universeId)
      .then((data) => {
        setShareData(data);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [universeId]);

  const handleSelectNode = useCallback((node) => {
    setSelectedNode(node);
  }, []);

  const handleHoverNode = useCallback(() => {}, []);

  const handleClosePanel = useCallback(() => {
    setSelectedNode(null);
  }, []);

  if (loading) {
    return (
      <div className="share-galaxy-page">
        <div className="share-galaxy-page-loading">
          <div className="share-galaxy-page-spinner" />
          <p>Loading universe...</p>
        </div>
      </div>
    );
  }

  if (error || !shareData) {
    return (
      <div className="share-galaxy-page">
        <div className="share-galaxy-page-error">
          <h2>Universe Not Found</h2>
          <p>This universe may have been removed or the link is invalid.</p>
          <a href="/" className="share-galaxy-page-cta-btn">Create Your Own Universe</a>
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
        <a href="/" className="share-galaxy-page-cta-link">Create Your Own Universe</a>
      </header>

      {/* Hero section */}
      <div className="share-galaxy-page-hero">
        <h1 className="share-galaxy-page-title">{shareData.mapName}</h1>
        <div className="share-galaxy-page-meta">
          <span>{shareData.nodeCount} artist{shareData.nodeCount !== 1 ? 's' : ''}</span>
          <span className="share-galaxy-page-meta-sep">&middot;</span>
          <span>{shareData.linkCount} connection{shareData.linkCount !== 1 ? 's' : ''}</span>
        </div>
        <div className="share-galaxy-page-badge">Generated with Stellar</div>
      </div>

      {/* Universe canvas — read-only (pan, zoom, tap to select) */}
      <div className="share-galaxy-page-canvas">
        <UniverseCanvas
          ref={canvasRef}
          universeData={shareData.universeData}
          favorites={[]}
          discoveredArtists={[]}
          dislikes={[]}
          onSelectNode={handleSelectNode}
          onHoverNode={handleHoverNode}
        />
      </div>

      {/* Artist detail panel (tap a node to open) */}
      {selectedNode && !selectedNode._isClusterCenter && (
        <ArtistDetailPanel
          node={selectedNode}
          onClose={handleClosePanel}
        />
      )}
    </div>
  );
}

export default ShareUniversePage;
