import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Loader2, Link2, TriangleAlert, Check } from 'lucide-react';
import { useStore } from '../store';
import { useBackdropClose } from '../hooks/useBackdropClose';
import { ModalHeader } from '../ui/ModalHeader';
import { showToast } from '../ui/feedback';
import { markInviteSeen } from '../invites';
import { plural } from '../format';
import { t } from '../i18n';
import type { Instance, InviteCreated } from '../../shared/types';

/** Make a zerda://join link: server address + this instance's loader and Modrinth mods. */
export function InviteCreateModal({
  instances,
  address: initialAddress,
  name: initialName,
  onClose
}: {
  /** One instance, or several to choose from (e.g. matching a hosted server). */
  instances: Instance[];
  address?: string;
  name?: string;
  onClose: () => void;
}) {
  const accounts = useStore((s) => s.accounts);
  const activeId = useStore((s) => s.activeAccountId);
  const me = (accounts.find((a) => a.id === activeId) ?? accounts[0])?.username;
  const [instanceId, setInstanceId] = useState(instances[0]?.id ?? '');
  const [address, setAddress] = useState(initialAddress ?? instances[0]?.serverAddress ?? '');
  const [name, setName] = useState(initialName ?? '');
  const [result, setResult] = useState<InviteCreated | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const backdrop = useBackdropClose(onClose);

  // Any change invalidates the generated link.
  useEffect(() => setResult(null), [instanceId, address, name]);

  const make = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await window.api.invites.create(instanceId, address, name || address, me);
      markInviteSeen(r.link);
      setResult(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!result) return;
    const text = t(`Zagraj ze mną na ${name || address}! Skopiuj tę wiadomość i otwórz ZerdaLauncher: ${result.link}`);
    try {
      await navigator.clipboard.writeText(text);
      // The copied message contains the link; don't offer the user their own invite.
      markInviteSeen(result.link);
      setCopied(true);
      showToast('Skopiowano zaproszenie — wklej je znajomemu.', 'success');
    } catch {
      showToast('Nie udało się skopiować.', 'error');
    }
  };

  return createPortal(
    <div className="modal-backdrop" {...backdrop}>
      <div className="modal mod-modal invite-modal" onClick={(e) => e.stopPropagation()}>
        <ModalHeader
          title="Zaproś znajomego"
          subtitle="Znajomy z ZerdaLauncherem dostanie Twoje mody i od razu wejdzie na serwer"
          onClose={onClose}
        />

        {instances.length > 1 && (
          <div className="custom-field">
            <label>Paczka (instancja z modami)</label>
            <select value={instanceId} onChange={(e) => setInstanceId(e.target.value)}>
              {instances.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} · {i.mcVersion} {i.loader}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="invite-fields">
          <div className="custom-field">
            <label>Adres serwera</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="np. mc.example.com:25565" />
          </div>
          <div className="custom-field">
            <label>Nazwa (opcjonalnie)</label>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={address || 'Nasz serwer'} />
          </div>
        </div>
        {error && <div className="error">{error}</div>}

        {result && (
          <div className="invite-result">
            <textarea readOnly value={result.link} rows={3} onFocus={(e) => e.currentTarget.select()} />
            <div className="field-hint">
              {result.modCount} {plural(result.modCount, 'mod', 'mody', 'modów')} w zaproszeniu · {result.link.length} znaków
              {result.link.length > 1800 && ' — może nie zmieścić się w jednej wiadomości na Discordzie (limit 2000)'}
            </div>
            {result.skipped.length > 0 && (
              <div className="invite-warn">
                <TriangleAlert size={15} />
                <span>
                  Tych modów nie ma na Modrinth, więc nie trafią do zaproszenia — wyślij je osobno:{' '}
                  {result.skipped.join(', ')}
                </span>
              </div>
            )}
            <div className="field-hint">
              Znajomy kopiuje wiadomość i przełącza się na ZerdaLauncher — zaproszenie pojawi się samo.
            </div>
          </div>
        )}

        <div className="crash-footer">
          <span className="crash-footer-gap" />
          {!result ? (
            <button className="primary" onClick={make} disabled={busy || !address.trim() || !instanceId}>
              {busy ? <Loader2 size={15} className="spin" /> : <Link2 size={15} />} Utwórz zaproszenie
            </button>
          ) : (
            <button className="primary" onClick={copy}>
              {copied ? <Check size={15} /> : <Copy size={15} />} Kopiuj wiadomość
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
