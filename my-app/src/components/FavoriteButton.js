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
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
          <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
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
      <svg viewBox="0 0 24 24" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" width="18" height="18">
        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
      </svg>
    </button>
  );
}

export default FavoriteButton;
