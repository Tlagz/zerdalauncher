import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store';
import type { Instance } from '../../shared/types';

// Telltale signs that the game crashed rather than exiting cleanly.
const CRASH_RE =
  /---- Minecraft Crash Report ----|Exception in thread "main"|A fatal error has been detected by the Java Runtime Environment|#\s*EXCEPTION_ACCESS_VIOLATION|Could not create the Java Virtual Machine|Failed to start the minecraft|java\.lang\.[A-Za-z]*Error/;

export function ConsoleModal({ instance, onClose }: { instance: Instance; onClose: () => void }) {
  const log = useStore((s) => s.logs[instance.id] ?? '');
  const clearLogs = useStore((s) => s.clearLogs);
  const launchStatus = useStore((s) => s.launchStatus);
  const [autoScroll, setAutoScroll] = useState(true);
  const preRef = useRef<HTMLPreElement>(null);

  // Keep the view pinned to the newest output unless the user scrolled up.
  useEffect(() => {
    if (autoScroll && preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight;
    }
  }, [log, autoScroll]);

  const onScroll = () => {
    const el = preRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    setAutoScroll(atBottom);
  };

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(log);
    } catch {
      /* clipboard may be unavailable */
    }
  };

  const running =
    launchStatus?.instanceId === instance.id &&
    ['preparing', 'downloading', 'launching', 'running'].includes(launchStatus.state);

  const crashed = useMemo(() => !!log && CRASH_RE.test(log), [log]);

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal console-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mod-modal-head">
          <div>
            <h3 style={{ margin: 0 }}>Konsola — {instance.name}</h3>
            <div style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 4 }}>
              <span className={`console-dot ${running ? 'on' : 'off'}`} />
              {running ? 'Gra działa' : 'Zatrzymana'} · {instance.mcVersion} · {instance.loader}
            </div>
          </div>
          <button className="ghost" onClick={onClose}>
            ✕
          </button>
        </div>

        {crashed && (
          <div className="console-crash">
            <span>⚠ Wygląda na to, że gra się wysypała — szczegóły w logu i pliku crash-report.</span>
            <div className="console-crash-actions">
              <button className="ghost" onClick={copyAll}>
                📋 Kopiuj log
              </button>
              <button className="ghost" onClick={() => window.api.instances.openCrashReports(instance.id)}>
                📂 crash-reports
              </button>
            </div>
          </div>
        )}

        <div className="console-toolbar">
          <button className="ghost" onClick={copyAll} disabled={!log}>
            📋 Kopiuj
          </button>
          <button className="ghost" onClick={() => clearLogs(instance.id)} disabled={!log}>
            🧹 Wyczyść
          </button>
          <label className="console-autoscroll">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
            />
            Auto-przewijanie
          </label>
        </div>

        <pre ref={preRef} className="console-output" onScroll={onScroll}>
          {log || 'Brak logów. Uruchom grę („Graj"), aby zobaczyć wyjście Minecrafta tutaj.'}
        </pre>
      </div>
    </div>,
    document.body
  );
}
