const express = require('express');
const { requireAuth } = require('./auth');
const db = require('./db');
const { computeUniverse, computeArtistHash } = require('./universeCompute');

const router = express.Router();

// In-memory lock to prevent duplicate computes per user
const computingUsers = new Set();

// GET /api/universe — Get the cached universe snapshot
router.get('/', requireAuth, (req, res) => {
  try {
    const snapshot = db.getUniverseSnapshot(req.userId);
    if (!snapshot) {
      return res.json({ universe: null, status: 'none' });
    }

    // Check if data is stale
    const favorites = db.getUserFavorites(req.userId);
    const discovered = db.getUserDiscoveredArtists(req.userId);
    const currentHash = computeArtistHash(favorites, discovered);
    const isStale = currentHash !== snapshot.artist_hash;

    res.json({
      universe: snapshot.status === 'ready' ? JSON.parse(snapshot.snapshot_data) : null,
      status: snapshot.status,
      isStale,
      computedAt: snapshot.computed_at,
      artistCount: snapshot.artist_count,
      clusterCount: snapshot.cluster_count,
      recommendationCount: snapshot.recommendation_count,
    });
  } catch (err) {
    console.error('Get universe error:', err);
    res.status(500).json({ error: 'Failed to load universe.' });
  }
});

// POST /api/universe/compute — Trigger a recompute
router.post('/compute', requireAuth, async (req, res) => {
  try {
    const favorites = db.getUserFavorites(req.userId);
    const discovered = db.getUserDiscoveredArtists(req.userId);
    const uniqueArtists = new Set([
      ...favorites.map((f) => f.artist_name.toLowerCase().trim()),
      ...discovered.map((d) => d.artist_name.toLowerCase().trim()),
    ]);

    if (uniqueArtists.size < 4) {
      return res.status(400).json({
        error: 'Need at least 4 unique artists (favorites + discoveries) to build your universe.',
      });
    }

    // Check if already computing
    if (computingUsers.has(req.userId)) {
      return res.json({ status: 'computing', message: 'Already computing.' });
    }

    // Check if hash unchanged
    const currentHash = computeArtistHash(favorites, discovered);
    const existingHash = db.getUniverseArtistHash(req.userId);
    if (existingHash === currentHash) {
      return res.json({ status: 'ready', message: 'Universe is up to date.' });
    }

    // Mark as computing and return immediately
    computingUsers.add(req.userId);
    res.json({ status: 'computing', message: 'Computing your universe...' });

    // Background compute
    const userId = req.userId;
    try {
      const result = await computeUniverse(userId, db);

      if (result.error) {
        db.upsertUniverseSnapshot(userId, {
          snapshotData: {},
          artistHash: currentHash,
          clusterCount: 0,
          artistCount: uniqueArtists.size,
          recommendationCount: 0,
          status: 'error',
          errorMessage: result.error,
        });
      } else {
        db.upsertUniverseSnapshot(userId, {
          snapshotData: result,
          artistHash: currentHash,
          clusterCount: result.clusters.length,
          artistCount: result.artistCount,
          recommendationCount: result.clusters.reduce((sum, c) => sum + c.recommendations.length, 0),
          status: 'ready',
        });
      }
    } catch (err) {
      console.error('Universe compute error:', err);
      db.upsertUniverseSnapshot(userId, {
        snapshotData: {},
        artistHash: '',
        clusterCount: 0,
        artistCount: uniqueArtists.size,
        recommendationCount: 0,
        status: 'error',
        errorMessage: err.message || 'Compute failed',
      });
    } finally {
      computingUsers.delete(userId);
    }
  } catch (err) {
    console.error('Trigger universe compute error:', err);
    res.status(500).json({ error: 'Failed to start compute.' });
  }
});

// GET /api/universe/status — Lightweight status check for polling
router.get('/status', requireAuth, (req, res) => {
  try {
    const snapshot = db.getUniverseSnapshot(req.userId);
    if (!snapshot) {
      return res.json({ status: 'none' });
    }
    res.json({
      status: snapshot.status,
      computedAt: snapshot.computed_at,
      isComputing: computingUsers.has(req.userId),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check status.' });
  }
});

module.exports = router;
