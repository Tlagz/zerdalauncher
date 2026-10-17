import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Heart, CalendarDays, Scale, ExternalLink, Loader2, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useBackdropClose } from '../hooks/useBackdropClose';
import { ModalHeader } from '../ui/ModalHeader';
import { Segmented } from '../ui/Segmented';
import { bindExternalLinks, markdownFragment, safeFragment } from '../ui/safeHtml';
import { formatDate, formatDownloads } from '../format';
import { openExternal, projectUrl } from '../links';
import type { ContentKind, Instance, ModProvider, ProjectChange, ProjectDetails } from '../../shared/types';

type Tab = 'about' | 'gallery' | 'changes';

/** Sanitized rich text (Markdown or HTML) with links opening in the browser. */
function RichText({ text, format, className }: { text: string; format: 'markdown' | 'html'; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const opts = { images: true, links: true };
    el.replaceChildren(format === 'markdown' ? markdownFragment(text, opts) : safeFragment(text, opts));
    return bindExternalLinks(el);
  }, [text, format]);
  return <div className={`rich-text ${className ?? ''}`} ref={ref} />;
}

/** A mod/pack/shader page inside the launcher: description, gallery and changelog. */
export function ModDetailsModal({
  provider,
  projectId,
  slug,
  kind,
  instance,
  installed,
  onInstall,
  onClose
}: {
  provider: ModProvider;
  projectId: string;
  slug?: string;
  kind: ContentKind;
  instance: Instance;
  installed: boolean;
  onInstall: () => void;
  onClose: () => void;
}) {
  const [details, setDetails] = useState<ProjectDetails | null>(null);
  const [changes, setChanges] = useState<ProjectChange[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('about');
  const [shot, setShot] = useState<number | null>(null);
  const backdrop = useBackdropClose(onClose);

  useEffect(() => {
    window.api.mods.details(provider, projectId).then(setDetails, (e) => setError((e as Error).message));
  }, [provider, projectId]);
  useEffect(() => {
    if (tab !== 'changes' || changes) return;
    window.api.mods
      .changelog(provider, projectId, instance.mcVersion, kind === 'mod' ? instance.loader : '')
      .then(setChanges, () => setChanges([]));
  }, [tab]);

  const gallery = details?.gallery ?? [];

  return createPortal(
    <div className="modal-backdrop" {...backdrop}>
      <div className="modal mod-modal details-modal" onClick={(e) => e.stopPropagation()}>
        <ModalHeader
          title={
            <span className="details-title">
              {details?.iconUrl && <img src={details.iconUrl} alt="" />}
              {details?.title ?? 'Wczytuję…'}
            </span>
          }
          subtitle={details ? `${details.author ? details.author + ' · ' : ''}${provider === 'curseforge' ? 'CurseForge' : 'Modrinth'}` : ' '}
          onClose={onClose}
        />

        {error && <div className="error">{error}</div>}
        {!details && !error && (
          <div className="mod-empty">
            <Loader2 size={20} className="spin" />
          </div>
        )}

        {details && (
          <>
            <div className="details-summary">{details.summary}</div>
            <div className="details-meta">
              <span>
                <Download size={13} /> {formatDownloads(details.downloads)} pobrań
              </span>
              {details.followers !== undefined && (
                <span>
                  <Heart size={13} /> {formatDownloads(details.followers)}
                </span>
              )}
              {details.updated && (
                <span>
                  <CalendarDays size={13} /> {formatDate(Date.parse(details.updated))}
                </span>
              )}
              {details.license && (
                <span>
                  <Scale size={13} /> {details.license}
                </span>
              )}
            </div>
            <div className="details-bar">
              <Segmented
                value={tab}
                onChange={setTab}
                options={[
                  { value: 'about', label: 'Opis' },
                  ...(gallery.length ? [{ value: 'gallery' as Tab, label: `Galeria (${gallery.length})` }] : []),
                  { value: 'changes', label: 'Zmiany' }
                ]}
              />
              <span className="crash-footer-gap" />
              <button className="ghost btn-sm" onClick={() => openExternal(projectUrl(provider, projectId, slug))}>
                <ExternalLink size={14} /> Strona
              </button>
              <button className="primary btn-sm" disabled={installed} onClick={onInstall}>
                <Download size={14} /> {installed ? 'Zainstalowany' : 'Instaluj…'}
              </button>
            </div>

            <div className="details-scroll">
              {tab === 'about' && (
                <>
                  <RichText text={details.body || details.summary} format={details.bodyFormat} />
                  {details.links.length > 0 && (
                    <div className="details-links">
                      {details.links.map((l) => (
                        <button className="ghost btn-sm" key={l.url} onClick={() => openExternal(l.url)}>
                          <ExternalLink size={13} /> {l.label}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
              {tab === 'gallery' && (
                <div className="details-gallery">
                  {gallery.map((g, i) => (
                    <button className="shot-card" key={g.url} onClick={() => setShot(i)} title={g.title}>
                      <img src={g.url} alt={g.title ?? ''} loading="lazy" referrerPolicy="no-referrer" />
                    </button>
                  ))}
                </div>
              )}
              {tab === 'changes' &&
                (!changes ? (
                  <div className="mod-empty">
                    <Loader2 size={20} className="spin" />
                  </div>
                ) : changes.length === 0 ? (
                  <div className="mod-empty">Brak wersji dla {instance.mcVersion}.</div>
                ) : (
                  changes.map((c) => (
                    <div className="changelog-entry" key={c.name + c.date}>
                      <div className="changelog-head">
                        <span className={`tag ${c.type === 'release' ? '' : 'beta'}`}>{c.name}</span>
                        <span className="text-faint">{formatDate(Date.parse(c.date))}</span>
                      </div>
                      {c.changelog ? (
                        <RichText text={c.changelog} format={c.format} className="small" />
                      ) : (
                        <div className="text-faint field-hint">Autor nie opisał zmian.</div>
                      )}
                    </div>
                  ))
                ))}
            </div>
          </>
        )}
      </div>

      {shot !== null &&
        gallery[shot] &&
        createPortal(
          <div className="shot-viewer" onClick={() => setShot(null)}>
            <img src={gallery[shot].url} alt="" referrerPolicy="no-referrer" onClick={(e) => e.stopPropagation()} />
            {gallery.length > 1 && (
              <>
                <button
                  className="ghost icon-btn shot-nav prev"
                  onClick={(e) => (e.stopPropagation(), setShot((shot - 1 + gallery.length) % gallery.length))}
                >
                  <ChevronLeft size={22} />
                </button>
                <button
                  className="ghost icon-btn shot-nav next"
                  onClick={(e) => (e.stopPropagation(), setShot((shot + 1) % gallery.length))}
                >
                  <ChevronRight size={22} />
                </button>
              </>
            )}
            <div className="shot-bar" onClick={(e) => e.stopPropagation()}>
              <span className="shot-bar-name truncate">{gallery[shot].title}</span>
              <button className="ghost icon-btn" onClick={() => setShot(null)}>
                <X size={18} />
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>,
    document.body
  );
}
