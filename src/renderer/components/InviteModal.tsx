import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Mail, Globe, Puzzle, Loader2, LogIn, ChevronDown } from 'lucide-react';
import { useStore } from '../store';
import { useBackdropClose } from '../hooks/useBackdropClose';
import { ModalHeader } from '../ui/ModalHeader';
import { alertDialog, showToast } from '../ui/feedback';
import { plural } from '../format';
import type { Invite, InvitePreview } from '../../shared/types';

const NEW = '__new__';

/** Someone invited the user to a server: prepare an instance with their mods and join. */
export function InviteModal({ invite, onClose }: { invite: Invite; onClose: () => void }) {
  const instances = useStore((s) => s.instances);
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [target, setTarget] = useState<string>(NEW);
  const [busy, setBusy] = useState<string | null>(null);
  const [showMods, setShowMods] = useState(false);
  const backdrop = useBackdropClose(() => !busy && onClose());

  useEffect(() => {
    window.api.invites.preview(invite).then(
      (p) => {
        setPreview(p);
        if (p.matching.length) setTarget(p.matching[0]);
      },
      () => setPreview({ mods: [], matching: [] })
    );
  }, [invite]);
  useEffect(() => window.api.modpacks.onProgress((p) => busy && setBusy(`${p.message} (${p.current}/${p.total})`)), [busy]);

  const matching = instances.filter((i) => preview?.matching.includes(i.id));

  const join = async () => {
    setBusy('Przygotowuję instancję…');
    try {
      const id = await window.api.invites.accept(invite, target === NEW ? null : target);
      await useStore.getState().refreshInstances();
      setBusy('Uruchamiam grę…');
      onClose();
      showToast(`Dołączam do ${invite.name}…`, 'info');
      await window.api.mc.launch(id, { server: invite.address });
      await useStore.getState().refreshInstances();
    } catch (e) {
      setBusy(null);
      alertDialog({ title: 'Nie udało się dołączyć', message: (e as Error).message, tone: 'error' });
    }
  };

  return createPortal(
    <div className="modal-backdrop" {...backdrop}>
      <div className="modal mod-modal invite-modal" onClick={(e) => e.stopPropagation()}>
        <ModalHeader
          title={
            <span className="crash-title invite-title">
              <Mail size={20} /> Zaproszenie na serwer
            </span>
          }
          subtitle={invite.from ? `Od: ${invite.from}` : 'Ktoś zaprasza Cię do wspólnej gry'}
          onClose={onClose}
          closeDisabled={!!busy}
        />

        <div className="invite-card">
          <Globe size={22} />
          <div className="invite-card-text">
            <div className="invite-server truncate">{invite.name}</div>
            <div className="text-dim">
              {invite.address} · Minecraft {invite.mc} · {invite.loader}
              {invite.loaderVersion ? ` ${invite.loaderVersion}` : ''}
            </div>
          </div>
        </div>

        {invite.mods.length > 0 && (
          <div className="invite-mods">
            <button className="ghost btn-sm" onClick={() => setShowMods(!showMods)}>
              <Puzzle size={14} /> {invite.mods.length} {plural(invite.mods.length, 'mod', 'mody', 'modów')} z Modrinth
              <ChevronDown size={14} className={showMods ? 'flip' : ''} />
            </button>
            {showMods && (
              <div className="invite-mod-list">
                {!preview ? (
                  <Loader2 size={16} className="spin" />
                ) : (
                  preview.mods.map((m) => (
                    <div key={m.title + m.version} className="truncate">
                      <b>{m.title}</b> <span className="text-faint">{m.version}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        <div className="custom-field invite-target">
          <label>Graj na instancji</label>
          <select value={target} onChange={(e) => setTarget(e.target.value)} disabled={!!busy}>
            <option value={NEW}>Nowa instancja „{invite.pack || invite.name}”</option>
            {matching.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} (dograj brakujące mody)
              </option>
            ))}
          </select>
          <div className="field-hint">
            Mody pobiorą się wyłącznie z Modrinth. W istniejącej instancji inne wersje tych samych modów zostaną
            podmienione na wersje z serwera.
          </div>
        </div>

        <div className="crash-footer">
          <span className="crash-footer-gap text-dim">{busy}</span>
          <button className="ghost" onClick={onClose} disabled={!!busy}>
            Nie teraz
          </button>
          <button className="primary" onClick={join} disabled={!!busy}>
            {busy ? <Loader2 size={15} className="spin" /> : <LogIn size={15} />} Dołącz
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
