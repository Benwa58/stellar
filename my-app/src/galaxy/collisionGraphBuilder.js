/**
 * Collision graph builder — lays out 6 zones in a "two superclusters colliding"
 * spatial arrangement.
 *
 * Layout (horizontal):
 *   Left cluster:       Your Artists (exclusive, no connections)
 *   Left-center:        Friend's Exploration Zone (your artists connecting to friend's)
 *   Center:             Core Overlap (artists both users share)
 *   Center halo:        Shared Frontier (new discoveries around core)
 *   Right-center:       Your Exploration Zone (friend's artists connecting to yours)
 *   Right cluster:      Friend's Artists (exclusive, no connections)
 */

import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
} from 'd3-force';

// Zone color definitions
export const ZONE_COLORS = {
  core_overlap:       { h: 45,  s: 90, l: 65 },   // Bright gold
  your_artists:       { h: 230, s: 70, l: 60 },   // Blue/purple
  friend_artists:     { h: 15,  s: 75, l: 58 },   // Warm coral
  shared_frontier:    { h: 175, s: 70, l: 55 },   // Cyan/teal
  your_exploration:   { h: 280, s: 55, l: 60 },   // Purple-pink blend
  friend_exploration: { h: 30,  s: 60, l: 55 },   // Warm amber blend
};

// Zone spatial centers (collision axis is horizontal)
const ZONE_CENTERS = {
  your_artists:       { x: -700, y: 0 },
  friend_exploration: { x: -350, y: 40 },
  core_overlap:       { x: 0,    y: 0 },
  shared_frontier:    { x: 0,    y: 120 },
  your_exploration:   { x: 350,  y: 40 },
  friend_artists:     { x: 700,  y: 0 },
};

const NODE_SIZE = {
  core: 8,
  member: 6,
  exploration: 5,
  frontier: 4,
};

function settleZoneLayout(nodes, links) {
  if (nodes.length === 0) return;

  const sim = forceSimulation(nodes)
    .force(
      'link',
      forceLink(links)
        .id((d) => d.id)
        .distance(60)
        .strength(0.3)
    )
    .force('charge', forceManyBody().strength(-120))
    .force('center', forceCenter(0, 0).strength(0.08))
    .force('collision', forceCollide().radius((d) => (d.radius || 5) + 3))
    .stop();

  for (let i = 0; i < 250; i++) {
    sim.tick();
  }
}

/**
 * Build the full collision layout from server collision data.
 * Returns { allNodes, allLinks, zoneMetas, worldBounds }
 */
export function buildCollisionLayout(collisionData) {
  if (!collisionData || !collisionData.zones) {
    return { allNodes: [], allLinks: [], zoneMetas: [], worldBounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } };
  }

  const { zones, links: rawLinks } = collisionData;
  const allNodes = [];
  const allLinks = [];
  const zoneMetas = [];

  // Build nodes for each zone
  const zoneEntries = [
    { key: 'core_overlap',       data: zones.coreOverlap || [],       label: 'Core Overlap' },
    { key: 'your_artists',       data: zones.yourArtists || [],       label: 'Your Artists' },
    { key: 'friend_artists',     data: zones.friendArtists || [],     label: "Friend's Artists" },
    { key: 'shared_frontier',    data: zones.sharedFrontier || [],    label: 'Shared Frontier' },
    { key: 'your_exploration',   data: zones.yourExploration || [],   label: 'Your Exploration' },
    { key: 'friend_exploration', data: zones.friendExploration || [], label: "Friend's Exploration" },
  ];

  const nodeById = new Map();
  const nodeByName = new Map();

  for (const entry of zoneEntries) {
    const center = ZONE_CENTERS[entry.key];
    const color = ZONE_COLORS[entry.key];
    const zoneNodes = [];
    const zoneLinks = [];

    for (const artist of entry.data) {
      const isCore = entry.key === 'core_overlap';
      const isFrontier = entry.key === 'shared_frontier';
      const isExploration = entry.key === 'your_exploration' || entry.key === 'friend_exploration';

      const radius = isCore ? NODE_SIZE.core
        : isFrontier ? NODE_SIZE.frontier
        : isExploration ? NODE_SIZE.exploration
        : NODE_SIZE.member;

      const brightness = isCore ? 0.9 : isFrontier ? 0.6 : 0.75;

      const node = {
        id: `${entry.key}-${artist.name}`,
        name: artist.name,
        image: artist.image || null,
        zone: entry.key,
        zoneLabel: entry.label,
        type: isCore ? 'seed' : 'recommendation',
        radius,
        color: `hsla(${color.h}, ${color.s}%, ${color.l}%, ${brightness})`,
        glowColor: `hsla(${color.h}, ${color.s}%, ${color.l}%, ${brightness * 0.3})`,
        zoneColor: color,
        brightness,
        connectedTo: artist.connectedTo || [],
        suggestedBy: artist.suggestedBy || null,
        score: artist.score || 0,
        compositeScore: isCore ? 1.0 : isFrontier ? (artist.score || 0.5) : 0.7,
      };

      zoneNodes.push(node);
      nodeById.set(node.id, node);
      // Map by lowercase name for link resolution
      if (!nodeByName.has(artist.name.toLowerCase().trim())) {
        nodeByName.set(artist.name.toLowerCase().trim(), node);
      }
    }

    // Intra-zone links for network structure
    if (zoneNodes.length > 1) {
      for (let i = 0; i < zoneNodes.length; i++) {
        const stride = Math.max(1, Math.floor(zoneNodes.length / 4));
        for (let s = 1; s <= 2; s++) {
          const j = (i + s * stride) % zoneNodes.length;
          if (j === i) continue;
          zoneLinks.push({
            source: zoneNodes[i].id,
            target: zoneNodes[j].id,
            strength: 0.1,
            isIntraZone: true,
          });
        }
      }
    }

    // Settle zone layout around (0,0) then offset
    settleZoneLayout(zoneNodes, zoneLinks);

    // Compute visual radius
    let maxDist = 0;
    for (const n of zoneNodes) {
      const d = Math.sqrt(n.x * n.x + n.y * n.y);
      if (d + (n.radius || 5) > maxDist) maxDist = d + (n.radius || 5);
    }
    const visualRadius = Math.max(maxDist, 40);

    // Offset to world position and assign drift
    for (const n of zoneNodes) {
      n.x += center.x;
      n.y += center.y;
      n.homeX = n.x;
      n.homeY = n.y;
      const hash = Math.abs(Math.sin(n.x * 12.9898 + n.y * 78.233) * 43758.5453) % 1;
      n.driftRadius = 1 + hash * 2;
      n.driftSpeed = 0.0003 + hash * 0.0004;
      n.driftPhase = hash * Math.PI * 2;
    }

    allNodes.push(...zoneNodes);
    allLinks.push(...zoneLinks);

    // Top artist names for labels
    const labelNames = zoneNodes.slice(0, 3).map((n) => n.name);

    zoneMetas.push({
      key: entry.key,
      cx: center.x,
      cy: center.y,
      visualRadius,
      label: entry.label,
      color,
      count: zoneNodes.length,
      labelNames,
    });
  }

  // Build inter-zone links from collision data
  if (rawLinks) {
    for (const link of rawLinks) {
      const sourceNode = nodeByName.get(link.source.toLowerCase().trim());
      const targetNode = nodeByName.get(link.target.toLowerCase().trim());
      if (!sourceNode || !targetNode) continue;

      const isCore = link.type === 'core';
      const isFrontier = link.type === 'frontier';
      const isExploration = link.type === 'exploration';

      allLinks.push({
        source: sourceNode,
        target: targetNode,
        strength: link.strength || 0.3,
        isCoreLink: isCore,
        isFrontierLink: isFrontier,
        isExplorationLink: isExploration,
        isCrossZone: sourceNode.zone !== targetNode.zone,
        opacity: isCore ? 0.15 : isFrontier ? 0.1 : 0.12,
      });
    }
  }

  // World bounds
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of allNodes) {
    const r = n.radius || 5;
    if (n.x - r < minX) minX = n.x - r;
    if (n.y - r < minY) minY = n.y - r;
    if (n.x + r > maxX) maxX = n.x + r;
    if (n.y + r > maxY) maxY = n.y + r;
  }
  for (const zm of zoneMetas) {
    if (zm.cx - zm.visualRadius < minX) minX = zm.cx - zm.visualRadius;
    if (zm.cy - zm.visualRadius < minY) minY = zm.cy - zm.visualRadius;
    if (zm.cx + zm.visualRadius > maxX) maxX = zm.cx + zm.visualRadius;
    if (zm.cy + zm.visualRadius > maxY) maxY = zm.cy + zm.visualRadius;
  }
  if (!isFinite(minX)) { minX = -500; minY = -300; maxX = 500; maxY = 300; }

  return { allNodes, allLinks, zoneMetas, worldBounds: { minX, minY, maxX, maxY } };
}
