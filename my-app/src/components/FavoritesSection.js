import { useAuth, useAuthActions } from '../state/AuthContext';
import { useDispatch } from '../state/AppContext';
import { ADD_SEED_ARTIST } from '../state/actions';
import '../styles/favorites.css';

function FavoritesSection() {
  const { user, favorites } = useAuth();
  const { toggleFavorite } = useAuthActions();
  const dispatch = useDispatch();

  if (!user || favorites.length === 0) return null;

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
        <span className="section-count">{favorites.length}</span>
      </h3>
      <div className="favorites-scroll">
        {favorites.map((fav) => (
          <div key={fav.artistName} className="favorite-card">
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
    </div>
  );
}

export default FavoritesSection;
