import { useEffect, useState } from 'react';
import { Server, RefreshCw, Users, LogIn, Loader2, WifiOff, ChevronDown, UserPlus } from 'lucide-react';
import { InviteCreateModal } from './InviteCreateModal';
import { useStore } from '../store';
import { useLaunch } from '../hooks/useLaunch';
import { locale } from '../i18n';
import type { Instance, SavedServer, ServerPing } from '../../shared/types';

const SHOWN = 4;
const FRESH_MS = 60_000;

// Pings survive page switches for a minute, so Home doesn't re-ping on every visit.
const pingCache = new Map<string, { at: number; ping: ServerPing }>();

function latencyClass(ms?: number): string {
  if (ms === undefined) return '';
  return ms < 80 ? 'good' : ms < 180 ? 'ok' : 'slow';
}

function ServerRow({ server, ping, instance }: { server: SavedServer; ping?: ServerPing; instance?: Instance }) {
  const { launch, isLaunching, isRunning } = useLaunch(
    instance ?? ({ id: server.instanceId, name: server.instanceName } as Instance)
  );
  const icon = ping?.favicon ?? server.icon;
  const [inviting, setInviting] = useState(false);
  return (
    <div className={`server-row ${ping && !ping.online ? 'offline' : ''}`}>
      {icon ? (
        <img className="server-icon" src={icon} alt="" />
      ) : (
        <span className="server-icon placeholder">
          <Server size={18} />
        </span>
      )}
      <div className="server-info">
        <div className="server-name truncate">{server.name}</div>
        <div className="server-motd truncate" title={ping?.motd}>
          {ping ? (ping.online ? ping.motd?.replace(/\s*\n\s*/g, ' · ') || server.address : ping.error) : server.address}
        </div>
        <div className="server-via truncate">
          {server.address} · przez {server.instanceName}
        </div>
      </div>
      <div className="server-status">
        {!ping && <Loader2 size={14} className="spin text-faint" />}
        {ping?.online && (
          <>
            {ping.players && (
              <span className="server-players" title="Graczy online">
                <Users size={13} /> {ping.players.online.toLocaleString(locale())}
                <span className="text-faint">/{ping.players.max.toLocaleString(locale())}</span>
              </span>
            )}
            <span className={`server-latency ${latencyClass(ping.latency)}`} title="Opóźnienie">
              <i /> {ping.latency} ms
            </span>
          </>
        )}
        {ping && !ping.online && (
          <span className="server-latency down">
            <WifiOff size={13} /> offline
          </span>
        )}
      </div>
      <button
        className="ghost icon-btn"
        disabled={!instance}
        title="Zaproś znajomego na ten serwer"
        onClick={() => setInviting(true)}
      >
        <UserPlus size={15} />
      </button>
      {inviting && instance && (
        <InviteCreateModal
          instances={[instance]}
          address={server.address}
          name={server.name}
          onClose={() => setInviting(false)}
        />
      )}
      <button
        className="ghost btn-sm"
        disabled={!instance || isLaunching || isRunning}
        title={instance ? `Uruchom ${server.instanceName} i dołącz` : 'Instancja nie istnieje'}
        onClick={() => launch(undefined, server.address)}
      >
        {isLaunching ? <Loader2 size={14} className="spin" /> : <LogIn size={14} />} Dołącz
      </button>
    </div>
  );
}

/** Saved servers (auto-join + in-game lists) with live player counts and latency. */
export function HomeServers() {
  const instances = useStore((s) => s.instances);
  const [servers, setServers] = useState<SavedServer[] | null>(null);
  const [pings, setPings] = useState<Record<string, ServerPing>>({});
  const [all, setAll] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const pingAll = async (list: SavedServer[], force = false) => {
    setRefreshing(true);
    const now = Date.now();
    const cached: Record<string, ServerPing> = {};
    for (const s of list) {
      const c = pingCache.get(s.address);
      if (c && !force && now - c.at < FRESH_MS) cached[s.address] = c.ping;
    }
    setPings(cached);
    await Promise.all(
      list
        .filter((s) => !cached[s.address])
        .map(async (s) => {
          const ping = await window.api.savedServers.ping(s.address).catch(() => ({ online: false, error: 'Błąd' }));
          pingCache.set(s.address, { at: Date.now(), ping });
          setPings((p) => ({ ...p, [s.address]: ping }));
        })
    );
    setRefreshing(false);
  };

  useEffect(() => {
    window.api.savedServers.list().then((list) => {
      setServers(list);
      void pingAll(list);
    });
  }, []);

  if (!servers || servers.length === 0) return null;
  const shown = all ? servers : servers.slice(0, SHOWN);

  return (
    <div className="section home-servers">
      <h3>
        <Server size={16} /> Serwery
        <button
          className="ghost icon-btn section-action"
          title="Odśwież status"
          disabled={refreshing}
          onClick={() => pingAll(servers, true)}
        >
          <RefreshCw size={15} className={refreshing ? 'spin' : ''} />
        </button>
      </h3>
      <div className="server-list">
        {shown.map((s) => (
          <ServerRow
            key={s.address}
            server={s}
            ping={pings[s.address]}
            instance={instances.find((i) => i.id === s.instanceId)}
          />
        ))}
      </div>
      {servers.length > SHOWN && (
        <button className="ghost btn-sm show-more" onClick={() => setAll(!all)}>
          <ChevronDown size={14} className={all ? 'flip' : ''} />
          {all ? 'Pokaż mniej' : `Pokaż wszystkie (${servers.length})`}
        </button>
      )}
    </div>
  );
}
