import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { Plus, Boxes, Import, Loader2 } from 'lucide-react';
import { useStore } from '../store';
import { CreateInstanceModal } from './CreateInstanceModal';
import { ModpackBrowserModal } from './ModpackBrowserModal';
import { InstanceCard } from './InstanceCard';
import { InstanceDetail } from './InstanceDetail';
import { alertDialog } from '../ui/feedback';
import { SearchField } from '../ui/SearchField';
import { formatPlaytime, plural } from '../format';
import { transition } from '../ui/viewTransition';

export function InstancesPage() {
  const { instances, refreshInstances } = useStore();
  const totalPlaytime = formatPlaytime(instances.reduce((s, i) => s + (i.playtimeMs ?? 0), 0));
  const [showCreate, setShowCreate] = useState(false);
  const [showPacks, setShowPacks] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The card that morphs into / back from the detail view. It must carry its
  // shared-element names *before* the transition snapshots the old state, and
  // keeps them afterwards so "back" can morph into it again.
  const [morphId, setMorphId] = useState<string | null>(null);

  const openInstance = (id: string) => {
    flushSync(() => setMorphId(id));
    transition(() => setSelectedId(id));
  };
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('lastPlayed');

  const selected = instances.find((i) => i.id === selectedId) ?? null;

  const visible = instances
    .slice()
    .sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'playtime') return (b.playtimeMs ?? 0) - (a.playtimeMs ?? 0);
      if (sortBy === 'created') return (b.createdAt ?? 0) - (a.createdAt ?? 0);
      return (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0);
    })
    .filter((i) => i.name.toLowerCase().includes(search.trim().toLowerCase()));

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
            </select>
          </div>
          {visible.length === 0 ? (
            <div className="empty">
              <p>Brak instancji pasujących do „{search}".</p>
            </div>
          ) : (
            <div className="instance-grid">
              {visible.map((inst) => (
                <InstanceCard
                  key={inst.id}
                  instance={inst}
                  morph={inst.id === morphId}
                  onOpen={() => openInstance(inst.id)}
                />
              ))}
            </div>
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
