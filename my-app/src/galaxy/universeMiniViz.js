/**
 * Mini Canvas 2D renderer for the universe preview on the landing page.
 * Renders taste cloud nebulae, artist nodes, bridge links, and cluster labels.
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

  // Pre-generate some background stars
  const stars = [];
  for (let i = 0; i < 60; i++) {
    stars.push({
      x: Math.random() * w,
      y: Math.random() * h,
      size: 0.3 + Math.random() * 0.8,
      baseOpacity: 0.1 + Math.random() * 0.3,
      phase: Math.random() * Math.PI * 2,
    });
  }

  function render() {
    const time = performance.now() - startTime;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Clear with transparent background
    ctx.clearRect(0, 0, w, h);

    // Draw background stars
    for (const star of stars) {
      const twinkle = star.baseOpacity + 0.15 * Math.sin(time * 0.001 + star.phase);
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200, 210, 240, ${twinkle})`;
      ctx.fill();
    }

    // Draw cluster nebulae (soft radial gradients)
    for (const center of viz.clusterCenters) {
      const cx = center.x * scale + offsetX;
      const cy = center.y * scale + offsetY;
      const r = (30 + center.memberCount * 5) * scale;
      const { h: ch, s, l } = center.color;

      // Main nebula
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, `hsla(${ch}, ${s}%, ${l}%, 0.18)`);
      grad.addColorStop(0.5, `hsla(${ch}, ${s}%, ${l}%, 0.06)`);
      grad.addColorStop(1, `hsla(${ch}, ${s}%, ${l}%, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      // Secondary offset nebula for organic shape
      const ox = cx + r * 0.2;
      const oy = cy - r * 0.15;
      const grad2 = ctx.createRadialGradient(ox, oy, 0, ox, oy, r * 0.7);
      grad2.addColorStop(0, `hsla(${ch}, ${Math.max(s - 10, 30)}%, ${Math.min(l + 10, 80)}%, 0.1)`);
      grad2.addColorStop(1, `hsla(${ch}, ${s}%, ${l}%, 0)`);
      ctx.fillStyle = grad2;
      ctx.beginPath();
      ctx.arc(ox, oy, r * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw bridge links (dashed lines between cluster centers)
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

    // Draw artist nodes with gentle twinkle
    for (const node of viz.nodes) {
      const nx = node.x * scale + offsetX;
      const ny = node.y * scale + offsetY;
      const center = viz.clusterCenters[node.clusterId];
      if (!center) continue;
      const { h: ch, s, l } = center.color;

      const twinkle = 0.5 + 0.5 * Math.sin(time * 0.002 + nx * 0.05 + ny * 0.03);
      const size = node.size * scale * (0.8 + twinkle * 0.2);

      // Glow
      const glow = ctx.createRadialGradient(nx, ny, 0, nx, ny, size * 3);
      glow.addColorStop(0, `hsla(${ch}, ${s}%, ${l}%, ${0.2 * twinkle})`);
      glow.addColorStop(1, 'hsla(0, 0%, 0%, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(nx, ny, size * 3, 0, Math.PI * 2);
      ctx.fill();

      // Node body
      ctx.beginPath();
      ctx.arc(nx, ny, size, 0, Math.PI * 2);
      ctx.fillStyle =
        node.source === 'favorite'
          ? `hsla(${ch}, ${s}%, ${Math.min(l + 15, 80)}%, ${0.7 + twinkle * 0.3})`
          : `hsla(${ch}, ${s}%, ${l}%, ${0.5 + twinkle * 0.3})`;
      ctx.fill();
    }

    // Draw cluster labels
    const fontSize = Math.max(8, 10 * scale);
    ctx.font = `500 ${fontSize}px 'Space Grotesk', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const center of viz.clusterCenters) {
      const cx = center.x * scale + offsetX;
      const cy = center.y * scale + offsetY - (30 + center.memberCount * 3) * scale;
      const { h: ch, s, l } = center.color;

      // Text shadow for readability
      ctx.fillStyle = `rgba(0, 0, 0, 0.5)`;
      ctx.fillText(center.label, cx + 0.5, cy + 0.5);

      ctx.fillStyle = `hsla(${ch}, ${Math.max(s - 20, 30)}%, ${Math.min(l + 20, 85)}%, 0.75)`;
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
