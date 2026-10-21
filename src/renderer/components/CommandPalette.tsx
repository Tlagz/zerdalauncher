import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Search,
  House,
  Gamepad2,
  Server,
  Users,
  Brush,
  Settings,
  Play,
  FolderOpen,
  Earth,
  Plus,
  Import,
  Boxes,
  Palette,
  CornerDownLeft,
  UserPlus,
  Images,
  type LucideIcon
} from 'lucide-react';
import { useStore, type InstancesAction } from '../store';
import { transition } from '../ui/viewTransition';
import { alertDialog } from '../ui/feedback';
import { InstanceIcon } from './InstanceIcon';
import { checkClipboardInvite } from '../invites';
import { showToast } from '../ui/feedback';
import { t } from '../i18n';
import type { Instance, WorldInfo } from '../../shared/types';

type Page = ReturnType<typeof useStore.getState>['page'];

interface Item {
  id: string;
  label: string;
  hint?: string;
  section: string;
  icon?: LucideIcon;
  instance?: Instance;
  /** Extra words that should match (not shown). */
  keywords?: string;
  run: () => void;
}

/** Lowercase, no Polish diacritics — "swiat" finds "Świat". */
const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l');

/** Higher is better; -1 = no match. Prefers word starts and contiguous runs. */
function score(query: string, text: string): number {
  if (!query) return 0;
  const t = fold(text);
  const idx = t.indexOf(query);
  if (idx >= 0) return 100 - idx + (idx === 0 || t[idx - 1] === ' ' ? 50 : 0);
  // Fuzzy: every query char in order.
  let ti = 0;
  let gaps = 0;
  for (const ch of query) {
    const found = t.indexOf(ch, ti);
    if (found < 0) return -1;
    gaps += found - ti;
    ti = found + 1;
  }
  return Math.max(1, 40 - gaps);
}

const PAGES: Array<{ id: Page; label: string; icon: LucideIcon; keywords: string }> = [
  { id: 'home', label: 'Start', icon: House, keywords: 'home główna ostatnio grane skin' },
  { id: 'instances', label: 'Instancje', icon: Gamepad2, keywords: 'gry paczki modpacki' },
  { id: 'screenshots', label: 'Zrzuty', icon: Images, keywords: 'screenshoty zdjęcia galeria f2' },
  { id: 'servers', label: 'Serwery', icon: Server, keywords: 'hosting udostępnij playit upnp' },
  { id: 'accounts', label: 'Konta', icon: Users, keywords: 'skiny microsoft offline login' },
  { id: 'customize', label: 'Personalizacja', icon: Brush, keywords: 'wygląd motyw akcent tło animacje' },
  { id: 'settings', label: 'Ustawienia', icon: Settings, keywords: 'java ram pamięć aktualizacje dane' }
];

/** Settings-page sections, found by their heading text. */
const SECTIONS: Array<{ page: Page; heading: string; label: string; keywords: string }> = [
  { page: 'settings', heading: 'Java', label: 'Java i środowiska', keywords: 'jre jdk pobierz' },
  { page: 'settings', heading: 'Pamięć', label: 'Pamięć RAM', keywords: 'ram wydajność' },
  { page: 'settings', heading: 'Lokalizacja danych', label: 'Lokalizacja danych', keywords: 'folder dysk przenieś' },
  { page: 'settings', heading: 'Aktualizacje', label: 'Aktualizacje launchera', keywords: 'update wersja' },
  { page: 'customize', heading: 'Kolory', label: 'Kolory i motyw', keywords: 'akcent kolor' },
  { page: 'customize', heading: 'Tło', label: 'Tło', keywords: 'obraz aurora tapeta' },
  { page: 'customize', heading: 'Animacje', label: 'Animacje i efekty', keywords: 'ruch szkło kursor' },
  { page: 'customize', heading: 'Układ', label: 'Układ i rozmiar', keywords: 'skala zaokrąglenie pasek' },
  { page: 'customize', heading: 'Dźwięki', label: 'Dźwięki interfejsu', keywords: 'głośność klik muzyka wycisz' },
  { page: 'customize', heading: 'Moje motywy', label: 'Moje motywy', keywords: 'preset zapisz eksport import' }
];

const THEMES = [
  { id: 'default', label: 'Domyślny' },
  { id: 'dark', label: 'Ciemny' },
  { id: 'crimson', label: 'Crimson' },
  { id: 'light', label: 'Jasny' }
];

function go(page: Page, after?: () => void) {
  const s = useStore.getState();
  if (s.page !== page || (page === 'instances' && s.selectedInstanceId)) {
    transition(() => {
      useStore.setState({ page, ...(page === 'instances' ? { selectedInstanceId: null } : {}) });
    });
  }
  if (after) setTimeout(after, 450);
}

function scrollToHeading(text: string) {
  // Headings are translated in the English UI.
  const h = [...document.querySelectorAll<HTMLElement>('.main .section h3')].find(
    (el) => el.textContent?.includes(text) || el.textContent?.includes(t(text))
  );
  if (!h) return;
  const section = h.closest<HTMLElement>('.section') ?? h;
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  section.classList.remove('flash');
  void section.offsetWidth;
  section.classList.add('flash');
}

async function launch(instance: Instance, world?: string) {
  try {
    await window.api.mc.launch(instance.id, world ? { world } : undefined);
    await useStore.getState().refreshInstances();
  } catch (e) {
    alertDialog({ title: 'Nie udało się uruchomić', message: (e as Error).message, tone: 'error' });
  }
}

function instancesAction(action: InstancesAction) {
  go('instances');
  useStore.setState({ pendingAction: action });
}

/** Ctrl+K: jump to any page, instance, world, setting or action. */
export function CommandPalette() {
  const open = useStore((s) => s.paletteOpen);
  const close = () => useStore.setState({ paletteOpen: false });

  // Global shortcut.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        useStore.setState((s) => ({ paletteOpen: !s.paletteOpen }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return open ? createPortal(<PaletteDialog onClose={close} />, document.body) : null;
}

function PaletteDialog({ onClose }: { onClose: () => void }) {
  const instances = useStore((s) => s.instances);
  const servers = useStore((s) => s.servers);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [worlds, setWorlds] = useState<Array<{ instance: Instance; world: WorldInfo }>>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  // Worlds of the most recently played instances (cheap folder reads).
  useEffect(() => {
    let alive = true;
    const recent = instances
      .filter((i) => i.lastPlayed)
      .sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))
      .slice(0, 8);
    Promise.all(
      recent.map((instance) =>
        window.api.worlds
          .list(instance.id)
          .then((ws) => ws.map((world) => ({ instance, world })))
          .catch(() => [])
      )
    ).then((all) => alive && setWorlds(all.flat()));
    return () => {
      alive = false;
    };
  }, [instances]);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const p of PAGES) {
      out.push({ id: `page:${p.id}`, label: p.label, section: 'Strony', icon: p.icon, keywords: p.keywords, run: () => go(p.id) });
    }
    out.push(
      { id: 'act:create', label: 'Nowa instancja', section: 'Akcje', icon: Plus, keywords: 'stwórz dodaj', run: () => instancesAction('create') },
      { id: 'act:import', label: 'Importuj paczkę', section: 'Akcje', icon: Import, keywords: 'mrpack zerda zip', run: () => instancesAction('import') },
      { id: 'act:packs', label: 'Przeglądaj modpacki', section: 'Akcje', icon: Boxes, keywords: 'modrinth curseforge', run: () => instancesAction('modpacks') },
      {
        id: 'act:invite',
        label: 'Dołącz z zaproszenia (schowek)',
        section: 'Akcje',
        icon: UserPlus,
        keywords: 'zaproszenie link serwer znajomy',
        run: async () => {
          if (!(await checkClipboardInvite(true))) showToast('Najpierw skopiuj wiadomość z zaproszeniem.', 'info');
        }
      }
    );
    const byRecent = [...instances].sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0));
    for (const inst of byRecent) {
      const meta = `${inst.mcVersion} · ${inst.loader}`;
      out.push({
        id: `play:${inst.id}`,
        label: `Graj: ${inst.name}`,
        hint: meta,
        section: 'Instancje',
        icon: Play,
        instance: inst,
        keywords: `${inst.group ?? ''} uruchom`,
        run: () => void launch(inst)
      });
      out.push({
        id: `open:${inst.id}`,
        label: `Otwórz: ${inst.name}`,
        hint: meta,
        section: 'Instancje',
        icon: FolderOpen,
        instance: inst,
        keywords: `${inst.group ?? ''} szczegóły mody`,
        run: () => transition(() => useStore.getState().openInstance(inst.id))
      });
    }
    for (const { instance, world } of worlds) {
      out.push({
        id: `world:${instance.id}:${world.name}`,
        label: `Świat: ${world.name}`,
        hint: instance.name,
        section: 'Światy',
        icon: Earth,
        keywords: 'quick play zagraj',
        run: () => void launch(instance, world.name)
      });
    }
    for (const srv of servers) {
      out.push({
        id: `srv:${srv.id}`,
        label: `Serwer: ${srv.name}`,
        hint: `${srv.mcVersion} · ${srv.loader}`,
        section: 'Serwery',
        icon: Server,
        run: () => go('servers')
      });
    }
    for (const s of SECTIONS) {
      out.push({
        id: `sec:${s.page}:${s.heading}`,
        label: s.label,
        hint: s.page === 'settings' ? 'Ustawienia' : 'Personalizacja',
        section: 'Ustawienia',
        icon: s.page === 'settings' ? Settings : Brush,
        keywords: s.keywords,
        run: () => go(s.page, () => scrollToHeading(s.heading))
      });
    }
    for (const t of THEMES) {
      out.push({
        id: `theme:${t.id}`,
        label: `Motyw: ${t.label}`,
        section: 'Ustawienia',
        icon: Palette,
        keywords: 'wygląd kolor',
        run: () => {
          const cur = useStore.getState().settings;
          if (cur) useStore.setState({ settings: { ...cur, theme: t.id } });
          void window.api.settings.set({ theme: t.id });
        }
      });
    }
    return out;
  }, [instances, servers, worlds]);

  const results = useMemo(() => {
    const q = fold(query.trim());
    if (!q) {
      // Without a query: pages, actions and the few most recent instances/worlds.
      const recent = new Set(
        items.filter((i) => i.id.startsWith('play:')).slice(0, 4).map((i) => i.id)
      );
      return items.filter(
        (i) => i.section === 'Strony' || i.section === 'Akcje' || recent.has(i.id)
      );
    }
    return items
      // Labels match in both languages (the English UI shows translated labels).
      .map((item) => ({
        item,
        s: Math.max(score(q, item.label), score(q, t(item.label)), score(q, `${item.hint ?? ''} ${item.keywords ?? ''}`) - 30)
      }))
      .filter((r) => r.s >= 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 40)
      .map((r) => r.item);
  }, [items, query]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (item: Item | undefined) => {
    if (!item) return;
    onClose();
    // Let the palette unmount before page transitions snapshot the DOM.
    requestAnimationFrame(() => item.run());
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') setActive((a) => Math.min(results.length - 1, a + 1));
    else if (e.key === 'ArrowUp') setActive((a) => Math.max(0, a - 1));
    else if (e.key === 'Enter') choose(results[active]);
    else if (e.key === 'Escape') onClose();
    else return;
    e.preventDefault();
  };

  // Section headers in result order.
  let lastSection = '';

  return (
    <div className="palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-label="Szukaj" onKeyDown={onKeyDown}>
        <div className="palette-input">
          <Search size={18} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Szukaj instancji, światów, ustawień…"
            spellCheck={false}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="palette-list" ref={listRef}>
          {results.length === 0 && <div className="palette-empty">Nic nie znaleziono dla „{query}”.</div>}
          {results.map((item, i) => {
            const header = item.section !== lastSection ? item.section : null;
            lastSection = item.section;
            const Icon = item.icon;
            return (
              <div key={item.id}>
                {header && <div className="palette-section">{header}</div>}
                <div
                  data-index={i}
                  className={`palette-item ${i === active ? 'active' : ''}`}
                  onMouseMove={() => i !== active && setActive(i)}
                  onClick={() => choose(item)}
                >
                  {item.instance ? (
                    <InstanceIcon instance={item.instance} className="palette-inst-icon" />
                  ) : (
                    Icon && <Icon size={17} className="palette-icon" />
                  )}
                  <span className="palette-label truncate">{item.label}</span>
                  {item.hint && <span className="palette-hint truncate">{item.hint}</span>}
                  {i === active && <CornerDownLeft size={14} className="palette-enter" />}
                </div>
              </div>
            );
          })}
        </div>
        <div className="palette-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> wybór
          </span>
          <span>
            <kbd>Enter</kbd> otwórz
          </span>
          <span>
            <kbd>Ctrl</kbd>
            <kbd>K</kbd> zamknij
          </span>
        </div>
      </div>
    </div>
  );
}
