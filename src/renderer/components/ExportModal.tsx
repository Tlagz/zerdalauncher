import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Package, Boxes, Loader2, Earth } from 'lucide-react';
import { useBackdropClose } from '../hooks/useBackdropClose';
import { ModalHeader } from '../ui/ModalHeader';
import { Segmented } from '../ui/Segmented';
import { Toggle } from '../ui/Toggle';
import { alertDialog, showToast } from '../ui/feedback';
import { formatSize } from '../format';
import type { ExportOptions, Instance, WorldInfo } from '../../shared/types';

const FORMAT_HINT: Record<ExportOptions['format'], string> = {
  zerda: 'Najmniejszy plik — mody z Modrinth pobierają się przy imporcie. Dla znajomych z ZerdaLauncherem.',
  mrpack: 'Standardowy modpack Modrinth — otworzy go Modrinth App, Prism, ATLauncher i inne launchery.'
};

/** Choose a pack format and what goes into it, then save it. */
export function ExportModal({ instance, onClose }: { instance: Instance; onClose: () => void }) {
  const [opts, setOpts] = useState<ExportOptions>({
    format: 'zerda',
    config: true,
    resourcepacks: true,
    shaderpacks: true,
    options: false,
    worlds: []
  });
  const [worlds, setWorlds] = useState<WorldInfo[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const backdrop = useBackdropClose(() => !busy && onClose());

  useEffect(() => {
    window.api.worlds.list(instance.id).then(setWorlds).catch(() => setWorlds([]));
  }, [instance.id]);
  useEffect(() => window.api.modpacks.onProgress((p) => busy && setBusy(p.message)), [busy]);

  const set = (patch: Partial<ExportOptions>) => setOpts((o) => ({ ...o, ...patch }));
  const toggleWorld = (name: string) =>
    set({ worlds: opts.worlds.includes(name) ? opts.worlds.filter((w) => w !== name) : [...opts.worlds, name] });
  const worldsMb = worlds.filter((w) => opts.worlds.includes(w.name)).reduce((s, w) => s + w.sizeMb, 0);

  const run = async () => {
    setBusy('Przygotowuję…');
    try {
      const dest = await window.api.modpacks.export(instance.id, opts);
      if (dest) {
        showToast(`Wyeksportowano paczkę:\n${dest}`, 'success');
        onClose();
      }
    } catch (e) {
      alertDialog({ title: 'Eksport nie powiódł się', message: (e as Error).message, tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return createPortal(
    <div className="modal-backdrop" {...backdrop}>
      <div className="modal mod-modal export-modal" onClick={(e) => e.stopPropagation()}>
        <ModalHeader
          title={`Eksportuj — ${instance.name}`}
          subtitle="Udostępnij instancję znajomym albo przenieś ją do innego launchera"
          onClose={onClose}
          closeDisabled={!!busy}
        />

        <div className="export-body">
          <div className="custom-field">
            <label>Format</label>
            <Segmented
              value={opts.format}
              onChange={(format) => set({ format })}
              options={[
                { value: 'zerda', label: '.zerda', icon: Package },
                { value: 'mrpack', label: '.mrpack', icon: Boxes }
              ]}
            />
            <div className="field-hint">{FORMAT_HINT[opts.format]}</div>
          </div>

          <div className="export-toggles">
            <Toggle label="Konfiguracja modów" description="Foldery config, defaultconfigs, kubejs" checked={opts.config} onChange={(config) => set({ config })} />
            <Toggle label="Resource packi" checked={opts.resourcepacks} onChange={(resourcepacks) => set({ resourcepacks })} />
            <Toggle label="Shadery" checked={opts.shaderpacks} onChange={(shaderpacks) => set({ shaderpacks })} />
            <Toggle
              label="Ustawienia gry i lista serwerów"
              description="options.txt, servers.dat — sterowanie, grafika, zapisane serwery"
              checked={opts.options}
              onChange={(options) => set({ options })}
            />
          </div>

          {worlds.length > 0 && (
            <div className="custom-field">
              <label>
                Światy{opts.worlds.length ? ` · ${formatSize(worldsMb * 1024 * 1024)}` : ''}
              </label>
              <div className="export-worlds">
                {worlds.map((w) => (
                  <label className={`export-world ${opts.worlds.includes(w.name) ? 'on' : ''}`} key={w.name}>
                    <input type="checkbox" checked={opts.worlds.includes(w.name)} onChange={() => toggleWorld(w.name)} />
                    <Earth size={15} />
                    <span className="truncate">{w.name}</span>
                    <span className="text-faint">{formatSize(w.sizeMb * 1024 * 1024) || '< 1 KB'}</span>
                  </label>
                ))}
              </div>
              {worldsMb > 500 && <div className="field-hint">Duże światy wydłużą eksport i powiększą plik.</div>}
            </div>
          )}
        </div>

        <div className="crash-footer">
          <span className="crash-footer-gap text-dim">{busy}</span>
          <button className="ghost" onClick={onClose} disabled={!!busy}>
            Anuluj
          </button>
          <button className="primary" onClick={run} disabled={!!busy}>
            {busy ? <Loader2 size={15} className="spin" /> : <Package size={15} />}
            {busy ? 'Eksportuję…' : 'Eksportuj'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
