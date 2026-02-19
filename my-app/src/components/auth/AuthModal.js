import { useState } from 'react';
import { useAuth, useAuthActions } from '../../state/AuthContext';
import '../../styles/auth.css';

function AuthModal() {
  const { showAuthModal, authModalTab } = useAuth();
  const { login, register, hideAuthModal } = useAuthActions();

  const [tab, setTab] = useState(authModalTab);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!showAuthModal) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (tab === 'register') {
        await register(email, password, displayName);
      } else {
        await login(email, password);
      }
      hideAuthModal();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSpotifyLogin = () => {
    window.location.href = '/api/spotify/login';
  };

  const switchTab = (newTab) => {
    setTab(newTab);
    setError('');
  };

  return (
    <div className="auth-modal-overlay" onClick={hideAuthModal}>
      <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
        <button className="auth-modal-close" onClick={hideAuthModal}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <h2 className="auth-modal-title">
          {tab === 'register' ? 'Create Account' : 'Welcome Back'}
        </h2>

        <div className="auth-tabs">
          <button
            className={`auth-tab ${tab === 'login' ? 'active' : ''}`}
            onClick={() => switchTab('login')}
          >
            Sign In
          </button>
          <button
            className={`auth-tab ${tab === 'register' ? 'active' : ''}`}
            onClick={() => switchTab('register')}
          >
            Sign Up
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {tab === 'register' && (
            <div className="auth-field">
              <label className="auth-label" htmlFor="auth-name">Display Name</label>
              <input
                id="auth-name"
                className="auth-input"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                maxLength={50}
                required
                autoComplete="name"
              />
            </div>
          )}

          <div className="auth-field">
            <label className="auth-label" htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              className="auth-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              className="auth-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={tab === 'register' ? 'Min. 8 characters' : 'Your password'}
              minLength={tab === 'register' ? 8 : undefined}
              required
              autoComplete={tab === 'register' ? 'new-password' : 'current-password'}
            />
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button className="auth-submit-btn" type="submit" disabled={loading}>
            {loading ? 'Please wait...' : tab === 'register' ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <div className="auth-divider">
          <span>or</span>
        </div>

        <button className="auth-spotify-btn" onClick={handleSpotifyLogin}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
          </svg>
          Continue with Spotify
        </button>

        <p className="auth-footer">
          {tab === 'register' ? (
            <>Spotify login adds playlist export</>
          ) : (
            <>Don't have an account? <button className="auth-link" onClick={() => switchTab('register')}>Sign up</button></>
          )}
        </p>
      </div>
    </div>
  );
}

export default AuthModal;
