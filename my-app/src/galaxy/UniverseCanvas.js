import { useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { useCanvasSize } from '../hooks/useCanvasSize';
import { setupInteractions } from './interactionHandler';
import { createUniverseRenderer } from './universeRenderer';
import { clamp } from '../utils/mathUtils';

/**
 * Compute a transform that fits a bounding box within the viewport.
 */
function computeFitTransform(nodes, viewWidth, viewHeight, padding = 60) {
  if (!nodes || nodes.length === 0) return { x: 0, y: 0, scale: 1 };

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const node of nodes) {
    if (node.x == null || node.y == null) continue;
    const r = node.radius || node.size || 5;
    minX = Math.min(minX, node.x - r);
    minY = Math.min(minY, node.y - r);
    maxX = Math.max(maxX, node.x + r);
    maxY = Math.max(maxY, node.y + r);
  }

  if (!isFinite(minX)) return { x: 0, y: 0, scale: 1 };

  const graphWidth = maxX - minX;
  const graphHeight = maxY - minY;
  if (graphWidth === 0 || graphHeight === 0) return { x: 0, y: 0, scale: 1 };

  const scaleX = (viewWidth - padding * 2) / graphWidth;
  const scaleY = (viewHeight - padding * 2) / graphHeight;
  const scale = clamp(Math.min(scaleX, scaleY), 0.2, 3);

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const x = viewWidth / 2 - cx * scale;
  const y = viewHeight / 2 - cy * scale;

  return { x, y, scale };
}

/**
 * Smoothly animate the transform from current to target.
 */
function animateTransform(stateRef, target, duration = 500) {
  const start = { ...stateRef.current.transform };
  const startTime = performance.now();

  function step(now) {
    const elapsed = now - startTime;
    const t = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic

    stateRef.current.transform = {
      x: start.x + (target.x - start.x) * ease,
      y: start.y + (target.y - start.y) * ease,
      scale: start.scale + (target.scale - start.scale) * ease,
    };

    if (t < 1) {
      requestAnimationFrame(step);
    }
  }

  requestAnimationFrame(step);
}

const UniverseCanvas = forwardRef(function UniverseCanvas(
  { nodes, clusterCenters, bridgeLinks, onSelectNode, onHoverNode },
  ref
) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const stateRef = useRef({
    nodes: null,
    clusterCenters: null,
    bridgeLinks: null,
    transform: { x: 0, y: 0, scale: 1 },
    hoveredNode: null,
    selectedNode: null,
  });
  const rendererRef = useRef(null);
  const cleanupRef = useRef(null);

  const size = useCanvasSize(containerRef);

  // Sync props to stateRef
  useEffect(() => {
    stateRef.current.nodes = nodes;
    stateRef.current.clusterCenters = clusterCenters;
    stateRef.current.bridgeLinks = bridgeLinks;
  }, [nodes, clusterCenters, bridgeLinks]);

  // Reset view to fit all nodes
  const resetView = useCallback(() => {
    if (!nodes || size.width === 0 || size.height === 0) return;
    const target = computeFitTransform(nodes, size.width, size.height);
    animateTransform(stateRef, target);
  }, [nodes, size.width, size.height]);

  // Zoom to a specific cluster
  const zoomToCluster = useCallback((clusterId) => {
    if (!nodes || !clusterCenters || size.width === 0) return;

    const center = clusterCenters[clusterId];
    if (!center) return;

    // Gather nodes in this cluster to compute bounding box
    const clusterNodes = nodes.filter((n) => n.clusterId === clusterId);
    if (clusterNodes.length === 0) return;

    const target = computeFitTransform(clusterNodes, size.width, size.height, 80);
    // Ensure we zoom in enough to show detail
    target.scale = Math.max(target.scale, 2.5);
    // Recenter on cluster center at this scale
    target.x = size.width / 2 - center.x * target.scale;
    target.y = size.height / 2 - center.y * target.scale;

    animateTransform(stateRef, target, 700);
  }, [nodes, clusterCenters, size.width, size.height]);

  // Zoom by multiplier from viewport center
  const zoomBy = useCallback((factor) => {
    const t = stateRef.current.transform;
    const cx = size.width / 2;
    const cy = size.height / 2;
    const newScale = clamp(t.scale * factor, 0.2, 8);
    const ratio = newScale / t.scale;
    animateTransform(stateRef, {
      x: cx - (cx - t.x) * ratio,
      y: cy - (cy - t.y) * ratio,
      scale: newScale,
    }, 200);
  }, [size.width, size.height]);

  // Expose methods to parent
  useImperativeHandle(ref, () => ({ resetView, zoomToCluster, zoomBy }), [
    resetView, zoomToCluster, zoomBy,
  ]);

  // Set up canvas, renderer, and interactions
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !nodes || nodes.length === 0 || size.width === 0 || size.height === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.width * dpr;
    canvas.height = size.height * dpr;
    canvas.style.width = size.width + 'px';
    canvas.style.height = size.height + 'px';

    // Fit view to all nodes
    stateRef.current.transform = computeFitTransform(nodes, size.width, size.height);

    // Create renderer
    if (rendererRef.current) rendererRef.current.stop();
    const renderer = createUniverseRenderer(canvas, () => stateRef.current);
    rendererRef.current = renderer;
    renderer.start();

    // Set up interactions
    if (cleanupRef.current) cleanupRef.current();
    const cleanup = setupInteractions(
      canvas,
      () => stateRef.current.nodes,
      () => stateRef.current.transform,
      {
        onHover: (node) => {
          stateRef.current.hoveredNode = node;
          if (onHoverNode) onHoverNode(node);
        },
        onClick: (node) => {
          if (node) {
            stateRef.current.selectedNode = node;
            if (onSelectNode) onSelectNode(node);
          } else {
            // Clicked empty space — check if near a cluster center
            // (cluster zoom is handled by the parent via onSelectNode(null))
            stateRef.current.selectedNode = null;
            if (onSelectNode) onSelectNode(null);
          }
        },
        onPan: (dx, dy) => {
          const t = stateRef.current.transform;
          stateRef.current.transform = { ...t, x: t.x + dx, y: t.y + dy };
        },
        onZoom: (delta, cx, cy) => {
          const t = stateRef.current.transform;
          const newScale = clamp(t.scale * delta, 0.2, 8);
          const ratio = newScale / t.scale;
          stateRef.current.transform = {
            x: cx - (cx - t.x) * ratio,
            y: cy - (cy - t.y) * ratio,
            scale: newScale,
          };
        },
      }
    );
    cleanupRef.current = cleanup;

    return () => {
      renderer.stop();
      cleanup();
    };
  }, [nodes, size.width, size.height, onSelectNode, onHoverNode]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', cursor: 'grab' }}
      />
    </div>
  );
});

export default UniverseCanvas;
