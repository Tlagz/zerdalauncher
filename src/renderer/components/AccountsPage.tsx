import { useState } from 'react';
import { useStore } from '../store';
import { SkinView } from './SkinView';
import { SkinLibraryModal } from './SkinLibraryModal';
import { confirmDialog } from '../ui/feedback';

export function AccountsPage() {
  const { accounts, activeAccountId, refreshAccounts } = useStore();
  const active = accounts.find((a) => a.id === activeAccountId) ?? accounts[0];
  const [offlineName, setOfflineName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSkins, setShowSkins] = useState(false);

  const handleMs = async () => {
    setBusy(true);
    setError(null);
    try {
      await window.api.accounts.msLogin();
      await refreshAccounts();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleOffline = async () => {
    if (!offlineName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await window.api.accounts.offlineLogin(offlineName.trim());
      setOfflineName('');
      await refreshAccounts();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (id: string) => {
    const acc = accounts.find((a) => a.id === id);
    const ok = await confirmDialog({
      title: 'Usunąć konto?',
      message: `Konto „${acc?.username ?? ''}" zostanie usunięte z launchera.`,
      danger: true,
      confirmLabel: 'Usuń konto'
    });
    if (!ok) return;
    await window.api.accounts.remove(id);
    await refreshAccounts();
  };

  const handleSelect = async (id: string) => {
    await window.api.accounts.selectActive(id);
    await refreshAccounts();
  };

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Konta</div>
          <div className="page-subtitle">Zarządzaj kontami Microsoft i offline</div>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {active && (
        <div className="section skin-section">
          <div className="skin-stage">
            <SkinView account={active} key={active.id} />
          </div>
          <div className="skin-info">
            <div className="skin-name">{active.username}</div>
            <div className="skin-type">
              {active.type === 'microsoft' ? 'Microsoft · Premium' : 'Konto offline'}
            </div>
            <div className="skin-hint">🖱️ Przeciągnij, aby obrócić postać</div>
            <button className="primary" style={{ marginTop: 14 }} onClick={() => setShowSkins(true)}>
              🎨 Biblioteka skinów
            </button>
          </div>
        </div>
      )}

      {showSkins && active && (
        <SkinLibraryModal account={active} onClose={() => setShowSkins(false)} />
      )}

      <div className="section">
        <h3>Twoje konta</h3>
        {accounts.length === 0 && <div className="empty">Brak kont.</div>}
        {accounts.map((a) => (
          <div key={a.id} className={`account-row ${a.id === activeAccountId ? 'active' : ''}`}>
            <div className="avatar">{a.username.charAt(0).toUpperCase()}</div>
            <div className="meta">
              <div style={{ fontWeight: 600 }}>{a.username}</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                {a.type === 'microsoft' ? 'Microsoft (Premium)' : 'Offline'}
                {a.id === activeAccountId && <span className="badge"> • aktywne</span>}
              </div>
            </div>
            {a.id !== activeAccountId && (
              <button onClick={() => handleSelect(a.id)}>Wybierz</button>
            )}
            <button className="danger" onClick={() => handleRemove(a.id)}>
              Usuń
            </button>
          </div>
        ))}
      </div>

      <div className="section">
        <h3>Dodaj konto</h3>
        <div className="field-grid">
          <div>
            <label>Microsoft</label>
            <button className="primary" onClick={handleMs} disabled={busy} style={{ width: '100%' }}>
              Zaloguj się przez Microsoft
            </button>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>
              Wymaga zakupionego Minecraft Java Edition.
            </div>
          </div>
          <div>
            <label>Offline</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={offlineName}
                onChange={(e) => setOfflineName(e.target.value)}
                placeholder="Nazwa gracza"
                maxLength={16}
              />
              <button onClick={handleOffline} disabled={busy || !offlineName.trim()}>
                Dodaj
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>
              Tylko do gry na serwerach offline / lokalnych światach.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
