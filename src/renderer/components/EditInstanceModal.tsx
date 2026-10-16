import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ImageUp } from 'lucide-react';
import { useStore } from '../store';
import { LoaderIcon } from './InstanceIcon';
import { ModalHeader } from '../ui/ModalHeader';
import type { Instance } from '../../shared/types';

const PRESET_ICONS = ['🧱', '🧵', '⚙️', '🔥', '🗺️', '⚔️', '🏰', '🚀', '🐉', '🌌', '🧙', '🧪', '💎', '🪓', '🌲', '👾'];

function isImageIcon(icon?: string): boolean {
  return !!icon && /^(data:|https?:|file:)/.test(icon);
}

/** Per-instance settings: name, icon, RAM, Java path and custom JVM args. */
export function EditInstanceModal({ instance, onClose }: { instance: Instance; onClose: () => void }) {
  const { refreshInstances } = useStore();
  const instances = useStore((s) => s.instances);
  const groups = useMemo(() => [...new Set(instances.map((i) => i.group).filter((g): g is string => !!g))].sort(), [instances]);
  const [name, setName] = useState(instance.name);
  const [group, setGroup] = useState(instance.group ?? '');
  const [icon, setIcon] = useState(instance.icon ?? '');
  const [ramMb, setRamMb] = useState(instance.ramMb);
  const [javaPath, setJavaPath] = useState(instance.javaPath ?? '');
  const [jvmArgs, setJvmArgs] = useState(instance.jvmArgs ?? '');
  const [serverAddress, setServerAddress] = useState(instance.serverAddress ?? '');
  const [detectedJava, setDetectedJava] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.api.system.detectJava().then(setDetectedJava);
  }, []);


  const pickImage = async () => {
    setError(null);
    try {
      const dataUrl = await window.api.instances.pickIcon();
      if (dataUrl) setIcon(dataUrl);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await window.api.instances.update(instance.id, {
        name: name.trim() || instance.name,
        group: group.trim() || undefined,
        icon: icon.trim() || undefined,
        ramMb,
        javaPath: javaPath.trim() || undefined,
        jvmArgs,
        serverAddress: serverAddress.trim() || undefined
      });
      await refreshInstances();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const previewIsImg = isImageIcon(icon);

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal mod-modal" onClick={(e) => e.stopPropagation()}>
        <ModalHeader
          title="Ustawienia instancji"
          subtitle={`${instance.mcVersion} · ${instance.loader}`}
          onClose={onClose}
          closeDisabled={busy}
        />

        {error && <div className="error">{error}</div>}

        <div className="edit-scroll">
          <div className="form-row">
            <label>Nazwa</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="form-row">
            <label>Grupa</label>
            <input
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              list="instance-groups"
              maxLength={32}
              placeholder="np. Modpacki, Survival, Testy — puste = bez grupy"
            />
            <datalist id="instance-groups">
              {groups.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </div>

          <div className="form-row">
            <label>Ikona (profilowe paczki)</label>
            <div className="icon-edit">
              <div className={`icon-preview ${instance.loader}`}>
                {icon ? previewIsImg ? <img src={icon} alt="" /> : <span>{icon}</span> : <LoaderIcon loader={instance.loader} />}
              </div>
              <div className="icon-controls">
                <div className="icon-presets">
                  {PRESET_ICONS.map((e) => (
                    <button
                      type="button"
                      key={e}
                      className={`icon-chip ${icon === e ? 'active' : ''}`}
                      onClick={() => setIcon(e)}
                    >
                      {e}
                    </button>
                  ))}
                </div>
                <div className="icon-actions">
                  <input
                    className="icon-emoji-input"
                    value={previewIsImg ? '' : icon}
                    onChange={(e) => setIcon(e.target.value)}
                    placeholder="Własne emoji"
                    maxLength={4}
                  />
                  <button type="button" onClick={pickImage}>
                    <ImageUp size={15} /> Wybierz obraz…
                  </button>
                  <button type="button" className="ghost" onClick={() => setIcon('')}>
                    Domyślna
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="form-row">
            <label>RAM (MB): {ramMb}</label>
            <input
              type="range"
              min={1024}
              max={16384}
              step={512}
              value={ramMb}
              onChange={(e) => setRamMb(Number(e.target.value))}
            />
          </div>

          <div className="form-row">
            <label>Ścieżka do Javy (puste = wykryta / domyślna)</label>
            <input
              value={javaPath}
              onChange={(e) => setJavaPath(e.target.value)}
              placeholder={detectedJava ?? 'np. C:\\Program Files\\Java\\jdk-21\\bin\\javaw.exe'}
            />
          </div>

          <div className="form-row">
            <label>Własne argumenty JVM (dla tej instancji)</label>
            <textarea
              rows={3}
              value={jvmArgs}
              onChange={(e) => setJvmArgs(e.target.value)}
              placeholder="np. -XX:+UseG1GC -XX:+UnlockExperimentalVMOptions -Dfile.encoding=UTF-8"
              spellCheck={false}
            />
            <div className="field-hint">
              Dopisywane do komendy uruchomienia (oprócz <code>-Xmx{ramMb}M</code>). Rozdzielaj spacjami.
            </div>
          </div>

          <div className="form-row">
            <label>Serwer — auto-dołączanie (Quick Play)</label>
            <input
              value={serverAddress}
              onChange={(e) => setServerAddress(e.target.value)}
              placeholder="np. mc.hypixel.net albo 51.83.12.4:25565"
            />
            <div className="field-hint">
              Po uruchomieniu launcher od razu wbije Cię na ten serwer (Minecraft 1.20+).
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button onClick={onClose} disabled={busy}>
            Anuluj
          </button>
          <button className="primary" onClick={save} disabled={busy}>
            {busy ? 'Zapisywanie…' : 'Zapisz'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
