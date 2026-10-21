import { useEffect, useMemo, useState } from 'react';
import { Camera, RefreshCw } from 'lucide-react';
import { useStore } from '../store';
import { ScreenshotViewer } from './ScreenshotViewer';
import { plural } from '../format';
import { locale } from '../i18n';
import type { ScreenshotEntry } from '../../shared/types';

const DAY = 86_400_000;

function dayLabel(t: number): string {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (t >= start.getTime()) return 'Dziś';
  if (t >= start.getTime() - DAY) return 'Wczoraj';
  return new Date(t).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/** Every Minecraft screenshot from all instances, grouped by day. */
export function ScreenshotsPage() {
  const runningGames = useStore((s) => s.runningGames);
  const [shots, setShots] = useState<ScreenshotEntry[] | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [open, setOpen] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setShots(await window.api.screenshots.all());
    } finally {
      setLoading(false);
    }
  };
  // Reload when a game closes (new screenshots) and when the window regains focus.
  useEffect(() => {
    void load();
  }, [runningGames.length]);
  useEffect(() => {
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const byInstance = useMemo(() => {
    const m = new Map<string, { name: string; count: number }>();
    for (const s of shots ?? []) {
      const e = m.get(s.instanceId) ?? { name: s.instanceName ?? '?', count: 0 };
      e.count++;
      m.set(s.instanceId, e);
    }
    return [...m].sort((a, b) => b[1].count - a[1].count);
  }, [shots]);

  const visible = useMemo(
    () => (shots ?? []).filter((s) => filter === 'all' || s.instanceId === filter),
    [shots, filter]
  );
  const days = useMemo(() => {
    const out: Array<{ label: string; items: Array<{ shot: ScreenshotEntry; index: number }> }> = [];
    visible.forEach((shot, index) => {
      const label = dayLabel(shot.takenAt);
      if (out[out.length - 1]?.label !== label) out.push({ label, items: [] });
      out[out.length - 1].items.push({ shot, index });
    });
    return out;
  }, [visible]);

  const n = shots?.length ?? 0;

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Zrzuty ekranu</div>
          <div className="page-subtitle">
            {!shots
              ? 'Wczytuję…'
              : n === 0
                ? 'F2 w grze robi zrzut ekranu'
                : `${n} ${plural(n, 'zrzut', 'zrzuty', 'zrzutów')} · F2 w grze robi nowy`}
          </div>
        </div>
        <div className="header-actions">
          <button className="ghost" onClick={load} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'spin' : ''} /> Odśwież
          </button>
        </div>
      </div>

      {byInstance.length > 1 && (
        <div className="filter-chips">
          <button className={`chip ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
            Wszystkie <span className="chip-count">{n}</span>
          </button>
          {byInstance.map(([id, { name, count }]) => (
            <button key={id} className={`chip ${filter === id ? 'active' : ''}`} onClick={() => setFilter(id)}>
              {name} <span className="chip-count">{count}</span>
            </button>
          ))}
        </div>
      )}

      {shots && n === 0 && (
        <div className="empty">
          <Camera size={34} className="text-faint" />
          <h2>Brak zrzutów ekranu</h2>
          <p>Naciśnij F2 w grze, a zrzuty ze wszystkich instancji pojawią się tutaj.</p>
        </div>
      )}

      {days.map((d) => (
        <section className="shots-day" key={d.label}>
          <h3 className="shots-day-title">{d.label}</h3>
          <div className="shots-grid page">
            {d.items.map(({ shot, index }) => (
              <button
                className="shot-card"
                key={shot.instanceId + shot.name}
                onClick={() => setOpen(index)}
                title={shot.name}
              >
                <img src={window.api.screenshots.url(shot.instanceId, shot.name, true)} alt="" loading="lazy" />
                <span className="shot-meta">
                  {filter === 'all' && <b>{shot.instanceName}</b>}
                  {new Date(shot.takenAt).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })}
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}

      {open !== null && (
        <ScreenshotViewer
          shots={visible}
          index={open}
          onIndex={setOpen}
          onDeleted={(gone) => {
            const next = (shots ?? []).filter((s) => s !== gone);
            setShots(next);
            const left = visible.length - 1;
            setOpen(left ? Math.min(open, left - 1) : null);
          }}
        />
      )}
    </>
  );
}
