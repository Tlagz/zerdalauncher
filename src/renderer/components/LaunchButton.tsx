import { Play, Square, Loader2 } from 'lucide-react';
import type { MouseEvent } from 'react';

/** "Graj" / "Uruchamianie…" / "Zatrzymaj" — one button for every place that starts a game. */
export function LaunchButton({
  isLaunching,
  isRunning,
  onPlay,
  onStop,
  className = '',
  iconSize = 16
}: {
  isLaunching: boolean;
  isRunning: boolean;
  onPlay: () => void;
  onStop: () => void;
  className?: string;
  iconSize?: number;
}) {
  const click = (fn: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  if (isRunning) {
    return (
      <button className={`danger ${className}`} onClick={click(onStop)} title="Zabij proces gry">
        <Square size={iconSize - 2} fill="currentColor" /> Zatrzymaj
      </button>
    );
  }
  return (
    <button className={`primary ${className}`} onClick={click(onPlay)} disabled={isLaunching}>
      {isLaunching ? (
        <>
          <Loader2 size={iconSize} className="spin" /> Uruchamianie…
        </>
      ) : (
        <>
          <Play size={iconSize} fill="currentColor" /> Graj
        </>
      )}
    </button>
  );
}
