/**
 * Overview renderer for the My Universe view.
 * Renders nebula clouds, particle starfield, bridge links, and cluster labels.
 * Individual nodes are NOT rendered in overview mode — they are shown
 * when a cluster is focused, using the full galaxy rendering pipeline.
 */

export function createUniverseRenderer(canvas, getState) {
  const ctx = canvas.getContext('2d');
  let frameId = null;
  const startTime = performance.now();

  // World-space particle starfield
  const particles = [];
  for (let i = 0; i < 300; i++) {
    particles.push({
      x: Math.random() * 5000 - 500,
      y: Math.random() * 5000 - 500,
      size: 0.3 + Math.random() * 1.3,
      baseAlpha: 0.05 + Math.random() * 0.28,
      phase: Math.random() * Math.PI * 2,
      speed: 0.0006 + Math.random() * 0.0018,
    });
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

    // --- Background gradient (galaxy-style) ---
    const maxDim = Math.max(w, h);
    const bg = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, maxDim * 0.7);
    bg.addColorStop(0, 'rgba(14, 14, 38, 1)');
    bg.addColorStop(1, 'rgba(5, 5, 14, 1)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // --- World-space rendering ---
    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(scale, scale);

    // Particles (twinkling starfield)
    for (const p of particles) {
      const twinkle = p.baseAlpha + 0.12 * Math.sin(time * p.speed + p.phase);
      if (twinkle <= 0) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(195, 205, 235, ${twinkle})`;
      ctx.fill();
    }

    // Nebulae (genre cluster clouds)
    if (clusterCenters) {
      for (let idx = 0; idx < clusterCenters.length; idx++) {
        const center = clusterCenters[idx];
        const isHovered = hoveredClusterId === idx;
        drawNebula(ctx, center, time, isHovered);
      }
    }

    // Bridge links between clusters
    if (bridgeLinks && bridgeLinks.length > 0) {
      ctx.setLineDash([6, 10]);
      for (const link of bridgeLinks) {
        ctx.beginPath();
        ctx.moveTo(link.from.x, link.from.y);
        ctx.lineTo(link.to.x, link.to.y);
        ctx.strokeStyle = `rgba(100, 220, 200, ${0.08 + link.strength * 0.14})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // Cluster labels (nebula names)
    if (clusterCenters) {
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
 * whose center is within its nebula radius, or -1 if none.
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
    const hitRadius = 80 + center.memberCount * 14 + (center.recCount || 0) * 6;

    if (dist < hitRadius && dist < closestDist) {
      closestIdx = i;
      closestDist = dist;
    }
  }

  return closestIdx;
}

// --- Nebula rendering (multi-layer genre cloud) ---

function drawNebula(ctx, center, time, isHovered) {
  const { h: ch, s, l } = center.color;
  const baseR = 80 + center.memberCount * 14 + (center.recCount || 0) * 6;
  const breathe = 1 + 0.025 * Math.sin(time * 0.0004 + center.x * 0.008);
  const r = baseR * breathe;

  // Hovered clusters glow brighter
  const hoverBoost = isHovered ? 1.4 : 1;

  // Layer 1: Large diffuse outer halo
  const outerR = r * 1.9;
  const g1 = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, outerR);
  g1.addColorStop(0, `hsla(${ch}, ${s}%, ${l}%, ${0.07 * hoverBoost})`);
  g1.addColorStop(0.3, `hsla(${ch}, ${s}%, ${l}%, ${0.04 * hoverBoost})`);
  g1.addColorStop(0.65, `hsla(${ch}, ${s}%, ${l}%, ${0.015 * hoverBoost})`);
  g1.addColorStop(1, `hsla(${ch}, ${s}%, ${l}%, 0)`);
  ctx.fillStyle = g1;
  ctx.beginPath();
  ctx.arc(center.x, center.y, outerR, 0, Math.PI * 2);
  ctx.fill();

  // Layer 2: Core nebula (brighter center)
  const g2 = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, r);
  g2.addColorStop(0, `hsla(${ch}, ${s}%, ${l}%, ${0.20 * hoverBoost})`);
  g2.addColorStop(0.3, `hsla(${ch}, ${s}%, ${l}%, ${0.12 * hoverBoost})`);
  g2.addColorStop(0.65, `hsla(${ch}, ${s}%, ${l}%, ${0.04 * hoverBoost})`);
  g2.addColorStop(1, `hsla(${ch}, ${s}%, ${l}%, 0)`);
  ctx.fillStyle = g2;
  ctx.beginPath();
  ctx.arc(center.x, center.y, r, 0, Math.PI * 2);
  ctx.fill();

  // Layer 3: Offset sub-cloud for organic shape
  const ox = center.x + r * 0.3;
  const oy = center.y - r * 0.22;
  const sr = r * 0.6;
  const g3 = ctx.createRadialGradient(ox, oy, 0, ox, oy, sr);
  g3.addColorStop(0, `hsla(${ch}, ${Math.min(s + 10, 100)}%, ${Math.min(l + 8, 80)}%, ${0.10 * hoverBoost})`);
  g3.addColorStop(0.5, `hsla(${ch}, ${s}%, ${l}%, ${0.035 * hoverBoost})`);
  g3.addColorStop(1, `hsla(${ch}, ${s}%, ${l}%, 0)`);
  ctx.fillStyle = g3;
  ctx.beginPath();
  ctx.arc(ox, oy, sr, 0, Math.PI * 2);
  ctx.fill();

  // Layer 4: Opposite offset for asymmetry
  const ox2 = center.x - r * 0.22;
  const oy2 = center.y + r * 0.28;
  const sr2 = r * 0.45;
  const g4 = ctx.createRadialGradient(ox2, oy2, 0, ox2, oy2, sr2);
  g4.addColorStop(0, `hsla(${(ch + 20) % 360}, ${Math.min(s + 5, 100)}%, ${Math.min(l + 5, 80)}%, ${0.07 * hoverBoost})`);
  g4.addColorStop(1, `hsla(${ch}, ${s}%, ${l}%, 0)`);
  ctx.fillStyle = g4;
  ctx.beginPath();
  ctx.arc(ox2, oy2, sr2, 0, Math.PI * 2);
  ctx.fill();
}

// --- Cluster labels (nebula names) ---

function drawClusterLabels(ctx, clusterCenters, scale, hoveredClusterId) {
  const fontSize = Math.max(9, Math.min(18, 15 / scale * 1.5));
  ctx.font = `700 ${fontSize}px 'Space Grotesk', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < clusterCenters.length; i++) {
    const center = clusterCenters[i];
    const { h: ch, s, l } = center.color;
    const r = 80 + center.memberCount * 14 + (center.recCount || 0) * 6;
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
