import { GALAXY_COLORS } from '../utils/constants';
import { drawParticles, updateParticles } from './particleSystem';

export function createRenderer(canvas, getState) {
  const ctx = canvas.getContext('2d');
  let frameId = null;
  let nebulaCanvas = null;

  function setNebulaCanvas(nc) {
    nebulaCanvas = nc;
  }

  function setSettled() {
    // reserved for future optimization (stop animation loop when settled)
  }

  function render() {
    const time = performance.now();
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    const state = getState();
    const { nodes, links, particles, transform, hoveredNode, selectedNode, favoriteNames, dislikeNames, knownNames, discoveredNames, isExpanded } = state;

    // Smoothly animate expand transition (0 → 1 over ~1.2s)
    if (isExpanded && state.expandTransition < 1) {
      state.expandTransition = Math.min(1, state.expandTransition + 0.014);
    }

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Background
    drawBackground(ctx, w, h, state.expandTransition, state.driftOrbit, transform);

    // Apply camera transform
    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.scale, transform.scale);

    // Nebulae
    if (nebulaCanvas) {
      ctx.globalAlpha = 1;
      ctx.drawImage(nebulaCanvas, 0, 0);
      ctx.globalAlpha = 1;
    }

    // Background particles
    if (particles) {
      updateParticles(particles);
      drawParticles(ctx, particles);
    }

    // Links
    drawLinks(ctx, links, hoveredNode, selectedNode, state.expandTransition);

    // Nodes (with dimming for known artists)
    drawNodes(ctx, nodes, hoveredNode, selectedNode, time, state.expandTransition, knownNames);

    // Discovered indicators (gold gradient ring)
    if (discoveredNames && discoveredNames.size > 0) {
      drawDiscoveredIndicators(ctx, nodes, discoveredNames);
    }

    // Favorite indicators (drawn after discovered so favorites take visual priority)
    if (favoriteNames && favoriteNames.size > 0) {
      drawFavoriteIndicators(ctx, nodes, favoriteNames);
    }

    // Dislike indicators
    if (dislikeNames && dislikeNames.size > 0) {
      drawDislikeIndicators(ctx, nodes, dislikeNames);
    }

    // Labels for hovered/selected
    if (hoveredNode && hoveredNode !== selectedNode) {
      if (hoveredNode.isDrift && state.expandTransition < 1) ctx.globalAlpha = state.expandTransition;
      drawNodeLabel(ctx, hoveredNode);
      if (hoveredNode.isDrift && state.expandTransition < 1) ctx.globalAlpha = 1;
    }
    if (selectedNode) {
      if (selectedNode.isDrift && state.expandTransition < 1) ctx.globalAlpha = state.expandTransition;
      drawNodeLabel(ctx, selectedNode);
      if (selectedNode.isDrift && state.expandTransition < 1) ctx.globalAlpha = 1;
    }

    ctx.restore();
    ctx.restore();

    frameId = requestAnimationFrame(render);
  }

  function start() {
    if (!frameId) render();
  }

  function stop() {
    if (frameId) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }
  }

  return { start, stop, setNebulaCanvas, setSettled };
}

function drawBackground(ctx, w, h, expandT, driftOrbit, transform) {
  const maxDim = Math.max(w, h);

  // Base gradient (always drawn)
  const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, maxDim * 0.7);
  grad.addColorStop(0, GALAXY_COLORS.backgroundGradientInner);
  grad.addColorStop(1, GALAXY_COLORS.backgroundGradientOuter);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Expanded mode: warm glow starting at the drift orbit boundary
  if (expandT > 0 && driftOrbit) {
    const ease = expandT * expandT * (3 - 2 * expandT); // smoothstep

    // Convert drift orbit center from world space to screen space
    const screenCx = driftOrbit.cx * transform.scale + transform.x;
    const screenCy = driftOrbit.cy * transform.scale + transform.y;
    const screenRadius = driftOrbit.radius * transform.scale;

    // The warm zone starts just inside the core galaxy edge and radiates
    // outward through the gap into drift territory
    const innerR = screenRadius * 0.6;
    const outerR = screenRadius * 2.5;

    const driftGrad = ctx.createRadialGradient(screenCx, screenCy, innerR, screenCx, screenCy, outerR);
    driftGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    driftGrad.addColorStop(0.15, `rgba(40, 14, 8, ${0.05 * ease})`);
    driftGrad.addColorStop(0.35, `rgba(85, 32, 14, ${0.1 * ease})`);
    driftGrad.addColorStop(0.55, `rgba(110, 44, 18, ${0.14 * ease})`);
    driftGrad.addColorStop(0.75, `rgba(95, 38, 15, ${0.09 * ease})`);
    driftGrad.addColorStop(1, `rgba(60, 22, 10, ${0.04 * ease})`);
    ctx.fillStyle = driftGrad;
    ctx.fillRect(0, 0, w, h);
  }
}

function drawLinks(ctx, links, hoveredNode, selectedNode, expandT) {
  if (!links) return;

  for (const link of links) {
    const source = link.source;
    const target = link.target;
    if (!source || !target || source.x == null || target.x == null) continue;

    // Fade in drift links with expand transition
    if (link.isDriftLink && expandT < 1) {
      if (expandT <= 0) continue; // skip entirely before expand starts
      ctx.globalAlpha = expandT;
    }

    const isHighlighted =
      source === hoveredNode ||
      target === hoveredNode ||
      source === selectedNode ||
      target === selectedNode;

    ctx.beginPath();
    ctx.moveTo(source.x, source.y);
    ctx.lineTo(target.x, target.y);

    if (link.isChainLink) {
      // Chain links: dotted purple line with gradient along the chain
      ctx.setLineDash([3, 3]);
      const t = (link.chainPosition || 0) / Math.max(link.chainLength || 1, 1);
      // Purple gradient: lighter → deeper along the chain
      const r = Math.round(190 - t * 30);
      const g = Math.round(150 - t * 40);
      const b = Math.round(255 - t * 20);
      if (isHighlighted) {
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.55)`;
        ctx.lineWidth = 2.0;
      } else {
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.25)`;
        ctx.lineWidth = 1.2;
      }
    } else if (link.isDriftLink) {
      // Drift links: short-dashed coral line
      ctx.setLineDash([2, 4]);
      if (isHighlighted) {
        ctx.strokeStyle = GALAXY_COLORS.driftLinkHighlight;
        ctx.lineWidth = 1.0;
      } else {
        ctx.strokeStyle = GALAXY_COLORS.driftLinkColor;
        ctx.lineWidth = 0.5;
      }
    } else if (link.isBridgeLink) {
      // Bridge links: dashed teal line
      ctx.setLineDash([4, 6]);
      if (isHighlighted) {
        ctx.strokeStyle = GALAXY_COLORS.bridgeLinkHighlight;
        ctx.lineWidth = 1.2;
      } else {
        ctx.strokeStyle = GALAXY_COLORS.bridgeLinkColor;
        ctx.lineWidth = 0.8;
      }
    } else if (isHighlighted) {
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

    // Reset alpha after drift links
    if (link.isDriftLink && expandT < 1) {
      ctx.globalAlpha = 1;
    }
  }
}

function drawNodes(ctx, nodes, hoveredNode, selectedNode, time, expandT, knownNames) {
  if (!nodes) return;

  for (const node of nodes) {
    if (node.x == null || node.y == null) continue;

    const isActive = node === hoveredNode || node === selectedNode;

    // Dim known artists (but not seeds, and not hovered/selected)
    const isKnown = knownNames && knownNames.size > 0 && knownNames.has(node.name) && node.type !== 'seed' && !isActive;
    if (isKnown) {
      ctx.globalAlpha = 0.35;
    }

    if (node.type === 'seed') {
      drawSeedNode(ctx, node, isActive);
    } else if (node.isChainBridge) {
      drawChainBridgeNode(ctx, node, isActive, time);
    } else if (node.isDrift) {
      // Fade in drift nodes with expand transition
      const driftAlpha = isKnown ? 0.35 : 1;
      if (expandT < 1) {
        if (expandT <= 0) { if (isKnown) ctx.globalAlpha = 1; continue; }
        ctx.globalAlpha = expandT * driftAlpha;
      }
      drawDriftNode(ctx, node, isActive, time);
      if (expandT < 1 || isKnown) ctx.globalAlpha = 1;
    } else if (node.isHiddenGem) {
      drawHiddenGemNode(ctx, node, isActive, time);
    } else {
      drawRecNode(ctx, node, isActive);
    }

    // Restore alpha after dimming
    if (isKnown && !node.isDrift) {
      ctx.globalAlpha = 1;
    }
  }
}

function drawSeedNode(ctx, node, isActive) {
  const { x, y, radius } = node;

  // Outer glow
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

  // Body
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = '#FFD700';
  ctx.fill();

  // Core
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.5, 0, Math.PI * 2);
  ctx.fillStyle = '#FFFBE6';
  ctx.fill();

  // Active ring
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

  // Glow
  const glowRadius = radius * 2.5;
  const glow = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
  glow.addColorStop(0, glowColor || 'rgba(100, 150, 255, 0.2)');
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.beginPath();
  ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
  ctx.fillStyle = glow;
  ctx.fill();

  // Body
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color || 'rgba(100, 150, 255, 0.8)';
  ctx.fill();

  // Bright core for high-score nodes
  if ((brightness || 0) > 0.7) {
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${(brightness - 0.7) * 2})`;
    ctx.fill();
  }

  // Active ring
  if (isActive) {
    ctx.beginPath();
    ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
    ctx.strokeStyle = GALAXY_COLORS.hoverRing;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
}

function drawChainBridgeNode(ctx, node, isActive, time) {
  const { x, y, radius, color, glowColor, brightness } = node;

  // Slow rotation animation
  const angle = time * 0.0008 + x * 0.005;

  // Pulsing glow
  const pulse = 0.85 + 0.15 * Math.sin(time * 0.003 + y * 0.01);
  const glowRadius = radius * 2.8 * pulse;

  // Purple/violet glow
  const glow = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
  glow.addColorStop(0, glowColor || 'rgba(180, 140, 255, 0.3)');
  glow.addColorStop(0.6, 'rgba(160, 120, 255, 0.08)');
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.beginPath();
  ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
  ctx.fillStyle = glow;
  ctx.fill();

  // Hexagon body (6-sided polygon)
  const sides = 6;
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = angle + (Math.PI * 2 * i) / sides;
    const px = x + radius * Math.cos(a);
    const py = y + radius * Math.sin(a);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = color || 'rgba(180, 140, 255, 0.85)';
  ctx.fill();

  // Inner ring to suggest a "link" in a chain
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.55, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(255, 255, 255, ${(brightness || 0.5) * 0.35})`;
  ctx.lineWidth = radius * 0.15;
  ctx.stroke();

  // Bright center dot
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255, 255, 255, ${(brightness || 0.5) * 0.5})`;
  ctx.fill();

  // Active ring
  if (isActive) {
    ctx.beginPath();
    ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
    ctx.strokeStyle = GALAXY_COLORS.chainNodeRing;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
}

function drawHiddenGemNode(ctx, node, isActive, time) {
  const { x, y, radius, color, glowColor, brightness } = node;

  // Pulsing glow — slow breathe animation
  const pulse = 0.8 + 0.2 * Math.sin(time * 0.002 + x * 0.01);
  const glowRadius = radius * 2.5 * pulse;

  // Glow with teal tint
  const glow = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
  glow.addColorStop(0, glowColor || 'rgba(100, 220, 200, 0.25)');
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.beginPath();
  ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
  ctx.fillStyle = glow;
  ctx.fill();

  // Body circle
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color || 'rgba(100, 220, 200, 0.8)';
  ctx.fill();

  // Diamond overlay (4-pointed star shape) — makes hidden gems identifiable
  const starSize = radius * 0.6;
  ctx.beginPath();
  ctx.moveTo(x, y - starSize);
  ctx.lineTo(x + starSize * 0.4, y);
  ctx.lineTo(x, y + starSize);
  ctx.lineTo(x - starSize * 0.4, y);
  ctx.closePath();
  ctx.fillStyle = `rgba(255, 255, 255, ${(brightness || 0.5) * 0.4})`;
  ctx.fill();

  // Active ring with teal color
  if (isActive) {
    ctx.beginPath();
    ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
    ctx.strokeStyle = GALAXY_COLORS.hiddenGemRing;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
}

function drawDriftNode(ctx, node, isActive, time) {
  const { x, y, radius, color, brightness } = node;

  // Subtle outer glow (very faint)
  const glowRadius = radius * 2;
  const glow = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
  glow.addColorStop(0, 'rgba(220, 130, 100, 0.1)');
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.beginPath();
  ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
  ctx.fillStyle = glow;
  ctx.fill();

  // Ring only (no filled body) — hollow circle for a fading signal feel
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = color || 'rgba(220, 130, 100, 0.7)';
  ctx.lineWidth = Math.max(1, radius * 0.25);
  ctx.stroke();

  // Faint center dot
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255, 255, 255, ${(brightness || 0.4) * 0.3})`;
  ctx.fill();

  // Active ring
  if (isActive) {
    ctx.beginPath();
    ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
    ctx.strokeStyle = GALAXY_COLORS.driftNodeRing;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
}

function drawNodeLabel(ctx, node) {
  if (!node || node.x == null) return;

  const label = node.name;
  ctx.font = '11px Inter, sans-serif';
  const metrics = ctx.measureText(label);
  const padding = 6;
  const labelW = metrics.width + padding * 2;
  const labelH = 20;
  const labelX = node.x - labelW / 2;
  const labelY = node.y - node.radius - labelH - 6;

  // Background
  ctx.fillStyle = 'rgba(10, 10, 30, 0.85)';
  ctx.beginPath();
  roundRect(ctx, labelX, labelY, labelW, labelH, 4);
  ctx.fill();

  // Border
  ctx.strokeStyle = node.isChainBridge
    ? 'rgba(200, 160, 255, 0.3)'
    : node.isDrift
      ? 'rgba(220, 150, 120, 0.25)'
      : node.isHiddenGem
        ? 'rgba(100, 220, 200, 0.25)'
        : 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // Text
  ctx.fillStyle = '#e8e8f0';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, node.x, labelY + labelH / 2);
}

function drawFavoriteIndicators(ctx, nodes, favoriteNames) {
  if (!nodes) return;
  for (const node of nodes) {
    if (node.x == null || node.y == null) continue;
    if (!favoriteNames.has(node.name)) continue;

    // Dark blue gradient ring around the node
    const ringRadius = node.radius + 3;
    const grad = ctx.createLinearGradient(
      node.x - ringRadius, node.y - ringRadius,
      node.x + ringRadius, node.y + ringRadius
    );
    grad.addColorStop(0, 'rgba(30, 64, 175, 0.95)');   // deep blue
    grad.addColorStop(0.5, 'rgba(59, 130, 246, 0.95)'); // mid blue
    grad.addColorStop(1, 'rgba(30, 58, 138, 0.95)');    // navy blue
    ctx.beginPath();
    ctx.arc(node.x, node.y, ringRadius, 0, Math.PI * 2);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
}

function drawDiscoveredIndicators(ctx, nodes, discoveredNames) {
  if (!nodes) return;
  for (const node of nodes) {
    if (node.x == null || node.y == null) continue;
    if (!discoveredNames.has(node.name)) continue;

    // Gold gradient ring around the node
    const ringRadius = node.radius + 3;
    const grad = ctx.createLinearGradient(
      node.x - ringRadius, node.y - ringRadius,
      node.x + ringRadius, node.y + ringRadius
    );
    grad.addColorStop(0, 'rgba(255, 215, 0, 0.9)');     // bright gold
    grad.addColorStop(0.5, 'rgba(255, 190, 0, 0.95)');   // warm gold
    grad.addColorStop(1, 'rgba(218, 165, 32, 0.9)');     // deep goldenrod
    ctx.beginPath();
    ctx.arc(node.x, node.y, ringRadius, 0, Math.PI * 2);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
}

function drawDislikeIndicators(ctx, nodes, dislikeNames) {
  if (!nodes) return;
  for (const node of nodes) {
    if (node.x == null || node.y == null) continue;
    if (!dislikeNames.has(node.name)) continue;

    // Broken (dashed) muted red ring around the node
    const ringRadius = node.radius + 3;
    ctx.beginPath();
    ctx.arc(node.x, node.y, ringRadius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]); // reset dash
  }
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
