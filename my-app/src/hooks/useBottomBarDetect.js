import { useEffect } from 'react';

/**
 * Detects whether the page is running in iOS Safari with a visible
 * bottom navigation bar and sets --browser-bar-offset on <html>.
 *
 * The 100vh-vs-innerHeight trick measures ALL browser chrome (top address
 * bar + bottom nav bar). On Android Chrome the address bar is at the TOP,
 * so the full diff would be incorrectly applied as a bottom offset. We
 * therefore restrict this detection to iOS Safari, which is the only
 * platform where the bottom bar actually overlaps content.
 *
 * Usage: call once in any top-level view component.
 *   useBottomBarDetect();
 *   Then in CSS:  bottom: calc(0px + var(--browser-bar-offset, 0px));
 */
export function useBottomBarDetect() {
  useEffect(() => {
    // Only apply on iOS (iPhone/iPad) — other platforms either don't have a
    // bottom bar or handle it via safe-area-inset-bottom.
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    if (!isIOS) {
      document.documentElement.style.setProperty('--browser-bar-offset', '0px');
      return;
    }

    function detect() {
      // Standalone / fullscreen PWA has no browser bars
      const isFullscreen =
        window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: fullscreen)').matches ||
        window.navigator.standalone === true;

      if (isFullscreen) {
        document.documentElement.style.setProperty('--browser-bar-offset', '0px');
        return;
      }

      // On iOS Safari, CSS 100vh is taller than the visible viewport when
      // the bottom navigation bar is present.
      const probe = document.createElement('div');
      probe.style.cssText = 'position:fixed;top:0;height:100vh;visibility:hidden;pointer-events:none';
      document.body.appendChild(probe);
      const cssVh = probe.offsetHeight;
      document.body.removeChild(probe);

      const diff = cssVh - window.innerHeight;
      document.documentElement.style.setProperty(
        '--browser-bar-offset',
        diff > 20 ? diff + 'px' : '0px'
      );
    }

    detect();

    // Re-detect on resize (orientation change, keyboard, browser chrome toggle)
    let timer;
    const handleChange = () => { clearTimeout(timer); timer = setTimeout(detect, 150); };
    window.addEventListener('resize', handleChange);
    const mq = window.matchMedia('(display-mode: standalone)');
    mq.addEventListener('change', handleChange);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleChange);
      mq.removeEventListener('change', handleChange);
      document.documentElement.style.removeProperty('--browser-bar-offset');
    };
  }, []);
}
