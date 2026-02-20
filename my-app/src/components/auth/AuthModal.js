import { useState } from 'react';
import { useAuth, useAuthActions } from '../../state/AuthContext';
import { forgotPassword } from '../../api/authClient';
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
  const [forgotSent, setForgotSent] = useState(false);

  if (!showAuthModal) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (tab === 'forgot') {
        const res = await forgotPassword(email);
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Something went wrong.');
        }
        setForgotSent(true);
      } else if (tab === 'register') {
        await register(email, password, displayName);
        hideAuthModal();
      } else {
        await login(email, password);
        hideAuthModal();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const switchTab = (newTab) => {
    setTab(newTab);
    setError('');
    setForgotSent(false);
  };

  const modalTitle = tab === 'register'
    ? 'Create Account'
    : tab === 'forgot'
      ? 'Reset Password'
      : 'Welcome Back';

  return (
    <div className="auth-modal-overlay" onClick={hideAuthModal}>
      <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
        <button className="auth-modal-close" onClick={hideAuthModal}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <h2 className="auth-modal-title">{modalTitle}</h2>

        {tab !== 'forgot' && (
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
        )}

        {tab === 'forgot' && forgotSent ? (
          <div className="auth-forgot-success">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <p>Check your email for a reset link.</p>
            <p className="auth-forgot-success-sub">If an account exists with that email, you'll receive instructions to reset your password.</p>
          </div>
        ) : (
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

            {tab !== 'forgot' && (
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
                {tab === 'login' && (
                  <button type="button" className="auth-forgot-link" onClick={() => switchTab('forgot')}>
                    Forgot password?
                  </button>
                )}
              </div>
            )}

            {error && <div className="auth-error">{error}</div>}

            <button className="auth-submit-btn" type="submit" disabled={loading}>
              {loading
                ? 'Please wait...'
                : tab === 'forgot'
                  ? 'Send Reset Link'
                  : tab === 'register'
                    ? 'Create Account'
                    : 'Sign In'}
            </button>
          </form>
        )}

        <p className="auth-footer">
          {tab === 'forgot' ? (
            <button className="auth-link" onClick={() => switchTab('login')}>Back to sign in</button>
          ) : tab === 'register' ? (
            <>Already have an account? <button className="auth-link" onClick={() => switchTab('login')}>Sign in</button></>
          ) : (
            <>Don't have an account? <button className="auth-link" onClick={() => switchTab('register')}>Sign up</button></>
          )}
        </p>
      </div>
    </div>
  );
}

export default AuthModal;
