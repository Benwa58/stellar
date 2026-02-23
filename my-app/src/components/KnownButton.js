import { useAuth, useAuthActions } from '../state/AuthContext';
import '../styles/favorites.css';

function KnownButton({ artistName, artistId, artistImage }) {
  const { user, knownArtists } = useAuth();
  const { toggleKnownArtist, showAuthModal } = useAuthActions();

  if (!user) {
    return (
      <button
        className="known-btn"
        onClick={() => showAuthModal('register')}
        title="Sign in to mark known artists"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>
    );
  }

  const isKnown = knownArtists.some((k) => k.artistName === artistName);

  return (
    <button
      className={`known-btn ${isKnown ? 'is-known' : ''}`}
      onClick={() => toggleKnownArtist(artistName, artistId, artistImage)}
      title={isKnown ? 'Remove from known' : 'I know this artist'}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" fill={isKnown ? 'currentColor' : 'none'} />
      </svg>
    </button>
  );
}

export default KnownButton;
