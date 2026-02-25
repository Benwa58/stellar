import { useMemo } from 'react';
import { useAuth, useAuthActions } from '../state/AuthContext';
import { useAppState, useDispatch } from '../state/AppContext';
import { ADD_SEED_ARTIST } from '../state/actions';
import '../styles/favorites.css';

function DiscoveredSection() {
  const { user, discoveredArtists } = useAuth();
  const { toggleDiscoveredArtist, showAuthModal } = useAuthActions();
  const { seedArtists } = useAppState();
  const dispatch = useDispatch();

  const selectedNames = useMemo(
    () => new Set(seedArtists.map((a) => a.name)),
    [seedArtists]
  );

  const handleAddSeed = (artist) => {
    dispatch({
      type: ADD_SEED_ARTIST,
      payload: {
        id: artist.artistId || `disc-${artist.artistName}`,
        name: artist.artistName,
        genres: [],
        image: artist.artistImage,
      },
    });
  };

  return (
    <div className="discovered-section">
      <h3 className="discovered-title">
        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
          <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
        </svg>
        Discovered on Stellar
        {user && discoveredArtists.length > 0 && (
          <span className="section-count">{discoveredArtists.length}</span>
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
            <span className="section-placeholder-text">Sign in to save discovered artists</span>
          </button>
        </div>
      )}

      {/* Signed in, no discoveries — empty placeholder */}
      {user && discoveredArtists.length === 0 && (
        <div className="favorites-scroll">
          <div className="section-placeholder-card empty">
            <span className="section-placeholder-text">Saved discoveries will appear here</span>
          </div>
        </div>
      )}

      {/* Signed in, has discoveries — horizontal scroll */}
      {user && discoveredArtists.length > 0 && (
        <div className="favorites-scroll">
          {discoveredArtists.map((artist) => (
            <div key={artist.artistName} className={`favorite-card ${selectedNames.has(artist.artistName) ? 'selected' : ''}`}>
              <button
                className="favorite-card-main"
                onClick={() => handleAddSeed(artist)}
                title={`Add ${artist.artistName} as seed`}
              >
                {artist.artistImage ? (
                  <img className="favorite-card-image" src={artist.artistImage} alt={artist.artistName} />
                ) : (
                  <div className="favorite-card-image favorite-card-placeholder">
                    {artist.artistName.charAt(0)}
                  </div>
                )}
                <span className="favorite-card-name">{artist.artistName}</span>
              </button>
              <button
                className="favorite-card-remove"
                onClick={() => toggleDiscoveredArtist(artist.artistName, artist.artistId, artist.artistImage)}
                title="Remove from discoveries"
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
    </div>
  );
}

export default DiscoveredSection;
