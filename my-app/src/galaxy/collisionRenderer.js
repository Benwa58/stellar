/**
 * Collision renderer — 4 levels of detail for the "Collide Universes" view.
 *
 * LOD 4 (scale < 0.20): Supercluster collision — two large nebulae colliding with energy at center
 * LOD 3 (scale 0.20–0.45): Zone clusters visible as nebulae with zone labels
 * LOD 2 (scale 0.45–0.90): Individual nodes visible, selective artist labels
 * LOD 1 (scale >= 0.90): Full detail — links, nodes, indicators, labels
 */

import { GALAXY_COLORS } from '../utils/constants';
import { ZONE_COLORS } from './collisionGraphBuilder';

// ─── Deterministic random ─────────────────────────────────────────
function seededRandom(seed) {
  const h = Math.sin(seed) * 43758.5453;
  return h - Math.floor(h);
}

// ─── LOD factors ──────────────────────────────────────────────────
function clamp01(v) { return Math.max(0, Math.min(1, v)); }

function getCollisionLOD(scale) {
  return {
    // LOD 4: supercluster overview (< 0.20)
    superclusterFactor: 1 - clamp01((scale - 0.12) / 0.12),
    // Zone haze (visible < 0.6)
    hazeFactor: 1 - clamp01((scale - 0.35) / 0.35),
    // Node visibility (> 0.30)
    nodeFactor: clamp01((scale - 0.30) / 0.18),
    // Label visibility (> 0.40)
    labelFactor: clamp01((scale - 0.40) / 0.12),
    // Full detail (> 0.85)
    detailFactor: clamp01((scale - 0.85) / 0.2),
  };
}

// ─── Mobile detection ─────────────────────────────────────────────
const IS_MOBILE = typeof navigator !== 'undefined' &&
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
const TARGET_FPS = IS_MOBILE ? 30 : 60;
const FRAME_BUDGET = 1000 / TARGET_FPS;

// ─── Starfield ────────────────────────────────────────────────────
function generateStars(worldBounds, count) {
  const pad = 300;
  const stars = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: worldBounds.minX - pad + Math.random() * (worldBounds.maxX - worldBounds.minX + pad * 2),
      y: worldBounds.minY - pad + Math.random() * (worldBounds.maxY - worldBounds.minY + pad * 2),
      size: 0.2 + Math.random() * 1.0,
      baseAlpha: 0.03 + Math.random() * 0.18,
      phase: Math.random() * Math.PI * 2,
      speed: 0.0004 + Math.random() * 0.0014,
    });
  }
  return stars;
}

// ─── Zone haze particles ──────────────────────────────────────────
function buildZoneHazes(zoneMetas) {
  return zoneMetas.map((zm) => {
    const seed = zm.cx * 1000 + zm.cy * 7 + zm.count * 333;
    const dots = [];
    const dotCount = 40 + zm.count * 10;
    const baseR = zm.visualRadius * 1.3;

    for (let i = 0; i < dotCount; i++) {
      const r1 = seededRandom(seed + i * 12.9898);
      const r2 = seededRandom(seed + i * 78.233 + 1.0);
      const r3 = seededRandom(seed + i * 45.164 + 2.0);
      const r4 = seededRandom(seed + i * 93.989 + 3.0);

      const angle = r1 * Math.PI * 2;
      const radialT = r2 * r2 * r3;
      const dist = radialT * baseR;

      dots.push({
        x: zm.cx + dist * Math.cos(angle),
        y: zm.cy + dist * Math.sin(angle),
        size: (0.5 + r4 * 2.5) * Math.max(0.3, 1 - (dist / baseR) * 0.4),
        baseBrightness: Math.max(0.2, 1 - (dist / baseR) * 0.55),
        phase: r1 * Math.PI * 2,
        speed: 0.0008 + r3 * 0.002,
        h: zm.color.h + (r4 - 0.5) * 15,
        s: zm.color.s,
        l: zm.color.l,
      });
    }

    // Bright cluster galaxies
    const bcgCount = 3 + Math.floor(zm.count * 0.5);
    for (let i = 0; i < bcgCount; i++) {
      const r1 = seededRandom(seed + i * 33.33 + 100);
      const r2 = seededRandom(seed + i * 77.77 + 200);
      const r3 = seededRandom(seed + i * 55.55 + 300);
      const angle = r1 * Math.PI * 2;
      const dist = r2 * r2 * baseR * 0.5;

      dots.push({
        x: zm.cx + dist * Math.cos(angle),
        y: zm.cy + dist * Math.sin(angle),
        size: 3 + r1 * 4,
        baseBrightness: 0.8 + r3 * 0.2,
        phase: r1 * Math.PI * 2,
        speed: 0.0005 + r2 * 0.001,
        h: zm.color.h, s: zm.color.s, l: zm.color.l,
        isBCG: true,
        glowSize: 10 + r1 * 12,
      });
    }

    return { dots, zm, baseR };
  });
}

// ─── Collision energy particles (center zone) ─────────────────────
function buildCollisionEnergy(zoneMetas) {
  // Find the core overlap zone
  const coreZone = zoneMetas.find((zm) => zm.key === 'core_overlap');
  // Find user and friend sides
  const userZone = zoneMetas.find((zm) => zm.key === 'your_artists');
  const friendZone = zoneMetas.find((zm) => zm.key === 'friend_artists');

  if (!coreZone) return { particles: [], tendrils: [] };

  const cx = coreZone.cx;
  const cy = coreZone.cy;

  // Energy particles around the collision point
  const particles = [];
  const particleCount = IS_MOBILE ? 60 : 120;
  for (let i = 0; i < particleCount; i++) {
    const seed = i * 127.1 + 311.7;
    const r1 = seededRandom(seed);
    const r2 = seededRandom(seed + 1);
    const r3 = seededRandom(seed + 2);
    const r4 = seededRandom(seed + 3);

    const angle = r1 * Math.PI * 2;
    const dist = r2 * r2 * 150;
    // Elongate along collision axis (horizontal)
    const stretchX = 1.8;
    const stretchY = 0.6;

    particles.push({
      x: cx + dist * Math.cos(angle) * stretchX,
      y: cy + dist * Math.sin(angle) * stretchY,
      size: 0.5 + r3 * 3,
      brightness: 0.3 + r4 * 0.7,
      phase: r1 * Math.PI * 2,
      speed: 0.001 + r3 * 0.003,
      hue: r4 < 0.3 ? 45 : (r4 < 0.6 ? 230 : 15), // gold, blue, or coral
    });
  }

  // Energy tendrils connecting the two superclusters
  const tendrils = [];
  if (userZone && friendZone) {
    const tendrilCount = 5;
    for (let t = 0; t < tendrilCount; t++) {
      const points = [];
      const yOffset = (t - 2) * 30;
      const dotCount = 30;
      for (let i = 0; i < dotCount; i++) {
        const progress = i / (dotCount - 1);
        const x = userZone.cx + (friendZone.cx - userZone.cx) * progress;
        const noise = (seededRandom(t * 100 + i * 12.9898) - 0.5) * 40;
        const y = cy + yOffset + noise * Math.sin(progress * Math.PI);
        points.push({
          x, y,
          progress,
          size: 0.5 + seededRandom(t * 200 + i * 78.233) * 1.5,
        });
      }
      tendrils.push(points);
    }
  }

  return { particles, tendrils };
}

// ─── Inter-zone filaments ─────────────────────────────────────────
function buildZoneFilaments(zoneMetas) {
  const filaments = [];
  // Connect specific zone pairs that make sense visually
  const connections = [
    ['your_artists', 'friend_exploration'],
    ['friend_exploration', 'core_overlap'],
    ['core_overlap', 'your_exploration'],
    ['your_exploration', 'friend_artists'],
    ['core_overlap', 'shared_frontier'],
  ];

  for (const [keyA, keyB] of connections) {
    const zA = zoneMetas.find((z) => z.key === keyA);
    const zB = zoneMetas.find((z) => z.key === keyB);
    if (!zA || !zB || zA.count === 0 || zB.count === 0) continue;

    const dx = zB.cx - zA.cx;
    const dy = zB.cy - zA.cy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const dots = [];
    const dotCount = Math.floor(dist / 8);
    const seed = zA.cx * 100 + zB.cy * 7;

    for (let k = 0; k < dotCount; k++) {
      const t = (k + 0.5) / dotCount;
      const noise = (seededRandom(seed + k * 12.9898) - 0.5) * 30;

      dots.push({
        x: zA.cx + dx * t + (-dy / dist) * noise,
        y: zA.cy + dy * t + (dx / dist) * noise,
        size: 0.4 + seededRandom(seed + k * 78.233) * 1.2,
        t,
        h: zA.color.h + (zB.color.h - zA.color.h) * t,
        phase: seededRandom(seed + k * 93.989) * Math.PI * 2,
      });
    }

    filaments.push({ dots, proximity: 0.8 });
  }

  return filaments;
}

// ─── Main renderer factory ────────────────────────────────────────

export function createCollisionRenderer(canvas, getState) {
  const ctx = canvas.getContext('2d');
  let frameId = null;
  const startTime = performance.now();
  let lastFrameTime = 0;
  let isDocumentVisible = true;

  let stars = null;
  let hazes = null;
  let filaments = null;
  let collisionEnergy = null;
  let lastMetasKey = null;

  function ensureCaches(zoneMetas, worldBounds) {
    const key = zoneMetas.map((z) => `${z.cx},${z.cy},${z.count}`).join('|');
    if (key === lastMetasKey) return;
    lastMetasKey = key;
    stars = generateStars(worldBounds, IS_MOBILE ? 300 : 500);
    hazes = buildZoneHazes(zoneMetas);
    filaments = buildZoneFilaments(zoneMetas);
    collisionEnergy = buildCollisionEnergy(zoneMetas);
  }

  function isVisible(wx, wy, radius, transform, vw, vh) {
    const sx = wx * transform.scale + transform.x;
    const sy = wy * transform.scale + transform.y;
    const sr = radius * transform.scale;
    return sx + sr > -50 && sx - sr < vw + 50 && sy + sr > -50 && sy - sr < vh + 50;
  }

  function handleVisibilityChange() {
    isDocumentVisible = !document.hidden;
    if (isDocumentVisible && frameId === null) {
      lastFrameTime = performance.now();
      frameId = requestAnimationFrame(render);
    }
  }
  document.addEventListener('visibilitychange', handleVisibilityChange);

  function render() {
    const now = performance.now();
    if (now - lastFrameTime < FRAME_BUDGET - 1) {
      frameId = requestAnimationFrame(render);
      return;
    }
    lastFrameTime = now;

    if (!isDocumentVisible) { frameId = null; return; }

    const state = getState();
    if (!state || !state.zoneMetas || state.zoneMetas.length === 0) {
      frameId = requestAnimationFrame(render);
      return;
    }

    const { zoneMetas, allNodes, allLinks, transform, worldBounds,
            hoveredNode, selectedNode, favoriteNames, dislikeNames, discoveredNames } = state;
    const time = now - startTime;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    const scale = transform.scale;
    const lod = getCollisionLOD(scale);

    ensureCaches(zoneMetas, worldBounds);

    // Orbital drift for living-map feel
    if (allNodes) {
      for (const node of allNodes) {
        if (node.homeX == null) continue;
        if (!isVisible(node.homeX, node.homeY, (node.driftRadius || 0) + (node.radius || 5) * 3, transform, w, h)) continue;
        const t = time * node.driftSpeed + node.driftPhase;
        node.x = node.homeX + Math.sin(t) * node.driftRadius;
        node.y = node.homeY + Math.cos(t * 0.7 + 1.3) * node.driftRadius;
      }
    }

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Background gradient — slightly warmer for collision feel
    const maxDim = Math.max(w, h);
    const bg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, maxDim * 0.7);
    bg.addColorStop(0, 'rgba(18, 12, 35, 1)');
    bg.addColorStop(1, GALAXY_COLORS.backgroundGradientOuter);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // World-space rendering
    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(scale, scale);

    // ── Starfield ──
    if (stars) {
      for (const p of stars) {
        if (!isVisible(p.x, p.y, 2, transform, w, h)) continue;
        const twinkle = p.baseAlpha + 0.08 * Math.sin(time * p.speed + p.phase);
        if (twinkle <= 0) continue;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180, 195, 225, ${twinkle})`;
        ctx.fill();
      }
    }

    // ── Collision energy (LOD 4 supercluster view) ──
    if (collisionEnergy && lod.hazeFactor > 0) {
      const energyAlpha = lod.hazeFactor * (1 + lod.superclusterFactor * 1.5);

      // Energy tendrils
      for (const tendril of collisionEnergy.tendrils) {
        for (const pt of tendril) {
          const edgeFade = Math.max(0, 1 - Math.abs(pt.progress - 0.5) * 2.5);
          const twinkle = 0.5 + 0.5 * Math.sin(time * 0.002 + pt.x * 0.01);
          const alpha = 0.3 * edgeFade * twinkle * energyAlpha;
          if (alpha < 0.02) continue;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, pt.size * (1 + lod.superclusterFactor), 0, Math.PI * 2);
          ctx.fillStyle = `hsla(45, 80%, 75%, ${Math.min(alpha, 0.6)})`;
          ctx.fill();
        }
      }

      // Energy particles at collision point
      for (const p of collisionEnergy.particles) {
        const twinkle = 0.5 + 0.5 * Math.sin(time * p.speed + p.phase);
        const alpha = p.brightness * twinkle * energyAlpha * 0.5;
        if (alpha < 0.02) continue;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 + lod.superclusterFactor * 0.5), 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 80%, 78%, ${Math.min(alpha, 0.8)})`;
        ctx.fill();
      }
    }

    // ── Zone filaments ──
    if (filaments && lod.hazeFactor > 0) {
      const filAlpha = lod.hazeFactor * (1 + lod.superclusterFactor * 0.8);
      ctx.globalAlpha = Math.min(filAlpha, 1);
      for (const fil of filaments) {
        for (const d of fil.dots) {
          const edgeFade = Math.max(0, 1 - Math.abs(d.t - 0.5) * 2.5);
          const twinkle = 0.5 + 0.5 * Math.sin(time * 0.001 + d.phase);
          const alpha = 0.4 * edgeFade * twinkle * fil.proximity;
          if (alpha < 0.02) continue;
          ctx.beginPath();
          ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${d.h}, 30%, 72%, ${alpha})`;
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }

    // ── Zone hazes (nebulae) ──
    if (hazes) {
      const brightnessBoost = 1 + lod.superclusterFactor * 1.5;

      for (const { dots, zm, baseR } of hazes) {
        if (!isVisible(zm.cx, zm.cy, baseR * 2, transform, w, h)) continue;

        const breathe = 1 + 0.025 * Math.sin(time * 0.0004 + zm.cx * 0.008);
        const { h: ch, s: cs, l: cl } = zm.color;

        // Multi-layer nebula gradients
        if (lod.hazeFactor > 0) {
          ctx.globalAlpha = lod.hazeFactor;

          // Outer diffuse halo
          const outerR = baseR * 1.6 * breathe;
          const outer = ctx.createRadialGradient(zm.cx, zm.cy, 0, zm.cx, zm.cy, outerR);
          const outerAlpha = 0.08 * brightnessBoost;
          outer.addColorStop(0, `hsla(${ch}, ${cs}%, ${cl}%, ${Math.min(outerAlpha, 0.25)})`);
          outer.addColorStop(0.4, `hsla(${ch}, ${cs}%, ${cl}%, ${Math.min(outerAlpha * 0.5, 0.15)})`);
          outer.addColorStop(1, `hsla(${ch}, ${cs}%, ${cl}%, 0)`);
          ctx.beginPath();
          ctx.arc(zm.cx, zm.cy, outerR, 0, Math.PI * 2);
          ctx.fillStyle = outer;
          ctx.fill();

          // Mid nebula
          const midR = baseR * 1.0 * breathe;
          const mid = ctx.createRadialGradient(zm.cx, zm.cy, 0, zm.cx, zm.cy, midR);
          const midAlpha = 0.12 * brightnessBoost;
          mid.addColorStop(0, `hsla(${ch}, ${Math.min(cs + 15, 95)}%, ${Math.min(cl + 10, 80)}%, ${Math.min(midAlpha, 0.35)})`);
          mid.addColorStop(0.5, `hsla(${ch}, ${cs}%, ${cl}%, ${Math.min(midAlpha * 0.4, 0.15)})`);
          mid.addColorStop(1, `hsla(${ch}, ${cs}%, ${cl}%, 0)`);
          ctx.beginPath();
          ctx.arc(zm.cx, zm.cy, midR, 0, Math.PI * 2);
          ctx.fillStyle = mid;
          ctx.fill();

          // Core glow
          const coreR = baseR * 0.3 * breathe;
          const core = ctx.createRadialGradient(zm.cx, zm.cy, 0, zm.cx, zm.cy, coreR);
          const coreAlpha = 0.1 * brightnessBoost;
          core.addColorStop(0, `hsla(${ch}, ${Math.min(cs + 15, 95)}%, ${Math.min(cl + 15, 85)}%, ${Math.min(coreAlpha, 0.25)})`);
          core.addColorStop(0.4, `hsla(${ch}, ${Math.min(cs + 5, 85)}%, ${Math.min(cl + 8, 78)}%, ${Math.min(coreAlpha * 0.4, 0.12)})`);
          core.addColorStop(1, `hsla(${ch}, ${cs}%, ${cl}%, 0)`);
          ctx.beginPath();
          ctx.arc(zm.cx, zm.cy, coreR, 0, Math.PI * 2);
          ctx.fillStyle = core;
          ctx.fill();

          ctx.globalAlpha = 1;
        }

        // Nucleus point
        if (lod.hazeFactor > 0) {
          const nucleusPulse = 0.9 + 0.1 * Math.sin(time * 0.0006 + zm.cy * 0.01);
          const nucleusR = Math.max(3, baseR * 0.04) * nucleusPulse;
          const nucleusAlpha = (0.3 + lod.superclusterFactor * 0.2) * lod.hazeFactor;

          const nGlow = ctx.createRadialGradient(zm.cx, zm.cy, 0, zm.cx, zm.cy, nucleusR * 3);
          nGlow.addColorStop(0, `hsla(${ch}, ${Math.min(cs + 10, 95)}%, ${Math.min(cl + 20, 90)}%, ${nucleusAlpha * 0.5})`);
          nGlow.addColorStop(0.4, `hsla(${ch}, ${cs}%, ${Math.min(cl + 10, 80)}%, ${nucleusAlpha * 0.15})`);
          nGlow.addColorStop(1, `hsla(${ch}, ${cs}%, ${cl}%, 0)`);
          ctx.beginPath();
          ctx.arc(zm.cx, zm.cy, nucleusR * 3, 0, Math.PI * 2);
          ctx.fillStyle = nGlow;
          ctx.fill();

          ctx.beginPath();
          ctx.arc(zm.cx, zm.cy, nucleusR, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${ch}, 30%, 88%, ${nucleusAlpha * 0.7})`;
          ctx.fill();
        }

        // Particle dots
        const dotAlphaScale = (0.5 + lod.hazeFactor * 0.5) * brightnessBoost;
        for (const d of dots) {
          if (d.isBCG) {
            const twinkle = 0.82 + 0.18 * Math.sin(time * d.speed + d.phase);
            const alpha = Math.min(d.baseBrightness * twinkle * dotAlphaScale, 1);
            if (alpha < 0.03) continue;

            const glowR = d.glowSize * breathe;
            ctx.globalAlpha = Math.min(alpha * 0.4, 0.6);
            ctx.beginPath();
            ctx.arc(d.x, d.y, glowR, 0, Math.PI * 2);
            ctx.fillStyle = `hsla(${d.h}, ${d.s}%, ${Math.min(d.l + 25, 90)}%, 0.5)`;
            ctx.fill();
            ctx.globalAlpha = 1;

            ctx.beginPath();
            ctx.arc(d.x, d.y, d.size * 0.6, 0, Math.PI * 2);
            ctx.fillStyle = `hsla(${d.h}, ${Math.max(d.s - 15, 20)}%, ${Math.min(d.l + 35, 98)}%, ${Math.min(alpha, 1)})`;
            ctx.fill();
          } else {
            const twinkle = 0.7 + 0.3 * Math.sin(time * d.speed + d.phase);
            const alpha = Math.min(d.baseBrightness * twinkle * dotAlphaScale, 1);
            if (alpha < 0.03) continue;

            ctx.beginPath();
            ctx.arc(d.x, d.y, d.size * breathe, 0, Math.PI * 2);
            ctx.fillStyle = `hsla(${d.h}, ${Math.max(d.s - 10, 25)}%, ${Math.min(d.l + 25, 92)}%, ${alpha})`;
            ctx.fill();
          }
        }
      }
    }

    // ── Cross-zone links (LOD 2+) ──
    if (lod.nodeFactor > 0 && allLinks) {
      ctx.globalAlpha = lod.nodeFactor * 0.6;
      for (const link of allLinks) {
        if (!link.isCrossZone && !link.isCoreLink && !link.isFrontierLink && !link.isExplorationLink) continue;
        const source = link.source;
        const target = link.target;
        if (!source || !target || source.x == null || target.x == null) continue;

        const isHighlighted = source === hoveredNode || target === hoveredNode ||
                              source === selectedNode || target === selectedNode;

        if (link.isExplorationLink) {
          // Animated dash for exploration links
          const dashOffset = (time * 0.015) % 16;
          ctx.beginPath();
          ctx.moveTo(source.x, source.y);
          ctx.lineTo(target.x, target.y);
          ctx.setLineDash([4, 4]);
          ctx.lineDashOffset = -dashOffset;
          ctx.strokeStyle = isHighlighted
            ? `hsla(${ZONE_COLORS.your_exploration.h}, 60%, 75%, 0.5)`
            : `hsla(${ZONE_COLORS.your_exploration.h}, 50%, 65%, 0.2)`;
          ctx.lineWidth = isHighlighted ? 1.5 : 0.8;
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.lineDashOffset = 0;
        } else {
          ctx.beginPath();
          ctx.moveTo(source.x, source.y);
          ctx.lineTo(target.x, target.y);
          ctx.strokeStyle = isHighlighted
            ? 'rgba(255, 230, 150, 0.4)'
            : `rgba(140, 160, 200, ${link.opacity || 0.1})`;
          ctx.lineWidth = isHighlighted ? 1.2 : 0.6;
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }

    // ── Intra-zone links (LOD 1 only) ──
    if (lod.detailFactor > 0 && allLinks) {
      ctx.globalAlpha = lod.detailFactor;
      for (const link of allLinks) {
        if (!link.isIntraZone) continue;
        const source = link.source;
        const target = link.target;
        if (!source || !target || source.x == null || target.x == null) continue;

        const isHighlighted = source === hoveredNode || target === hoveredNode ||
                              source === selectedNode || target === selectedNode;

        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.strokeStyle = isHighlighted
          ? GALAXY_COLORS.linkHighlight
          : `rgba(80, 100, 140, ${link.opacity || 0.06})`;
        ctx.lineWidth = isHighlighted ? 1.2 : 0.5;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // ── Nodes (LOD 2+) ──
    if (lod.nodeFactor > 0 && allNodes) {
      ctx.globalAlpha = lod.nodeFactor;
      for (const node of allNodes) {
        if (node.x == null || node.y == null) continue;
        if (!isVisible(node.x, node.y, (node.radius || 5) * 3, transform, w, h)) continue;

        const isActive = node === hoveredNode || node === selectedNode;
        drawCollisionNode(ctx, node, isActive, time);
      }
      ctx.globalAlpha = 1;
    }

    // ── Status glow on favorited/discovered nodes (LOD 2, fades as LOD 1 rings appear) ──
    if (lod.nodeFactor > 0 && lod.detailFactor < 1 && allNodes) {
      const glowAlpha = lod.nodeFactor * (1 - lod.detailFactor);
      if (glowAlpha > 0) {
        ctx.globalAlpha = glowAlpha;

        if (discoveredNames && discoveredNames.size > 0) {
          for (const node of allNodes) {
            if (node.x == null || !discoveredNames.has(node.name)) continue;
            if (!isVisible(node.x, node.y, (node.radius || 5) * 4, transform, w, h)) continue;
            const r = node.radius || 5;
            const glowR = r * 3.5;
            const glow = ctx.createRadialGradient(node.x, node.y, r * 0.5, node.x, node.y, glowR);
            glow.addColorStop(0, 'rgba(255, 200, 50, 0.5)');
            glow.addColorStop(0.4, 'rgba(255, 180, 0, 0.15)');
            glow.addColorStop(1, 'rgba(255, 150, 0, 0)');
            ctx.beginPath();
            ctx.arc(node.x, node.y, glowR, 0, Math.PI * 2);
            ctx.fillStyle = glow;
            ctx.fill();
          }
        }

        if (favoriteNames && favoriteNames.size > 0) {
          for (const node of allNodes) {
            if (node.x == null || !favoriteNames.has(node.name)) continue;
            if (!isVisible(node.x, node.y, (node.radius || 5) * 4, transform, w, h)) continue;
            const r = node.radius || 5;
            const glowR = r * 3.5;
            const glow = ctx.createRadialGradient(node.x, node.y, r * 0.5, node.x, node.y, glowR);
            glow.addColorStop(0, 'rgba(59, 130, 246, 0.5)');
            glow.addColorStop(0.4, 'rgba(30, 64, 175, 0.15)');
            glow.addColorStop(1, 'rgba(30, 58, 138, 0)');
            ctx.beginPath();
            ctx.arc(node.x, node.y, glowR, 0, Math.PI * 2);
            ctx.fillStyle = glow;
            ctx.fill();
          }
        }
      }
      ctx.globalAlpha = 1;
    }

    // ── Status indicators (LOD 1 — full detail rings) ──
    if (lod.detailFactor > 0 && allNodes) {
      ctx.globalAlpha = lod.detailFactor;

      const hasFavs = favoriteNames && favoriteNames.size > 0;
      const hasDislikes = dislikeNames && dislikeNames.size > 0;
      const hasDiscovered = discoveredNames && discoveredNames.size > 0;
      const angle = time * 0.001;

      for (const node of allNodes) {
        if (node.x == null) continue;

        // Discovered ring (gold swirl + sparkles)
        if (hasDiscovered && discoveredNames.has(node.name)) {
          const { x, y, radius } = node;

          // Pulsing outer glow
          const pulse = 0.7 + 0.3 * Math.sin(time * 0.002 + x * 0.01);
          const glowRadius = (radius + 8) * pulse + radius;
          const glow = ctx.createRadialGradient(x, y, radius, x, y, glowRadius);
          glow.addColorStop(0, `rgba(255, 200, 50, ${0.25 * pulse})`);
          glow.addColorStop(0.5, `rgba(255, 170, 0, ${0.1 * pulse})`);
          glow.addColorStop(1, 'rgba(255, 150, 0, 0)');
          ctx.beginPath();
          ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
          ctx.fillStyle = glow;
          ctx.fill();

          // Rotating gradient ring (swirl)
          const ringR = radius + 3;
          const gx = x + Math.cos(angle) * ringR;
          const gy = y + Math.sin(angle) * ringR;
          const gx2 = x + Math.cos(angle + Math.PI) * ringR;
          const gy2 = y + Math.sin(angle + Math.PI) * ringR;
          const ringGrad = ctx.createLinearGradient(gx, gy, gx2, gy2);
          ringGrad.addColorStop(0, 'rgba(255, 230, 100, 1)');
          ringGrad.addColorStop(0.25, 'rgba(255, 190, 0, 0.95)');
          ringGrad.addColorStop(0.5, 'rgba(255, 140, 0, 0.9)');
          ringGrad.addColorStop(0.75, 'rgba(255, 200, 50, 0.95)');
          ringGrad.addColorStop(1, 'rgba(255, 230, 100, 1)');
          ctx.beginPath();
          ctx.arc(x, y, ringR, 0, Math.PI * 2);
          ctx.strokeStyle = ringGrad;
          ctx.lineWidth = 2.5;
          ctx.stroke();

          // Orbiting sparkle particles
          for (let i = 0; i < 4; i++) {
            const sparkleAngle = angle * 1.5 + (Math.PI * 2 * i) / 4;
            const sparkleR = ringR + 1;
            const sx = x + Math.cos(sparkleAngle) * sparkleR;
            const sy = y + Math.sin(sparkleAngle) * sparkleR;
            const sparkleAlpha = 0.5 + 0.5 * Math.sin(time * 0.004 + i * 1.5);
            const sparkleSize = 1.2 + 0.6 * sparkleAlpha;

            ctx.save();
            ctx.translate(sx, sy);
            ctx.rotate(sparkleAngle);
            ctx.beginPath();
            ctx.moveTo(0, -sparkleSize * 2);
            ctx.lineTo(sparkleSize * 0.4, 0);
            ctx.lineTo(0, sparkleSize * 2);
            ctx.lineTo(-sparkleSize * 0.4, 0);
            ctx.closePath();
            ctx.fillStyle = `rgba(255, 240, 180, ${sparkleAlpha * 0.9})`;
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(-sparkleSize * 2, 0);
            ctx.lineTo(0, sparkleSize * 0.4);
            ctx.lineTo(sparkleSize * 2, 0);
            ctx.lineTo(0, -sparkleSize * 0.4);
            ctx.closePath();
            ctx.fillStyle = `rgba(255, 240, 180, ${sparkleAlpha * 0.7})`;
            ctx.fill();
            ctx.restore();
          }
          continue;
        }

        // Favorite ring (blue gradient)
        if (hasFavs && favoriteNames.has(node.name)) {
          const ringR = node.radius + 3;
          const grad = ctx.createLinearGradient(node.x - ringR, node.y - ringR, node.x + ringR, node.y + ringR);
          grad.addColorStop(0, 'rgba(30, 64, 175, 0.95)');
          grad.addColorStop(0.5, 'rgba(59, 130, 246, 0.95)');
          grad.addColorStop(1, 'rgba(30, 58, 138, 0.95)');
          ctx.beginPath();
          ctx.arc(node.x, node.y, ringR, 0, Math.PI * 2);
          ctx.strokeStyle = grad;
          ctx.lineWidth = 2.5;
          ctx.stroke();
          continue;
        }

        // Dislike ring (red dashed)
        if (hasDislikes && dislikeNames.has(node.name)) {
          const ringR = node.radius + 3;
          ctx.beginPath();
          ctx.arc(node.x, node.y, ringR, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
          continue;
        }
      }
      ctx.globalAlpha = 1;
    }

    // ── Node labels (LOD 2 selective, LOD 1 hovered/selected) ──
    if (lod.labelFactor > 0 && allNodes) {
      if (lod.detailFactor < 1) {
        // LOD 2: show top artist names per zone
        ctx.globalAlpha = lod.labelFactor * (1 - lod.detailFactor);
        for (const zm of zoneMetas) {
          for (const name of zm.labelNames) {
            const node = allNodes.find((n) => n.name === name && n.zone === zm.key);
            if (node && node.x != null) {
              drawNodeLabel(ctx, node);
            }
          }
        }
        ctx.globalAlpha = 1;
      }

      if (lod.detailFactor > 0) {
        ctx.globalAlpha = lod.detailFactor;
        if (hoveredNode && hoveredNode !== selectedNode && hoveredNode.x != null) {
          drawNodeLabel(ctx, hoveredNode);
        }
        if (selectedNode && selectedNode.x != null) {
          drawNodeLabel(ctx, selectedNode);
        }
        ctx.globalAlpha = 1;
      }
    }

    ctx.restore();
    ctx.restore();

    frameId = requestAnimationFrame(render);
  }

  return {
    start() {
      if (frameId) return;
      lastFrameTime = performance.now();
      frameId = requestAnimationFrame(render);
    },
    stop() {
      if (frameId) {
        cancelAnimationFrame(frameId);
        frameId = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    },
  };
}

// ─── Node drawing ─────────────────────────────────────────────────

function drawCollisionNode(ctx, node, isActive, time) {
  const { x, y, radius, color, glowColor, zone, zoneColor } = node;

  // Glow
  const glowRadius = radius * (node.type === 'seed' ? 3 : 2.5);
  const glow = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);

  if (zone === 'core_overlap') {
    // Bright gold glow for core
    glow.addColorStop(0, 'rgba(255, 215, 0, 0.5)');
    glow.addColorStop(0.3, 'rgba(255, 215, 0, 0.15)');
    glow.addColorStop(1, 'rgba(255, 215, 0, 0)');
  } else {
    glow.addColorStop(0, glowColor || 'rgba(100, 150, 255, 0.2)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  }
  ctx.beginPath();
  ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
  ctx.fillStyle = glow;
  ctx.fill();

  // Node body
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  if (zone === 'core_overlap') {
    ctx.fillStyle = '#FFD700';
  } else {
    ctx.fillStyle = color || 'rgba(100, 150, 255, 0.8)';
  }
  ctx.fill();

  // Core highlight
  if (zone === 'core_overlap' || (node.brightness || 0) > 0.7) {
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = zone === 'core_overlap' ? '#FFFBE6' : `rgba(255, 255, 255, ${((node.brightness || 0) - 0.7) * 2})`;
    ctx.fill();
  }

  // Zone ring indicator
  if (zoneColor && zone !== 'core_overlap') {
    const ringR = radius + 2.5;
    const pulse = 0.7 + 0.15 * Math.sin(time * 0.0015 + y * 0.04);
    ctx.beginPath();
    ctx.arc(x, y, ringR, 0, Math.PI * 2);
    ctx.strokeStyle = `hsla(${zoneColor.h}, ${zoneColor.s}%, ${zoneColor.l}%, ${0.4 * pulse})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Active ring
  if (isActive) {
    ctx.beginPath();
    ctx.arc(x, y, radius + 5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function drawNodeLabel(ctx, node) {
  if (!node || node.x == null) return;

  const label = node.name;
  ctx.font = "11px Inter, sans-serif";
  const metrics = ctx.measureText(label);
  const padding = 6;
  const labelW = metrics.width + padding * 2;
  const labelH = 20;
  const labelX = node.x - labelW / 2;
  const labelY = node.y - node.radius - labelH - 6;

  ctx.fillStyle = 'rgba(10, 10, 30, 0.85)';
  ctx.beginPath();
  roundRect(ctx, labelX, labelY, labelW, labelH, 4);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 0.5;
  ctx.stroke();

  ctx.fillStyle = '#e8e8f0';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, node.x, labelY + labelH / 2);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}
