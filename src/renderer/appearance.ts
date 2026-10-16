import type { CSSProperties } from 'react';
import type { Appearance } from '../shared/appearance';

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

const hsl = (h: number, s: number, l: number) =>
  `hsl(${Math.round(((h % 360) + 360) % 360)} ${Math.round(s * 100)}% ${Math.round(Math.min(1, Math.max(0, l)) * 100)}%)`;

/** The CSS variables a theme defines for its accent, derived from one color. */
function accentVars(hex: string): Record<string, string> | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [h, s, l] = rgbToHsl(rgb);
  const t = rgb.join(', ');
  const second = hsl(h + 35, s, l + 0.06);
  return {
    '--accent': hsl(h, Math.min(1, s + 0.05), Math.max(l, 0.74)),
    '--accent-strong': hex,
    '--accent-strong-rgb': t,
    '--grad': `linear-gradient(135deg, ${hsl(h - 12, s, l + 0.04)} 0%, ${hex} 50%, ${second} 100%)`,
    '--grad-soft': `linear-gradient(135deg, rgba(${t}, 0.88), ${second})`,
    '--grad-play': `linear-gradient(135deg, ${hsl(h, s, l - 0.08)}, ${hex})`,
    '--glow': `0 0 0 1px rgba(${t}, 0.35), 0 12px 40px -8px rgba(${t}, 0.55)`
  };
}

const ACCENT_KEYS = Object.keys(accentVars('#808080')!);

/** Inline backgrounds that tint the aurora blobs with a custom accent. */
export function auroraBlobStyles(accent: string | null): { a?: CSSProperties; c?: CSSProperties } {
  const rgb = accent ? hexToRgb(accent) : null;
  if (!rgb) return {};
  const [h, s, l] = rgbToHsl(rgb);
  return { a: { background: accent! }, c: { background: hsl(h + 35, s, l) } };
}

const RADIUS: Record<Appearance['radius'], [number, number, number]> = {
  sharp: [6, 4, 8],
  normal: [14, 10, 20],
  round: [22, 15, 30]
};

/** Push the appearance onto <html> (data attributes + CSS variables) and the window zoom. */
export function applyAppearance(ap: Appearance): void {
  const root = document.documentElement;
  const vars = ap.accent ? accentVars(ap.accent) : null;
  for (const k of ACCENT_KEYS) {
    if (vars) root.style.setProperty(k, vars[k]);
    else root.style.removeProperty(k);
  }

  root.dataset.bg = ap.background;
  root.style.setProperty('--aurora-strength', String(ap.auroraIntensity / 100));
  root.style.setProperty('--bg-image-blur', `${ap.imageBlur}px`);
  root.style.setProperty('--bg-image-dim', String(ap.imageDim / 100));

  root.dataset.motion = ap.motion;
  root.dataset.cursorfx = ap.cursorFx ? 'on' : 'off';
  root.style.setProperty('--glass-scale', String(ap.glass / 100));

  const [r, rs, rl] = RADIUS[ap.radius];
  root.style.setProperty('--radius', `${r}px`);
  root.style.setProperty('--radius-sm', `${rs}px`);
  root.style.setProperty('--radius-lg', `${rl}px`);

  root.dataset.sidebar = ap.compactSidebar ? 'compact' : 'full';
  window.api.appearance.setZoom(ap.scale / 100);
}
