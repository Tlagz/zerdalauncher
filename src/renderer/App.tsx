import { useEffect } from 'react';
import { useStore } from './store';
import { Sidebar } from './components/Sidebar';
import { InstancesPage } from './components/InstancesPage';
import { ServersPage } from './components/ServersPage';
import { AccountsPage } from './components/AccountsPage';
import { SettingsPage } from './components/SettingsPage';
import { LoginScreen } from './components/LoginScreen';
import { StatusBar } from './components/StatusBar';
import { UpdateBanner } from './components/UpdateBanner';

export default function App() {
  const { page, accounts, refreshAccounts, refreshInstances, refreshSettings, refreshServers } =
    useStore();

  const settings = useStore((s) => s.settings);

  useEffect(() => {
    refreshAccounts();
    refreshInstances();
    refreshSettings();
    refreshServers();
  }, []);

  // Apply the selected UI theme to <html data-theme="…">.
  useEffect(() => {
    const t = settings?.theme === 'crimson' ? 'default' : settings?.theme || 'default';
    document.documentElement.dataset.theme = t;
  }, [settings?.theme]);

  // A pack opened via double-click (.zerda file association) is imported by the
  // main process; refresh the list and tell the user when it finishes.
  useEffect(() => {
    return window.api.modpacks.onImported((r) => {
      if (r.ok) {
        refreshInstances();
        useStore.getState().setPage('instances');
        alert(`Zaimportowano paczkę${r.name ? ` „${r.name}"` : ''} jako nową instancję.`);
      } else {
        alert(`Nie udało się zaimportować paczki:\n${r.error ?? 'nieznany błąd'}`);
      }
    });
  }, [refreshInstances]);

  const Aurora = (
    <div className="aurora" aria-hidden>
      <span className="aurora-blob a" />
      <span className="aurora-blob b" />
      <span className="aurora-blob c" />
      <span className="aurora-blob d" />
      <div className="aurora-sweep" />
      <div className="aurora-grid" />
      <div className="aurora-stars" />
    </div>
  );

  if (accounts.length === 0) {
    return (
      <>
        {Aurora}
        <LoginScreen />
      </>
    );
  }

  return (
    <>
      {Aurora}
      <UpdateBanner />
      <div className="app">
        <Sidebar />
        <div className="main">
          <div key={page} className="page-fade">
            {page === 'instances' && <InstancesPage />}
            {page === 'servers' && <ServersPage />}
            {page === 'accounts' && <AccountsPage />}
            {page === 'settings' && <SettingsPage />}
          </div>
        </div>
        <StatusBar />
      </div>
    </>
  );
}
