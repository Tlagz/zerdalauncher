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
import { forgeVersionsFor, installForgeServer } from '../modloaders/forge';
import { neoforgeVersionsFor, installNeoForgeServer } from '../modloaders/neoforge';
import { stopTunnel } from './tunnel';
import type {
  AppSettings,
  Instance,
  ServerInstance,
  ServerLoader,
  ServerStatus
} from '../../shared/types';

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
  loader: ServerLoader;
  ramMb?: number;
  port?: number;
}

export type SrvProgress = (current: number, total: number, msg: string) => void;

/** Loaders whose servers launch via @arg-files (no plain server.jar). */
function isModernLoader(loader: ServerLoader): boolean {
  return loader === 'forge' || loader === 'neoforge';
}

/** Last non-empty line of an installer output chunk, for progress messages. */
function lastLine(chunk: string): string {
  const lines = chunk.split(/\r?\n/).filter((l) => l.trim());
  return lines[lines.length - 1] ?? '';
}

/** Write the JVM args file Forge/NeoForge read at launch (keeps RAM in sync). */
function writeJvmArgs(dir: string, ramMb: number): void {
  fs.writeFileSync(
    path.join(dir, 'user_jvm_args.txt'),
    `# Zarządzane przez Zerda Launcher — nie edytuj ręcznie\n-Xmx${ramMb}M\n-Xms${Math.min(1024, ramMb)}M\n`
  );
}

/**
 * Forge/NeoForge servers are launched with `java @user_jvm_args.txt @<args>.txt`.
 * The installer drops the platform arg file somewhere under libraries/ with the
 * loader version baked into the path, so we locate it instead of hard-coding it.
 */
function findLoaderArgsFile(dir: string): string | null {
  const primary = process.platform === 'win32' ? 'win_args.txt' : 'unix_args.txt';
  const secondary = process.platform === 'win32' ? 'unix_args.txt' : 'win_args.txt';
  const found: Record<string, string> = {};
  const walk = (d: string): void => {
    let entries: string[];
    try {
      entries = fs.readdirSync(d);
    } catch {
      return;
    }
    for (const name of entries) {
      const p = path.join(d, name);
      let st: fs.Stats;
      try {
        st = fs.statSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(p);
      else if (name === primary || name === secondary) {
        found[name] = path.relative(dir, p).split(path.sep).join('/');
      }
    }
  };
  walk(path.join(dir, 'libraries'));
  return found[primary] ?? found[secondary] ?? null;
}

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

  if (opts.loader === 'fabric') {
    progress(0, 1, 'Pobieram server.jar…');
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
  } else if (isModernLoader(opts.loader)) {
    // Forge/NeoForge ship an installer that needs Java to build the server.
    progress(0, 1, 'Przygotowuję środowisko Java…');
    const data = await fetchVersionData(opts.mcVersion);
    const javaExe = await resolveJava(
      { javaPath: undefined } as unknown as Instance,
      data,
      settings(),
      (_p, _c, _t, m) => progress(0, 1, m ?? 'Pobieram Javę…')
    );
    if (opts.loader === 'neoforge') {
      progress(0, 1, 'Szukam wersji NeoForge…');
      const { latest } = await neoforgeVersionsFor(opts.mcVersion);
      if (!latest) throw new Error(`Brak wersji NeoForge dla Minecraft ${opts.mcVersion}.`);
      srv.loaderVersion = latest;
      progress(0, 1, `Instaluję NeoForge ${latest} (to potrwa chwilę)…`);
      await installNeoForgeServer(latest, dir, javaExe, (line) =>
        progress(0, 1, lastLine(line) || 'Instaluję NeoForge…')
      );
    } else {
      progress(0, 1, 'Szukam wersji Forge…');
      const { recommended, latest } = await forgeVersionsFor(opts.mcVersion);
      const forgeVer = recommended || latest;
      if (!forgeVer) throw new Error(`Brak wersji Forge dla Minecraft ${opts.mcVersion}.`);
      srv.loaderVersion = forgeVer;
      progress(0, 1, `Instaluję Forge ${forgeVer} (to potrwa chwilę)…`);
      await installForgeServer(opts.mcVersion, forgeVer, dir, javaExe, (line) =>
        progress(0, 1, lastLine(line) || 'Instaluję Forge…')
      );
    }
    if (!findLoaderArgsFile(dir)) {
      throw new Error('Instalator nie utworzył plików startowych serwera (sprawdź połączenie).');
    }
    writeJvmArgs(dir, srv.ramMb);
  } else {
    progress(0, 1, 'Pobieram server.jar…');
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
  let launchArgs: string[];
  if (isModernLoader(srv.loader)) {
    writeJvmArgs(dir, srv.ramMb); // keep RAM in sync with the instance setting
    const argsFile = findLoaderArgsFile(dir);
    if (!argsFile) {
      const msg = 'Brak plików startowych Forge/NeoForge. Usuń serwer i utwórz go ponownie.';
      emitStatus({ id, state: 'error', message: msg });
      throw new Error(msg);
    }
    launchArgs = ['@user_jvm_args.txt', `@${argsFile}`, 'nogui'];
  } else {
    launchArgs = [`-Xmx${srv.ramMb}M`, `-Xms${Math.min(1024, srv.ramMb)}M`, '-jar', 'server.jar', 'nogui'];
  }
  const child = spawn(javaExe, launchArgs, { cwd: dir, stdio: ['pipe', 'pipe', 'pipe'] });
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
  stopTunnel(id);
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
