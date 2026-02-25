export const MIN_SEED_ARTISTS = 3;
export const MAX_RECOMMENDATIONS_BASE = 40;
export const MAX_RECOMMENDATIONS_PER_SEED = 10;
export const MAX_RECOMMENDATIONS_MIN = 80;
export const MAX_RECOMMENDATIONS_CAP = 150;

export function getMaxRecommendations(seedCount) {
  const scaled = MAX_RECOMMENDATIONS_BASE + seedCount * MAX_RECOMMENDATIONS_PER_SEED;
  return Math.max(MAX_RECOMMENDATIONS_MIN, Math.min(scaled, MAX_RECOMMENDATIONS_CAP));
}

// Saved maps (STORAGE_KEY kept for localStorage migration)
export const STORAGE_KEY = 'stellar_saved_maps';

export const FORCE_CONFIG = {
  linkDistanceSeedToSeed: 180,
  linkDistanceSeedToRec: 120,
  linkDistanceRecToRec: 80,
  linkDistanceChain: 90,
  linkDistanceDrift: 300,
  chargeSeed: -400,
  chargeRecommendation: -100,
  chargeDrift: -40,
  centerStrength: 0.03,
  collisionPadding: 3,
  alphaDecay: 0.012,
  velocityDecay: 0.3,
};

export const NODE_SIZES = {
  seedMin: 14,
  seedMax: 18,
  recMin: 3,
  recMax: 14,
  gemMin: 2.5,
  gemMax: 10,
  driftMin: 2,
  driftMax: 7,
};

export const GENRE_COLORS = {
  rock: { h: 10, s: 80, l: 55 },
  metal: { h: 0, s: 75, l: 45 },
  electronic: { h: 195, s: 85, l: 55 },
  dance: { h: 185, s: 80, l: 50 },
  'hip-hop': { h: 270, s: 70, l: 55 },
  rap: { h: 275, s: 65, l: 50 },
  pop: { h: 330, s: 80, l: 60 },
  jazz: { h: 35, s: 75, l: 55 },
  blues: { h: 25, s: 70, l: 50 },
  classical: { h: 230, s: 40, l: 70 },
  country: { h: 140, s: 60, l: 50 },
  folk: { h: 130, s: 50, l: 55 },
  'r&b': { h: 280, s: 60, l: 50 },
  soul: { h: 290, s: 55, l: 55 },
  indie: { h: 165, s: 65, l: 55 },
  alternative: { h: 170, s: 60, l: 50 },
  latin: { h: 45, s: 85, l: 55 },
  reggae: { h: 120, s: 65, l: 45 },
  punk: { h: 350, s: 75, l: 50 },
  'k-pop': { h: 310, s: 80, l: 60 },
  default: { h: 220, s: 50, l: 60 },
};

export const GALAXY_COLORS = {
  background: '#0a0a1a',
  backgroundGradientInner: 'rgba(15, 15, 40, 1)',
  backgroundGradientOuter: 'rgba(5, 5, 15, 1)',
  seedStar: '#FFD700',
  seedStarCore: '#FFFFFF',
  linkDefault: 'rgba(80, 100, 140, 0.08)',
  linkHighlight: 'rgba(150, 180, 255, 0.4)',
  hoverRing: 'rgba(255, 255, 255, 0.6)',
  nebulaOpacity: 0.04,
  bridgeLinkColor: 'rgba(100, 220, 200, 0.12)',
  bridgeLinkHighlight: 'rgba(100, 220, 200, 0.35)',
  chainLinkColor: 'rgba(200, 160, 255, 0.2)',
  chainLinkHighlight: 'rgba(200, 160, 255, 0.5)',
  chainNodeRing: 'rgba(200, 160, 255, 0.7)',
  hiddenGemRing: 'rgba(100, 220, 200, 0.7)',
  driftNodeRing: 'rgba(220, 130, 100, 0.7)',
  driftLinkColor: 'rgba(220, 150, 120, 0.12)',
  driftLinkHighlight: 'rgba(220, 150, 120, 0.35)',
};

export const PARTICLE_CONFIG = {
  count: 250,
  minRadius: 0.3,
  maxRadius: 1.5,
  minOpacity: 0.1,
  maxOpacity: 0.5,
  twinkleSpeed: 0.002,
};

export const SCORING_WEIGHTS = {
  overlap: 0.50,
  genre: 0.35,
  popularity: 0.15,
};

// Deep cut & bridge discovery
export const HIDDEN_GEM_FAN_THRESHOLD = 100000;
export const DEEP_CUT_INTERMEDIATE_COUNT = 5;
export const DEEP_CUT_LIMIT = 15;
export const BRIDGE_SEARCH_LIMIT = 8;
export const MAX_BRIDGE_PAIRS = 10;
export const MAX_CHAIN_BRIDGE_PAIRS = 8;
export const CHAIN_BRIDGE_MAX_HOPS = 6;
export const CHAIN_BRIDGE_BRANCH_LIMITS = [25, 20, 15, 12, 10, 8];
export const HIDDEN_GEM_COLOR = { h: 175, s: 70, l: 55 };
export const CHAIN_BRIDGE_COLOR = { h: 270, s: 60, l: 65 };
export const DRIFT_COLOR = { h: 15, s: 65, l: 60 };
