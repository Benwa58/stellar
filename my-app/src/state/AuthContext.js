import { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import * as authApi from '../api/authClient';

const AuthContext = createContext(null);
const AuthDispatchContext = createContext(null);

const initialState = {
  user: null,
  isLoading: true,
  favorites: [],
  dislikes: [],
  showAuthModal: false,
  authModalTab: 'login', // 'login' or 'register'
};

function authReducer(state, action) {
  switch (action.type) {
    case 'SET_USER':
      return { ...state, user: action.user, isLoading: false };
    case 'CLEAR_USER':
      return { ...state, user: null, isLoading: false, favorites: [], dislikes: [] };
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

      const favorite = { artistName, artistId, artistImage, addedAt: new Date().toISOString() };
      dispatch({ type: 'ADD_FAVORITE', favorite });
      try {
        await authApi.addFavorite({ artistName, artistId, artistImage });
      } catch {
        // Revert
        dispatch({ type: 'REMOVE_FAVORITE', artistName });
      }
    }
  }, [dispatch, auth.favorites, auth.dislikes]);

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

      const dislike = { artistName, artistId, artistImage, addedAt: new Date().toISOString() };
      dispatch({ type: 'ADD_DISLIKE', dislike });
      try {
        await authApi.addDislike({ artistName, artistId, artistImage });
      } catch {
        // Revert
        dispatch({ type: 'REMOVE_DISLIKE', artistName });
      }
    }
  }, [dispatch, auth.dislikes, auth.favorites]);

  const showAuthModal = useCallback((tab = 'login') => {
    dispatch({ type: 'SHOW_AUTH_MODAL', tab });
  }, [dispatch]);

  const hideAuthModal = useCallback(() => {
    dispatch({ type: 'HIDE_AUTH_MODAL' });
  }, [dispatch]);

  return { login, register, logout, toggleFavorite, toggleDislike, showAuthModal, hideAuthModal };
}
