import { paths } from '../utils/paths';
import { readJson, writeJson } from '../utils/store';
import { refreshMicrosoft } from './microsoft';
import type { Account } from '../../shared/types';

interface AccountStore {
  active: string | null;
  accounts: Account[];
}

function load(): AccountStore {
  return readJson<AccountStore>(paths.accounts, { active: null, accounts: [] });
}

function save(store: AccountStore): void {
  writeJson(paths.accounts, store);
}

export function listAccounts(): Account[] {
  return load().accounts;
}

export function activeAccountId(): string | null {
  return load().active;
}

export function selectActive(id: string): void {
  const s = load();
  if (s.accounts.some((a) => a.id === id)) {
    s.active = id;
    save(s);
  }
}

export function addAccount(acc: Account): void {
  const s = load();
  const existing = s.accounts.findIndex((a) => a.id === acc.id);
  if (existing >= 0) s.accounts[existing] = acc;
  else s.accounts.push(acc);
  if (!s.active) s.active = acc.id;
  save(s);
}

export function removeAccount(id: string): void {
  const s = load();
  s.accounts = s.accounts.filter((a) => a.id !== id);
  if (s.active === id) s.active = s.accounts[0]?.id ?? null;
  save(s);
}

export function createOfflineAccount(username: string): Account {
  const trimmed = username.trim() || 'Player';
  // Deterministic offline UUID (offline player namespace)
  const acc: Account = {
    id: 'offline:' + trimmed,
    type: 'offline',
    username: trimmed,
    uuid: offlineUuid(trimmed)
  };
  addAccount(acc);
  return acc;
}

function offlineUuid(name: string): string {
  // Vanilla offline UUID derivation: md5 of "OfflinePlayer:<name>", version 3 UUID
  // Using uuid v5 with a fixed namespace gives stable IDs across runs.
  const crypto = require('crypto') as typeof import('crypto');
  const hash = crypto.createHash('md5').update(`OfflinePlayer:${name}`).digest();
  hash[6] = (hash[6] & 0x0f) | 0x30; // version 3
  hash[8] = (hash[8] & 0x3f) | 0x80; // variant
  const hex = hash.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function ensureFreshToken(acc: Account): Promise<Account> {
  if (acc.type !== 'microsoft') return acc;
  if (acc.expiresAt && acc.expiresAt - 60_000 > Date.now()) return acc;
  if (!acc.refreshToken) throw new Error('Brak refresh tokenu — zaloguj się ponownie.');
  const refreshed = await refreshMicrosoft(acc.refreshToken);
  addAccount(refreshed);
  return refreshed;
}

