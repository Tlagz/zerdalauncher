import zlib from 'zlib';
import { clipboard } from 'electron';
import { getInstance, listInstances, createInstance } from './minecraft/instances';
import { identifyContent, installedHashes, installContent, listInstalledContent, updateContent } from './mods';
import * as modrinth from './mods/modrinth';
import { readJson } from './utils/store';
import { paths } from './utils/paths';
import type { AppSettings, Invite, InviteCreated, InvitePreview, ModFile, ModLoader } from '../shared/types';

const PREFIX = 'zerda://join/';
const LINK_RE = /zerda:\/\/join\/([A-Za-z0-9_-]{8,8000})/;
const LOADERS: ModLoader[] = ['vanilla', 'fabric', 'forge', 'neoforge'];
const MAX_MODS = 600;

export function encodeInvite(inv: Invite): string {
  return PREFIX + zlib.deflateRawSync(Buffer.from(JSON.stringify(inv), 'utf8'), { level: 9 }).toString('base64url');
}

const str = (v: unknown, max: number): string | undefined =>
  typeof v === 'string' && v.length <= max ? v : undefined;

/**
 * Find and decode an invite in any text (a pasted Discord message, a zerda://
 * link). Invites come from other people, so every field is checked.
 */
export function findInvite(text: string): Invite | null {
  const m = text.match(LINK_RE);
  if (!m) return null;
  try {
    const raw = JSON.parse(zlib.inflateRawSync(Buffer.from(m[1], 'base64url'), { maxOutputLength: 200_000 }).toString('utf8'));
    const address = str(raw.address, 255);
    const mc = str(raw.mc, 64);
    if (raw.v !== 1 || !address || !/^[\w.\-:[\]]+$/.test(address) || !mc || !/^[\w.\-]+$/.test(mc)) return null;
    if (!LOADERS.includes(raw.loader)) return null;
    const mods = Array.isArray(raw.mods) ? raw.mods.filter((id: unknown) => typeof id === 'string' && /^[A-Za-z0-9]{8}$/.test(id)) : [];
    return {
      v: 1,
      name: (str(raw.name, 80) ?? address).trim() || address,
      address,
      mc,
      loader: raw.loader,
      loaderVersion: str(raw.loaderVersion, 64)?.match(/^[\w.+\-]+$/)?.[0],
      pack: str(raw.pack, 80)?.trim() || undefined,
      from: str(raw.from, 32),
      mods: mods.slice(0, MAX_MODS)
    };
  } catch {
    return null;
  }
}

/** An invite sitting in the clipboard (checked when the launcher gets focus). */
export function inviteFromClipboard(): { invite: Invite; link: string } | null {
  const text = clipboard.readText();
  const invite = findInvite(text);
  return invite ? { invite, link: text.match(LINK_RE)![0] } : null;
}

/** Build an invite for an instance: its loader and every enabled mod that's on Modrinth. */
export async function createInvite(instanceId: string, address: string, name: string, from?: string): Promise<InviteCreated> {
  const inst = getInstance(instanceId);
  if (!inst) throw new Error('Brak instancji.');
  const addr = address.trim();
  if (!/^[\w.\-:[\]]+$/.test(addr)) throw new Error('Nieprawidłowy adres serwera.');

  await identifyContent(instanceId, 'mod').catch(() => undefined);
  const hashes = await installedHashes(instanceId, 'mod');
  const enabled = listInstalledContent(instanceId, 'mod').filter((m) => m.enabled);
  const known = await modrinth.versionsByHash(enabled.map((m) => hashes.get(m.fileName)).filter((h): h is string => !!h));
  const mods: string[] = [];
  const skipped: string[] = [];
  for (const m of enabled) {
    const v = known[hashes.get(m.fileName) ?? ''];
    if (v) mods.push(v.fileId);
    else skipped.push(m.title ?? m.fileName);
  }
  const link = encodeInvite({
    v: 1,
    name: name.trim().slice(0, 80) || addr,
    address: addr,
    mc: inst.mcVersion,
    loader: inst.loader,
    loaderVersion: inst.loaderVersion,
    pack: inst.name.slice(0, 80),
    from: from?.slice(0, 32),
    mods: [...new Set(mods)]
  });
  return { link, modCount: mods.length, skipped };
}

/** Mod names for the invite dialog + existing instances that could be reused. */
export async function previewInvite(inv: Invite): Promise<InvitePreview> {
  const versions = await modrinth.versionsByIds(inv.mods);
  const projects = await modrinth.projectsByIds([...new Set(versions.map((v) => v.projectId))]).catch(() => []);
  const title = new Map(projects.map((p) => [p.id, p.title]));
  return {
    mods: versions
      .map((v) => ({ title: title.get(v.projectId) ?? v.displayName, version: v.displayName }))
      .sort((a, b) => a.title.localeCompare(b.title)),
    matching: listInstances()
      .filter((i) => i.mcVersion === inv.mc && i.loader === inv.loader)
      .map((i) => i.id)
  };
}

/**
 * Get an instance ready for the invite: create one (or reuse the chosen one),
 * then install the invited mod versions — replacing other versions of the same
 * mods so the client matches the server.
 */
export async function acceptInvite(
  inv: Invite,
  useInstanceId: string | null,
  progress: (current: number, total: number, message: string) => void
): Promise<string> {
  const inst = useInstanceId
    ? getInstance(useInstanceId)
    : createInstance({
        name: inv.pack || inv.name,
        mcVersion: inv.mc,
        loader: inv.loader,
        loaderVersion: inv.loaderVersion,
        ramMb: readJson<Partial<AppSettings>>(paths.settings, {}).defaultRamMb ?? 4096
      });
  if (!inst) throw new Error('Brak instancji.');
  if (inst.mcVersion !== inv.mc || inst.loader !== inv.loader) {
    throw new Error('Ta instancja ma inną wersję Minecrafta lub loader niż serwer.');
  }

  progress(0, inv.mods.length, 'Sprawdzam mody…');
  // Recognise hand-added copies of the same mods so they get replaced, not duplicated.
  await identifyContent(inst.id, 'mod').catch(() => undefined);
  const wanted: ModFile[] = await modrinth.versionsByIds(inv.mods);
  let done = 0;
  for (const file of wanted) {
    progress(done, wanted.length, file.displayName);
    const installed = listInstalledContent(inst.id, 'mod');
    const same = installed.find((m) => m.provider === 'modrinth' && m.projectId === file.projectId);
    try {
      if (!same) await installContent(inst.id, 'mod', file, false);
      else if (same.fileId !== file.fileId) await updateContent(inst.id, 'mod', same.fileName, file);
    } catch {
      /* one broken download shouldn't block joining; the crash dialog will point at it */
    }
    progress(++done, wanted.length, file.displayName);
  }
  return inst.id;
}
