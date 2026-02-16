import { GENRE_COLORS } from '../utils/constants';
import { getGenreCategory } from '../utils/colorUtils';
import { jaccardSimilarity } from '../utils/mathUtils';

export function buildGenreFrequencyMap(seedArtists) {
  const freq = new Map();
  for (const artist of seedArtists) {
    for (const genre of artist.genres) {
      const lower = genre.toLowerCase();
      freq.set(lower, (freq.get(lower) || 0) + 1);
    }
  }
  return freq;
}

export function computeGenreSimilarity(candidateGenres, genreFrequencyMap) {
  if (!candidateGenres || candidateGenres.length === 0) return 0;
  if (genreFrequencyMap.size === 0) return 0;

  const candidateSet = new Set(candidateGenres.map((g) => g.toLowerCase()));
  const seedGenreSet = new Set(genreFrequencyMap.keys());

  const jaccard = jaccardSimilarity(candidateSet, seedGenreSet);

  let weightedOverlap = 0;
  let maxWeight = 0;
  for (const [genre, count] of genreFrequencyMap) {
    maxWeight += count;
    if (candidateSet.has(genre)) {
      weightedOverlap += count;
    }
  }

  const weightedScore = maxWeight > 0 ? weightedOverlap / maxWeight : 0;

  return jaccard * 0.4 + weightedScore * 0.6;
}

export function clusterByGenre(nodes) {
  const clusters = new Map();

  for (const node of nodes) {
    const category = getGenreCategory(node.genres);
    if (!clusters.has(category)) {
      clusters.set(category, {
        category,
        genres: [],
        color: GENRE_COLORS[category] || GENRE_COLORS.default,
        nodes: [],
      });
    }
    const cluster = clusters.get(category);
    cluster.nodes.push(node);

    for (const g of (node.genres || [])) {
      if (!cluster.genres.includes(g)) {
        cluster.genres.push(g);
      }
    }
  }

  return Array.from(clusters.values());
}
