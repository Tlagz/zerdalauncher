import { useState } from 'react';
import { useStore } from '../store';
import { CreateServerModal } from './CreateServerModal';
import { ServerConsoleModal } from './ServerConsoleModal';
import { ServerPropsModal } from './ServerPropsModal';
import type { ServerInstance } from '../../shared/types';

function ServerCard({
  server,
  onConsole,
  onProps
}: {
  server: ServerInstance;
  onConsole: () => void;
  onProps: () => void;
}) {
  const { refreshServers } = useStore();
  const status = useStore((s) => s.serverStatus[server.id]);
  const [dragOver, setDragOver] = useState(false);
  const state = status?.state ?? 'stopped';
  const running = state === 'running' || state === 'starting';

  const loaderIcon = server.loader === 'fabric' ? '🧵' : '🧱';

  const toggle = () => {
    if (running) window.api.servers.stop(server.id);
    else window.api.servers.start(server.id).catch((e) => alert((e as Error).message));
  };

  const handleDelete = async () => {
    if (!confirm(`Usunąć serwer „${server.name}"? Cały folder serwera (świat, configi) przepadnie.`)) return;
    await window.api.servers.delete(server.id);
    await refreshServers();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const jars = (Array.from(e.dataTransfer.files) as Array<File & { path?: string }>)
      .map((f) => f.path)
      .filter((p): p is string => !!p && /\.jar$/i.test(p));
    if (jars.length === 0) return;
    if (server.loader !== 'fabric') {
      alert('Mody dodasz tylko na serwerze Fabric (Vanilla ich nie wczyta).');
      return;
    }
    await window.api.servers.addMods(server.id, jars);
    alert(`Dodano ${jars.length} mod(ów) do serwera „${server.name}".`);
  };

  return (
    <div
      className={`instance-card ${dragOver ? 'drag-over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!dragOver) setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
      }}
      onDrop={handleDrop}
    >
      {dragOver && <div className="card-drop">⬇ Upuść .jar (mody serwera)</div>}
      <div className={`instance-icon ${server.loader}`}>{loaderIcon}</div>
      <div className="instance-name">
        <span className={`console-dot ${running ? 'on' : 'off'}`} /> {server.name}
      </div>
      <div className="instance-meta">
        <span className="tag">{server.mcVersion}</span>
        <span className={`tag ${server.loader}`}>{server.loader}</span>
        <span className="tag">:{server.port}</span>
        <span className="tag">{server.ramMb} MB</span>
      </div>
      <div className="card-actions">
        <button className={running ? 'danger' : 'primary'} onClick={toggle}>
          {state === 'starting' ? 'Startuje…' : running ? '■ Zatrzymaj' : '▶ Uruchom'}
        </button>
        <div className="card-icons">
          <button onClick={onConsole} title="Konsola">
            🖥
          </button>
          <button onClick={onProps} title="Ustawienia (server.properties)">
            ⚙
          </button>
          <button onClick={() => window.api.servers.openFolder(server.id)} title="Otwórz folder">
            📁
          </button>
          <button className="danger" onClick={handleDelete} title="Usuń serwer">
            🗑
          </button>
        </div>
      </div>
    </div>
  );
}

export function ServersPage() {
  const { servers } = useStore();
  const [showCreate, setShowCreate] = useState(false);
  const [consoleFor, setConsoleFor] = useState<ServerInstance | null>(null);
  const [propsFor, setPropsFor] = useState<ServerInstance | null>(null);

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Serwery</div>
          <div className="page-subtitle">
            {servers.length === 0
              ? 'Postaw własny serwer Minecraft (Vanilla lub Fabric) w kilka sekund.'
              : `${servers.length} ${servers.length === 1 ? 'serwer' : 'serwery'}`}
          </div>
        </div>
        <div className="header-actions">
          <button className="primary" onClick={() => setShowCreate(true)}>
            + Nowy serwer
          </button>
        </div>
      </div>

      {servers.length === 0 ? (
        <div className="empty">
          <h2>Brak serwerów</h2>
          <p>
            Stwórz serwer — launcher pobierze <code>server.jar</code>, zaakceptuje EULA i pozwoli
            zarządzać nim z konsoli. Na Fabricu dorzucisz mody (przeciągnij .jar na kartę).
          </p>
          <div className="login-actions" style={{ marginTop: 16, justifyContent: 'center' }}>
            <button className="primary" onClick={() => setShowCreate(true)}>
              Stwórz serwer
            </button>
          </div>
        </div>
      ) : (
        <div className="instance-grid">
          {servers.map((srv) => (
            <ServerCard
              key={srv.id}
              server={srv}
              onConsole={() => setConsoleFor(srv)}
              onProps={() => setPropsFor(srv)}
            />
          ))}
        </div>
      )}

      {showCreate && <CreateServerModal onClose={() => setShowCreate(false)} />}
      {consoleFor && <ServerConsoleModal server={consoleFor} onClose={() => setConsoleFor(null)} />}
      {propsFor && <ServerPropsModal server={propsFor} onClose={() => setPropsFor(null)} />}
    </>
  );
}
