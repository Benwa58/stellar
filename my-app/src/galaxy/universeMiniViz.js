/**
 * Mini Canvas 2D renderer for the universe preview on the landing page.
 * Galaxy-quality rendering: nebulae, rec links, particles, and node styling
 * matching the full-page universe view.
 * Returns a cleanup function to cancel the animation loop.
 */
export function renderUniverseMiniViz(canvas, universeData) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  const viz = universeData.visualization;

  if (!viz || !viz.nodes || viz.nodes.length === 0) return () => {};

  // Compute scale to fit viz data into canvas
  const scaleX = w / viz.width;
  const scaleY = h / viz.height;
  const scale = Math.min(scaleX, scaleY) * 0.85;
  const offsetX = (w - viz.width * scale) / 2;
  const offsetY = (h - viz.height * scale) / 2;

  let frameId = null;
  const startTime = performance.now();

  // Background stars
  const stars = [];
  for (let i = 0; i < 80; i++) {
    stars.push({
      x: Math.random() * w,
      y: Math.random() * h,
      size: 0.3 + Math.random() * 0.8,
      baseAlpha: 0.08 + Math.random() * 0.25,
      phase: Math.random() * Math.PI * 2,
      speed: 0.0006 + Math.random() * 0.0015,
    });
  }

  function render() {
    const time = performance.now() - startTime;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Background stars
    for (const star of stars) {
      const twinkle = star.baseAlpha + 0.12 * Math.sin(time * star.speed + star.phase);
      if (twinkle <= 0) continue;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(195, 205, 235, ${twinkle})`;
      ctx.fill();
    }

    // Cluster nebulae (multi-layer)
    for (const center of viz.clusterCenters) {
      const cx = center.x * scale + offsetX;
      const cy = center.y * scale + offsetY;
      const baseR = (35 + center.memberCount * 6 + (center.recCount || 0) * 3) * scale;
      const { h: ch, s, l } = center.color;
      const breathe = 1 + 0.02 * Math.sin(time * 0.0004 + cx * 0.01);
      const r = baseR * breathe;

      // Outer halo
      const outerR = r * 1.7;
      const g1 = ctx.createRadialGradient(cx, cy, 0, cx, cy, outerR);
      g1.addColorStop(0, `hsla(${ch}, ${s}%, ${l}%, 0.08)`);
      g1.addColorStop(0.4, `hsla(${ch}, ${s}%, ${l}%, 0.035)`);
      g1.addColorStop(1, `hsla(${ch}, ${s}%, ${l}%, 0)`);
      ctx.fillStyle = g1;
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
      ctx.fill();

      // Core
      const g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g2.addColorStop(0, `hsla(${ch}, ${s}%, ${l}%, 0.20)`);
      g2.addColorStop(0.4, `hsla(${ch}, ${s}%, ${l}%, 0.09)`);
      g2.addColorStop(1, `hsla(${ch}, ${s}%, ${l}%, 0)`);
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      // Offset sub-cloud
      const ox = cx + r * 0.25;
      const oy = cy - r * 0.2;
      const sr = r * 0.55;
      const g3 = ctx.createRadialGradient(ox, oy, 0, ox, oy, sr);
      g3.addColorStop(0, `hsla(${ch}, ${Math.min(s + 10, 100)}%, ${Math.min(l + 8, 80)}%, 0.09)`);
      g3.addColorStop(1, `hsla(${ch}, ${s}%, ${l}%, 0)`);
      ctx.fillStyle = g3;
      ctx.beginPath();
      ctx.arc(ox, oy, sr, 0, Math.PI * 2);
      ctx.fill();
    }

    // Rec links
    if (viz.recLinks && viz.recLinks.length > 0) {
      ctx.setLineDash([2, 3]);
      for (const link of viz.recLinks) {
        const x1 = link.from.x * scale + offsetX;
        const y1 = link.from.y * scale + offsetY;
        const x2 = link.to.x * scale + offsetX;
        const y2 = link.to.y * scale + offsetY;
        const pulse = 0.5 + 0.3 * Math.sin(time * 0.001 + x1 * 0.02);
        const alpha = (0.03 + link.strength * 0.06) * pulse;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = `rgba(170, 180, 255, ${alpha})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // Bridge links
    if (viz.bridgeLinks && viz.bridgeLinks.length > 0) {
      ctx.setLineDash([3, 5]);
      for (const link of viz.bridgeLinks) {
        const x1 = link.from.x * scale + offsetX;
        const y1 = link.from.y * scale + offsetY;
        const x2 = link.to.x * scale + offsetX;
        const y2 = link.to.y * scale + offsetY;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = `rgba(100, 220, 200, ${0.08 + link.strength * 0.12})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // Nodes — members first, then recs on top
    const members = [];
    const recs = [];
    for (const node of viz.nodes) {
      if (node.isRecommendation) recs.push(node);
      else members.push(node);
    }

    // Member nodes
    for (const node of members) {
      const nx = node.x * scale + offsetX;
      const ny = node.y * scale + offsetY;
      const center = viz.clusterCenters[node.clusterId];
      if (!center) continue;
      const { h: ch, s, l } = center.color;
      const size = node.size * scale;
      const isFav = node.source === 'favorite';

      // Glow
      const glowR = size * 2.5;
      const glow = ctx.createRadialGradient(nx, ny, 0, nx, ny, glowR);
      glow.addColorStop(0, `hsla(${ch}, ${s}%, ${l}%, ${isFav ? 0.18 : 0.10})`);
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(nx, ny, glowR, 0, Math.PI * 2);
      ctx.fill();

      // Body
      ctx.beginPath();
      ctx.arc(nx, ny, size, 0, Math.PI * 2);
      ctx.fillStyle = isFav
        ? `hsla(${ch}, ${s}%, ${Math.min(l + 15, 80)}%, 0.8)`
        : `hsla(${ch}, ${s}%, ${l}%, 0.6)`;
      ctx.fill();
    }

    // Recommendation nodes (prominent pulsing)
    for (const node of recs) {
      const nx = node.x * scale + offsetX;
      const ny = node.y * scale + offsetY;
      const center = viz.clusterCenters[node.clusterId];
      if (!center) continue;
      const { h: ch, s, l } = center.color;
      const size = node.size * scale;
      const pulse = 0.6 + 0.4 * Math.sin(time * 0.002 + nx * 0.03 + ny * 0.03);

      // Glow
      const glowR = size * 4;
      const glow = ctx.createRadialGradient(nx, ny, 0, nx, ny, glowR);
      glow.addColorStop(0, `hsla(${ch}, ${Math.min(s + 15, 100)}%, ${Math.min(l + 20, 85)}%, ${0.25 * pulse})`);
      glow.addColorStop(0.4, `hsla(${ch}, ${s}%, ${l}%, ${0.08 * pulse})`);
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(nx, ny, glowR, 0, Math.PI * 2);
      ctx.fill();

      // Body
      ctx.beginPath();
      ctx.arc(nx, ny, size, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${ch}, ${Math.min(s + 15, 100)}%, ${Math.min(l + 20, 85)}%, ${0.7 + 0.3 * pulse})`;
      ctx.fill();

      // Core
      ctx.beginPath();
      ctx.arc(nx, ny, size * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${ch}, ${Math.min(s + 10, 100)}%, ${Math.min(l + 30, 95)}%, ${0.4 + 0.3 * pulse})`;
      ctx.fill();
    }

    // Cluster labels
    const fontSize = Math.max(7, 10 * scale);
    ctx.font = `600 ${fontSize}px 'Space Grotesk', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const center of viz.clusterCenters) {
      const cx = center.x * scale + offsetX;
      const r = (35 + center.memberCount * 6 + (center.recCount || 0) * 3) * scale;
      const cy = center.y * scale + offsetY - r - 6;
      const { h: ch, s, l } = center.color;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillText(center.label, cx + 0.5, cy + 0.5);
      ctx.fillStyle = `hsla(${ch}, ${Math.max(s - 15, 30)}%, ${Math.min(l + 22, 88)}%, 0.8)`;
      ctx.fillText(center.label, cx, cy);
    }

    ctx.restore();
    frameId = requestAnimationFrame(render);
  }

  render();

  return () => {
    if (frameId) cancelAnimationFrame(frameId);
  };
}
