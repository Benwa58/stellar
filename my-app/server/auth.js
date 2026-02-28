const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const db = require('./db');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_DAYS = 7;
const BCRYPT_ROUNDS = 12;

// Rate limiting for auth endpoints (simple in-memory)
const loginAttempts = new Map(); // ip -> { count, resetAt }
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 60 * 1000; // 1 minute

function rateLimit(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const entry = loginAttempts.get(ip);

  if (entry && entry.resetAt > now) {
    if (entry.count >= MAX_ATTEMPTS) {
      return res.status(429).json({ error: 'Too many attempts. Try again later.' });
    }
    entry.count++;
  } else {
    loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  }
  next();
}

// --- Helpers ---

function generateAccessToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

function generateRefreshToken() {
  return crypto.randomBytes(40).toString('hex');
}

function setAuthCookies(res, accessToken, refreshToken, req) {
  const isProduction = process.env.NODE_ENV === 'production';
  const isCapacitor = req?.headers?.origin === 'capacitor://localhost';

  // Capacitor iOS sends cross-origin requests — needs sameSite: 'none' + secure: true
  const cookieBase = {
    httpOnly: true,
    secure: isProduction || isCapacitor,
    sameSite: isCapacitor ? 'none' : 'lax',
  };

  res.cookie('stellar_access', accessToken, {
    ...cookieBase,
    maxAge: 15 * 60 * 1000, // 15 minutes
  });

  res.cookie('stellar_refresh', refreshToken, {
    ...cookieBase,
    maxAge: REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
  });
}

function clearAuthCookies(res) {
  res.clearCookie('stellar_access');
  res.clearCookie('stellar_refresh');
}

function sanitizeUser(user) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    username: user.username || null,
    hasSpotify: !!user.spotify_id,
  };
}

// Username rules: 3-20 chars, lowercase alphanumeric + underscore/dash,
// must start with a letter.
const USERNAME_RE = /^[a-z][a-z0-9_-]{2,19}$/;
const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'stellar', 'api', 'app', 'www', 'help',
  'support', 'system', 'root', 'null', 'undefined', 'login', 'register',
  'signup', 'signin', 'logout', 'account', 'settings', 'profile',
  'user', 'users', 'explore', 'playlist', 'playlists', 'galaxy',
  'universe', 'share', 'shared', 'reset', 'password', 'forgot',
]);

function validateUsername(username) {
  if (!username) return 'Username is required.';
  const lower = username.toLowerCase();
  if (!USERNAME_RE.test(lower)) {
    if (lower.length < 3) return 'Username must be at least 3 characters.';
    if (lower.length > 20) return 'Username must be 20 characters or fewer.';
    if (!/^[a-z]/.test(lower)) return 'Username must start with a letter.';
    return 'Username can only contain lowercase letters, numbers, underscores, and hyphens.';
  }
  if (RESERVED_USERNAMES.has(lower)) return 'That username is reserved.';
  return null;
}

// --- Email notification on new signup ---

function notifyNewSignup({ email, displayName }) {
  const notifyEmail = process.env.NOTIFY_EMAIL;
  const notifyPassword = process.env.NOTIFY_EMAIL_APP_PASSWORD;

  if (!notifyEmail || !notifyPassword) return; // silently skip if not configured

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: notifyEmail, pass: notifyPassword },
  });

  const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });

  transporter.sendMail({
    from: notifyEmail,
    to: notifyEmail,
    subject: `Stellar: New account created — ${displayName}`,
    text: `New user signed up for Stellar:\n\nDisplay Name: ${displayName}\nEmail: ${email}\nTime: ${timestamp}`,
  }).catch((err) => {
    console.error('Signup notification email failed:', err.message);
  });
}

// --- Rate limiting for forgot-password (stricter: 3 per email per 15 min) ---
const resetAttempts = new Map(); // email -> { count, resetAt }
const RESET_MAX_ATTEMPTS = 3;
const RESET_WINDOW_MS = 15 * 60 * 1000;

// --- User-facing email transport (password resets) ---

function sendPasswordResetEmail(toEmail, resetUrl) {
  const resetEmail = process.env.RESET_EMAIL;
  const resetPassword = process.env.RESET_EMAIL_APP_PASSWORD;

  if (!resetEmail || !resetPassword) {
    console.error('Password reset email not configured (RESET_EMAIL / RESET_EMAIL_APP_PASSWORD)');
    return;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: resetEmail, pass: resetPassword },
  });

  transporter.sendMail({
    from: `"Stellar Music" <${resetEmail}>`,
    to: toEmail,
    subject: 'Stellar: Reset your password',
    text: [
      'You requested a password reset for your Stellar account.',
      '',
      'Click the link below to set a new password (expires in 1 hour):',
      resetUrl,
      '',
      'If you didn\'t request this, you can safely ignore this email.',
    ].join('\n'),
    html: [
      '<p>You requested a password reset for your Stellar account.</p>',
      '<p>Click the link below to set a new password (expires in 1 hour):</p>',
      `<p><a href="${resetUrl}">${resetUrl}</a></p>`,
      '<p style="color:#888;font-size:0.9em;">If you didn\'t request this, you can safely ignore this email.</p>',
    ].join('\n'),
  }).catch((err) => {
    console.error('Password reset email failed:', err.message);
  });
}

// --- Helpers: extract token from cookie OR Authorization header ---

function extractAccessToken(req) {
  // Prefer Authorization header (used by Capacitor iOS where cookies are blocked)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  // Fall back to cookie (used by web)
  return req.cookies.stellar_access || null;
}

function extractRefreshToken(req) {
  // Check body first (Capacitor sends it in request body), then cookie (web)
  return req.body?.refreshToken || req.cookies.stellar_refresh || null;
}

function isCapacitorRequest(req) {
  return req.headers.origin === 'capacitor://localhost';
}

// --- Auth middleware (exported for other routes) ---

function requireAuth(req, res, next) {
  const token = extractAccessToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token expired or invalid' });
  }
}

function optionalAuth(req, res, next) {
  const token = extractAccessToken(req);
  if (!token) { req.userId = null; return next(); }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.userId;
  } catch {
    req.userId = null;
  }
  next();
}

// --- Routes ---

// GET /api/auth/check-username?username=...
router.get('/check-username', (req, res) => {
  const { username } = req.query;
  const validationError = validateUsername(username);
  if (validationError) {
    return res.json({ available: false, error: validationError });
  }
  const existing = db.getUserByUsername(username.toLowerCase());
  res.json({ available: !existing });
});

// POST /api/auth/set-username  (for existing users who don't have one yet)
router.post('/set-username', requireAuth, (req, res) => {
  const { username } = req.body;
  const validationError = validateUsername(username);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const user = db.getUserById(req.userId);
  if (!user) return res.status(401).json({ error: 'User not found' });
  if (user.username) return res.status(400).json({ error: 'Username already set.' });

  const lower = username.toLowerCase();
  const existing = db.getUserByUsername(lower);
  if (existing) return res.status(409).json({ error: 'That username is taken.' });

  try {
    db.updateUsername(req.userId, lower);
  } catch (err) {
    if (err.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'That username is taken.' });
    }
    throw err;
  }

  const updated = db.getUserById(req.userId);
  res.json({ user: sanitizeUser(updated) });
});

// POST /api/auth/register
router.post('/register', rateLimit, async (req, res) => {
  try {
    const { email, password, displayName, username } = req.body;

    if (!email || !password || !displayName || !username) {
      return res.status(400).json({ error: 'Email, password, display name, and username are required.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    if (displayName.length > 50) {
      return res.status(400).json({ error: 'Display name must be 50 characters or fewer.' });
    }

    const usernameError = validateUsername(username);
    if (usernameError) {
      return res.status(400).json({ error: usernameError });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email address.' });
    }

    const existing = db.getUserByEmail(email.toLowerCase());
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const existingUsername = db.getUserByUsername(username.toLowerCase());
    if (existingUsername) {
      return res.status(409).json({ error: 'That username is taken.' });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = db.createUser({
      email: email.toLowerCase(),
      passwordHash,
      displayName: displayName.trim(),
      username: username.toLowerCase(),
    });

    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000).toISOString();
    db.saveRefreshToken(user.id, refreshToken, expiresAt);

    // Fire-and-forget email notification
    notifyNewSignup({ email: email.toLowerCase(), displayName: displayName.trim() });

    setAuthCookies(res, accessToken, refreshToken, req);
    const response = { user: sanitizeUser(user) };
    // Capacitor iOS: include tokens in body (WKWebView blocks third-party cookies)
    if (isCapacitorRequest(req)) {
      response.accessToken = accessToken;
      response.refreshToken = refreshToken;
    }
    res.status(201).json(response);
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed.' });
  }
});

// POST /api/auth/login
router.post('/login', rateLimit, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = db.getUserByEmail(email.toLowerCase());
    if (!user || !user.password_hash) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000).toISOString();
    db.saveRefreshToken(user.id, refreshToken, expiresAt);

    setAuthCookies(res, accessToken, refreshToken, req);
    const response = { user: sanitizeUser(user) };
    if (isCapacitorRequest(req)) {
      response.accessToken = accessToken;
      response.refreshToken = refreshToken;
    }
    res.json(response);
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed.' });
  }
});

// POST /api/auth/logout
router.post('/logout', express.json(), (req, res) => {
  const refreshToken = extractRefreshToken(req);
  if (refreshToken) {
    db.deleteRefreshToken(refreshToken);
  }
  clearAuthCookies(res);
  res.json({ ok: true });
});

// POST /api/auth/refresh
router.post('/refresh', express.json(), (req, res) => {
  const refreshToken = extractRefreshToken(req);
  if (!refreshToken) {
    return res.status(401).json({ error: 'No refresh token' });
  }

  const stored = db.getRefreshToken(refreshToken);
  if (!stored || new Date(stored.expires_at) < new Date()) {
    if (stored) db.deleteRefreshToken(refreshToken);
    clearAuthCookies(res);
    return res.status(401).json({ error: 'Refresh token expired' });
  }

  const user = db.getUserById(stored.user_id);
  if (!user) {
    db.deleteRefreshToken(refreshToken);
    clearAuthCookies(res);
    return res.status(401).json({ error: 'User not found' });
  }

  // Rotate refresh token
  db.deleteRefreshToken(refreshToken);
  const newAccessToken = generateAccessToken(user.id);
  const newRefreshToken = generateRefreshToken();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000).toISOString();
  db.saveRefreshToken(user.id, newRefreshToken, expiresAt);

  setAuthCookies(res, newAccessToken, newRefreshToken, req);
  const response = { user: sanitizeUser(user) };
  if (isCapacitorRequest(req)) {
    response.accessToken = newAccessToken;
    response.refreshToken = newRefreshToken;
  }
  res.json(response);
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const user = db.getUserById(req.userId);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }
  res.json({ user: sanitizeUser(user) });
});

// POST /api/auth/forgot-password
router.post('/forgot-password', rateLimit, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Rate limit by email (stricter than general rate limit)
    const now = Date.now();
    const entry = resetAttempts.get(normalizedEmail);
    if (entry && entry.resetAt > now) {
      if (entry.count >= RESET_MAX_ATTEMPTS) {
        // Still return success to prevent enumeration
        return res.json({ ok: true, message: 'If an account with that email exists, a reset link has been sent.' });
      }
      entry.count++;
    } else {
      resetAttempts.set(normalizedEmail, { count: 1, resetAt: now + RESET_WINDOW_MS });
    }

    // Always return the same response (prevent user enumeration)
    const successResponse = { ok: true, message: 'If an account with that email exists, a reset link has been sent.' };

    const user = db.getUserByEmail(normalizedEmail);
    if (!user) {
      return res.json(successResponse);
    }

    // Generate token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
    db.savePasswordResetToken(user.id, token, expiresAt);

    // Build reset URL
    const baseUrl = process.env.STELLAR_BASE_URL || `${req.protocol}://${req.get('host')}`;
    const resetUrl = `${baseUrl}/reset-password?token=${token}`;

    // Fire-and-forget email
    sendPasswordResetEmail(user.email, resetUrl);

    // Cleanup expired tokens occasionally
    db.cleanupExpiredResetTokens();

    res.json(successResponse);
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', rateLimit, async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: 'Token and password are required.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const resetToken = db.getPasswordResetToken(token);
    if (!resetToken) {
      return res.status(400).json({ error: 'Invalid or expired reset link.' });
    }

    // Check expiry
    if (new Date(resetToken.expires_at) < new Date()) {
      db.markPasswordResetTokenUsed(token);
      return res.status(400).json({ error: 'This reset link has expired. Please request a new one.' });
    }

    // Hash new password and update
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    db.updateUserPassword(resetToken.user_id, passwordHash);

    // Mark token as used
    db.markPasswordResetTokenUsed(token);

    // Invalidate all existing sessions
    db.deleteUserRefreshTokens(resetToken.user_id);

    res.json({ ok: true });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
});

module.exports = router;
module.exports.requireAuth = requireAuth;
module.exports.optionalAuth = optionalAuth;
