import { useState, useEffect } from 'react';

export function useCanvasSize(containerRef) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setSize({ width, height });
      }
    });

    observer.observe(container);

    const rect = container.getBoundingClientRect();
    setSize({ width: rect.width, height: rect.height });

    return () => observer.disconnect();
  }, [containerRef]);

  return size;
}
