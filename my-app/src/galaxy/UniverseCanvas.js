import { useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { useCanvasSize } from '../hooks/useCanvasSize';
import { setupInteractions } from './interactionHandler';
import { createUniverseRenderer } from './universeRenderer';
import { buildUniverseLayout } from './universeGraphBuilder';
import { clamp } from '../utils/mathUtils';

/**
 * Single continuous canvas for the My Universe view.
 * Camera zoom controls LOD transitions automatically.
 */

function computeFitTransform(items, viewWidth, viewHeight, padding = 60) {
  if (!items || items.length === 0) return { x: 0, y: 0, scale: 1 };

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const item of items) {
    if (item.x == null || item.y == null) continue;
    const r = item.radius || item.size || 5;
    minX = Math.min(minX, item.x - r);
    minY = Math.min(minY, item.y - r);
    maxX = Math.max(maxX, item.x + r);
    maxY = Math.max(maxY, item.y + r);
  }

  if (!isFinite(minX)) return { x: 0, y: 0, scale: 1 };

  const graphWidth = maxX - minX;
  const graphHeight = maxY - minY;
  if (graphWidth === 0 || graphHeight === 0) return { x: 0, y: 0, scale: 1 };

  const scaleX = (viewWidth - padding * 2) / graphWidth;
  const scaleY = (viewHeight - padding * 2) / graphHeight;
  const scale = clamp(Math.min(scaleX, scaleY), 0.05, 3);

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const x = viewWidth / 2 - cx * scale;
  const y = viewHeight / 2 - cy * scale;

  return { x, y, scale };
}

function animateTransform(stateRef, target, duration = 500) {
  const start = { ...stateRef.current.transform };
  const startTime = performance.now();

  function step(now) {
    const elapsed = now - startTime;
    const t = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3);

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
  { universeData, favorites, discoveredArtists, dislikes, onSelectNode, onHoverNode },
  ref
) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);

  const layoutRef = useRef(null);

  const stateRef = useRef({
    clusterMetas: [],
    allNodes: [],
    allLinks: [],
    worldBounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    transform: { x: 0, y: 0, scale: 1 },
    hoveredNode: null,
    selectedNode: null,
    favoriteNames: new Set(),
    dislikeNames: new Set(),
    discoveredNames: new Set(),
  });

  const rendererRef = useRef(null);
  const cleanupRef = useRef(null);

  const size = useCanvasSize(containerRef);

  // Build layout when universeData changes
  useEffect(() => {
    if (!universeData) return;

    const layout = buildUniverseLayout(universeData);
    layoutRef.current = layout;

    stateRef.current.clusterMetas = layout.clusterMetas;
    stateRef.current.allNodes = layout.allNodes;
    stateRef.current.allLinks = layout.allLinks;
    stateRef.current.worldBounds = layout.worldBounds;
    stateRef.current.hoveredNode = null;
    stateRef.current.selectedNode = null;
  }, [universeData]);

  // Sync favorite/discovered/dislike names into renderer state for real-time ring effects
  useEffect(() => {
    stateRef.current.favoriteNames = new Set(
      (favorites || []).map((f) => f.artistName)
    );
  }, [favorites]);

  useEffect(() => {
    stateRef.current.discoveredNames = new Set(
      (discoveredArtists || []).map((d) => d.artistName)
    );
  }, [discoveredArtists]);

  useEffect(() => {
    stateRef.current.dislikeNames = new Set(
      (dislikes || []).map((d) => d.artistName)
    );
  }, [dislikes]);

  const fitAll = useCallback((animate = true) => {
    const layout = layoutRef.current;
    if (!layout || !layout.clusterMetas.length || size.width === 0) return;

    const items = layout.clusterMetas.map((cm) => ({
      x: cm.cx, y: cm.cy, radius: cm.visualRadius,
    }));
    const target = computeFitTransform(items, size.width, size.height, 40);

    // Zoom in 40% closer than pure fit so clusters appear larger and
    // more visually striking at the overview level.
    const zoomBoost = 1.4;
    const cx = size.width / 2;
    const cy = size.height / 2;
    target.scale = clamp(target.scale * zoomBoost, 0.05, 3);
    target.x = cx - (cx - target.x) * zoomBoost;
    target.y = cy - (cy - target.y) * zoomBoost;

    if (animate) {
      animateTransform(stateRef, target, 500);
    } else {
      stateRef.current.transform = target;
    }
  }, [size.width, size.height]);

  const zoomToCluster = useCallback((clusterId) => {
    const layout = layoutRef.current;
    if (!layout) return;
    const cm = layout.clusterMetas.find((c) => c.index === clusterId);
    if (!cm || size.width === 0) return;

    const targetScale = Math.min(
      (size.width * 0.6) / (cm.visualRadius * 2),
      (size.height * 0.6) / (cm.visualRadius * 2),
      2.5
    );

    const target = {
      x: size.width / 2 - cm.cx * targetScale,
      y: size.height / 2 - cm.cy * targetScale,
      scale: targetScale,
    };

    animateTransform(stateRef, target, 700);
  }, [size.width, size.height]);

  const zoomBy = useCallback((factor) => {
    const t = stateRef.current.transform;
    const cx = size.width / 2;
    const cy = size.height / 2;
    const newScale = clamp(t.scale * factor, 0.05, 8);
    const ratio = newScale / t.scale;
    animateTransform(stateRef, {
      x: cx - (cx - t.x) * ratio,
      y: cy - (cy - t.y) * ratio,
      scale: newScale,
    }, 200);
  }, [size.width, size.height]);

  const zoomToNode = useCallback((node) => {
    if (!node || size.width === 0) return;
    const targetScale = clamp(1.5, 0.05, 8);
    const target = {
      x: size.width / 2 - node.x * targetScale,
      y: size.height / 2 - node.y * targetScale,
      scale: targetScale,
    };
    stateRef.current.selectedNode = node;
    if (onSelectNode) onSelectNode(node);
    animateTransform(stateRef, target, 700);
  }, [size.width, size.height, onSelectNode]);

  const getNodes = useCallback(() => {
    return stateRef.current.allNodes || [];
  }, []);

  const getLinks = useCallback(() => {
    return stateRef.current.allLinks || [];
  }, []);

  const followNode = useCallback((node) => {
    if (!node || size.width === 0) return;
    const targetScale = clamp(1.5, 0.05, 8);
    const target = {
      x: size.width / 2 - node.x * targetScale,
      y: size.height / 2 - node.y * targetScale,
      scale: targetScale,
    };
    animateTransform(stateRef, target, 700);
  }, [size.width, size.height]);

  useImperativeHandle(ref, () => ({
    resetView: () => fitAll(true),
    zoomToCluster,
    zoomBy,
    zoomToNode,
    followNode,
    getNodes,
    getLinks,
  }), [fitAll, zoomToCluster, zoomBy, zoomToNode, followNode, getNodes, getLinks]);

  // Set up canvas, renderer, and interactions
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !layoutRef.current || size.width === 0 || size.height === 0) return;
    if (!layoutRef.current.clusterMetas.length) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.width * dpr;
    canvas.height = size.height * dpr;
    canvas.style.width = size.width + 'px';
    canvas.style.height = size.height + 'px';

    fitAll(false);

    if (rendererRef.current) rendererRef.current.stop();
    const renderer = createUniverseRenderer(canvas, () => stateRef.current);
    rendererRef.current = renderer;
    renderer.start();

    if (cleanupRef.current) cleanupRef.current();

    const cleanup = setupInteractions(
      canvas,
      () => {
        const scale = stateRef.current.transform.scale;
        if (scale < 0.4) {
          return (stateRef.current.clusterMetas || []).map((cm) => ({
            x: cm.cx,
            y: cm.cy,
            radius: cm.visualRadius,
            _isClusterCenter: true,
            _clusterIndex: cm.index,
            name: cm.label,
          }));
        }
        return stateRef.current.allNodes || [];
      },
      () => stateRef.current.transform,
      {
        onHover: (node) => {
          if (node && node._isClusterCenter) {
            stateRef.current.hoveredNode = null;
          } else {
            stateRef.current.hoveredNode = node;
          }
          if (onHoverNode) onHoverNode(node);
        },
        onClick: (node) => {
          if (node && node._isClusterCenter) {
            zoomToCluster(node._clusterIndex);
            return;
          }
          stateRef.current.selectedNode = node || null;
          if (onSelectNode) onSelectNode(node || null);
        },
        onPan: (dx, dy) => {
          const t = stateRef.current.transform;
          stateRef.current.transform = { ...t, x: t.x + dx, y: t.y + dy };
        },
        onZoom: (delta, cx, cy) => {
          const t = stateRef.current.transform;
          const newScale = clamp(t.scale * delta, 0.05, 8);
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
      rendererRef.current = null;
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [universeData, size.width, size.height, fitAll, zoomToCluster, onSelectNode, onHoverNode]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', position: 'absolute', top: 0, left: 0, cursor: 'grab' }}
      />
    </div>
  );
});

export default UniverseCanvas;
