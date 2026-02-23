import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
  forceRadial,
} from 'd3-force';
import { FORCE_CONFIG } from '../utils/constants';

export function createSimulation(nodes, links, width, height) {
  // Adaptive drift radius — recalculated each tick from the live core-galaxy extent.
  // This guarantees drift nodes stay outside no matter how large the galaxy grows.
  const driftRadialForce = forceRadial(
    Math.max(width, height) * 0.45,
    width / 2,
    height / 2
  ).strength((d) => (d.isDrift ? 0.8 : 0));

  const simulation = forceSimulation(nodes)
    .force(
      'link',
      forceLink(links)
        .id((d) => d.id)
        .distance((d) => {
          const sourceIsSeed = d.source.type === 'seed' || typeof d.source === 'string';
          const targetIsSeed = d.target.type === 'seed' || typeof d.target === 'string';
          const isGemLink = (d.source.isHiddenGem || d.target.isHiddenGem);
          const isBridgeLink = d.isBridgeLink;

          // Chain links: keep chain nodes close to form a visible path
          if (d.isChainLink) {
            return FORCE_CONFIG.linkDistanceChain;
          }
          // Drift links: push drift nodes to the outer orbit
          if (d.isDriftLink) {
            return FORCE_CONFIG.linkDistanceDrift;
          }
          if (sourceIsSeed && targetIsSeed) {
            // Bridge links between seeds are wider
            return isBridgeLink
              ? FORCE_CONFIG.linkDistanceSeedToSeed * 1.2
              : FORCE_CONFIG.linkDistanceSeedToSeed;
          }
          if (sourceIsSeed || targetIsSeed) {
            // Hidden gem links are slightly farther from seeds
            return isGemLink
              ? FORCE_CONFIG.linkDistanceSeedToRec * 1.3
              : FORCE_CONFIG.linkDistanceSeedToRec;
          }
          return FORCE_CONFIG.linkDistanceRecToRec;
        })
        // Drift links use weaker strength so they can't overpower the radial constraint
        .strength((d) => {
          if (d.isDriftLink) return 0.08;
          return d.strength || 0.3;
        })
    )
    .force(
      'charge',
      forceManyBody().strength((d) => {
        if (d.type === 'seed') return FORCE_CONFIG.chargeSeed;
        // Drift nodes push very weakly — outer orbit
        if (d.isDrift) return FORCE_CONFIG.chargeDrift;
        // Hidden gems push less so they cluster on the periphery
        if (d.isHiddenGem) return FORCE_CONFIG.chargeRecommendation * 0.7;
        return FORCE_CONFIG.chargeRecommendation;
      })
    )
    .force('center', forceCenter(width / 2, height / 2).strength(FORCE_CONFIG.centerStrength))
    .force(
      'collision',
      forceCollide().radius((d) => d.radius + FORCE_CONFIG.collisionPadding)
    )
    .force('x', forceX(width / 2).strength((d) => (d.isDrift ? 0.002 : 0.02)))
    .force('y', forceY(height / 2).strength((d) => (d.isDrift ? 0.002 : 0.02)))
    // Push drift nodes to the outer orbit — they should always sit outside seeds/recs/gems
    .force('driftRadial', driftRadialForce)
    .alphaDecay(FORCE_CONFIG.alphaDecay)
    .velocityDecay(FORCE_CONFIG.velocityDecay);

  // On every tick, measure the actual core-galaxy extent and update the drift
  // radial target so it always sits well beyond the outermost non-drift node.
  simulation.on('tick.driftAdapt', () => {
    const allNodes = simulation.nodes();
    const hasDrift = allNodes.some((n) => n.isDrift);
    if (!hasDrift) return;

    // Compute centroid and max extent of core (non-drift) nodes
    const coreNodes = allNodes.filter((n) => !n.isDrift);
    if (coreNodes.length === 0) return;

    let cx = 0, cy = 0;
    for (const n of coreNodes) { cx += n.x; cy += n.y; }
    cx /= coreNodes.length;
    cy /= coreNodes.length;

    let maxDist = 0;
    for (const n of coreNodes) {
      const dx = n.x - cx;
      const dy = n.y - cy;
      maxDist = Math.max(maxDist, Math.sqrt(dx * dx + dy * dy));
    }

    // Drift orbit = 1.6× the core extent, at least 400px
    const adaptiveRadius = Math.max(maxDist * 1.6, 400);
    driftRadialForce.radius(adaptiveRadius).x(cx).y(cy);
  });

  return simulation;
}
