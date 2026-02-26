import { useEffect } from 'react';

/**
 * Detects whether the page is running in a mobile browser with a visible
 * bottom navigation bar (vs standalone/fullscreen mode with no chrome).
 *
 * Sets the CSS custom property --browser-bar-offset on <html> so that
 * bottom-positioned elements (player bar, toolbars, etc.) can shift up
 * to avoid being hidden behind the browser's navigation bar.
 *
 * Usage: call once in any top-level view component.
 *   useBottomBarDetect();
 *   Then in CSS:  bottom: calc(0px + var(--browser-bar-offset, 0px));
 */
export function useBottomBarDetect() {
  useEffect(() => {
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

      // On mobile browsers, CSS 100vh may be taller than the actual visible
      // viewport when the browser's address/navigation bar is present.
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
