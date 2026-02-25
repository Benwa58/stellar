/**
 * Full-page Canvas 2D renderer for the My Universe view.
 * Galaxy-quality rendering: rich nebulae, particle starfield,
 * recommendation links, and prominent discovery nodes.
 */

const IMAGE_CACHE = new Map();
const LOADING_IMAGES = new Set();

function loadImage(url) {
  if (!url) return null;
  if (IMAGE_CACHE.has(url)) return IMAGE_CACHE.get(url);
  if (LOADING_IMAGES.has(url)) return null;

  LOADING_IMAGES.add(url);
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    IMAGE_CACHE.set(url, img);
    LOADING_IMAGES.delete(url);
  };
  img.onerror = () => {
    LOADING_IMAGES.delete(url);
  };
  img.src = url;
  return null;
}

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

    const { nodes, clusterCenters, bridgeLinks, recLinks, transform, hoveredNode, selectedNode } = state;
    const time = performance.now() - startTime;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    const scale = transform.scale;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

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
      for (const center of clusterCenters) {
        drawNebula(ctx, center, time);
      }
    }

    // Recommendation-to-member links (behind nodes)
    if (recLinks && recLinks.length > 0) {
      for (const link of recLinks) {
        drawRecLink(ctx, link, time);
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

    // Sort nodes: members first (below), then recs on top
    const members = [];
    const recs = [];
    if (nodes) {
      for (const node of nodes) {
        if (node.isRecommendation) recs.push(node);
        else members.push(node);
      }
    }

    // Member nodes
    for (const node of members) {
      drawMemberNode(ctx, node, clusterCenters, hoveredNode, selectedNode, scale, time);
    }

    // Recommendation nodes (prominent, pulsing)
    for (const node of recs) {
      drawRecNode(ctx, node, clusterCenters, hoveredNode, selectedNode, scale, time);
    }

    // Labels (drawn after all nodes for layering)
    drawAllLabels(ctx, members, recs, clusterCenters, hoveredNode, selectedNode, scale);

    // Cluster labels (nebula names)
    if (clusterCenters) {
      drawClusterLabels(ctx, clusterCenters, scale);
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

// --- Nebula rendering (multi-layer genre cloud) ---

function drawNebula(ctx, center, time) {
  const { h: ch, s, l } = center.color;
  const baseR = 80 + center.memberCount * 14 + (center.recCount || 0) * 6;
  const breathe = 1 + 0.025 * Math.sin(time * 0.0004 + center.x * 0.008);
  const r = baseR * breathe;

  // Layer 1: Large diffuse outer halo
  const outerR = r * 1.9;
  const g1 = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, outerR);
  g1.addColorStop(0, `hsla(${ch}, ${s}%, ${l}%, 0.07)`);
  g1.addColorStop(0.3, `hsla(${ch}, ${s}%, ${l}%, 0.04)`);
  g1.addColorStop(0.65, `hsla(${ch}, ${s}%, ${l}%, 0.015)`);
  g1.addColorStop(1, `hsla(${ch}, ${s}%, ${l}%, 0)`);
  ctx.fillStyle = g1;
  ctx.beginPath();
  ctx.arc(center.x, center.y, outerR, 0, Math.PI * 2);
  ctx.fill();

  // Layer 2: Core nebula (brighter center)
  const g2 = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, r);
  g2.addColorStop(0, `hsla(${ch}, ${s}%, ${l}%, 0.20)`);
  g2.addColorStop(0.3, `hsla(${ch}, ${s}%, ${l}%, 0.12)`);
  g2.addColorStop(0.65, `hsla(${ch}, ${s}%, ${l}%, 0.04)`);
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
  g3.addColorStop(0, `hsla(${ch}, ${Math.min(s + 10, 100)}%, ${Math.min(l + 8, 80)}%, 0.10)`);
  g3.addColorStop(0.5, `hsla(${ch}, ${s}%, ${l}%, 0.035)`);
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
  g4.addColorStop(0, `hsla(${(ch + 20) % 360}, ${Math.min(s + 5, 100)}%, ${Math.min(l + 5, 80)}%, 0.07)`);
  g4.addColorStop(1, `hsla(${ch}, ${s}%, ${l}%, 0)`);
  ctx.fillStyle = g4;
  ctx.beginPath();
  ctx.arc(ox2, oy2, sr2, 0, Math.PI * 2);
  ctx.fill();
}

// --- Recommendation-to-member link ---

function drawRecLink(ctx, link, time) {
  const pulse = 0.5 + 0.3 * Math.sin(time * 0.0012 + link.from.x * 0.01);
  const alpha = (0.04 + link.strength * 0.1) * pulse;

  // Gradient along the link (brighter at rec end, fainter at member end)
  const grad = ctx.createLinearGradient(link.from.x, link.from.y, link.to.x, link.to.y);
  grad.addColorStop(0, `rgba(180, 190, 255, ${alpha * 1.6})`);
  grad.addColorStop(0.4, `rgba(160, 170, 240, ${alpha})`);
  grad.addColorStop(1, `rgba(140, 150, 220, ${alpha * 0.4})`);

  ctx.beginPath();
  ctx.moveTo(link.from.x, link.from.y);
  ctx.lineTo(link.to.x, link.to.y);
  ctx.strokeStyle = grad;
  ctx.lineWidth = 0.8;
  ctx.setLineDash([3, 5]);
  ctx.stroke();
  ctx.setLineDash([]);
}

// --- Member node (nebula anchors) ---

function drawMemberNode(ctx, node, clusterCenters, hoveredNode, selectedNode, scale, time) {
  const center = clusterCenters?.[node.clusterId];
  if (!center) return;
  const { h: ch, s, l } = center.color;
  const r = node.radius || node.size;
  const isHovered = hoveredNode === node;
  const isSelected = selectedNode === node;
  const isFav = node.source === 'favorite';

  // Glow halo
  const glowR = r * 3;
  const glow = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, glowR);
  glow.addColorStop(0, `hsla(${ch}, ${s}%, ${l}%, ${isFav ? 0.22 : 0.13})`);
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(node.x, node.y, glowR, 0, Math.PI * 2);
  ctx.fill();

  // Try image at close zoom
  const img = scale > 1.8 ? loadImage(node.image) : null;
  if (img) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, node.x - r, node.y - r, r * 2, r * 2);
    ctx.restore();
    // Border
    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
    ctx.strokeStyle = isFav
      ? `hsla(${ch}, ${s}%, ${Math.min(l + 20, 85)}%, 0.9)`
      : `hsla(${ch}, ${s}%, ${l}%, 0.6)`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  } else {
    // Solid circle
    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
    ctx.fillStyle = isFav
      ? `hsla(${ch}, ${s}%, ${Math.min(l + 15, 80)}%, 0.85)`
      : `hsla(${ch}, ${s}%, ${l}%, 0.65)`;
    ctx.fill();
  }

  // Favorite indicator: subtle bright ring
  if (isFav) {
    ctx.beginPath();
    ctx.arc(node.x, node.y, r + 2, 0, Math.PI * 2);
    ctx.strokeStyle = `hsla(${ch}, ${s}%, ${Math.min(l + 25, 90)}%, 0.5)`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Hover/selection ring
  if (isHovered || isSelected) {
    ctx.beginPath();
    ctx.arc(node.x, node.y, r + 4, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

// --- Recommendation node (prominent discovery beacons) ---

function drawRecNode(ctx, node, clusterCenters, hoveredNode, selectedNode, scale, time) {
  const center = clusterCenters?.[node.clusterId];
  if (!center) return;
  const { h: ch, s, l } = center.color;
  const r = node.radius || node.size;
  const isHovered = hoveredNode === node;
  const isSelected = selectedNode === node;

  // Pulsing animation (each node has unique phase based on position)
  const pulse = 0.6 + 0.4 * Math.sin(time * 0.002 + node.x * 0.015 + node.y * 0.015);

  // Large outer glow — makes recs very visible
  const glowR = r * 5;
  const glow = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, glowR);
  glow.addColorStop(0, `hsla(${ch}, ${Math.min(s + 15, 100)}%, ${Math.min(l + 20, 85)}%, ${0.3 * pulse})`);
  glow.addColorStop(0.25, `hsla(${ch}, ${s}%, ${l}%, ${0.12 * pulse})`);
  glow.addColorStop(0.6, `hsla(${ch}, ${s}%, ${l}%, ${0.03 * pulse})`);
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(node.x, node.y, glowR, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.beginPath();
  ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
  ctx.fillStyle = `hsla(${ch}, ${Math.min(s + 15, 100)}%, ${Math.min(l + 20, 85)}%, ${0.75 + 0.25 * pulse})`;
  ctx.fill();

  // Bright core
  ctx.beginPath();
  ctx.arc(node.x, node.y, r * 0.45, 0, Math.PI * 2);
  ctx.fillStyle = `hsla(${ch}, ${Math.min(s + 10, 100)}%, ${Math.min(l + 30, 95)}%, ${0.5 + 0.35 * pulse})`;
  ctx.fill();

  // White center point
  ctx.beginPath();
  ctx.arc(node.x, node.y, r * 0.15, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255, 255, 255, ${0.35 + 0.3 * pulse})`;
  ctx.fill();

  // Hover/selection ring
  if (isHovered || isSelected) {
    ctx.beginPath();
    ctx.arc(node.x, node.y, r + 5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

// --- Labels ---

function drawAllLabels(ctx, members, recs, clusterCenters, hoveredNode, selectedNode, scale) {
  const showRecLabels = scale > 1.0;
  const showMemberLabels = scale > 1.6;

  // Always show hovered/selected label at any zoom
  const highlight = hoveredNode || selectedNode;

  if (showRecLabels) {
    for (const node of recs) {
      const isHL = node === hoveredNode || node === selectedNode;
      drawPillLabel(ctx, node, clusterCenters, scale, isHL);
    }
  }

  if (showMemberLabels) {
    for (const node of members) {
      const isHL = node === hoveredNode || node === selectedNode;
      drawPillLabel(ctx, node, clusterCenters, scale, isHL);
    }
  }

  // If zoom is too far out to show labels, still show the highlighted one
  if (highlight && !showRecLabels) {
    drawPillLabel(ctx, highlight, clusterCenters, scale, true);
  }
}

function drawPillLabel(ctx, node, clusterCenters, scale, isHighlight) {
  const fontSize = Math.max(6, Math.min(12, 10 / scale * 1.5));
  ctx.font = `${isHighlight ? '600' : '500'} ${fontSize}px 'Space Grotesk', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const label = node.name;
  const metrics = ctx.measureText(label);
  const padX = 5;
  const padY = 3;
  const labelW = metrics.width + padX * 2;
  const labelH = fontSize + padY * 2;
  const r = node.radius || node.size;
  const labelX = node.x - labelW / 2;
  const labelY = node.y + r + 4;

  // Background pill
  const bgAlpha = isHighlight ? 0.85 : (node.isRecommendation ? 0.65 : 0.5);
  ctx.fillStyle = `rgba(8, 8, 20, ${bgAlpha})`;
  ctx.beginPath();
  roundRect(ctx, labelX, labelY, labelW, labelH, 3);
  ctx.fill();

  // Subtle border for recs
  if (node.isRecommendation) {
    const center = clusterCenters?.[node.clusterId];
    if (center) {
      const { h: ch, s, l } = center.color;
      ctx.strokeStyle = `hsla(${ch}, ${s}%, ${l}%, ${isHighlight ? 0.5 : 0.2})`;
    } else {
      ctx.strokeStyle = `rgba(140, 150, 255, ${isHighlight ? 0.4 : 0.15})`;
    }
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  // Text
  ctx.fillStyle = isHighlight
    ? 'rgba(255, 255, 255, 0.95)'
    : node.isRecommendation
      ? 'rgba(255, 255, 255, 0.85)'
      : 'rgba(255, 255, 255, 0.6)';
  ctx.fillText(label, node.x, labelY + labelH / 2);
}

// --- Cluster labels (nebula names) ---

function drawClusterLabels(ctx, clusterCenters, scale) {
  const fontSize = Math.max(9, Math.min(18, 15 / scale * 1.5));
  ctx.font = `700 ${fontSize}px 'Space Grotesk', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const center of clusterCenters) {
    const { h: ch, s, l } = center.color;
    const r = 80 + center.memberCount * 14 + (center.recCount || 0) * 6;
    const labelY = center.y - r - 12;

    // Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillText(center.label, center.x + 0.5, labelY + 0.5);
    // Text (bright, cluster-colored)
    ctx.fillStyle = `hsla(${ch}, ${Math.max(s - 10, 30)}%, ${Math.min(l + 25, 90)}%, 0.85)`;
    ctx.fillText(center.label, center.x, labelY);
  }
}

// --- Utility ---

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
