import { useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { useCanvasSize } from '../hooks/useCanvasSize';
import { setupInteractions } from './interactionHandler';
import { createUniverseRenderer, hitTestCluster } from './universeRenderer';
import { buildClusterGalaxyData } from './universeGraphBuilder';
import { buildGalaxyGraph } from './galaxyLayout';
import { createSimulation } from './forceGraph';
import { createRenderer } from './canvasRenderer';
import { createParticleSystem } from './particleSystem';
import { renderNebulaeToCanvas } from './nebulaRenderer';
import { clamp } from '../utils/mathUtils';

/**
 * Compute a transform that fits a bounding box within the viewport.
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
  const scale = clamp(Math.min(scaleX, scaleY), 0.2, 3);

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const x = viewWidth / 2 - cx * scale;
  const y = viewHeight / 2 - cy * scale;

  return { x, y, scale };
}

/**
 * Compute fit transform for cluster centers (using nebula radius as size).
 */
function computeClusterFitTransform(clusterCenters, viewWidth, viewHeight) {
  if (!clusterCenters || clusterCenters.length === 0) return { x: 0, y: 0, scale: 1 };

  const items = clusterCenters.map((c) => {
    const r = 80 + c.memberCount * 14 + (c.recCount || 0) * 6;
    return { x: c.x, y: c.y, radius: r * 1.9 };
  });

  return computeFitTransform(items, viewWidth, viewHeight, 40);
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
  { nodes, clusterCenters, bridgeLinks, recLinks, clusters, onSelectNode, onHoverNode, onClusterFocus },
  ref
) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);

  // Overview state (nebula view)
  const overviewStateRef = useRef({
    clusterCenters: null,
    bridgeLinks: null,
    transform: { x: 0, y: 0, scale: 1 },
    hoveredClusterId: null,
    overviewOpacity: 1,
  });

  // Cluster mode state (galaxy rendering)
  const clusterStateRef = useRef({
    nodes: null,
    links: null,
    particles: null,
    transform: { x: 0, y: 0, scale: 1 },
    hoveredNode: null,
    selectedNode: null,
    favoriteNames: new Set(),
    dislikeNames: new Set(),
    knownNames: new Set(),
    discoveredNames: new Set(),
    isExpanded: false,
    expandTransition: 0,
    driftOrbit: null,
  });

  // Mode tracking
  const modeRef = useRef('overview'); // 'overview' | 'cluster' | 'transitioning'
  const focusedClusterIdRef = useRef(null);
  const transitionRef = useRef(null); // RAF id for transition animation

  // Renderer refs
  const overviewRendererRef = useRef(null);
  const clusterRendererRef = useRef(null);
  const clusterSimulationRef = useRef(null);
  const cleanupRef = useRef(null);
  const clusterCleanupRef = useRef(null);

  // Second canvas for cross-fade (cluster mode renders here during transition)
  const clusterCanvasRef = useRef(null);

  const size = useCanvasSize(containerRef);

  // Sync overview props to state
  useEffect(() => {
    overviewStateRef.current.clusterCenters = clusterCenters;
    overviewStateRef.current.bridgeLinks = bridgeLinks;
  }, [clusterCenters, bridgeLinks]);

  // --- Tear down cluster mode ---
  const teardownClusterMode = useCallback(() => {
    if (clusterSimulationRef.current) {
      clusterSimulationRef.current.stop();
      clusterSimulationRef.current = null;
    }
    if (clusterRendererRef.current) {
      clusterRendererRef.current.stop();
      clusterRendererRef.current = null;
    }
    if (clusterCleanupRef.current) {
      clusterCleanupRef.current();
      clusterCleanupRef.current = null;
    }
    clusterStateRef.current.nodes = null;
    clusterStateRef.current.links = null;
    clusterStateRef.current.particles = null;
    clusterStateRef.current.hoveredNode = null;
    clusterStateRef.current.selectedNode = null;
  }, []);

  // --- Enter cluster mode ---
  const enterClusterMode = useCallback((clusterId) => {
    if (!clusters || !clusters[clusterId] || !canvasRef.current || size.width === 0) return;

    const cluster = clusters[clusterId];
    focusedClusterIdRef.current = clusterId;

    // Build galaxy data from cluster
    const clusterGalaxyData = buildClusterGalaxyData(cluster);
    const graph = buildGalaxyGraph(clusterGalaxyData);

    // Set up cluster state
    clusterStateRef.current.nodes = graph.nodes;
    clusterStateRef.current.links = graph.links;
    clusterStateRef.current.genreClusters = graph.genreClusters;
    clusterStateRef.current.hoveredNode = null;
    clusterStateRef.current.selectedNode = null;
    clusterStateRef.current.isExpanded = false;
    clusterStateRef.current.expandTransition = 0;
    clusterStateRef.current.driftOrbit = null;

    // Create particles
    clusterStateRef.current.particles = createParticleSystem(size.width, size.height);

    // Create simulation
    const sim = createSimulation(graph.nodes, graph.links, size.width, size.height);
    clusterSimulationRef.current = sim;

    // Create renderer on main canvas
    const canvas = canvasRef.current;
    const renderer = createRenderer(canvas, () => clusterStateRef.current);
    clusterRendererRef.current = renderer;

    // Nebulae after simulation settles a bit
    let nebulaTimeout = setTimeout(() => {
      const nebulaCanvas = renderNebulaeToCanvas(graph.genreClusters, size.width, size.height);
      renderer.setNebulaCanvas(nebulaCanvas);
    }, 1000);

    sim.on('end', () => {
      renderer.setSettled(true);
      const nebulaCanvas = renderNebulaeToCanvas(graph.genreClusters, size.width, size.height);
      renderer.setNebulaCanvas(nebulaCanvas);
      // Auto-fit camera to show all cluster nodes
      const target = computeFitTransform(graph.nodes, size.width, size.height);
      animateTransform(clusterStateRef, target, 600);
    });

    // Set up cluster interactions
    if (clusterCleanupRef.current) clusterCleanupRef.current();
    const clusterCleanup = setupInteractions(
      canvas,
      () => clusterStateRef.current.nodes,
      () => clusterStateRef.current.transform,
      {
        onHover: (node) => {
          clusterStateRef.current.hoveredNode = node;
          if (onHoverNode) onHoverNode(node);
        },
        onClick: (node) => {
          if (node) {
            clusterStateRef.current.selectedNode = node;
            if (onSelectNode) onSelectNode(node);
          } else {
            clusterStateRef.current.selectedNode = null;
            if (onSelectNode) onSelectNode(null);
          }
        },
        onPan: (dx, dy) => {
          const t = clusterStateRef.current.transform;
          clusterStateRef.current.transform = { ...t, x: t.x + dx, y: t.y + dy };
        },
        onZoom: (delta, cx, cy) => {
          const t = clusterStateRef.current.transform;
          const newScale = clamp(t.scale * delta, 0.2, 8);
          const ratio = newScale / t.scale;
          clusterStateRef.current.transform = {
            x: cx - (cx - t.x) * ratio,
            y: cy - (cy - t.y) * ratio,
            scale: newScale,
          };
        },
      }
    );
    clusterCleanupRef.current = () => {
      clearTimeout(nebulaTimeout);
      clusterCleanup();
    };

    renderer.start();

    return () => {
      clearTimeout(nebulaTimeout);
    };
  }, [clusters, size.width, size.height, onSelectNode, onHoverNode]);

  // --- Cross-fade transition: overview → cluster ---
  const transitionToCluster = useCallback((clusterId) => {
    if (modeRef.current === 'transitioning') return;
    modeRef.current = 'transitioning';

    // Stop overview interactions during transition
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }

    // Animate camera zooming into the selected cluster's position
    const center = clusterCenters?.[clusterId];
    if (center) {
      const targetScale = 3;
      const target = {
        x: size.width / 2 - center.x * targetScale,
        y: size.height / 2 - center.y * targetScale,
        scale: targetScale,
      };
      animateTransform(overviewStateRef, target, 600);
    }

    // Cross-fade: overview fades out while cluster fades in
    const startTime = performance.now();
    const duration = 600;

    // Start building cluster mode during fade (simulation starts settling)
    // Stop overview renderer first so cluster renderer can use the canvas
    if (overviewRendererRef.current) {
      overviewRendererRef.current.stop();
      overviewRendererRef.current = null;
    }
    enterClusterMode(clusterId);

    // Animate cross-fade opacity
    function fadeStep(now) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic

      // Overview fades out, cluster galaxy fades in
      overviewStateRef.current.overviewOpacity = 1 - ease;

      if (t < 1) {
        transitionRef.current = requestAnimationFrame(fadeStep);
      } else {
        // Transition complete
        modeRef.current = 'cluster';
        overviewStateRef.current.overviewOpacity = 0;
        transitionRef.current = null;
        if (onClusterFocus) onClusterFocus(clusterId);
      }
    }

    transitionRef.current = requestAnimationFrame(fadeStep);
  }, [clusterCenters, size.width, size.height, enterClusterMode, onClusterFocus]);

  // --- Cross-fade transition: cluster → overview ---
  const transitionToOverview = useCallback(() => {
    if (modeRef.current === 'overview') return;
    modeRef.current = 'transitioning';

    const startTime = performance.now();
    const duration = 500;

    // Restart overview renderer
    const canvas = canvasRef.current;
    if (canvas && !overviewRendererRef.current) {
      const renderer = createUniverseRenderer(canvas, () => overviewStateRef.current);
      overviewRendererRef.current = renderer;
      renderer.start();
    }

    // Set up overview interactions
    if (cleanupRef.current) cleanupRef.current();
    setupOverviewInteractions(canvas);

    function fadeStep(now) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);

      overviewStateRef.current.overviewOpacity = ease;

      if (t < 1) {
        transitionRef.current = requestAnimationFrame(fadeStep);
      } else {
        // Transition complete — tear down cluster mode
        teardownClusterMode();
        modeRef.current = 'overview';
        overviewStateRef.current.overviewOpacity = 1;
        focusedClusterIdRef.current = null;
        transitionRef.current = null;

        // Animate camera back to fit-all-clusters view
        const target = computeClusterFitTransform(clusterCenters, size.width, size.height);
        animateTransform(overviewStateRef, target, 500);

        if (onClusterFocus) onClusterFocus(null);
      }
    }

    transitionRef.current = requestAnimationFrame(fadeStep);
  }, [clusterCenters, size.width, size.height, teardownClusterMode, onClusterFocus]);

  // --- Overview interaction setup helper ---
  const setupOverviewInteractions = useCallback((canvas) => {
    if (!canvas) return;

    const cleanup = setupInteractions(
      canvas,
      // In overview mode, no individual nodes to hit-test
      () => [],
      () => overviewStateRef.current.transform,
      {
        onHover: (_node) => {
          // Hit-test cluster centers for hover effect
          // We need mouse position in graph coords — the interaction handler
          // already converted, but since getNodes returns [], the node is null.
          // We'll use the canvas for cursor styling instead via mousemove below.
        },
        onClick: (_node) => {
          // Cluster click is handled separately via the mousemove/click
          // hit-testing below
        },
        onPan: (dx, dy) => {
          const t = overviewStateRef.current.transform;
          overviewStateRef.current.transform = { ...t, x: t.x + dx, y: t.y + dy };
        },
        onZoom: (delta, cx, cy) => {
          const t = overviewStateRef.current.transform;
          const newScale = clamp(t.scale * delta, 0.2, 8);
          const ratio = newScale / t.scale;
          overviewStateRef.current.transform = {
            x: cx - (cx - t.x) * ratio,
            y: cy - (cy - t.y) * ratio,
            scale: newScale,
          };
        },
      }
    );

    // Additional cluster hit-testing for hover and click
    function screenToGraph(sx, sy) {
      const t = overviewStateRef.current.transform;
      return {
        x: (sx - t.x) / t.scale,
        y: (sy - t.y) / t.scale,
      };
    }

    function getCanvasCoords(e) {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function handleClusterHover(e) {
      const { x, y } = getCanvasCoords(e);
      const { x: gx, y: gy } = screenToGraph(x, y);
      const idx = hitTestCluster(gx, gy, overviewStateRef.current.clusterCenters);
      overviewStateRef.current.hoveredClusterId = idx >= 0 ? idx : null;
      canvas.style.cursor = idx >= 0 ? 'pointer' : 'grab';
    }

    function handleClusterClick(e) {
      const { x, y } = getCanvasCoords(e);
      const { x: gx, y: gy } = screenToGraph(x, y);
      const idx = hitTestCluster(gx, gy, overviewStateRef.current.clusterCenters);
      if (idx >= 0) {
        transitionToCluster(idx);
      }
    }

    canvas.addEventListener('mousemove', handleClusterHover);
    canvas.addEventListener('click', handleClusterClick);

    const originalCleanup = cleanup;
    cleanupRef.current = () => {
      originalCleanup();
      canvas.removeEventListener('mousemove', handleClusterHover);
      canvas.removeEventListener('click', handleClusterClick);
    };
  }, [transitionToCluster]);

  // Reset view to fit all clusters (overview) or all cluster nodes
  const resetView = useCallback(() => {
    if (modeRef.current === 'cluster') {
      transitionToOverview();
    } else if (size.width > 0 && size.height > 0) {
      const target = computeClusterFitTransform(clusterCenters, size.width, size.height);
      animateTransform(overviewStateRef, target);
    }
  }, [clusterCenters, size.width, size.height, transitionToOverview]);

  // Zoom to a specific cluster (switches to cluster mode)
  const zoomToCluster = useCallback((clusterId) => {
    if (modeRef.current === 'cluster' && focusedClusterIdRef.current === clusterId) return;

    if (modeRef.current === 'cluster') {
      // Already in cluster mode, transition back first then to new cluster
      teardownClusterMode();
      modeRef.current = 'overview';
      overviewStateRef.current.overviewOpacity = 1;

      // Restart overview renderer briefly
      const canvas = canvasRef.current;
      if (canvas) {
        if (!overviewRendererRef.current) {
          const renderer = createUniverseRenderer(canvas, () => overviewStateRef.current);
          overviewRendererRef.current = renderer;
          renderer.start();
        }
      }
    }

    transitionToCluster(clusterId);
  }, [teardownClusterMode, transitionToCluster]);

  // Zoom by multiplier from viewport center
  const zoomBy = useCallback((factor) => {
    const stateRef = modeRef.current === 'cluster' ? clusterStateRef : overviewStateRef;
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
  useImperativeHandle(ref, () => ({
    resetView,
    zoomToCluster,
    zoomBy,
    backToOverview: transitionToOverview,
    getMode: () => modeRef.current,
    getFocusedClusterId: () => focusedClusterIdRef.current,
  }), [resetView, zoomToCluster, zoomBy, transitionToOverview]);

  // Set up canvas and overview renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !clusterCenters || clusterCenters.length === 0 || size.width === 0 || size.height === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.width * dpr;
    canvas.height = size.height * dpr;
    canvas.style.width = size.width + 'px';
    canvas.style.height = size.height + 'px';

    // Fit view to all clusters
    overviewStateRef.current.transform = computeClusterFitTransform(clusterCenters, size.width, size.height);
    overviewStateRef.current.overviewOpacity = 1;

    // Create overview renderer
    if (overviewRendererRef.current) overviewRendererRef.current.stop();
    const renderer = createUniverseRenderer(canvas, () => overviewStateRef.current);
    overviewRendererRef.current = renderer;
    renderer.start();
    modeRef.current = 'overview';

    // Set up overview interactions
    setupOverviewInteractions(canvas);

    return () => {
      renderer.stop();
      overviewRendererRef.current = null;
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      teardownClusterMode();
      if (transitionRef.current) {
        cancelAnimationFrame(transitionRef.current);
        transitionRef.current = null;
      }
    };
  }, [clusterCenters, size.width, size.height, setupOverviewInteractions, teardownClusterMode]);

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
