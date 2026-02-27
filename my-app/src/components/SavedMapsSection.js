import { useState, useEffect, useCallback, useRef } from 'react';
import { useDispatch } from '../state/AppContext';
import { useAuth, useAuthActions } from '../state/AuthContext';
import { LOAD_SAVED_MAP } from '../state/actions';
import { getMaps, getMap, deleteMapCloud } from '../api/authClient';
import '../styles/savedMaps.css';
import '../styles/favorites.css';

function formatDate(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Deterministic hash from a string → number in [0, 1)
function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return (((h >>> 0) % 10000) / 10000);
}

// Static canvas renderer for galaxy card preview (similar to universe mini viz)
function renderCardViz(canvas, seeds, nodeCount) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;

  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  // Seeded PRNG for deterministic rendering
  const seedStr = seeds.map((s) => s.name).join('|');
  let rngState = Math.floor(hashStr(seedStr) * 2147483647) || 1;
  function rng() {
    rngState = (rngState * 16807) % 2147483647;
    return (rngState & 0x7fffffff) / 0x7fffffff;
  }

  // Background stars
  for (let i = 0; i < 35; i++) {
    ctx.beginPath();
    ctx.arc(rng() * w, rng() * h, 0.3 + rng() * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(195, 205, 235, ${0.08 + rng() * 0.18})`;
    ctx.fill();
  }

  // Build cluster nebulae from seeds
  const clusterCount = Math.min(seeds.length, 5);
  const clusters = [];
  for (let i = 0; i < clusterCount; i++) {
    const name = seeds[i].name;
    const hue = Math.floor(hashStr(name) * 360);
    const cx = w * (0.15 + hashStr(name + 'cx') * 0.7);
    const cy = h * (0.12 + hashStr(name + 'cy') * 0.65);
    const baseR = 28 + hashStr(name + 'r') * 22;
    clusters.push({ cx, cy, baseR, hue });

    // Outer halo
    const outerR = baseR * 1.6;
    const g1 = ctx.createRadialGradient(cx, cy, 0, cx, cy, outerR);
    g1.addColorStop(0, `hsla(${hue}, 55%, 50%, 0.10)`);
    g1.addColorStop(0.4, `hsla(${hue}, 50%, 45%, 0.04)`);
    g1.addColorStop(1, `hsla(${hue}, 50%, 45%, 0)`);
    ctx.fillStyle = g1;
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.fill();

    // Core
    const g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseR);
    g2.addColorStop(0, `hsla(${hue}, 60%, 55%, 0.22)`);
    g2.addColorStop(0.4, `hsla(${hue}, 55%, 50%, 0.10)`);
    g2.addColorStop(1, `hsla(${hue}, 50%, 45%, 0)`);
    ctx.fillStyle = g2;
    ctx.beginPath();
    ctx.arc(cx, cy, baseR, 0, Math.PI * 2);
    ctx.fill();

    // Offset sub-cloud
    const ox = cx + baseR * 0.22;
    const oy = cy - baseR * 0.18;
    const sr = baseR * 0.5;
    const g3 = ctx.createRadialGradient(ox, oy, 0, ox, oy, sr);
    g3.addColorStop(0, `hsla(${hue}, 65%, 58%, 0.10)`);
    g3.addColorStop(1, `hsla(${hue}, 55%, 50%, 0)`);
    ctx.fillStyle = g3;
    ctx.beginPath();
    ctx.arc(ox, oy, sr, 0, Math.PI * 2);
    ctx.fill();
  }

  // Scatter nodes around clusters
  const total = Math.min(nodeCount || 25, 50);
  const nodePositions = [];
  for (let i = 0; i < total; i++) {
    const cluster = clusters[Math.floor(rng() * clusters.length)];
    if (!cluster) continue;
    const angle = rng() * Math.PI * 2;
    const dist = cluster.baseR * (0.15 + rng() * 1.3);
    const nx = cluster.cx + Math.cos(angle) * dist;
    const ny = cluster.cy + Math.sin(angle) * dist;
    if (nx < 2 || nx > w - 2 || ny < 2 || ny > h - 2) continue;
    const isSeed = i < seeds.length;
    const size = isSeed ? 1.8 : 0.6 + rng() * 0.9;
    nodePositions.push({ x: nx, y: ny, size, hue: cluster.hue, isSeed });
  }

  // Faint links between nearby nodes
  ctx.setLineDash([2, 3]);
  for (let i = 0; i < nodePositions.length; i++) {
    for (let j = i + 1; j < nodePositions.length; j++) {
      const a = nodePositions[i];
      const b = nodePositions[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < 25 && rng() > 0.5) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = `rgba(170, 180, 255, ${0.04 + (1 - d / 25) * 0.06})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }
  }
  ctx.setLineDash([]);

  // Draw nodes
  for (const node of nodePositions) {
    const glowR = node.size * 2.5;
    const glow = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, glowR);
    glow.addColorStop(0, `hsla(${node.hue}, 55%, 50%, ${node.isSeed ? 0.20 : 0.10})`);
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(node.x, node.y, glowR, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(node.x, node.y, node.size, 0, Math.PI * 2);
    ctx.fillStyle = node.isSeed
      ? `hsla(${node.hue}, 55%, 65%, 0.85)`
      : `hsla(${node.hue}, 50%, 50%, 0.55)`;
    ctx.fill();
  }

  ctx.restore();
}

// Canvas component for individual galaxy card
function GalaxyCardCanvas({ seeds, nodeCount }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    renderCardViz(canvas, seeds, nodeCount);
  }, [seeds, nodeCount]);

  return <canvas ref={canvasRef} className="saved-map-canvas" />;
}

function SavedMapsSection() {
  const dispatch = useDispatch();
  const { user } = useAuth();
  const { showAuthModal } = useAuthActions();
  const [maps, setMaps] = useState([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  useEffect(() => {
    if (user) {
      getMaps()
        .then((res) => res.json())
        .then((data) => {
          if (data.maps) setMaps(data.maps);
        })
        .catch(() => {});
    } else {
      setMaps([]);
    }
  }, [user]);

  const handleLoad = useCallback(
    async (id) => {
      try {
        const res = await getMap(id);
        const mapData = await res.json();
        if (!mapData) return;
        dispatch({
          type: LOAD_SAVED_MAP,
          payload: {
            seedArtists: mapData.seedArtists,
            galaxyData: mapData.galaxyData,
            mapName: mapData.name,
          },
        });
      } catch {
        return;
      }
    },
    [dispatch]
  );

  const handleDelete = useCallback(
    async (id) => {
      if (confirmDeleteId === id) {
        try {
          await deleteMapCloud(id);
        } catch {
          return;
        }
        setMaps((prev) => prev.filter((m) => m.id !== id));
        setConfirmDeleteId(null);
      } else {
        setConfirmDeleteId(id);
        setTimeout(
          () => setConfirmDeleteId((curr) => (curr === id ? null : curr)),
          3000
        );
      }
    },
    [confirmDeleteId]
  );

  return (
    <div className="saved-maps-section">
      <h3 className="saved-maps-title">
        Saved Galaxies
        {user && maps.length > 0 && (
          <span className="section-count">{maps.length}</span>
        )}
      </h3>

      {/* Signed out — placeholder */}
      {!user && (
        <div className="saved-maps-scroll">
          <button
            className="section-placeholder-card"
            onClick={() => showAuthModal('register')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="20" height="20">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span className="section-placeholder-text">Sign in to save galaxies</span>
          </button>
        </div>
      )}

      {/* Signed in, no maps — empty placeholder */}
      {user && maps.length === 0 && (
        <div className="saved-maps-scroll">
          <div className="section-placeholder-card empty">
            <span className="section-placeholder-text">Saved galaxies will appear here</span>
          </div>
        </div>
      )}

      {/* Signed in, has maps — horizontal scroll */}
      {user && maps.length > 0 && (
        <div className="saved-maps-scroll">
          {maps.map((map) => {
            const unknownCount = map.nodeCount - map.seedArtists.length;
            return (
              <div
                key={map.id}
                className="saved-map-card"
                onClick={() => handleLoad(map.id)}
              >
                <GalaxyCardCanvas seeds={map.seedArtists} nodeCount={map.nodeCount} />
                <button
                  className={`saved-map-delete ${confirmDeleteId === map.id ? 'confirm' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(map.id);
                  }}
                  title={confirmDeleteId === map.id ? 'Tap again to delete' : 'Delete'}
                >
                  {confirmDeleteId === map.id ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6" />
                      <path d="M14 11v6" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  )}
                </button>
                <div className="saved-map-card-info">
                  <h4 className="saved-map-name">{map.name}</h4>
                  <div className="saved-map-seeds">
                    {map.seedArtists.slice(0, 3).map((a) => (
                      <span key={a.id} className="saved-map-seed-name">
                        {a.name}
                      </span>
                    ))}
                    {map.seedArtists.length > 3 && (
                      <span className="saved-map-seed-more">
                        +{map.seedArtists.length - 3}
                      </span>
                    )}
                  </div>
                  <div className="saved-map-card-meta">
                    <span>{map.nodeCount} artists</span>
                    <span className="saved-map-dot">&middot;</span>
                    <span>{unknownCount} unknown</span>
                    <span className="saved-map-dot">&middot;</span>
                    <span>{formatDate(map.savedAt)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default SavedMapsSection;
