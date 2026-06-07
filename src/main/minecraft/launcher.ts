import { spawn } from 'child_process';
import path from 'path';
import { paths, instanceGameDir } from '../utils/paths';
import { evaluateRules, VersionData, ArgumentItem } from './manifest';
import type { Account, Instance } from '../../shared/types';
import { PreparedVersion } from './downloader';

export interface LaunchOptions {
  instance: Instance;
  account: Account;
  prepared: PreparedVersion;
  javaExe: string;
  onExit: (code: number | null) => void;
  onLog?: (line: string) => void;
}

export function launchGame(opts: LaunchOptions): void {
  const { instance, account, prepared, javaExe } = opts;
  if (!javaExe) throw new Error('Nie znaleziono instalacji Java.');

  const gameDir = instanceGameDir(instance.id);
  const cpSeparator = process.platform === 'win32' ? ';' : ':';
  const classpath = prepared.classpath.join(cpSeparator);

  const jvmArgs: string[] = [
    `-Xmx${instance.ramMb}M`,
    `-Xms${Math.min(512, instance.ramMb)}M`,
    `-Djava.library.path=${prepared.nativesDir}`,
    `-Dminecraft.launcher.brand=ZerdaLauncher`,
    `-Dminecraft.launcher.version=0.1.0`
  ];

  if (instance.jvmArgs?.trim()) {
    jvmArgs.push(...instance.jvmArgs.trim().split(/\s+/));
  }

  // Manifest jvm args (post-1.13)
  if (prepared.data.arguments?.jvm) {
    jvmArgs.push(...resolveArgs(prepared.data.arguments.jvm, prepared.data, account, instance, prepared, classpath));
  } else {
    // Legacy versions: classpath via -cp manually
    jvmArgs.push('-cp', classpath);
  }

  const mainClass = prepared.data.mainClass;

  let gameArgs: string[] = [];
  if (prepared.data.arguments?.game) {
    gameArgs = resolveArgs(prepared.data.arguments.game, prepared.data, account, instance, prepared, classpath);
  } else if (prepared.data.minecraftArguments) {
    gameArgs = prepared.data.minecraftArguments
      .split(/\s+/)
      .map((a) => substituteVars(a, prepared.data, account, instance, prepared, classpath));
  }

  const args = [...jvmArgs, mainClass, ...gameArgs];
  opts.onLog?.(`[launch] ${javaExe} ${args.join(' ')}`);

  const child = spawn(javaExe, args, {
    cwd: gameDir,
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.stdout?.on('data', (b) => opts.onLog?.(b.toString()));
  child.stderr?.on('data', (b) => opts.onLog?.(b.toString()));
  child.on('exit', (code) => opts.onExit(code));
}

function resolveArgs(
  items: ArgumentItem[],
  data: VersionData,
  account: Account,
  instance: Instance,
  prepared: PreparedVersion,
  classpath: string
): string[] {
  const out: string[] = [];
  for (const item of items) {
    if (typeof item === 'string') {
      out.push(substituteVars(item, data, account, instance, prepared, classpath));
    } else if (evaluateRules(item.rules)) {
      const vals = Array.isArray(item.value) ? item.value : [item.value];
      for (const v of vals) out.push(substituteVars(v, data, account, instance, prepared, classpath));
    }
  }
  return out;
}

function substituteVars(
  template: string,
  data: VersionData,
  account: Account,
  instance: Instance,
  prepared: PreparedVersion,
  classpath: string
): string {
  const vars: Record<string, string> = {
    auth_player_name: account.username,
    version_name: data.id,
    game_directory: instanceGameDir(instance.id),
    assets_root: paths.assets,
    assets_index_name: prepared.assetIndexId,
    auth_uuid: account.uuid.replace(/-/g, ''),
    auth_access_token: account.accessToken ?? '0',
    clientid: 'ZerdaLauncher',
    auth_xuid: account.xuid ?? '0',
    user_type: account.type === 'microsoft' ? 'msa' : 'legacy',
    version_type: data.type,
    natives_directory: prepared.nativesDir,
    launcher_name: 'ZerdaLauncher',
    launcher_version: '0.1.0',
    classpath,
    // Required by modern Forge / NeoForge for the BootstrapLauncher module path.
    library_directory: paths.libraries,
    classpath_separator: process.platform === 'win32' ? ';' : ':',
    user_properties: '{}',
    auth_session: account.accessToken ?? '0',
    game_assets: path.join(paths.assets, 'virtual', 'legacy')
  };
  return template.replace(/\$\{([^}]+)\}/g, (_, key) => vars[key] ?? `\${${key}}`);
}
