const express = require('express');
const crypto = require('crypto');
const { optionalAuth } = require('./auth');
const db = require('./db');

const router = express.Router();

// POST /api/galaxy-shares — create a shared galaxy map
router.post('/', optionalAuth, (req, res) => {
  try {
    const { mapName, seedArtists, galaxyData, nodeCount, linkCount } = req.body;

    if (!mapName || typeof mapName !== 'string' || !mapName.trim()) {
      return res.status(400).json({ error: 'Map name is required.' });
    }
    if (mapName.length > 80) {
      return res.status(400).json({ error: 'Map name must be 80 characters or fewer.' });
    }
    if (!galaxyData || !Array.isArray(galaxyData.nodes) || !Array.isArray(galaxyData.links)) {
      return res.status(400).json({ error: 'Galaxy data with nodes and links is required.' });
    }
    if (galaxyData.nodes.length > 500) {
      return res.status(400).json({ error: 'Maximum 500 nodes per shared galaxy.' });
    }
    if (galaxyData.links.length > 2000) {
      return res.status(400).json({ error: 'Maximum 2000 links per shared galaxy.' });
    }

    const id = crypto.randomUUID();
    db.createSharedGalaxy(id, {
      mapName: mapName.trim(),
      seedArtists: seedArtists || [],
      galaxyData: { nodes: galaxyData.nodes, links: galaxyData.links },
      nodeCount: nodeCount || galaxyData.nodes.length,
      linkCount: linkCount || galaxyData.links.length,
      ownerUserId: req.userId,
    });

    res.status(201).json({ id, url: `/galaxy/${id}` });
  } catch (err) {
    console.error('Create galaxy share error:', err);
    res.status(500).json({ error: 'Failed to create shared galaxy.' });
  }
});

// GET /api/galaxy-shares/:id — retrieve a shared galaxy (public, no auth)
router.get('/:id', (req, res) => {
  try {
    const share = db.getSharedGalaxy(req.params.id);
    if (!share) {
      return res.status(404).json({ error: 'Galaxy not found.' });
    }

    res.json({
      id: share.id,
      mapName: share.map_name,
      seedArtists: JSON.parse(share.seed_artists),
      galaxyData: JSON.parse(share.galaxy_data),
      nodeCount: share.node_count,
      linkCount: share.link_count,
      createdAt: share.created_at,
    });
  } catch (err) {
    console.error('Get galaxy share error:', err);
    res.status(500).json({ error: 'Failed to retrieve shared galaxy.' });
  }
});

module.exports = router;
