const express = require('express');
const { requireAuth } = require('./auth');
const db = require('./db');

const router = express.Router();

// GET /api/maps — list user's maps (metadata only, no full galaxy data)
router.get('/', requireAuth, (req, res) => {
  try {
    const maps = db.getUserMaps(req.userId);
    // Parse seed_artists JSON for each map; extract recommendation node names
    const result = maps.map((m) => {
      const seedArtists = JSON.parse(m.seed_artists);
      let recNames = [];
      try {
        const galaxy = JSON.parse(m.galaxy_data);
        if (galaxy.nodes) {
          recNames = galaxy.nodes
            .filter((n) => n.type !== 'seed')
            .map((n) => n.name);
        }
      } catch {}
      return {
        id: m.id,
        name: m.name,
        seedArtists,
        recNames,
        nodeCount: m.node_count,
        savedAt: m.created_at,
      };
    });
    res.json({ maps: result });
  } catch (err) {
    console.error('Get maps error:', err);
    res.status(500).json({ error: 'Failed to load maps.' });
  }
});

// GET /api/maps/:id — load a specific map with full galaxy data
router.get('/:id', requireAuth, (req, res) => {
  try {
    const map = db.getMapById(Number(req.params.id), req.userId);
    if (!map) {
      return res.status(404).json({ error: 'Map not found.' });
    }
    res.json({
      id: map.id,
      name: map.name,
      seedArtists: JSON.parse(map.seed_artists),
      galaxyData: JSON.parse(map.galaxy_data),
      nodeCount: map.node_count,
      savedAt: map.created_at,
    });
  } catch (err) {
    console.error('Get map error:', err);
    res.status(500).json({ error: 'Failed to load map.' });
  }
});

// POST /api/maps — save a new map
router.post('/', requireAuth, (req, res) => {
  try {
    const { name, seedArtists, galaxyData } = req.body;

    if (!name || !seedArtists || !galaxyData) {
      return res.status(400).json({ error: 'Name, seed artists, and galaxy data are required.' });
    }

    if (name.length > 80) {
      return res.status(400).json({ error: 'Map name must be 80 characters or fewer.' });
    }

    // Check for duplicate: exact same set of seed artist IDs
    const incomingIds = seedArtists.map((a) => a.id).sort().join(',');
    const existingMaps = db.getUserMaps(req.userId);
    const isDuplicate = existingMaps.some((m) => {
      const savedIds = JSON.parse(m.seed_artists).map((a) => a.id).sort().join(',');
      return savedIds === incomingIds;
    });
    if (isDuplicate) {
      return res.status(409).json({ error: 'This galaxy is already saved.' });
    }

    const storableGalaxyData = {
      nodes: galaxyData.nodes,
      links: galaxyData.links,
    };

    const mapId = db.createMap(req.userId, {
      name,
      seedArtists,
      galaxyData: storableGalaxyData,
      nodeCount: galaxyData.nodes.length,
    });

    res.status(201).json({ id: mapId, success: true });
  } catch (err) {
    console.error('Save map error:', err);
    res.status(500).json({ error: 'Failed to save map.' });
  }
});

// DELETE /api/maps/:id — delete a saved map
router.delete('/:id', requireAuth, (req, res) => {
  try {
    const deleted = db.deleteMap(Number(req.params.id), req.userId);
    if (!deleted) {
      return res.status(404).json({ error: 'Map not found.' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Delete map error:', err);
    res.status(500).json({ error: 'Failed to delete map.' });
  }
});

// POST /api/maps/import — bulk import from localStorage
router.post('/import', requireAuth, (req, res) => {
  try {
    const { maps } = req.body;

    if (!Array.isArray(maps) || maps.length === 0) {
      return res.status(400).json({ error: 'No maps to import.' });
    }

    let imported = 0;

    for (const map of maps) {
      if (map.name && map.seedArtists && map.galaxyData) {
        db.createMap(req.userId, {
          name: map.name,
          seedArtists: map.seedArtists,
          galaxyData: { nodes: map.galaxyData.nodes, links: map.galaxyData.links },
          nodeCount: map.galaxyData.nodes?.length || 0,
        });
        imported++;
      }
    }

    res.json({
      success: true,
      imported,
      skipped: maps.length - imported,
    });
  } catch (err) {
    console.error('Import maps error:', err);
    res.status(500).json({ error: 'Failed to import maps.' });
  }
});

module.exports = router;
