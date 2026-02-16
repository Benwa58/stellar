import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
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
          if (sourceIsSeed && targetIsSeed) return FORCE_CONFIG.linkDistanceSeedToSeed;
          if (sourceIsSeed || targetIsSeed) return FORCE_CONFIG.linkDistanceSeedToRec;
          return FORCE_CONFIG.linkDistanceRecToRec;
        })
        .strength((d) => d.strength || 0.3)
    )
    .force(
      'charge',
      forceManyBody().strength((d) =>
        d.type === 'seed'
          ? FORCE_CONFIG.chargeSeed
          : FORCE_CONFIG.chargeRecommendation
      )
    )
    .force('center', forceCenter(width / 2, height / 2).strength(FORCE_CONFIG.centerStrength))
    .force(
      'collision',
      forceCollide().radius((d) => d.radius + FORCE_CONFIG.collisionPadding)
    )
    .force('x', forceX(width / 2).strength(0.02))
    .force('y', forceY(height / 2).strength(0.02))
    .alphaDecay(FORCE_CONFIG.alphaDecay)
    .velocityDecay(FORCE_CONFIG.velocityDecay);

  return simulation;
}
