import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Puzzle,
  Palette,
  Sparkles,
  Cog,
  WandSparkles,
  Map as MapIcon,
  Rocket,
  Wrench,
  Sofa,
  Drumstick,
  Archive,
  Mountain,
  PawPrint,
  Swords,
  Library,
  TrainFront,
  LayoutGrid,
  FolderOpen,
  Download,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  CircleArrowUp,
  TriangleAlert,
  Trash2,
  type LucideIcon
} from 'lucide-react';
import { SourceSwitch } from './SourceSwitch';
import { VersionPickerModal } from './VersionPickerModal';
import { useBackdropClose } from '../hooks/useBackdropClose';
import { confirmDialog, showToast } from '../ui/feedback';
import { ModalHeader } from '../ui/ModalHeader';
import { SearchField } from '../ui/SearchField';
import { useIndicator } from '../ui/useIndicator';
import { formatDownloads, formatSize } from '../format';
import { openExternal, projectUrl } from '../links';
import type {
  Instance,
  ModProvider,
  ModSearchResult,
  InstalledMod,
  ContentKind,
  ContentUpdate
} from '../../shared/types';

const KIND_LABEL: Record<ContentKind, string> = {
  mod: 'Mody',
  resourcepack: 'Resource packi',
  shader: 'Shadery'
};
const KIND_ICON: Record<ContentKind, LucideIcon> = { mod: Puzzle, resourcepack: Palette, shader: Sparkles };
const SEARCH_PLACEHOLDER: Record<ContentKind, string> = {
  mod: 'Szukaj modów (np. sodium, jei, create)…',
  resourcepack: 'Szukaj resource packów (np. faithful, fresh)…',
  shader: 'Szukaj shaderów (np. complementary, BSL, sildur)…'
};

// Shared category keys (Modrinth slugs; mapped to CurseForge ids in the backend).
const MOD_CATEGORIES: Array<{ key: string; label: string; icon: LucideIcon }> = [
  { key: 'technology', label: 'Technologia', icon: Cog },
  { key: 'magic', label: 'Magia', icon: WandSparkles },
  { key: 'adventure', label: 'Przygoda', icon: MapIcon },
  { key: 'optimization', label: 'Optymalizacja', icon: Rocket },
  { key: 'utility', label: 'Narzędzia', icon: Wrench },
  { key: 'decoration', label: 'Dekoracje', icon: Sofa },
  { key: 'food', label: 'Jedzenie', icon: Drumstick },
  { key: 'storage', label: 'Magazyny', icon: Archive },
  { key: 'worldgen', label: 'Świat', icon: Mountain },
  { key: 'mobs', label: 'Moby', icon: PawPrint },
  { key: 'equipment', label: 'Ekwipunek', icon: Swords },
  { key: 'library', label: 'Biblioteki', icon: Library },
  { key: 'transportation', label: 'Transport', icon: TrainFront }
];

const PAGE_SIZE = 20;

/** Placeholder tile for items without a remote icon. */
function KindPlaceholder({ kind }: { kind: ContentKind }) {
  const Icon = KIND_ICON[kind];
  return (
    <div className="mod-icon placeholder">
      <Icon size={22} />
    </div>
  );
}

export function ContentManagerModal({
  instance,
  kinds,
  onClose,
  checkUpdatesOnOpen
}: {
  instance: Instance;
  kinds: ContentKind[];
  onClose: () => void;
  /** Open on the installed list and look for updates right away. */
  checkUpdatesOnOpen?: boolean;
}) {
  const [kind, setKind] = useState<ContentKind>(kinds[0]);
  const [tab, setTab] = useState<'browse' | 'installed'>(checkUpdatesOnOpen ? 'installed' : 'browse');
  const [provider, setProvider] = useState<ModProvider>('modrinth');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('relevance');
  const [page, setPage] = useState(0);
  const [results, setResults] = useState<ModSearchResult[]>([]);
  const [installed, setInstalled] = useState<InstalledMod[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerFor, setPickerFor] = useState<ModSearchResult | null>(null);
  const [updates, setUpdates] = useState<ContentUpdate[]>([]);
  const [checking, setChecking] = useState(false);
  const [busyFile, setBusyFile] = useState<string | null>(null);
  const [installedQuery, setInstalledQuery] = useState('');

  const visibleInstalled = useMemo(() => {
    const q = installedQuery.trim().toLowerCase();
    if (!q) return installed;
    return installed.filter((m) => `${m.title ?? ''} ${m.fileName}`.toLowerCase().includes(q));
  }, [installed, installedQuery]);

  const installedProjectIds = useMemo(
    () => new Set(installed.map((m) => m.projectId).filter(Boolean) as string[]),
    [installed]
  );
  const updateByFile = useMemo(() => {
    const m = new Map<string, ContentUpdate>();
    updates.forEach((u) => m.set(u.fileName, u));
    return m;
  }, [updates]);

  const loadInstalled = async () => {
    const list = await window.api.mods.installed(instance.id, kind);
    setInstalled(list);
    // Backfill icons for provider-tracked items that don't have one yet
    // (older installs + auto-resolved dependencies) without blocking the UI.
    if (list.some((m) => m.provider && m.projectId && !m.iconUrl)) {
      window.api.mods
        .fetchIcons(instance.id, kind)
        .then(setInstalled)
        .catch(() => {});
    }
  };

  // Debounced search whenever query / provider / kind changes.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await window.api.mods.search(
          kind,
          provider,
          query,
          instance.mcVersion,
          instance.loader,
          page * PAGE_SIZE,
          category,
          sort
        );
        if (!cancelled) setResults(r);
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message);
          setResults([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    const t = setTimeout(run, query ? 350 : 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, provider, kind, category, sort, page, instance.mcVersion, instance.loader]);

  // Any filter change returns to the first page.
  useEffect(() => {
    setPage(0);
  }, [query, category, sort, provider, kind]);

  // Reset per-kind state when switching kind.
  useEffect(() => {
    setUpdates([]);
    setCategory('');
    loadInstalled();
  }, [kind]);

  useEffect(() => {
    if (checkUpdatesOnOpen) void checkForUpdates();
  }, []);

  const checkForUpdates = async () => {
    setChecking(true);
    setError(null);
    try {
      const found = await window.api.mods.checkUpdates(instance.id, kind);
      setUpdates(found);
      if (!found.length) showToast('Wszystko jest aktualne.', 'success');
      // Hash lookups may have recognised files added by hand — refresh their names and icons.
      setInstalled(await window.api.mods.installed(instance.id, kind));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChecking(false);
    }
  };

  const applyUpdate = async (u: ContentUpdate) => {
    setBusyFile(u.fileName);
    setError(null);
    try {
      setInstalled(await window.api.mods.update(instance.id, kind, u.fileName, u.newFile));
      setUpdates((prev) => prev.filter((x) => x.fileName !== u.fileName));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyFile(null);
    }
  };

  const applyAllUpdates = async () => {
    for (const u of [...updates]) {
      await applyUpdate(u);
    }
  };

  const addFromPc = async () => {
    setError(null);
    try {
      const list = await window.api.mods.pickLocal(instance.id, kind);
      if (!list) return;
      setInstalled(list);
      setTab('installed');
      showToast('Dodano pliki z komputera.', 'success');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleToggle = async (mod: InstalledMod) => {
    setInstalled(await window.api.mods.toggle(instance.id, kind, mod.fileName, !mod.enabled));
  };
  const handleDelete = async (mod: InstalledMod) => {
    const ok = await confirmDialog({
      title: 'Usunąć?',
      message: `„${mod.title ?? mod.fileName}" zostanie usunięty z tej instancji.`,
      danger: true
    });
    if (!ok) return;
    setInstalled(await window.api.mods.delete(instance.id, kind, mod.fileName));
    setUpdates((prev) => prev.filter((x) => x.fileName !== mod.fileName));
  };

  const title = kinds.length > 1 ? 'Zasoby' : KIND_LABEL[kind];
  const kindIndicator = useIndicator<HTMLDivElement>(kind);
  const backdrop = useBackdropClose(onClose);

  return createPortal(
    <div className="modal-backdrop" {...backdrop}>
      <div className="modal mod-modal content-modal" onClick={(e) => e.stopPropagation()}>
        <ModalHeader
          title={`${title} — ${instance.name}`}
          subtitle={`${instance.mcVersion} · ${instance.loader}`}
          onClose={onClose}
        />

        {kinds.length > 1 && (
          <div className="kind-tabs" ref={kindIndicator.ref}>
            <span
              className={`slide-indicator kind-indicator ${kindIndicator.ready ? 'ready' : ''}`}
              style={kindIndicator.style}
              aria-hidden
            />
            {kinds.map((k) => {
              const Icon = KIND_ICON[k];
              return (
                <button
                  key={k}
                  data-active={kind === k}
                  className={`kind-tab ${kind === k ? 'active' : ''}`}
                  onClick={() => {
                    setKind(k);
                    setTab('browse');
                  }}
                >
                  <Icon size={15} /> {KIND_LABEL[k]}
                </button>
              );
            })}
          </div>
        )}

        {kind === 'mod' && instance.loader === 'vanilla' && (
          <div className="notice notice-warning">
            <TriangleAlert size={16} />
            Ta instancja jest na „vanilla" — mody wymagają Fabric/Forge/NeoForge, więc się nie wczytają.
          </div>
        )}

        <div className="mod-tabs">
          <button className={tab === 'browse' ? 'primary' : 'ghost'} onClick={() => setTab('browse')}>
            Przeglądaj
          </button>
          <button
            className={tab === 'installed' ? 'primary' : 'ghost'}
            onClick={() => {
              setTab('installed');
              loadInstalled();
            }}
          >
            Zainstalowane ({installed.length})
          </button>
          <button className="ghost" onClick={addFromPc} title="Dodaj pliki z dysku do tej instancji">
            <FolderOpen size={16} /> Dodaj z komputera
          </button>
          {tab === 'browse' && (
            <div className="mod-source-right">
              <SourceSwitch value={provider} onChange={setProvider} />
            </div>
          )}
        </div>

        {error && <div className="error">{error}</div>}

        {tab === 'browse' ? (
          <div className="browse-layout">
            <div className="browse-main">
              <div className="browse-searchbar">
                <SearchField
                  autoFocus
                  className="browse-search"
                  placeholder={SEARCH_PLACEHOLDER[kind]}
                  value={query}
                  onChange={setQuery}
                />
                <select className="sort-select" value={sort} onChange={(e) => setSort(e.target.value)}>
                  <option value="relevance">Trafność</option>
                  <option value="downloads">Pobrania</option>
                  <option value="updated">Aktualizacja</option>
                </select>
              </div>
              <div className="mod-list">
                {loading && <div className="mod-empty">Szukam…</div>}
                {!loading && results.length === 0 && !error && <div className="mod-empty">Brak wyników.</div>}
                {!loading &&
                  results.map((r) => {
                    const already = installedProjectIds.has(r.projectId);
                    return (
                      <div className="mod-row" key={`${r.provider}:${r.projectId}`}>
                        {r.iconUrl ? (
                          <img className="mod-icon" src={r.iconUrl} alt="" loading="lazy" />
                        ) : (
                          <KindPlaceholder kind={kind} />
                        )}
                        <div className="mod-info">
                          <div className="mod-title">{r.title}</div>
                          <div className="mod-desc">{r.description}</div>
                          <div className="mod-sub">
                            <span className={`src-badge ${r.provider}`}>
                              {r.provider === 'curseforge' ? 'CurseForge' : 'Modrinth'}
                            </span>
                            {r.author} · <Download size={11} /> {formatDownloads(r.downloads)}
                          </div>
                          {r.categories.length > 0 && (
                            <div className="mod-cats">
                              {r.categories.slice(0, 4).map((c) => (
                                <span className="mod-cat" key={c}>
                                  {c}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          className="ghost"
                          title="Otwórz stronę w przeglądarce"
                          onClick={() => openExternal(projectUrl(r.provider, r.projectId, r.slug))}
                        >
                          <ExternalLink size={15} /> Strona
                        </button>
                        <button className="primary" disabled={already} onClick={() => setPickerFor(r)}>
                          {already ? 'Zainstalowany' : 'Instaluj…'}
                        </button>
                      </div>
                    );
                  })}
              </div>
              <div className="pager">
                <button
                  className="ghost"
                  disabled={page === 0 || loading}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  <ChevronLeft size={16} /> Poprzednia
                </button>
                <span className="pager-info">Strona {page + 1}</span>
                <button
                  className="ghost"
                  disabled={results.length < PAGE_SIZE || loading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Następna <ChevronRight size={16} />
                </button>
              </div>
            </div>
            {kind === 'mod' && (
              <aside className="browse-cats">
                <div className="browse-cats-title">Kategorie</div>
                <button
                  className={`cat-item ${category === '' ? 'active' : ''}`}
                  onClick={() => setCategory('')}
                >
                  <LayoutGrid className="cat-item-ic" /> Wszystkie
                </button>
                {MOD_CATEGORIES.map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    className={`cat-item ${category === key ? 'active' : ''}`}
                    onClick={() => setCategory(category === key ? '' : key)}
                  >
                    <Icon className="cat-item-ic" />
                    {label}
                  </button>
                ))}
              </aside>
            )}
          </div>
        ) : (
          <div className="installed-wrap">
            <div className="installed-toolbar">
              <SearchField
                className="instances-search"
                placeholder="Szukaj w zainstalowanych…"
                value={installedQuery}
                onChange={setInstalledQuery}
              />
              <button className="ghost" onClick={checkForUpdates} disabled={checking || installed.length === 0}>
                <RefreshCw size={15} className={checking ? 'spin' : ''} />
                {checking ? 'Sprawdzam…' : 'Sprawdź aktualizacje'}
              </button>
              {updates.length > 0 && (
                <button className="primary" onClick={applyAllUpdates} disabled={!!busyFile}>
                  <CircleArrowUp size={16} /> Zaktualizuj wszystkie ({updates.length})
                </button>
              )}
            </div>
            <div className="mod-list">
              {installed.length === 0 && <div className="mod-empty">Nic nie zainstalowano.</div>}
              {installed.length > 0 && visibleInstalled.length === 0 && (
                <div className="mod-empty">Brak wyników dla „{installedQuery}".</div>
              )}
              {visibleInstalled.map((m) => {
                const upd = updateByFile.get(m.fileName);
                return (
                  <div className={`mod-row ${m.enabled ? '' : 'is-disabled'}`} key={m.fileName}>
                    <div className="mod-icon-wrap" title={m.enabled ? 'Włączony' : 'Wyłączony'}>
                      {m.iconUrl ? (
                        <img className="mod-icon" src={m.iconUrl} alt="" loading="lazy" />
                      ) : (
                        <KindPlaceholder kind={kind} />
                      )}
                      <span className={`mod-state-dot ${m.enabled ? 'on' : 'off'}`} />
                    </div>
                    <div className="mod-info">
                      <div className="mod-title">{m.title ?? m.fileName}</div>
                      <div className="mod-sub">
                        {m.fileName} {m.size ? '· ' + formatSize(m.size) : ''}
                      </div>
                      {upd && (
                        <div className="mod-update-note">
                          <CircleArrowUp size={13} /> Dostępna nowa wersja: {upd.newFile.displayName}
                        </div>
                      )}
                    </div>
                    {upd && (
                      <button className="primary" disabled={!!busyFile} onClick={() => applyUpdate(upd)}>
                        {busyFile === m.fileName ? 'Aktualizuję…' : 'Aktualizuj'}
                      </button>
                    )}
                    {m.provider && m.projectId && (
                      <button
                        className="ghost icon-btn"
                        title="Otwórz stronę w przeglądarce"
                        onClick={() => openExternal(projectUrl(m.provider!, m.projectId!))}
                      >
                        <ExternalLink size={16} />
                      </button>
                    )}
                    <button onClick={() => handleToggle(m)} title={m.enabled ? 'Wyłącz' : 'Włącz'}>
                      {m.enabled ? 'Wyłącz' : 'Włącz'}
                    </button>
                    <button className="danger icon-btn" onClick={() => handleDelete(m)} title="Usuń">
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {pickerFor && (
        <VersionPickerModal
          title={pickerFor.title}
          subtitle={`${instance.mcVersion} · ${instance.loader}`}
          note={kind === 'mod' ? 'Wymagane zależności pobiorą się automatycznie wraz z modem.' : undefined}
          load={() =>
            window.api.mods.files(kind, pickerFor.provider, pickerFor.projectId, instance.mcVersion, instance.loader)
          }
          onInstall={async (file) => {
            await window.api.mods.install(instance.id, kind, file, true, pickerFor.iconUrl);
            await loadInstalled();
            setPickerFor(null);
          }}
          onClose={() => setPickerFor(null)}
        />
      )}
    </div>,
    document.body
  );
}
