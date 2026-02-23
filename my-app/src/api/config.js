// API base URL — empty string for web (relative paths), full URL for Capacitor iOS builds
// Set REACT_APP_API_URL at build time: REACT_APP_API_URL=https://www.stellarmusic.xyz npm run build
export const API_BASE = process.env.REACT_APP_API_URL || '';

// Capacitor iOS detection — true when running inside the native iOS app
// When API_BASE is set, we're in Capacitor and need token-based auth (cookies blocked by ITP)
export const IS_CAPACITOR = !!process.env.REACT_APP_API_URL;
