import { API_BASE } from './config';

// Re-use authFetch from authClient — import it via a shared helper
// Since authClient doesn't export authFetch, we duplicate the minimal wrapper here
// and rely on the same cookie/token flow.

let isRefreshing = false;
let refreshPromise = null;

const IS_CAPACITOR = typeof window !== 'undefined' && window.location?.protocol === 'capacitor:';

function getStoredTokens() {
  if (!IS_CAPACITOR) return {};
  return {
    accessToken: localStorage.getItem('stellar_access_token'),
    refreshToken: localStorage.getItem('stellar_refresh_token'),
  };
}

async function friendsFetch(path, options = {}) {
  const url = API_BASE + path;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (IS_CAPACITOR) {
    const { accessToken } = getStoredTokens();
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const response = await fetch(url, { ...options, credentials: 'include', headers });

  if (response.status === 401 && !path.includes('/api/auth/')) {
    if (!isRefreshing) {
      isRefreshing = true;
      const refreshOpts = { method: 'POST', credentials: 'include' };
      if (IS_CAPACITOR) {
        const { refreshToken } = getStoredTokens();
        refreshOpts.headers = { 'Content-Type': 'application/json' };
        refreshOpts.body = JSON.stringify({ refreshToken });
      }
      refreshPromise = fetch(API_BASE + '/api/auth/refresh', refreshOpts)
        .then(async (res) => {
          if (res.ok) {
            const data = await res.json();
            if (IS_CAPACITOR && data.accessToken && data.refreshToken) {
              localStorage.setItem('stellar_access_token', data.accessToken);
              localStorage.setItem('stellar_refresh_token', data.refreshToken);
            }
            return { ok: true };
          }
          return { ok: false };
        })
        .catch(() => ({ ok: false }))
        .finally(() => { isRefreshing = false; });
    }

    const result = await refreshPromise;
    if (result?.ok) {
      const retryHeaders = { 'Content-Type': 'application/json', ...options.headers };
      if (IS_CAPACITOR) {
        const { accessToken } = getStoredTokens();
        if (accessToken) retryHeaders['Authorization'] = `Bearer ${accessToken}`;
      }
      return fetch(url, { ...options, credentials: 'include', headers: retryHeaders });
    }
    window.dispatchEvent(new CustomEvent('auth:expired'));
    throw new Error('Session expired');
  }

  return response;
}

// --- Friends API ---

export function getFriends() {
  return friendsFetch('/api/friends');
}

export function getFriendRequests() {
  return friendsFetch('/api/friends/requests');
}

export function getSentRequests() {
  return friendsFetch('/api/friends/sent');
}

export function sendFriendRequest(username) {
  return friendsFetch('/api/friends/request', {
    method: 'POST',
    body: JSON.stringify({ username }),
  });
}

export function acceptFriendRequest(userId) {
  return friendsFetch('/api/friends/accept', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

export function rejectFriendRequest(userId) {
  return friendsFetch('/api/friends/reject', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

export function removeFriend(userId) {
  return friendsFetch(`/api/friends/${userId}`, { method: 'DELETE' });
}

export function searchUsers(query) {
  return friendsFetch(`/api/friends/search?q=${encodeURIComponent(query)}`);
}
