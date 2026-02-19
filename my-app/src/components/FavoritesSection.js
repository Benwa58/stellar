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
      artist: {
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
          <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
        </svg>
        Favorites
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
