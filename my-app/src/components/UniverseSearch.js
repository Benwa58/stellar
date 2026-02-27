import { useState, useCallback, useRef, useEffect, useMemo } from 'react';

function UniverseSearch({ canvasRef }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef(null);
  const wrapperRef = useRef(null);

  const results = useMemo(() => {
    if (query.length < 1) return [];
    const nodes = canvasRef.current?.getNodes() || [];
    const q = query.toLowerCase();
    return nodes
      .filter((n) => !n._isClusterCenter && n.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        return aStarts - bStarts || a.name.localeCompare(b.name);
      })
      .slice(0, 8);
  }, [query, canvasRef]);

  useEffect(() => {
    setHighlightIndex(0);
  }, [results]);

  const selectNode = useCallback(
    (node) => {
      canvasRef.current?.zoomToNode(node);
      setQuery('');
      setOpen(false);
      inputRef.current?.blur();
    },
    [canvasRef]
  );

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && results[highlightIndex]) {
        e.preventDefault();
        selectNode(results[highlightIndex]);
      } else if (e.key === 'Escape') {
        setQuery('');
        setOpen(false);
        inputRef.current?.blur();
      }
    },
    [results, highlightIndex, selectNode]
  );

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const showDropdown = open && query.length >= 1 && results.length > 0;

  return (
    <div className="universe-search" ref={wrapperRef}>
      <div className="universe-search-input-wrap">
        <svg
          className="universe-search-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          width="14"
          height="14"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          className="universe-search-input"
          placeholder="Search artists…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />
      </div>
      {showDropdown && (
        <div className="universe-search-dropdown">
          {results.map((node, i) => (
            <button
              key={node.id}
              className={`universe-search-item ${i === highlightIndex ? 'highlighted' : ''}`}
              onMouseEnter={() => setHighlightIndex(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                selectNode(node);
              }}
            >
              {node.image ? (
                <img
                  className="universe-search-item-img"
                  src={node.image}
                  alt=""
                />
              ) : (
                <span className="universe-search-item-img universe-search-item-placeholder">
                  {node.name.charAt(0)}
                </span>
              )}
              <span className="universe-search-item-name">{node.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default UniverseSearch;
