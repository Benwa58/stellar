import { distance } from '../utils/mathUtils';

export function setupInteractions(canvas, getNodes, getTransform, callbacks) {
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let didDrag = false;

  // Cache bounding rect — refreshed on scroll/resize, not per event
  let cachedRect = canvas.getBoundingClientRect();
  function refreshRect() { cachedRect = canvas.getBoundingClientRect(); }
  window.addEventListener('resize', refreshRect);
  window.addEventListener('scroll', refreshRect, true);

  // Throttle hover detection to ~30fps
  let hoverRafId = null;
  let pendingHoverX = 0;
  let pendingHoverY = 0;
  let hoverScheduled = false;

  function processHover() {
    hoverScheduled = false;
    const node = findNodeAt(pendingHoverX, pendingHoverY);
    callbacks.onHover(node);
    canvas.style.cursor = node ? 'pointer' : 'grab';
  }

  function screenToGraph(sx, sy) {
    const t = getTransform();
    return {
      x: (sx - t.x) / t.scale,
      y: (sy - t.y) / t.scale,
    };
  }

  function findNodeAt(sx, sy) {
    const { x: gx, y: gy } = screenToGraph(sx, sy);
    const nodes = getNodes();
    if (!nodes) return null;

    let closest = null;
    let closestDist = Infinity;

    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i];
      if (node.x == null || node.y == null) continue;
      const d = distance(gx, gy, node.x, node.y);
      const hitRadius = (node.radius + 5) / getTransform().scale;
      if (d < hitRadius && d < closestDist) {
        closest = node;
        closestDist = d;
      }
    }

    return closest;
  }

  function getCanvasCoords(e) {
    return {
      x: e.clientX - cachedRect.left,
      y: e.clientY - cachedRect.top,
    };
  }

  function handleMouseMove(e) {
    const { x, y } = getCanvasCoords(e);

    if (isDragging) {
      const dx = x - dragStartX;
      const dy = y - dragStartY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) didDrag = true;
      callbacks.onPan(dx, dy);
      dragStartX = x;
      dragStartY = y;
      return;
    }

    // Throttle hover: schedule one rAF per move burst
    pendingHoverX = x;
    pendingHoverY = y;
    if (!hoverScheduled) {
      hoverScheduled = true;
      hoverRafId = requestAnimationFrame(processHover);
    }
  }

  function handleMouseDown(e) {
    if (e.button !== 0) return;
    refreshRect(); // Ensure rect is fresh for drag operations
    const { x, y } = getCanvasCoords(e);
    isDragging = true;
    didDrag = false;
    dragStartX = x;
    dragStartY = y;
    canvas.style.cursor = 'grabbing';
  }

  function handleMouseUp(e) {
    const wasDragging = isDragging;
    isDragging = false;

    if (wasDragging && !didDrag) {
      const { x, y } = getCanvasCoords(e);
      const node = findNodeAt(x, y);
      callbacks.onClick(node);
    }

    canvas.style.cursor = 'grab';
  }

  function handleWheel(e) {
    e.preventDefault();
    const { x, y } = getCanvasCoords(e);
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    callbacks.onZoom(delta, x, y);
  }

  function handleMouseLeave() {
    isDragging = false;
    callbacks.onHover(null);
  }

  // Touch handling
  let lastTouchDist = 0;
  let lastTouchCenter = null;

  function handleTouchStart(e) {
    refreshRect(); // Ensure rect is fresh for touch operations
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const { x, y } = getCanvasCoords(touch);
      isDragging = true;
      didDrag = false;
      dragStartX = x;
      dragStartY = y;
    } else if (e.touches.length === 2) {
      isDragging = false;
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      lastTouchDist = distance(t0.clientX, t0.clientY, t1.clientX, t1.clientY);
      lastTouchCenter = {
        x: (t0.clientX + t1.clientX) / 2 - cachedRect.left,
        y: (t0.clientY + t1.clientY) / 2 - cachedRect.top,
      };
    }
  }

  function handleTouchMove(e) {
    e.preventDefault();
    if (e.touches.length === 1 && isDragging) {
      const touch = e.touches[0];
      const { x, y } = getCanvasCoords(touch);
      const dx = x - dragStartX;
      const dy = y - dragStartY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) didDrag = true;
      callbacks.onPan(dx, dy);
      dragStartX = x;
      dragStartY = y;
    } else if (e.touches.length === 2) {
      const t0 = e.touches[0];
      const t1 = e.touches[1];
      const dist = distance(t0.clientX, t0.clientY, t1.clientX, t1.clientY);
      if (lastTouchDist > 0 && lastTouchCenter) {
        const delta = dist / lastTouchDist;
        callbacks.onZoom(delta, lastTouchCenter.x, lastTouchCenter.y);
      }
      lastTouchDist = dist;
      lastTouchCenter = {
        x: (t0.clientX + t1.clientX) / 2 - cachedRect.left,
        y: (t0.clientY + t1.clientY) / 2 - cachedRect.top,
      };
    }
  }

  function handleTouchEnd(e) {
    if (e.touches.length === 0) {
      if (!didDrag && isDragging) {
        const { x, y } = { x: dragStartX, y: dragStartY };
        const node = findNodeAt(x, y);
        callbacks.onClick(node);
      }
      isDragging = false;
      lastTouchDist = 0;
      lastTouchCenter = null;
    }
  }

  canvas.addEventListener('mousemove', handleMouseMove);
  canvas.addEventListener('mousedown', handleMouseDown);
  canvas.addEventListener('mouseup', handleMouseUp);
  canvas.addEventListener('wheel', handleWheel, { passive: false });
  canvas.addEventListener('mouseleave', handleMouseLeave);
  canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
  canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
  canvas.addEventListener('touchend', handleTouchEnd);

  return function cleanup() {
    canvas.removeEventListener('mousemove', handleMouseMove);
    canvas.removeEventListener('mousedown', handleMouseDown);
    canvas.removeEventListener('mouseup', handleMouseUp);
    canvas.removeEventListener('wheel', handleWheel);
    canvas.removeEventListener('mouseleave', handleMouseLeave);
    canvas.removeEventListener('touchstart', handleTouchStart);
    canvas.removeEventListener('touchmove', handleTouchMove);
    canvas.removeEventListener('touchend', handleTouchEnd);
    window.removeEventListener('resize', refreshRect);
    window.removeEventListener('scroll', refreshRect, true);
    if (hoverRafId) cancelAnimationFrame(hoverRafId);
  };
}
