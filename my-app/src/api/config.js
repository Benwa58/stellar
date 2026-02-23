// API base URL — empty string for web (relative paths), full URL for Capacitor iOS builds
// Set REACT_APP_API_URL at build time: REACT_APP_API_URL=https://stellar.onrender.com npm run build
export const API_BASE = process.env.REACT_APP_API_URL || '';
