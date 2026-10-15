import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Play, Square, Copy, Check, Eraser, Globe, Share2, SendHorizontal } from 'lucide-react';
import { useStore } from '../store';
import { useBackdropClose } from '../hooks/useBackdropClose';
import { alertDialog } from '../ui/feedback';
import { ModalHeader } from '../ui/ModalHeader';
import type { ServerInstance } from '../../shared/types';

export function ServerConsoleModal({ server, onClose }: { server: ServerInstance; onClose: () => void }) {
  const log = useStore((s) => s.serverLogs[server.id] ?? '');
  const status = useStore((s) => s.serverStatus[server.id]);
  const tunnel = useStore((s) => s.tunnels[server.id]);
  const clearServerLog = useStore((s) => s.clearServerLog);
  const [cmd, setCmd] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);

  const state = status?.state ?? 'stopped';
  const running = state === 'running' || state === 'starting';

  const tState = tunnel?.state ?? 'stopped';
  const tunnelBusy = tState === 'starting';
  const tunnelOn = tState === 'active';

  const copyAddress = () => {
    if (!tunnel?.address) return;
    navigator.clipboard.writeText(tunnel.address).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

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
    window.api.servers.command(server.id, cmd).catch((e) => alertDialog({ message: (e as Error).message, tone: 'error' }));
    setCmd('');
  };

  const backdrop = useBackdropClose(onClose);
  const stateLabel =
    state === 'running' ? 'Działa' : state === 'starting' ? 'Startuje…' : state === 'error' ? 'Błąd' : 'Zatrzymany';

  return createPortal(
    <div className="modal-backdrop" {...backdrop}>
      <div className="modal console-modal" onClick={(e) => e.stopPropagation()}>
        <ModalHeader
          title={`Konsola serwera — ${server.name}`}
          subtitle={
            <>
              <span className={`console-dot ${running ? 'on' : 'off'}`} />
              {stateLabel} · {server.mcVersion} · {server.loader} · port {server.port}
            </>
          }
          onClose={onClose}
        />

        <div className="console-toolbar">
          {running ? (
            <button className="danger" onClick={() => window.api.servers.stop(server.id)}>
              <Square size={14} fill="currentColor" /> Zatrzymaj
            </button>
          ) : (
            <button className="primary" onClick={() => window.api.servers.start(server.id).catch((e) => alertDialog({ message: (e as Error).message, tone: 'error' }))}>
              <Play size={16} fill="currentColor" /> Uruchom
            </button>
          )}
          <button className="ghost" onClick={() => navigator.clipboard.writeText(log).catch(() => {})} disabled={!log}>
            <Copy size={15} /> Kopiuj
          </button>
          <button className="ghost" onClick={() => clearServerLog(server.id)} disabled={!log}>
            <Eraser size={15} /> Wyczyść
          </button>
          <label className="check-row console-autoscroll">
            <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} />
            Auto-przewijanie
          </label>
        </div>

        <div className={`tunnel-bar ${tunnelOn ? 'on' : ''} ${tState === 'error' ? 'err' : ''}`}>
          <div className="tunnel-info">
            <Globe size={16} className="tunnel-globe" />
            {tunnelOn ? (
              <>
                <span className="tunnel-label">Publiczny adres:</span>
                <code className="tunnel-addr">{tunnel?.address}</code>
              </>
            ) : tunnelBusy ? (
              <span className="tunnel-label">Tworzę tunel… (pierwszy raz pobieram bore)</span>
            ) : tState === 'error' ? (
              <span className="tunnel-label">Błąd tunelu: {tunnel?.message ?? 'nieznany'}</span>
            ) : (
              <span className="tunnel-label">
                Udostępnij serwer znajomym bez przekierowania portów (tunel bore).
              </span>
            )}
          </div>
          <div className="tunnel-actions">
            {tunnelOn && (
              <button className="ghost" onClick={copyAddress}>
                {copied ? <Check size={15} /> : <Copy size={15} />}
                {copied ? 'Skopiowano' : 'Kopiuj adres'}
              </button>
            )}
            {tunnelOn || tunnelBusy ? (
              <button className="danger" onClick={() => window.api.servers.stopTunnel(server.id)}>
                Wyłącz tunel
              </button>
            ) : (
              <button
                className="primary"
                onClick={() => window.api.servers.startTunnel(server.id).catch((e) => alertDialog({ message: (e as Error).message, tone: 'error' }))}
              >
                <Share2 size={15} /> Udostępnij
              </button>
            )}
          </div>
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
            <SendHorizontal size={15} /> Wyślij
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
