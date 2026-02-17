import { NODE_SIZES, HIDDEN_GEM_COLOR } from '../utils/constants';
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

    const isHiddenGem = node.tier === 'hidden_gem';

    // Size scales with match strength within each tier
    const sizeMin = isHiddenGem ? NODE_SIZES.gemMin : NODE_SIZES.recMin;
    const sizeMax = isHiddenGem ? NODE_SIZES.gemMax : NODE_SIZES.recMax;
    const radius = sizeMin + scoreNorm * (sizeMax - sizeMin);

    const genreHsl = isHiddenGem ? HIDDEN_GEM_COLOR : getGenreColor(node.genres);
    const brightness = 0.4 + scoreNorm * 0.6;

    // Hidden gems get a teal/cyan tint blended with genre color
    let color, glowColor;
    if (isHiddenGem) {
      const { h, s, l } = HIDDEN_GEM_COLOR;
      color = hslToRgba(h, s, l, brightness);
      glowColor = hslToRgba(h, s, l, brightness * 0.3);
    } else {
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
      isHiddenGem,
      isBridge: node.discoveryMethod === 'bridge',
      isChainBridge: node.discoveryMethod === 'chain_bridge' || node.isChainBridge,
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
    chainPosition: link.chainPosition,
    chainLength: link.chainLength,
  }));

  return { nodes, links, genreClusters };
}
