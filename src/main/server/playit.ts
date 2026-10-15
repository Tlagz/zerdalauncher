import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawn, type ChildProcess } from 'child_process';
import { safeStorage, shell } from 'electron';
import fetch from 'node-fetch';
import { paths } from '../utils/paths';
import { readJson, writeJson } from '../utils/store';
import { downloadFile } from '../utils/http';

/**
 * playit.gg relay for players behind CGNAT / without UPnP. Uses playit's public
 * API (same calls as their open-source agent, packages/api_client) to link an
 * agent to the user's account once, create a "minecraft-java" tunnel per
 * server, and runs the signed playit agent with that secret to carry traffic.
 */
const API = 'https://api.playit.gg';
const AGENT_VERSION = 'v1.0.10';
const AGENT_URL = `https://github.com/playit-cloud/playit-agent/releases/download/${AGENT_VERSION}/playit-windows-x86_64-signed.exe`;
const STATE_FILE = path.join(paths.root, 'playit.json');
const CLAIM_TIMEOUT_MS = 5 * 60_000;

interface PlayitState {
  /** Agent secret, encrypted with the OS keychain (DPAPI) when available. */
  secret?: string;
  encrypted?: boolean;
  /** serverId -> playit tunnel id, so a server keeps the same address. */
  tunnels: Record<string, string>;
}

const loadState = (): PlayitState => ({ tunnels: {}, ...readJson<Partial<PlayitState>>(STATE_FILE, {}) });
const saveState = (s: PlayitState): void => writeJson(STATE_FILE, s);

function readSecret(): string | null {
  const s = loadState();
  if (!s.secret) return null;
  try {
    return s.encrypted ? safeStorage.decryptString(Buffer.from(s.secret, 'base64')) : s.secret;
  } catch {
    return null;
  }
}

function storeSecret(secret: string): void {
  const s = loadState();
  const canEncrypt = safeStorage.isEncryptionAvailable();
  s.secret = canEncrypt ? safeStorage.encryptString(secret).toString('base64') : secret;
  s.encrypted = canEncrypt;
  saveState(s);
}

/** The stored agent secret was rejected (agent removed on playit.gg, account changed…). */
export class PlayitAuthError extends Error {}

export function forgetSecret(): void {
  const s = loadState();
  delete s.secret;
  delete s.encrypted;
  s.tunnels = {};
  saveState(s);
}

async function api<T>(route: string, body: unknown, secret?: string): Promise<T> {
  const res = await fetch(API + route, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(secret ? { authorization: `Agent-Key ${secret}` } : {})
    },
    body: JSON.stringify(body)
  });
  const json = (await res.json().catch(() => null)) as {
    status?: string;
    data?: { type?: string; message?: string } | unknown;
  } | null;
  if (!json || json.status !== 'success') {
    const data = json?.data as { type?: string; message?: string } | undefined;
    if (data?.type === 'auth') throw new PlayitAuthError(`playit.gg: ${data.message ?? 'auth'}`);
    const detail = data?.message ?? (data ? JSON.stringify(data) : `HTTP ${res.status}`);
    throw new Error(`playit.gg: ${detail}`);
  }
  return json.data as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Returns the agent secret, linking this launcher to the user's playit account
 * first if needed: we open playit.gg/claim/<code> in the browser and wait until
 * they accept it there.
 */
export async function ensureSecret(onClaim: (url: string) => void): Promise<string> {
  const existing = readSecret();
  if (existing) return existing;

  const code = crypto.randomBytes(5).toString('hex');
  const url = `https://playit.gg/claim/${code}`;
  const deadline = Date.now() + CLAIM_TIMEOUT_MS;
  let announced = false;
  for (;;) {
    const status = await api<string>('/claim/setup', { code, agent_type: 'self-managed', version: 'zerda-launcher' });
    if (status === 'UserAccepted') break;
    if (status === 'UserRejected') throw new Error('Połączenie z playit.gg zostało odrzucone.');
    if (!announced) {
      announced = true;
      onClaim(url);
      void shell.openExternal(url);
    }
    if (Date.now() > deadline) throw new Error('Nie dokończono logowania do playit.gg (minęło 5 minut).');
    await sleep(2000);
  }
  const { secret_key } = await api<{ secret_key: string }>('/claim/exchange', { code });
  storeSecret(secret_key);
  return secret_key;
}

interface AgentTunnel {
  id: string;
  port: { from: number; to: number };
  local_port: number;
  assigned_domain: string;
  custom_domain: string | null;
  disabled: string | null;
}
interface RunData {
  agent_id: string;
  account_status: string;
  tunnels: AgentTunnel[];
}

/** The server's tunnel (created on first use, recreated if its port changed). */
export async function ensureTunnel(secret: string, serverId: string, name: string, port: number): Promise<string> {
  const state = loadState();
  const run = await api<RunData>('/agents/rundata', {}, secret);
  if (run.account_status === 'banned' || run.account_status === 'account-delete-scheduled') {
    throw new Error(`Konto playit.gg nie może tworzyć tuneli (${run.account_status}).`);
  }
  const known = run.tunnels.find((t) => t.id === state.tunnels[serverId]);
  if (known && known.local_port === port) return known.id;
  if (known) await api('/tunnels/delete', { tunnel_id: known.id }, secret).catch(() => {});

  const { id } = await api<{ id: string }>(
    '/tunnels/create',
    {
      name: `Zerda: ${name}`.slice(0, 60),
      tunnel_type: 'minecraft-java',
      port_type: 'tcp',
      port_count: 1,
      origin: { type: 'agent', data: { agent_id: run.agent_id, local_ip: '127.0.0.1', local_port: port } },
      enabled: true,
      alloc: null,
      firewall_id: null,
      proxy_protocol: null
    },
    secret
  );
  state.tunnels[serverId] = id;
  saveState(state);
  return id;
}

/** Public address of the tunnel; waits briefly while playit allocates it. */
export async function tunnelAddress(secret: string, tunnelId: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const run = await api<RunData>('/agents/rundata', {}, secret);
    const t = run.tunnels.find((x) => x.id === tunnelId);
    if (t && !t.disabled) return t.custom_domain || t.assigned_domain;
    await sleep(2000);
  }
  throw new Error('playit.gg nie przydzielił adresu tunelu.');
}

/** Forget the server's tunnel on playit (when the server is deleted). */
export async function deleteTunnel(serverId: string): Promise<void> {
  const state = loadState();
  const id = state.tunnels[serverId];
  if (!id) return;
  delete state.tunnels[serverId];
  saveState(state);
  const secret = readSecret();
  if (secret) await api('/tunnels/delete', { tunnel_id: id }, secret).catch(() => {});
}

// ---------- agent process ----------

let agent: ChildProcess | null = null;

async function agentExe(): Promise<string> {
  const exe = path.join(paths.cache, 'bin', `playit-${AGENT_VERSION}.exe`);
  if (!fs.existsSync(exe)) {
    fs.mkdirSync(path.dirname(exe), { recursive: true });
    await downloadFile(AGENT_URL, exe);
  }
  return exe;
}

/** One agent serves every tunnel of the account; start it if it isn't running. */
export async function startAgent(secret: string): Promise<void> {
  if (agent && agent.exitCode === null) return;
  const exe = await agentExe();
  agent = spawn(
    exe,
    ['--secret', secret, '-l', path.join(paths.cache, 'playit-agent.log'), '--socket-path', '\\\\.\\pipe\\zerda-playit'],
    { windowsHide: true, stdio: 'ignore' }
  );
  agent.on('exit', () => {
    agent = null;
  });
}

export function stopAgent(): void {
  agent?.kill();
  agent = null;
}
