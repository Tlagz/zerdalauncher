import fs from 'fs';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { v4 as uuid } from 'uuid';
import { paths, serverDir } from '../utils/paths';
import { readJson, writeJson } from '../utils/store';
import { getJson, downloadFile } from '../utils/http';
import { fetchVersionData } from '../minecraft/manifest';
import { resolveJava } from '../minecraft/jre';
import { fabricLoaders } from '../modloaders/fabric';
import type { AppSettings, Instance, ServerInstance, ServerStatus } from '../../shared/types';

const FILE = path.join(paths.root, 'servers.json');
const running = new Map<string, ChildProcess>();

let emitLog: (id: string, line: string) => void = () => {};
let emitStatus: (s: ServerStatus) => void = () => {};

export function initServers(
  onLog: (id: string, line: string) => void,
  onStatus: (s: ServerStatus) => void
): void {
  emitLog = onLog;
  emitStatus = onStatus;
}

export function listServers(): ServerInstance[] {
  return readJson<ServerInstance[]>(FILE, []);
}
function saveServers(items: ServerInstance[]): void {
  writeJson(FILE, items);
}
export function getServer(id: string): ServerInstance | null {
  return listServers().find((s) => s.id === id) ?? null;
}
export function runningServerIds(): string[] {
  return [...running.keys()];
}

export interface CreateServerOptions {
  name: string;
  mcVersion: string;
  loader: 'vanilla' | 'fabric';
  ramMb?: number;
  port?: number;
}

export type SrvProgress = (current: number, total: number, msg: string) => void;

export async function createServer(
  opts: CreateServerOptions,
  progress: SrvProgress
): Promise<ServerInstance> {
  const id = uuid();
  const srv: ServerInstance = {
    id,
    name: opts.name.trim() || 'Serwer',
    mcVersion: opts.mcVersion,
    loader: opts.loader,
    ramMb: opts.ramMb ?? 2048,
    port: opts.port ?? 25565,
    createdAt: Date.now(),
    jarReady: false
  };
  const dir = serverDir(id);
  fs.mkdirSync(dir, { recursive: true });
  const jar = path.join(dir, 'server.jar');

  progress(0, 1, 'Pobieram server.jar…');
  if (opts.loader === 'fabric') {
    const loaderVer = (await fabricLoaders(opts.mcVersion))[0];
    if (!loaderVer) throw new Error('Brak Fabric Loader dla tej wersji Minecraft.');
    const installers = await getJson<Array<{ version: string }>>(
      'https://meta.fabricmc.net/v2/versions/installer'
    );
    const installerVer = installers[0]?.version;
    if (!installerVer) throw new Error('Nie udało się pobrać wersji instalatora Fabric.');
    srv.loaderVersion = loaderVer;
    const url = `https://meta.fabricmc.net/v2/versions/loader/${opts.mcVersion}/${loaderVer}/${installerVer}/server/jar`;
    await downloadFile(url, jar);
  } else {
    const data = await fetchVersionData(opts.mcVersion);
    const dl = (data.downloads as { server?: { url: string; sha1: string } } | undefined)?.server;
    if (!dl?.url) throw new Error('Ta wersja Minecraft nie udostępnia serwera (zbyt stara?).');
    await downloadFile(dl.url, jar, dl.sha1);
  }

  // Accept the Mojang EULA and seed a minimal server.properties (port + motd).
  fs.writeFileSync(path.join(dir, 'eula.txt'), 'eula=true\n');
  if (!fs.existsSync(path.join(dir, 'server.properties'))) {
    fs.writeFileSync(
      path.join(dir, 'server.properties'),
      `server-port=${srv.port}\nmotd=${srv.name}\nonline-mode=true\n`
    );
  }
  fs.mkdirSync(path.join(dir, 'mods'), { recursive: true });

  srv.jarReady = true;
  const all = listServers();
  all.push(srv);
  saveServers(all);
  progress(1, 1, 'Gotowe.');
  return srv;
}

function settings(): AppSettings {
  return readJson<AppSettings>(paths.settings, {} as AppSettings);
}

export async function startServer(id: string): Promise<void> {
  const srv = getServer(id);
  if (!srv) throw new Error('Brak serwera.');
  if (running.has(id)) return;

  emitStatus({ id, state: 'starting', message: 'Przygotowuję środowisko Java…' });
  let javaExe: string;
  try {
    const data = await fetchVersionData(srv.mcVersion);
    javaExe = await resolveJava({ javaPath: undefined } as unknown as Instance, data, settings(), (_p, _c, _t, m) =>
      emitLog(id, `[setup] ${m ?? ''}\n`)
    );
  } catch (e) {
    emitStatus({ id, state: 'error', message: (e as Error).message });
    throw e;
  }

  const dir = serverDir(id);
  const child = spawn(
    javaExe,
    [`-Xmx${srv.ramMb}M`, `-Xms${Math.min(1024, srv.ramMb)}M`, '-jar', 'server.jar', 'nogui'],
    { cwd: dir, stdio: ['pipe', 'pipe', 'pipe'] }
  );
  running.set(id, child);
  emitStatus({ id, state: 'running', message: 'Serwer wstaje…' });
  emitLog(id, `\n=== Start serwera „${srv.name}" (${srv.mcVersion} · ${srv.loader}) ===\n`);

  child.stdout?.on('data', (b) => emitLog(id, b.toString()));
  child.stderr?.on('data', (b) => emitLog(id, b.toString()));
  child.on('exit', (code) => {
    running.delete(id);
    emitLog(id, `\n=== Serwer zatrzymany (kod ${code ?? 0}) ===\n`);
    emitStatus({ id, state: 'stopped', message: `Zatrzymany (kod ${code ?? 0})` });
  });
  child.on('error', (e) => {
    running.delete(id);
    emitStatus({ id, state: 'error', message: e.message });
  });
}

export function stopServer(id: string): void {
  const c = running.get(id);
  if (!c) return;
  try {
    c.stdin?.write('stop\n');
  } catch {
    /* ignore */
  }
  setTimeout(() => {
    if (running.has(id)) {
      try {
        c.kill();
      } catch {
        /* ignore */
      }
    }
  }, 12000);
}

export function sendCommand(id: string, cmd: string): void {
  const c = running.get(id);
  if (!c) throw new Error('Serwer nie jest uruchomiony.');
  c.stdin?.write(cmd.replace(/\n+$/, '') + '\n');
}

export function addLocalMods(id: string, filePaths: string[]): void {
  const dir = path.join(serverDir(id), 'mods');
  fs.mkdirSync(dir, { recursive: true });
  for (const src of filePaths) {
    if (!/\.jar$/i.test(src)) continue;
    try {
      fs.copyFileSync(src, path.join(dir, path.basename(src)));
    } catch {
      /* ignore */
    }
  }
}

export function getProps(id: string): Record<string, string> {
  const p = path.join(serverDir(id), 'server.properties');
  if (!fs.existsSync(p)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i > 0) out[line.slice(0, i)] = line.slice(i + 1);
  }
  return out;
}

export function setProps(id: string, patch: Record<string, string>): void {
  const merged = { ...getProps(id), ...patch };
  const body = Object.entries(merged)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  fs.writeFileSync(path.join(serverDir(id), 'server.properties'), body + '\n');
}

export function deleteServer(id: string): void {
  stopServer(id);
  const c = running.get(id);
  if (c) {
    try {
      c.kill();
    } catch {
      /* ignore */
    }
    running.delete(id);
  }
  try {
    fs.rmSync(serverDir(id), { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
  } catch {
    /* ignore */
  }
  saveServers(listServers().filter((s) => s.id !== id));
}

/** Kill all running servers (called on app quit so none are orphaned). */
export function killAllServers(): void {
  for (const c of running.values()) {
    try {
      c.kill();
    } catch {
      /* ignore */
    }
  }
  running.clear();
}
