const express = require('express');
const db = require('./db');
const { requireAuth } = require('./auth');

const router = express.Router();

// GET /api/friends — list accepted friends
router.get('/', requireAuth, (req, res) => {
  try {
    const friends = db.getFriends(req.userId);
    res.json({
      friends: friends.map((f) => ({
        id: f.id,
        displayName: f.display_name,
        username: f.username,
        acceptedAt: f.accepted_at,
      })),
    });
  } catch (err) {
    console.error('Get friends error:', err);
    res.status(500).json({ error: 'Failed to fetch friends' });
  }
});

// GET /api/friends/requests — incoming friend requests
router.get('/requests', requireAuth, (req, res) => {
  try {
    const requests = db.getIncomingRequests(req.userId);
    res.json({
      requests: requests.map((r) => ({
        id: r.id,
        displayName: r.display_name,
        username: r.username,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    console.error('Get friend requests error:', err);
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

// GET /api/friends/sent — sent friend requests
router.get('/sent', requireAuth, (req, res) => {
  try {
    const sent = db.getSentRequests(req.userId);
    res.json({
      sent: sent.map((s) => ({
        id: s.id,
        displayName: s.display_name,
        username: s.username,
        createdAt: s.created_at,
      })),
    });
  } catch (err) {
    console.error('Get sent requests error:', err);
    res.status(500).json({ error: 'Failed to fetch sent requests' });
  }
});

// POST /api/friends/request — send a friend request
router.post('/request', requireAuth, (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Username is required' });

    const target = db.getUserByUsername(username.toLowerCase());
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.id === req.userId) return res.status(400).json({ error: 'Cannot friend yourself' });

    // Check for existing friendship in either direction
    const existing = db.getFriendship(req.userId, target.id);
    if (existing) {
      if (existing.status === 'accepted') {
        return res.status(400).json({ error: 'Already friends' });
      }
      if (existing.requester_id === req.userId) {
        return res.status(400).json({ error: 'Request already sent' });
      }
      // They sent us a request — auto-accept
      db.acceptFriendRequest(existing.requester_id, existing.addressee_id);
      return res.json({ status: 'accepted' });
    }

    const result = db.sendFriendRequest(req.userId, target.id);
    if (!result.ok) return res.status(400).json({ error: result.error });

    res.json({ status: 'pending' });
  } catch (err) {
    console.error('Send friend request error:', err);
    res.status(500).json({ error: 'Failed to send request' });
  }
});

// POST /api/friends/accept — accept a friend request
router.post('/accept', requireAuth, (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    const accepted = db.acceptFriendRequest(userId, req.userId);
    if (!accepted) return res.status(404).json({ error: 'No pending request found' });

    res.json({ ok: true });
  } catch (err) {
    console.error('Accept friend request error:', err);
    res.status(500).json({ error: 'Failed to accept request' });
  }
});

// POST /api/friends/reject — reject a friend request
router.post('/reject', requireAuth, (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    const rejected = db.rejectFriendRequest(userId, req.userId);
    if (!rejected) return res.status(404).json({ error: 'No pending request found' });

    res.json({ ok: true });
  } catch (err) {
    console.error('Reject friend request error:', err);
    res.status(500).json({ error: 'Failed to reject request' });
  }
});

// DELETE /api/friends/:userId — remove a friend
router.delete('/:userId', requireAuth, (req, res) => {
  try {
    const targetId = parseInt(req.params.userId, 10);
    if (isNaN(targetId)) return res.status(400).json({ error: 'Invalid userId' });

    const removed = db.removeFriend(req.userId, targetId);
    if (!removed) return res.status(404).json({ error: 'Friendship not found' });

    res.json({ ok: true });
  } catch (err) {
    console.error('Remove friend error:', err);
    res.status(500).json({ error: 'Failed to remove friend' });
  }
});

// GET /api/friends/search?q=... — search users by username
router.get('/search', requireAuth, (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json({ users: [] });

    const users = db.searchUsersByUsername(q.toLowerCase(), req.userId);
    res.json({
      users: users.map((u) => ({
        id: u.id,
        displayName: u.display_name,
        username: u.username,
      })),
    });
  } catch (err) {
    console.error('Search users error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// GET /api/friends/:userId/artists — get a friend's favorites and discovered artists
router.get('/:userId/artists', requireAuth, (req, res) => {
  try {
    const friendId = parseInt(req.params.userId, 10);
    if (isNaN(friendId)) return res.status(400).json({ error: 'Invalid userId' });

    // Verify friendship
    const friendship = db.getFriendship(req.userId, friendId);
    if (!friendship || friendship.status !== 'accepted') {
      return res.status(403).json({ error: 'Not friends with this user' });
    }

    const favorites = db.getUserFavorites(friendId);
    const discovered = db.getUserDiscoveredArtists(friendId);
    const user = db.getUserById(friendId);

    res.json({
      displayName: user?.display_name || 'Friend',
      username: user?.username || null,
      hasAvatar: !!(user?.avatar),
      favorites: favorites.map((f) => ({
        artistName: f.artist_name,
        artistId: f.artist_id,
        artistImage: f.artist_image,
      })),
      discoveredArtists: discovered.map((d) => ({
        artistName: d.artist_name,
        artistId: d.artist_id,
        artistImage: d.artist_image,
      })),
    });
  } catch (err) {
    console.error('Get friend artists error:', err);
    res.status(500).json({ error: 'Failed to fetch friend artists' });
  }
});

module.exports = router;
