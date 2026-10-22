import { useEffect, useState } from 'react';
import { Clock, CalendarDays, Earth, Globe, Palette, MousePointer2, ArrowRight } from 'lucide-react';
import { LaunchButton } from './LaunchButton';
import { useStore } from '../store';
import { useLaunch } from '../hooks/useLaunch';
import { InstanceIcon } from './InstanceIcon';
import { SkinView } from './SkinView';
import { SkinLibraryModal } from './SkinLibraryModal';
import { HomeNews, NewReleaseBanner } from './HomeNews';
import { HomeStats } from './HomeStats';
import { HomeServers } from './HomeServers';
import { HomeSztulagz } from './HomeSztulagz';
import { alertDialog } from '../ui/feedback';
import { formatDate, formatPlaytime } from '../format';
import { transition } from '../ui/viewTransition';
import type { Instance, WorldInfo } from '../../shared/types';

const RECENT_LIMIT = 2;
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
  const [showSkins, setShowSkins] = useState(false);

  const recent = instances
    .filter((i) => i.lastPlayed)
    .sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))
    .slice(0, RECENT_LIMIT);

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Start</div>
          <div className="page-subtitle">Twoja postać, ostatnio grane paczki i nowości</div>
        </div>
      </div>

      {showSkins && active && <SkinLibraryModal account={active} onClose={() => setShowSkins(false)} />}

      <div className="home-layout">
        <div className="home-main">
          <NewReleaseBanner />
          <HomeSztulagz />
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
          <HomeServers />
          <HomeStats />
        </div>

        <div className="home-side">
          {active && (
            <div className="section home-hero">
              <div className="skin-type">
                {active.type === 'microsoft' ? 'Microsoft · Premium' : 'Konto offline'}
              </div>
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
          )}
          <HomeNews />
        </div>
      </div>
    </>
  );
}
