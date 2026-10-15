import { useState } from 'react';
import {
  ArrowLeft,
  Puzzle,
  Terminal,
  Earth,
  SlidersHorizontal,
  Copy,
  Star,
  Package,
  FolderOpen,
  Trash2,
  Globe,
  type LucideIcon
} from 'lucide-react';
import { useStore } from '../store';
import { useLaunch } from '../hooks/useLaunch';
import { InstanceIcon } from './InstanceIcon';
import { LaunchButton } from './LaunchButton';
import { ContentManagerModal } from './ContentManagerModal';
import { ConsoleModal } from './ConsoleModal';
import { EditInstanceModal } from './EditInstanceModal';
import { WorldsModal } from './WorldsModal';
import { confirmDialog, alertDialog, showToast } from '../ui/feedback';
import { formatDate, formatPlaytime } from '../format';
import type { Instance } from '../../shared/types';

export function InstanceDetail({ instance, onBack }: { instance: Instance; onBack: () => void }) {
  const { refreshInstances } = useStore();
  const { isLaunching, isRunning, launch, stop } = useLaunch(instance);
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

  const actions: Array<{ icon: LucideIcon; label: string; onClick: () => void; filled?: boolean }> = [
    { icon: Puzzle, label: 'Mody, packi, shadery', onClick: () => setShowMods(true) },
    { icon: Terminal, label: 'Konsola (logi gry)', onClick: () => setShowConsole(true) },
    { icon: Earth, label: 'Światy i kopie', onClick: () => setShowWorlds(true) },
    { icon: SlidersHorizontal, label: 'Ustawienia instancji', onClick: () => setShowEdit(true) },
    { icon: Copy, label: 'Duplikuj instancję', onClick: handleDuplicate },
    {
      icon: Star,
      label: instance.pinned ? 'Odepnij z góry' : 'Przypnij na górę',
      onClick: togglePin,
      filled: instance.pinned
    },
    { icon: Package, label: 'Eksportuj .zerda', onClick: handleExport },
    { icon: FolderOpen, label: 'Otwórz folder', onClick: () => window.api.instances.openFolder(instance.id) }
  ];

  return (
    <div className="detail-fade">
      <button className="ghost detail-back" onClick={onBack}>
        <ArrowLeft size={16} /> Wróć do instancji
      </button>

      <div className="detail-header">
        <InstanceIcon instance={instance} className="detail-icon" morph />
        <div className="detail-head-info">
          <div className="detail-name">{instance.name}</div>
          <div className="instance-meta detail-meta">
            <span className="tag">{instance.mcVersion}</span>
            <span className={`tag ${instance.loader}`}>{instance.loader}</span>
            {instance.loaderVersion && <span className="tag">{instance.loaderVersion}</span>}
            <span className="tag">{instance.ramMb} MB</span>
          </div>
        </div>
        <LaunchButton
          className="detail-play"
          iconSize={18}
          isLaunching={isLaunching}
          isRunning={isRunning}
          onPlay={() => launch()}
          onStop={stop}
        />
      </div>

      <div className="detail-statgrid">
        <div className="detail-stat">
          <span className="ds-val">{formatPlaytime(instance.playtimeMs) || '—'}</span>
          <span className="ds-key">Czas gry</span>
        </div>
        <div className="detail-stat">
          <span className="ds-val">{instance.sessions ?? 0}</span>
          <span className="ds-key">Uruchomień</span>
        </div>
        <div className="detail-stat">
          <span className="ds-val">{formatDate(instance.lastPlayed) || '—'}</span>
          <span className="ds-key">Ostatnio grane</span>
        </div>
        <div className="detail-stat">
          <span className="ds-val">{formatDate(instance.createdAt) || '—'}</span>
          <span className="ds-key">Utworzono</span>
        </div>
      </div>

      {instance.serverAddress && (
        <div className="detail-server">
          <Globe size={15} /> Auto-dołączanie na serwer: <b>{instance.serverAddress}</b>
        </div>
      )}

      <div className="detail-actions">
        {actions.map(({ icon: Icon, label, onClick, filled }) => (
          <button className="detail-tile" key={label} onClick={onClick}>
            <Icon className="dt-ic" fill={filled ? 'currentColor' : 'none'} />
            {label}
          </button>
        ))}
        <button className="detail-tile danger" onClick={handleDelete}>
          <Trash2 className="dt-ic" />
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
