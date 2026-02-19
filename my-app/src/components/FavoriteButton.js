import { useAuth, useAuthActions } from '../state/AuthContext';
import '../styles/favorites.css';

function FavoriteButton({ artistName, artistId, artistImage }) {
  const { user, favorites } = useAuth();
  const { toggleFavorite, showAuthModal } = useAuthActions();

  if (!user) {
    return (
      <button
        className="favorite-btn"
        onClick={() => showAuthModal('register')}
        title="Sign in to save favorites"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
          <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
        </svg>
      </button>
    );
  }

  const isFavorite = favorites.some((f) => f.artistName === artistName);

  return (
    <button
      className={`favorite-btn ${isFavorite ? 'is-favorite' : ''}`}
      onClick={() => toggleFavorite(artistName, artistId, artistImage)}
      title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
    >
      <svg viewBox="0 0 24 24" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" width="18" height="18">
        <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
      </svg>
    </button>
  );
}

export default FavoriteButton;
