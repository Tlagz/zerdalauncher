import { useState } from 'react';
import { useStore } from '../store';
import { ContentManagerModal } from './ContentManagerModal';
import { ConsoleModal } from './ConsoleModal';
import { EditInstanceModal } from './EditInstanceModal';
import type { Instance } from '../../shared/types';

export function InstanceCard({ instance }: { instance: Instance }) {
  const { refreshInstances, launchStatus } = useStore();
  const [busy, setBusy] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const [showConsole, setShowConsole] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const isLaunching =
    busy ||
    (launchStatus?.instanceId === instance.id &&
      ['preparing', 'downloading', 'launching'].includes(launchStatus.state));

  const handleLaunch = async () => {
    setBusy(true);
    try {
      await window.api.mc.launch(instance.id);
      await refreshInstances();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (
      !confirm(
        `Usunąć instancję "${instance.name}"?\n\nUWAGA: usunięty zostanie cały folder instancji — mody, configi, światy i zapisy przepadną bezpowrotnie.`
      )
    )
      return;
    try {
      await window.api.instances.delete(instance.id);
      await refreshInstances();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const handleExport = async () => {
    try {
      const dest = await window.api.modpacks.export(instance.id);
      if (dest) alert(`Wyeksportowano paczkę:\n${dest}`);
    } catch (e) {
      alert((e as Error).message);
    }
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
      alert('Upuść pliki .jar (mody) lub .zip (resource packi).');
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
      alert(`Dodano do instancji „${instance.name}": ${added.join(', ')}.`);
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const loaderIcon =
    instance.loader === 'fabric'
      ? '🧵'
      : instance.loader === 'forge'
      ? '⚙️'
      : instance.loader === 'neoforge'
      ? '🔥'
      : '🧱';

  const customIcon = instance.icon?.trim();
  const iconIsImage = !!customIcon && /^(data:|https?:|file:)/.test(customIcon);

  return (
    <div
      className={`instance-card ${isLaunching ? 'launching' : ''} ${dragOver ? 'drag-over' : ''}`}
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
      <div className={`instance-icon ${instance.loader}`}>
        {customIcon ? (
          iconIsImage ? (
            <img className="instance-icon-img" src={customIcon} alt="" />
          ) : (
            customIcon
          )
        ) : (
          loaderIcon
        )}
      </div>
      <div className="instance-name">{instance.name}</div>
      <div className="instance-meta">
        <span className="tag">{instance.mcVersion}</span>
        <span className={`tag ${instance.loader}`}>{instance.loader}</span>
        <span className="tag">{instance.ramMb} MB</span>
      </div>
      <div className="card-actions">
        <button className="primary" onClick={handleLaunch} disabled={isLaunching}>
          {isLaunching ? 'Uruchamianie…' : 'Graj'}
        </button>
        <div className="card-icons">
          <button onClick={() => setShowContent(true)} title="Mody, resource packi, shadery">
            🧩
          </button>
          <button onClick={() => setShowConsole(true)} title="Konsola (logi gry)">
            🖥
          </button>
          <button onClick={() => setShowEdit(true)} title="Ustawienia (Java, RAM, ikona)">
            ⚙
          </button>
          <button onClick={handleExport} title="Eksportuj paczkę (.zerda)">
            📦
          </button>
          <button onClick={() => window.api.instances.openFolder(instance.id)} title="Otwórz folder">
            📁
          </button>
          <button className="danger" onClick={handleDelete} title="Usuń instancję">
            🗑
          </button>
        </div>
      </div>

      {showContent && (
        <ContentManagerModal
          instance={instance}
          kinds={['mod', 'resourcepack', 'shader']}
          onClose={() => setShowContent(false)}
        />
      )}
      {showConsole && <ConsoleModal instance={instance} onClose={() => setShowConsole(false)} />}
      {showEdit && <EditInstanceModal instance={instance} onClose={() => setShowEdit(false)} />}
    </div>
  );
}
