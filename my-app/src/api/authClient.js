// Authenticated fetch wrapper with automatic token refresh
import { API_BASE, IS_CAPACITOR } from './config';

let isRefreshing = false;
let refreshPromise = null;

// --- Token storage for Capacitor (iOS WKWebView blocks third-party cookies) ---

function getStoredTokens() {
  if (!IS_CAPACITOR) return {};
  return {
    accessToken: localStorage.getItem('stellar_access_token'),
    refreshToken: localStorage.getItem('stellar_refresh_token'),
  };
}

function storeTokens(accessToken, refreshToken) {
  if (!IS_CAPACITOR) return;
  if (accessToken) localStorage.setItem('stellar_access_token', accessToken);
  if (refreshToken) localStorage.setItem('stellar_refresh_token', refreshToken);
}

function clearStoredTokens() {
  if (!IS_CAPACITOR) return;
  localStorage.removeItem('stellar_access_token');
  localStorage.removeItem('stellar_refresh_token');
}

// Save tokens from any auth response (login, register, refresh)
function handleAuthResponse(data) {
  if (IS_CAPACITOR && data.accessToken && data.refreshToken) {
    storeTokens(data.accessToken, data.refreshToken);
  }
}

// --- Core fetch wrapper ---

async function authFetch(path, options = {}) {
  const url = API_BASE + path;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // Capacitor: attach access token as Authorization header
  if (IS_CAPACITOR) {
    const { accessToken } = getStoredTokens();
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }
  }

  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers,
  });

  if (response.status === 401 && !path.includes('/api/auth/refresh') && !path.includes('/api/auth/login') && !path.includes('/api/auth/register') && !path.includes('/api/auth/logout')) {
    // Try refresh
    if (!isRefreshing) {
      isRefreshing = true;

      const refreshOpts = {
        method: 'POST',
        credentials: 'include',
      };

      // Capacitor: send refresh token in body
      if (IS_CAPACITOR) {
        const { refreshToken } = getStoredTokens();
        refreshOpts.headers = { 'Content-Type': 'application/json' };
        refreshOpts.body = JSON.stringify({ refreshToken });
      }

      refreshPromise = fetch(API_BASE + '/api/auth/refresh', refreshOpts)
        .then(async (res) => {
          if (res.ok) {
            const data = await res.json();
            handleAuthResponse(data);
            return { ok: true };
          }
          clearStoredTokens();
          return { ok: false };
        })
        .catch(() => {
          clearStoredTokens();
          return { ok: false };
        })
        .finally(() => {
          isRefreshing = false;
        });
    }

    const refreshResult = await refreshPromise;
    if (refreshResult && refreshResult.ok) {
      // Retry original request with new token
      const retryHeaders = {
        'Content-Type': 'application/json',
        ...options.headers,
      };
      if (IS_CAPACITOR) {
        const { accessToken } = getStoredTokens();
        if (accessToken) {
          retryHeaders['Authorization'] = `Bearer ${accessToken}`;
        }
      }
      return fetch(url, {
        ...options,
        credentials: 'include',
        headers: retryHeaders,
      });
    }

    // Refresh failed — dispatch logout
    window.dispatchEvent(new CustomEvent('auth:expired'));
    throw new Error('Session expired');
  }

  return response;
}

// --- Auth API ---

export async function register(email, password, displayName, username) {
  const res = await authFetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, displayName, username }),
  });
  // Clone so caller can also read .json()
  const clone = res.clone();
  try {
    const data = await clone.json();
    handleAuthResponse(data);
  } catch {}
  return res;
}

export function checkUsername(username) {
  return fetch(`${API_BASE}/api/auth/check-username?username=${encodeURIComponent(username)}`).then((r) => r.json());
}

export function setUsername(username) {
  return authFetch('/api/auth/set-username', {
    method: 'POST',
    body: JSON.stringify({ username }),
  });
}

export async function login(email, password) {
  const res = await authFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  const clone = res.clone();
  try {
    const data = await clone.json();
    handleAuthResponse(data);
  } catch {}
  return res;
}

export function logout() {
  const options = { method: 'POST' };
  // Capacitor: send refresh token in body so server can revoke it
  if (IS_CAPACITOR) {
    const { refreshToken } = getStoredTokens();
    options.body = JSON.stringify({ refreshToken });
  }
  clearStoredTokens();
  return authFetch('/api/auth/logout', options);
}

export function getMe() {
  return authFetch('/api/auth/me');
}

// --- Maps API ---

export function getMaps() {
  return authFetch('/api/maps');
}

export function getMap(id) {
  return authFetch(`/api/maps/${id}`);
}

export function saveMapCloud(data) {
  return authFetch('/api/maps', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function deleteMapCloud(id) {
  return authFetch(`/api/maps/${id}`, { method: 'DELETE' });
}

export function importMaps(maps) {
  return authFetch('/api/maps/import', {
    method: 'POST',
    body: JSON.stringify({ maps }),
  });
}

// --- Favorites API ---

export function getFavorites() {
  return authFetch('/api/favorites');
}

export function addFavorite(data) {
  return authFetch('/api/favorites', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function removeFavorite(artistName) {
  return authFetch(`/api/favorites/${encodeURIComponent(artistName)}`, {
    method: 'DELETE',
  });
}

// --- Dislikes API ---

export function getDislikes() {
  return authFetch('/api/dislikes');
}

export function addDislike(data) {
  return authFetch('/api/dislikes', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function removeDislike(artistName) {
  return authFetch(`/api/dislikes/${encodeURIComponent(artistName)}`, {
    method: 'DELETE',
  });
}

// --- Known Artists API ---

export function getKnownArtists() {
  return authFetch('/api/known-artists');
}

export function addKnownArtist(data) {
  return authFetch('/api/known-artists', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function removeKnownArtist(artistName) {
  return authFetch(`/api/known-artists/${encodeURIComponent(artistName)}`, {
    method: 'DELETE',
  });
}

// --- Discovered Artists API ---

export function getDiscoveredArtists() {
  return authFetch('/api/discovered-artists');
}

export function addDiscoveredArtist(data) {
  return authFetch('/api/discovered-artists', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function removeDiscoveredArtist(artistName) {
  return authFetch(`/api/discovered-artists/${encodeURIComponent(artistName)}`, {
    method: 'DELETE',
  });
}

// --- Universe API ---

export function getUniverse() {
  return authFetch('/api/universe');
}

export function triggerUniverseCompute() {
  return authFetch('/api/universe/compute', { method: 'POST' });
}

export function getUniverseStatus() {
  return authFetch('/api/universe/status');
}

// --- Shared Playlists API ---

export function createSharedPlaylist(data) {
  return authFetch('/api/playlists', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// --- Password Reset API (no auth needed) ---

export function forgotPassword(email) {
  return fetch(API_BASE + '/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

export function resetPassword(token, password) {
  return fetch(API_BASE + '/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password }),
  });
}

export function getSharedPlaylist(id) {
  return fetch(`${API_BASE}/api/playlists/${id}`).then((res) => {
    if (!res.ok) throw new Error('Playlist not found');
    return res.json();
  });
}

// --- Shared Galaxy Maps API ---

export function createGalaxyShare(data) {
  return authFetch('/api/galaxy-shares', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function getGalaxyShare(id) {
  return fetch(`${API_BASE}/api/galaxy-shares/${id}`).then((res) => {
    if (!res.ok) throw new Error('Galaxy not found');
    return res.json();
  });
}

// --- Shared Universe Maps API ---

export function createUniverseShare(data) {
  return authFetch('/api/universe-shares', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function getUniverseShare(id) {
  return fetch(`${API_BASE}/api/universe-shares/${id}`).then((res) => {
    if (!res.ok) throw new Error('Universe not found');
    return res.json();
  });
}
