import { useState } from 'react';
import { useStore } from '../store';
import logo from '../assets/logo.png';

export function LoginScreen() {
  const { refreshAccounts } = useStore();
  const [busy, setBusy] = useState(false);
  const [showOffline, setShowOffline] = useState(false);
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);

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
    if (!username.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await window.api.accounts.offlineLogin(username.trim());
      await refreshAccounts();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <img className="login-logo" src={logo} alt="ZerdaLauncher" />
        <h1>ZerdaLauncher</h1>
        <p>Twój własny launcher Minecraft Java Edition</p>

        {error && <div className="error">{error}</div>}

        {!showOffline ? (
          <div className="login-actions">
            <button className="primary" onClick={handleMs} disabled={busy}>
              {busy ? 'Logowanie…' : 'Zaloguj się przez Microsoft'}
            </button>
            <button onClick={() => setShowOffline(true)} disabled={busy}>
              Tryb offline
            </button>
          </div>
        ) : (
          <div>
            <div className="form-row" style={{ textAlign: 'left' }}>
              <label>Nazwa gracza</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Steve"
                maxLength={16}
                autoFocus
              />
            </div>
            <div className="login-actions">
              <button className="primary" onClick={handleOffline} disabled={busy || !username.trim()}>
                Wejdź offline
              </button>
              <button className="ghost" onClick={() => setShowOffline(false)} disabled={busy}>
                Wróć
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
