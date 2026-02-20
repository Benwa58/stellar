const express = require('express');
const crypto = require('crypto');
const { requireAuth } = require('./auth');
const db = require('./db');

const router = express.Router();

// POST /api/playlists — create a shared playlist (auth required)
router.post('/', requireAuth, (req, res) => {
  try {
    const { playlistName, trackList, seedArtists, nodeCount } = req.body;

    if (!playlistName || typeof playlistName !== 'string' || !playlistName.trim()) {
      return res.status(400).json({ error: 'Playlist name is required.' });
    }
    if (!trackList || !Array.isArray(trackList) || trackList.length === 0) {
      return res.status(400).json({ error: 'Track list is required.' });
    }
    if (trackList.length > 300) {
      return res.status(400).json({ error: 'Maximum 300 tracks per shared playlist.' });
    }

    const id = crypto.randomUUID();
    db.createPlaylistExport(id, {
      playlistName: playlistName.trim(),
      trackList,
      seedArtists: seedArtists || [],
      nodeCount: nodeCount || trackList.length,
      createdBy: req.userId,
    });

    res.status(201).json({ id, url: `/p/${id}` });
  } catch (err) {
    console.error('Create playlist error:', err);
    res.status(500).json({ error: 'Failed to create shared playlist.' });
  }
});

// GET /api/playlists/:id — retrieve a shared playlist (public, no auth)
router.get('/:id', (req, res) => {
  try {
    const playlist = db.getPlaylistExport(req.params.id);
    if (!playlist) {
      return res.status(404).json({ error: 'Playlist not found.' });
    }

    res.json({
      id: playlist.id,
      playlistName: playlist.playlist_name,
      trackList: JSON.parse(playlist.track_list),
      seedArtists: JSON.parse(playlist.seed_artists || '[]'),
      nodeCount: playlist.node_count,
      createdAt: playlist.created_at,
    });
  } catch (err) {
    console.error('Get playlist error:', err);
    res.status(500).json({ error: 'Failed to retrieve playlist.' });
  }
});

module.exports = router;
