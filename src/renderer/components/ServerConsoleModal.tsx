import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Play, Square, Copy, Check, Eraser, Globe, Share2, SendHorizontal, Loader2, ExternalLink, UserPlus } from 'lucide-react';
import { InviteCreateModal } from './InviteCreateModal';
import { openExternal } from '../links';
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
  const [inviting, setInviting] = useState(false);
  // Client instances that can join this server (same Minecraft version and loader).
  const instances = useStore((s) => s.instances);
  const joinable = instances.filter((i) => i.mcVersion === server.mcVersion && i.loader === server.loader);
  const preRef = useRef<HTMLPreElement>(null);

  const state = status?.state ?? 'stopped';
  const running = state === 'running' || state === 'starting';

  const tState = tunnel?.state ?? 'stopped';
  const tunnelBusy = tState === 'starting' || tState === 'claim';
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
                <span className="tunnel-label">
                  {tunnel?.method === 'upnp' ? 'Adres (bezpośrednio, UPnP):' : 'Adres (przez playit.gg):'}
                </span>
                <code className="tunnel-addr">{tunnel?.address}</code>
              </>
            ) : tState === 'claim' ? (
              <span className="tunnel-label">{tunnel?.message}</span>
            ) : tState === 'starting' ? (
              <span className="tunnel-label">
                <Loader2 size={14} className="spin" /> {tunnel?.message ?? 'Uruchamiam udostępnianie…'}
              </span>
            ) : tState === 'error' ? (
              <span className="tunnel-label">Nie udało się udostępnić: {tunnel?.message ?? 'nieznany błąd'}</span>
            ) : (
              <span className="tunnel-label">
                Udostępnij serwer znajomym — launcher sam otworzy port na routerze, a gdy się nie da, użyje playit.gg.
              </span>
            )}
          </div>
          <div className="tunnel-actions">
            {tState === 'claim' && tunnel?.claimUrl && (
              <button className="primary" onClick={() => openExternal(tunnel.claimUrl!)}>
                <ExternalLink size={15} /> Otwórz playit.gg
              </button>
            )}
            {tunnelOn && (
              <button
                className="ghost"
                disabled={!joinable.length}
                title={joinable.length ? 'Link z Twoimi modami, który od razu wpuści znajomego' : `Najpierw utwórz instancję ${server.mcVersion} ${server.loader}`}
                onClick={() => setInviting(true)}
              >
                <UserPlus size={15} /> Zaproś
              </button>
            )}
            {tunnelOn && (
              <button className="ghost" onClick={copyAddress}>
                {copied ? <Check size={15} /> : <Copy size={15} />}
                {copied ? 'Skopiowano' : 'Kopiuj adres'}
              </button>
            )}
            {tunnelOn || tunnelBusy ? (
              <button className="danger" onClick={() => window.api.servers.stopTunnel(server.id)}>
                {tunnelOn ? 'Przestań udostępniać' : 'Anuluj'}
              </button>
            ) : (
              <button
                className="primary"
                // Failures are shown in the bar itself (status 'error').
                onClick={() => window.api.servers.startTunnel(server.id).catch(() => {})}
              >
                <Share2 size={15} /> Udostępnij
              </button>
            )}
          </div>
        </div>

        {tunnelOn && tunnel?.method === 'upnp' && (
          <div className="field-hint tunnel-hint">
            Jeśli znajomi nie mogą wejść, zezwól Javie na połączenia w Zaporze Windows (okno pojawia się przy
            pierwszym starcie serwera).
          </div>
        )}

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
      {inviting && tunnel?.address && (
        <InviteCreateModal
          instances={joinable}
          address={tunnel.address}
          name={server.name}
          onClose={() => setInviting(false)}
        />
      )}
    </div>,
    document.body
  );
}
