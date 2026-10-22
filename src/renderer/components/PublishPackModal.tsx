import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Upload, Loader2, ImageUp } from 'lucide-react';
import { useStore } from '../store';
import { useBackdropClose } from '../hooks/useBackdropClose';
import { ModalHeader } from '../ui/ModalHeader';
import { alertDialog, showToast } from '../ui/feedback';
import { InstanceIcon } from './InstanceIcon';
import type { CatalogPack } from '../../shared/types';

/** Next patch version: 1.2.3 → 1.2.4; anything else gets ".1". */
function bump(v?: string): string {
  if (!v) return '1.0.0';
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)$/);
  return m ? `${m[1]}.${m[2]}.${Number(m[3]) + 1}` : `${v}.1`;
}

/**
 * Owner only: publish a new pack from an instance (mode "new"), release a new
 * version of one ("version"), or edit its name/description/icon ("edit").
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
  const [version, setVersion] = useState(bump(pack?.versions[0]?.version));
  const [changelog, setChangelog] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const backdrop = useBackdropClose(() => !busy && onClose());
  const inst = instances.find((i) => i.id === instanceId);

  useEffect(() => window.api.modpacks.onProgress((p) => busy && setBusy(p.message)), [busy]);
  // A new pack takes the instance's name and image icon as a starting point.
  useEffect(() => {
    if (mode !== 'new' || !inst) return;
    if (!name) setName(inst.name);
    if (!icon && inst.icon?.startsWith('data:image/png')) setIcon(inst.icon);
  }, [instanceId]);

  const pickIcon = async () => {
    try {
      const img = await window.api.instances.pickIcon();
      if (img) setIcon(img);
    } catch (e) {
      alertDialog({ message: (e as Error).message, tone: 'error' });
    }
  };

  const submit = async () => {
    setBusy('Przygotowuję…');
    try {
      await window.api.packs.publish({
        packId: pack?.id,
        instanceId: mode === 'edit' ? undefined : instanceId,
        name: name.trim(),
        description: description.trim(),
        icon,
        version: mode === 'edit' ? undefined : version.trim(),
        changelog: changelog.trim()
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
  const valid = name.trim() && (mode === 'edit' || (instanceId && version.trim()));

  return createPortal(
    <div className="modal-backdrop" {...backdrop}>
      <div className="modal mod-modal publish-modal" onClick={(e) => e.stopPropagation()}>
        <ModalHeader
          title={title}
          subtitle={mode === 'edit' ? 'Zmienia tylko kartę paczki' : 'Paczka trafi do zakładki Paczki Sztulagz u wszystkich graczy'}
          onClose={onClose}
          closeDisabled={!!busy}
        />
        <div className="export-body">
          {mode !== 'edit' && (
            <div className="custom-field">
              <label>Instancja do opublikowania</label>
              <select value={instanceId} onChange={(e) => setInstanceId(e.target.value)} disabled={!!busy}>
                {instances.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} · {i.mcVersion} {i.loader}
                  </option>
                ))}
              </select>
              <div className="field-hint">
                Wejdą mody, configi, resource packi i shadery. Światy i ustawienia gry (sterowanie, grafika) zostają u
                Ciebie.
              </div>
            </div>
          )}

          {mode !== 'version' && (
            <div className="publish-card-fields">
              <button type="button" className="publish-icon" onClick={pickIcon} title="Zmień ikonę" disabled={!!busy}>
                {icon ? (
                  <img src={icon} alt="" />
                ) : pack?.icon ? (
                  <img src={pack.icon} alt="" />
                ) : inst ? (
                  <InstanceIcon instance={inst} />
                ) : (
                  <ImageUp size={22} />
                )}
              </button>
              <div className="publish-texts">
                <div className="custom-field">
                  <label>Nazwa</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} disabled={!!busy} />
                </div>
                <div className="custom-field">
                  <label>Opis</label>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={2000}
                    placeholder="Co jest w paczce, dla kogo, na jaki serwer…"
                    disabled={!!busy}
                  />
                </div>
              </div>
            </div>
          )}

          {mode !== 'edit' && (
            <div className="publish-version">
              <div className="custom-field">
                <label>Wersja</label>
                <input value={version} onChange={(e) => setVersion(e.target.value)} maxLength={32} disabled={!!busy} />
              </div>
              <div className="custom-field">
                <label>Co się zmieniło</label>
                <textarea
                  rows={3}
                  value={changelog}
                  onChange={(e) => setChangelog(e.target.value)}
                  placeholder={mode === 'new' ? 'Pierwsza wersja' : 'np. Dodano Create, zaktualizowano Sodium'}
                  disabled={!!busy}
                />
              </div>
            </div>
          )}
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
