import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { CreateInstanceModal } from './CreateInstanceModal';
import { ModpackBrowserModal } from './ModpackBrowserModal';
import { InstanceCard } from './InstanceCard';
import { InstanceDetail } from './InstanceDetail';

function fmtTotal(ms: number): string {
  if (ms < 60000) return '';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function InstancesPage() {
  const { instances, refreshInstances } = useStore();
  const totalPlaytime = fmtTotal(instances.reduce((s, i) => s + (i.playtimeMs ?? 0), 0));
  const [showCreate, setShowCreate] = useState(false);
  const [showPacks, setShowPacks] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = instances.find((i) => i.id === selectedId) ?? null;

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
      alert((e as Error).message);
    } finally {
      setImporting(false);
      setImportMsg(null);
    }
  };

  if (selected) {
    return <InstanceDetail instance={selected} onBack={() => setSelectedId(null)} />;
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
              : `${instances.length} ${instances.length === 1 ? 'instancja' : 'instancje'}${
                  totalPlaytime ? ` · ⏱ ${totalPlaytime} łącznie` : ''
                }`}
          </div>
        </div>
        <div className="header-actions">
          <button className="ghost" onClick={() => setShowPacks(true)} disabled={importing}>
            🧰 Modpacki
          </button>
          <button className="ghost" onClick={handleImport} disabled={importing}>
            {importing ? 'Importuję…' : '📥 Importuj'}
          </button>
          <button className="primary" onClick={() => setShowCreate(true)} disabled={importing}>
            + Nowa instancja
          </button>
        </div>
      </div>

      {instances.length === 0 ? (
        <div className="empty">
          <h2>Witaj!</h2>
          <p>Stwórz pierwszą instancję Minecraft, pobierz modpack lub zaimportuj paczkę.</p>
          <div className="login-actions" style={{ marginTop: 16, justifyContent: 'center' }}>
            <button className="primary" onClick={() => setShowCreate(true)}>
              Stwórz instancję
            </button>
            <button className="ghost" onClick={() => setShowPacks(true)}>
              Przeglądaj modpacki
            </button>
          </div>
        </div>
      ) : (
        <div className="instance-grid">
          {instances
            .slice()
            .sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))
            .map((inst) => (
              <InstanceCard key={inst.id} instance={inst} onOpen={() => setSelectedId(inst.id)} />
            ))}
        </div>
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
