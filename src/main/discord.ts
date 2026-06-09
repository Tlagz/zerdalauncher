import { Client } from '@xhayper/discord-rpc';
import { readJson } from './utils/store';
import { paths } from './utils/paths';
import type { AppSettings } from '../shared/types';

let client: Client | null = null;
let ready = false;
let current: { name: string; sub: string; start: number } | null = null;

function clientId(): string {
  const s = readJson<Partial<AppSettings>>(paths.settings, {});
  return (s.discordClientId || '').trim();
}

const SITE = 'https://zerdalauncher.pl';
const BUTTONS = [{ label: 'Pobierz Zerda Launcher', url: SITE }];

function idle(): void {
  try {
    client?.user?.setActivity({
      details: 'Zerda Launcher',
      state: 'W menu głównym',
      largeImageKey: 'logo',
      largeImageText: 'Zerda Launcher',
      startTimestamp: Date.now(),
      buttons: BUTTONS
    });
  } catch {
    /* ignore */
  }
}

function apply(a: { name: string; sub: string; start: number }): void {
  try {
    client?.user?.setActivity({
      details: 'Zerda Launcher',
      state: 'Gra w ' + a.name,
      startTimestamp: a.start,
      largeImageKey: 'logo',
      largeImageText: a.sub || 'Zerda Launcher',
      instance: false,
      buttons: BUTTONS
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

export function setPlaying(name: string, sub: string): void {
  current = { name, sub, start: Date.now() };
  if (ready) apply(current);
}

export function setIdle(): void {
  current = null;
  if (ready) idle();
}
