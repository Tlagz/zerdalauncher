import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Package, Download, ExternalLink } from 'lucide-react';
import { SourceSwitch } from './SourceSwitch';
import { VersionPickerModal } from './VersionPickerModal';
import { useBackdropClose } from '../hooks/useBackdropClose';
import { ModalHeader } from '../ui/ModalHeader';
import { SearchField } from '../ui/SearchField';
import { formatDownloads } from '../format';
import { openExternal, projectUrl } from '../links';
import type { ModProvider, ModSearchResult } from '../../shared/types';

export function ModpackBrowserModal({
  onClose,
  onInstalled
}: {
  onClose: () => void;
  onInstalled: () => void;
}) {
  const [provider, setProvider] = useState<ModProvider>('modrinth');
  const [query, setQuery] = useState('');
  const [mcFilter, setMcFilter] = useState('');
  const [sort, setSort] = useState('relevance');
  const [results, setResults] = useState<ModSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerFor, setPickerFor] = useState<ModSearchResult | null>(null);

  // Debounced search whenever query / mc filter / provider changes.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await window.api.modpacks.search(provider, query, mcFilter.trim(), 0, sort);
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
    const t = setTimeout(run, query || mcFilter ? 350 : 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, mcFilter, provider, sort]);

  const backdrop = useBackdropClose(onClose);

  return createPortal(
    <div className="modal-backdrop" {...backdrop}>
      <div className="modal mod-modal" onClick={(e) => e.stopPropagation()}>
        <ModalHeader
          title="Przeglądaj modpacki"
          subtitle="Instalacja tworzy nową instancję ze wszystkimi modami"
          onClose={onClose}
        />

        <div className="mod-tabs">
          <SourceSwitch value={provider} onChange={setProvider} />
        </div>

        {error && <div className="error">{error}</div>}

        <div className="pack-filters">
          <SearchField
            autoFocus
            className="pack-query"
            placeholder="Szukaj modpacków (np. fabulously, better mc, create)…"
            value={query}
            onChange={setQuery}
          />
          <input
            className="pack-mc"
            placeholder="Wersja MC (opcj.)"
            value={mcFilter}
            onChange={(e) => setMcFilter(e.target.value)}
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
            results.map((r) => (
              <div className="mod-row" key={`${r.provider}:${r.projectId}`}>
                {r.iconUrl ? (
                  <img className="mod-icon" src={r.iconUrl} alt="" loading="lazy" />
                ) : (
                  <div className="mod-icon placeholder">
                    <Package size={22} />
                  </div>
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
                </div>
                <button
                  className="ghost"
                  title="Otwórz stronę w przeglądarce"
                  onClick={() => openExternal(projectUrl(r.provider, r.projectId, r.slug))}
                >
                  <ExternalLink size={15} /> Strona
                </button>
                <button className="primary" onClick={() => setPickerFor(r)}>
                  Instaluj…
                </button>
              </div>
            ))}
        </div>
      </div>

      {pickerFor && (
        <VersionPickerModal
          title={pickerFor.title}
          subtitle="Wybierz wersję paczki do zainstalowania (nowa instancja)"
          trackProgress
          load={() => window.api.modpacks.versions(pickerFor.provider, pickerFor.projectId)}
          onInstall={async (file) => {
            await window.api.modpacks.installFile(pickerFor.provider, pickerFor.projectId, file.fileId);
            setPickerFor(null);
            onInstalled();
          }}
          onClose={() => setPickerFor(null)}
        />
      )}
    </div>,
    document.body
  );
}
