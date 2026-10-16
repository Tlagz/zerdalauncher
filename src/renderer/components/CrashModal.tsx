import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { TriangleAlert, Wrench, Check, Loader2, Copy, FileText, Terminal, Play, SearchX } from 'lucide-react';
import { useStore } from '../store';
import { useLaunch } from '../hooks/useLaunch';
import { useBackdropClose } from '../hooks/useBackdropClose';
import { ModalHeader } from '../ui/ModalHeader';
import { showToast } from '../ui/feedback';
import { closeWithTransition } from '../ui/viewTransition';
import { ConsoleModal } from './ConsoleModal';
import { ContentManagerModal } from './ContentManagerModal';
import type { CrashIssue, CrashReport, Instance } from '../../shared/types';

type FixState = { state: 'busy'; note?: string } | { state: 'done'; note: string } | { state: 'error'; note: string };

/** Shown when a game session crashes: what went wrong and one-click repairs. */
export function CrashModal({ report, onClose }: { report: CrashReport; onClose: () => void }) {
  const instance = useStore((s) => s.instances.find((i) => i.id === report.instanceId));
  const backdrop = useBackdropClose(onClose);
  const [fixes, setFixes] = useState<Record<number, FixState>>({});
  const [showConsole, setShowConsole] = useState(false);
  const [showMods, setShowMods] = useState(false);

  // Progress text for long repairs (Java download, mod lookups).
  useEffect(
    () =>
      window.api.mc.onCrashFixProgress((p) => {
        if (p.instanceId !== report.instanceId || !p.message) return;
        setFixes((f) => {
          const busy = Object.entries(f).find(([, s]) => s.state === 'busy');
          if (!busy) return f;
          const pct = p.total > 1 ? ` ${Math.round((p.current / p.total) * 100)}%` : '';
          return { ...f, [busy[0]]: { state: 'busy', note: `${p.message}${pct}` } };
        });
      }),
    [report.instanceId]
  );

  const apply = async (i: number, issue: CrashIssue) => {
    if (!issue.fix) return;
    if (issue.fix.kind === 'openMods') {
      setShowMods(true);
      return;
    }
    setFixes((f) => ({ ...f, [i]: { state: 'busy' } }));
    try {
      const note = await window.api.mc.crashFix(report.instanceId, issue.fix);
      await useStore.getState().refreshInstances();
      setFixes((f) => ({ ...f, [i]: { state: 'done', note } }));
    } catch (e) {
      setFixes((f) => ({ ...f, [i]: { state: 'error', note: (e as Error).message } }));
    }
  };

  const copyLog = async () => {
    const text = [
      `ZerdaLauncher — crash: ${report.instanceName}`,
      instance ? `${instance.mcVersion} · ${instance.loader} ${instance.loaderVersion ?? ''}` : '',
      `Kod wyjścia: ${report.exitCode ?? '—'}`,
      ...report.issues.map((i) => `* ${i.title}: ${i.detail}`),
      '',
      report.logTail
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      showToast('Skopiowano log do schowka.', 'success');
    } catch {
      showToast('Nie udało się skopiować.', 'error');
    }
  };

  const anyFixed = Object.values(fixes).some((f) => f.state === 'done');

  return createPortal(
    <div className="modal-backdrop" {...backdrop}>
      <div className="modal mod-modal crash-modal" onClick={(e) => e.stopPropagation()}>
        <ModalHeader
          title={
            <span className="crash-title">
              <TriangleAlert size={20} /> Gra się wysypała
            </span>
          }
          subtitle={`${report.instanceName} · kod wyjścia ${report.exitCode ?? '—'}`}
          onClose={onClose}
        />

        {report.issues.length > 0 ? (
          <>
            <div className="crash-lead">
              {report.issues.length === 1 ? 'Znalazłem prawdopodobną przyczynę:' : `Znalazłem ${report.issues.length} prawdopodobne przyczyny:`}
            </div>
            <div className="crash-issues">
              {report.issues.map((issue, i) => {
                const st = fixes[i];
                return (
                  <div className={`crash-issue ${st?.state === 'done' ? 'fixed' : ''}`} key={issue.title}>
                    <div className="crash-issue-ic">{st?.state === 'done' ? <Check size={18} /> : <Wrench size={18} />}</div>
                    <div className="crash-issue-body">
                      <div className="crash-issue-title">{issue.title}</div>
                      <div className="crash-issue-detail">{issue.detail}</div>
                      {st && st.note && <div className={`crash-issue-note ${st.state}`}>{st.note}</div>}
                    </div>
                    {issue.fix && issue.fixLabel && st?.state !== 'done' && (
                      <button className="primary btn-sm" disabled={st?.state === 'busy'} onClick={() => apply(i, issue)}>
                        {st?.state === 'busy' ? <Loader2 size={14} className="spin" /> : <Wrench size={14} />}
                        {issue.fixLabel}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="crash-unknown">
            <SearchX size={26} />
            <div>
              <div className="crash-issue-title">Nie rozpoznałem przyczyny</div>
              <div className="crash-issue-detail">
                Zajrzyj do konsoli albo crash reportu. Możesz też skopiować log i komuś wysłać.
              </div>
              {report.keyLine && <code className="crash-keyline">{report.keyLine}</code>}
            </div>
          </div>
        )}

        <div className="crash-footer">
          <button className="ghost" onClick={copyLog}>
            <Copy size={15} /> Kopiuj log
          </button>
          <button className="ghost" onClick={() => window.api.instances.openCrashReports(report.instanceId)}>
            <FileText size={15} /> Crash reporty
          </button>
          <button className="ghost" onClick={() => setShowConsole(true)} disabled={!instance}>
            <Terminal size={15} /> Konsola
          </button>
          <span className="crash-footer-gap" />
          {instance && <RelaunchButton instance={instance} highlight={anyFixed} onLaunched={onClose} />}
        </div>
      </div>
      {showConsole && instance && <ConsoleModal instance={instance} onClose={() => setShowConsole(false)} />}
      {showMods && instance && (
        <ContentManagerModal instance={instance} kinds={['mod']} checkUpdatesOnOpen onClose={() => setShowMods(false)} />
      )}
    </div>,
    document.body
  );
}

function RelaunchButton({
  instance,
  highlight,
  onLaunched
}: {
  instance: Instance;
  highlight: boolean;
  onLaunched: () => void;
}) {
  const { launch, isLaunching } = useLaunch(instance);
  return (
    <button
      className={highlight ? 'primary' : 'ghost'}
      disabled={isLaunching}
      onClick={(e) => {
        const from = e.currentTarget;
        void launch();
        closeWithTransition(from, onLaunched);
      }}
    >
      {isLaunching ? <Loader2 size={15} className="spin" /> : <Play size={15} />} Uruchom ponownie
    </button>
  );
}
