const Database = require('better-sqlite3');
const path = require('path');

// In production, use the persistent disk mount; locally, use ./data/
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'stellar.db');

let db;

function getDb() {
  if (!db) {
    const instance = new Database(DB_PATH);
    instance.pragma('journal_mode = WAL');
    instance.pragma('foreign_keys = ON');
    db = instance;
    try {
      initSchema();
    } catch (err) {
      db = null;
      throw err;
    }
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      password_hash TEXT,
      display_name TEXT NOT NULL,
      username TEXT UNIQUE,
      spotify_id TEXT UNIQUE,
      spotify_access_token TEXT,
      spotify_refresh_token TEXT,
      spotify_token_expires_at INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);

    CREATE TABLE IF NOT EXISTS saved_maps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      seed_artists TEXT NOT NULL,
      galaxy_data TEXT NOT NULL,
      node_count INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_saved_maps_user ON saved_maps(user_id);

    CREATE TABLE IF NOT EXISTS favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      artist_name TEXT NOT NULL,
      artist_id TEXT,
      artist_image TEXT,
      added_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, artist_name)
    );
    CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);

    CREATE TABLE IF NOT EXISTS dislikes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      artist_name TEXT NOT NULL,
      artist_id TEXT,
      artist_image TEXT,
      added_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, artist_name)
    );
    CREATE INDEX IF NOT EXISTS idx_dislikes_user ON dislikes(user_id);

    CREATE TABLE IF NOT EXISTS known_artists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      artist_name TEXT NOT NULL,
      artist_id TEXT,
      artist_image TEXT,
      added_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, artist_name)
    );
    CREATE INDEX IF NOT EXISTS idx_known_artists_user ON known_artists(user_id);

    CREATE TABLE IF NOT EXISTS discovered_artists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      artist_name TEXT NOT NULL,
      artist_id TEXT,
      artist_image TEXT,
      added_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, artist_name)
    );
    CREATE INDEX IF NOT EXISTS idx_discovered_artists_user ON discovered_artists(user_id);

    CREATE TABLE IF NOT EXISTS playlist_exports (
      id TEXT PRIMARY KEY,
      playlist_name TEXT NOT NULL,
      track_list TEXT NOT NULL,
      seed_artists TEXT,
      node_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      visibility TEXT DEFAULT 'public'
    );
    CREATE INDEX IF NOT EXISTS idx_playlist_exports_created_by ON playlist_exports(created_by);

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_password_reset_token ON password_reset_tokens(token);

    CREATE TABLE IF NOT EXISTS shared_galaxies (
      id TEXT PRIMARY KEY,
      owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      map_name TEXT NOT NULL,
      seed_artists TEXT NOT NULL,
      galaxy_data TEXT NOT NULL,
      thumbnail BLOB,
      node_count INTEGER NOT NULL DEFAULT 0,
      link_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS universe_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      snapshot_data TEXT NOT NULL,
      artist_hash TEXT NOT NULL,
      cluster_count INTEGER NOT NULL DEFAULT 0,
      artist_count INTEGER NOT NULL DEFAULT 0,
      recommendation_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      error_message TEXT,
      computed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_universe_user ON universe_snapshots(user_id);

    CREATE TABLE IF NOT EXISTS shared_universes (
      id TEXT PRIMARY KEY,
      owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      map_name TEXT NOT NULL,
      universe_data TEXT NOT NULL,
      thumbnail BLOB,
      node_count INTEGER NOT NULL DEFAULT 0,
      link_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS friendships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      addressee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      accepted_at TEXT,
      UNIQUE(requester_id, addressee_id)
    );
    CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id);
    CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id);
  `);

  // --- Migrations for existing databases ---
  function hasColumn(table, column) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    return cols.some(c => c.name === column);
  }

  // Add thumbnail column if it doesn't exist (added after initial release)
  if (!hasColumn('shared_galaxies', 'thumbnail')) {
    db.exec("ALTER TABLE shared_galaxies ADD COLUMN thumbnail BLOB");
  }

  // Add username column if it doesn't exist
  // Note: SQLite does not allow UNIQUE constraints on ALTER TABLE ADD COLUMN,
  // so we add the column plain and enforce uniqueness via a separate index.
  if (!hasColumn('users', 'username')) {
    db.exec("ALTER TABLE users ADD COLUMN username TEXT");
  }
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)");


  // One-time migrations tracked by name
  db.exec("CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY)");

  // Clear any auto-backfilled usernames so existing users can choose their own
  // via the ChooseUsernameModal on next login.
  if (!db.prepare("SELECT 1 FROM _migrations WHERE name = 'clear_backfilled_usernames'").get()) {
    db.exec("UPDATE users SET username = NULL");
    db.prepare("INSERT INTO _migrations (name) VALUES (?)").run('clear_backfilled_usernames');
  }
}

// --- User helpers ---

function createUser({ email, passwordHash, displayName, username, spotifyId, spotifyAccessToken, spotifyRefreshToken, spotifyTokenExpiresAt }) {
  const stmt = getDb().prepare(`
    INSERT INTO users (email, password_hash, display_name, username, spotify_id, spotify_access_token, spotify_refresh_token, spotify_token_expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(email || null, passwordHash || null, displayName, username || null, spotifyId || null, spotifyAccessToken || null, spotifyRefreshToken || null, spotifyTokenExpiresAt || null);
  return getUserById(result.lastInsertRowid);
}

function getUserById(id) {
  return getDb().prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function getUserByEmail(email) {
  return getDb().prepare('SELECT * FROM users WHERE email = ?').get(email);
}

function getUserByUsername(username) {
  return getDb().prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username);
}

function updateUsername(userId, username) {
  getDb().prepare("UPDATE users SET username = ?, updated_at = datetime('now') WHERE id = ?").run(username, userId);
}

function getUserBySpotifyId(spotifyId) {
  return getDb().prepare('SELECT * FROM users WHERE spotify_id = ?').get(spotifyId);
}

function updateSpotifyTokens(userId, { accessToken, refreshToken, expiresAt }) {
  getDb().prepare(`
    UPDATE users SET spotify_access_token = ?, spotify_refresh_token = ?, spotify_token_expires_at = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(accessToken, refreshToken, expiresAt, userId);
}

function linkSpotify(userId, { spotifyId, accessToken, refreshToken, expiresAt }) {
  getDb().prepare(`
    UPDATE users SET spotify_id = ?, spotify_access_token = ?, spotify_refresh_token = ?, spotify_token_expires_at = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(spotifyId, accessToken, refreshToken, expiresAt, userId);
}

// --- Refresh token helpers ---

function saveRefreshToken(userId, token, expiresAt) {
  getDb().prepare(`
    INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)
  `).run(userId, token, expiresAt);
}

function getRefreshToken(token) {
  return getDb().prepare('SELECT * FROM refresh_tokens WHERE token = ?').get(token);
}

function deleteRefreshToken(token) {
  getDb().prepare('DELETE FROM refresh_tokens WHERE token = ?').run(token);
}

function deleteUserRefreshTokens(userId) {
  getDb().prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(userId);
}

// --- Map helpers ---

function getUserMaps(userId) {
  return getDb().prepare(
    'SELECT id, name, seed_artists, galaxy_data, node_count, created_at FROM saved_maps WHERE user_id = ? ORDER BY created_at DESC'
  ).all(userId);
}

function getMapById(id, userId) {
  return getDb().prepare(
    'SELECT * FROM saved_maps WHERE id = ? AND user_id = ?'
  ).get(id, userId);
}

function createMap(userId, { name, seedArtists, galaxyData, nodeCount }) {
  const stmt = getDb().prepare(`
    INSERT INTO saved_maps (user_id, name, seed_artists, galaxy_data, node_count) VALUES (?, ?, ?, ?, ?)
  `);
  const result = stmt.run(userId, name, JSON.stringify(seedArtists), JSON.stringify(galaxyData), nodeCount);
  return result.lastInsertRowid;
}

function deleteMap(id, userId) {
  const result = getDb().prepare('DELETE FROM saved_maps WHERE id = ? AND user_id = ?').run(id, userId);
  return result.changes > 0;
}

function countUserMaps(userId) {
  return getDb().prepare('SELECT COUNT(*) as count FROM saved_maps WHERE user_id = ?').get(userId).count;
}

// --- Favorites helpers ---

function getUserFavorites(userId) {
  return getDb().prepare(
    'SELECT * FROM favorites WHERE user_id = ? ORDER BY added_at DESC'
  ).all(userId);
}

function addFavorite(userId, { artistName, artistId, artistImage }) {
  try {
    getDb().prepare(`
      INSERT INTO favorites (user_id, artist_name, artist_id, artist_image) VALUES (?, ?, ?, ?)
    `).run(userId, artistName, artistId || null, artistImage || null);
    return true;
  } catch (err) {
    if (err.message.includes('UNIQUE constraint')) return false; // already favorited
    throw err;
  }
}

function removeFavorite(userId, artistName) {
  const result = getDb().prepare('DELETE FROM favorites WHERE user_id = ? AND artist_name = ?').run(userId, artistName);
  return result.changes > 0;
}

// --- Dislikes helpers ---

function getUserDislikes(userId) {
  return getDb().prepare(
    'SELECT * FROM dislikes WHERE user_id = ? ORDER BY added_at DESC'
  ).all(userId);
}

function addDislike(userId, { artistName, artistId, artistImage }) {
  try {
    getDb().prepare(`
      INSERT INTO dislikes (user_id, artist_name, artist_id, artist_image) VALUES (?, ?, ?, ?)
    `).run(userId, artistName, artistId || null, artistImage || null);
    return true;
  } catch (err) {
    if (err.message.includes('UNIQUE constraint')) return false; // already disliked
    throw err;
  }
}

function removeDislike(userId, artistName) {
  const result = getDb().prepare('DELETE FROM dislikes WHERE user_id = ? AND artist_name = ?').run(userId, artistName);
  return result.changes > 0;
}

// --- Known artists helpers ---

function getUserKnownArtists(userId) {
  return getDb().prepare(
    'SELECT * FROM known_artists WHERE user_id = ? ORDER BY added_at DESC'
  ).all(userId);
}

function addKnownArtist(userId, { artistName, artistId, artistImage }) {
  try {
    getDb().prepare(`
      INSERT INTO known_artists (user_id, artist_name, artist_id, artist_image) VALUES (?, ?, ?, ?)
    `).run(userId, artistName, artistId || null, artistImage || null);
    return true;
  } catch (err) {
    if (err.message.includes('UNIQUE constraint')) return false;
    throw err;
  }
}

function removeKnownArtist(userId, artistName) {
  const result = getDb().prepare('DELETE FROM known_artists WHERE user_id = ? AND artist_name = ?').run(userId, artistName);
  return result.changes > 0;
}

// --- Discovered artists helpers ---

function getUserDiscoveredArtists(userId) {
  return getDb().prepare(
    'SELECT * FROM discovered_artists WHERE user_id = ? ORDER BY added_at DESC'
  ).all(userId);
}

function addDiscoveredArtist(userId, { artistName, artistId, artistImage }) {
  try {
    getDb().prepare(`
      INSERT INTO discovered_artists (user_id, artist_name, artist_id, artist_image) VALUES (?, ?, ?, ?)
    `).run(userId, artistName, artistId || null, artistImage || null);
    return true;
  } catch (err) {
    if (err.message.includes('UNIQUE constraint')) return false;
    throw err;
  }
}

function removeDiscoveredArtist(userId, artistName) {
  const result = getDb().prepare('DELETE FROM discovered_artists WHERE user_id = ? AND artist_name = ?').run(userId, artistName);
  return result.changes > 0;
}

// --- Playlist export helpers ---

function createPlaylistExport(id, { playlistName, trackList, seedArtists, nodeCount, createdBy, visibility }) {
  getDb().prepare(`
    INSERT INTO playlist_exports (id, playlist_name, track_list, seed_artists, node_count, created_by, visibility)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, playlistName, JSON.stringify(trackList), JSON.stringify(seedArtists || []), nodeCount || 0, createdBy || null, visibility || 'public');
}

function getPlaylistExport(id) {
  return getDb().prepare('SELECT * FROM playlist_exports WHERE id = ?').get(id);
}

function getUserPlaylistExports(userId) {
  return getDb().prepare(
    'SELECT id, playlist_name, node_count, created_at FROM playlist_exports WHERE created_by = ? ORDER BY created_at DESC'
  ).all(userId);
}

// --- Password reset token helpers ---

function savePasswordResetToken(userId, token, expiresAt) {
  getDb().prepare(`
    INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)
  `).run(userId, token, expiresAt);
}

function getPasswordResetToken(token) {
  return getDb().prepare('SELECT * FROM password_reset_tokens WHERE token = ? AND used = 0').get(token);
}

function markPasswordResetTokenUsed(token) {
  getDb().prepare('UPDATE password_reset_tokens SET used = 1 WHERE token = ?').run(token);
}

function updateUserPassword(userId, passwordHash) {
  getDb().prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`).run(passwordHash, userId);
}

function cleanupExpiredResetTokens() {
  getDb().prepare("DELETE FROM password_reset_tokens WHERE expires_at < datetime('now')").run();
}

// --- Shared galaxy helpers ---

function createSharedGalaxy(id, { mapName, seedArtists, galaxyData, nodeCount, linkCount, ownerUserId, thumbnail }) {
  getDb().prepare(`
    INSERT INTO shared_galaxies (id, owner_user_id, map_name, seed_artists, galaxy_data, thumbnail, node_count, link_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, ownerUserId || null, mapName, JSON.stringify(seedArtists), JSON.stringify(galaxyData), thumbnail || null, nodeCount || 0, linkCount || 0);
}

function getSharedGalaxyThumbnail(id) {
  return getDb().prepare('SELECT thumbnail FROM shared_galaxies WHERE id = ?').get(id);
}

function getSharedGalaxy(id) {
  return getDb().prepare('SELECT * FROM shared_galaxies WHERE id = ?').get(id);
}

// --- Shared universe helpers ---

function createSharedUniverse(id, { mapName, universeData, nodeCount, linkCount, ownerUserId, thumbnail }) {
  getDb().prepare(`
    INSERT INTO shared_universes (id, owner_user_id, map_name, universe_data, thumbnail, node_count, link_count)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, ownerUserId || null, mapName, JSON.stringify(universeData), thumbnail || null, nodeCount || 0, linkCount || 0);
}

function getSharedUniverseThumbnail(id) {
  return getDb().prepare('SELECT thumbnail FROM shared_universes WHERE id = ?').get(id);
}

function getSharedUniverse(id) {
  return getDb().prepare('SELECT * FROM shared_universes WHERE id = ?').get(id);
}

// --- Universe snapshot helpers ---

function getUniverseSnapshot(userId) {
  return getDb().prepare(
    'SELECT * FROM universe_snapshots WHERE user_id = ?'
  ).get(userId);
}

function upsertUniverseSnapshot(userId, { snapshotData, artistHash, clusterCount, artistCount, recommendationCount, status, errorMessage }) {
  const existing = getUniverseSnapshot(userId);
  if (existing) {
    getDb().prepare(`
      UPDATE universe_snapshots
      SET snapshot_data = ?, artist_hash = ?, cluster_count = ?, artist_count = ?,
          recommendation_count = ?, status = ?, error_message = ?,
          computed_at = datetime('now'), updated_at = datetime('now')
      WHERE user_id = ?
    `).run(
      JSON.stringify(snapshotData), artistHash, clusterCount, artistCount,
      recommendationCount, status, errorMessage || null, userId
    );
  } else {
    getDb().prepare(`
      INSERT INTO universe_snapshots
        (user_id, snapshot_data, artist_hash, cluster_count, artist_count,
         recommendation_count, status, error_message, computed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      userId, JSON.stringify(snapshotData), artistHash, clusterCount,
      artistCount, recommendationCount, status, errorMessage || null
    );
  }
}

function setUniverseStatus(userId, status, errorMessage) {
  const existing = getUniverseSnapshot(userId);
  if (existing) {
    getDb().prepare(`
      UPDATE universe_snapshots SET status = ?, error_message = ?, updated_at = datetime('now')
      WHERE user_id = ?
    `).run(status, errorMessage || null, userId);
  }
}

function getUniverseArtistHash(userId) {
  const row = getDb().prepare(
    'SELECT artist_hash FROM universe_snapshots WHERE user_id = ?'
  ).get(userId);
  return row?.artist_hash || null;
}

// --- Friendship helpers ---

function sendFriendRequest(requesterId, addresseeId) {
  try {
    getDb().prepare(`
      INSERT INTO friendships (requester_id, addressee_id, status) VALUES (?, ?, 'pending')
    `).run(requesterId, addresseeId);
    return { ok: true };
  } catch (err) {
    if (err.message.includes('UNIQUE constraint')) return { ok: false, error: 'Request already exists' };
    throw err;
  }
}

function acceptFriendRequest(requesterId, addresseeId) {
  const result = getDb().prepare(`
    UPDATE friendships SET status = 'accepted', accepted_at = datetime('now')
    WHERE requester_id = ? AND addressee_id = ? AND status = 'pending'
  `).run(requesterId, addresseeId);
  return result.changes > 0;
}

function rejectFriendRequest(requesterId, addresseeId) {
  const result = getDb().prepare(`
    DELETE FROM friendships
    WHERE requester_id = ? AND addressee_id = ? AND status = 'pending'
  `).run(requesterId, addresseeId);
  return result.changes > 0;
}

function removeFriend(userId1, userId2) {
  const result = getDb().prepare(`
    DELETE FROM friendships
    WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)
  `).run(userId1, userId2, userId2, userId1);
  return result.changes > 0;
}

function getFriends(userId) {
  return getDb().prepare(`
    SELECT u.id, u.display_name, u.username, f.accepted_at
    FROM friendships f
    JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END
    WHERE (f.requester_id = ? OR f.addressee_id = ?) AND f.status = 'accepted'
    ORDER BY f.accepted_at DESC
  `).all(userId, userId, userId);
}

function getIncomingRequests(userId) {
  return getDb().prepare(`
    SELECT u.id, u.display_name, u.username, f.created_at
    FROM friendships f
    JOIN users u ON u.id = f.requester_id
    WHERE f.addressee_id = ? AND f.status = 'pending'
    ORDER BY f.created_at DESC
  `).all(userId);
}

function getSentRequests(userId) {
  return getDb().prepare(`
    SELECT u.id, u.display_name, u.username, f.created_at
    FROM friendships f
    JOIN users u ON u.id = f.addressee_id
    WHERE f.requester_id = ? AND f.status = 'pending'
    ORDER BY f.created_at DESC
  `).all(userId);
}

function getFriendship(userId1, userId2) {
  return getDb().prepare(`
    SELECT * FROM friendships
    WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)
  `).get(userId1, userId2, userId2, userId1);
}

function searchUsersByUsername(query, excludeUserId) {
  return getDb().prepare(`
    SELECT id, display_name, username FROM users
    WHERE username LIKE ? AND id != ? AND username IS NOT NULL
    LIMIT 10
  `).all(`%${query}%`, excludeUserId);
}

module.exports = {
  getDb,
  createUser,
  getUserById,
  getUserByEmail,
  getUserByUsername,
  updateUsername,
  getUserBySpotifyId,
  updateSpotifyTokens,
  linkSpotify,
  saveRefreshToken,
  getRefreshToken,
  deleteRefreshToken,
  deleteUserRefreshTokens,
  getUserMaps,
  getMapById,
  createMap,
  deleteMap,
  countUserMaps,
  getUserFavorites,
  addFavorite,
  removeFavorite,
  getUserDislikes,
  addDislike,
  removeDislike,
  getUserKnownArtists,
  addKnownArtist,
  removeKnownArtist,
  getUserDiscoveredArtists,
  addDiscoveredArtist,
  removeDiscoveredArtist,
  createPlaylistExport,
  getPlaylistExport,
  getUserPlaylistExports,
  savePasswordResetToken,
  getPasswordResetToken,
  markPasswordResetTokenUsed,
  updateUserPassword,
  cleanupExpiredResetTokens,
  createSharedGalaxy,
  getSharedGalaxy,
  getSharedGalaxyThumbnail,
  createSharedUniverse,
  getSharedUniverse,
  getSharedUniverseThumbnail,
  getUniverseSnapshot,
  upsertUniverseSnapshot,
  setUniverseStatus,
  getUniverseArtistHash,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  removeFriend,
  getFriends,
  getIncomingRequests,
  getSentRequests,
  getFriendship,
  searchUsersByUsername,
};
