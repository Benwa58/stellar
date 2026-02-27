/**
 * Historically measured the iOS Safari bottom-bar height and set
 * --browser-bar-offset on <html>.
 *
 * Now that the root containers use `100dvh`, the visible viewport is
 * handled by CSS directly.  This hook is kept as a no-op so existing
 * call-sites don't need to change.
 */
export function useBottomBarDetect() {
  // no-op — dvh units handle mobile viewport sizing
}
