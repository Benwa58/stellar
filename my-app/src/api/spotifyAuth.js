// Auth is now handled by the proxy server.
// The proxy manages token acquisition and refresh server-side.
// This module is kept for API compatibility but is effectively a no-op.

export async function getAccessToken() {
  return '__PROXY__';
}

export function clearTokenCache() {
  // no-op — proxy manages its own token cache
}
