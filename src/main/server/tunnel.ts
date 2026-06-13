import fs from 'fs';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import AdmZip from 'adm-zip';
import { paths } from '../utils/paths';
import { downloadFile } from '../utils/http';
import type { TunnelStatus } from '../../shared/types';

// bore (github.com/ekzhang/bore) — a tiny TCP tunnel, no account needed.
const BORE_VERSION = 'v0.6.0';
const tunnels = new Map<string, ChildProcess>();

let emitTunnel: (s: TunnelStatus) => void = () => {};
export function initTunnel(cb: (s: TunnelStatus) => void): void {
  emitTunnel = cb;
}

function boreAssetName(): string {
  const arch = process.arch === 'ia32' ? 'i686' : 'x86_64';
  return `bore-${BORE_VERSION}-${arch}-pc-windows-msvc.zip`;
}

/** Download + cache the bore.exe agent on first use, return its path. */
async function ensureBore(): Promise<string> {
  const binDir = path.join(paths.cache, 'bin');
  const exe = path.join(binDir, 'bore.exe');
  if (fs.existsSync(exe)) return exe;
  fs.mkdirSync(binDir, { recursive: true });
  const asset = boreAssetName();
  const zipPath = path.join(paths.cache, asset);
  await downloadFile(`https://github.com/ekzhang/bore/releases/download/${BORE_VERSION}/${asset}`, zipPath);
  const entry = new AdmZip(zipPath).getEntries().find((e) => /bore\.exe$/i.test(e.entryName));
  if (!entry) throw new Error('Nie znaleziono bore.exe w pobranym archiwum.');
  fs.writeFileSync(exe, entry.getData());
  return exe;
}

export function isTunnelActive(serverId: string): boolean {
  return tunnels.has(serverId);
}

/** Open a public TCP tunnel (bore.pub) to the given local port. */
export async function startTunnel(serverId: string, port: number): Promise<void> {
  if (tunnels.has(serverId)) return;
  emitTunnel({ id: serverId, state: 'starting', message: 'Uruchamiam tunel…' });

  let exe: string;
  try {
    exe = await ensureBore();
  } catch (e) {
    emitTunnel({ id: serverId, state: 'error', message: (e as Error).message });
    throw e;
  }

  const child = spawn(exe, ['local', String(port), '--to', 'bore.pub'], {
    stdio: ['ignore', 'pipe', 'pipe']
  });
  tunnels.set(serverId, child);

  let resolved = false;
  const onData = (b: Buffer) => {
    const s = b.toString();
    const m =
      s.match(/remote_port[=:\s]+(\d+)/i) ||
      s.match(/bore\.pub:(\d+)/i) ||
      s.match(/listening at \S*?:(\d+)/i);
    if (m && !resolved) {
      resolved = true;
      emitTunnel({ id: serverId, state: 'active', address: `bore.pub:${m[1]}` });
    }
  };
  child.stdout?.on('data', onData);
  child.stderr?.on('data', onData);
  child.on('exit', () => {
    tunnels.delete(serverId);
    emitTunnel({ id: serverId, state: 'stopped' });
  });
  child.on('error', (e) => {
    tunnels.delete(serverId);
    emitTunnel({ id: serverId, state: 'error', message: e.message });
  });
}

export function stopTunnel(serverId: string): void {
  const c = tunnels.get(serverId);
  if (c) {
    try {
      c.kill();
    } catch {
      /* ignore */
    }
    tunnels.delete(serverId);
  }
  emitTunnel({ id: serverId, state: 'stopped' });
}

export function stopAllTunnels(): void {
  for (const c of tunnels.values()) {
    try {
      c.kill();
    } catch {
      /* ignore */
    }
  }
  tunnels.clear();
}
