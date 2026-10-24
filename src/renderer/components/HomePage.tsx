import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { Clock, CalendarDays, Earth, Globe, Palette, MousePointer2, ArrowRight, SlidersHorizontal } from 'lucide-react';
import { LaunchButton } from './LaunchButton';
import { useStore } from '../store';
import { useLaunch } from '../hooks/useLaunch';
import { InstanceIcon } from './InstanceIcon';
import { SkinView } from './SkinView';
import { SkinLibraryModal } from './SkinLibraryModal';
import { LauncherCard, MinecraftCard, NewReleaseBanner } from './HomeNews';
import { HomeCustomizeModal } from './HomeCustomizeModal';
import { resolveHome } from '../homeLayout';
import { HomeStats } from './HomeStats';
import { HomeServers } from './HomeServers';
import { HomeSztulagz } from './HomeSztulagz';
import { alertDialog } from '../ui/feedback';
import { formatDate, formatPlaytime } from '../format';
import { transition } from '../ui/viewTransition';
import type { HomeSectionId, Instance, WorldInfo } from '../../shared/types';

const WORLDS_PER_CARD = 3;

function RecentInstanceRow({ instance }: { instance: Instance }) {
  const { isLaunching, isRunning, launch, stop } = useLaunch(instance);
  const [worlds, setWorlds] = useState<WorldInfo[]>([]);

  useEffect(() => {
    window.api.worlds.list(instance.id).then(setWorlds);
  }, [instance.id]);

  const play = async (world?: string) => {
    try {
      await launch(world);
    } catch (e) {
      alertDialog({ title: 'Nie udało się uruchomić', message: (e as Error).message, tone: 'error' });
    }
  };

  const playtime = formatPlaytime(instance.playtimeMs);
  const lastPlayed = formatDate(instance.lastPlayed);

  return (
    <div className="home-recent-card">
      <div className="home-recent-head">
        <InstanceIcon instance={instance} />
        <div className="home-recent-title">
          <div className="instance-name truncate">{instance.name}</div>
          <div className="instance-meta">
            <span className="tag">{instance.mcVersion}</span>
            <span className={`tag ${instance.loader}`}>{instance.loader}</span>
          </div>
        </div>
      </div>
      {(playtime || lastPlayed) && (
        <div className="home-recent-stats">
          {playtime && (
            <span title="Czas gry">
              <Clock size={13} /> {playtime}
            </span>
          )}
          {lastPlayed && (
            <span title="Ostatnio grane">
              <CalendarDays size={13} /> {lastPlayed}
            </span>
          )}
        </div>
      )}
      {(worlds.length > 0 || instance.serverAddress) && (
        <div className="home-quickplay">
          <div className="home-quickplay-label">Szybki start</div>
          <div className="home-quickplay-list">
            {worlds.slice(0, WORLDS_PER_CARD).map((w) => (
              <button
                key={w.name}
                className="home-quickplay-chip"
                title="Uruchom prosto w tym świecie"
                disabled={isLaunching || isRunning}
                onClick={() => play(w.name)}
              >
                <Earth size={13} /> <span className="truncate">{w.name}</span>
              </button>
            ))}
            {instance.serverAddress && (
              <button
                className="home-quickplay-chip"
                title="Uruchom i dołącz do serwera"
                disabled={isLaunching || isRunning}
                onClick={() => play()}
              >
                <Globe size={13} /> <span className="truncate">{instance.serverAddress}</span>
              </button>
            )}
          </div>
        </div>
      )}
      <LaunchButton
        className="home-play"
        isLaunching={isLaunching}
        isRunning={isRunning}
        onPlay={() => play()}
        onStop={stop}
      />
    </div>
  );
}

export function HomePage() {
  const { instances, accounts, activeAccountId, setPage } = useStore();
  const active = accounts.find((a) => a.id === activeAccountId) ?? accounts[0];
  const home = resolveHome(useStore((s) => s.settings?.home));
  const [showSkins, setShowSkins] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const wantCustomize = useStore((s) => s.homeCustomize);

  // Opened from the command palette.
  useEffect(() => {
    if (!wantCustomize) return;
    setCustomizing(true);
    useStore.setState({ homeCustomize: false });
  }, [wantCustomize]);

  const recent = instances
    .filter((i) => i.lastPlayed)
    .sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))
    .slice(0, home.recentCount);

  const sections: Record<HomeSectionId, () => ReactNode> = {
    banner: () => <NewReleaseBanner />,
    sztulagz: () => <HomeSztulagz />,
    recent: () => (
      <div className="section">
        <h3>Ostatnio grane</h3>
        {recent.length === 0 ? (
          <div className="mod-empty">
            <p>Jeszcze nic nie grane.</p>
            <button className="ghost" onClick={() => transition(() => setPage('instances'))}>
              Przejdź do instancji <ArrowRight size={16} />
            </button>
          </div>
        ) : (
          <div className="home-recent-grid">
            {recent.map((i) => (
              <RecentInstanceRow key={i.id} instance={i} />
            ))}
          </div>
        )}
      </div>
    ),
    servers: () => <HomeServers />,
    stats: () => <HomeStats />,
    skin: () =>
      active && (
        <div className="section home-hero">
          <div className="skin-type">{active.type === 'microsoft' ? 'Microsoft · Premium' : 'Konto offline'}</div>
          <div className="skin-name">{active.username}</div>
          <div className="skin-stage">
            <SkinView account={active} key={active.id} width={150} height={210} />
          </div>
          <div className="skin-hint">
            <MousePointer2 size={13} /> Przeciągnij, aby obrócić
          </div>
          <button className="primary" onClick={() => setShowSkins(true)}>
            <Palette size={16} /> Biblioteka skinów
          </button>
        </div>
      ),
    launcher: () => <LauncherCard />,
    minecraft: () => <MinecraftCard />
  };

  const column = (ids: HomeSectionId[]) =>
    ids.filter((id) => !home.hidden.includes(id)).map((id) => <Fragment key={id}>{sections[id]()}</Fragment>);
  const main = column(home.main);
  const side = column(home.side);

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Start</div>
          <div className="page-subtitle">Twoja postać, ostatnio grane paczki i nowości</div>
        </div>
        <div className="header-actions">
          <button className="ghost" onClick={() => setCustomizing(true)}>
            <SlidersHorizontal size={16} /> Dostosuj
          </button>
        </div>
      </div>

      {showSkins && active && <SkinLibraryModal account={active} onClose={() => setShowSkins(false)} />}
      {customizing && <HomeCustomizeModal onClose={() => setCustomizing(false)} />}

      {main.length === 0 && side.length === 0 ? (
        <div className="section mod-empty">
          <p>Wszystkie sekcje strony Start są ukryte.</p>
          <button className="ghost" onClick={() => setCustomizing(true)}>
            <SlidersHorizontal size={16} /> Dostosuj Start
          </button>
        </div>
      ) : (
        <div className={`home-layout ${!main.length || !side.length ? 'single' : ''}`}>
          {main.length > 0 && <div className="home-main">{main}</div>}
          {side.length > 0 && <div className={`home-side ${!main.length ? 'wide' : ''}`}>{side}</div>}
        </div>
      )}
    </>
  );
}
