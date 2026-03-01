const express = require('express');
const { requireAuth } = require('./auth');
const db = require('./db');
const { computeCollision, computeCollisionHash } = require('./collisionCompute');

const router = express.Router();

// In-memory lock to prevent duplicate computes
const computingPairs = new Set();
function pairKey(a, b) { return a < b ? `${a}:${b}` : `${b}:${a}`; }

// GET /api/collision/:friendId — Get cached collision snapshot
router.get('/:friendId', requireAuth, (req, res) => {
  try {
    const friendId = parseInt(req.params.friendId, 10);
    if (isNaN(friendId)) return res.status(400).json({ error: 'Invalid friendId' });

    // Verify friendship
    const friendship = db.getFriendship(req.userId, friendId);
    if (!friendship || friendship.status !== 'accepted') {
      return res.status(403).json({ error: 'Not friends with this user' });
    }

    const snapshot = db.getCollisionSnapshot(req.userId, friendId);
    if (!snapshot) {
      return res.json({ collision: null, status: 'none' });
    }

    // Check staleness
    const userFavs = db.getUserFavorites(req.userId);
    const userDiscovered = db.getUserDiscoveredArtists(req.userId);
    const friendFavs = db.getUserFavorites(friendId);
    const friendDiscovered = db.getUserDiscoveredArtists(friendId);
    const currentHash = computeCollisionHash(userFavs, userDiscovered, friendFavs, friendDiscovered);
    const isStale = currentHash !== snapshot.artist_hash;

    res.json({
      collision: snapshot.status === 'ready' ? JSON.parse(snapshot.snapshot_data) : null,
      status: snapshot.status,
      isStale,
      computedAt: snapshot.computed_at,
    });
  } catch (err) {
    console.error('Get collision error:', err);
    res.status(500).json({ error: 'Failed to load collision.' });
  }
});

// POST /api/collision/:friendId/compute — Trigger collision compute
router.post('/:friendId/compute', requireAuth, async (req, res) => {
  try {
    const friendId = parseInt(req.params.friendId, 10);
    if (isNaN(friendId)) return res.status(400).json({ error: 'Invalid friendId' });

    // Verify friendship
    const friendship = db.getFriendship(req.userId, friendId);
    if (!friendship || friendship.status !== 'accepted') {
      return res.status(403).json({ error: 'Not friends with this user' });
    }

    // Check minimum artists
    const userFavs = db.getUserFavorites(req.userId);
    const userDiscovered = db.getUserDiscoveredArtists(req.userId);
    const friendFavs = db.getUserFavorites(friendId);
    const friendDiscovered = db.getUserDiscoveredArtists(friendId);

    const userCount = new Set([
      ...userFavs.map((f) => f.artist_name.toLowerCase().trim()),
      ...userDiscovered.map((d) => d.artist_name.toLowerCase().trim()),
    ]).size;
    const friendCount = new Set([
      ...friendFavs.map((f) => f.artist_name.toLowerCase().trim()),
      ...friendDiscovered.map((d) => d.artist_name.toLowerCase().trim()),
    ]).size;

    if (userCount < 3 || friendCount < 3) {
      return res.status(400).json({
        error: 'Both users need at least 3 unique artists (favorites + discoveries) to collide universes.',
      });
    }

    const pk = pairKey(req.userId, friendId);

    // Check if already computing
    if (computingPairs.has(pk)) {
      return res.json({ status: 'computing', message: 'Already computing.' });
    }

    // Check hash
    const currentHash = computeCollisionHash(userFavs, userDiscovered, friendFavs, friendDiscovered);
    const existing = db.getCollisionSnapshot(req.userId, friendId);
    if (existing && existing.artist_hash === currentHash && existing.status === 'ready') {
      return res.json({ status: 'ready', message: 'Collision is up to date.' });
    }

    // Start background compute
    computingPairs.add(pk);
    res.json({ status: 'computing', message: 'Computing collision...' });

    const userId = req.userId;
    try {
      const result = await computeCollision(userId, friendId, db);
      db.upsertCollisionSnapshot(userId, friendId, {
        snapshotData: result,
        artistHash: currentHash,
        status: 'ready',
      });
    } catch (err) {
      console.error('Collision compute error:', err);
      db.upsertCollisionSnapshot(userId, friendId, {
        snapshotData: {},
        artistHash: '',
        status: 'error',
        errorMessage: err.message || 'Compute failed',
      });
    } finally {
      computingPairs.delete(pk);
    }
  } catch (err) {
    console.error('Trigger collision compute error:', err);
    res.status(500).json({ error: 'Failed to start compute.' });
  }
});

// GET /api/collision/:friendId/status — Lightweight status check
router.get('/:friendId/status', requireAuth, (req, res) => {
  try {
    const friendId = parseInt(req.params.friendId, 10);
    if (isNaN(friendId)) return res.status(400).json({ error: 'Invalid friendId' });

    const snapshot = db.getCollisionSnapshot(req.userId, friendId);
    if (!snapshot) {
      return res.json({ status: 'none' });
    }

    const pk = pairKey(req.userId, friendId);
    res.json({
      status: snapshot.status,
      computedAt: snapshot.computed_at,
      isComputing: computingPairs.has(pk),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check status.' });
  }
});

module.exports = router;
