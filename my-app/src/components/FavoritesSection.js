import { useMemo, useState } from 'react';
import { useAuth, useAuthActions } from '../state/AuthContext';
import { useAppState, useDispatch } from '../state/AppContext';
import { ADD_SEED_ARTIST } from '../state/actions';
import AddFavoriteModal from './AddFavoriteModal';
import '../styles/favorites.css';

function FavoritesSection() {
  const { user, favorites } = useAuth();
  const { toggleFavorite, showAuthModal } = useAuthActions();
  const { seedArtists } = useAppState();
  const dispatch = useDispatch();
  const [showAddModal, setShowAddModal] = useState(false);

  const selectedNames = useMemo(
    () => new Set(seedArtists.map((a) => a.name)),
    [seedArtists]
  );

  const handleAddSeed = (fav) => {
    dispatch({
      type: ADD_SEED_ARTIST,
      payload: {
        id: fav.artistId || `fav-${fav.artistName}`,
        name: fav.artistName,
        genres: [],
        image: fav.artistImage,
      },
    });
  };

  return (
    <div className="favorites-section">
      <h3 className="favorites-title">
        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
          <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
        </svg>
        Favorites
        {user && favorites.length > 0 && (
          <span className="section-count">{favorites.length}</span>
        )}
        {user && (
          <button
            className="favorites-add-btn"
            onClick={() => setShowAddModal(true)}
            title="Add favorites"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        )}
      </h3>

      {/* Signed out — placeholder */}
      {!user && (
        <div className="favorites-scroll">
          <button
            className="section-placeholder-card"
            onClick={() => showAuthModal('register')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="20" height="20">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span className="section-placeholder-text">Sign in to save favorites</span>
          </button>
        </div>
      )}

      {/* Signed in, no favorites — empty placeholder */}
      {user && favorites.length === 0 && (
        <div className="favorites-scroll">
          <div className="section-placeholder-card empty">
            <span className="section-placeholder-text">Saved favorites will appear here</span>
          </div>
        </div>
      )}

      {/* Signed in, has favorites — horizontal scroll */}
      {user && favorites.length > 0 && (
        <div className="favorites-scroll">
          {favorites.map((fav) => (
            <div key={fav.artistName} className={`favorite-card ${selectedNames.has(fav.artistName) ? 'selected' : ''}`}>
              <button
                className="favorite-card-main"
                onClick={() => handleAddSeed(fav)}
                title={`Add ${fav.artistName} as seed`}
              >
                {fav.artistImage ? (
                  <img className="favorite-card-image" src={fav.artistImage} alt={fav.artistName} />
                ) : (
                  <div className="favorite-card-image favorite-card-placeholder">
                    {fav.artistName.charAt(0)}
                  </div>
                )}
                <span className="favorite-card-name">{fav.artistName}</span>
              </button>
              <button
                className="favorite-card-remove"
                onClick={() => toggleFavorite(fav.artistName, fav.artistId, fav.artistImage)}
                title="Remove favorite"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
      {showAddModal && <AddFavoriteModal onClose={() => setShowAddModal(false)} />}
    </div>
  );
}

export default FavoritesSection;
