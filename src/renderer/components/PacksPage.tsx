import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus,
  RefreshCw,
  Download,
  Play,
  CircleArrowUp,
  Pencil,
  Upload,
  Trash2,
  ScrollText,
  Loader2,
  KeyRound,
  Link2,
  Package
} from 'lucide-react';
import { useStore } from '../store';
import { useLaunch } from '../hooks/useLaunch';
import { useBackdropClose } from '../hooks/useBackdropClose';
import { ModalHeader } from '../ui/ModalHeader';
import { alertDialog, confirmDialog, showToast } from '../ui/feedback';
import { formatDate, formatSize } from '../format';
import { openExternal } from '../links';
import { PublishPackModal } from './PublishPackModal';
import type { CatalogPack, Instance, PublisherStatus } from '../../shared/types';

function ChangesModal({ pack, onClose }: { pack: CatalogPack; onClose: () => void }) {
  const backdrop = useBackdropClose(onClose);
  return createPortal(
    <div className="modal-backdrop" {...backdrop}>
      <div className="modal mod-modal notes-modal" onClick={(e) => e.stopPropagation()}>
        <ModalHeader title={`Historia zmian — ${pack.name}`} subtitle={`${pack.versions.length} wersji`} onClose={onClose} />
        <div className="notes-scroll">
          {pack.versions.map((v) => (
            <div className="changelog-entry" key={v.version}>
              <div className="changelog-head">
                <span className="tag">v{v.version}</span>
                <span className="text-faint">
                  {formatDate(Date.parse(v.date))} · {v.mods} modów · {formatSize(v.size)}
                </span>
              </div>
              {v.changelog ? <p className="pack-changelog" data-no-i18n>{v.changelog}</p> : null}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}

function PackCard({
  pack,
  installed,
  owner,
  onChanged,
  onEdit,
  onVersion
}: {
  pack: CatalogPack;
  installed?: Instance;
  owner: boolean;
  onChanged: () => void;
  onEdit: () => void;
  onVersion: () => void;
}) {
  const latest = pack.versions[0];
  const [busy, setBusy] = useState<string | null>(null);
  const [showChanges, setShowChanges] = useState(false);
  const outdated = installed?.pack && latest && installed.pack.version !== latest.version;

  useEffect(() => window.api.modpacks.onProgress((p) => busy && setBusy(p.message)), [busy]);

  const run = async (label: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(label);
    try {
      await fn();
      await useStore.getState().refreshInstances();
      showToast(done, 'success');
      onChanged();
    } catch (e) {
      alertDialog({ title: 'Coś poszło nie tak', message: (e as Error).message, tone: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    const ok = await confirmDialog({
      title: 'Usunąć paczkę?',
      message: `„${pack.name}" zniknie z listy u wszystkich graczy, a jej pliki z GitHuba. Zainstalowane instancje zostaną.`,
      danger: true,
      confirmLabel: 'Usuń paczkę'
    });
    if (ok) await run('Usuwam…', () => window.api.packs.delete(pack.id), `Usunięto „${pack.name}”.`);
  };

  return (
    <div className="pack-card">
      <div className="pack-head">
        {pack.icon ? <img className="pack-icon" src={pack.icon} alt="" /> : <div className="pack-icon placeholder"><Package size={26} /></div>}
        <div className="pack-title">
          <div className="pack-name truncate" data-no-i18n>
            {pack.name}
          </div>
          <div className="instance-meta">
            <span className="tag">{pack.mcVersion}</span>
            <span className={`tag ${pack.loader}`}>{pack.loader}</span>
            {latest && <span className="tag">v{latest.version}</span>}
          </div>
        </div>
      </div>
      <p className="pack-desc" data-no-i18n>
        {pack.description || '—'}
      </p>
      {latest && (
        <div className="pack-stats">
          {latest.mods} modów · {formatSize(latest.size)} · {formatDate(Date.parse(pack.updated || latest.date))}
        </div>
      )}
      {busy && (
        <div className="pack-busy">
          <Loader2 size={14} className="spin" /> {busy}
        </div>
      )}
      <div className="pack-actions">
        {!installed ? (
          <button
            className="primary"
            disabled={!!busy || !latest}
            onClick={() => run('Instaluję…', () => window.api.packs.install(pack.id), `Zainstalowano „${pack.name}”.`)}
          >
            <Download size={15} /> Zainstaluj
          </button>
        ) : outdated ? (
          <button
            className="primary"
            disabled={!!busy}
            onClick={() =>
              run('Aktualizuję…', () => window.api.packs.update(installed.id), `${pack.name} zaktualizowana do ${latest.version}.`)
            }
          >
            <CircleArrowUp size={15} /> Aktualizuj do v{latest.version}
          </button>
        ) : (
          <InstalledPlay instance={installed} />
        )}
        <button className="ghost icon-btn" title="Historia zmian" onClick={() => setShowChanges(true)} disabled={!latest}>
          <ScrollText size={16} />
        </button>
        {owner && (
          <>
            <span className="crash-footer-gap" />
            <button className="ghost icon-btn" title="Nowa wersja" onClick={onVersion} disabled={!!busy}>
              <Upload size={16} />
            </button>
            <button className="ghost icon-btn" title="Edytuj kartę" onClick={onEdit} disabled={!!busy}>
              <Pencil size={16} />
            </button>
            <button className="ghost icon-btn danger" title="Usuń paczkę" onClick={remove} disabled={!!busy}>
              <Trash2 size={16} />
            </button>
          </>
        )}
      </div>
      {showChanges && <ChangesModal pack={pack} onClose={() => setShowChanges(false)} />}
    </div>
  );
}

function InstalledPlay({ instance }: { instance: Instance }) {
  const { launch, isLaunching, isRunning } = useLaunch(instance);
  return (
    <button className="primary" disabled={isLaunching || isRunning} onClick={() => launch()}>
      {isLaunching ? <Loader2 size={15} className="spin" /> : <Play size={15} />} {isRunning ? 'Gra działa' : 'Graj'}
    </button>
  );
}

/** Owner only: connect the GitHub account that hosts the packs. */
function OwnerPanel({ status, onStatus }: { status: PublisherStatus; onStatus: (s: PublisherStatus) => void }) {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  if (status.login) {
    return (
      <div className="owner-panel ok">
        <Link2 size={16} /> Publikujesz jako <b>{status.login}</b>
        {status.repoExists === false && <span className="text-dim"> · repozytorium powstanie przy pierwszej paczce</span>}
        <span className="crash-footer-gap" />
        <button
          className="ghost btn-sm"
          onClick={async () => {
            await window.api.packs.forgetToken();
            onStatus(await window.api.packs.status());
          }}
        >
          Odłącz
        </button>
      </div>
    );
  }
  return (
    <div className="owner-panel">
      <div className="owner-panel-text">
        <KeyRound size={16} />
        <span>
          Żeby wrzucać paczki z launchera, połącz GitHub: utwórz token (classic) z uprawnieniem <code>public_repo</code> i
          wklej go tutaj. Zapisze się zaszyfrowany tylko na tym komputerze.
        </span>
      </div>
      <div className="owner-panel-row">
        <button
          className="ghost btn-sm"
          onClick={() => openExternal('https://github.com/settings/tokens/new?scopes=public_repo&description=ZerdaLauncher%20paczki')}
        >
          <KeyRound size={14} /> Utwórz token
        </button>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="ghp_…"
          autoComplete="off"
        />
        <button
          className="primary btn-sm"
          disabled={busy || !token.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              onStatus(await window.api.packs.setToken(token));
              setToken('');
            } catch (e) {
              alertDialog({ title: 'Nie udało się połączyć', message: (e as Error).message, tone: 'error' });
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Loader2 size={14} className="spin" /> : null} Połącz
        </button>
      </div>
    </div>
  );
}

/** Curated modpacks by Sztulagz: everyone installs and updates; the owner publishes. */
export function PacksPage() {
  const instances = useStore((s) => s.instances);
  const activeAccountId = useStore((s) => s.activeAccountId);
  const [packs, setPacks] = useState<CatalogPack[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<PublisherStatus>({ isOwner: false });
  const [publish, setPublish] = useState<{ mode: 'new' | 'version' | 'edit'; pack?: CatalogPack } | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async (fresh = false) => {
    setLoading(true);
    setError(null);
    try {
      setPacks(await window.api.packs.list(fresh));
    } catch (e) {
      setError((e as Error).message);
      setPacks((p) => p ?? []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    window.api.packs.status().then(setStatus, () => undefined);
  }, [activeAccountId]);

  const canPublish = status.isOwner && !!status.login;

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Paczki Sztulagz</div>
          <div className="page-subtitle">Modpacki przygotowane przez Sztulagz — instalacja i aktualizacje jednym kliknięciem</div>
        </div>
        <div className="header-actions">
          <button className="ghost" onClick={() => load(true)} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'spin' : ''} /> Odśwież
          </button>
          {canPublish && (
            <button className="primary" onClick={() => setPublish({ mode: 'new' })}>
              <Plus size={16} /> Nowa paczka
            </button>
          )}
        </div>
      </div>

      {status.isOwner && <OwnerPanel status={status} onStatus={setStatus} />}
      {error && <div className="error">{error}</div>}

      {packs && packs.length === 0 && !error && (
        <div className="empty">
          <Package size={34} className="text-faint" />
          <h2>Jeszcze nie ma paczek</h2>
          <p>{canPublish ? 'Kliknij „Nowa paczka", żeby opublikować pierwszą instancję.' : 'Sztulagz niedługo coś tu wrzuci.'}</p>
        </div>
      )}
      {!packs && (
        <div className="mod-empty">
          <Loader2 size={20} className="spin" />
        </div>
      )}

      {packs && packs.length > 0 && (
        <div className="packs-grid">
          {packs.map((p) => (
            <PackCard
              key={p.id}
              pack={p}
              installed={instances.find((i) => i.pack?.id === p.id)}
              owner={canPublish}
              onChanged={() => load(true)}
              onEdit={() => setPublish({ mode: 'edit', pack: p })}
              onVersion={() => setPublish({ mode: 'version', pack: p })}
            />
          ))}
        </div>
      )}

      {publish && (
        <PublishPackModal mode={publish.mode} pack={publish.pack} onClose={() => setPublish(null)} onDone={() => load(true)} />
      )}
    </>
  );
}
