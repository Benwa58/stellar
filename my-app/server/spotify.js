const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const SpotifyWebApi = require('spotify-web-api-node');
const db = require('./db');
const { requireAuth } = require('./auth');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || process.env.REACT_APP_SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || process.env.REACT_APP_SPOTIFY_CLIENT_SECRET;
const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || 'http://localhost:3000/api/spotify/callback';
const SCOPES = ['playlist-modify-private', 'playlist-modify-public', 'user-read-email', 'user-read-private'];
const REFRESH_TOKEN_DAYS = 7;

function createSpotifyApi() {
  return new SpotifyWebApi({
    clientId: SPOTIFY_CLIENT_ID,
    clientSecret: SPOTIFY_CLIENT_SECRET,
    redirectUri: SPOTIFY_REDIRECT_URI,
  });
}

// --- Helpers ---

function generateAccessToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '15m' });
}

function generateRefreshToken() {
  return crypto.randomBytes(40).toString('hex');
}

function setAuthCookies(res, accessToken, refreshToken) {
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie('stellar_access', accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    maxAge: 15 * 60 * 1000,
  });
  res.cookie('stellar_refresh', refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/api/auth',
    maxAge: REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
  });
}

async function ensureValidSpotifyToken(user) {
  const now = Math.floor(Date.now() / 1000);
  if (user.spotify_token_expires_at && user.spotify_token_expires_at > now + 60) {
    // Token still valid (with 60s buffer)
    return user.spotify_access_token;
  }

  // Refresh the token
  const spotifyApi = createSpotifyApi();
  spotifyApi.setRefreshToken(user.spotify_refresh_token);
  const data = await spotifyApi.refreshAccessToken();

  const newAccessToken = data.body.access_token;
  const expiresAt = Math.floor(Date.now() / 1000) + data.body.expires_in;
  const newRefreshToken = data.body.refresh_token || user.spotify_refresh_token;

  db.updateSpotifyTokens(user.id, {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    expiresAt,
  });

  return newAccessToken;
}

// --- OAuth Routes (mounted at /api/spotify but the redirect routes are at /api/auth/spotify) ---
// Note: These are registered in server.js under /api/spotify

// GET /api/spotify/login — redirect to Spotify authorization
router.get('/login', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  const isProduction = process.env.NODE_ENV === 'production';

  res.cookie('spotify_state', state, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax', // lax needed for OAuth redirect back
    maxAge: 10 * 60 * 1000, // 10 minutes
  });

  const spotifyApi = createSpotifyApi();
  const authorizeUrl = spotifyApi.createAuthorizeURL(SCOPES, state);
  res.redirect(authorizeUrl);
});

// GET /api/spotify/callback — handle Spotify OAuth callback
router.get('/callback', async (req, res) => {
  try {
    const { code, state, error: spotifyError } = req.query;

    if (spotifyError) {
      console.error('Spotify OAuth error:', spotifyError);
      return res.redirect('/?auth=error&reason=spotify_denied');
    }

    // Validate CSRF state
    const storedState = req.cookies.spotify_state;
    if (!state || state !== storedState) {
      return res.redirect('/?auth=error&reason=invalid_state');
    }
    res.clearCookie('spotify_state');

    // Exchange code for tokens
    const spotifyApi = createSpotifyApi();
    const tokenData = await spotifyApi.authorizationCodeGrant(code);
    const spotifyAccessToken = tokenData.body.access_token;
    const spotifyRefreshToken = tokenData.body.refresh_token;
    const expiresAt = Math.floor(Date.now() / 1000) + tokenData.body.expires_in;

    // Get Spotify user profile
    spotifyApi.setAccessToken(spotifyAccessToken);
    const profileData = await spotifyApi.getMe();
    const spotifyId = profileData.body.id;
    const spotifyDisplayName = profileData.body.display_name || spotifyId;
    const spotifyEmail = profileData.body.email;

    // Check if user is already logged in (linking Spotify to existing account)
    const existingAccessToken = req.cookies.stellar_access;
    let user;

    if (existingAccessToken) {
      try {
        const payload = jwt.verify(existingAccessToken, JWT_SECRET);
        user = db.getUserById(payload.userId);
        if (user) {
          // Link Spotify to existing account
          db.linkSpotify(user.id, {
            spotifyId,
            accessToken: spotifyAccessToken,
            refreshToken: spotifyRefreshToken,
            expiresAt,
          });
          user = db.getUserById(user.id); // Re-fetch with updated data
        }
      } catch (e) {
        // Token invalid, treat as new login
      }
    }

    if (!user) {
      // Check if user exists by Spotify ID
      user = db.getUserBySpotifyId(spotifyId);
      if (user) {
        // Update tokens
        db.updateSpotifyTokens(user.id, {
          accessToken: spotifyAccessToken,
          refreshToken: spotifyRefreshToken,
          expiresAt,
        });
      } else {
        // Create new user
        user = db.createUser({
          email: spotifyEmail ? spotifyEmail.toLowerCase() : null,
          displayName: spotifyDisplayName,
          spotifyId,
          spotifyAccessToken,
          spotifyRefreshToken,
          spotifyTokenExpiresAt: expiresAt,
        });
      }
    }

    // Issue app auth tokens
    const appAccessToken = generateAccessToken(user.id);
    const appRefreshToken = generateRefreshToken();
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000).toISOString();
    db.saveRefreshToken(user.id, appRefreshToken, refreshExpiresAt);

    setAuthCookies(res, appAccessToken, appRefreshToken);
    res.redirect('/?auth=success');
  } catch (err) {
    console.error('Spotify callback error:', err);
    res.redirect('/?auth=error&reason=callback_failed');
  }
});

// POST /api/spotify/export-playlist — create a Spotify playlist from galaxy artists
router.post('/export-playlist', requireAuth, async (req, res) => {
  try {
    const user = db.getUserById(req.userId);
    if (!user || !user.spotify_id) {
      return res.status(403).json({ error: 'Spotify account not linked.' });
    }

    const { name, artists, tracksPerArtist = 1 } = req.body;

    if (!name || !artists || !Array.isArray(artists) || artists.length === 0) {
      return res.status(400).json({ error: 'Playlist name and artists are required.' });
    }

    const numTracks = Math.min(Math.max(Number(tracksPerArtist) || 1, 1), 3);

    // Get valid Spotify token
    const spotifyAccessToken = await ensureValidSpotifyToken(user);
    const spotifyApi = createSpotifyApi();
    spotifyApi.setAccessToken(spotifyAccessToken);

    // Search for each artist and get top tracks
    const trackUris = [];
    const BATCH_SIZE = 10;

    for (let i = 0; i < artists.length; i += BATCH_SIZE) {
      const batch = artists.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (artist) => {
          try {
            // Search for artist
            const searchResult = await spotifyApi.searchArtists(artist.name, { limit: 1 });
            const spotifyArtist = searchResult.body.artists?.items?.[0];
            if (!spotifyArtist) return [];

            // Get top tracks
            const topTracks = await spotifyApi.getArtistTopTracks(spotifyArtist.id, 'US');
            return topTracks.body.tracks.slice(0, numTracks).map((t) => t.uri);
          } catch (err) {
            console.error(`Spotify search failed for ${artist.name}:`, err.message);
            return [];
          }
        })
      );
      trackUris.push(...results.flat());
    }

    if (trackUris.length === 0) {
      return res.status(400).json({ error: 'No tracks found for any of the artists.' });
    }

    // Create playlist
    const playlist = await spotifyApi.createPlaylist(name, {
      description: 'Created by Stellar Galaxy Music',
      public: false,
    });

    // Add tracks (max 100 per call)
    for (let i = 0; i < trackUris.length; i += 100) {
      await spotifyApi.addTracksToPlaylist(playlist.body.id, trackUris.slice(i, i + 100));
    }

    res.json({
      success: true,
      playlistUrl: playlist.body.external_urls.spotify,
      playlistId: playlist.body.id,
      trackCount: trackUris.length,
    });
  } catch (err) {
    console.error('Export playlist error:', err.message || err);
    const statusCode = err.statusCode || 500;
    const message = err.statusCode === 401
      ? 'Spotify session expired. Please re-link your Spotify account.'
      : `Failed to create playlist: ${err.message || 'Unknown error'}`;
    res.status(statusCode).json({ error: message });
  }
});

module.exports = router;
