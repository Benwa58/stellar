import { GENRE_COLORS, HIDDEN_GEM_COLOR, CHAIN_BRIDGE_COLOR, DRIFT_COLOR } from '../utils/constants';
import { hslToRgba } from '../utils/colorUtils';

const CURATED_GENRES = [
  'rock', 'electronic', 'hip-hop', 'pop', 'jazz',
  'indie', 'metal', 'country', 'latin', 'classical',
];

function GalaxyLegend({ onClose }) {
  // Build spectrum gradient from all genre colors sorted by hue
  const allGenres = Object.entries(GENRE_COLORS)
    .filter(([key]) => key !== 'default')
    .sort((a, b) => a[1].h - b[1].h);

  const spectrumStops = allGenres
    .map(([, { h, s, l }], i) => {
      const pct = (i / (allGenres.length - 1)) * 100;
      return `${hslToRgba(h, s, l, 1)} ${pct}%`;
    })
    .join(', ');

  return (
    <div className="galaxy-legend-backdrop" onClick={onClose}>
      <div className="galaxy-legend-card" onClick={(e) => e.stopPropagation()}>
        <div className="galaxy-legend-title">Legend</div>

        <div className="galaxy-legend-items">
          {/* Seed Artists */}
          <div className="galaxy-legend-item">
            <span className="galaxy-legend-swatch">
              <svg width="18" height="18" viewBox="0 0 18 18">
                <circle cx="9" cy="9" r="7" fill="#FFD700" />
                <circle cx="9" cy="9" r="3" fill="#FFFBE6" />
              </svg>
            </span>
            <span className="galaxy-legend-label">Seed Artists</span>
          </div>

          {/* Recommendations */}
          <div className="galaxy-legend-item">
            <span className="galaxy-legend-swatch">
              <svg width="18" height="18" viewBox="0 0 18 18">
                <circle cx="9" cy="9" r="7" fill={hslToRgba(220, 50, 60, 0.9)} />
              </svg>
            </span>
            <span className="galaxy-legend-label">Recommendations</span>
          </div>

          {/* Hidden Gems */}
          <div className="galaxy-legend-item">
            <span className="galaxy-legend-swatch legend-swatch-breathing">
              <svg width="18" height="18" viewBox="0 0 18 18">
                <circle
                  cx="9" cy="9" r="7"
                  fill={hslToRgba(HIDDEN_GEM_COLOR.h, HIDDEN_GEM_COLOR.s, HIDDEN_GEM_COLOR.l, 0.85)}
                />
                <polygon points="9,3 11.4,9 9,15 6.6,9" fill="rgba(255,255,255,0.35)" />
              </svg>
            </span>
            <span className="galaxy-legend-label">Hidden Gems</span>
          </div>

          {/* Chain Bridges */}
          <div className="galaxy-legend-item">
            <span className="galaxy-legend-swatch legend-swatch-rotating">
              <svg width="18" height="18" viewBox="0 0 18 18">
                <polygon
                  points="16,9 12.5,15.06 5.5,15.06 2,9 5.5,2.94 12.5,2.94"
                  fill={hslToRgba(CHAIN_BRIDGE_COLOR.h, CHAIN_BRIDGE_COLOR.s, CHAIN_BRIDGE_COLOR.l, 0.85)}
                />
                <circle cx="9" cy="9" r="2" fill="rgba(255,255,255,0.4)" />
              </svg>
            </span>
            <span className="galaxy-legend-label">Chain Bridges</span>
          </div>

          {/* Drift */}
          <div className="galaxy-legend-item">
            <span className="galaxy-legend-swatch">
              <svg width="18" height="18" viewBox="0 0 18 18">
                <circle
                  cx="9" cy="9" r="6"
                  fill="none"
                  stroke={hslToRgba(DRIFT_COLOR.h, DRIFT_COLOR.s, DRIFT_COLOR.l, 0.8)}
                  strokeWidth="1.5"
                />
                <circle cx="9" cy="9" r="1.5" fill="rgba(255,255,255,0.3)" />
              </svg>
            </span>
            <span className="galaxy-legend-label">Drift</span>
          </div>

          {/* Favorites */}
          <div className="galaxy-legend-item">
            <span className="galaxy-legend-swatch">
              <svg width="18" height="18" viewBox="0 0 18 18">
                <defs>
                  <linearGradient id="legend-fav-grad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="rgba(30,64,175,0.95)" />
                    <stop offset="50%" stopColor="rgba(59,130,246,0.95)" />
                    <stop offset="100%" stopColor="rgba(30,58,138,0.95)" />
                  </linearGradient>
                </defs>
                <circle cx="9" cy="9" r="6.5" fill="none" stroke="url(#legend-fav-grad)" strokeWidth="2.5" />
              </svg>
            </span>
            <span className="galaxy-legend-label">Favorites</span>
          </div>

          {/* Dislikes */}
          <div className="galaxy-legend-item">
            <span className="galaxy-legend-swatch">
              <svg width="18" height="18" viewBox="0 0 18 18">
                <circle
                  cx="9" cy="9" r="6.5"
                  fill="none"
                  stroke="rgba(239,68,68,0.5)"
                  strokeWidth="2"
                  strokeDasharray="4 4"
                />
              </svg>
            </span>
            <span className="galaxy-legend-label">Dislikes</span>
          </div>
        </div>

        {/* Genre Colors */}
        <div className="galaxy-legend-divider" />
        <div className="galaxy-legend-genre-title">Genre Colors</div>
        <div className="galaxy-legend-genre-grid">
          {CURATED_GENRES.map((genre) => {
            const { h, s, l } = GENRE_COLORS[genre];
            return (
              <div key={genre} className="galaxy-legend-genre-item">
                <span
                  className="galaxy-legend-genre-dot"
                  style={{ background: hslToRgba(h, s, l, 1) }}
                />
                {genre}
              </div>
            );
          })}
        </div>
        <div
          className="galaxy-legend-spectrum"
          style={{ background: `linear-gradient(to right, ${spectrumStops})` }}
        />
        <div className="galaxy-legend-spectrum-label">
          {allGenres.length}+ genre colors
        </div>
      </div>
    </div>
  );
}

export default GalaxyLegend;
