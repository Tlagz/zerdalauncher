import { Client } from '@xhayper/discord-rpc';
import { readJson } from './utils/store';
import { paths } from './utils/paths';
import type { AppSettings } from '../shared/types';
import { tr } from '../shared/i18n';

let client: Client | null = null;
let ready = false;

/** Where the player is inside the game, read from the game log. */
export type GameWhere =
  | { kind: 'menu' }
  | { kind: 'world'; name?: string }
  | { kind: 'server'; address: string; players?: { online: number; max: number } };

let current: { name: string; sub: string; start: number; where: GameWhere } | null = null;

// ZerdaLauncher's Discord application id (public — not a secret). Used by default
// so Rich Presence works out of the box; a settings override still takes priority.
const DEFAULT_DISCORD_CLIENT_ID = '1513933047299440690';

/** Presence texts follow the launcher language. */
const L = (text: string) => tr(text, readJson<Partial<AppSettings>>(paths.settings, {}).language ?? 'pl');

function clientId(): string {
  const s = readJson<Partial<AppSettings>>(paths.settings, {});
  return (s.discordClientId || '').trim() || DEFAULT_DISCORD_CLIENT_ID;
}

const SITE = 'https://zerdalauncher.pl';
const buttons = () => [{ label: L('Pobierz Zerda Launcher'), url: SITE }];

function idle(): void {
  try {
    client?.user?.setActivity({
      details: 'Zerda Launcher',
      state: L('W menu głównym'),
      largeImageKey: 'logo',
      largeImageText: 'Zerda Launcher',
      startTimestamp: Date.now(),
      buttons: buttons()
    });
  } catch {
    /* ignore */
  }
}

function stateText(w: GameWhere): string {
  if (w.kind === 'server') return L(`Na serwerze ${w.address}`);
  if (w.kind === 'world') return w.name ? L(`Świat: ${w.name}`) : L('Gra jednoosobowa');
  return L('W menu gry');
}

function apply(a: NonNullable<typeof current>): void {
  const party = a.where.kind === 'server' && a.where.players && a.where.players.max > 0 ? a.where.players : undefined;
  try {
    client?.user?.setActivity({
      details: L(`Gra w ${a.name}`).slice(0, 128),
      state: stateText(a.where).slice(0, 128),
      startTimestamp: a.start,
      largeImageKey: 'logo',
      largeImageText: a.sub || 'Zerda Launcher',
      ...(party ? { partySize: Math.max(1, party.online), partyMax: Math.max(party.online, party.max) } : {}),
      instance: false,
      buttons: buttons()
    });
  } catch {
    /* ignore */
  }
}

/** Connect to a running Discord client (no-op if no client id / Discord absent). */
export async function initDiscord(): Promise<void> {
  const id = clientId();
  if (!id || client) return;
  try {
    client = new Client({ clientId: id });
    await client.login();
    ready = true;
    if (current) apply(current);
    else idle();
  } catch {
    client = null;
    ready = false;
  }
}

/** Re-connect after the user changes the Discord client id in settings. */
export async function reinitDiscord(): Promise<void> {
  try {
    await client?.destroy();
  } catch {
    /* ignore */
  }
  client = null;
  ready = false;
  await initDiscord();
}

export function setPlaying(name: string, sub: string, where: GameWhere = { kind: 'menu' }): void {
  current = { name, sub, start: Date.now(), where };
  if (ready) apply(current);
}

/** Update where the player is (world / server / menu) without resetting the timer. */
export function setWhere(where: GameWhere): void {
  if (!current) return;
  current = { ...current, where };
  if (ready) apply(current);
}

export function setIdle(): void {
  current = null;
  if (ready) idle();
}
