import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { v4 as uuid } from 'uuid';
import { paths } from '../utils/paths';
import { readJson, writeJson } from '../utils/store';
import { listAccounts, addAccount, ensureFreshToken } from './accounts';
import type { Account, SkinEntry } from '../../shared/types';

const SKINS_API = 'https://api.minecraftservices.com/minecraft/profile/skins';
const skinsDir = path.join(paths.root, 'skins');
const manifestPath = path.join(skinsDir, 'skins.json');

function ensureDir(): void {
  fs.mkdirSync(skinsDir, { recursive: true });
}
function loadManifest(): SkinEntry[] {
  return readJson<SkinEntry[]>(manifestPath, []);
}
function saveManifest(list: SkinEntry[]): void {
  ensureDir();
  writeJson(manifestPath, list);
}
function skinFile(id: string): string {
  return path.join(skinsDir, `${id}.png`);
}

/** Newest-first list of saved skins. */
export function listSkins(): SkinEntry[] {
  return loadManifest().sort((a, b) => b.addedAt - a.addedAt);
}

/** Parse a PNG header for its pixel dimensions (no decoding). */
function readPngSize(buf: Buffer): { w: number; h: number } | null {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 24 || !buf.subarray(0, 8).equals(sig)) return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

/** Validate + import a PNG file into the library. Returns the new entry. */
export function addSkinFromFile(
  filePath: string,
  name?: string,
  variant: 'classic' | 'slim' = 'classic'
): SkinEntry {
  const buf = fs.readFileSync(filePath);
  const size = readPngSize(buf);
  if (!size) throw new Error('To nie jest prawidłowy plik PNG.');
  if (!(size.w === 64 && (size.h === 64 || size.h === 32))) {
    throw new Error(`Skin musi mieć wymiary 64×64 (lub 64×32). Ten ma ${size.w}×${size.h}.`);
  }
  ensureDir();
  const id = uuid();
  fs.writeFileSync(skinFile(id), buf);
  const entry: SkinEntry = {
    id,
    name: (name?.trim() || path.basename(filePath).replace(/\.png$/i, '')) || 'Skin',
    variant,
    addedAt: Date.now()
  };
  const list = loadManifest();
  list.push(entry);
  saveManifest(list);
  return entry;
}

export function updateSkin(
  id: string,
  patch: { name?: string; variant?: 'classic' | 'slim' }
): SkinEntry[] {
  const list = loadManifest();
  const entry = list.find((s) => s.id === id);
  if (entry) {
    if (patch.name !== undefined) entry.name = patch.name.trim() || entry.name;
    if (patch.variant) entry.variant = patch.variant;
    saveManifest(list);
  }
  return listSkins();
}

export function deleteSkin(id: string): SkinEntry[] {
  try {
    fs.rmSync(skinFile(id), { force: true });
  } catch {
    /* ignore */
  }
  saveManifest(loadManifest().filter((s) => s.id !== id));
  // Detach the skin from any account that referenced it.
  for (const acc of listAccounts()) {
    if (acc.skinId === id) addAccount({ ...acc, skinId: undefined });
  }
  return listSkins();
}

/** A saved skin as a data URL (for previews + the 3D viewer). */
export function skinDataUrl(id: string): string | null {
  try {
    return `data:image/png;base64,${fs.readFileSync(skinFile(id)).toString('base64')}`;
  } catch {
    return null;
  }
}

/** Build a multipart/form-data body by hand (avoids a form-data dependency). */
function buildMultipart(
  variant: string,
  png: Buffer
): { body: Buffer; contentType: string } {
  const boundary = '----ZerdaSkin' + Date.now().toString(16);
  const head =
    `--${boundary}\r\nContent-Disposition: form-data; name="variant"\r\n\r\n${variant}\r\n` +
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="skin.png"\r\n` +
    `Content-Type: image/png\r\n\r\n`;
  const tail = `\r\n--${boundary}--\r\n`;
  return {
    body: Buffer.concat([Buffer.from(head, 'utf8'), png, Buffer.from(tail, 'utf8')]),
    contentType: `multipart/form-data; boundary=${boundary}`
  };
}

async function uploadSkinToMojang(
  token: string,
  variant: 'classic' | 'slim',
  png: Buffer
): Promise<void> {
  const { body, contentType } = buildMultipart(variant, png);
  const res = await fetch(SKINS_API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType },
    body
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Mojang odrzucił skina (HTTP ${res.status}). ${text.slice(0, 180)}`);
  }
}

/**
 * Apply a library skin to an account. Microsoft accounts get the skin uploaded
 * to Mojang (changes it in-game); offline accounts get a launcher-only cosmetic
 * override so the viewer reflects the choice.
 */
export async function applySkin(accountId: string, skinId: string): Promise<Account> {
  const acc = listAccounts().find((a) => a.id === accountId);
  if (!acc) throw new Error('Nie znaleziono konta.');
  const entry = loadManifest().find((s) => s.id === skinId);
  if (!entry) throw new Error('Nie znaleziono skina w bibliotece.');

  if (acc.type === 'microsoft') {
    const fresh = await ensureFreshToken(acc);
    if (!fresh.accessToken) throw new Error('Brak tokenu konta — zaloguj się ponownie.');
    await uploadSkinToMojang(fresh.accessToken, entry.variant, fs.readFileSync(skinFile(skinId)));
    const updated = { ...fresh, skinId };
    addAccount(updated);
    return updated;
  }
  const updated = { ...acc, skinId };
  addAccount(updated);
  return updated;
}

/** Reset to the default skin (Mojang DELETE for premium; clears override otherwise). */
export async function resetSkin(accountId: string): Promise<Account> {
  const acc = listAccounts().find((a) => a.id === accountId);
  if (!acc) throw new Error('Nie znaleziono konta.');
  if (acc.type === 'microsoft') {
    const fresh = await ensureFreshToken(acc);
    const res = await fetch(`${SKINS_API}/active`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${fresh.accessToken}` }
    });
    if (!res.ok) throw new Error('Nie udało się przywrócić domyślnego skina.');
    const updated = { ...fresh, skinId: undefined };
    addAccount(updated);
    return updated;
  }
  const updated = { ...acc, skinId: undefined };
  addAccount(updated);
  return updated;
}
