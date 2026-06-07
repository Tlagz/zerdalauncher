import { useStore } from '../store';
import logo from '../assets/logo.png';

const NAV = [
  { id: 'instances', label: 'Instancje', icon: '🎮' },
  { id: 'accounts', label: 'Konta', icon: '👤' },
  { id: 'settings', label: 'Ustawienia', icon: '⚙️' }
] as const;

export function Sidebar() {
  const { page, setPage, accounts, activeAccountId } = useStore();
  const active = accounts.find((a) => a.id === activeAccountId) ?? accounts[0];

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <img className="brand-logo" src={logo} alt="" />
        <span className="brand-text">
          Zerda<span>Launcher</span>
        </span>
      </div>

      <nav className="sidebar-nav">
        {NAV.map((item) => (
          <div
            key={item.id}
            className={`nav-item ${page === item.id ? 'active' : ''}`}
            onClick={() => setPage(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </div>
        ))}
      </nav>

      {active && (
        <div className="sidebar-account">
          <div className="avatar">{active.username.charAt(0).toUpperCase()}</div>
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontSize: 13, fontWeight: 600, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
              {active.username}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              {active.type === 'microsoft' ? 'Premium' : 'Offline'}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
