import { useAuth, useAuthActions } from '../state/AuthContext';
import '../styles/favorites.css';

function DislikeButton({ artistName, artistId, artistImage }) {
  const { user, dislikes } = useAuth();
  const { toggleDislike, showAuthModal } = useAuthActions();

  if (!user) {
    return (
      <button
        className="dislike-btn"
        onClick={() => showAuthModal('register')}
        title="Sign in to dislike artists"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
          <path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3zm7-13h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17" />
        </svg>
      </button>
    );
  }

  const isDisliked = dislikes.some((d) => d.artistName === artistName);

  return (
    <button
      className={`dislike-btn ${isDisliked ? 'is-disliked' : ''}`}
      onClick={() => toggleDislike(artistName, artistId, artistImage)}
      title={isDisliked ? 'Remove dislike' : 'Dislike this artist'}
    >
      <svg viewBox="0 0 24 24" fill={isDisliked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" width="16" height="16">
        <path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3zm7-13h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17" />
      </svg>
    </button>
  );
}

export default DislikeButton;
