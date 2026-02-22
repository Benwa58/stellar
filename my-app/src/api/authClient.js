// Authenticated fetch wrapper with automatic token refresh

let isRefreshing = false;
let refreshPromise = null;

async function authFetch(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (response.status === 401 && !path.includes('/api/auth/refresh') && !path.includes('/api/auth/login') && !path.includes('/api/auth/register') && !path.includes('/api/auth/logout')) {
    // Try refresh
    if (!isRefreshing) {
      isRefreshing = true;
      refreshPromise = fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'same-origin',
      }).finally(() => {
        isRefreshing = false;
      });
    }

    const refreshResponse = await refreshPromise;
    if (refreshResponse && refreshResponse.ok) {
      // Retry original request
      return fetch(path, {
        ...options,
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });
    }

    // Refresh failed — dispatch logout
    window.dispatchEvent(new CustomEvent('auth:expired'));
    throw new Error('Session expired');
  }

  return response;
}

// --- Auth API ---

export function register(email, password, displayName) {
  return authFetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, displayName }),
  });
}

export function login(email, password) {
  return authFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function logout() {
  return authFetch('/api/auth/logout', { method: 'POST' });
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

// --- Shared Playlists API ---

export function createSharedPlaylist(data) {
  return authFetch('/api/playlists', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// --- Password Reset API (no auth needed) ---

export function forgotPassword(email) {
  return fetch('/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

export function resetPassword(token, password) {
  return fetch('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password }),
  });
}

export function getSharedPlaylist(id) {
  return fetch(`/api/playlists/${id}`).then((res) => {
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
  return fetch(`/api/galaxy-shares/${id}`).then((res) => {
    if (!res.ok) throw new Error('Galaxy not found');
    return res.json();
  });
}

