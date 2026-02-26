/**
 * Unified universe renderer with 3 levels of detail (LOD).
 *
 * LOD 1 (scale < 0.35):  Supercluster overview — vibrant nebulae, cluster labels, nuclei
 * LOD 2 (0.35 – 0.9):   Mid detail — nodes visible, selective artist labels
 * LOD 3 (scale >= 0.9):  Full galaxy detail — links, full nodes, indicators, labels
 */

import { GALAXY_COLORS } from '../utils/constants';

// ─── Deterministic random ──────────────────────────────────────────────
function seededRandom(seed) {
  const h = Math.sin(seed) * 43758.5453;
  return h - Math.floor(h);
}

// ─── LOD interpolation helpers ─────────────────────────────────────────
function clamp01(v) { return Math.max(0, Math.min(1, v)); }

function getLODFactors(scale) {
  const labelFactor = clamp01((scale - 0.35) / 0.1);
  const detailFactor = clamp01((scale - 0.9) / 0.2);
  const nodeFactor = clamp01((scale - 0.25) / 0.15);
  const hazeFactor = 1 - clamp01((scale - 0.6) / 0.4);
  // Extra-bright boost for the farthest-out overview (< 0.35)
  const overviewBoost = 1 - clamp01((scale - 0.15) / 0.25);

  return { labelFactor, detailFactor, nodeFactor, hazeFactor, overviewBoost };
}

// ─── Starfield (world-space background) ────────────────────────────────
function generateStars(worldBounds, count) {
  const pad = 200;
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

// ─── Cluster haze cache ────────────────────────────────────────────────
function buildClusterHazes(clusterMetas) {
  return clusterMetas.map((cm) => {
    const seed = cm.cx * 1000 + cm.cy * 7 + cm.index * 333;
    const dots = [];
    // Denser particle field for richer nebulae
    const dotCount = 60 + cm.memberCount * 12 + (cm.recCount || 0) * 5;
    const baseR = cm.visualRadius * 1.3;

    for (let i = 0; i < dotCount; i++) {
      const r1 = seededRandom(seed + i * 12.9898);
      const r2 = seededRandom(seed + i * 78.233 + 1.0);
      const r3 = seededRandom(seed + i * 45.164 + 2.0);
      const r4 = seededRandom(seed + i * 93.989 + 3.0);

      const angle = r1 * Math.PI * 2;
      // Concentrate more particles toward center for galaxy-like density falloff
      const radialT = r2 * r2 * r3;
      const dist = radialT * baseR;

      dots.push({
        x: cm.cx + dist * Math.cos(angle),
        y: cm.cy + dist * Math.sin(angle),
        size: (0.5 + r4 * 2.5) * Math.max(0.3, 1 - (dist / baseR) * 0.4),
        baseBrightness: Math.max(0.2, 1 - (dist / baseR) * 0.55),
        phase: r1 * Math.PI * 2,
        speed: 0.0008 + r3 * 0.002,
        h: cm.color.h + (r4 - 0.5) * 15, // slight hue variation
        s: cm.color.s,
        l: cm.color.l,
      });
    }

    // More BCGs (Brightest Cluster Galaxies) for visible bright spots
    const bcgCount = 5 + Math.floor(cm.memberCount * 0.8);
    for (let i = 0; i < bcgCount; i++) {
      const r1 = seededRandom(seed + i * 33.33 + 100);
      const r2 = seededRandom(seed + i * 77.77 + 200);
      const r3 = seededRandom(seed + i * 55.55 + 300);
      const angle = r1 * Math.PI * 2;
      const dist = r2 * r2 * baseR * 0.5;

      dots.push({
        x: cm.cx + dist * Math.cos(angle),
        y: cm.cy + dist * Math.sin(angle),
        size: 3 + r1 * 4,
        baseBrightness: 0.8 + r3 * 0.2,
        phase: r1 * Math.PI * 2,
        speed: 0.0005 + r2 * 0.001,
        h: cm.color.h, s: cm.color.s, l: cm.color.l,
        isBCG: true,
        glowSize: 10 + r1 * 12,
      });
    }

    return { dots, cm, baseR };
  });
}

// ─── Cosmic filaments between nearby clusters ──────────────────────────
function buildFilaments(clusterMetas) {
  const filaments = [];
  for (let i = 0; i < clusterMetas.length; i++) {
    for (let j = i + 1; j < clusterMetas.length; j++) {
      const ci = clusterMetas[i];
      const cj = clusterMetas[j];
      const dx = cj.cx - ci.cx;
      const dy = cj.cy - ci.cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const ri = ci.visualRadius;
      const rj = cj.visualRadius;

      if (dist > (ri + rj) * 4) continue;

      const filDots = [];
      const dotCount = Math.floor(dist / 8);
      const seed = ci.cx * 100 + cj.cy * 7 + i * 50;

      for (let k = 0; k < dotCount; k++) {
        const t = (k + 0.5) / dotCount;
        const noise = (seededRandom(seed + k * 12.9898) - 0.5) * 25;
        const noiseY = (seededRandom(seed + k * 45.164 + 5) - 0.5) * 10;

        filDots.push({
          x: ci.cx + dx * t + (-dy / dist) * noise,
          y: ci.cy + dy * t + (dx / dist) * noise + noiseY,
          size: 0.4 + seededRandom(seed + k * 78.233) * 1.2,
          t,
          h: ci.color.h + (cj.color.h - ci.color.h) * t,
          phase: seededRandom(seed + k * 93.989) * Math.PI * 2,
        });
      }

      const maxDist = (ri + rj) * 4;
      const proximity = 1 - dist / maxDist;
      filaments.push({ dots: filDots, proximity });
    }
  }
  return filaments;
}

// ─── Main renderer factory ─────────────────────────────────────────────

export function createUniverseRenderer(canvas, getState) {
  const ctx = canvas.getContext('2d');
  let frameId = null;
  const startTime = performance.now();

  let stars = null;
  let hazes = null;
  let filaments = null;
  let lastMetasKey = null;

  function ensureCaches(clusterMetas, worldBounds) {
    const key = clusterMetas.map((c) => `${c.cx},${c.cy},${c.totalCount}`).join('|');
    if (key === lastMetasKey) return;
    lastMetasKey = key;
    stars = generateStars(worldBounds, 500);
    hazes = buildClusterHazes(clusterMetas);
    filaments = buildFilaments(clusterMetas);
  }

  function isVisible(wx, wy, radius, transform, vw, vh) {
    const sx = wx * transform.scale + transform.x;
    const sy = wy * transform.scale + transform.y;
    const sr = radius * transform.scale;
    return sx + sr > -50 && sx - sr < vw + 50 && sy + sr > -50 && sy - sr < vh + 50;
  }

  function render() {
    const state = getState();
    if (!state || !state.clusterMetas || state.clusterMetas.length === 0) {
      frameId = requestAnimationFrame(render);
      return;
    }

    const { clusterMetas, allNodes, allLinks, transform, worldBounds,
            hoveredNode, selectedNode, favoriteNames, dislikeNames, discoveredNames } = state;
    const time = performance.now() - startTime;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    const scale = transform.scale;
    const lod = getLODFactors(scale);

    ensureCaches(clusterMetas, worldBounds);

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Background gradient
    const maxDim = Math.max(w, h);
    const bg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, maxDim * 0.7);
    bg.addColorStop(0, GALAXY_COLORS.backgroundGradientInner);
    bg.addColorStop(1, GALAXY_COLORS.backgroundGradientOuter);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // World-space rendering
    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(scale, scale);

    // --- Starfield ---
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

    // --- Cosmic filaments ---
    if (filaments && lod.hazeFactor > 0) {
      const filAlpha = lod.hazeFactor * (1 + lod.overviewBoost * 0.5);
      ctx.globalAlpha = Math.min(filAlpha, 1);
      for (const fil of filaments) {
        for (const d of fil.dots) {
          const midDist = Math.abs(d.t - 0.5) * 2;
          const twinkle = 0.5 + 0.5 * Math.sin(time * 0.001 + d.phase);
          const alpha = (0.1 + midDist * 0.2) * twinkle * (0.3 + fil.proximity * 0.7);
          ctx.beginPath();
          ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${d.h}, 30%, 72%, ${alpha})`;
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }

    // --- Cluster hazes ---
    if (hazes) {
      // Brightness increases at farther zoom-out for dramatic overview
      const brightnessBoost = 1 + lod.overviewBoost * 1.5;

      for (const { dots, cm, baseR } of hazes) {
        if (!isVisible(cm.cx, cm.cy, baseR * 2, transform, w, h)) continue;

        const breathe = 1 + 0.025 * Math.sin(time * 0.0004 + cm.cx * 0.008);
        const { h: ch, s: cs, l: cl } = cm.color;

        // --- Multi-layer nebula gradients (visible when hazeFactor > 0) ---
        if (lod.hazeFactor > 0) {
          ctx.globalAlpha = lod.hazeFactor;

          // Outer diffuse halo — large, very soft
          const outerR = baseR * 1.6 * breathe;
          const outer = ctx.createRadialGradient(cm.cx, cm.cy, 0, cm.cx, cm.cy, outerR);
          const outerAlpha = 0.08 * brightnessBoost;
          outer.addColorStop(0, `hsla(${ch}, ${cs}%, ${cl}%, ${Math.min(outerAlpha, 0.25)})`);
          outer.addColorStop(0.4, `hsla(${ch}, ${cs}%, ${cl}%, ${Math.min(outerAlpha * 0.5, 0.15)})`);
          outer.addColorStop(1, `hsla(${ch}, ${cs}%, ${cl}%, 0)`);
          ctx.beginPath();
          ctx.arc(cm.cx, cm.cy, outerR, 0, Math.PI * 2);
          ctx.fillStyle = outer;
          ctx.fill();

          // Mid nebula — color-rich, medium radius
          const midR = baseR * 1.0 * breathe;
          const mid = ctx.createRadialGradient(cm.cx, cm.cy, 0, cm.cx, cm.cy, midR);
          const midAlpha = 0.12 * brightnessBoost;
          mid.addColorStop(0, `hsla(${ch}, ${Math.min(cs + 15, 95)}%, ${Math.min(cl + 10, 80)}%, ${Math.min(midAlpha, 0.35)})`);
          mid.addColorStop(0.5, `hsla(${ch}, ${cs}%, ${cl}%, ${Math.min(midAlpha * 0.4, 0.15)})`);
          mid.addColorStop(1, `hsla(${ch}, ${cs}%, ${cl}%, 0)`);
          ctx.beginPath();
          ctx.arc(cm.cx, cm.cy, midR, 0, Math.PI * 2);
          ctx.fillStyle = mid;
          ctx.fill();

          // Core glow — subtle, soft
          const coreR = baseR * 0.3 * breathe;
          const core = ctx.createRadialGradient(cm.cx, cm.cy, 0, cm.cx, cm.cy, coreR);
          const coreAlpha = 0.1 * brightnessBoost;
          core.addColorStop(0, `hsla(${ch}, ${Math.min(cs + 15, 95)}%, ${Math.min(cl + 15, 85)}%, ${Math.min(coreAlpha, 0.25)})`);
          core.addColorStop(0.4, `hsla(${ch}, ${Math.min(cs + 5, 85)}%, ${Math.min(cl + 8, 78)}%, ${Math.min(coreAlpha * 0.4, 0.12)})`);
          core.addColorStop(1, `hsla(${ch}, ${cs}%, ${cl}%, 0)`);
          ctx.beginPath();
          ctx.arc(cm.cx, cm.cy, coreR, 0, Math.PI * 2);
          ctx.fillStyle = core;
          ctx.fill();

          ctx.globalAlpha = 1;
        }

        // --- Nucleus point — subtle center glow ---
        if (lod.hazeFactor > 0) {
          const nucleusPulse = 0.9 + 0.1 * Math.sin(time * 0.0006 + cm.cy * 0.01);
          const nucleusR = Math.max(3, baseR * 0.04) * nucleusPulse;
          const nucleusAlpha = (0.3 + lod.overviewBoost * 0.2) * lod.hazeFactor;

          const nGlow = ctx.createRadialGradient(cm.cx, cm.cy, 0, cm.cx, cm.cy, nucleusR * 3);
          nGlow.addColorStop(0, `hsla(${ch}, ${Math.min(cs + 10, 95)}%, ${Math.min(cl + 20, 90)}%, ${nucleusAlpha * 0.5})`);
          nGlow.addColorStop(0.4, `hsla(${ch}, ${cs}%, ${Math.min(cl + 10, 80)}%, ${nucleusAlpha * 0.15})`);
          nGlow.addColorStop(1, `hsla(${ch}, ${cs}%, ${cl}%, 0)`);
          ctx.beginPath();
          ctx.arc(cm.cx, cm.cy, nucleusR * 3, 0, Math.PI * 2);
          ctx.fillStyle = nGlow;
          ctx.fill();

          // Soft center point
          ctx.beginPath();
          ctx.arc(cm.cx, cm.cy, nucleusR, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${ch}, 30%, 88%, ${nucleusAlpha * 0.7})`;
          ctx.fill();
        }

        // --- Particle dots ---
        const dotAlphaScale = (0.5 + lod.hazeFactor * 0.5) * brightnessBoost;
        for (const d of dots) {
          if (d.isBCG) {
            const twinkle = 0.82 + 0.18 * Math.sin(time * d.speed + d.phase);
            const alpha = Math.min(d.baseBrightness * twinkle * dotAlphaScale, 1);
            if (alpha < 0.03) continue;

            const glow = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.glowSize * breathe);
            glow.addColorStop(0, `hsla(${d.h}, ${d.s}%, ${Math.min(d.l + 35, 97)}%, ${Math.min(alpha * 0.7, 0.9)})`);
            glow.addColorStop(0.3, `hsla(${d.h}, ${d.s}%, ${Math.min(d.l + 20, 85)}%, ${Math.min(alpha * 0.25, 0.5)})`);
            glow.addColorStop(1, `hsla(${d.h}, ${d.s}%, ${d.l}%, 0)`);
            ctx.beginPath();
            ctx.arc(d.x, d.y, d.glowSize * breathe, 0, Math.PI * 2);
            ctx.fillStyle = glow;
            ctx.fill();

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

    // --- Links (LOD 3 only) ---
    if (lod.detailFactor > 0 && allLinks) {
      ctx.globalAlpha = lod.detailFactor;
      for (const link of allLinks) {
        const source = link.source;
        const target = link.target;
        if (!source || !target || source.x == null || target.x == null) continue;

        const isHighlighted = source === hoveredNode || target === hoveredNode ||
                              source === selectedNode || target === selectedNode;

        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);

        if (isHighlighted) {
          ctx.setLineDash([]);
          ctx.strokeStyle = GALAXY_COLORS.linkHighlight;
          ctx.lineWidth = 1.2;
        } else {
          ctx.setLineDash([]);
          ctx.strokeStyle = `rgba(80, 100, 140, ${link.opacity || 0.06})`;
          ctx.lineWidth = 0.5;
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.globalAlpha = 1;
    }

    // --- Nodes (LOD 2+) ---
    if (lod.nodeFactor > 0 && allNodes) {
      ctx.globalAlpha = lod.nodeFactor;
      for (const node of allNodes) {
        if (node.x == null || node.y == null) continue;
        if (!isVisible(node.x, node.y, (node.radius || 5) * 3, transform, w, h)) continue;

        const isActive = node === hoveredNode || node === selectedNode;

        if (node.type === 'seed') {
          drawSeedNode(ctx, node, isActive);
        } else {
          drawRecNode(ctx, node, isActive);
        }
      }
      ctx.globalAlpha = 1;
    }

    // --- Indicators (LOD 3 only) ---
    if (lod.detailFactor > 0 && allNodes) {
      ctx.globalAlpha = lod.detailFactor;

      if (discoveredNames && discoveredNames.size > 0) {
        for (const node of allNodes) {
          if (node.x == null || !discoveredNames.has(node.name)) continue;
          const ringR = node.radius + 3;
          const grad = ctx.createLinearGradient(node.x - ringR, node.y - ringR, node.x + ringR, node.y + ringR);
          grad.addColorStop(0, 'rgba(255, 215, 0, 0.9)');
          grad.addColorStop(0.5, 'rgba(255, 190, 0, 0.95)');
          grad.addColorStop(1, 'rgba(218, 165, 32, 0.9)');
          ctx.beginPath();
          ctx.arc(node.x, node.y, ringR, 0, Math.PI * 2);
          ctx.strokeStyle = grad;
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }
      }

      if (favoriteNames && favoriteNames.size > 0) {
        for (const node of allNodes) {
          if (node.x == null || !favoriteNames.has(node.name)) continue;
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
        }
      }

      if (dislikeNames && dislikeNames.size > 0) {
        for (const node of allNodes) {
          if (node.x == null || !dislikeNames.has(node.name)) continue;
          const ringR = node.radius + 3;
          ctx.beginPath();
          ctx.arc(node.x, node.y, ringR, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      ctx.globalAlpha = 1;
    }

    // --- Node labels (LOD 2: selective, LOD 3: hovered/selected) ---
    if (lod.labelFactor > 0 && allNodes) {
      if (lod.detailFactor < 1) {
        ctx.globalAlpha = lod.labelFactor * (1 - lod.detailFactor);
        for (const cm of clusterMetas) {
          for (const name of cm.labelNames) {
            const node = allNodes.find((n) => n.name === name && n.clusterId === cm.index);
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
      frameId = requestAnimationFrame(render);
    },
    stop() {
      if (frameId) {
        cancelAnimationFrame(frameId);
        frameId = null;
      }
    },
  };
}

// ─── Node drawing ──────────────────────────────────────────────────────

function drawSeedNode(ctx, node, isActive) {
  const { x, y, radius } = node;

  const glowRadius = radius * 3;
  const glow = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
  glow.addColorStop(0, 'rgba(255, 215, 0, 0.6)');
  glow.addColorStop(0.3, 'rgba(255, 215, 0, 0.2)');
  glow.addColorStop(0.7, 'rgba(255, 215, 0, 0.05)');
  glow.addColorStop(1, 'rgba(255, 215, 0, 0)');
  ctx.beginPath();
  ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
  ctx.fillStyle = glow;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = '#FFD700';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x, y, radius * 0.5, 0, Math.PI * 2);
  ctx.fillStyle = '#FFFBE6';
  ctx.fill();

  if (isActive) {
    ctx.beginPath();
    ctx.arc(x, y, radius + 5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function drawRecNode(ctx, node, isActive) {
  const { x, y, radius, color, glowColor, brightness } = node;

  const glowRadius = radius * 2.5;
  const glow = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
  glow.addColorStop(0, glowColor || 'rgba(100, 150, 255, 0.2)');
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.beginPath();
  ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
  ctx.fillStyle = glow;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color || 'rgba(100, 150, 255, 0.8)';
  ctx.fill();

  if ((brightness || 0) > 0.7) {
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${(brightness - 0.7) * 2})`;
    ctx.fill();
  }

  if (isActive) {
    ctx.beginPath();
    ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
    ctx.strokeStyle = GALAXY_COLORS.hoverRing;
    ctx.lineWidth = 1.2;
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

