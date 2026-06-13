import { useState } from 'react';
import { useStore } from '../store';
import { useLaunch } from '../hooks/useLaunch';
import { InstanceIcon } from './InstanceIcon';
import { alertDialog, showToast } from '../ui/feedback';
import type { Instance } from '../../shared/types';

function fmtPlaytime(ms?: number): string {
  if (!ms || ms < 60000) return '';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function InstanceCard({ instance, onOpen }: { instance: Instance; onOpen: () => void }) {
  const { refreshInstances } = useStore();
  const { isLaunching, launch } = useLaunch(instance);
  const [dragOver, setDragOver] = useState(false);

  const togglePin = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await window.api.instances.update(instance.id, { pinned: !instance.pinned });
    await refreshInstances();
  };

  // Drag & drop local files: .jar -> mods, .zip -> resourcepacks.
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files) as Array<File & { path?: string }>;
    const paths = files.map((f) => f.path).filter(Boolean) as string[];
    const jars = paths.filter((p) => /\.jar$/i.test(p));
    const zips = paths.filter((p) => /\.zip$/i.test(p));
    if (jars.length === 0 && zips.length === 0) {
      showToast('Upuść pliki .jar (mody) lub .zip (resource packi).', 'info');
      return;
    }
    try {
      const added: string[] = [];
      if (jars.length) {
        await window.api.mods.addLocal(instance.id, 'mod', jars);
        added.push(`${jars.length} × mod`);
      }
      if (zips.length) {
        await window.api.mods.addLocal(instance.id, 'resourcepack', zips);
        added.push(`${zips.length} × resource pack`);
      }
      showToast(`Dodano do „${instance.name}": ${added.join(', ')}.`, 'success');
    } catch (err) {
      alertDialog({ message: (err as Error).message, tone: 'error' });
    }
  };

  return (
    <div
      className={`instance-card clickable ${isLaunching ? 'launching' : ''} ${dragOver ? 'drag-over' : ''}`}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!dragOver) setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
      }}
      onDrop={handleDrop}
    >
      {dragOver && <div className="card-drop">⬇ Upuść .jar / .zip, aby dodać</div>}
      <button
        className={`card-pin ${instance.pinned ? 'pinned' : ''}`}
        title={instance.pinned ? 'Odepnij' : 'Przypnij na górę'}
        onClick={togglePin}
      >
        {instance.pinned ? '★' : '☆'}
      </button>
      <span className="card-chevron">›</span>
      <InstanceIcon instance={instance} />
      <div className="instance-name">{instance.name}</div>
      <div className="instance-meta">
        <span className="tag">{instance.mcVersion}</span>
        <span className={`tag ${instance.loader}`}>{instance.loader}</span>
        <span className="tag">{instance.ramMb} MB</span>
      </div>
      {(fmtPlaytime(instance.playtimeMs) || instance.serverAddress) && (
        <div className="instance-stats">
          {fmtPlaytime(instance.playtimeMs) && <span>⏱ {fmtPlaytime(instance.playtimeMs)}</span>}
          {instance.sessions ? <span>🎮 {instance.sessions}×</span> : null}
          {instance.serverAddress && <span>🌐</span>}
        </div>
      )}
      <div className="card-actions">
        <button
          className="primary"
          onClick={(e) => {
            e.stopPropagation();
            launch();
          }}
          disabled={isLaunching}
        >
          {isLaunching ? 'Uruchamianie…' : '▶ Graj'}
        </button>
      </div>
    </div>
  );
}
