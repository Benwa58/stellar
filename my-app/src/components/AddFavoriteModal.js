import { useState, useRef, useEffect } from 'react';
import { useArtistSearch } from '../hooks/useArtistSearch';
import { useAuth, useAuthActions } from '../state/AuthContext';
import '../styles/favorites.css';

function AddFavoriteModal({ onClose }) {
  const { query, setQuery, results, isLoading, clearResults } = useArtistSearch();
  const { favorites } = useAuth();
  const { toggleFavorite } = useAuthActions();
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const inputRef = useRef(null);
  const overlayRef = useRef(null);

  const favoriteNames = new Set(favorites.map((f) => f.artistName));

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setHighlightIndex(-1);
  }, [results]);

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      if (query) {
        clearResults();
      } else {
        onClose();
      }
      return;
    }

    if (results.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
    } else if (e.key === 'Enter' && highlightIndex >= 0) {
      e.preventDefault();
      handleSelect(results[highlightIndex]);
    }
  }

  function handleSelect(artist) {
    toggleFavorite(artist.name, artist.id, artist.image || artist.imageLarge || null);
  }

  function handleOverlayClick(e) {
    if (e.target === overlayRef.current) {
      onClose();
    }
  }

  return (
    <div className="galaxy-info-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="add-fav-modal">
        <button className="galaxy-info-close" onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <h3 className="add-fav-title">Add Favorites</h3>

        <div className="add-fav-search-wrapper">
          <svg
            className="search-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="add-fav-search-input"
            placeholder="Search for an artist..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {isLoading && <div className="search-spinner" />}
        </div>

        <div className="add-fav-results">
          {results.length > 0 && results.map((artist, index) => {
            const isFav = favoriteNames.has(artist.name);
            return (
              <button
                key={artist.id}
                className={`add-fav-result ${index === highlightIndex ? 'highlighted' : ''} ${isFav ? 'is-favorite' : ''}`}
                onClick={() => handleSelect(artist)}
                onMouseEnter={() => setHighlightIndex(index)}
              >
                {artist.image ? (
                  <img className="result-image" src={artist.image} alt={artist.name} />
                ) : (
                  <div className="result-image result-image-placeholder">
                    {artist.name.charAt(0)}
                  </div>
                )}
                <div className="result-info">
                  <span className="result-name">{artist.name}</span>
                  {artist.genres && artist.genres.length > 0 && (
                    <span className="result-genres">
                      {artist.genres.slice(0, 2).join(', ')}
                    </span>
                  )}
                </div>
                {isFav && (
                  <svg className="add-fav-star" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                    <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
                  </svg>
                )}
              </button>
            );
          })}
          {isLoading && results.length === 0 && (
            <div className="add-fav-loading">Searching...</div>
          )}
          {!isLoading && query.length >= 2 && results.length === 0 && (
            <div className="add-fav-loading">No results found</div>
          )}
          {!query && (
            <div className="add-fav-hint">Search for artists to add them to your favorites</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AddFavoriteModal;
