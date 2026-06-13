import { useState } from 'react';
import { useStore } from '../store';
import { useLaunch } from '../hooks/useLaunch';
import { InstanceIcon } from './InstanceIcon';
import { ContentManagerModal } from './ContentManagerModal';
import { ConsoleModal } from './ConsoleModal';
import { EditInstanceModal } from './EditInstanceModal';
import { WorldsModal } from './WorldsModal';
import { confirmDialog, alertDialog, showToast } from '../ui/feedback';
import type { Instance } from '../../shared/types';

function fmtPlaytime(ms?: number): string {
  if (!ms || ms < 60000) return '—';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function fmtDate(ms?: number): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function InstanceDetail({ instance, onBack }: { instance: Instance; onBack: () => void }) {
  const { refreshInstances } = useStore();
  const { isLaunching, launch } = useLaunch(instance);
  const [showMods, setShowMods] = useState(false);
  const [showConsole, setShowConsole] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showWorlds, setShowWorlds] = useState(false);

  const handleExport = async () => {
    try {
      const dest = await window.api.modpacks.export(instance.id);
      if (dest) showToast(`Wyeksportowano paczkę:\n${dest}`, 'success');
    } catch (e) {
      alertDialog({ message: (e as Error).message, tone: 'error' });
    }
  };

  const handleDuplicate = async () => {
    try {
      const copy = await window.api.instances.duplicate(instance.id);
      await refreshInstances();
      if (copy) showToast(`Utworzono kopię: „${copy.name}".`, 'success');
    } catch (e) {
      alertDialog({ message: (e as Error).message, tone: 'error' });
    }
  };

  const togglePin = async () => {
    await window.api.instances.update(instance.id, { pinned: !instance.pinned });
    await refreshInstances();
  };

  const handleDelete = async () => {
    const ok = await confirmDialog({
      title: 'Usunąć instancję?',
      message: `Cały folder instancji „${instance.name}" — mody, configi, światy i zapisy — przepadnie bezpowrotnie.`,
      danger: true,
      confirmLabel: 'Usuń instancję'
    });
    if (!ok) return;
    try {
      await window.api.instances.delete(instance.id);
      await refreshInstances();
      onBack();
    } catch (e) {
      alertDialog({ message: (e as Error).message, tone: 'error' });
    }
  };

  const actions = [
    { icon: '🧩', label: 'Mody, packi, shadery', onClick: () => setShowMods(true) },
    { icon: '🖥', label: 'Konsola (logi gry)', onClick: () => setShowConsole(true) },
    { icon: '🌍', label: 'Światy i kopie', onClick: () => setShowWorlds(true) },
    { icon: '⚙', label: 'Ustawienia instancji', onClick: () => setShowEdit(true) },
    { icon: '📑', label: 'Duplikuj instancję', onClick: handleDuplicate },
    {
      icon: instance.pinned ? '★' : '☆',
      label: instance.pinned ? 'Odepnij z góry' : 'Przypnij na górę',
      onClick: togglePin
    },
    { icon: '📦', label: 'Eksportuj .zerda', onClick: handleExport },
    { icon: '📁', label: 'Otwórz folder', onClick: () => window.api.instances.openFolder(instance.id) }
  ];

  return (
    <div className="detail-fade">
      <button className="ghost detail-back" onClick={onBack}>
        ← Wróć do instancji
      </button>

      <div className="detail-header">
        <InstanceIcon instance={instance} className="detail-icon" />
        <div className="detail-head-info">
          <div className="detail-name">{instance.name}</div>
          <div className="instance-meta" style={{ marginTop: 4 }}>
            <span className="tag">{instance.mcVersion}</span>
            <span className={`tag ${instance.loader}`}>{instance.loader}</span>
            {instance.loaderVersion && <span className="tag">{instance.loaderVersion}</span>}
            <span className="tag">{instance.ramMb} MB</span>
          </div>
        </div>
        <button className="primary detail-play" onClick={launch} disabled={isLaunching}>
          {isLaunching ? 'Uruchamianie…' : '▶ Graj'}
        </button>
      </div>

      <div className="detail-statgrid">
        <div className="detail-stat">
          <span className="ds-val">{fmtPlaytime(instance.playtimeMs)}</span>
          <span className="ds-key">Czas gry</span>
        </div>
        <div className="detail-stat">
          <span className="ds-val">{instance.sessions ?? 0}</span>
          <span className="ds-key">Uruchomień</span>
        </div>
        <div className="detail-stat">
          <span className="ds-val">{fmtDate(instance.lastPlayed)}</span>
          <span className="ds-key">Ostatnio grane</span>
        </div>
        <div className="detail-stat">
          <span className="ds-val">{fmtDate(instance.createdAt)}</span>
          <span className="ds-key">Utworzono</span>
        </div>
      </div>

      {instance.serverAddress && (
        <div className="detail-server">🌐 Auto-dołączanie na serwer: <b>{instance.serverAddress}</b></div>
      )}

      <div className="detail-actions">
        {actions.map((a) => (
          <button className="detail-tile" key={a.label} onClick={a.onClick}>
            <span className="dt-ic">{a.icon}</span>
            {a.label}
          </button>
        ))}
        <button className="detail-tile danger" onClick={handleDelete}>
          <span className="dt-ic">🗑</span>
          Usuń instancję
        </button>
      </div>

      {showMods && (
        <ContentManagerModal
          instance={instance}
          kinds={['mod', 'resourcepack', 'shader']}
          onClose={() => setShowMods(false)}
        />
      )}
      {showConsole && <ConsoleModal instance={instance} onClose={() => setShowConsole(false)} />}
      {showEdit && <EditInstanceModal instance={instance} onClose={() => setShowEdit(false)} />}
      {showWorlds && <WorldsModal instance={instance} onClose={() => setShowWorlds(false)} />}
    </div>
  );
}
