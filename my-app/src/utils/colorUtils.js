import { GENRE_COLORS } from './constants';

export function hslToRgba(h, s, l, a = 1) {
  return `hsla(${h}, ${s}%, ${l}%, ${a})`;
}

export function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x) => Math.round(255 * x).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

export function getGenreColor(genres) {
  if (!genres || genres.length === 0) return GENRE_COLORS.default;

  for (const genre of genres) {
    const lower = genre.toLowerCase();
    for (const [key, color] of Object.entries(GENRE_COLORS)) {
      if (key === 'default') continue;
      if (lower.includes(key)) return color;
    }
  }
  return GENRE_COLORS.default;
}

export function getGenreColorString(genres, alpha = 1) {
  const { h, s, l } = getGenreColor(genres);
  return hslToRgba(h, s, l, alpha);
}

export function blendColors(colorA, colorB, ratio) {
  return {
    h: colorA.h + (colorB.h - colorA.h) * ratio,
    s: colorA.s + (colorB.s - colorA.s) * ratio,
    l: colorA.l + (colorB.l - colorA.l) * ratio,
  };
}

export function getGenreCategory(genres) {
  if (!genres || genres.length === 0) return 'default';
  for (const genre of genres) {
    const lower = genre.toLowerCase();
    for (const key of Object.keys(GENRE_COLORS)) {
      if (key === 'default') continue;
      if (lower.includes(key)) return key;
    }
  }
  return 'default';
}
