import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store';
import { useBackdropClose } from '../hooks/useBackdropClose';
import { confirmDialog, alertDialog, showToast } from '../ui/feedback';
import type { Account, SkinEntry } from '../../shared/types';

/** Pixel-art face crop (head + hat overlay) drawn from a skin PNG data URL. */
function SkinFace({ src, size = 76 }: { src?: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !src) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, 8, 8, 8, 8, 0, 0, size, size); // base face
      ctx.drawImage(img, 40, 8, 8, 8, 0, 0, size, size); // hat layer
    };
    img.src = src;
  }, [src, size]);
  return <canvas ref={ref} width={size} height={size} className="skin-face" />;
}

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
        <div className="mod-modal-head">
          <div>
            <h3 style={{ margin: 0 }}>Biblioteka skinów</h3>
            <div style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 4 }}>
              Konto: <b>{account.username}</b> ·{' '}
              {isPremium ? 'Microsoft — zmiana działa też w grze' : 'Offline — podgląd w launcherze'}
            </div>
          </div>
          <button className="ghost" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="skin-toolbar">
          <button className="primary" onClick={add}>
            ＋ Dodaj skina (PNG 64×64)
          </button>
          {account.skinId && (
            <button className="ghost" onClick={reset} disabled={busy === 'reset'}>
              ↺ Domyślny skin
            </button>
          )}
        </div>

        {!isPremium && (
          <div
            className="error"
            style={{ background: '#2a2418', color: 'var(--warning)', borderColor: '#4a3a1f' }}
          >
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
                  {isActive && <span className="skin-active-badge">✓ Aktywny</span>}
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
                      {busy === s.id ? 'Ustawiam…' : isActive ? 'Ustaw ponownie' : 'Ustaw'}
                    </button>
                    <button className="danger" title="Usuń z biblioteki" onClick={() => remove(s)}>
                      🗑
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
