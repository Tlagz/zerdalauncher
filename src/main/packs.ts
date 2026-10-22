import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import fetch from 'node-fetch';
import { safeStorage } from 'electron';
import { paths, instanceDir } from './utils/paths';
import { readJson, writeJson } from './utils/store';
import { downloadFile } from './utils/http';
import { getInstance, updateInstance } from './minecraft/instances';
import { listAccounts, activeAccountId } from './auth/accounts';
import { exportInstance, installZerdaTracked, updateFromZerda, type PackProgress } from './mods/modpacks';
import { listInstalledContent } from './mods';
import type { CatalogPack, CatalogVersion, PublishRequest, PublisherStatus } from '../shared/types';

/**
 * Sztulagz packs: curated modpacks listed in packs.json of a public GitHub repo,
 * each version a .zerda release asset. Anyone can install; only the owner
 * (Microsoft account _Tlagz_) gets the publishing UI, and writes need the
 * owner's GitHub token — that token is the real protection.
 */
const OWNER_UUID = '52c715ece7d8477cbb7f60337b94d981';
const OWNER = 'Tlagz';
const REPO = 'zerda-packs';
const API = `https://api.github.com/repos/${OWNER}/${REPO}`;
const UA = { 'User-Agent': 'ZerdaLauncher', Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
const TOKEN_FILE = () => path.join(paths.root, 'github.json');
const PACK_FILE = (instanceId: string) => path.join(instanceDir(instanceId), 'pack.json');

interface Catalog {
  version: 1;
  packs: CatalogPack[];
}

// ---------- token ----------

function readToken(): string | null {
  const s = readJson<{ token?: string; encrypted?: boolean }>(TOKEN_FILE(), {});
  if (!s.token) return null;
  try {
    return s.encrypted ? safeStorage.decryptString(Buffer.from(s.token, 'base64')) : s.token;
  } catch {
    return null;
  }
}

function isOwner(): boolean {
  const acc = listAccounts().find((a) => a.id === activeAccountId());
  return acc?.type === 'microsoft' && acc.uuid.replace(/-/g, '').toLowerCase() === OWNER_UUID;
}

async function gh<T>(url: string, init: { method?: string; body?: unknown; raw?: Buffer; type?: string } = {}): Promise<T> {
  const token = readToken();
  if (!token) throw new Error('Najpierw połącz konto GitHub (token).');
  const res = await fetch(url, {
    method: init.method ?? 'GET',
    headers: {
      ...UA,
      Authorization: `Bearer ${token}`,
      ...(init.raw ? { 'Content-Type': init.type ?? 'application/octet-stream' } : init.body ? { 'Content-Type': 'application/json' } : {})
    },
    body: init.raw ?? (init.body ? JSON.stringify(init.body) : undefined)
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      msg = JSON.parse(text).message ?? text;
    } catch {
      /* not JSON */
    }
    throw new Error(`GitHub: ${msg} (HTTP ${res.status})`);
  }
  return (text ? JSON.parse(text) : undefined) as T;
}

export async function publisherStatus(): Promise<PublisherStatus> {
  if (!isOwner()) return { isOwner: false };
  if (!readToken()) return { isOwner: true };
  try {
    const user = await gh<{ login: string }>('https://api.github.com/user');
    const repo = await fetch(API, { headers: UA });
    return { isOwner: true, login: user.login, repoExists: repo.ok };
  } catch {
    return { isOwner: true };
  }
}

/** Save the owner's GitHub token (encrypted with the OS keychain when available). */
export async function setToken(token: string): Promise<PublisherStatus> {
  if (!isOwner()) throw new Error('Publikować może tylko konto _Tlagz_.');
  const t = token.trim();
  const res = await fetch('https://api.github.com/user', { headers: { ...UA, Authorization: `Bearer ${t}` } });
  if (!res.ok) throw new Error('GitHub odrzucił ten token.');
  const { login } = (await res.json()) as { login: string };
  if (login.toLowerCase() !== OWNER.toLowerCase()) throw new Error(`To token konta ${login}, a paczki są na koncie ${OWNER}.`);
  const enc = safeStorage.isEncryptionAvailable();
  writeJson(TOKEN_FILE(), { token: enc ? safeStorage.encryptString(t).toString('base64') : t, encrypted: enc });
  return publisherStatus();
}

export function forgetToken(): void {
  fs.rmSync(TOKEN_FILE(), { force: true });
}

// ---------- catalog ----------

let cache: { at: number; catalog: Catalog } | null = null;

/** packs.json from the repo (API first — not CDN-cached, so new versions show at once). */
async function loadCatalog(fresh = false): Promise<{ catalog: Catalog; sha?: string }> {
  if (!fresh && cache && Date.now() - cache.at < 60_000) return { catalog: cache.catalog };
  const token = isOwner() ? readToken() : null;
  const res = await fetch(`${API}/contents/packs.json`, { headers: token ? { ...UA, Authorization: `Bearer ${token}` } : UA });
  let catalog: Catalog = { version: 1, packs: [] };
  let sha: string | undefined;
  if (res.ok) {
    const body = (await res.json()) as { content: string; sha: string };
    catalog = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8'));
    sha = body.sha;
  } else if (res.status !== 404) {
    // Rate-limited API: fall back to the raw file (may lag a few minutes).
    const raw = await fetch(`https://raw.githubusercontent.com/${OWNER}/${REPO}/main/packs.json`, { headers: UA });
    if (raw.ok) catalog = (await raw.json()) as Catalog;
  }
  cache = { at: Date.now(), catalog };
  return { catalog, sha };
}

export async function listPacks(fresh = false): Promise<CatalogPack[]> {
  return (await loadCatalog(fresh)).catalog.packs;
}

async function saveCatalog(catalog: Catalog, sha: string | undefined, message: string): Promise<void> {
  await gh(`${API}/contents/packs.json`, {
    method: 'PUT',
    body: { message, content: Buffer.from(JSON.stringify(catalog, null, 2)).toString('base64'), ...(sha ? { sha } : {}) }
  });
  cache = { at: Date.now(), catalog };
}

// ---------- install / update (everyone) ----------

async function downloadVersion(v: CatalogVersion, progress: PackProgress): Promise<string> {
  if (!/^https:\/\/github\.com\/Tlagz\/zerda-packs\/releases\/download\//.test(v.url)) {
    throw new Error('Nieprawidłowy adres paczki.');
  }
  const file = path.join(paths.cache, 'packs', `${crypto.createHash('sha1').update(v.url).digest('hex')}.zerda`);
  progress(0, 1, `Pobieram paczkę (${(v.size / 1048576).toFixed(0)} MB)…`);
  await downloadFile(v.url, file, v.sha1);
  return file;
}

export async function installPack(packId: string, progress: PackProgress): Promise<string> {
  const pack = (await listPacks(true)).find((p) => p.id === packId);
  const v = pack?.versions[0];
  if (!pack || !v) throw new Error('Nie znaleziono paczki.');
  const file = await downloadVersion(v, progress);
  const { instanceId, files } = await installZerdaTracked(file, pack.name, progress);
  writeJson(PACK_FILE(instanceId), { id: pack.id, version: v.version, files });
  if (pack.icon) {
    const icon = await fetch(pack.icon).then((r) => (r.ok ? r.buffer() : null)).catch(() => null);
    if (icon) updateInstance(instanceId, { icon: `data:image/png;base64,${icon.toString('base64')}` });
  }
  updateInstance(instanceId, { pack: { id: pack.id, version: v.version } });
  return instanceId;
}

/** Bring an installed pack to its newest version; worlds, settings and the player's own mods stay. */
export async function updatePackInstance(instanceId: string, progress: PackProgress): Promise<void> {
  const inst = getInstance(instanceId);
  if (!inst?.pack) throw new Error('Ta instancja nie pochodzi z paczki.');
  const pack = (await listPacks(true)).find((p) => p.id === inst.pack!.id);
  const v = pack?.versions[0];
  if (!pack || !v) throw new Error('Paczka nie jest już dostępna.');
  const file = await downloadVersion(v, progress);
  const prev = readJson<{ files?: string[] }>(PACK_FILE(instanceId), {}).files ?? [];
  const res = await updateFromZerda(instanceId, file, prev, progress);
  writeJson(PACK_FILE(instanceId), { id: pack.id, version: v.version, files: res.files });
  updateInstance(instanceId, {
    pack: { id: pack.id, version: v.version },
    mcVersion: res.mcVersion,
    loader: res.loader,
    loaderVersion: res.loaderVersion
  });
}

// ---------- publishing (owner) ----------

function slug(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
  return `${base || 'paczka'}-${crypto.randomBytes(2).toString('hex')}`;
}

async function ensureRepo(): Promise<void> {
  const res = await fetch(API, { headers: UA });
  if (res.ok) return;
  await gh('https://api.github.com/user/repos', {
    method: 'POST',
    body: { name: REPO, description: 'Paczki Sztulagz dla ZerdaLaunchera', private: false, auto_init: true }
  });
}

async function putIcon(packId: string, dataUrl: string, message: string): Promise<string> {
  const m = dataUrl.match(/^data:image\/png;base64,(.+)$/);
  if (!m) throw new Error('Ikona musi być obrazem PNG.');
  const file = `icons/${packId}.png`;
  const existing = await gh<{ sha: string }>(`${API}/contents/${file}`).catch(() => null);
  await gh(`${API}/contents/${file}`, { method: 'PUT', body: { message, content: m[1], ...(existing ? { sha: existing.sha } : {}) } });
  return `https://raw.githubusercontent.com/${OWNER}/${REPO}/main/${file}?v=${Date.now()}`;
}

/** Create a pack, release a new version of one, or just edit its card (no instanceId). */
export async function publishPack(req: PublishRequest, progress: PackProgress): Promise<CatalogPack> {
  if (!isOwner()) throw new Error('Publikować może tylko konto _Tlagz_.');
  await ensureRepo();
  const { catalog, sha } = await loadCatalog(true);
  let pack = req.packId ? catalog.packs.find((p) => p.id === req.packId) : undefined;
  if (req.packId && !pack) throw new Error('Nie znaleziono paczki.');
  const isNew = !pack;
  if (!pack) {
    if (!req.instanceId) throw new Error('Wybierz instancję do opublikowania.');
    pack = { id: slug(req.name), name: req.name, description: req.description, mcVersion: '', loader: 'vanilla', updated: '', versions: [] };
    catalog.packs.unshift(pack);
  }
  pack.name = req.name.trim().slice(0, 60) || pack.name;
  pack.description = req.description.trim().slice(0, 2000);

  if (req.instanceId) {
    const inst = getInstance(req.instanceId);
    if (!inst) throw new Error('Brak instancji.');
    const version = (req.version ?? '').trim();
    if (!/^[\w.\-]{1,32}$/.test(version)) throw new Error('Podaj wersję, np. 1.0.0.');
    if (pack.versions.some((v) => v.version === version)) throw new Error(`Wersja ${version} już istnieje.`);

    progress(0, 4, 'Pakuję instancję…');
    const out = path.join(paths.cache, 'packs', `${pack.id}-${version}.zerda`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await exportInstance(
      inst.id,
      out,
      { format: 'zerda', config: true, resourcepacks: true, shaderpacks: true, options: false, worlds: [] },
      (c, t, m) => progress(0, 4, m)
    );
    const data = fs.readFileSync(out);
    const sha1 = crypto.createHash('sha1').update(data).digest('hex');

    progress(1, 4, `Wysyłam paczkę (${(data.length / 1048576).toFixed(1)} MB)…`);
    const tag = `${pack.id}-v${version}`;
    const release = await gh<{ id: number }>(`${API}/releases`, {
      method: 'POST',
      body: { tag_name: tag, name: `${pack.name} ${version}`, body: req.changelog ?? '' }
    });
    const assetName = `${pack.id}-${version}.zerda`;
    const asset = await gh<{ browser_download_url: string }>(
      `https://uploads.github.com/repos/${OWNER}/${REPO}/releases/${release.id}/assets?name=${encodeURIComponent(assetName)}`,
      { method: 'POST', raw: data }
    );
    fs.rmSync(out, { force: true });

    pack.mcVersion = inst.mcVersion;
    pack.loader = inst.loader;
    pack.loaderVersion = inst.loaderVersion;
    pack.versions.unshift({
      version,
      date: new Date().toISOString(),
      changelog: (req.changelog ?? '').slice(0, 4000),
      url: asset.browser_download_url,
      size: data.length,
      sha1,
      mods: listInstalledContent(inst.id, 'mod').filter((m) => m.enabled).length
    });
    // The publishing instance now counts as this version (so it isn't offered its own update).
    writeJson(PACK_FILE(inst.id), { id: pack.id, version, files: readJson<{ files?: string[] }>(PACK_FILE(inst.id), {}).files ?? [] });
    updateInstance(inst.id, { pack: { id: pack.id, version } });
  }

  progress(2, 4, 'Aktualizuję ikonę…');
  if (req.icon) pack.icon = await putIcon(pack.id, req.icon, `Ikona: ${pack.name}`);
  pack.updated = new Date().toISOString();
  progress(3, 4, 'Zapisuję listę paczek…');
  await saveCatalog(
    catalog,
    sha,
    isNew ? `Nowa paczka: ${pack.name}` : req.instanceId ? `${pack.name} ${pack.versions[0].version}` : `Edycja: ${pack.name}`
  );
  progress(4, 4, 'Gotowe.');
  return pack;
}

/** Remove a pack from the list and delete its releases. */
export async function deletePack(packId: string): Promise<void> {
  if (!isOwner()) throw new Error('Publikować może tylko konto _Tlagz_.');
  const { catalog, sha } = await loadCatalog(true);
  const pack = catalog.packs.find((p) => p.id === packId);
  if (!pack) return;
  catalog.packs = catalog.packs.filter((p) => p.id !== packId);
  await saveCatalog(catalog, sha, `Usunięto paczkę: ${pack.name}`);
  const releases = await gh<Array<{ id: number; tag_name: string }>>(`${API}/releases?per_page=100`).catch(() => []);
  for (const r of releases.filter((r) => r.tag_name.startsWith(`${packId}-v`))) {
    await gh(`${API}/releases/${r.id}`, { method: 'DELETE' }).catch(() => undefined);
    await gh(`${API}/git/refs/tags/${encodeURIComponent(r.tag_name)}`, { method: 'DELETE' }).catch(() => undefined);
  }
}
