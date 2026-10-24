import { useStore } from './store';
import type { HomeLayout, HomeSectionId } from '../shared/types';

export const HOME_SECTIONS: Record<HomeSectionId, { label: string; description: string }> = {
  banner: { label: 'Nowa wersja Minecrafta', description: 'Pasek, gdy wyjdzie nowe wydanie gry' },
  sztulagz: { label: 'Serwer Sztulagz', description: 'Status serwera, gracze online i „Graj”' },
  recent: { label: 'Ostatnio grane', description: 'Instancje z szybkim startem świata' },
  servers: { label: 'Serwery', description: 'Status zapisanych serwerów z gry' },
  stats: { label: 'Statystyki', description: 'Czas gry i wykres ostatnich 7 dni' },
  skin: { label: 'Twoja postać', description: 'Podgląd skina i biblioteka skinów' },
  launcher: { label: 'Nowości w launcherze', description: 'Aktualizacje i lista zmian ZerdaLaunchera' },
  minecraft: { label: 'Nowości Minecrafta', description: 'Patch notes kolejnych wersji gry' }
};

export const DEFAULT_HOME: Required<HomeLayout> = {
  main: ['banner', 'sztulagz', 'recent', 'servers', 'stats'],
  side: ['skin', 'launcher', 'minecraft'],
  hidden: [],
  recentCount: 2
};

export const RECENT_COUNTS = [1, 2, 4, 6];

const KNOWN = Object.keys(HOME_SECTIONS) as HomeSectionId[];

/** Saved layout cleaned up: unknown ids dropped, sections added in later versions put in their default column. */
export function resolveHome(saved?: Partial<HomeLayout>): Required<HomeLayout> {
  const seen = new Set<HomeSectionId>();
  const clean = (list?: HomeSectionId[]) =>
    (list ?? []).filter((id) => KNOWN.includes(id) && !seen.has(id) && seen.add(id));
  const main = clean(saved?.main);
  const side = clean(saved?.side);
  for (const id of KNOWN) {
    if (seen.has(id)) continue;
    (DEFAULT_HOME.side.includes(id) ? side : main).push(id);
  }
  return {
    main,
    side,
    hidden: (saved?.hidden ?? []).filter((id) => KNOWN.includes(id)),
    recentCount: RECENT_COUNTS.includes(saved?.recentCount ?? 0) ? saved!.recentCount! : DEFAULT_HOME.recentCount
  };
}

let saveTimer: number | undefined;

/** Applies at once and saves shortly after (dragging fires many changes). */
export function saveHome(home: Required<HomeLayout>): void {
  const s = useStore.getState().settings;
  if (!s) return;
  useStore.setState({ settings: { ...s, home } });
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void window.api.settings.set({ home }), 300);
}
