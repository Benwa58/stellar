import { NODE_SIZES } from '../utils/constants';
import { getGenreColorString, getGenreColor } from '../utils/colorUtils';
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
    const radius =
      NODE_SIZES.recMin + scoreNorm * (NODE_SIZES.recMax - NODE_SIZES.recMin);
    const genreHsl = getGenreColor(node.genres);
    const brightness = 0.4 + scoreNorm * 0.6;

    return {
      ...node,
      radius,
      color: getGenreColorString(node.genres, brightness),
      glowColor: getGenreColorString(node.genres, brightness * 0.3),
      genreHsl,
      brightness,
    };
  });

  const links = rawLinks.map((link) => ({
    source: link.source,
    target: link.target,
    strength: link.strength || 0.3,
    opacity: 0.03 + (link.strength || 0.3) * 0.12,
  }));

  return { nodes, links, genreClusters };
}
