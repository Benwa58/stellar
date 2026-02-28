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

  return (
    <>
      <div className="account-menu-header">
        <span className="account-menu-name">{user.displayName}</span>
        {user.username && <span className="account-menu-username">@{user.username}</span>}
        {user.email && <span className="account-menu-email">{user.email}</span>}
      </div>

      <div className="account-menu-divider" />

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
