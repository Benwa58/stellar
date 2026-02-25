import { getGenreColor } from '../utils/colorUtils';

/**
 * Convert a single universe cluster into the galaxy graph format
 * expected by buildGalaxyGraph().
 *
 * Cluster data (from universeData.clusters[i]):
 *   { id, label, color: {h,s,l}, members: [{name, source, image}],
 *     recommendations: [{name, score, matchScore, suggestedBy}],
 *     topTags: string[] }
 *
 * Output matches galaxyLayout.js input:
 *   { nodes, links, genreClusters }
 */

const MAX_CLUSTER_NODES = 150;

export function buildClusterGalaxyData(cluster) {
  if (!cluster) return { nodes: [], links: [], genreClusters: [] };

  const { members = [], recommendations = [], topTags = [], color, label } = cluster;

  // --- Cap logic ---
  // Prioritize: all favorites first, then discovered (most recent first), then recs.
  // If members + recs > MAX_CLUSTER_NODES, truncate discovered to fit.
  const favorites = members.filter((m) => m.source === 'favorite');
  const discovered = members.filter((m) => m.source !== 'favorite');

  let includedMembers;
  const recsSlots = recommendations.length;
  const totalUncapped = favorites.length + discovered.length + recsSlots;

  if (totalUncapped > MAX_CLUSTER_NODES) {
    // All favorites always included, all recs always included
    const memberBudget = MAX_CLUSTER_NODES - recsSlots;
    if (memberBudget <= favorites.length) {
      // Extreme case: just favorites (truncated if needed)
      includedMembers = favorites.slice(0, Math.max(memberBudget, 0));
    } else {
      // All favorites + as many discovered as fit
      const discoveredBudget = memberBudget - favorites.length;
      includedMembers = [...favorites, ...discovered.slice(0, discoveredBudget)];
    }
  } else {
    includedMembers = [...favorites, ...discovered];
  }

  const memberNameSet = new Set(includedMembers.map((m) => m.name));

  // --- Build nodes ---
  const nodes = [];

  // Member nodes → type: 'seed' (gold stars, same visual as galaxy map seeds)
  for (const m of includedMembers) {
    nodes.push({
      id: `member-${m.name}`,
      name: m.name,
      type: 'seed',
      genres: topTags,
      compositeScore: m.source === 'favorite' ? 1.0 : 0.8,
      image: m.image || null,
      source: m.source,
      isMember: true,
    });
  }

  // Recommendation nodes → type: 'recommendation' (genre-colored, sized by matchScore)
  for (const rec of recommendations) {
    nodes.push({
      id: `rec-${rec.name}`,
      name: rec.name,
      type: 'recommendation',
      genres: topTags,
      compositeScore: rec.matchScore || 0.5,
      matchScore: rec.matchScore || 0.5,
      image: null,
      isRecommendation: true,
      suggestedBy: rec.suggestedBy || [],
    });
  }

  // --- Build links ---
  const links = [];

  // suggestedBy relationships: rec → member links
  for (const rec of recommendations) {
    for (const suggestorName of (rec.suggestedBy || [])) {
      if (!memberNameSet.has(suggestorName)) continue;
      links.push({
        source: `rec-${rec.name}`,
        target: `member-${suggestorName}`,
        strength: rec.matchScore || 0.3,
        isBridgeLink: false,
        isDeepCutLink: false,
        isChainLink: false,
        isDriftLink: false,
      });
    }
  }

  // Within-cluster member connections (weaker strength, connecting nearby members)
  // Connect each member to its 2 nearest neighbors by list proximity
  for (let i = 0; i < includedMembers.length; i++) {
    for (let j = i + 1; j < Math.min(i + 3, includedMembers.length); j++) {
      links.push({
        source: `member-${includedMembers[i].name}`,
        target: `member-${includedMembers[j].name}`,
        strength: 0.15,
        isBridgeLink: false,
        isDeepCutLink: false,
        isChainLink: false,
        isDriftLink: false,
      });
    }
  }

  // --- Build genreClusters (for nebula rendering) ---
  // Group all nodes under the cluster's genre color
  const genreClusters = [{
    genre: label || 'cluster',
    color: color || getGenreColor(topTags),
    nodes: nodes, // refs will be updated after simulation positions
    label: label,
  }];

  return { nodes, links, genreClusters };
}
