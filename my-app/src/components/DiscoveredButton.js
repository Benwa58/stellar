import { useAuth, useAuthActions } from '../state/AuthContext';
import '../styles/favorites.css';

function DiscoveredButton({ artistName, artistId, artistImage }) {
  const { user, discoveredArtists } = useAuth();
  const { toggleDiscoveredArtist, showAuthModal } = useAuthActions();

  if (!user) {
    return (
      <button
        className="discovered-btn"
        onClick={() => showAuthModal('register')}
        title="Sign in to track discoveries"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
          <path d="M12 2l2.09 6.26L20.18 9.27l-5 4.87L16.36 21 12 17.77 7.64 21l1.18-6.86-5-4.87L9.91 8.26z" />
          <line x1="12" y1="2" x2="12" y2="6" />
          <line x1="12" y1="18" x2="12" y2="22" />
        </svg>
      </button>
    );
  }

  const isDiscovered = discoveredArtists.some((d) => d.artistName === artistName);

  return (
    <button
      className={`discovered-btn ${isDiscovered ? 'is-discovered' : ''}`}
      onClick={() => toggleDiscoveredArtist(artistName, artistId, artistImage)}
      title={isDiscovered ? 'Remove from discoveries' : 'Discovered on Stellar'}
    >
      <svg viewBox="0 0 24 24" fill={isDiscovered ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" width="18" height="18">
        <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
      </svg>
    </button>
  );
}

export default DiscoveredButton;
