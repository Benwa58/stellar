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
        .strength((d) => d.strength || 0.3)
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
    .force(
      'driftRadial',
      forceRadial(
        Math.max(width, height) * 0.45,
        width / 2,
        height / 2
      ).strength((d) => (d.isDrift ? 0.5 : 0))
    )
    .alphaDecay(FORCE_CONFIG.alphaDecay)
    .velocityDecay(FORCE_CONFIG.velocityDecay);

  return simulation;
}
