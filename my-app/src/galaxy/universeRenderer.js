/**
 * Full-page Canvas 2D renderer for the My Universe view.
 * Renders taste cloud nebulae, artist nodes (members + recommendations),
 * bridge links, cluster labels, and a starfield background.
 * Recommendations are visually prominent — the primary content.
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

  // Pre-generate background stars
  const stars = [];
  for (let i = 0; i < 200; i++) {
    stars.push({
      x: Math.random() * 4000 - 1000,
      y: Math.random() * 4000 - 1000,
      size: 0.3 + Math.random() * 1.2,
      baseOpacity: 0.08 + Math.random() * 0.25,
      phase: Math.random() * Math.PI * 2,
    });
  }

  function render() {
    const state = getState();
    if (!state) {
      frameId = requestAnimationFrame(render);
      return;
    }

    const { nodes, clusterCenters, bridgeLinks, transform, hoveredNode, selectedNode } = state;
    const time = performance.now() - startTime;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    const scale = transform.scale;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // --- Background ---
    ctx.fillStyle = '#08080f';
    ctx.fillRect(0, 0, w, h);

    // --- Stars (in world space, affected by transform) ---
    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(scale, scale);

    for (const star of stars) {
      const twinkle = star.baseOpacity + 0.1 * Math.sin(time * 0.0008 + star.phase);
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(180, 195, 230, ${twinkle})`;
      ctx.fill();
    }

    // --- Cluster nebulae ---
    if (clusterCenters) {
      for (const center of clusterCenters) {
        const { h: ch, s, l } = center.color;
        const r = (60 + center.memberCount * 12 + (center.recCount || 0) * 8);

        // Main nebula
        const grad = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, r);
        grad.addColorStop(0, `hsla(${ch}, ${s}%, ${l}%, 0.15)`);
        grad.addColorStop(0.4, `hsla(${ch}, ${s}%, ${l}%, 0.07)`);
        grad.addColorStop(1, `hsla(${ch}, ${s}%, ${l}%, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(center.x, center.y, r, 0, Math.PI * 2);
        ctx.fill();

        // Secondary offset nebula for organic shape
        const ox = center.x + r * 0.25;
        const oy = center.y - r * 0.2;
        const grad2 = ctx.createRadialGradient(ox, oy, 0, ox, oy, r * 0.6);
        grad2.addColorStop(0, `hsla(${ch}, ${Math.max(s - 10, 30)}%, ${Math.min(l + 10, 80)}%, 0.08)`);
        grad2.addColorStop(1, `hsla(${ch}, ${s}%, ${l}%, 0)`);
        ctx.fillStyle = grad2;
        ctx.beginPath();
        ctx.arc(ox, oy, r * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // --- Bridge links ---
    if (bridgeLinks && bridgeLinks.length > 0) {
      ctx.setLineDash([6, 10]);
      for (const link of bridgeLinks) {
        ctx.beginPath();
        ctx.moveTo(link.from.x, link.from.y);
        ctx.lineTo(link.to.x, link.to.y);
        ctx.strokeStyle = `rgba(100, 220, 200, ${0.06 + link.strength * 0.1})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // --- Nodes ---
    if (nodes) {
      // Draw member nodes first (below), then recommendation nodes (on top)
      const members = [];
      const recs = [];
      for (const node of nodes) {
        if (node.isRecommendation) {
          recs.push(node);
        } else {
          members.push(node);
        }
      }

      // Member nodes — smaller, solid anchors
      for (const node of members) {
        const center = clusterCenters?.[node.clusterId];
        if (!center) continue;
        const { h: ch, s, l } = center.color;
        const r = node.radius || node.size;
        const isHovered = hoveredNode === node;
        const isSelected = selectedNode === node;

        // Glow
        const glowR = r * 2.5;
        const glow = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, glowR);
        glow.addColorStop(0, `hsla(${ch}, ${s}%, ${l}%, 0.15)`);
        glow.addColorStop(1, 'hsla(0, 0%, 0%, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(node.x, node.y, glowR, 0, Math.PI * 2);
        ctx.fill();

        // Try to draw image at close zoom
        const img = scale > 2 ? loadImage(node.image) : null;
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
          ctx.strokeStyle = node.source === 'favorite'
            ? `hsla(${ch}, ${s}%, ${Math.min(l + 15, 80)}%, 0.8)`
            : `hsla(${ch}, ${s}%, ${l}%, 0.6)`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else {
          // Solid circle
          ctx.beginPath();
          ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
          ctx.fillStyle = node.source === 'favorite'
            ? `hsla(${ch}, ${s}%, ${Math.min(l + 15, 80)}%, 0.8)`
            : `hsla(${ch}, ${s}%, ${l}%, 0.6)`;
          ctx.fill();
        }

        // Hover/selection ring
        if (isHovered || isSelected) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, r + 3, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }

      // Recommendation nodes — larger, brighter, with pulsing glow
      for (const node of recs) {
        const center = clusterCenters?.[node.clusterId];
        if (!center) continue;
        const { h: ch, s, l } = center.color;
        const r = node.radius || node.size;
        const isHovered = hoveredNode === node;
        const isSelected = selectedNode === node;

        // Pulsing outer glow
        const pulse = 0.6 + 0.4 * Math.sin(time * 0.002 + node.x * 0.02 + node.y * 0.02);
        const glowR = r * 4;
        const glow = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, glowR);
        glow.addColorStop(0, `hsla(${ch}, ${Math.min(s + 10, 100)}%, ${Math.min(l + 15, 80)}%, ${0.25 * pulse})`);
        glow.addColorStop(0.5, `hsla(${ch}, ${s}%, ${l}%, ${0.08 * pulse})`);
        glow.addColorStop(1, 'hsla(0, 0%, 0%, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(node.x, node.y, glowR, 0, Math.PI * 2);
        ctx.fill();

        // Body — bright and prominent
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${ch}, ${Math.min(s + 10, 100)}%, ${Math.min(l + 20, 85)}%, ${0.7 + 0.3 * pulse})`;
        ctx.fill();

        // Bright core
        ctx.beginPath();
        ctx.arc(node.x, node.y, r * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${ch}, ${Math.min(s + 5, 100)}%, ${Math.min(l + 30, 95)}%, ${0.6 + 0.3 * pulse})`;
        ctx.fill();

        // Hover/selection ring
        if (isHovered || isSelected) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, r + 4, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }

      // --- Labels (drawn after all nodes for layering) ---
      const showNames = scale > 1.8;
      const showRecNames = scale > 1.2;

      if (showRecNames) {
        const fontSize = Math.max(6, Math.min(11, 10 / scale * 1.5));
        ctx.font = `500 ${fontSize}px 'Space Grotesk', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        // Rec labels (always show before member labels)
        for (const node of recs) {
          if (!showRecNames && node !== hoveredNode && node !== selectedNode) continue;
          const r = node.radius || node.size;
          // Shadow
          ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
          ctx.fillText(node.name, node.x + 0.5, node.y + r + 3.5);
          // Text
          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.fillText(node.name, node.x, node.y + r + 3);
        }

        // Member labels (only at closer zoom)
        if (showNames) {
          for (const node of members) {
            const r = node.radius || node.size;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.fillText(node.name, node.x + 0.5, node.y + r + 3.5);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
            ctx.fillText(node.name, node.x, node.y + r + 3);
          }
        }
      }

      // Hovered/selected label always visible regardless of zoom
      const highlight = hoveredNode || selectedNode;
      if (highlight && !showRecNames) {
        const fontSize = Math.max(8, Math.min(14, 12 / scale * 1.5));
        ctx.font = `600 ${fontSize}px 'Space Grotesk', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const r = highlight.radius || highlight.size;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillText(highlight.name, highlight.x + 0.5, highlight.y + r + 4.5);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.fillText(highlight.name, highlight.x, highlight.y + r + 4);
      }
    }

    // --- Cluster labels ---
    if (clusterCenters) {
      const clusterFontSize = Math.max(8, Math.min(16, 13 / scale * 1.5));
      ctx.font = `600 ${clusterFontSize}px 'Space Grotesk', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      for (const center of clusterCenters) {
        const { h: ch, s, l } = center.color;
        const labelY = center.y - (60 + center.memberCount * 8);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillText(center.label, center.x + 0.5, labelY + 0.5);
        ctx.fillStyle = `hsla(${ch}, ${Math.max(s - 15, 30)}%, ${Math.min(l + 20, 85)}%, 0.8)`;
        ctx.fillText(center.label, center.x, labelY);
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
