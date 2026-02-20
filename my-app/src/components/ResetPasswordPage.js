import { useState } from 'react';
import { resetPassword } from '../api/authClient';
import '../styles/auth.css';

function ResetPasswordPage({ token }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      const res = await resetPassword(token, password);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Something went wrong.');
      }

      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const goHome = () => {
    window.location.href = '/';
  };

  return (
    <div className="reset-page">
      <div className="auth-modal">
        <h2 className="auth-modal-title">
          {success ? 'Password Updated' : 'Set New Password'}
        </h2>

        {success ? (
          <div className="auth-forgot-success">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <p>Your password has been updated.</p>
            <p className="auth-forgot-success-sub">You can now sign in with your new password.</p>
            <button className="auth-submit-btn" onClick={goHome} style={{ marginTop: 12 }}>
              Go to Stellar
            </button>
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="auth-field">
              <label className="auth-label" htmlFor="reset-password">New Password</label>
              <input
                id="reset-password"
                className="auth-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                minLength={8}
                required
                autoComplete="new-password"
              />
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="reset-confirm">Confirm Password</label>
              <input
                id="reset-confirm"
                className="auth-input"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                minLength={8}
                required
                autoComplete="new-password"
              />
            </div>

            {error && <div className="auth-error">{error}</div>}

            <button className="auth-submit-btn" type="submit" disabled={loading}>
              {loading ? 'Resetting...' : 'Reset Password'}
            </button>
          </form>
        )}

        {!success && (
          <p className="auth-footer">
            <button className="auth-link" onClick={goHome}>Back to Stellar</button>
          </p>
        )}
      </div>
    </div>
  );
}

export default ResetPasswordPage;
