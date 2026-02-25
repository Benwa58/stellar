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
};

function authReducer(state, action) {
  switch (action.type) {
    case 'SET_USER':
      return { ...state, user: action.user, isLoading: false };
    case 'CLEAR_USER':
      return { ...state, user: null, isLoading: false, favorites: [], dislikes: [], knownArtists: [], discoveredArtists: [], universeData: null, universeStatus: 'none' };
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
      if (data.status === 'ready') {
        clearInterval(universePollTimer);
        universePollTimer = null;
        const universeRes = await authApi.getUniverse();
        const universeData = await universeRes.json();
        if (universeData.universe) {
          dispatch({ type: 'SET_UNIVERSE_DATA', data: universeData.universe, status: 'ready' });
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

  const register = useCallback(async (email, password, displayName) => {
    const res = await authApi.register(email, password, displayName);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');
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
          dispatch({ type: 'SET_UNIVERSE_DATA', data: universeData.universe, status: 'ready' });
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

  return { login, register, logout, toggleFavorite, toggleDislike, toggleKnownArtist, toggleDiscoveredArtist, refreshUniverse, showAuthModal, hideAuthModal };
}
