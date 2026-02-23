import { useState } from 'react';
import AuthButton from './auth/AuthButton';
import ReleaseNotesModal from './ReleaseNotesModal';
import '../styles/landing.css';

function Header({ showBack, onBack, artistCount, showReleaseNotes: enableReleaseNotes }) {
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);

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
      </div>
      <div className="header-right">
        {artistCount > 0 && (
          <span className="header-badge">{artistCount} artists</span>
        )}
        {enableReleaseNotes && (
          <button
            className="header-icon-btn"
            onClick={() => setShowReleaseNotes(true)}
            title="Release Notes"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="9" y1="13" x2="15" y2="13" />
              <line x1="9" y1="17" x2="13" y2="17" />
            </svg>
          </button>
        )}
        <AuthButton />
      </div>

      {showReleaseNotes && (
        <ReleaseNotesModal onClose={() => setShowReleaseNotes(false)} />
      )}
    </header>
  );
}

export default Header;
