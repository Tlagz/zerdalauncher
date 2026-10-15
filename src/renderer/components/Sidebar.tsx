import { House, Gamepad2, Server, Users, Settings } from 'lucide-react';
import { useStore } from '../store';
import { AccountAvatar } from './AccountAvatar';
import { transition } from '../ui/viewTransition';
import { useIndicator } from '../ui/useIndicator';
import logo from '../assets/logo.png';

const NAV = [
  { id: 'home', label: 'Start', icon: House },
  { id: 'instances', label: 'Instancje', icon: Gamepad2 },
  { id: 'servers', label: 'Serwery', icon: Server },
  { id: 'accounts', label: 'Konta', icon: Users },
  { id: 'settings', label: 'Ustawienia', icon: Settings }
] as const;

export function Sidebar() {
  const { page, setPage, accounts, activeAccountId } = useStore();
  const active = accounts.find((a) => a.id === activeAccountId) ?? accounts[0];
  // No CSS transition here: page changes run inside a View Transition, which
  // morphs the pill itself (view-transition-name: nav-indicator).
  const indicator = useIndicator<HTMLElement>(page, 'y');

  const go = (id: (typeof NAV)[number]['id']) => {
    if (id !== page) transition(() => setPage(id));
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <img className="brand-logo" src={logo} alt="" />
        <span className="brand-text">
          Zerda<span>Launcher</span>
        </span>
      </div>

      <nav className="sidebar-nav" ref={indicator.ref}>
        <span className="nav-indicator" style={indicator.style} aria-hidden />
        {NAV.map(({ id, label, icon: Icon }) => (
          <div
            key={id}
            role="button"
            tabIndex={0}
            data-active={page === id}
            className={`nav-item ${page === id ? 'active' : ''}`}
            onClick={() => go(id)}
            onKeyDown={(e) => e.key === 'Enter' && go(id)}
          >
            <Icon className="nav-icon" strokeWidth={2} />
            {label}
          </div>
        ))}
      </nav>

      {active && (
        <div
          className="sidebar-account"
          role="button"
          tabIndex={0}
          title="Konta i skiny"
          onClick={() => go('accounts')}
          onKeyDown={(e) => e.key === 'Enter' && go('accounts')}
        >
          <AccountAvatar account={active} />
          <div className="sidebar-account-meta">
            <div className="sidebar-account-name truncate">{active.username}</div>
            <div className="sidebar-account-type">{active.type === 'microsoft' ? 'Premium' : 'Offline'}</div>
          </div>
        </div>
      )}
    </aside>
  );
}
