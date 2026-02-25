/**
 * Overview renderer for the My Universe view.
 * Renders a supercluster visualization: dense star fields, bright core
 * galaxies, cosmic filaments between clusters, and cluster labels.
 */

// Deterministic pseudo-random from a numeric seed
function seededRandom(seed) {
  const h = Math.sin(seed) * 43758.5453;
  return h - Math.floor(h);
}

// Cluster visual radius (used for hit testing, labels, camera fitting)
export function clusterVisualRadius(center) {
  return 60 + center.memberCount * 10 + (center.recCount || 0) * 3;
}

export function createUniverseRenderer(canvas, getState) {
  const ctx = canvas.getContext('2d');
  let frameId = null;
  const startTime = performance.now();

  // World-space particle starfield (background stars)
  const particles = [];
  for (let i = 0; i < 400; i++) {
    particles.push({
      x: Math.random() * 5000 - 500,
      y: Math.random() * 5000 - 500,
      size: 0.2 + Math.random() * 1.0,
      baseAlpha: 0.03 + Math.random() * 0.18,
      phase: Math.random() * Math.PI * 2,
      speed: 0.0004 + Math.random() * 0.0014,
    });
  }

  // Pre-generated galaxy dots cache (deterministic per cluster layout)
  let cachedGalaxies = null;
  let cachedCentersKey = null;

  function buildGalaxyDots(clusterCenters) {
    const key = clusterCenters.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)},${c.memberCount},${c.recCount || 0}`).join('|');
    if (cachedCentersKey === key && cachedGalaxies) return cachedGalaxies;

    cachedCentersKey = key;
    const clusters = [];

    for (let ci = 0; ci < clusterCenters.length; ci++) {
      const center = clusterCenters[ci];
      const { h: ch, s, l } = center.color;
      const memberCount = center.memberCount;
      const recCount = center.recCount || 0;
      const baseR = clusterVisualRadius(center);

      const dots = [];
      const galaxyCount = 50 + memberCount * 12 + recCount * 4;
      const seed = center.x * 1000 + center.y * 7 + ci * 333;

      // Galaxy dot field — denser toward center
      for (let i = 0; i < galaxyCount; i++) {
        const r1 = seededRandom(seed + i * 12.9898);
        const r2 = seededRandom(seed + i * 78.233 + 1.0);
        const r3 = seededRandom(seed + i * 45.164 + 2.0);
        const r4 = seededRandom(seed + i * 93.989 + 3.0);

        // Product of uniforms → peaked near 0 (dense core)
        const angle = r1 * Math.PI * 2;
        const radialT = r2 * r3;
        const dist = radialT * baseR * 1.4;

        const gx = center.x + dist * Math.cos(angle);
        const gy = center.y + dist * Math.sin(angle);

        const centerDist = dist / baseR;
        const baseBrightness = Math.max(0.12, 1 - centerDist * 0.65);
        const size = (0.4 + r4 * 2.0) * Math.max(0.25, 1 - centerDist * 0.5);

        dots.push({
          x: gx, y: gy, size, baseBrightness,
          phase: r1 * Math.PI * 2,
          speed: 0.0008 + r3 * 0.002,
          h: ch, s, l,
        });
      }

      // Bright core galaxies (BCGs) — eye-catching focal points
      const bcgCount = 3 + Math.floor(memberCount * 0.7);
      for (let i = 0; i < bcgCount; i++) {
        const r1 = seededRandom(seed + i * 33.33 + 100);
        const r2 = seededRandom(seed + i * 77.77 + 200);
        const r3 = seededRandom(seed + i * 55.55 + 300);

        const angle = r1 * Math.PI * 2;
        const dist = r2 * baseR * 0.45;

        dots.push({
          x: center.x + dist * Math.cos(angle),
          y: center.y + dist * Math.sin(angle),
          size: 2.5 + r1 * 3,
          baseBrightness: 0.75 + r3 * 0.25,
          phase: r1 * Math.PI * 2,
          speed: 0.0005 + r2 * 0.001,
          h: ch, s, l,
          isBCG: true,
          glowSize: 7 + r1 * 7,
        });
      }

      clusters.push({ dots, center, baseR });
    }

    // Auto-filaments between all nearby cluster pairs (cosmic web)
    const filaments = [];
    for (let i = 0; i < clusterCenters.length; i++) {
      for (let j = i + 1; j < clusterCenters.length; j++) {
        const ci = clusterCenters[i];
        const cj = clusterCenters[j];
        const dx = cj.x - ci.x;
        const dy = cj.y - ci.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        const ri = clusterVisualRadius(ci);
        const rj = clusterVisualRadius(cj);
        // Connect clusters within 3× combined radii (generous for continuity)
        if (dist > (ri + rj) * 3) continue;

        const filDots = [];
        const dotCount = Math.floor(dist / 9);
        const seed = ci.x * 100 + cj.y * 7 + i * 50;

        for (let k = 0; k < dotCount; k++) {
          const t = (k + 0.5) / dotCount;
          const noise = (seededRandom(seed + k * 12.9898) - 0.5) * 20;
          const noiseY = (seededRandom(seed + k * 45.164 + 5) - 0.5) * 8;

          filDots.push({
            x: ci.x + dx * t + (-dy / dist) * noise,
            y: ci.y + dy * t + (dx / dist) * noise + noiseY,
            size: 0.3 + seededRandom(seed + k * 78.233) * 0.9,
            t,
            // Blend colors from cluster i to cluster j
            h: ci.color.h + (cj.color.h - ci.color.h) * t,
            phase: seededRandom(seed + k * 93.989) * Math.PI * 2,
          });
        }

        // Proximity-based opacity — closer clusters have denser filaments
        const maxDist = (ri + rj) * 3;
        const proximity = 1 - dist / maxDist;
        filaments.push({ dots: filDots, proximity });
      }
    }

    clusters.filaments = filaments;
    cachedGalaxies = clusters;
    return clusters;
  }

  function render() {
    const state = getState();
    if (!state) {
      frameId = requestAnimationFrame(render);
      return;
    }

    const { clusterCenters, bridgeLinks, transform, hoveredClusterId } = state;
    const time = performance.now() - startTime;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    const scale = transform.scale;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Apply overview opacity for cross-fade transitions
    const overviewOpacity = state.overviewOpacity != null ? state.overviewOpacity : 1;
    ctx.globalAlpha = overviewOpacity;

    // --- Background gradient ---
    const maxDim = Math.max(w, h);
    const bg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, maxDim * 0.7);
    bg.addColorStop(0, 'rgba(10, 10, 32, 1)');
    bg.addColorStop(1, 'rgba(4, 4, 12, 1)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // --- World-space rendering ---
    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(scale, scale);

    // Background starfield
    for (const p of particles) {
      const twinkle = p.baseAlpha + 0.08 * Math.sin(time * p.speed + p.phase);
      if (twinkle <= 0) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(180, 195, 225, ${twinkle})`;
      ctx.fill();
    }

    // Supercluster rendering
    if (clusterCenters && clusterCenters.length > 0) {
      const galaxies = buildGalaxyDots(clusterCenters);

      // --- Cosmic filaments (auto-generated between nearby clusters) ---
      if (galaxies.filaments) {
        for (const fil of galaxies.filaments) {
          for (const d of fil.dots) {
            const midDist = Math.abs(d.t - 0.5) * 2;
            const twinkle = 0.5 + 0.5 * Math.sin(time * 0.001 + d.phase);
            const alpha = (0.06 + midDist * 0.14) * twinkle * (0.3 + fil.proximity * 0.7);

            ctx.beginPath();
            ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
            ctx.fillStyle = `hsla(${d.h}, 25%, 68%, ${alpha})`;
            ctx.fill();
          }
        }
      }

      // --- Bridge filaments (stronger than auto-filaments) ---
      if (bridgeLinks && bridgeLinks.length > 0) {
        for (const link of bridgeLinks) {
          const dx = link.to.x - link.from.x;
          const dy = link.to.y - link.from.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 1) continue;
          const dotCount = Math.floor(dist / 7);
          const seed = link.from.x * 100 + link.to.y;

          for (let k = 0; k < dotCount; k++) {
            const t = (k + 0.5) / dotCount;
            const noise = (seededRandom(seed + k * 12.9898) - 0.5) * 14;
            const fx = link.from.x + dx * t + (-dy / dist) * noise;
            const fy = link.from.y + dy * t + (dx / dist) * noise;
            const midDist = Math.abs(t - 0.5) * 2;
            const twinkle = 0.6 + 0.4 * Math.sin(time * 0.0012 + k * 0.5);
            const alpha = (0.10 + link.strength * 0.20 + midDist * 0.12) * twinkle;
            const size = 0.4 + (1 - Math.abs(t - 0.5) * 2) * 0.6;

            ctx.beginPath();
            ctx.arc(fx, fy, size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(120, 195, 210, ${alpha})`;
            ctx.fill();
          }
        }
      }

      // --- Cluster galaxy fields ---
      for (let ci = 0; ci < galaxies.length; ci++) {
        const { dots, center, baseR } = galaxies[ci];
        const isHovered = hoveredClusterId === ci;
        const hoverBoost = isHovered ? 1.4 : 1;
        const breathe = 1 + 0.015 * Math.sin(time * 0.0004 + center.x * 0.008);

        // Subtle core haze (much lighter than old nebula)
        const hazeR = baseR * 1.1 * breathe;
        const haze = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, hazeR);
        haze.addColorStop(0, `hsla(${center.color.h}, ${center.color.s}%, ${center.color.l}%, ${0.05 * hoverBoost})`);
        haze.addColorStop(0.35, `hsla(${center.color.h}, ${center.color.s}%, ${center.color.l}%, ${0.025 * hoverBoost})`);
        haze.addColorStop(1, `hsla(${center.color.h}, ${center.color.s}%, ${center.color.l}%, 0)`);
        ctx.beginPath();
        ctx.arc(center.x, center.y, hazeR, 0, Math.PI * 2);
        ctx.fillStyle = haze;
        ctx.fill();

        // Galaxy dots
        for (const d of dots) {
          if (d.isBCG) {
            // Bright core galaxy with glow
            const twinkle = 0.82 + 0.18 * Math.sin(time * d.speed + d.phase);
            const alpha = d.baseBrightness * twinkle * hoverBoost;

            const glow = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.glowSize * breathe);
            glow.addColorStop(0, `hsla(${d.h}, ${d.s}%, ${Math.min(d.l + 35, 97)}%, ${alpha * 0.6})`);
            glow.addColorStop(0.3, `hsla(${d.h}, ${d.s}%, ${Math.min(d.l + 20, 85)}%, ${alpha * 0.2})`);
            glow.addColorStop(1, `hsla(${d.h}, ${d.s}%, ${d.l}%, 0)`);
            ctx.beginPath();
            ctx.arc(d.x, d.y, d.glowSize * breathe, 0, Math.PI * 2);
            ctx.fillStyle = glow;
            ctx.fill();

            // Bright core dot
            ctx.beginPath();
            ctx.arc(d.x, d.y, d.size * 0.6, 0, Math.PI * 2);
            ctx.fillStyle = `hsla(${d.h}, ${Math.max(d.s - 15, 20)}%, ${Math.min(d.l + 35, 98)}%, ${alpha})`;
            ctx.fill();
          } else {
            // Regular galaxy dot
            const twinkle = 0.7 + 0.3 * Math.sin(time * d.speed + d.phase);
            const alpha = d.baseBrightness * twinkle * hoverBoost;

            ctx.beginPath();
            ctx.arc(d.x, d.y, d.size * breathe, 0, Math.PI * 2);
            ctx.fillStyle = `hsla(${d.h}, ${Math.max(d.s - 10, 25)}%, ${Math.min(d.l + 25, 92)}%, ${alpha})`;
            ctx.fill();
          }
        }
      }

      // Cluster labels
      drawClusterLabels(ctx, clusterCenters, scale, hoveredClusterId);
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

/**
 * Hit-test cluster centers. Returns the index of the nearest cluster
 * whose center is within its visual radius, or -1 if none.
 */
export function hitTestCluster(graphX, graphY, clusterCenters) {
  if (!clusterCenters) return -1;

  let closestIdx = -1;
  let closestDist = Infinity;

  for (let i = 0; i < clusterCenters.length; i++) {
    const center = clusterCenters[i];
    const dx = graphX - center.x;
    const dy = graphY - center.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const hitRadius = clusterVisualRadius(center);

    if (dist < hitRadius && dist < closestDist) {
      closestIdx = i;
      closestDist = dist;
    }
  }

  return closestIdx;
}

// --- Cluster labels ---

function drawClusterLabels(ctx, clusterCenters, scale, hoveredClusterId) {
  const fontSize = Math.max(9, Math.min(18, 15 / scale * 1.5));
  ctx.font = `700 ${fontSize}px 'Space Grotesk', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < clusterCenters.length; i++) {
    const center = clusterCenters[i];
    const { h: ch, s, l } = center.color;
    const r = clusterVisualRadius(center);
    const labelY = center.y - r - 12;
    const isHovered = hoveredClusterId === i;

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillText(center.label, center.x + 0.5, labelY + 0.5);
    // Text (bright, cluster-colored — brighter when hovered)
    const textL = isHovered ? Math.min(l + 35, 95) : Math.min(l + 25, 90);
    const textAlpha = isHovered ? 1.0 : 0.85;
    ctx.fillStyle = `hsla(${ch}, ${Math.max(s - 10, 30)}%, ${textL}%, ${textAlpha})`;
    ctx.fillText(center.label, center.x, labelY);

    // Member count below label
    const countFontSize = Math.max(6, Math.min(12, 10 / scale * 1.2));
    ctx.font = `500 ${countFontSize}px 'Space Grotesk', sans-serif`;
    ctx.fillStyle = `hsla(${ch}, ${Math.max(s - 15, 25)}%, ${Math.min(l + 15, 80)}%, 0.55)`;
    ctx.fillText(`${center.memberCount} artists`, center.x, labelY + fontSize + 4);

    // Restore font for next iteration
    ctx.font = `700 ${fontSize}px 'Space Grotesk', sans-serif`;
  }
}
