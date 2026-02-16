import { useRef, useEffect } from 'react';
import { useAppState, useDispatch } from '../state/AppContext';
import { SELECT_NODE, HOVER_NODE } from '../state/actions';
import { useCanvasSize } from '../hooks/useCanvasSize';
import { buildGalaxyGraph } from './galaxyLayout';
import { createSimulation } from './forceGraph';
import { createRenderer } from './canvasRenderer';
import { createParticleSystem } from './particleSystem';
import { renderNebulaeToCanvas } from './nebulaRenderer';
import { setupInteractions } from './interactionHandler';
import { clamp } from '../utils/mathUtils';

function GalaxyCanvas() {
  const { galaxyData } = useAppState();
  const dispatch = useDispatch();

  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const stateRef = useRef({
    nodes: null,
    links: null,
    particles: null,
    transform: { x: 0, y: 0, scale: 1 },
    hoveredNode: null,
    selectedNode: null,
  });
  const simulationRef = useRef(null);
  const rendererRef = useRef(null);
  const cleanupRef = useRef(null);

  const size = useCanvasSize(containerRef);

  // Build graph data when galaxyData changes
  useEffect(() => {
    if (!galaxyData) return;
    const graph = buildGalaxyGraph(galaxyData);
    stateRef.current.nodes = graph.nodes;
    stateRef.current.links = graph.links;
    stateRef.current.genreClusters = graph.genreClusters;
  }, [galaxyData]);

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
}

export default GalaxyCanvas;
