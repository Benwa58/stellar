const express = require('express');
const { requireAuth } = require('./auth');
const db = require('./db');

const router = express.Router();

// GET /api/known-artists — list all known artists
router.get('/', requireAuth, (req, res) => {
  try {
    const artists = db.getUserKnownArtists(req.userId);
    res.json({
      knownArtists: artists.map((a) => ({
        artistName: a.artist_name,
        artistId: a.artist_id,
        artistImage: a.artist_image,
        addedAt: a.added_at,
      })),
    });
  } catch (err) {
    console.error('Get known artists error:', err);
    res.status(500).json({ error: 'Failed to load known artists.' });
  }
});

// POST /api/known-artists — add a known artist
router.post('/', requireAuth, (req, res) => {
  try {
    const { artistName, artistId, artistImage } = req.body;

    if (!artistName) {
      return res.status(400).json({ error: 'Artist name is required.' });
    }

    const added = db.addKnownArtist(req.userId, { artistName, artistId, artistImage });
    if (!added) {
      return res.status(409).json({ error: 'Artist is already marked as known.' });
    }

    res.status(201).json({ success: true });
  } catch (err) {
    console.error('Add known artist error:', err);
    res.status(500).json({ error: 'Failed to add known artist.' });
  }
});

// DELETE /api/known-artists/:artistName — remove a known artist
router.delete('/:artistName', requireAuth, (req, res) => {
  try {
    const artistName = decodeURIComponent(req.params.artistName);
    const removed = db.removeKnownArtist(req.userId, artistName);
    if (!removed) {
      return res.status(404).json({ error: 'Known artist not found.' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Remove known artist error:', err);
    res.status(500).json({ error: 'Failed to remove known artist.' });
  }
});

module.exports = router;
