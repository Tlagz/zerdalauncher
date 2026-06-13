import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { SourceSwitch } from './SourceSwitch';
import { VersionPickerModal } from './VersionPickerModal';
import { useBackdropClose } from '../hooks/useBackdropClose';
import { confirmDialog } from '../ui/feedback';
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
const KIND_ICON: Record<ContentKind, string> = { mod: '🧩', resourcepack: '🎨', shader: '✨' };
const SEARCH_PLACEHOLDER: Record<ContentKind, string> = {
  mod: 'Szukaj modów (np. sodium, jei, create)…',
  resourcepack: 'Szukaj resource packów (np. faithful, fresh)…',
  shader: 'Szukaj shaderów (np. complementary, BSL, sildur)…'
};

// Shared category keys (Modrinth slugs; mapped to CurseForge ids in the backend).
const MOD_CATEGORIES = [
  { key: 'technology', label: 'Technologia', icon: '⚙️' },
  { key: 'magic', label: 'Magia', icon: '✨' },
  { key: 'adventure', label: 'Przygoda', icon: '🗺️' },
  { key: 'optimization', label: 'Optymalizacja', icon: '🚀' },
  { key: 'utility', label: 'Narzędzia', icon: '🔧' },
  { key: 'decoration', label: 'Dekoracje', icon: '🎨' },
  { key: 'food', label: 'Jedzenie', icon: '🍖' },
  { key: 'storage', label: 'Magazyny', icon: '📦' },
  { key: 'worldgen', label: 'Świat', icon: '🌍' },
  { key: 'mobs', label: 'Moby', icon: '🐺' },
  { key: 'equipment', label: 'Ekwipunek', icon: '⚔️' },
  { key: 'library', label: 'Biblioteki', icon: '📚' },
  { key: 'transportation', label: 'Transport', icon: '🛤️' }
];

const PAGE_SIZE = 20;

function formatDownloads(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}
function formatSize(bytes: number): string {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? mb.toFixed(1) + ' MB' : (bytes / 1024).toFixed(0) + ' KB';
}

export function ContentManagerModal({
  instance,
  kinds,
  onClose
}: {
  instance: Instance;
  kinds: ContentKind[];
  onClose: () => void;
}) {
  const [kind, setKind] = useState<ContentKind>(kinds[0]);
  const [tab, setTab] = useState<'browse' | 'installed'>('browse');
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

  const checkForUpdates = async () => {
    setChecking(true);
    setError(null);
    try {
      setUpdates(await window.api.mods.checkUpdates(instance.id, kind));
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
  const backdrop = useBackdropClose(onClose);

  return createPortal(
    <div className="modal-backdrop" {...backdrop}>
      <div className="modal mod-modal content-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mod-modal-head">
          <div>
            <h3 style={{ margin: 0 }}>
              {title} — {instance.name}
            </h3>
            <div style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 4 }}>
              {instance.mcVersion} · {instance.loader}
            </div>
          </div>
          <button className="ghost" onClick={onClose}>
            ✕
          </button>
        </div>

        {kinds.length > 1 && (
          <div className="kind-tabs">
            {kinds.map((k) => (
              <button
                key={k}
                className={`kind-tab ${kind === k ? 'active' : ''}`}
                onClick={() => {
                  setKind(k);
                  setTab('browse');
                }}
              >
                {KIND_ICON[k]} {KIND_LABEL[k]}
              </button>
            ))}
          </div>
        )}

        {kind === 'mod' && instance.loader === 'vanilla' && (
          <div className="error" style={{ background: '#2a2418', color: 'var(--warning)', borderColor: '#4a3a1f' }}>
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
                <input
                  autoFocus
                  className="browse-search"
                  placeholder={SEARCH_PLACEHOLDER[kind]}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <select className="sort-select" value={sort} onChange={(e) => setSort(e.target.value)}>
                  <option value="relevance">Trafność</option>
                  <option value="downloads">Pobrania</option>
                  <option value="updated">Aktualizacja</option>
                </select>
              </div>
              <div className="mod-list">
              {loading && <div className="mod-empty">Szukam…</div>}
              {!loading && results.length === 0 && !error && (
                <div className="mod-empty">Brak wyników.</div>
              )}
              {!loading &&
                results.map((r) => {
                  const already = installedProjectIds.has(r.projectId);
                  return (
                    <div className="mod-row" key={`${r.provider}:${r.projectId}`}>
                      {r.iconUrl ? (
                        <img className="mod-icon" src={r.iconUrl} alt="" loading="lazy" />
                      ) : (
                        <div className="mod-icon placeholder">{KIND_ICON[kind]}</div>
                      )}
                      <div className="mod-info">
                        <div className="mod-title">{r.title}</div>
                        <div className="mod-desc">{r.description}</div>
                        <div className="mod-sub">
                          <span className={`src-badge ${r.provider}`}>
                            {r.provider === 'curseforge' ? 'CurseForge' : 'Modrinth'}
                          </span>
                          {r.author} · ⬇ {formatDownloads(r.downloads)}
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
                  ← Poprzednia
                </button>
                <span className="pager-info">Strona {page + 1}</span>
                <button
                  className="ghost"
                  disabled={results.length < PAGE_SIZE || loading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Następna →
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
                  🗂️ Wszystkie
                </button>
                {MOD_CATEGORIES.map((c) => (
                  <button
                    key={c.key}
                    className={`cat-item ${category === c.key ? 'active' : ''}`}
                    onClick={() => setCategory(category === c.key ? '' : c.key)}
                  >
                    <span className="cat-item-ic">{c.icon}</span>
                    {c.label}
                  </button>
                ))}
              </aside>
            )}
          </div>
        ) : (
          <div className="installed-wrap">
            <div className="installed-toolbar">
              <button className="ghost" onClick={checkForUpdates} disabled={checking || installed.length === 0}>
                {checking ? 'Sprawdzam…' : '🔄 Sprawdź aktualizacje'}
              </button>
              {updates.length > 0 && (
                <button className="primary" onClick={applyAllUpdates} disabled={!!busyFile}>
                  ⬆ Zaktualizuj wszystkie ({updates.length})
                </button>
              )}
            </div>
            <div className="mod-list">
              {installed.length === 0 && <div className="mod-empty">Nic nie zainstalowano.</div>}
              {installed.map((m) => {
                const upd = updateByFile.get(m.fileName);
                return (
                  <div className={`mod-row ${m.enabled ? '' : 'is-disabled'}`} key={m.fileName}>
                    <div className="mod-icon-wrap" title={m.enabled ? 'Włączony' : 'Wyłączony'}>
                      {m.iconUrl ? (
                        <img className="mod-icon" src={m.iconUrl} alt="" loading="lazy" />
                      ) : (
                        <div className="mod-icon placeholder">{KIND_ICON[kind]}</div>
                      )}
                      <span className={`mod-state-dot ${m.enabled ? 'on' : 'off'}`} />
                    </div>
                    <div className="mod-info">
                      <div className="mod-title">{m.title ?? m.fileName}</div>
                      <div className="mod-sub">
                        {m.fileName} {m.size ? '· ' + formatSize(m.size) : ''}
                      </div>
                      {upd && (
                        <div className="mod-update-note">⬆ Dostępna nowa wersja: {upd.newFile.displayName}</div>
                      )}
                    </div>
                    {upd && (
                      <button className="primary" disabled={!!busyFile} onClick={() => applyUpdate(upd)}>
                        {busyFile === m.fileName ? 'Aktualizuję…' : 'Aktualizuj'}
                      </button>
                    )}
                    <button onClick={() => handleToggle(m)} title={m.enabled ? 'Wyłącz' : 'Włącz'}>
                      {m.enabled ? 'Wyłącz' : 'Włącz'}
                    </button>
                    <button className="danger" onClick={() => handleDelete(m)} title="Usuń">
                      🗑
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
