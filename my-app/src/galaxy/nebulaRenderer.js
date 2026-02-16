import { hslToRgba } from '../utils/colorUtils';
import { GALAXY_COLORS } from '../utils/constants';

export function renderNebulaeToCanvas(genreClusters, width, height) {
  const offscreen = document.createElement('canvas');
  offscreen.width = width;
  offscreen.height = height;
  const ctx = offscreen.getContext('2d');

  for (const cluster of genreClusters) {
    if (cluster.nodes.length === 0) continue;

    // Compute centroid
    let cx = 0, cy = 0;
    let validCount = 0;
    for (const node of cluster.nodes) {
      if (node.x != null && node.y != null) {
        cx += node.x;
        cy += node.y;
        validCount++;
      }
    }
    if (validCount === 0) continue;
    cx /= validCount;
    cy /= validCount;

    // Compute bounding radius
    let maxDist = 0;
    for (const node of cluster.nodes) {
      if (node.x != null && node.y != null) {
        const dx = node.x - cx;
        const dy = node.y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > maxDist) maxDist = dist;
      }
    }

    const radius = Math.max(80, maxDist * 1.5);
    const { h, s, l } = cluster.color;
    const opacity = GALAXY_COLORS.nebulaOpacity;

    // Main cloud
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    grad.addColorStop(0, hslToRgba(h, s, l, opacity * 1.5));
    grad.addColorStop(0.4, hslToRgba(h, s, l, opacity));
    grad.addColorStop(1, hslToRgba(h, s, l, 0));

    ctx.fillStyle = grad;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

    // Sub-cloud for organic shape
    const offX = (Math.random() - 0.5) * radius * 0.5;
    const offY = (Math.random() - 0.5) * radius * 0.5;
    const subRadius = radius * 0.6;
    const subGrad = ctx.createRadialGradient(
      cx + offX, cy + offY, 0,
      cx + offX, cy + offY, subRadius
    );
    subGrad.addColorStop(0, hslToRgba(h, s + 10, l + 5, opacity));
    subGrad.addColorStop(1, hslToRgba(h, s, l, 0));
    ctx.fillStyle = subGrad;
    ctx.fillRect(
      cx + offX - subRadius,
      cy + offY - subRadius,
      subRadius * 2,
      subRadius * 2
    );
  }

  return offscreen;
}
