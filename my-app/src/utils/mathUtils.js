export function distance(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function screenToGraph(screenX, screenY, transform) {
  return {
    x: (screenX - transform.x) / transform.scale,
    y: (screenY - transform.y) / transform.scale,
  };
}

export function graphToScreen(graphX, graphY, transform) {
  return {
    x: graphX * transform.scale + transform.x,
    y: graphY * transform.scale + transform.y,
  };
}

export function normalize(value, min, max) {
  if (max === min) return 0.5;
  return clamp((value - min) / (max - min), 0, 1);
}

export function jaccardSimilarity(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 0;
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
