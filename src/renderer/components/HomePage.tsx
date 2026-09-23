import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { useLaunch } from '../hooks/useLaunch';
import { InstanceIcon } from './InstanceIcon';
import { SkinView } from './SkinView';
import { SkinLibraryModal } from './SkinLibraryModal';
import { alertDialog } from '../ui/feedback';
import type { Instance, WorldInfo } from '../../shared/types';

const RECENT_LIMIT = 6;
const WORLDS_PER_CARD = 3;

function fmtPlaytime(ms?: number): string {
  if (!ms || ms < 60000) return '';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function fmtDate(ms?: number): string {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' });
}

function RecentInstanceRow({ instance }: { instance: Instance }) {
  const { isLaunching, launch } = useLaunch(instance);
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

  return (
    <div className="mod-row home-recent-row">
      <InstanceIcon instance={instance} />
      <div className="mod-info">
        <div className="mod-title">{instance.name}</div>
        <div className="mod-sub">
          {instance.mcVersion} · {instance.loader}
          {fmtPlaytime(instance.playtimeMs) && ` · ⏱ ${fmtPlaytime(instance.playtimeMs)}`}
          {fmtDate(instance.lastPlayed) && ` · ostatnio: ${fmtDate(instance.lastPlayed)}`}
        </div>
        {(worlds.length > 0 || instance.serverAddress) && (
          <div className="home-quickplay-list">
            {worlds.slice(0, WORLDS_PER_CARD).map((w) => (
              <button key={w.name} className="ghost home-quickplay-chip" disabled={isLaunching} onClick={() => play(w.name)}>
                🌍 {w.name}
              </button>
            ))}
            {instance.serverAddress && (
              <button className="ghost home-quickplay-chip" disabled={isLaunching} onClick={() => play()}>
                🌐 {instance.serverAddress}
              </button>
            )}
          </div>
        )}
      </div>
      <button className="primary" disabled={isLaunching} onClick={() => play()}>
        {isLaunching ? 'Uruchamianie…' : '▶ Graj'}
      </button>
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
          <div className="page-subtitle">Twoja postać i ostatnio grane paczki</div>
        </div>
      </div>

      {active && (
        <div className="section skin-section">
          <div className="skin-stage">
            <SkinView account={active} key={active.id} />
          </div>
          <div className="skin-info">
            <div className="skin-name">{active.username}</div>
            <div className="skin-type">
              {active.type === 'microsoft' ? 'Microsoft · Premium' : 'Konto offline'}
            </div>
            <div className="skin-hint">🖱️ Przeciągnij, aby obrócić postać</div>
            <button className="primary" style={{ marginTop: 14 }} onClick={() => setShowSkins(true)}>
              🎨 Biblioteka skinów
            </button>
          </div>
        </div>
      )}

      {showSkins && active && <SkinLibraryModal account={active} onClose={() => setShowSkins(false)} />}

      <div className="section">
        <h3>Ostatnio grane</h3>
        {recent.length === 0 ? (
          <div className="mod-empty">
            Jeszcze nic nie grane.{' '}
            <button className="ghost" onClick={() => setPage('instances')}>
              Przejdź do instancji →
            </button>
          </div>
        ) : (
          <div className="mod-list">
            {recent.map((i) => (
              <RecentInstanceRow key={i.id} instance={i} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
