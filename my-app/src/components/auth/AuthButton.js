import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAuth, useAuthActions } from '../../state/AuthContext';
import { getAvatarUrl } from '../../api/authClient';
import AccountMenu from './AccountMenu';
import '../../styles/auth.css';

function AuthButton() {
  const { user, isLoading } = useAuth();
  const { showAuthModal } = useAuthActions();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const avatarRef = useRef(null);
  const menuRef = useRef(null);

  const updatePosition = useCallback(() => {
    if (avatarRef.current) {
      const rect = avatarRef.current.getBoundingClientRect();
      setMenuPos({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e) {
      if (
        menuRef.current && !menuRef.current.contains(e.target) &&
        avatarRef.current && !avatarRef.current.contains(e.target)
      ) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  const handleToggle = () => {
    if (!menuOpen) updatePosition();
    setMenuOpen(!menuOpen);
  };

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
    <>
      <button className="auth-avatar-btn" ref={avatarRef} onClick={handleToggle}>
        {user.hasAvatar ? (
          <img src={getAvatarUrl(user.id)} alt="" className="auth-avatar-img" />
        ) : (
          <span className="auth-avatar-initials">{initials}</span>
        )}
      </button>
      {menuOpen && createPortal(
        <div
          ref={menuRef}
          className="account-menu"
          style={{ position: 'fixed', top: menuPos.top, right: menuPos.right }}
        >
          <AccountMenu onClose={() => setMenuOpen(false)} />
        </div>,
        document.body
      )}
    </>
  );
}

export default AuthButton;
