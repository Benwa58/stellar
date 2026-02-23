const express = require('express');
const { requireAuth } = require('./auth');
const db = require('./db');

const router = express.Router();

// GET /api/discovered-artists — list all discovered artists
router.get('/', requireAuth, (req, res) => {
  try {
    const artists = db.getUserDiscoveredArtists(req.userId);
    res.json({
      discoveredArtists: artists.map((a) => ({
        artistName: a.artist_name,
        artistId: a.artist_id,
        artistImage: a.artist_image,
        addedAt: a.added_at,
      })),
    });
  } catch (err) {
    console.error('Get discovered artists error:', err);
    res.status(500).json({ error: 'Failed to load discovered artists.' });
  }
});

// POST /api/discovered-artists — add a discovered artist
router.post('/', requireAuth, (req, res) => {
  try {
    const { artistName, artistId, artistImage } = req.body;

    if (!artistName) {
      return res.status(400).json({ error: 'Artist name is required.' });
    }

    const added = db.addDiscoveredArtist(req.userId, { artistName, artistId, artistImage });
    if (!added) {
      return res.status(409).json({ error: 'Artist is already marked as discovered.' });
    }

    res.status(201).json({ success: true });
  } catch (err) {
    console.error('Add discovered artist error:', err);
    res.status(500).json({ error: 'Failed to add discovered artist.' });
  }
});

// DELETE /api/discovered-artists/:artistName — remove a discovered artist
router.delete('/:artistName', requireAuth, (req, res) => {
  try {
    const artistName = decodeURIComponent(req.params.artistName);
    const removed = db.removeDiscoveredArtist(req.userId, artistName);
    if (!removed) {
      return res.status(404).json({ error: 'Discovered artist not found.' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Remove discovered artist error:', err);
    res.status(500).json({ error: 'Failed to remove discovered artist.' });
  }
});

module.exports = router;
