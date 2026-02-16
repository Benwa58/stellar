import { useState, useRef, useEffect } from 'react';
import { useArtistSearch } from '../hooks/useArtistSearch';
import '../styles/search.css';

function ArtistSearch({ onSelect, selectedIds }) {
  const { query, setQuery, results, isLoading, clearResults } =
    useArtistSearch();
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  const filteredResults = results.filter((r) => !selectedIds.has(r.id));
  const showDropdown = isFocused && (filteredResults.length > 0 || isLoading);

  useEffect(() => {
    setHighlightIndex(-1);
  }, [results]);

  function handleKeyDown(e) {
    if (!showDropdown) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((prev) =>
        prev < filteredResults.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((prev) =>
        prev > 0 ? prev - 1 : filteredResults.length - 1
      );
    } else if (e.key === 'Enter' && highlightIndex >= 0) {
      e.preventDefault();
      handleSelect(filteredResults[highlightIndex]);
    } else if (e.key === 'Escape') {
      clearResults();
      inputRef.current?.blur();
    }
  }

  function handleSelect(artist) {
    onSelect(artist);
    clearResults();
    inputRef.current?.focus();
  }

  function handleBlur(e) {
    if (dropdownRef.current?.contains(e.relatedTarget)) return;
    setTimeout(() => setIsFocused(false), 150);
  }

  return (
    <div className="artist-search">
      <div className="search-input-wrapper">
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
          className="search-input"
          placeholder="Search for an artist..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-expanded={showDropdown}
          aria-autocomplete="list"
          aria-controls="search-results"
        />
        {isLoading && <div className="search-spinner" />}
      </div>

      {showDropdown && (
        <ul
          id="search-results"
          className="search-dropdown"
          ref={dropdownRef}
          role="listbox"
        >
          {filteredResults.map((artist, index) => (
            <li
              key={artist.id}
              className={`search-result ${
                index === highlightIndex ? 'highlighted' : ''
              }`}
              role="option"
              aria-selected={index === highlightIndex}
              onMouseDown={() => handleSelect(artist)}
              onMouseEnter={() => setHighlightIndex(index)}
            >
              {artist.image ? (
                <img
                  className="result-image"
                  src={artist.image}
                  alt={artist.name}
                />
              ) : (
                <div className="result-image result-image-placeholder">
                  {artist.name.charAt(0)}
                </div>
              )}
              <div className="result-info">
                <span className="result-name">{artist.name}</span>
                {artist.genres.length > 0 && (
                  <span className="result-genres">
                    {artist.genres.slice(0, 2).join(', ')}
                  </span>
                )}
              </div>
            </li>
          ))}
          {isLoading && filteredResults.length === 0 && (
            <li className="search-loading">Searching...</li>
          )}
        </ul>
      )}
    </div>
  );
}

export default ArtistSearch;
