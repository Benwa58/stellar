import { useState, useEffect, useRef, useCallback } from 'react';
import { findArtistTrack } from '../api/musicClient';

const CONCURRENCY = 5;

/**
 * Hook to batch-fetch Deezer tracks for an array of galaxy nodes.
 * Returns tracks incrementally as they are fetched.
 *
 * @param {Array} nodes - Galaxy nodes to fetch tracks for
 * @returns {{ tracks: Map, progress: { fetched: number, total: number }, isLoading: boolean }}
 */
export function useExportTracks(nodes) {
  const [tracks, setTracks] = useState(new Map());
  const [progress, setProgress] = useState({ fetched: 0, total: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const cancelRef = useRef(false);
  const fetchedRef = useRef(new Map()); // persistent across re-renders

  const fetchAll = useCallback(async () => {
    if (!nodes || nodes.length === 0) {
      setTracks(new Map());
      setProgress({ fetched: 0, total: 0 });
      setIsLoading(false);
      return;
    }

    cancelRef.current = false;
    setIsLoading(true);
    setProgress({ fetched: 0, total: nodes.length });

    // Reuse already-fetched tracks
    const result = new Map();
    const toFetch = [];
    for (const node of nodes) {
      if (fetchedRef.current.has(node.id)) {
        result.set(node.id, fetchedRef.current.get(node.id));
      } else {
        toFetch.push(node);
      }
    }

    // Show cached tracks immediately
    if (result.size > 0) {
      setTracks(new Map(result));
      setProgress({ fetched: result.size, total: nodes.length });
    }

    // Fetch remaining in concurrent batches
    let fetched = result.size;

    for (let i = 0; i < toFetch.length; i += CONCURRENCY) {
      if (cancelRef.current) break;

      const batch = toFetch.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.allSettled(
        batch.map((node) => findArtistTrack(node.name, node.id))
      );

      batch.forEach((node, idx) => {
        const res = batchResults[idx];
        if (res.status === 'fulfilled' && res.value) {
          result.set(node.id, res.value);
          fetchedRef.current.set(node.id, res.value);
        }
      });

      fetched += batch.length;
      if (!cancelRef.current) {
        setTracks(new Map(result));
        setProgress({ fetched: Math.min(fetched, nodes.length), total: nodes.length });
      }
    }

    if (!cancelRef.current) {
      setIsLoading(false);
    }
  }, [nodes]);

  useEffect(() => {
    fetchAll();
    return () => {
      cancelRef.current = true;
    };
  }, [fetchAll]);

  return { tracks, progress, isLoading };
}
