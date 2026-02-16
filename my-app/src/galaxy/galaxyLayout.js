import { NODE_SIZES, HIDDEN_GEM_COLOR } from '../utils/constants';
import { getGenreColorString, getGenreColor, hslToRgba } from '../utils/colorUtils';
import { normalize } from '../utils/mathUtils';

export function buildGalaxyGraph(galaxyData) {
  const { nodes: rawNodes, links: rawLinks, genreClusters } = galaxyData;

  const recNodes = rawNodes.filter((n) => n.type === 'recommendation');
  const scores = recNodes.map((n) => n.compositeScore);
  const minScore = Math.min(...scores, 0);
  const maxScore = Math.max(...scores, 1);

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

    const scoreNorm = normalize(node.compositeScore, minScore, maxScore);
    const isHiddenGem = node.tier === 'hidden_gem';

    // Hidden gems: smaller size range
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
    };
  });

  const links = rawLinks.map((link) => ({
    source: link.source,
    target: link.target,
    strength: link.strength || 0.3,
    opacity: 0.03 + (link.strength || 0.3) * 0.12,
    isBridgeLink: link.isBridgeLink || false,
    isDeepCutLink: link.isDeepCutLink || false,
  }));

  return { nodes, links, genreClusters };
}
