import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store';
import type { ServerInstance } from '../../shared/types';

export function ServerConsoleModal({ server, onClose }: { server: ServerInstance; onClose: () => void }) {
  const log = useStore((s) => s.serverLogs[server.id] ?? '');
  const status = useStore((s) => s.serverStatus[server.id]);
  const clearServerLog = useStore((s) => s.clearServerLog);
  const [cmd, setCmd] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const preRef = useRef<HTMLPreElement>(null);

  const state = status?.state ?? 'stopped';
  const running = state === 'running' || state === 'starting';

  useEffect(() => {
    if (autoScroll && preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight;
  }, [log, autoScroll]);

  const onScroll = () => {
    const el = preRef.current;
    if (!el) return;
    setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 24);
  };

  const send = () => {
    if (!cmd.trim()) return;
    window.api.servers.command(server.id, cmd).catch((e) => alert((e as Error).message));
    setCmd('');
  };

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal console-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mod-modal-head">
          <div>
            <h3 style={{ margin: 0 }}>Konsola serwera — {server.name}</h3>
            <div style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 4 }}>
              <span className={`console-dot ${running ? 'on' : 'off'}`} />
              {state === 'running'
                ? 'Działa'
                : state === 'starting'
                ? 'Startuje…'
                : state === 'error'
                ? 'Błąd'
                : 'Zatrzymany'}{' '}
              · {server.mcVersion} · {server.loader} · port {server.port}
            </div>
          </div>
          <button className="ghost" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="console-toolbar">
          {running ? (
            <button className="danger" onClick={() => window.api.servers.stop(server.id)}>
              ■ Zatrzymaj
            </button>
          ) : (
            <button className="primary" onClick={() => window.api.servers.start(server.id).catch((e) => alert((e as Error).message))}>
              ▶ Uruchom
            </button>
          )}
          <button className="ghost" onClick={() => navigator.clipboard.writeText(log).catch(() => {})} disabled={!log}>
            📋 Kopiuj
          </button>
          <button className="ghost" onClick={() => clearServerLog(server.id)} disabled={!log}>
            🧹 Wyczyść
          </button>
          <label className="console-autoscroll">
            <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} />
            Auto-przewijanie
          </label>
        </div>

        <pre ref={preRef} className="console-output" onScroll={onScroll}>
          {log || 'Serwer nie był jeszcze uruchamiany. Kliknij „Uruchom".'}
        </pre>

        <div className="server-cmd">
          <input
            placeholder={running ? 'Wpisz komendę (np. say cześć, op gracz, weather clear)…' : 'Uruchom serwer, aby wpisywać komendy'}
            value={cmd}
            disabled={!running}
            onChange={(e) => setCmd(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') send();
            }}
          />
          <button className="primary" onClick={send} disabled={!running || !cmd.trim()}>
            Wyślij
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
