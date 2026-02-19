import { useState, useRef, useEffect } from 'react';
import { useAuth, useAuthActions } from '../../state/AuthContext';
import AccountMenu from './AccountMenu';
import '../../styles/auth.css';

function AuthButton() {
  const { user, isLoading } = useAuth();
  const { showAuthModal } = useAuthActions();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  if (isLoading) return null;

  if (!user) {
    return (
      <button className="auth-sign-in-btn" onClick={() => showAuthModal('login')}>
        Sign In
      </button>
    );
  }

  const initials = user.displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="auth-user-area" ref={menuRef}>
      <button className="auth-avatar-btn" onClick={() => setMenuOpen(!menuOpen)}>
        <span className="auth-avatar-initials">{initials}</span>
      </button>
      {menuOpen && <AccountMenu onClose={() => setMenuOpen(false)} />}
    </div>
  );
}

export default AuthButton;
