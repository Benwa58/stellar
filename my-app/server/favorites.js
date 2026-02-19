const express = require('express');
const { requireAuth } = require('./auth');
const db = require('./db');

const router = express.Router();

// GET /api/favorites — list all favorites
router.get('/', requireAuth, (req, res) => {
  try {
    const favorites = db.getUserFavorites(req.userId);
    res.json({
      favorites: favorites.map((f) => ({
        artistName: f.artist_name,
        artistId: f.artist_id,
        artistImage: f.artist_image,
        addedAt: f.added_at,
      })),
    });
  } catch (err) {
    console.error('Get favorites error:', err);
    res.status(500).json({ error: 'Failed to load favorites.' });
  }
});

// POST /api/favorites — add a favorite
router.post('/', requireAuth, (req, res) => {
  try {
    const { artistName, artistId, artistImage } = req.body;

    if (!artistName) {
      return res.status(400).json({ error: 'Artist name is required.' });
    }

    const added = db.addFavorite(req.userId, { artistName, artistId, artistImage });
    if (!added) {
      return res.status(409).json({ error: 'Artist is already a favorite.' });
    }

    res.status(201).json({ success: true });
  } catch (err) {
    console.error('Add favorite error:', err);
    res.status(500).json({ error: 'Failed to add favorite.' });
  }
});

// DELETE /api/favorites/:artistName — remove a favorite
router.delete('/:artistName', requireAuth, (req, res) => {
  try {
    const artistName = decodeURIComponent(req.params.artistName);
    const removed = db.removeFavorite(req.userId, artistName);
    if (!removed) {
      return res.status(404).json({ error: 'Favorite not found.' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Remove favorite error:', err);
    res.status(500).json({ error: 'Failed to remove favorite.' });
  }
});

module.exports = router;
