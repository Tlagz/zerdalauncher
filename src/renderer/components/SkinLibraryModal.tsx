import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store';
import { useBackdropClose } from '../hooks/useBackdropClose';
import { confirmDialog, alertDialog, showToast } from '../ui/feedback';
import { SkinFace } from './SkinFace';
import { ModalHeader } from '../ui/ModalHeader';
import { Plus, RotateCcw, TriangleAlert, Check, Trash2, Loader2 } from 'lucide-react';
import type { Account, SkinEntry } from '../../shared/types';

export function SkinLibraryModal({ account, onClose }: { account: Account; onClose: () => void }) {
  const { refreshAccounts } = useStore();
  const [skins, setSkins] = useState<SkinEntry[]>([]);
  const [data, setData] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const backdrop = useBackdropClose(onClose);

  const isPremium = account.type === 'microsoft';

  const loadData = async (list: SkinEntry[]) => {
    const entries = await Promise.all(
      list.map(async (s) => [s.id, (await window.api.skins.data(s.id)) ?? ''] as const)
    );
    setData(Object.fromEntries(entries));
  };

  const refresh = async () => {
    const list = await window.api.skins.list();
    setSkins(list);
    void loadData(list);
  };

  useEffect(() => {
    refresh();
  }, []);

  const add = async () => {
    try {
      const res = await window.api.skins.add();
      if (res.added > 0) {
        setSkins(res.skins);
        void loadData(res.skins);
        showToast(`Dodano ${res.added} skin(ów) do biblioteki.`, 'success');
      }
    } catch (e) {
      alertDialog({ title: 'Nie udało się dodać skina', message: (e as Error).message, tone: 'error' });
    }
  };

  const setVariant = async (id: string, variant: 'classic' | 'slim') => {
    setSkins(await window.api.skins.update(id, { variant }));
  };

  const rename = async (id: string, name: string) => {
    setSkins(await window.api.skins.update(id, { name }));
  };

  const remove = async (s: SkinEntry) => {
    const ok = await confirmDialog({
      title: 'Usunąć skina?',
      message: `„${s.name}" zniknie z biblioteki.`,
      danger: true
    });
    if (!ok) return;
    setSkins(await window.api.skins.delete(s.id));
  };

  const apply = async (s: SkinEntry) => {
    setBusy(s.id);
    try {
      await window.api.skins.apply(account.id, s.id);
      await refreshAccounts();
      showToast(
        isPremium
          ? `Ustawiono skina „${s.name}" na koncie ${account.username}.`
          : `Skin „${s.name}" ustawiony w launcherze (konto offline — nie zmienia gry online).`,
        'success'
      );
    } catch (e) {
      alertDialog({ title: 'Nie udało się ustawić skina', message: (e as Error).message, tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const reset = async () => {
    const ok = await confirmDialog({
      title: 'Przywrócić domyślny skin?',
      message: isPremium
        ? `Skin konta ${account.username} wróci do domyślnego (Steve/Alex).`
        : 'Launcher przestanie nakładać wybrany skin na to konto.'
    });
    if (!ok) return;
    setBusy('reset');
    try {
      await window.api.skins.reset(account.id);
      await refreshAccounts();
      showToast('Przywrócono domyślny skin.', 'success');
    } catch (e) {
      alertDialog({ message: (e as Error).message, tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return createPortal(
    <div className="modal-backdrop" {...backdrop}>
      <div className="modal mod-modal skin-library" onClick={(e) => e.stopPropagation()}>
        <ModalHeader
          title="Biblioteka skinów"
          subtitle={
            <span>
              Konto: <b>{account.username}</b> ·{' '}
              {isPremium ? 'Microsoft — zmiana działa też w grze' : 'Offline — podgląd w launcherze'}
            </span>
          }
          onClose={onClose}
        />

        <div className="skin-toolbar">
          <button className="primary" onClick={add}>
            <Plus size={16} /> Dodaj skina (PNG 64×64)
          </button>
          {account.skinId && (
            <button className="ghost" onClick={reset} disabled={busy === 'reset'}>
              <RotateCcw size={15} /> Domyślny skin
            </button>
          )}
        </div>

        {!isPremium && (
          <div className="notice notice-warning">
            <TriangleAlert size={16} />
            To konto jest offline — skin pokaże się tylko w launcherze. Zmiana skina w grze online
            wymaga konta Microsoft (Premium).
          </div>
        )}

        {skins.length === 0 ? (
          <div className="mod-empty">
            Biblioteka jest pusta. Kliknij „Dodaj skina" i wybierz plik PNG 64×64 (np. z
            namemc.com lub własny).
          </div>
        ) : (
          <div className="skin-grid">
            {skins.map((s) => {
              const isActive = account.skinId === s.id;
              return (
                <div className={`skin-card ${isActive ? 'active' : ''}`} key={s.id}>
                  {isActive && (
                    <span className="skin-active-badge">
                      <Check size={11} /> Aktywny
                    </span>
                  )}
                  <div className="skin-card-preview">
                    <SkinFace src={data[s.id]} />
                  </div>
                  <input
                    className="skin-name-input"
                    defaultValue={s.name}
                    onBlur={(e) => {
                      if (e.target.value.trim() && e.target.value !== s.name) rename(s.id, e.target.value);
                    }}
                  />
                  <div className="skin-variant-toggle">
                    <button
                      className={s.variant === 'classic' ? 'on' : ''}
                      onClick={() => setVariant(s.id, 'classic')}
                    >
                      Classic
                    </button>
                    <button
                      className={s.variant === 'slim' ? 'on' : ''}
                      onClick={() => setVariant(s.id, 'slim')}
                    >
                      Slim
                    </button>
                  </div>
                  <div className="skin-card-actions">
                    <button className="primary" onClick={() => apply(s)} disabled={busy === s.id}>
                      {busy === s.id && <Loader2 size={14} className="spin" />}
                      {busy === s.id ? 'Ustawiam…' : isActive ? 'Ustaw ponownie' : 'Ustaw'}
                    </button>
                    <button className="danger" title="Usuń z biblioteki" onClick={() => remove(s)}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
