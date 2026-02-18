import { useState } from 'react';
import { useAppState } from '../state/AppContext';
import { saveMap, generateMapName } from '../utils/savedMapsStorage';
import '../styles/galaxy.css';

function SaveMapModal({ onClose, onSaved }) {
  const { seedArtists, galaxyData } = useAppState();
  const defaultName = generateMapName(seedArtists);
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState(null);

  const handleSave = () => {
    const result = saveMap({
      name: name.trim() || defaultName,
      seedArtists,
      galaxyData,
    });

    if (result.success) {
      onSaved();
    } else {
      setError(result.error);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') onClose();
  };

  return (
    <div className="galaxy-info-overlay" onClick={onClose}>
      <div className="galaxy-info-modal save-map-modal" onClick={(e) => e.stopPropagation()}>
        <button className="galaxy-info-close" onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <h3 className="galaxy-info-title">Save Galaxy Map</h3>

        <div className="save-map-field">
          <label className="save-map-label" htmlFor="map-name">Name</label>
          <input
            id="map-name"
            className="save-map-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={defaultName}
            maxLength={80}
            autoFocus
          />
        </div>

        <div className="save-map-meta">
          {seedArtists.length} seed artists &middot; {galaxyData?.nodes?.length || 0} nodes
        </div>

        {error && <div className="save-map-error">{error}</div>}

        <button className="save-map-confirm" onClick={handleSave}>
          Save Map
        </button>
      </div>
    </div>
  );
}

export default SaveMapModal;
