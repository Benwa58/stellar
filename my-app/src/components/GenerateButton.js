import { MIN_SEED_ARTISTS } from '../utils/constants';
import '../styles/landing.css';

function getHelperText(count) {
  if (count === 0) return 'Add at least 3 artists to begin';
  if (count < MIN_SEED_ARTISTS) {
    const remaining = MIN_SEED_ARTISTS - count;
    return `Add ${remaining} more to generate \u2014 the more you add, the richer your galaxy`;
  }
  return 'Ready to explore! Add more artists for a deeper galaxy';
}

function GenerateButton({ artistCount, onClick }) {
  const isReady = artistCount >= MIN_SEED_ARTISTS;

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
        {isReady
          ? `Generate Galaxy (${artistCount} artists)`
          : `${artistCount}/${MIN_SEED_ARTISTS} artists`}
      </button>
      <p className={`generate-helper ${isReady ? 'helper-ready' : ''}`}>
        {getHelperText(artistCount)}
      </p>
    </div>
  );
}

export default GenerateButton;
