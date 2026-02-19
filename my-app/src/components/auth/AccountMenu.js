import { useState } from 'react';
import { useAuth, useAuthActions } from '../../state/AuthContext';
import { getSavedMaps } from '../../utils/savedMapsStorage';
import { importMaps } from '../../api/authClient';
import { STORAGE_KEY } from '../../utils/constants';
import '../../styles/auth.css';

function AccountMenu({ onClose }) {
  const { user } = useAuth();
  const { logout } = useAuthActions();
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const localMaps = getSavedMaps();

  const handleImport = async () => {
    setImporting(true);
    try {
      const res = await importMaps(localMaps);
      const data = await res.json();
      if (data.success) {
        localStorage.removeItem(STORAGE_KEY);
        setImportResult(`Imported ${data.imported} map${data.imported !== 1 ? 's' : ''}`);
      } else {
        setImportResult(data.error || 'Import failed');
      }
    } catch {
      setImportResult('Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    onClose();
  };

  const handleLinkSpotify = () => {
    window.location.href = '/api/spotify/login';
  };

  return (
    <>
      <div className="account-menu-header">
        <span className="account-menu-name">{user.displayName}</span>
        {user.email && <span className="account-menu-email">{user.email}</span>}
      </div>

      <div className="account-menu-divider" />

      {user.hasSpotify ? (
        <div className="account-menu-item account-menu-spotify-linked">
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
          </svg>
          Spotify Connected
        </div>
      ) : (
        <button className="account-menu-item account-menu-btn" onClick={handleLinkSpotify}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
          </svg>
          Link Spotify
        </button>
      )}

      {localMaps.length > 0 && !importResult && (
        <button
          className="account-menu-item account-menu-btn"
          onClick={handleImport}
          disabled={importing}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          {importing ? 'Importing...' : `Import ${localMaps.length} Local Map${localMaps.length !== 1 ? 's' : ''}`}
        </button>
      )}

      {importResult && (
        <div className="account-menu-item account-menu-import-result">
          {importResult}
        </div>
      )}

      <div className="account-menu-divider" />

      <button className="account-menu-item account-menu-btn account-menu-logout" onClick={handleLogout}>
        Sign Out
      </button>
    </>
  );
}

export default AccountMenu;
