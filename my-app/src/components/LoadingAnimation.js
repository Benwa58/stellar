import { useRef, useEffect } from 'react';
import { useAppState } from '../state/AppContext';
import '../styles/loading.css';

function LoadingAnimation() {
  const { loadingProgress } = useAppState();
  const canvasRef = useRef(null);
  const particlesRef = useRef([]);
  const frameRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    function resize() {
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      ctx.scale(dpr, dpr);
    }

    resize();

    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    const cx = w / 2;
    const cy = h / 2;

    // Create particles
    const count = 200;
    particlesRef.current = Array.from({ length: count }, () => {
      const angle = Math.random() * Math.PI * 2;
      const dist = 50 + Math.random() * Math.max(w, h) * 0.6;
      return {
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        targetX: cx + (Math.random() - 0.5) * 100,
        targetY: cy + (Math.random() - 0.5) * 100,
        radius: 0.5 + Math.random() * 2,
        opacity: 0.3 + Math.random() * 0.7,
        speed: 0.002 + Math.random() * 0.008,
        progress: 0,
        angle: angle,
        orbitSpeed: (0.3 + Math.random() * 0.7) * (Math.random() > 0.5 ? 1 : -1),
        hue: 220 + Math.random() * 80,
      };
    });

    let time = 0;

    function animate() {
      time += 0.016;
      ctx.clearRect(0, 0, w, h);

      // Background
      const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.7);
      bgGrad.addColorStop(0, 'rgba(15, 15, 50, 1)');
      bgGrad.addColorStop(1, 'rgba(5, 5, 15, 1)');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      // Central glow
      const glowSize = 40 + Math.sin(time * 2) * 10;
      const cGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowSize);
      cGlow.addColorStop(0, 'rgba(99, 102, 241, 0.3)');
      cGlow.addColorStop(0.5, 'rgba(99, 102, 241, 0.1)');
      cGlow.addColorStop(1, 'rgba(99, 102, 241, 0)');
      ctx.fillStyle = cGlow;
      ctx.fillRect(cx - glowSize, cy - glowSize, glowSize * 2, glowSize * 2);

      // Draw and update particles
      for (const p of particlesRef.current) {
        p.progress = Math.min(1, p.progress + p.speed);
        const ease = 1 - Math.pow(1 - p.progress, 3);

        p.angle += p.orbitSpeed * 0.01 * (1 - ease);

        const startX = cx + Math.cos(p.angle) * (50 + Math.max(w, h) * 0.6 * (1 - ease));
        const startY = cy + Math.sin(p.angle) * (50 + Math.max(w, h) * 0.6 * (1 - ease));

        const currentX = startX + (p.targetX - startX) * ease;
        const currentY = startY + (p.targetY - startY) * ease;

        const twinkle = 0.5 + 0.5 * Math.sin(time * 3 + p.angle * 5);
        const alpha = p.opacity * (0.3 + ease * 0.7) * twinkle;

        ctx.beginPath();
        ctx.arc(currentX, currentY, p.radius * (0.5 + ease * 0.5), 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 70%, 75%, ${alpha})`;
        ctx.fill();

        if (p.radius > 1 && ease > 0.5) {
          const glow = ctx.createRadialGradient(
            currentX, currentY, 0,
            currentX, currentY, p.radius * 4
          );
          glow.addColorStop(0, `hsla(${p.hue}, 70%, 75%, ${alpha * 0.3})`);
          glow.addColorStop(1, `hsla(${p.hue}, 70%, 75%, 0)`);
          ctx.fillStyle = glow;
          ctx.fillRect(
            currentX - p.radius * 4,
            currentY - p.radius * 4,
            p.radius * 8,
            p.radius * 8
          );
        }
      }

      frameRef.current = requestAnimationFrame(animate);
    }

    animate();

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const progressPercent = loadingProgress.total > 0
    ? Math.round((loadingProgress.current / loadingProgress.total) * 100)
    : 0;

  return (
    <div className="loading-container">
      <canvas ref={canvasRef} className="loading-canvas" />
      <div className="loading-overlay">
        <h2 className="loading-title">Mapping Your Universe</h2>
        <p className="loading-message">{loadingProgress.message}</p>
        <div className="loading-progress-bar">
          <div
            className="loading-progress-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export default LoadingAnimation;
