import AuthButton from './auth/AuthButton';
import '../styles/landing.css';

function Header({ showBack, onBack, artistCount }) {
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
        <AuthButton />
      </div>
    </header>
  );
}

export default Header;
