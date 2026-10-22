import { useEffect, useState } from 'react';
import { Crown, Users, Play, Loader2, WifiOff, Download, RefreshCw } from 'lucide-react';
import { useStore } from '../store';
import { useLaunch } from '../hooks/useLaunch';
import { alertDialog, showToast } from '../ui/feedback';
import type { CatalogPack, Instance, ServerPing } from '../../shared/types';

function PlayButton({ pack, instance }: { pack: CatalogPack; instance?: Instance }) {
  const { launch, isLaunching, isRunning } = useLaunch(instance ?? ({ id: '', name: pack.name } as Instance));
  const [installing, setInstalling] = useState<string | null>(null);

  useEffect(() => window.api.modpacks.onProgress((p) => installing && setInstalling(p.message)), [installing]);

  if (instance) {
    // useLaunch checks for a newer (or required) pack version first.
    return (
      <button className="primary" disabled={isLaunching || isRunning} onClick={() => launch(undefined, pack.server)}>
        {isLaunching ? <Loader2 size={15} className="spin" /> : <Play size={15} />} {isRunning ? 'Gra działa' : 'Graj'}
      </button>
    );
  }
  return (
    <button
      className="primary"
      disabled={!!installing}
      title={installing ?? undefined}
      onClick={async () => {
        setInstalling('Instaluję…');
        try {
          const id = await window.api.packs.install(pack.id);
          await useStore.getState().refreshInstances();
          showToast(`Zainstalowano „${pack.name}”.`, 'success');
          await window.api.mc.launch(id, { server: pack.server });
        } catch (e) {
          alertDialog({ title: 'Coś poszło nie tak', message: (e as Error).message, tone: 'error' });
        } finally {
          setInstalling(null);
        }
      }}
    >
      {installing ? <Loader2 size={15} className="spin" /> : <Download size={15} />} {installing ? 'Instaluję…' : 'Zainstaluj i graj'}
    </button>
  );
}

/** The Sztulagz server(s) from the packs: live status, who's online and one-click play. */
export function HomeSztulagz() {
  const instances = useStore((s) => s.instances);
  const [packs, setPacks] = useState<CatalogPack[]>([]);
  const [pings, setPings] = useState<Record<string, ServerPing | undefined>>({});
  const [refreshing, setRefreshing] = useState(false);

  // One entry per server address (featured pack first).
  const servers = packs.filter((p, i, all) => p.server && all.findIndex((q) => q.server === p.server) === i);

  const ping = async (list: CatalogPack[]) => {
    setRefreshing(true);
    await Promise.all(
      list.map(async (p) => {
        const r = await window.api.savedServers.ping(p.server!).catch(() => ({ online: false }) as ServerPing);
        setPings((s) => ({ ...s, [p.server!]: r }));
      })
    );
    setRefreshing(false);
  };

  useEffect(() => {
    window.api.packs.list().then(
      (list) => {
        const visible = list.filter((p) => !p.hidden && p.server);
        setPacks(visible);
        void ping(visible.filter((p, i, all) => all.findIndex((q) => q.server === p.server) === i));
      },
      () => setPacks([])
    );
  }, []);
  // Live-ish: refresh player counts every minute while Home is open.
  useEffect(() => {
    if (!servers.length) return;
    const t = setInterval(() => void ping(servers), 60_000);
    return () => clearInterval(t);
  }, [servers.length]);

  if (!servers.length) return null;

  return (
    <div className="section sztulagz-tile">
      <h3>
        <Crown size={16} /> Serwer Sztulagz
        <button className="ghost icon-btn section-action" title="Odśwież status" disabled={refreshing} onClick={() => ping(servers)}>
          <RefreshCw size={15} className={refreshing ? 'spin' : ''} />
        </button>
      </h3>
      {servers.map((p) => {
        const s = pings[p.server!];
        const installed = instances.find((i) => i.pack?.id === p.id);
        return (
          <div
            className="sztulagz-server"
            key={p.server}
            style={p.accent ? ({ '--pack-accent': p.accent } as React.CSSProperties) : undefined}
          >
            {p.banner && <div className="sztulagz-banner" style={{ backgroundImage: `url("${p.banner}")` }} />}
            <div className="sztulagz-head">
              {s?.favicon || p.icon ? (
                <img className="server-icon" src={s?.favicon ?? p.icon} alt="" />
              ) : (
                <span className="server-icon placeholder">
                  <Crown size={18} />
                </span>
              )}
              <div className="server-info">
                <div className="server-name truncate" data-no-i18n>
                  {p.name}
                </div>
                <div className="server-via truncate" data-no-i18n>
                  {p.server}
                </div>
              </div>
              <div className={`sztulagz-status ${!s ? '' : s.online ? 'on' : 'off'}`}>
                {!s ? (
                  <Loader2 size={14} className="spin" />
                ) : s.online ? (
                  <>
                    <i /> Online · {s.latency} ms
                  </>
                ) : (
                  <>
                    <WifiOff size={13} /> Offline
                  </>
                )}
              </div>
            </div>
            {s?.online && s.motd && (
              <div className="server-motd sztulagz-motd" data-no-i18n>
                {s.motd.replace(/\s*\n\s*/g, ' · ')}
              </div>
            )}
            {s?.online && s.players && (
              <div className="sztulagz-players">
                <span className="sztulagz-count">
                  <Users size={14} /> {s.players.online} / {s.players.max}
                </span>
                {!!s.players.names?.length && (
                  <div className="sztulagz-names" data-no-i18n>
                    {s.players.names.map((n) => (
                      <span className="sztulagz-player" key={n} title={n}>
                        <img src={`https://mc-heads.net/avatar/${encodeURIComponent(n)}/20`} alt="" loading="lazy" />
                        {n}
                      </span>
                    ))}
                    {s.players.online > s.players.names.length && (
                      <span className="text-faint">+{s.players.online - s.players.names.length}</span>
                    )}
                  </div>
                )}
              </div>
            )}
            <div className="sztulagz-actions">
              <PlayButton pack={p} instance={installed} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
