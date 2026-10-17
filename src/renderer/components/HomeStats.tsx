import { useEffect, useState } from 'react';
import { Clock, CalendarRange, Trophy, Rocket, ChartColumn } from 'lucide-react';
import { useStore } from '../store';
import { formatPlaytime, plural } from '../format';
import { locale } from '../i18n';
import type { PlaySession } from '../../shared/types';

const DAY = 86_400_000;

function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "1h 20m", "35m", or "<1m" for tiny but non-zero values. */
const time = (ms: number) => formatPlaytime(ms) || (ms > 0 ? '<1m' : '0m');

/** Totals, most-played instance and the last 7 days of play time. */
export function HomeStats() {
  const instances = useStore((s) => s.instances);
  const [log, setLog] = useState<PlaySession[] | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    window.api.stats.playlog().then(setLog, () => setLog([]));
  }, [instances]);

  const total = instances.reduce((s, i) => s + (i.playtimeMs ?? 0), 0);
  const launches = instances.reduce((s, i) => s + (i.sessions ?? 0), 0);
  const top = [...instances].sort((a, b) => (b.playtimeMs ?? 0) - (a.playtimeMs ?? 0))[0];

  // Last 7 days, oldest → today; a session counts on the day it started.
  const today = startOfDay(Date.now());
  const days = Array.from({ length: 7 }, (_, i) => {
    const from = today - (6 - i) * DAY;
    const sessions = (log ?? []).filter((s) => s.start >= from && s.start < from + DAY);
    return { from, ms: sessions.reduce((a, s) => a + s.ms, 0), count: sessions.length };
  });
  const weekMs = days.reduce((a, d) => a + d.ms, 0);
  const weekCount = days.reduce((a, d) => a + d.count, 0);
  const max = Math.max(...days.map((d) => d.ms));
  const peak = max > 0 ? days.findIndex((d) => d.ms === max) : -1;

  const tiles = [
    { icon: Clock, label: 'Łączny czas gry', value: time(total) },
    {
      icon: CalendarRange,
      label: 'Ostatnie 7 dni',
      value: time(weekMs),
      sub: `${weekCount} ${plural(weekCount, 'sesja', 'sesje', 'sesji')}`
    },
    {
      icon: Trophy,
      label: 'Najczęściej grana',
      value: top?.playtimeMs ? top.name : '—',
      sub: top?.playtimeMs ? time(top.playtimeMs) : undefined
    },
    { icon: Rocket, label: 'Uruchomienia', value: String(launches) }
  ];

  return (
    <div className="section home-stats">
      <h3>
        <ChartColumn size={16} /> Statystyki
      </h3>
      <div className="stat-tiles">
        {tiles.map(({ icon: Icon, label, value, sub }) => (
          <div className="stat-tile" key={label}>
            <span className="stat-label">
              <Icon size={13} /> {label}
            </span>
            <span className="stat-value truncate" title={value}>
              {value}
            </span>
            {sub && <span className="stat-sub">{sub}</span>}
          </div>
        ))}
      </div>

      <div className="week-chart" role="img" aria-label={`Czas gry w ostatnich 7 dniach: ${time(weekMs)}`}>
        {days.map((d, i) => {
          const date = new Date(d.from);
          const label = date.toLocaleDateString(locale(), { weekday: 'short' });
          const h = max > 0 ? Math.max(d.ms > 0 ? 4 : 0, (d.ms / max) * 100) : 0;
          return (
            <div
              className={`week-col ${i === 6 ? 'today' : ''}`}
              key={d.from}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <div className="week-bar-area">
                {(hover === i || (hover === null && i === peak)) && d.ms > 0 && (
                  <span className="week-value" style={{ bottom: `${h}%` }}>
                    {time(d.ms)}
                  </span>
                )}
                {hover === i && (
                  <div className="week-tip">
                    <b>{date.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'short' })}</b>
                    <span>
                      {time(d.ms)} · {d.count} {plural(d.count, 'sesja', 'sesje', 'sesji')}
                    </span>
                  </div>
                )}
                <span className="week-bar" style={{ height: `${h}%` }} />
              </div>
              <span className="week-label">{i === 6 ? 'dziś' : label}</span>
            </div>
          );
        })}
      </div>
      {log !== null && log.length === 0 && (
        <div className="field-hint">Wykres zacznie się wypełniać po pierwszej sesji gry w tej wersji launchera.</div>
      )}
    </div>
  );
}
