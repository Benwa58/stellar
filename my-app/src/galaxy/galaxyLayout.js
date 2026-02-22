import { NODE_SIZES, HIDDEN_GEM_COLOR, CHAIN_BRIDGE_COLOR, DRIFT_COLOR } from '../utils/constants';
import { getGenreColorString, getGenreColor, hslToRgba } from '../utils/colorUtils';

export function buildGalaxyGraph(galaxyData) {
  const { nodes: rawNodes, links: rawLinks, genreClusters } = galaxyData;

  const nodes = rawNodes.map((node) => {
    if (node.type === 'seed') {
      return {
        ...node,
        radius: NODE_SIZES.seedMax,
        color: 'rgba(255, 215, 0, 1)',
        glowColor: 'rgba(255, 215, 0, 0.3)',
        brightness: 1,
      };
    }

    // Use compositeScore directly (already 0–1) with a power curve
    // to spread out mid-range values and make differences more visible.
    const rawScore = Math.max(0, Math.min(1, node.compositeScore || 0));
    const scoreNorm = Math.pow(rawScore, 0.7);

    const isDrift = node.tier === 'drift' || node.isDrift;
    const isHiddenGem = node.tier === 'hidden_gem';
    const isChainBridge = node.discoveryMethod === 'chain_bridge' || node.isChainBridge;

    // Size scales with match strength within each tier
    let sizeMin, sizeMax;
    if (isDrift) {
      sizeMin = NODE_SIZES.driftMin;
      sizeMax = NODE_SIZES.driftMax;
    } else if (isHiddenGem) {
      sizeMin = NODE_SIZES.gemMin;
      sizeMax = NODE_SIZES.gemMax;
    } else {
      sizeMin = NODE_SIZES.recMin;
      sizeMax = NODE_SIZES.recMax;
    }
    const radius = sizeMin + scoreNorm * (sizeMax - sizeMin);

    const brightness = 0.4 + scoreNorm * 0.6;

    // Each tier gets a distinct color:
    // Chain bridges = purple, Drift = coral, Hidden gems = teal, Top picks = genre-based
    let color, glowColor, genreHsl;
    if (isChainBridge) {
      const { h, s, l } = CHAIN_BRIDGE_COLOR;
      genreHsl = CHAIN_BRIDGE_COLOR;
      color = hslToRgba(h, s, l, brightness);
      glowColor = hslToRgba(h, s, l, brightness * 0.3);
    } else if (isDrift) {
      const { h, s, l } = DRIFT_COLOR;
      genreHsl = DRIFT_COLOR;
      color = hslToRgba(h, s, l, brightness);
      glowColor = hslToRgba(h, s, l, brightness * 0.3);
    } else if (isHiddenGem) {
      const { h, s, l } = HIDDEN_GEM_COLOR;
      genreHsl = HIDDEN_GEM_COLOR;
      color = hslToRgba(h, s, l, brightness);
      glowColor = hslToRgba(h, s, l, brightness * 0.3);
    } else {
      genreHsl = getGenreColor(node.genres);
      color = getGenreColorString(node.genres, brightness);
      glowColor = getGenreColorString(node.genres, brightness * 0.3);
    }

    return {
      ...node,
      radius,
      color,
      glowColor,
      genreHsl,
      brightness,
      isDrift,
      isHiddenGem: isHiddenGem && !isChainBridge && !isDrift, // chain bridges and drift get their own renderer
      isBridge: node.discoveryMethod === 'bridge',
      isChainBridge,
    };
  });

  const links = rawLinks.map((link) => ({
    source: link.source,
    target: link.target,
    strength: link.strength || 0.3,
    opacity: 0.03 + (link.strength || 0.3) * 0.12,
    isBridgeLink: link.isBridgeLink || false,
    isDeepCutLink: link.isDeepCutLink || false,
    isChainLink: link.isChainLink || false,
    isDriftLink: link.isDriftLink || false,
    chainPosition: link.chainPosition,
    chainLength: link.chainLength,
  }));

  return { nodes, links, genreClusters };
}
