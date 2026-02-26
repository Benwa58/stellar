import { getGenreColor } from '../utils/colorUtils';
import { buildGalaxyGraph } from './galaxyLayout';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
} from 'd3-force';

/**
 * Convert a single universe cluster into the galaxy graph format
 * expected by buildGalaxyGraph().
 */

const MAX_CLUSTER_NODES = 150;

export function buildClusterGalaxyData(cluster) {
  if (!cluster) return { nodes: [], links: [], genreClusters: [] };

  const { members = [], recommendations = [], topTags = [], color, label } = cluster;

  const favorites = members.filter((m) => m.source === 'favorite');
  const discovered = members.filter((m) => m.source !== 'favorite');

  let includedMembers;
  const recsSlots = recommendations.length;
  const totalUncapped = favorites.length + discovered.length + recsSlots;

  if (totalUncapped > MAX_CLUSTER_NODES) {
    const memberBudget = MAX_CLUSTER_NODES - recsSlots;
    if (memberBudget <= favorites.length) {
      includedMembers = favorites.slice(0, Math.max(memberBudget, 0));
    } else {
      const discoveredBudget = memberBudget - favorites.length;
      includedMembers = [...favorites, ...discovered.slice(0, discoveredBudget)];
    }
  } else {
    includedMembers = [...favorites, ...discovered];
  }

  const memberNameSet = new Set(includedMembers.map((m) => m.name));

  const nodes = [];

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
      tier: rec.isHiddenGem ? 'hidden_gem' : (rec.isChainLink ? 'hidden_gem' : undefined),
      isHiddenGem: rec.isHiddenGem || false,
      isChainLink: rec.isChainLink || false,
      isChainBridge: rec.isChainLink || false,
      chainClusters: rec.chainClusters || null,
      remoteClusters: rec.remoteClusters || null,
      listeners: rec.listeners,
    });
  }

  const links = [];

  // Track how many recommendation links each member has received so we
  // can distribute recommendations across members more evenly.
  const memberLinkCount = new Map();
  for (const m of includedMembers) memberLinkCount.set(m.name, 0);

  // Connect recs to their suggestedBy members
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
      memberLinkCount.set(suggestorName, (memberLinkCount.get(suggestorName) || 0) + 1);
    }
  }

  // Distribute additional links to under-connected members so the visual
  // network doesn't concentrate all connections on a few nodes.
  if (includedMembers.length > 0 && recommendations.length > 0) {
    // Sort members by link count ascending — least connected first
    const sortedMembers = [...includedMembers].sort(
      (a, b) => (memberLinkCount.get(a.name) || 0) - (memberLinkCount.get(b.name) || 0)
    );
    let memberIdx = 0;

    for (const rec of recommendations) {
      const existingTargets = new Set(rec.suggestedBy || []);
      // Each rec gets 1-2 extra links to spread connections
      const extraLinks = existingTargets.size < 2 ? 2 : 1;
      let added = 0;

      for (let attempt = 0; attempt < sortedMembers.length && added < extraLinks; attempt++) {
        const candidate = sortedMembers[(memberIdx + attempt) % sortedMembers.length];
        if (existingTargets.has(candidate.name)) continue;

        links.push({
          source: `rec-${rec.name}`,
          target: `member-${candidate.name}`,
          strength: (rec.matchScore || 0.3) * 0.5,
          isBridgeLink: false,
          isDeepCutLink: false,
          isChainLink: false,
          isDriftLink: false,
        });
        memberLinkCount.set(candidate.name, (memberLinkCount.get(candidate.name) || 0) + 1);
        added++;
      }
      memberIdx = (memberIdx + 1) % sortedMembers.length;
    }
  }

  // Member-to-member links (spread across more pairs for better connectivity)
  for (let i = 0; i < includedMembers.length; i++) {
    const stride = Math.max(1, Math.floor(includedMembers.length / 6));
    for (let s = 1; s <= 2; s++) {
      const j = (i + s * stride) % includedMembers.length;
      if (j === i) continue;
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

  const genreClusters = [{
    genre: label || 'cluster',
    color: color || getGenreColor(topTags),
    nodes: nodes,
    label: label,
  }];

  return { nodes, links, genreClusters };
}

// ─── Unified universe layout ───────────────────────────────────────────

const CLUSTER_SPACING = 2; // scale server positions to give nodes room

/**
 * Run a d3-force simulation synchronously for a cluster's nodes,
 * centering around (0, 0). Returns when settled.
 */
function settleClusterLayout(nodes, links, simSize) {
  const sim = forceSimulation(nodes)
    .force(
      'link',
      forceLink(links)
        .id((d) => d.id)
        .distance((d) => {
          const srcSeed = typeof d.source === 'string' || d.source.type === 'seed';
          const tgtSeed = typeof d.target === 'string' || d.target.type === 'seed';
          if (srcSeed && tgtSeed) return 120;
          if (srcSeed || tgtSeed) return 80;
          return 60;
        })
        .strength((d) => d.strength || 0.3)
    )
    .force('charge', forceManyBody().strength((d) => (d.type === 'seed' ? -180 : -80)))
    .force('center', forceCenter(0, 0).strength(0.05))
    .force('collision', forceCollide().radius((d) => (d.radius || 8) + 3))
    .stop();

  // Run synchronously
  const ticks = 300;
  for (let i = 0; i < ticks; i++) {
    sim.tick();
  }
}

/**
 * Build the full universe layout: all clusters positioned on a single
 * coordinate space. Each cluster's nodes are force-settled locally then
 * offset to their cluster center position.
 *
 * Returns { allNodes, allLinks, clusterMetas, worldBounds }
 */
export function buildUniverseLayout(universeData) {
  if (!universeData?.clusters || !universeData?.visualization) {
    return { allNodes: [], allLinks: [], clusterMetas: [], worldBounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } };
  }

  const viz = universeData.visualization;
  const clusterCenters = viz.clusterCenters || [];
  const clusters = universeData.clusters;

  const allNodes = [];
  const allLinks = [];
  const clusterMetas = [];

  for (let ci = 0; ci < clusters.length; ci++) {
    const cluster = clusters[ci];
    const center = clusterCenters[ci];
    if (!center) continue;

    // World-space center for this cluster
    const cx = center.x * CLUSTER_SPACING;
    const cy = center.y * CLUSTER_SPACING;

    // Build galaxy data and style it
    const clusterGalaxyData = buildClusterGalaxyData(cluster);
    const graph = buildGalaxyGraph(clusterGalaxyData);

    // Prefix IDs for cross-cluster uniqueness
    const prefixedNodes = graph.nodes.map((n) => ({
      ...n,
      id: `c${ci}_${n.id}`,
      clusterId: ci,
    }));

    const idMap = {};
    for (const n of graph.nodes) {
      idMap[n.id] = `c${ci}_${n.id}`;
    }

    const prefixedLinks = graph.links.map((l) => ({
      ...l,
      source: idMap[typeof l.source === 'string' ? l.source : l.source.id] || l.source,
      target: idMap[typeof l.target === 'string' ? l.target : l.target.id] || l.target,
    }));

    // Settle the cluster around (0,0)
    const simSize = 400 + prefixedNodes.length * 3;
    settleClusterLayout(prefixedNodes, prefixedLinks, simSize);

    // Compute cluster visual radius (max distance from center of any node)
    let maxDist = 0;
    for (const n of prefixedNodes) {
      const d = Math.sqrt(n.x * n.x + n.y * n.y);
      if (d + (n.radius || 5) > maxDist) maxDist = d + (n.radius || 5);
    }
    const visualRadius = Math.max(maxDist, 60);

    // Offset all nodes to world position
    for (const n of prefixedNodes) {
      n.x += cx;
      n.y += cy;
    }

    allNodes.push(...prefixedNodes);
    allLinks.push(...prefixedLinks);

    // Pick representative artist names for LOD 2 labels (top 3 seeds by score)
    const seeds = prefixedNodes
      .filter((n) => n.type === 'seed')
      .sort((a, b) => (b.compositeScore || 0) - (a.compositeScore || 0));
    const labelNames = seeds.slice(0, 3).map((n) => n.name);

    clusterMetas.push({
      index: ci,
      cx,
      cy,
      visualRadius,
      label: cluster.label || `Cluster ${ci + 1}`,
      color: center.color || cluster.color || { h: 220, s: 50, l: 60 },
      memberCount: cluster.members?.length || 0,
      recCount: cluster.recommendations?.length || 0,
      totalCount: prefixedNodes.length,
      labelNames,
      genreClusters: graph.genreClusters,
    });
  }

  // --- Inter-cluster bridge links ---
  const bridges = universeData.bridges || [];
  for (const bridge of bridges) {
    if (!bridge.clusters || bridge.clusters.length < 2) continue;

    // Find the bridge artist's node
    const bridgeNode = allNodes.find((n) => n.name === bridge.name);
    if (!bridgeNode) continue;

    const homeCluster = bridgeNode.clusterId;
    for (const targetCI of bridge.clusters) {
      if (targetCI === homeCluster) continue;

      // Find nearest seed node in the target cluster
      let bestNode = null;
      let bestDist = Infinity;
      for (const n of allNodes) {
        if (n.clusterId !== targetCI || n.type !== 'seed') continue;
        const ddx = n.x - bridgeNode.x;
        const ddy = n.y - bridgeNode.y;
        const d = ddx * ddx + ddy * ddy;
        if (d < bestDist) {
          bestDist = d;
          bestNode = n;
        }
      }

      if (bestNode) {
        allLinks.push({
          source: bridgeNode,
          target: bestNode,
          strength: bridge.strength * 0.3,
          isBridgeLink: true,
          opacity: 0.15,
        });
      }
    }
  }

  // --- Inter-cluster chain links ---
  const chainLinks = universeData.chainLinks || [];
  for (const chain of chainLinks) {
    // Find the chain link node in allNodes
    const chainNode = allNodes.find(
      (n) => n.name.toLowerCase().trim() === chain.name.toLowerCase().trim()
    );
    if (!chainNode) continue;

    const homeCluster = chainNode.clusterId;

    for (const remoteCI of (chain.remoteClusters || [])) {
      if (remoteCI === homeCluster) continue;

      // Find nearest seed node in the remote cluster
      let bestNode = null;
      let bestDist = Infinity;
      for (const n of allNodes) {
        if (n.clusterId !== remoteCI || n.type !== 'seed') continue;
        const ddx = n.x - chainNode.x;
        const ddy = n.y - chainNode.y;
        const d = ddx * ddx + ddy * ddy;
        if (d < bestDist) {
          bestDist = d;
          bestNode = n;
        }
      }

      if (bestNode) {
        allLinks.push({
          source: chainNode,
          target: bestNode,
          strength: (chain.avgScore || 0.3) * 0.4,
          isChainLink: true,
          isBridgeLink: false,
          opacity: 0.2,
        });
      }
    }
  }

  // Compute world bounds
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of allNodes) {
    const r = n.radius || 5;
    if (n.x - r < minX) minX = n.x - r;
    if (n.y - r < minY) minY = n.y - r;
    if (n.x + r > maxX) maxX = n.x + r;
    if (n.y + r > maxY) maxY = n.y + r;
  }
  // Also include cluster metas for padding
  for (const cm of clusterMetas) {
    if (cm.cx - cm.visualRadius < minX) minX = cm.cx - cm.visualRadius;
    if (cm.cy - cm.visualRadius < minY) minY = cm.cy - cm.visualRadius;
    if (cm.cx + cm.visualRadius > maxX) maxX = cm.cx + cm.visualRadius;
    if (cm.cy + cm.visualRadius > maxY) maxY = cm.cy + cm.visualRadius;
  }

  if (!isFinite(minX)) {
    minX = 0; minY = 0; maxX = 100; maxY = 100;
  }

  return {
    allNodes,
    allLinks,
    clusterMetas,
    worldBounds: { minX, minY, maxX, maxY },
  };
}
