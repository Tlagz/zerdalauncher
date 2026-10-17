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
  /** Minecraft-style UI sounds (clicks, launch, success, errors). */
  sounds: boolean;
  /** 0–100 (%). */
  soundVolume: number;
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
  compactSidebar: false,
  sounds: true,
  soundVolume: 50
};

export function resolveAppearance(stored?: Partial<Appearance>): Appearance {
  return { ...DEFAULT_APPEARANCE, ...stored };
}

/** The parts of the look a theme preset carries; zoom, sidebar and motion stay personal. */
export const PRESET_KEYS = ['accent', 'background', 'auroraIntensity', 'imageBlur', 'imageDim', 'glass', 'radius'] as const;
export type PresetLook = Pick<Appearance, (typeof PRESET_KEYS)[number]>;

/** A saved look: base theme plus the preset part of the appearance. */
export interface ThemePreset {
  id: string;
  name: string;
  theme: string;
  look: PresetLook;
}

/** Shareable file format (.zerdatheme). */
export interface ThemePresetFile {
  type: 'zerda-theme';
  version: 1;
  name: string;
  theme: string;
  look: Partial<PresetLook>;
  /** Background image as a data URL, when the look uses one. */
  backgroundImage?: string;
}

export function pickLook(a: Appearance): PresetLook {
  return Object.fromEntries(PRESET_KEYS.map((k) => [k, a[k]])) as PresetLook;
}

const look = (p: Partial<PresetLook>): PresetLook => ({ ...pickLook(DEFAULT_APPEARANCE), ...p });

export const BUILTIN_PRESETS: ThemePreset[] = [
  { id: 'builtin-neon', name: 'Neon', theme: 'default', look: look({ accent: '#ec4899', glass: 120, radius: 'round' }) },
  { id: 'builtin-ocean', name: 'Ocean', theme: 'dark', look: look({ accent: '#06b6d4', auroraIntensity: 80 }) },
  { id: 'builtin-forest', name: 'Las', theme: 'dark', look: look({ accent: '#10b981', auroraIntensity: 60 }) },
  { id: 'builtin-sunset', name: 'Zachód', theme: 'crimson', look: look({ accent: '#f97316', auroraIntensity: 90 }) },
  {
    id: 'builtin-minimal',
    name: 'Minimal',
    theme: 'dark',
    look: look({ accent: '#94a3b8', background: 'solid', glass: 40, radius: 'sharp' })
  }
];
