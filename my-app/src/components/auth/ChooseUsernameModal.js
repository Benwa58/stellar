import { useState, useEffect, useRef } from 'react';
import { useAuth, useAuthActions, useAuthDispatch } from '../../state/AuthContext';
import { checkUsername, getMe } from '../../api/authClient';
import '../../styles/auth.css';

function ChooseUsernameModal() {
  const { user } = useAuth();
  const { setUsername: saveUsername } = useAuthActions();
  const dispatch = useAuthDispatch();

  const [username, setUsername] = useState('');
  const [status, setStatus] = useState(''); // '', 'checking', 'available', 'taken', 'invalid', 'error'
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const timerRef = useRef(null);

  const USERNAME_RE = /^[a-z][a-z0-9_-]{2,19}$/;
  const shouldShow = user && !user.username;

  useEffect(() => {
    if (!shouldShow || !username) {
      setStatus('');
      return;
    }
    const val = username.toLowerCase();
    if (!USERNAME_RE.test(val)) {
      setStatus('invalid');
      return;
    }
    setStatus('checking');
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        const data = await checkUsername(val);
        setStatus(data.available ? 'available' : 'taken');
      } catch {
        setStatus('error');
      }
    }, 400);
    return () => clearTimeout(timerRef.current);
  }, [username, shouldShow]);

  if (!shouldShow) return null;

  const canSubmit = status === 'available' || status === 'error';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError('');
    setLoading(true);
    try {
      await saveUsername(username.toLowerCase());
    } catch (err) {
      if (err.message === 'Username already set.') {
        // Stale state — refresh user data so modal dismisses
        try {
          const res = await getMe();
          const data = await res.json();
          if (data.user) dispatch({ type: 'SET_USER', user: data.user });
        } catch {}
        return;
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-modal-overlay">
      <div className="auth-modal">
        <h2 className="auth-modal-title">Choose a Username</h2>
        <p className="choose-username-desc">
          Pick a unique username so friends can find you on Stellar.
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label className="auth-label" htmlFor="choose-username">Username</label>
            <input
              id="choose-username"
              className={`auth-input ${status === 'available' ? 'auth-input-valid' : status === 'taken' || status === 'invalid' ? 'auth-input-error' : ''}`}
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
              placeholder="your_username"
              maxLength={20}
              required
              autoFocus
              autoComplete="username"
            />
            {status === 'checking' && <span className="auth-field-hint">Checking...</span>}
            {status === 'available' && <span className="auth-field-hint auth-field-success">Available</span>}
            {status === 'taken' && <span className="auth-field-hint auth-field-error">Already taken</span>}
            {status === 'invalid' && username && (
              <span className="auth-field-hint auth-field-error">3-20 chars, start with a letter, lowercase letters/numbers/_/-</span>
            )}
            {status === 'error' && <span className="auth-field-hint auth-field-error">Couldn't check availability — you can still submit.</span>}
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button
            className="auth-submit-btn"
            type="submit"
            disabled={loading || !canSubmit}
          >
            {loading ? 'Saving...' : 'Set Username'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default ChooseUsernameModal;
