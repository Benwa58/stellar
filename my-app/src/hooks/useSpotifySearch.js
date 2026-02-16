import { useState, useRef, useCallback, useEffect } from 'react';
import { searchArtists } from '../api/spotifyClient';

export function useSpotifySearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const timerRef = useRef(null);
  const abortRef = useRef(false);

  const search = useCallback(async (searchQuery) => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setResults([]);
      return;
    }

    setIsLoading(true);
    abortRef.current = false;

    try {
      const artists = await searchArtists(searchQuery, 6);
      if (!abortRef.current) {
        setResults(artists);
      }
    } catch (err) {
      if (!abortRef.current) {
        console.error('Search failed:', err);
        setResults([]);
      }
    } finally {
      if (!abortRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const updateQuery = useCallback(
    (newQuery) => {
      setQuery(newQuery);

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      if (!newQuery || newQuery.trim().length < 2) {
        setResults([]);
        setIsLoading(false);
        return;
      }

      timerRef.current = setTimeout(() => {
        search(newQuery);
      }, 300);
    },
    [search]
  );

  const clearResults = useCallback(() => {
    abortRef.current = true;
    setResults([]);
    setQuery('');
    setIsLoading(false);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return { query, setQuery: updateQuery, results, isLoading, clearResults };
}
