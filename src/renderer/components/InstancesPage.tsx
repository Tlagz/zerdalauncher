import { useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { Plus, Boxes, Import, Loader2, Star, ChevronDown, Folder } from 'lucide-react';
import { useStore } from '../store';
import { CreateInstanceModal } from './CreateInstanceModal';
import { ModpackBrowserModal } from './ModpackBrowserModal';
import { InstanceCard } from './InstanceCard';
import { InstanceDetail } from './InstanceDetail';
import { alertDialog } from '../ui/feedback';
import { SearchField } from '../ui/SearchField';
import { formatPlaytime, plural } from '../format';
import { transition } from '../ui/viewTransition';
import type { Instance } from '../../shared/types';

/** Per-viewer UI memory; storage can be unavailable, so every access is guarded. */
function remember<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function persist(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

/** Newest first: "1.20.4" before "1.20" before "1.7.10"; snapshots fall back to text order. */
function compareMc(a: string, b: string): number {
  const pa = a.split(/[.-]/).map(Number);
  const pb = b.split(/[.-]/).map(Number);
  if (pa.some(isNaN) || pb.some(isNaN)) return b.localeCompare(a);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pb[i] ?? 0) - (pa[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

const UNGROUPED = '';

export function InstancesPage() {
  const { instances, refreshInstances } = useStore();
  const selectedId = useStore((s) => s.selectedInstanceId);
  const pendingAction = useStore((s) => s.pendingAction);
  const totalPlaytime = formatPlaytime(instances.reduce((s, i) => s + (i.playtimeMs ?? 0), 0));
  const [showCreate, setShowCreate] = useState(false);
  const [showPacks, setShowPacks] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const setSelectedId = (id: string | null) => useStore.setState({ selectedInstanceId: id });
  // The card that morphs into / back from the detail view. It must carry its
  // shared-element names *before* the transition snapshots the old state, and
  // keeps them afterwards so "back" can morph into it again.
  const [morphId, setMorphId] = useState<string | null>(null);

  const openInstance = (id: string) => {
    flushSync(() => setMorphId(id));
    transition(() => setSelectedId(id));
  };
  const [search, setSearch] = useState('');
  const [sortBy, setSortByState] = useState(() => remember('instances.sort', 'lastPlayed'));
  const setSortBy = (v: string) => {
    setSortByState(v);
    persist('instances.sort', v);
  };
  // 'all' | 'favorites' | 'group:<name>'
  const [filter, setFilterState] = useState(() => remember('instances.filter', 'all'));
  const setFilter = (v: string) => {
    setFilterState(v);
    persist('instances.filter', v);
  };
  const [collapsed, setCollapsed] = useState<string[]>(() => remember('instances.collapsed', []));
  const toggleGroup = (g: string) => {
    const next = collapsed.includes(g) ? collapsed.filter((x) => x !== g) : [...collapsed, g];
    setCollapsed(next);
    persist('instances.collapsed', next);
  };

  const selected = instances.find((i) => i.id === selectedId) ?? null;

  const groups = useMemo(
    () =>
      [...new Set(instances.map((i) => i.group).filter((g): g is string => !!g))].sort((a, b) =>
        a.localeCompare(b)
      ),
    [instances]
  );
  const favorites = instances.filter((i) => i.pinned).length;
  // A remembered filter whose group/favorites are gone falls back to everything.
  const activeFilter =
    (filter === 'favorites' && !favorites) || (filter.startsWith('group:') && !groups.includes(filter.slice(6)))
      ? 'all'
      : filter;

  const sortFn = (a: Instance, b: Instance) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    if (sortBy === 'playtime') return (b.playtimeMs ?? 0) - (a.playtimeMs ?? 0);
    if (sortBy === 'created') return (b.createdAt ?? 0) - (a.createdAt ?? 0);
    if (sortBy === 'mc') return compareMc(a.mcVersion, b.mcVersion) || a.name.localeCompare(b.name);
    return (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0);
  };

  const q = search.trim().toLowerCase();
  const visible = instances
    .filter((i) => !q || `${i.name} ${i.mcVersion} ${i.loader} ${i.group ?? ''}`.toLowerCase().includes(q))
    .filter((i) =>
      activeFilter === 'favorites'
        ? i.pinned
        : activeFilter.startsWith('group:')
          ? i.group === activeFilter.slice(6)
          : true
    )
    .sort(sortFn);

  // Group sections only when showing everything (no search) and some instances are grouped.
  const sectioned = activeFilter === 'all' && groups.length > 0 && !q;
  const sections: Array<{ group: string; items: Instance[] }> = sectioned
    ? [...groups, UNGROUPED]
        .map((g) => ({ group: g, items: visible.filter((i) => (i.group || UNGROUPED) === g) }))
        .filter((s) => s.items.length)
    : [{ group: UNGROUPED, items: visible }];

  // Show import progress in the subtitle while a .mrpack/.zerda is unpacking.
  useEffect(() => {
    return window.api.modpacks.onProgress((p) => {
      if (importing) setImportMsg(`${p.message} (${p.current}/${p.total})`);
    });
  }, [importing]);

  const handleImport = async () => {
    setImporting(true);
    setImportMsg('Wybierz plik…');
    try {
      const id = await window.api.modpacks.import();
      if (id) await refreshInstances();
    } catch (e) {
      alertDialog({ title: 'Import nie powiódł się', message: (e as Error).message, tone: 'error' });
    } finally {
      setImporting(false);
      setImportMsg(null);
    }
  };

  // Actions requested from elsewhere (Ctrl+K palette).
  useEffect(() => {
    if (!pendingAction) return;
    useStore.setState({ pendingAction: null });
    if (pendingAction === 'create') setShowCreate(true);
    else if (pendingAction === 'modpacks') setShowPacks(true);
    else if (pendingAction === 'import') void handleImport();
  }, [pendingAction]);

  if (selected) {
    return <InstanceDetail instance={selected} onBack={() => transition(() => setSelectedId(null))} />;
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Instancje</div>
          <div className="page-subtitle">
            {importing
              ? importMsg ?? 'Importuję paczkę…'
              : instances.length === 0
              ? 'Brak instancji — stwórz pierwszą, by zacząć grać.'
              : `${instances.length} ${plural(instances.length, 'instancja', 'instancje', 'instancji')}${
                  totalPlaytime ? ` · ${totalPlaytime} gry łącznie` : ''
                }`}
          </div>
        </div>
        <div className="header-actions">
          <button className="ghost" onClick={() => setShowPacks(true)} disabled={importing}>
            <Boxes size={16} /> Modpacki
          </button>
          <button className="ghost" onClick={handleImport} disabled={importing}>
            {importing ? <Loader2 size={16} className="spin" /> : <Import size={16} />}
            {importing ? 'Importuję…' : 'Importuj'}
          </button>
          <button className="primary" onClick={() => setShowCreate(true)} disabled={importing}>
            <Plus size={16} /> Nowa instancja
          </button>
        </div>
      </div>

      {instances.length === 0 ? (
        <div className="empty">
          <h2>Witaj!</h2>
          <p>Stwórz pierwszą instancję Minecraft, pobierz modpack lub zaimportuj paczkę.</p>
          <div className="empty-actions">
            <button className="primary" onClick={() => setShowCreate(true)}>
              <Plus size={16} /> Stwórz instancję
            </button>
            <button className="ghost" onClick={() => setShowPacks(true)}>
              <Boxes size={16} /> Przeglądaj modpacki
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="instances-toolbar">
            <SearchField
              className="instances-search"
              placeholder="Szukaj instancji…"
              value={search}
              onChange={setSearch}
            />
            <select className="sort-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="lastPlayed">Ostatnio grane</option>
              <option value="name">Nazwa (A→Z)</option>
              <option value="playtime">Czas gry</option>
              <option value="created">Najnowsze</option>
              <option value="mc">Wersja MC</option>
            </select>
          </div>
          {(favorites > 0 || groups.length > 0) && (
            <div className="filter-chips">
              <button className={`chip ${activeFilter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
                Wszystkie <span className="chip-count">{instances.length}</span>
              </button>
              {favorites > 0 && (
                <button
                  className={`chip ${activeFilter === 'favorites' ? 'active' : ''}`}
                  onClick={() => setFilter('favorites')}
                >
                  <Star size={13} fill="currentColor" /> Ulubione <span className="chip-count">{favorites}</span>
                </button>
              )}
              {groups.map((g) => (
                <button
                  key={g}
                  className={`chip ${activeFilter === `group:${g}` ? 'active' : ''}`}
                  onClick={() => setFilter(`group:${g}`)}
                >
                  <Folder size={13} /> {g}
                  <span className="chip-count">{instances.filter((i) => i.group === g).length}</span>
                </button>
              ))}
            </div>
          )}
          {visible.length === 0 ? (
            <div className="empty">
              <p>{q ? `Brak instancji pasujących do „${search}".` : 'Brak instancji w tym widoku.'}</p>
            </div>
          ) : (
            sections.map(({ group, items }) => {
              const isCollapsed = sectioned && collapsed.includes(group);
              return (
                <section className="instance-section" key={group || '__ungrouped'}>
                  {sectioned && (
                    <button
                      className={`section-toggle ${isCollapsed ? 'collapsed' : ''}`}
                      onClick={() => toggleGroup(group)}
                      aria-expanded={!isCollapsed}
                    >
                      <ChevronDown size={16} className="section-chevron" />
                      {group || 'Bez grupy'}
                      <span className="chip-count">{items.length}</span>
                    </button>
                  )}
                  {!isCollapsed && (
                    <div className="instance-grid">
                      {items.map((inst) => (
                        <InstanceCard
                          key={inst.id}
                          instance={inst}
                          morph={inst.id === morphId}
                          onOpen={() => openInstance(inst.id)}
                        />
                      ))}
                    </div>
                  )}
                </section>
              );
            })
          )}
        </>
      )}

      {showCreate && <CreateInstanceModal onClose={() => setShowCreate(false)} />}
      {showPacks && (
        <ModpackBrowserModal
          onClose={() => setShowPacks(false)}
          onInstalled={async () => {
            await refreshInstances();
            setShowPacks(false);
          }}
        />
      )}
    </>
  );
}
