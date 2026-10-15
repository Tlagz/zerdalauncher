import { useState } from 'react';
import { LogIn, WifiOff, ArrowLeft, Loader2 } from 'lucide-react';
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
              {busy ? <Loader2 size={16} className="spin" /> : <LogIn size={16} />}
              {busy ? 'Logowanie…' : 'Zaloguj się przez Microsoft'}
            </button>
            <button onClick={() => setShowOffline(true)} disabled={busy}>
              <WifiOff size={16} /> Tryb offline
            </button>
          </div>
        ) : (
          <div>
            <div className="form-row login-offline-form">
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
                <LogIn size={16} /> Wejdź offline
              </button>
              <button className="ghost" onClick={() => setShowOffline(false)} disabled={busy}>
                <ArrowLeft size={16} /> Wróć
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
