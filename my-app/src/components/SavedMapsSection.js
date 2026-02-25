import { useState, useEffect, useCallback } from 'react';
import { useDispatch } from '../state/AppContext';
import { useAuth, useAuthActions } from '../state/AuthContext';
import { LOAD_SAVED_MAP } from '../state/actions';
import { getMaps, getMap, deleteMapCloud } from '../api/authClient';
import '../styles/savedMaps.css';
import '../styles/favorites.css';

function formatDate(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function SavedMapsSection() {
  const dispatch = useDispatch();
  const { user } = useAuth();
  const { showAuthModal } = useAuthActions();
  const [maps, setMaps] = useState([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  useEffect(() => {
    if (user) {
      getMaps()
        .then((res) => res.json())
        .then((data) => {
          if (data.maps) setMaps(data.maps);
        })
        .catch(() => {});
    } else {
      setMaps([]);
    }
  }, [user]);

  const handleLoad = useCallback(
    async (id) => {
      try {
        const res = await getMap(id);
        const mapData = await res.json();
        if (!mapData) return;
        dispatch({
          type: LOAD_SAVED_MAP,
          payload: {
            seedArtists: mapData.seedArtists,
            galaxyData: mapData.galaxyData,
            mapName: mapData.name,
          },
        });
      } catch {
        return;
      }
    },
    [dispatch]
  );

  const handleDelete = useCallback(
    async (id) => {
      if (confirmDeleteId === id) {
        try {
          await deleteMapCloud(id);
        } catch {
          return;
        }
        setMaps((prev) => prev.filter((m) => m.id !== id));
        setConfirmDeleteId(null);
      } else {
        setConfirmDeleteId(id);
        setTimeout(
          () => setConfirmDeleteId((curr) => (curr === id ? null : curr)),
          3000
        );
      }
    },
    [confirmDeleteId]
  );

  return (
    <div className="saved-maps-section">
      <h3 className="saved-maps-title">
        Saved Galaxies
        {user && maps.length > 0 && (
          <span className="section-count">{maps.length}</span>
        )}
      </h3>

      {/* Signed out — placeholder */}
      {!user && (
        <div className="saved-maps-scroll">
          <button
            className="section-placeholder-card"
            onClick={() => showAuthModal('register')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="20" height="20">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span className="section-placeholder-text">Sign in to save galaxies</span>
          </button>
        </div>
      )}

      {/* Signed in, no maps — empty placeholder */}
      {user && maps.length === 0 && (
        <div className="saved-maps-scroll">
          <div className="section-placeholder-card empty">
            <span className="section-placeholder-text">Saved galaxies will appear here</span>
          </div>
        </div>
      )}

      {/* Signed in, has maps — horizontal scroll */}
      {user && maps.length > 0 && (
        <div className="saved-maps-scroll">
          {maps.map((map) => (
            <div
              key={map.id}
              className="saved-map-card"
              onClick={() => handleLoad(map.id)}
            >
              <div className="saved-map-card-header">
                <h4 className="saved-map-name">{map.name}</h4>
                <button
                  className={`saved-map-delete ${confirmDeleteId === map.id ? 'confirm' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(map.id);
                  }}
                  title={confirmDeleteId === map.id ? 'Tap again to delete' : 'Delete'}
                >
                  {confirmDeleteId === map.id ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6" />
                      <path d="M14 11v6" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  )}
                </button>
              </div>

              <div className="saved-map-seeds">
                {map.seedArtists.slice(0, 3).map((a) => (
                  <span key={a.id} className="saved-map-seed-name">
                    {a.name}
                  </span>
                ))}
                {map.seedArtists.length > 3 && (
                  <span className="saved-map-seed-more">
                    +{map.seedArtists.length - 3}
                  </span>
                )}
              </div>

              <div className="saved-map-card-meta">
                <span>{map.nodeCount} artists</span>
                <span className="saved-map-dot">&middot;</span>
                <span>{formatDate(map.savedAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default SavedMapsSection;
