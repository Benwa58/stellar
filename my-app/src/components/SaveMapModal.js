import { useState } from 'react';
import { useAppState } from '../state/AppContext';
import { generateMapName } from '../utils/mapNameUtil';
import { saveMapCloud } from '../api/authClient';
import '../styles/galaxy.css';

function SaveMapModal({ onClose, onSaved }) {
  const { seedArtists, galaxyData, currentMapName } = useAppState();
  const defaultName = currentMapName || generateMapName(seedArtists);
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const mapName = name.trim() || defaultName;
    setSaving(true);
    try {
      const res = await saveMapCloud({
        name: mapName,
        seedArtists,
        galaxyData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to save map.');
      } else {
        onSaved();
      }
    } catch {
      setError('Failed to save map. Please try again.');
    } finally {
      setSaving(false);
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

        <button className="save-map-confirm" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Map'}
        </button>
      </div>
    </div>
  );
}

export default SaveMapModal;
