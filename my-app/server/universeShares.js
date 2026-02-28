const express = require('express');
const crypto = require('crypto');
const { optionalAuth } = require('./auth');
const db = require('./db');

const router = express.Router();

// POST /api/universe-shares — create a shared universe map
router.post('/', optionalAuth, (req, res) => {
  try {
    const { mapName, universeData, nodeCount, linkCount, thumbnail } = req.body;

    if (!mapName || typeof mapName !== 'string' || !mapName.trim()) {
      return res.status(400).json({ error: 'Map name is required.' });
    }
    if (mapName.length > 80) {
      return res.status(400).json({ error: 'Map name must be 80 characters or fewer.' });
    }
    if (!universeData || typeof universeData !== 'object') {
      return res.status(400).json({ error: 'Universe data is required.' });
    }

    // Decode base64 thumbnail to buffer if provided
    let thumbnailBuf = null;
    if (thumbnail && typeof thumbnail === 'string') {
      const base64Data = thumbnail.replace(/^data:image\/\w+;base64,/, '');
      thumbnailBuf = Buffer.from(base64Data, 'base64');
    }

    const id = crypto.randomUUID();
    db.createSharedUniverse(id, {
      mapName: mapName.trim(),
      universeData: { nodes: universeData.nodes, links: universeData.links },
      nodeCount: nodeCount || universeData.nodes.length,
      linkCount: linkCount || universeData.links.length,
      ownerUserId: req.userId,
      thumbnail: thumbnailBuf,
    });

    res.status(201).json({ id, url: `/universe/${id}` });
  } catch (err) {
    console.error('Create universe share error:', err);
    res.status(500).json({ error: 'Failed to create shared universe.' });
  }
});

// GET /api/universe-shares/:id — retrieve a shared universe (public, no auth)
router.get('/:id', (req, res) => {
  try {
    const share = db.getSharedUniverse(req.params.id);
    if (!share) {
      return res.status(404).json({ error: 'Universe not found.' });
    }

    res.json({
      id: share.id,
      mapName: share.map_name,
      universeData: JSON.parse(share.universe_data),
      nodeCount: share.node_count,
      linkCount: share.link_count,
      createdAt: share.created_at,
    });
  } catch (err) {
    console.error('Get universe share error:', err);
    res.status(500).json({ error: 'Failed to retrieve shared universe.' });
  }
});

// GET /api/universe-shares/:id/image — serve the thumbnail as PNG (for OG/link previews)
router.get('/:id/image', (req, res) => {
  try {
    const row = db.getSharedUniverseThumbnail(req.params.id);
    if (!row || !row.thumbnail) {
      return res.status(404).send('No image available');
    }
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(row.thumbnail);
  } catch (err) {
    console.error('Get universe thumbnail error:', err);
    res.status(500).send('Failed to load image');
  }
});

module.exports = router;
