import { useEffect, useMemo } from 'react';
import { useStore } from './store';
import { CustomizePage } from './components/CustomizePage';
import { applyAppearance, auroraBlobStyles } from './appearance';
import { resolveAppearance } from '../shared/appearance';
import { Sidebar } from './components/Sidebar';
import { HomePage } from './components/HomePage';
import { InstancesPage } from './components/InstancesPage';
import { ServersPage } from './components/ServersPage';
import { AccountsPage } from './components/AccountsPage';
import { SettingsPage } from './components/SettingsPage';
import { LoginScreen } from './components/LoginScreen';
import { StatusBar } from './components/StatusBar';
import { UpdateBanner } from './components/UpdateBanner';
import { CrashModal } from './components/CrashModal';
import { CommandPalette } from './components/CommandPalette';
import { FeedbackHost, alertDialog, showToast } from './ui/feedback';

export default function App() {
  const { page, accounts, refreshAccounts, refreshInstances, refreshSettings, refreshServers } =
    useStore();

  const settings = useStore((s) => s.settings);
  const backgroundImage = useStore((s) => s.backgroundImage);
  const crash = useStore((s) => s.crash);
  const appearance = useMemo(() => resolveAppearance(settings?.appearance), [settings?.appearance]);

  useEffect(() => {
    refreshAccounts();
    refreshInstances();
    refreshSettings();
    refreshServers();
    window.api.appearance.background().then((img) => useStore.setState({ backgroundImage: img }));
  }, []);

  // Apply the selected UI theme to <html data-theme="…">.
  useEffect(() => {
    document.documentElement.dataset.theme = settings?.theme || 'default';
  }, [settings?.theme]);

  // Personalization: accent, background, motion, glass, radius, sidebar, zoom.
  useEffect(() => {
    if (settings) applyAppearance(appearance);
  }, [appearance, settings]);
  const blobs = auroraBlobStyles(appearance.accent);
  const showImage = appearance.background === 'image' && !!backgroundImage;

  // A pack opened via double-click (.zerda file association) is imported by the
  // main process; refresh the list and tell the user when it finishes.
  useEffect(() => {
    return window.api.modpacks.onImported((r) => {
      if (r.ok) {
        refreshInstances();
        useStore.getState().setPage('instances');
        showToast(`Zaimportowano paczkę${r.name ? ` „${r.name}"` : ''} jako nową instancję.`, 'success');
      } else {
        alertDialog({
          title: 'Import nie powiódł się',
          message: r.error ?? 'nieznany błąd',
          tone: 'error'
        });
      }
    });
  }, [refreshInstances]);

  const Aurora = (
    <>
      <div className="aurora" aria-hidden>
        <span className="aurora-blob a" style={blobs.a} />
        <span className="aurora-blob b" />
        <span className="aurora-blob c" style={blobs.c} />
        <span className="aurora-blob d" />
        <div className="aurora-sweep" />
        <div className="aurora-grid" />
        <div className="aurora-stars" />
      </div>
      {showImage && (
        <div className="bg-image" aria-hidden style={{ backgroundImage: `url("${backgroundImage}")` }} />
      )}
    </>
  );

  if (accounts.length === 0) {
    return (
      <>
        {Aurora}
        <LoginScreen />
        <FeedbackHost />
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
          <div key={page} className="page-body">
            {page === 'home' && <HomePage />}
            {page === 'instances' && <InstancesPage />}
            {page === 'servers' && <ServersPage />}
            {page === 'accounts' && <AccountsPage />}
            {page === 'customize' && <CustomizePage />}
            {page === 'settings' && <SettingsPage />}
          </div>
        </div>
        <StatusBar />
      </div>
      {crash && <CrashModal key={crash.instanceId + crash.logTail.length} report={crash} onClose={() => useStore.setState({ crash: null })} />}
      <CommandPalette />
      <FeedbackHost />
    </>
  );
}
