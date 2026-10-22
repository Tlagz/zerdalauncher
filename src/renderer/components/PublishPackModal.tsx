import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Upload, Loader2, ImageUp, Check, Trash2, Image as ImageIcon } from 'lucide-react';
import { useStore } from '../store';
import { useBackdropClose } from '../hooks/useBackdropClose';
import { ModalHeader } from '../ui/ModalHeader';
import { Toggle } from '../ui/Toggle';
import { alertDialog, showToast } from '../ui/feedback';
import { InstanceIcon } from './InstanceIcon';
import type { CatalogPack } from '../../shared/types';

const ACCENTS = ['#8b5cf6', '#3b82f6', '#06b6d4', '#10b981', '#84cc16', '#f59e0b', '#f97316', '#ef4444', '#ec4899'];

/** Next patch version: 1.2.3 → 1.2.4; anything else gets ".1". */
function bump(v?: string): string {
  if (!v) return '1.0.0';
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)$/);
  return m ? `${m[1]}.${m[2]}.${Number(m[3]) + 1}` : `${v}.1`;
}

const linkOf = (pack: CatalogPack | undefined, label: string) => pack?.links?.find((l) => l.label === label)?.url ?? '';

/**
 * Owner only: publish a new pack from an instance ("new"), release a new
 * version ("version"), or edit the card and install settings ("edit").
 */
export function PublishPackModal({
  mode,
  pack,
  onClose,
  onDone
}: {
  mode: 'new' | 'version' | 'edit';
  pack?: CatalogPack;
  onClose: () => void;
  onDone: () => void;
}) {
  const instances = useStore((s) => s.instances);
  // A new version defaults to the instance this pack was published from.
  const linked = pack ? instances.find((i) => i.pack?.id === pack.id) : undefined;
  const [instanceId, setInstanceId] = useState(linked?.id ?? instances[0]?.id ?? '');
  const [name, setName] = useState(pack?.name ?? '');
  const [description, setDescription] = useState(pack?.description ?? '');
  const [icon, setIcon] = useState<string | undefined>();
  // undefined = keep, null = remove, string = new image
  const [banner, setBanner] = useState<string | null | undefined>();
  const [accent, setAccent] = useState(pack?.accent ?? '');
  const [tags, setTags] = useState((pack?.tags ?? []).join(', '));
  const [server, setServer] = useState(pack?.server ?? '');
  const [ramMb, setRamMb] = useState(pack?.ramMb ?? 0);
  const [discord, setDiscord] = useState(linkOf(pack, 'Discord'));
  const [site, setSite] = useState(linkOf(pack, 'Strona'));
  const [featured, setFeatured] = useState(!!pack?.featured);
  const [hidden, setHidden] = useState(!!pack?.hidden);
  const [version, setVersion] = useState(bump(pack?.versions[0]?.version));
  const [changelog, setChangelog] = useState('');
  const [include, setInclude] = useState({ resourcepacks: true, shaderpacks: true, options: false });
  const [busy, setBusy] = useState<string | null>(null);
  const backdrop = useBackdropClose(() => !busy && onClose());
  const inst = instances.find((i) => i.id === instanceId);
  const showCard = mode !== 'version';
  const showRelease = mode !== 'edit';

  useEffect(() => window.api.modpacks.onProgress((p) => busy && setBusy(p.message)), [busy]);
  // A new pack starts from the instance's name, image icon and server.
  useEffect(() => {
    if (mode !== 'new' || !inst) return;
    if (!name) setName(inst.name);
    if (!icon && inst.icon?.startsWith('data:image/png')) setIcon(inst.icon);
    if (!server && inst.serverAddress) setServer(inst.serverAddress);
  }, [instanceId]);

  const pick = async (fn: () => Promise<string | null>, set: (v: string) => void) => {
    try {
      const img = await fn();
      if (img) set(img);
    } catch (e) {
      alertDialog({ message: (e as Error).message, tone: 'error' });
    }
  };

  const submit = async () => {
    setBusy('Przygotowuję…');
    try {
      await window.api.packs.publish({
        packId: pack?.id,
        instanceId: showRelease ? instanceId : undefined,
        name: name.trim(),
        description: description.trim(),
        icon,
        banner,
        look: showCard
          ? {
              accent: accent || undefined,
              tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
              server: server.trim() || undefined,
              ramMb: ramMb || undefined,
              featured,
              hidden,
              links: [
                ...(discord.trim() ? [{ label: 'Discord', url: discord.trim() }] : []),
                ...(site.trim() ? [{ label: 'Strona', url: site.trim() }] : [])
              ]
            }
          : undefined,
        version: showRelease ? version.trim() : undefined,
        changelog: changelog.trim(),
        include: showRelease ? include : undefined
      });
      await useStore.getState().refreshInstances();
      showToast(
        mode === 'new' ? `Opublikowano „${name.trim()}”.` : mode === 'version' ? `Wydano ${name.trim()} ${version.trim()}.` : 'Zapisano zmiany.',
        'success'
      );
      onDone();
      onClose();
    } catch (e) {
      setBusy(null);
      alertDialog({ title: 'Publikowanie nie powiodło się', message: (e as Error).message, tone: 'error' });
    }
  };

  const title = mode === 'new' ? 'Nowa paczka' : mode === 'version' ? `Nowa wersja — ${pack?.name}` : `Edytuj — ${pack?.name}`;
  const valid = name.trim() && (!showRelease || (instanceId && version.trim()));
  const bannerSrc = banner === null ? undefined : banner ?? pack?.banner;

  return createPortal(
    <div className="modal-backdrop" {...backdrop}>
      <div className="modal mod-modal publish-modal" onClick={(e) => e.stopPropagation()}>
        <ModalHeader
          title={title}
          subtitle={mode === 'edit' ? 'Wygląd karty i ustawienia instalacji — bez nowej wersji' : 'Paczka pojawi się w zakładce Paczki Sztulagz u graczy'}
          onClose={onClose}
          closeDisabled={!!busy}
        />
        <div className="publish-body">
        <fieldset className="publish-fields" disabled={!!busy}>
          {showRelease && (
            <div className="custom-field">
              <label>Instancja do opublikowania</label>
              <select value={instanceId} onChange={(e) => setInstanceId(e.target.value)}>
                {instances.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} · {i.mcVersion} {i.loader}
                  </option>
                ))}
              </select>
            </div>
          )}

          {showCard && (
            <section className="publish-section">
              <h4>Karta paczki</h4>
              <div
                className={`publish-banner ${bannerSrc ? 'has' : ''}`}
                style={{ backgroundImage: bannerSrc ? `url("${bannerSrc}")` : undefined, ['--pack-accent' as string]: accent || undefined }}
              >
                {!bannerSrc && (
                  <span className="text-faint">
                    <ImageIcon size={16} /> Baner (opcjonalny, szeroki obraz)
                  </span>
                )}
                <div className="publish-banner-actions">
                  <button type="button" className="btn-sm" onClick={() => pick(window.api.packs.pickBanner, setBanner)}>
                    <ImageUp size={14} /> {bannerSrc ? 'Zmień baner' : 'Dodaj baner'}
                  </button>
                  {bannerSrc && (
                    <button type="button" className="btn-sm danger" onClick={() => setBanner(null)}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
              <div className="publish-card-fields">
                <button type="button" className="publish-icon" onClick={() => pick(window.api.instances.pickIcon, setIcon)} title="Zmień ikonę">
                  {icon ? <img src={icon} alt="" /> : pack?.icon ? <img src={pack.icon} alt="" /> : inst ? <InstanceIcon instance={inst} /> : <ImageUp size={22} />}
                </button>
                <div className="publish-texts">
                  <div className="custom-field">
                    <label>Nazwa</label>
                    <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
                  </div>
                  <div className="custom-field">
                    <label>Opis</label>
                    <textarea
                      rows={3}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      maxLength={2000}
                      placeholder="Co jest w paczce i na który tryb serwera…"
                    />
                  </div>
                </div>
              </div>
              <div className="custom-field">
                <label>Kolor karty</label>
                <div className="accent-row">
                  <button type="button" className={`accent-default ${!accent ? 'active' : ''}`} onClick={() => setAccent('')}>
                    {!accent && <Check size={14} />} Domyślny
                  </button>
                  {ACCENTS.map((c) => (
                    <button
                      type="button"
                      key={c}
                      title={c}
                      className={`accent-swatch ${accent === c ? 'active' : ''}`}
                      style={{ background: c }}
                      onClick={() => setAccent(c)}
                    >
                      {accent === c && <Check size={14} />}
                    </button>
                  ))}
                </div>
              </div>
              <div className="custom-field">
                <label>Tagi (po przecinku)</label>
                <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="np. Survival, Technologia, Lekka" />
              </div>
            </section>
          )}

          {showCard && (
            <section className="publish-section">
              <h4>Gra i serwer</h4>
              <div className="custom-field">
                <label>Adres serwera Sztulagz</label>
                <input value={server} onChange={(e) => setServer(e.target.value)} placeholder="np. play.sztulagz.pl" />
                <div className="field-hint">Po instalacji gra od razu wejdzie na ten serwer (Quick Play).</div>
              </div>
              <div className="custom-field">
                <label>Zalecany RAM: {ramMb ? `${ramMb} MB` : 'domyślny gracza'}</label>
                <input type="range" min={0} max={16384} step={512} value={ramMb} onChange={(e) => setRamMb(Number(e.target.value) < 1024 ? 0 : Number(e.target.value))} />
              </div>
              <div className="publish-links">
                <div className="custom-field">
                  <label>Discord (link)</label>
                  <input value={discord} onChange={(e) => setDiscord(e.target.value)} placeholder="https://discord.gg/…" />
                </div>
                <div className="custom-field">
                  <label>Strona (link)</label>
                  <input value={site} onChange={(e) => setSite(e.target.value)} placeholder="https://…" />
                </div>
              </div>
            </section>
          )}

          {showCard && (
            <section className="publish-section">
              <h4>Widoczność</h4>
              <Toggle checked={featured} onChange={setFeatured} label="Wyróżniona" description="Na górze listy, z większą kartą" />
              <Toggle checked={hidden} onChange={setHidden} label="Ukryta (wersja robocza)" description="Widzisz ją tylko Ty — gracze jej nie zobaczą" />
            </section>
          )}

          {showRelease && (
            <section className="publish-section">
              <h4>Wydanie</h4>
              <div className="publish-version">
                <div className="custom-field">
                  <label>Wersja</label>
                  <input value={version} onChange={(e) => setVersion(e.target.value)} maxLength={32} />
                </div>
                <div className="custom-field">
                  <label>Co się zmieniło</label>
                  <textarea
                    rows={3}
                    value={changelog}
                    onChange={(e) => setChangelog(e.target.value)}
                    placeholder={mode === 'new' ? 'Pierwsza wersja' : 'np. Dodano Create, zaktualizowano Sodium'}
                  />
                </div>
              </div>
              <div className="field-hint">Mody i configi wchodzą zawsze. Światy zostają u Ciebie.</div>
              <Toggle
                checked={include.resourcepacks}
                onChange={(resourcepacks) => setInclude({ ...include, resourcepacks })}
                label="Resource packi"
              />
              <Toggle checked={include.shaderpacks} onChange={(shaderpacks) => setInclude({ ...include, shaderpacks })} label="Shadery" />
              <Toggle
                checked={include.options}
                onChange={(options) => setInclude({ ...include, options })}
                label="Ustawienia gry i lista serwerów"
                description="Dla nowych graczy; przy aktualizacji gracze zachowują swoje"
              />
            </section>
          )}
        </fieldset>
        </div>
        <div className="crash-footer">
          <span className="crash-footer-gap text-dim">{busy}</span>
          <button className="ghost" onClick={onClose} disabled={!!busy}>
            Anuluj
          </button>
          <button className="primary" onClick={submit} disabled={!!busy || !valid}>
            {busy ? <Loader2 size={15} className="spin" /> : <Upload size={15} />}
            {mode === 'edit' ? 'Zapisz' : 'Opublikuj'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
