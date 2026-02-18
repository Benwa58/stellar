import '../styles/galaxy.css';

function GalaxyInfoModal({ onClose }) {
  return (
    <div className="galaxy-info-overlay" onClick={onClose}>
      <div className="galaxy-info-modal" onClick={(e) => e.stopPropagation()}>
        <button className="galaxy-info-close" onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <h3 className="galaxy-info-title">How the Galaxy Works</h3>

        <div className="galaxy-info-section">
          <div className="galaxy-info-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <circle cx="12" cy="12" r="3" />
              <circle cx="12" cy="12" r="8" opacity="0.4" />
            </svg>
          </div>
          <div>
            <h4 className="galaxy-info-heading">Connections</h4>
            <p className="galaxy-info-text">
              Artists are placed near each other when they share musical DNA. The stronger the similarity, the closer they appear.
            </p>
          </div>
        </div>

        <div className="galaxy-info-section">
          <div className="galaxy-info-icon galaxy-info-icon-gem">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <polygon points="12,2 22,12 12,22 2,12" />
            </svg>
          </div>
          <div>
            <h4 className="galaxy-info-heading">Hidden Gems</h4>
            <p className="galaxy-info-text">
              Diamond-shaped nodes are artists found through indirect paths — bridges between styles, deep cuts from intermediate artists, or those with a more niche following.
            </p>
          </div>
        </div>

        <div className="galaxy-info-section">
          <div className="galaxy-info-icon galaxy-info-icon-link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <line x1="4" y1="12" x2="20" y2="12" />
              <circle cx="4" cy="12" r="2" />
              <circle cx="20" cy="12" r="2" />
            </svg>
          </div>
          <div>
            <h4 className="galaxy-info-heading">Links</h4>
            <p className="galaxy-info-text">
              Lines show relationships: solid lines are direct connections, dashed teal lines bridge different styles, and dotted purple chains connect distant genres step-by-step.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default GalaxyInfoModal;
