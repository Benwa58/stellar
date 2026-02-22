import { useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { useAppState, useDispatch } from '../state/AppContext';
import { useAuth } from '../state/AuthContext';
import { SELECT_NODE, HOVER_NODE } from '../state/actions';
import { useCanvasSize } from '../hooks/useCanvasSize';
import { buildGalaxyGraph } from './galaxyLayout';
import { createSimulation } from './forceGraph';
import { createRenderer } from './canvasRenderer';
import { createParticleSystem } from './particleSystem';
import { renderNebulaeToCanvas } from './nebulaRenderer';
import { setupInteractions } from './interactionHandler';
import { clamp } from '../utils/mathUtils';

/**
 * Compute a transform that fits all nodes within the viewport with padding.
 */
function computeFitTransform(nodes, viewWidth, viewHeight, padding = 60) {
  if (!nodes || nodes.length === 0) return { x: 0, y: 0, scale: 1 };

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const node of nodes) {
    if (node.x == null || node.y == null) continue;
    const r = node.radius || 10;
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
  const scale = clamp(Math.min(scaleX, scaleY), 0.2, 2);

  // Center the graph in the viewport
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const x = viewWidth / 2 - cx * scale;
  const y = viewHeight / 2 - cy * scale;

  return { x, y, scale };
}

/**
 * Smoothly animate the transform from current to target over `duration` ms.
 * Uses ease-out cubic for a natural deceleration feel.
 */
function animateTransform(stateRef, target, duration = 400) {
  const start = { ...stateRef.current.transform };
  const startTime = performance.now();

  function step(now) {
    const elapsed = now - startTime;
    const t = Math.min(elapsed / duration, 1);
    // Ease-out cubic: 1 - (1-t)^3
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

const GalaxyCanvas = forwardRef(function GalaxyCanvas(props, ref) {
  const { galaxyData, selectedNode: reduxSelectedNode } = useAppState();
  const dispatch = useDispatch();
  const { favorites, dislikes } = useAuth();

  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const stateRef = useRef({
    nodes: null,
    links: null,
    particles: null,
    transform: { x: 0, y: 0, scale: 1 },
    hoveredNode: null,
    selectedNode: null,
    favoriteNames: new Set(),
    dislikeNames: new Set(),
    isExpanded: false,
    expandTransition: 0,
  });
  const simulationRef = useRef(null);
  const rendererRef = useRef(null);
  const cleanupRef = useRef(null);

  const size = useCanvasSize(containerRef);

  // Smoothly animate view to fit all nodes
  const resetView = useCallback(() => {
    const { nodes } = stateRef.current;
    if (!nodes || size.width === 0 || size.height === 0) return;
    const target = computeFitTransform(nodes, size.width, size.height);
    animateTransform(stateRef, target);
  }, [size.width, size.height]);

  // Smoothly animate view to center on a specific node
  const focusOnNode = useCallback((node) => {
    if (!node || node.x == null || node.y == null || size.width === 0 || size.height === 0) return;
    const scale = 1.5;
    const target = {
      x: size.width / 2 - node.x * scale,
      y: size.height / 2 - node.y * scale,
      scale,
    };
    animateTransform(stateRef, target, 500);
  }, [size.width, size.height]);

  // Return current positioned nodes
  const getNodes = useCallback(() => {
    return stateRef.current.nodes || [];
  }, []);

  // Capture canvas as a PNG data URL with optional watermark
  const captureImage = useCallback((options = {}) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    if (options.watermark) {
      const ctx = canvas.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      ctx.save();
      ctx.font = `600 ${14 * dpr}px 'Space Grotesk', sans-serif`;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.textAlign = 'right';
      ctx.fillText('Stellar', canvas.width - 16 * dpr, canvas.height - 12 * dpr);
      ctx.restore();
    }

    return canvas.toDataURL('image/png');
  }, []);

  // Merge new nodes into the existing simulation without tearing down
  const mergeNodes = useCallback((newNodes, newLinks) => {
    const graph = buildGalaxyGraph({ nodes: newNodes, links: newLinks, genreClusters: [] });
    const existingNodes = stateRef.current.nodes || [];
    const existingLinks = stateRef.current.links || [];

    // Position new nodes at the periphery (outside existing bounds)
    const cx = existingNodes.reduce((s, n) => s + (n.x || 0), 0) / (existingNodes.length || 1);
    const cy = existingNodes.reduce((s, n) => s + (n.y || 0), 0) / (existingNodes.length || 1);
    for (const node of graph.nodes) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 300 + Math.random() * 200;
      node.x = cx + Math.cos(angle) * dist;
      node.y = cy + Math.sin(angle) * dist;
    }

    // Merge into stateRef
    stateRef.current.nodes = [...existingNodes, ...graph.nodes];
    stateRef.current.links = [...existingLinks, ...graph.links];

    // Reheat simulation with merged data
    if (simulationRef.current) {
      simulationRef.current.nodes(stateRef.current.nodes);
      simulationRef.current.force('link').links(stateRef.current.links);
      simulationRef.current.alpha(0.3).restart();
    }
  }, []);

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({ resetView, focusOnNode, getNodes, captureImage, mergeNodes }), [resetView, focusOnNode, getNodes, captureImage, mergeNodes]);

  // Sync Redux selectedNode to canvas stateRef so the renderer highlights it.
  // The player dispatches SELECT_NODE with a copy, so we match by ID to find
  // the actual node reference that the renderer uses for identity comparison.
  useEffect(() => {
    if (!reduxSelectedNode) {
      stateRef.current.selectedNode = null;
      return;
    }
    const nodes = stateRef.current.nodes;
    if (!nodes) return;
    const match = nodes.find((n) => n.id === reduxSelectedNode.id);
    stateRef.current.selectedNode = match || null;
  }, [reduxSelectedNode]);

  // Sync favorites to canvas state for rendering indicators
  useEffect(() => {
    stateRef.current.favoriteNames = new Set(favorites.map((f) => f.artistName));
  }, [favorites]);

  // Sync dislikes to canvas state for rendering indicators
  useEffect(() => {
    stateRef.current.dislikeNames = new Set(dislikes.map((d) => d.artistName));
  }, [dislikes]);

  // Track drift merge generation to detect incremental merges
  const driftGenRef = useRef(0);

  // Build graph data when galaxyData changes
  useEffect(() => {
    if (!galaxyData) return;

    // If this is a drift merge (incremental), handle it separately
    if (galaxyData._driftMergeGen && galaxyData._driftMergeGen > driftGenRef.current) {
      driftGenRef.current = galaxyData._driftMergeGen;
      // Extract only new drift nodes/links to merge
      const existingIds = new Set((stateRef.current.nodes || []).map((n) => n.id));
      const newNodes = galaxyData.nodes.filter((n) => !existingIds.has(n.id));
      const newLinks = galaxyData.links.filter((l) => {
        const srcId = typeof l.source === 'string' ? l.source : l.source?.id;
        const tgtId = typeof l.target === 'string' ? l.target : l.target?.id;
        return newNodes.some((n) => n.id === srcId || n.id === tgtId);
      });
      if (newNodes.length > 0) {
        mergeNodes(newNodes, newLinks);
        stateRef.current.isExpanded = true;
      }
      return;
    }

    const graph = buildGalaxyGraph(galaxyData);
    stateRef.current.nodes = graph.nodes;
    stateRef.current.links = graph.links;
    stateRef.current.genreClusters = graph.genreClusters;
    stateRef.current.isExpanded = false;
    stateRef.current.expandTransition = 0;
  }, [galaxyData, mergeNodes]);

  // Set up simulation and renderer when size is ready
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !stateRef.current.nodes || size.width === 0 || size.height === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.width * dpr;
    canvas.height = size.height * dpr;
    canvas.style.width = size.width + 'px';
    canvas.style.height = size.height + 'px';

    const { nodes, links, genreClusters } = stateRef.current;

    // Reset transform to center
    stateRef.current.transform = { x: 0, y: 0, scale: 1 };

    // Create particles
    stateRef.current.particles = createParticleSystem(size.width, size.height);

    // Create simulation
    if (simulationRef.current) simulationRef.current.stop();
    const sim = createSimulation(nodes, links, size.width, size.height);
    simulationRef.current = sim;

    // Create renderer
    if (rendererRef.current) rendererRef.current.stop();
    const renderer = createRenderer(canvas, () => stateRef.current);
    rendererRef.current = renderer;

    // Update nebula after simulation has run a bit
    let nebulaTimeout = setTimeout(() => {
      const nebulaCanvas = renderNebulaeToCanvas(genreClusters, size.width, size.height);
      renderer.setNebulaCanvas(nebulaCanvas);
    }, 1000);

    sim.on('tick', () => {
      // Renderer runs its own RAF loop
    });

    sim.on('end', () => {
      renderer.setSettled(true);
      // Re-render nebulae with final positions
      const nebulaCanvas = renderNebulaeToCanvas(genreClusters, size.width, size.height);
      renderer.setNebulaCanvas(nebulaCanvas);
      // Smoothly auto-fit to show all nodes once layout is final
      const target = computeFitTransform(nodes, size.width, size.height);
      animateTransform(stateRef, target, 600);
    });

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
          dispatch({ type: HOVER_NODE, payload: node });
        },
        onClick: (node) => {
          stateRef.current.selectedNode = node;
          dispatch({ type: SELECT_NODE, payload: node });
        },
        onPan: (dx, dy) => {
          const t = stateRef.current.transform;
          stateRef.current.transform = { ...t, x: t.x + dx, y: t.y + dy };
        },
        onZoom: (delta, cx, cy) => {
          const t = stateRef.current.transform;
          const newScale = clamp(t.scale * delta, 0.2, 5);
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
      clearTimeout(nebulaTimeout);
      sim.stop();
      renderer.stop();
      cleanup();
    };
  }, [galaxyData, size.width, size.height, dispatch]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', cursor: 'grab' }}
      />
    </div>
  );
});

export default GalaxyCanvas;
