import { PARTICLE_CONFIG } from '../utils/constants';

export function createParticleSystem(width, height) {
  const { count, minRadius, maxRadius, minOpacity, maxOpacity, twinkleSpeed } =
    PARTICLE_CONFIG;

  const particles = Array.from({ length: count }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    radius: minRadius + Math.random() * (maxRadius - minRadius),
    baseOpacity: minOpacity + Math.random() * (maxOpacity - minOpacity),
    opacity: 0,
    twinklePhase: Math.random() * Math.PI * 2,
    twinkleSpeed: twinkleSpeed * (0.5 + Math.random()),
  }));

  return particles;
}

export function updateParticles(particles) {
  for (const p of particles) {
    p.twinklePhase += p.twinkleSpeed;
    p.opacity = p.baseOpacity * (0.5 + 0.5 * Math.sin(p.twinklePhase));
  }
}

export function drawParticles(ctx, particles) {
  for (const p of particles) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(200, 210, 240, ${p.opacity})`;
    ctx.fill();
  }
}
