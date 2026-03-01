import { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import * as authApi from '../api/authClient';

const AuthContext = createContext(null);
const AuthDispatchContext = createContext(null);

const initialState = {
  user: null,
  isLoading: true,
  favorites: [],
  dislikes: [],
  knownArtists: [],
  discoveredArtists: [],
  showAuthModal: false,
  authModalTab: 'login', // 'login' or 'register'
  universeData: null,
  universeStatus: 'none', // 'none', 'computing', 'ready', 'error', 'stale'
  friends: [],
  friendRequests: [],
};

function authReducer(state, action) {
  switch (action.type) {
    case 'SET_USER':
      return { ...state, user: action.user, isLoading: false };
    case 'CLEAR_USER':
      return { ...state, user: null, isLoading: false, favorites: [], dislikes: [], knownArtists: [], discoveredArtists: [], universeData: null, universeStatus: 'none', friends: [], friendRequests: [] };
    case 'SET_AUTH_LOADING':
      return { ...state, isLoading: action.isLoading };
    case 'SET_FAVORITES':
      return { ...state, favorites: action.favorites };
    case 'ADD_FAVORITE':
      return {
        ...state,
        favorites: [action.favorite, ...state.favorites],
      };
    case 'REMOVE_FAVORITE':
      return {
        ...state,
        favorites: state.favorites.filter(
          (f) => f.artistName !== action.artistName
        ),
      };
    case 'SET_DISLIKES':
      return { ...state, dislikes: action.dislikes };
    case 'ADD_DISLIKE':
      return {
        ...state,
        dislikes: [action.dislike, ...state.dislikes],
      };
    case 'REMOVE_DISLIKE':
      return {
        ...state,
        dislikes: state.dislikes.filter(
          (d) => d.artistName !== action.artistName
        ),
      };
    case 'SET_KNOWN_ARTISTS':
      return { ...state, knownArtists: action.knownArtists };
    case 'ADD_KNOWN_ARTIST':
      return {
        ...state,
        knownArtists: [action.knownArtist, ...state.knownArtists],
      };
    case 'REMOVE_KNOWN_ARTIST':
      return {
        ...state,
        knownArtists: state.knownArtists.filter(
          (k) => k.artistName !== action.artistName
        ),
      };
    case 'SET_DISCOVERED_ARTISTS':
      return { ...state, discoveredArtists: action.discoveredArtists };
    case 'ADD_DISCOVERED_ARTIST':
      return {
        ...state,
        discoveredArtists: [action.discoveredArtist, ...state.discoveredArtists],
      };
    case 'REMOVE_DISCOVERED_ARTIST':
      return {
        ...state,
        discoveredArtists: state.discoveredArtists.filter(
          (d) => d.artistName !== action.artistName
        ),
      };
    case 'SET_UNIVERSE_DATA':
      return { ...state, universeData: action.data, universeStatus: action.status || 'ready' };
    case 'SET_UNIVERSE_STATUS':
      return { ...state, universeStatus: action.status };
    case 'SHOW_AUTH_MODAL':
      return { ...state, showAuthModal: true, authModalTab: action.tab || 'login' };
    case 'HIDE_AUTH_MODAL':
      return { ...state, showAuthModal: false };
    case 'SET_FRIENDS':
      return { ...state, friends: action.friends };
    case 'SET_FRIEND_REQUESTS':
      return { ...state, friendRequests: action.requests };
    case 'ADD_FRIEND':
      return { ...state, friends: [action.friend, ...state.friends], friendRequests: state.friendRequests.filter((r) => r.id !== action.friend.id) };
    case 'REMOVE_FRIEND':
      return { ...state, friends: state.friends.filter((f) => f.id !== action.userId) };
    case 'REMOVE_FRIEND_REQUEST':
      return { ...state, friendRequests: state.friendRequests.filter((r) => r.id !== action.userId) };
    case 'UPDATE_USER':
      return { ...state, user: { ...state.user, ...action.fields } };
    default:
      return state;
  }
}

export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Check for existing session on mount
  useEffect(() => {
    authApi
      .getMe()
      .then((res) => res.json())
      .then((data) => {
        if (data.user) {
          dispatch({ type: 'SET_USER', user: data.user });
        } else {
          dispatch({ type: 'SET_AUTH_LOADING', isLoading: false });
        }
      })
      .catch(() => {
        dispatch({ type: 'SET_AUTH_LOADING', isLoading: false });
      });
  }, []);

  // Fetch favorites and dislikes when user logs in
  useEffect(() => {
    if (state.user) {
      authApi
        .getFavorites()
        .then((res) => res.json())
        .then((data) => {
          if (data.favorites) {
            dispatch({ type: 'SET_FAVORITES', favorites: data.favorites });
          }
        })
        .catch(() => {});

      authApi
        .getDislikes()
        .then((res) => res.json())
        .then((data) => {
          if (data.dislikes) {
            dispatch({ type: 'SET_DISLIKES', dislikes: data.dislikes });
          }
        })
        .catch(() => {});

      authApi
        .getKnownArtists()
        .then((res) => res.json())
        .then((data) => {
          if (data.knownArtists) {
            dispatch({ type: 'SET_KNOWN_ARTISTS', knownArtists: data.knownArtists });
          }
        })
        .catch(() => {});

      authApi
        .getDiscoveredArtists()
        .then((res) => res.json())
        .then((data) => {
          if (data.discoveredArtists) {
            dispatch({ type: 'SET_DISCOVERED_ARTISTS', discoveredArtists: data.discoveredArtists });
          }
        })
        .catch(() => {});

      authApi
        .getUniverse()
        .then((res) => res.json())
        .then((data) => {
          if (data.universe) {
            dispatch({ type: 'SET_UNIVERSE_DATA', data: data.universe, status: data.isStale ? 'stale' : 'ready' });
          } else {
            dispatch({ type: 'SET_UNIVERSE_STATUS', status: data.status || 'none' });
          }
        })
        .catch(() => {});

      authApi
        .getFriends()
        .then((res) => res.json())
        .then((data) => {
          if (data.friends) dispatch({ type: 'SET_FRIENDS', friends: data.friends });
        })
        .catch(() => {});

      authApi
        .getFriendRequests()
        .then((res) => res.json())
        .then((data) => {
          if (data.requests) dispatch({ type: 'SET_FRIEND_REQUESTS', requests: data.requests });
        })
        .catch(() => {});
    }
  }, [state.user]);

  // Listen for auth:expired events from authClient
  useEffect(() => {
    function handleExpired() {
      dispatch({ type: 'CLEAR_USER' });
    }
    window.addEventListener('auth:expired', handleExpired);
    return () => window.removeEventListener('auth:expired', handleExpired);
  }, []);

  return (
    <AuthContext.Provider value={state}>
      <AuthDispatchContext.Provider value={dispatch}>
        {children}
      </AuthDispatchContext.Provider>
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function useAuthDispatch() {
  const context = useContext(AuthDispatchContext);
  if (context === null) {
    throw new Error('useAuthDispatch must be used within an AuthProvider');
  }
  return context;
}

// --- Universe polling helper ---

let universePollTimer = null;

function pollUniverseStatus(dispatch) {
  if (universePollTimer) clearInterval(universePollTimer);
  let attempts = 0;
  universePollTimer = setInterval(async () => {
    attempts++;
    if (attempts > 60) {
      clearInterval(universePollTimer);
      universePollTimer = null;
      dispatch({ type: 'SET_UNIVERSE_STATUS', status: 'error' });
      return;
    }
    try {
      const res = await authApi.getUniverseStatus();
      const data = await res.json();
      if (data.status === 'ready' && !data.isComputing) {
        clearInterval(universePollTimer);
        universePollTimer = null;
        const universeRes = await authApi.getUniverse();
        const universeData = await universeRes.json();
        if (universeData.universe) {
          dispatch({ type: 'SET_UNIVERSE_DATA', data: universeData.universe, status: universeData.isStale ? 'stale' : 'ready' });
        }
      } else if (data.status === 'error') {
        clearInterval(universePollTimer);
        universePollTimer = null;
        dispatch({ type: 'SET_UNIVERSE_STATUS', status: 'error' });
      }
    } catch {
      // continue polling
    }
  }, 5000);
}

// --- Action helpers ---

export function useAuthActions() {
  const dispatch = useAuthDispatch();
  const auth = useAuth();

  const login = useCallback(async (email, password) => {
    const res = await authApi.login(email, password);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    dispatch({ type: 'SET_USER', user: data.user });
    return data.user;
  }, [dispatch]);

  const register = useCallback(async (email, password, displayName, username) => {
    const res = await authApi.register(email, password, displayName, username);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');
    dispatch({ type: 'SET_USER', user: data.user });
    return data.user;
  }, [dispatch]);

  const setUsername = useCallback(async (username) => {
    let res;
    try {
      res = await authApi.setUsername(username);
    } catch (err) {
      throw new Error('Could not reach the server: ' + (err.message || 'unknown error'));
    }
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Server error (${res.status}): ${text.slice(0, 200)}`);
    }
    if (!res.ok) throw new Error(data.error || 'Failed to set username');
    dispatch({ type: 'SET_USER', user: data.user });
    return data.user;
  }, [dispatch]);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Clear user state even if server request fails
    }
    dispatch({ type: 'CLEAR_USER' });
  }, [dispatch]);

  const toggleFavorite = useCallback(async (artistName, artistId, artistImage) => {
    const isFav = auth.favorites.some((f) => f.artistName === artistName);

    if (isFav) {
      // Optimistic remove
      dispatch({ type: 'REMOVE_FAVORITE', artistName });
      try {
        await authApi.removeFavorite(artistName);
        dispatch({ type: 'SET_UNIVERSE_STATUS', status: 'stale' });
      } catch {
        // Revert
        dispatch({
          type: 'ADD_FAVORITE',
          favorite: { artistName, artistId, artistImage, addedAt: new Date().toISOString() },
        });
      }
    } else {
      // Optimistic add — also remove dislike (mutual exclusion)
      const isDisliked = auth.dislikes.some((d) => d.artistName === artistName);
      if (isDisliked) {
        dispatch({ type: 'REMOVE_DISLIKE', artistName });
        authApi.removeDislike(artistName).catch(() => {});
      }

      // Favoriting auto-marks as known (favorite implies known)
      const isKnown = auth.knownArtists.some((k) => k.artistName === artistName);
      if (!isKnown) {
        const knownArtist = { artistName, artistId, artistImage, addedAt: new Date().toISOString() };
        dispatch({ type: 'ADD_KNOWN_ARTIST', knownArtist });
        authApi.addKnownArtist({ artistName, artistId, artistImage }).catch(() => {});
      }

      // Remove from discovered (favorite implies known, not discovered)
      const isDiscovered = auth.discoveredArtists.some((d) => d.artistName === artistName);
      if (isDiscovered) {
        dispatch({ type: 'REMOVE_DISCOVERED_ARTIST', artistName });
        authApi.removeDiscoveredArtist(artistName).catch(() => {});
      }

      const favorite = { artistName, artistId, artistImage, addedAt: new Date().toISOString() };
      dispatch({ type: 'ADD_FAVORITE', favorite });
      try {
        await authApi.addFavorite({ artistName, artistId, artistImage });
        dispatch({ type: 'SET_UNIVERSE_STATUS', status: 'stale' });
      } catch {
        // Revert
        dispatch({ type: 'REMOVE_FAVORITE', artistName });
      }
    }
  }, [dispatch, auth.favorites, auth.dislikes, auth.knownArtists, auth.discoveredArtists]);

  const toggleDislike = useCallback(async (artistName, artistId, artistImage) => {
    const isDisliked = auth.dislikes.some((d) => d.artistName === artistName);

    if (isDisliked) {
      // Optimistic remove
      dispatch({ type: 'REMOVE_DISLIKE', artistName });
      try {
        await authApi.removeDislike(artistName);
      } catch {
        // Revert
        dispatch({
          type: 'ADD_DISLIKE',
          dislike: { artistName, artistId, artistImage, addedAt: new Date().toISOString() },
        });
      }
    } else {
      // Optimistic add — also remove favorite (mutual exclusion)
      const isFav = auth.favorites.some((f) => f.artistName === artistName);
      if (isFav) {
        dispatch({ type: 'REMOVE_FAVORITE', artistName });
        authApi.removeFavorite(artistName).catch(() => {});
      }

      // Disliking auto-marks as known (dislike implies known)
      const isKnown = auth.knownArtists.some((k) => k.artistName === artistName);
      if (!isKnown) {
        const knownArtist = { artistName, artistId, artistImage, addedAt: new Date().toISOString() };
        dispatch({ type: 'ADD_KNOWN_ARTIST', knownArtist });
        authApi.addKnownArtist({ artistName, artistId, artistImage }).catch(() => {});
      }

      // Remove from discovered (dislike implies known, not discovered)
      const isDiscovered = auth.discoveredArtists.some((d) => d.artistName === artistName);
      if (isDiscovered) {
        dispatch({ type: 'REMOVE_DISCOVERED_ARTIST', artistName });
        authApi.removeDiscoveredArtist(artistName).catch(() => {});
      }

      const dislike = { artistName, artistId, artistImage, addedAt: new Date().toISOString() };
      dispatch({ type: 'ADD_DISLIKE', dislike });
      try {
        await authApi.addDislike({ artistName, artistId, artistImage });
      } catch {
        // Revert
        dispatch({ type: 'REMOVE_DISLIKE', artistName });
      }
    }
  }, [dispatch, auth.dislikes, auth.favorites, auth.knownArtists, auth.discoveredArtists]);

  const toggleKnownArtist = useCallback(async (artistName, artistId, artistImage) => {
    const isKnown = auth.knownArtists.some((k) => k.artistName === artistName);

    if (isKnown) {
      // Optimistic remove
      dispatch({ type: 'REMOVE_KNOWN_ARTIST', artistName });
      try {
        await authApi.removeKnownArtist(artistName);
      } catch {
        // Revert
        dispatch({
          type: 'ADD_KNOWN_ARTIST',
          knownArtist: { artistName, artistId, artistImage, addedAt: new Date().toISOString() },
        });
      }
    } else {
      // Marking as known auto-removes from discovered (can't discover what you already knew)
      const isDiscovered = auth.discoveredArtists.some((d) => d.artistName === artistName);
      if (isDiscovered) {
        dispatch({ type: 'REMOVE_DISCOVERED_ARTIST', artistName });
        authApi.removeDiscoveredArtist(artistName).catch(() => {});
      }

      const knownArtist = { artistName, artistId, artistImage, addedAt: new Date().toISOString() };
      dispatch({ type: 'ADD_KNOWN_ARTIST', knownArtist });
      try {
        await authApi.addKnownArtist({ artistName, artistId, artistImage });
      } catch {
        // Revert
        dispatch({ type: 'REMOVE_KNOWN_ARTIST', artistName });
      }
    }
  }, [dispatch, auth.knownArtists, auth.discoveredArtists]);

  const toggleDiscoveredArtist = useCallback(async (artistName, artistId, artistImage) => {
    const isDiscovered = auth.discoveredArtists.some((d) => d.artistName === artistName);

    if (isDiscovered) {
      // Optimistic remove
      dispatch({ type: 'REMOVE_DISCOVERED_ARTIST', artistName });
      try {
        await authApi.removeDiscoveredArtist(artistName);
        dispatch({ type: 'SET_UNIVERSE_STATUS', status: 'stale' });
      } catch {
        // Revert
        dispatch({
          type: 'ADD_DISCOVERED_ARTIST',
          discoveredArtist: { artistName, artistId, artistImage, addedAt: new Date().toISOString() },
        });
      }
    } else {
      // Marking as discovered auto-removes from known (discovered means it was new to you)
      const isKnown = auth.knownArtists.some((k) => k.artistName === artistName);
      if (isKnown) {
        dispatch({ type: 'REMOVE_KNOWN_ARTIST', artistName });
        authApi.removeKnownArtist(artistName).catch(() => {});
      }

      const discoveredArtist = { artistName, artistId, artistImage, addedAt: new Date().toISOString() };
      dispatch({ type: 'ADD_DISCOVERED_ARTIST', discoveredArtist });
      try {
        await authApi.addDiscoveredArtist({ artistName, artistId, artistImage });
        dispatch({ type: 'SET_UNIVERSE_STATUS', status: 'stale' });
      } catch {
        // Revert
        dispatch({ type: 'REMOVE_DISCOVERED_ARTIST', artistName });
      }
    }
  }, [dispatch, auth.discoveredArtists, auth.knownArtists]);

  const refreshUniverse = useCallback(async () => {
    dispatch({ type: 'SET_UNIVERSE_STATUS', status: 'computing' });
    try {
      const res = await authApi.triggerUniverseCompute();
      const data = await res.json();
      if (data.status === 'ready') {
        // Already up to date, re-fetch the full data
        const universeRes = await authApi.getUniverse();
        const universeData = await universeRes.json();
        if (universeData.universe) {
          dispatch({ type: 'SET_UNIVERSE_DATA', data: universeData.universe, status: universeData.isStale ? 'stale' : 'ready' });
        }
      } else if (data.status === 'computing') {
        pollUniverseStatus(dispatch);
      }
    } catch {
      dispatch({ type: 'SET_UNIVERSE_STATUS', status: 'error' });
    }
  }, [dispatch]);

  const showAuthModal = useCallback((tab = 'login') => {
    dispatch({ type: 'SHOW_AUTH_MODAL', tab });
  }, [dispatch]);

  const hideAuthModal = useCallback(() => {
    dispatch({ type: 'HIDE_AUTH_MODAL' });
  }, [dispatch]);

  const sendFriendRequest = useCallback(async (username) => {
    const res = await authApi.sendFriendRequest(username);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to send request');
    // If auto-accepted (they had already sent us a request), refresh friends
    if (data.status === 'accepted') {
      authApi.getFriends().then((r) => r.json()).then((d) => {
        if (d.friends) dispatch({ type: 'SET_FRIENDS', friends: d.friends });
      }).catch(() => {});
      dispatch({ type: 'REMOVE_FRIEND_REQUEST', userId: data.userId });
    }
    return data;
  }, [dispatch]);

  const acceptFriend = useCallback(async (userId) => {
    const res = await authApi.acceptFriendRequest(userId);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to accept');
    // Move from requests to friends — find the request data
    const req = auth.friendRequests.find((r) => r.id === userId);
    if (req) {
      dispatch({ type: 'ADD_FRIEND', friend: { ...req, acceptedAt: new Date().toISOString() } });
    } else {
      // Refresh friends list from server
      authApi.getFriends().then((r) => r.json()).then((d) => {
        if (d.friends) dispatch({ type: 'SET_FRIENDS', friends: d.friends });
      }).catch(() => {});
      dispatch({ type: 'REMOVE_FRIEND_REQUEST', userId });
    }
  }, [dispatch, auth.friendRequests]);

  const rejectFriend = useCallback(async (userId) => {
    dispatch({ type: 'REMOVE_FRIEND_REQUEST', userId });
    const res = await authApi.rejectFriendRequest(userId);
    if (!res.ok) {
      // Revert — re-fetch requests
      authApi.getFriendRequests().then((r) => r.json()).then((d) => {
        if (d.requests) dispatch({ type: 'SET_FRIEND_REQUESTS', requests: d.requests });
      }).catch(() => {});
    }
  }, [dispatch]);

  const removeFriend = useCallback(async (userId) => {
    dispatch({ type: 'REMOVE_FRIEND', userId });
    const res = await authApi.removeFriend(userId);
    if (!res.ok) {
      // Revert — re-fetch friends
      authApi.getFriends().then((r) => r.json()).then((d) => {
        if (d.friends) dispatch({ type: 'SET_FRIENDS', friends: d.friends });
      }).catch(() => {});
    }
  }, [dispatch]);

  const refreshFriends = useCallback(async () => {
    try {
      const [friendsRes, requestsRes] = await Promise.all([
        authApi.getFriends(),
        authApi.getFriendRequests(),
      ]);
      const friendsData = await friendsRes.json();
      const requestsData = await requestsRes.json();
      if (friendsData.friends) dispatch({ type: 'SET_FRIENDS', friends: friendsData.friends });
      if (requestsData.requests) dispatch({ type: 'SET_FRIEND_REQUESTS', requests: requestsData.requests });
    } catch {}
  }, [dispatch]);

  const updateProfile = useCallback(async ({ displayName, email }) => {
    const res = await authApi.updateProfile({ displayName, email });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update profile');
    dispatch({ type: 'UPDATE_USER', fields: data.user });
    return data.user;
  }, [dispatch]);

  const uploadAvatar = useCallback(async (base64Data) => {
    const res = await authApi.uploadAvatar(base64Data);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to upload avatar');
    dispatch({ type: 'UPDATE_USER', fields: data.user });
    return data.user;
  }, [dispatch]);

  const deleteAvatar = useCallback(async () => {
    const res = await authApi.deleteAvatar();
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to remove avatar');
    dispatch({ type: 'UPDATE_USER', fields: data.user });
    return data.user;
  }, [dispatch]);

  return { login, register, logout, setUsername, toggleFavorite, toggleDislike, toggleKnownArtist, toggleDiscoveredArtist, refreshUniverse, showAuthModal, hideAuthModal, sendFriendRequest, acceptFriend, rejectFriend, removeFriend, refreshFriends, updateProfile, uploadAvatar, deleteAvatar };
}
