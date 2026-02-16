import { MIN_SEED_ARTISTS } from '../utils/constants';
import '../styles/landing.css';

function GenerateButton({ artistCount, onClick }) {
  const isReady = artistCount >= MIN_SEED_ARTISTS;
  const remaining = MIN_SEED_ARTISTS - artistCount;

  return (
    <div className="generate-section">
      <button
        className={`generate-button ${isReady ? 'ready' : 'disabled'}`}
        onClick={onClick}
        disabled={!isReady}
      >
        <span className="generate-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
            <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
          </svg>
        </span>
        {isReady ? 'Generate Galaxy' : `Add ${remaining} more artist${remaining !== 1 ? 's' : ''}`}
      </button>
      {isReady && (
        <p className="generate-hint">
          {artistCount} artists selected
        </p>
      )}
    </div>
  );
}

export default GenerateButton;
