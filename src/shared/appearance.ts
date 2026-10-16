/** Launcher look & feel, edited on the "Personalizacja" page. Stored in settings.appearance. */
export interface Appearance {
  /** Custom accent color (#rrggbb); null keeps the theme's own accent. */
  accent: string | null;
  background: 'aurora' | 'image' | 'solid';
  /** 0–100: strength of the animated aurora. */
  auroraIntensity: number;
  /** Custom background image: blur in px and darkening in %. */
  imageBlur: number;
  imageDim: number;
  motion: 'full' | 'reduced' | 'off';
  /** Cursor tilt + spotlight on cards. */
  cursorFx: boolean;
  /** 0–150: strength of the frosted-glass blur, in % of the default. */
  glass: number;
  /** UI zoom, 80–125 (%). */
  scale: number;
  radius: 'sharp' | 'normal' | 'round';
  compactSidebar: boolean;
}

export const DEFAULT_APPEARANCE: Appearance = {
  accent: null,
  background: 'aurora',
  auroraIntensity: 100,
  imageBlur: 6,
  imageDim: 45,
  motion: 'full',
  cursorFx: true,
  glass: 100,
  scale: 100,
  radius: 'normal',
  compactSidebar: false
};

export function resolveAppearance(stored?: Partial<Appearance>): Appearance {
  return { ...DEFAULT_APPEARANCE, ...stored };
}
