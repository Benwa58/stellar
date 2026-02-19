const express = require('express');
const { requireAuth } = require('./auth');
const db = require('./db');

const router = express.Router();

// GET /api/dislikes — list all dislikes
router.get('/', requireAuth, (req, res) => {
  try {
    const dislikes = db.getUserDislikes(req.userId);
    res.json({
      dislikes: dislikes.map((d) => ({
        artistName: d.artist_name,
        artistId: d.artist_id,
        artistImage: d.artist_image,
        addedAt: d.added_at,
      })),
    });
  } catch (err) {
    console.error('Get dislikes error:', err);
    res.status(500).json({ error: 'Failed to load dislikes.' });
  }
});

// POST /api/dislikes — add a dislike
router.post('/', requireAuth, (req, res) => {
  try {
    const { artistName, artistId, artistImage } = req.body;

    if (!artistName) {
      return res.status(400).json({ error: 'Artist name is required.' });
    }

    const added = db.addDislike(req.userId, { artistName, artistId, artistImage });
    if (!added) {
      return res.status(409).json({ error: 'Artist is already disliked.' });
    }

    res.status(201).json({ success: true });
  } catch (err) {
    console.error('Add dislike error:', err);
    res.status(500).json({ error: 'Failed to add dislike.' });
  }
});

// DELETE /api/dislikes/:artistName — remove a dislike
router.delete('/:artistName', requireAuth, (req, res) => {
  try {
    const artistName = decodeURIComponent(req.params.artistName);
    const removed = db.removeDislike(req.userId, artistName);
    if (!removed) {
      return res.status(404).json({ error: 'Dislike not found.' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Remove dislike error:', err);
    res.status(500).json({ error: 'Failed to remove dislike.' });
  }
});

module.exports = router;
