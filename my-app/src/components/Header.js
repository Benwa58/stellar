import { useState, useRef, useEffect, useCallback } from 'react';
import AuthButton from './auth/AuthButton';
import '../styles/landing.css';

function Header({ showBack, onBack, artistCount, mapName, defaultMapName, onMapNameChange }) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef(null);

  const displayName = mapName || defaultMapName || '';

  const startEditing = useCallback(() => {
    if (!onMapNameChange) return;
    setEditValue(mapName || '');
    setEditing(true);
  }, [onMapNameChange, mapName]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commitEdit = useCallback(() => {
    setEditing(false);
    if (onMapNameChange) {
      onMapNameChange(editValue.trim());
    }
  }, [editValue, onMapNameChange]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
  }, []);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdit();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  }, [commitEdit, cancelEdit]);

  return (
    <header className="app-header">
      <div className="header-left">
        {showBack && (
          <button className="header-back" onClick={onBack}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        )}
        <h1 className="header-title">Stellar</h1>

        {onMapNameChange && displayName && (
          <>
            <span className="header-separator">/</span>
            {editing ? (
              <input
                ref={inputRef}
                className="header-map-name-input"
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={handleKeyDown}
                placeholder={defaultMapName}
                maxLength={80}
              />
            ) : (
              <button
                className={`header-map-name ${!mapName ? 'placeholder' : ''}`}
                onClick={startEditing}
                title="Click to rename"
              >
                {displayName}
              </button>
            )}
          </>
        )}
      </div>
      <div className="header-right">
        {artistCount > 0 && (
          <span className="header-badge">{artistCount} artists</span>
        )}
        <AuthButton />
      </div>
    </header>
  );
}

export default Header;
