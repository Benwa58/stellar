import { useState, useEffect } from 'react';
import { useAuth } from '../state/AuthContext';
import { getSavedMaps } from '../utils/savedMapsStorage';
import { importMaps } from '../api/authClient';
import { STORAGE_KEY } from '../utils/constants';
import '../styles/auth.css';

function ImportLocalMapsPrompt() {
  const { user } = useAuth();
  const [localMaps, setLocalMaps] = useState([]);
  const [dismissed, setDismissed] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (user) {
      setLocalMaps(getSavedMaps());
    }
  }, [user]);

  if (!user || localMaps.length === 0 || dismissed || result) return null;

  const handleImport = async () => {
    setImporting(true);
    try {
      const res = await importMaps(localMaps);
      const data = await res.json();
      if (data.success) {
        localStorage.removeItem(STORAGE_KEY);
        setResult(`Imported ${data.imported} map${data.imported !== 1 ? 's' : ''} to your account`);
        setLocalMaps([]);
      } else {
        setResult(data.error || 'Import failed');
      }
    } catch {
      setResult('Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="import-prompt">
      <p className="import-prompt-text">
        You have {localMaps.length} saved galax{localMaps.length === 1 ? 'y' : 'ies'} on this device.
      </p>
      <div className="import-prompt-actions">
        <button className="import-prompt-btn import-prompt-import" onClick={handleImport} disabled={importing}>
          {importing ? 'Importing...' : 'Import to Account'}
        </button>
        <button className="import-prompt-btn import-prompt-dismiss" onClick={() => setDismissed(true)}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

export default ImportLocalMapsPrompt;
