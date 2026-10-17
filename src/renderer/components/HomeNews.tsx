import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { RefreshCw, Download, Sparkles, ScrollText, Plus, Loader2, CircleCheck, Newspaper, PartyPopper, X } from 'lucide-react';
import { useStore } from '../store';
import { useBackdropClose } from '../hooks/useBackdropClose';
import { ModalHeader } from '../ui/ModalHeader';
import { CreateInstanceModal } from './CreateInstanceModal';
import { CHANGELOG } from '../changelog';
import { updateLabel } from '../updateLabel';
import { formatDate } from '../format';
import { isNewerMc } from '../mcVersion';
import type { McNewsEntry, McPatchNotes } from '../../shared/types';

// Fetched once per session; Home remounts on every visit.
let newsCache: McNewsEntry[] | null = null;
let newsRequest: Promise<McNewsEntry[]> | null = null;

/** Minecraft releases/snapshots from Mojang (shared by the news card and the new-version banner). */
function useMcNews(): { news: McNewsEntry[] | null; error: boolean } {
  const [news, setNews] = useState<McNewsEntry[] | null>(newsCache);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (newsCache) return;
    newsRequest ??= window.api.news.minecraft();
    newsRequest.then(
      (n) => setNews((newsCache = n)),
      () => {
        newsRequest = null;
        setError(true);
      }
    );
  }, []);
  return { news, error };
}

/** The newest release when it's newer than every release the user has an instance for. */
function useNewRelease(): McNewsEntry | null {
  const { news } = useMcNews();
  const instances = useStore((s) => s.instances);
  const release = news?.find((n) => n.type === 'release');
  const releases = instances.map((i) => i.mcVersion).filter((v) => /^\d+(\.\d+)+$/.test(v));
  if (!release || !releases.length) return null;
  return releases.every((v) => isNewerMc(release.version, v)) ? release : null;
}

const DISMISS_KEY = 'home.newReleaseDismissed';
function dismissedVersion(): string | null {
  try {
    return localStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

/** Banner on Home: a new Minecraft release is out and none of the instances has it yet. */
export function NewReleaseBanner() {
  const release = useNewRelease();
  const instances = useStore((s) => s.instances);
  const [dismissed, setDismissed] = useState(dismissedVersion);
  const [create, setCreate] = useState(false);
  if (!release || dismissed === release.version) return null;

  const newest = instances
    .map((i) => i.mcVersion)
    .filter((v) => /^\d+(\.\d+)+$/.test(v))
    .sort((a, b) => (isNewerMc(a, b) ? -1 : 1))[0];
  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, release.version);
    } catch {
      /* ignore */
    }
    setDismissed(release.version);
  };

  return (
    <div className="release-banner">
      {release.image && <img className="release-banner-img" src={release.image} alt="" />}
      <div className="release-banner-text">
        <div className="release-banner-title">
          <PartyPopper size={16} /> Wyszedł Minecraft {release.version}!
        </div>
        <div className="release-banner-sub">
          Twoje instancje są najwyżej na {newest}. Stwórz nową, żeby zagrać w najnowszą wersję.
        </div>
      </div>
      <button className="primary btn-sm" onClick={() => setCreate(true)}>
        <Plus size={14} /> Nowa instancja {release.version}
      </button>
      <button className="ghost icon-btn" title="Ukryj" onClick={dismiss}>
        <X size={16} />
      </button>
      {create && <CreateInstanceModal initialVersion={release.version} onClose={() => setCreate(false)} />}
    </div>
  );
}

const ALLOWED = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'UL', 'OL', 'LI', 'B', 'STRONG', 'I', 'EM', 'CODE', 'BR', 'BLOCKQUOTE', 'PRE', 'SPAN', 'A']);
const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'IMG', 'VIDEO', 'SVG', 'FORM']);

/** Rebuild Mojang's HTML from a tag whitelist with no attributes at all (links become plain text). */
function sanitize(html: string): DocumentFragment {
  const src = new DOMParser().parseFromString(html, 'text/html').body;
  const out = document.createDocumentFragment();
  const walk = (from: Node, to: Node) => {
    for (const n of from.childNodes) {
      if (n.nodeType === Node.TEXT_NODE) to.appendChild(document.createTextNode(n.textContent ?? ''));
      else if (n.nodeType === Node.ELEMENT_NODE) {
        const tag = (n as Element).tagName;
        if (DROP.has(tag)) continue;
        if (ALLOWED.has(tag)) {
          const el = document.createElement(tag === 'A' ? 'span' : tag);
          walk(n, el);
          to.appendChild(el);
        } else walk(n, to);
      }
    }
  };
  walk(src, out);
  return out;
}

function PatchNotesModal({ entry, onClose }: { entry: McNewsEntry; onClose: () => void }) {
  const [notes, setNotes] = useState<McPatchNotes | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const backdrop = useBackdropClose(onClose);

  useEffect(() => {
    window.api.news.patchNotes(entry.contentPath).then(setNotes, (e) => setError((e as Error).message));
  }, [entry.contentPath]);
  useEffect(() => {
    if (notes && bodyRef.current) bodyRef.current.replaceChildren(sanitize(notes.body));
  }, [notes]);

  return createPortal(
    <div className="modal-backdrop" {...backdrop}>
      <div className="modal mod-modal notes-modal" onClick={(e) => e.stopPropagation()}>
        <ModalHeader
          title={entry.title}
          subtitle={`${entry.type === 'release' ? 'Wydanie' : 'Snapshot'} · ${formatDate(Date.parse(entry.date))}`}
          onClose={onClose}
        />
        <div className="notes-scroll">
          {entry.image && <img className="notes-image" src={entry.image} alt="" />}
          {error && <div className="error">{error}</div>}
          {!notes && !error && (
            <div className="mod-empty">
              <Loader2 size={20} className="spin" /> Wczytuję patch notes…
            </div>
          )}
          <div className="notes-body" ref={bodyRef} />
        </div>
      </div>
    </div>,
    document.body
  );
}

function ChangelogModal({ onClose }: { onClose: () => void }) {
  const backdrop = useBackdropClose(onClose);
  return createPortal(
    <div className="modal-backdrop" {...backdrop}>
      <div className="modal mod-modal notes-modal" onClick={(e) => e.stopPropagation()}>
        <ModalHeader title="Historia zmian" subtitle="Co nowego w ZerdaLauncherze" onClose={onClose} />
        <div className="notes-scroll">
          {CHANGELOG.map((c) => (
            <div className="changelog-entry" key={c.version}>
              <div className="changelog-head">
                <span className="tag">v{c.version}</span>
                <span className="text-faint">{formatDate(Date.parse(c.date))}</span>
              </div>
              <ul>
                {c.changes.map((ch) => (
                  <li key={ch}>{ch}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}

function LauncherCard() {
  const status = useStore((s) => s.updateStatus);
  const [version, setVersion] = useState('');
  const [showLog, setShowLog] = useState(false);
  useEffect(() => {
    window.api.system.appVersion().then(setVersion);
  }, []);

  // Notes for the running version (dev builds report 0.1.0 — show the newest instead).
  const entry = CHANGELOG.find((c) => c.version === version) ?? CHANGELOG[0];
  const busy = status?.state === 'checking' || status?.state === 'available' || status?.state === 'downloading';

  return (
    <div className="news-card">
      <div className="news-card-head">
        <Sparkles size={16} className="news-ic" />
        <span className="news-card-title">ZerdaLauncher</span>
        {version && <span className="tag">v{version}</span>}
      </div>

      <div className={`news-status ${status?.state ?? ''}`}>
        {status?.state === 'none' && <CircleCheck size={14} />}
        {busy && <Loader2 size={14} className="spin" />}
        <span>{updateLabel(status) || 'Aktualizacje pobierają się automatycznie.'}</span>
      </div>
      {status?.state === 'downloading' && (
        <div className="news-progress">
          <span style={{ width: `${status.percent}%` }} />
        </div>
      )}
      {status?.state === 'ready' ? (
        <button className="primary btn-sm" onClick={() => window.api.updates.install()}>
          <Download size={14} /> Zainstaluj v{status.version}
        </button>
      ) : (
        <button className="ghost btn-sm" disabled={busy} onClick={() => window.api.updates.check()}>
          <RefreshCw size={14} /> Sprawdź aktualizacje
        </button>
      )}

      <div className="news-sub">Co nowego w v{entry.version}</div>
      <ul className="news-list">
        {entry.changes.slice(0, 4).map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <button className="ghost btn-sm" onClick={() => setShowLog(true)}>
        <ScrollText size={14} /> Historia zmian
      </button>
      {showLog && <ChangelogModal onClose={() => setShowLog(false)} />}
    </div>
  );
}

function MinecraftCard() {
  const { news, error } = useMcNews();
  const newRelease = useNewRelease();
  const [notesFor, setNotesFor] = useState<McNewsEntry | null>(null);
  const [createFor, setCreateFor] = useState<string | null>(null);

  const [main, ...rest] = news ?? [];

  return (
    <div className="news-card">
      <div className="news-card-head">
        <Newspaper size={16} className="news-ic" />
        <span className="news-card-title">Minecraft</span>
        {newRelease && <span className="news-new">Nowa wersja</span>}
      </div>
      {error && <div className="news-status error">Nie udało się pobrać nowości Minecrafta.</div>}
      {!news && !error && (
        <div className="news-status">
          <Loader2 size={14} className="spin" /> Wczytuję…
        </div>
      )}
      {main && (
        <>
          <button className="news-feature" onClick={() => setNotesFor(main)} title="Czytaj patch notes">
            {main.image && <img src={main.image} alt="" loading="lazy" />}
            <span className={`news-kind ${main.type}`}>{main.type === 'release' ? 'Wydanie' : 'Snapshot'}</span>
          </button>
          <div className="news-feature-title">{main.title}</div>
          <div className="news-date">{formatDate(Date.parse(main.date))}</div>
          <p className="news-text">{main.shortText}</p>
          <div className="news-actions">
            <button className="ghost btn-sm" onClick={() => setNotesFor(main)}>
              <ScrollText size={14} /> Patch notes
            </button>
            <button className="ghost btn-sm" onClick={() => setCreateFor(main.version)} title="Nowa instancja z tą wersją">
              <Plus size={14} /> Nowa instancja
            </button>
          </div>
        </>
      )}
      {rest.map((e) => (
        <div className="news-row" key={e.version}>
          <span className={`news-kind ${e.type}`}>{e.type === 'release' ? 'Wydanie' : 'Snapshot'}</span>
          <button className="news-row-title truncate" onClick={() => setNotesFor(e)} title="Czytaj patch notes">
            {e.title.replace(/^Minecraft:? (Java Edition )?/, '')}
          </button>
          <button className="ghost icon-btn" onClick={() => setCreateFor(e.version)} title="Nowa instancja z tą wersją">
            <Plus size={15} />
          </button>
        </div>
      ))}
      {notesFor && <PatchNotesModal entry={notesFor} onClose={() => setNotesFor(null)} />}
      {createFor && <CreateInstanceModal initialVersion={createFor} onClose={() => setCreateFor(null)} />}
    </div>
  );
}

/** Launcher update status + changelog and Minecraft news, under the skin on Home. */
export function HomeNews() {
  return (
    <div className="home-news">
      <LauncherCard />
      <MinecraftCard />
    </div>
  );
}
