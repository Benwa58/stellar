import '../styles/galaxy.css';
import '../styles/landing.css';

const RELEASES = [
  {
    version: '1.6',
    date: 'February 2026',
    title: 'Batch Seed Selection',
    items: [
      'Queue multiple artists as new seeds without reloading the map — click "+" to queue, click again to unqueue.',
      'A "Regenerate Map" button appears with a count of queued artists, triggering a single reload for all new seeds at once.',
      'Zoom controls added to the bottom-left for quick +/- zooming.',
      'Release notes now accessible from the galaxy view header.',
    ],
  },
  {
    version: '1.5',
    date: 'February 2026',
    title: 'Expand Universe',
    items: [
      'Expand Universe discovers genre-adjacent "drift" artists in the outer orbit of your galaxy — outliers that share musical DNA with your seeds but were never found through similarity chains.',
      'Drift nodes render as coral ring-shaped outlines, visually distinct at the edge of your map.',
      'The canvas background subtly shifts when expanded, marking the boundary between your core galaxy and the drift territory.',
    ],
  },
  {
    version: '1.4',
    date: 'February 2026',
    title: 'Share Playlist & Autoplay',
    items: [
      'Share Playlist lets you export your galaxy as a playable playlist with 30-second previews.',
      'Autoplay mode (on by default) continues playing previews sequentially down the list after your first play.',
      'Tracks without previews are automatically skipped.',
    ],
  },
  {
    version: '1.3',
    date: 'February 2026',
    title: 'Share Galaxy Maps',
    items: [
      'Share your galaxy as a beautiful image with a link, or copy a shareable URL.',
      'Captured images include a subtle Stellar watermark.',
    ],
  },
  {
    version: '1.2',
    date: 'January 2026',
    title: 'Hidden Gems & Chain Bridges',
    items: [
      'Hidden Gems surface artists with niche followings found through indirect paths — deep cuts from intermediate artists and bridges between styles.',
      'Chain Bridges connect distant genres step-by-step, revealing how different musical worlds relate.',
      'Galaxy Info modal explains every node type and link style.',
    ],
  },
  {
    version: '1.1',
    date: 'January 2026',
    title: 'Favorites & Galaxy Saves',
    items: [
      'Favorite artists directly from the detail panel to build a personal collection.',
      'Save and reload galaxy maps to revisit your discoveries later.',
      'Dislike artists to filter them from future recommendations.',
    ],
  },
  {
    version: '1.0',
    date: 'January 2026',
    title: 'Launch',
    items: [
      'Generate galaxy maps from up to 5 seed artists using Last.fm similarity data and Deezer enrichment.',
      'Interactive force-directed canvas with pan, zoom, and click-to-explore.',
      'Artist detail panel with genres, popularity, and 30-second audio previews.',
    ],
  },
];

function ReleaseNotesModal({ onClose }) {
  return (
    <div className="galaxy-info-overlay" onClick={onClose}>
      <div className="release-notes-modal" onClick={(e) => e.stopPropagation()}>
        <button className="galaxy-info-close" onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <h3 className="galaxy-info-title">Release Notes</h3>

        <div className="release-notes-list">
          {RELEASES.map((release) => (
            <div key={release.version} className="release-notes-entry">
              <div className="release-notes-header">
                <span className="release-notes-version">v{release.version}</span>
                <span className="release-notes-date">{release.date}</span>
              </div>
              <h4 className="release-notes-entry-title">{release.title}</h4>
              <ul className="release-notes-items">
                {release.items.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ReleaseNotesModal;
