import fs from 'fs';
import os from 'os';
import path from 'path';
import { paths, instanceGameDir } from '../utils/paths';
import { scanModsFolder, type JarMods } from '../mods/modIds';
import type { CrashIssue, CrashReport, Instance } from '../../shared/types';

export interface CrashContext {
  instance: Instance;
  exitCode: number | null;
  /** Everything the game printed (stdout + stderr). */
  log: string;
  startedAt: number;
  /** Java major the instance's version asks for. */
  requiredJava: number;
  /** The user picked a Java path by hand (instance or global setting). */
  javaOverride: boolean;
}

/** Ids that belong to the game/loader itself, never to a removable mod. */
const PLATFORM_IDS = new Set(['minecraft', 'java', 'forge', 'neoforge', 'fml', 'fabricloader', 'fabric-loader', 'quilt_loader', 'mcp']);

const LOG_TAIL = 60_000;

/** Newest file in `dir` matching `re` that was written after the game started. */
function newestSince(dir: string, re: RegExp, since: number): string | undefined {
  if (!fs.existsSync(dir)) return undefined;
  let best: { file: string; t: number } | undefined;
  for (const name of fs.readdirSync(dir)) {
    if (!re.test(name)) continue;
    const file = path.join(dir, name);
    const t = fs.statSync(file).mtimeMs;
    if (t >= since - 2000 && (!best || t > best.t)) best = { file, t };
  }
  return best?.file;
}

function readSafe(file: string | undefined, max = 400_000): string {
  if (!file) return '';
  try {
    return fs.readFileSync(file, 'utf8').slice(0, max);
  } catch {
    return '';
  }
}

/** Java major from a class file version (e.g. 65.0 -> 21). */
const classToJava = (v: number) => v - 44;

/** Mojang ships runtimes for these Java majors only. */
const SHIPPED_JAVA = [8, 16, 17, 21];

function ramTarget(current: number, grow: boolean): number | null {
  const totalMb = Math.floor(os.totalmem() / 1024 / 1024);
  const roundDown = (mb: number) => Math.floor(mb / 512) * 512;
  if (grow) {
    const target = Math.min(current + 2048, roundDown(totalMb * 0.7));
    return target > current ? target : null;
  }
  const target = Math.max(1024, Math.min(current - 1024, roundDown(totalMb * 0.5)));
  return target < current ? target : null;
}

/**
 * Work out why a game session crashed from its log, crash report and JVM error
 * file, and suggest repairs. Returns null when the session ended normally.
 */
export function analyzeCrash(ctx: CrashContext): CrashReport | null {
  const { instance } = ctx;
  const gameDir = instanceGameDir(instance.id);
  const crashFile = newestSince(path.join(gameDir, 'crash-reports'), /^crash-.*\.txt$/i, ctx.startedAt);
  const hsErr = newestSince(gameDir, /^hs_err_pid\d+\.log$/i, ctx.startedAt);
  if ((ctx.exitCode === 0 || ctx.exitCode === null) && !crashFile && !hsErr) return null;

  const crashText = readSafe(crashFile);
  const text = `${ctx.log}\n${crashText}\n${readSafe(hsErr, 60_000)}`;
  const issues: CrashIssue[] = [];
  const add = (issue: CrashIssue) => {
    if (!issues.some((i) => i.title === issue.title)) issues.push(issue);
  };

  let jars: JarMods[] | null = null;
  const modJars = () => (jars ??= scanModsFolder(path.join(gameDir, 'mods')));
  const fileFor = (id: string) => modJars().find((j) => j.ids.includes(id))?.file;
  const nameOf = (id: string, name?: string) => (name && name !== id ? `${name} (${id})` : id);

  // ---------- Java ----------
  const javaFix = (major: number): Pick<CrashIssue, 'fix' | 'fixLabel'> =>
    ctx.javaOverride
      ? { fix: { kind: 'clearJava' }, fixLabel: 'Użyj automatycznej Javy' }
      : SHIPPED_JAVA.includes(major)
        ? { fix: { kind: 'java', major }, fixLabel: `Pobierz i ustaw Javę ${major}` }
        : {};

  const newer = text.match(/compiled by a more recent version of the Java Runtime \(class file version (\d+)/);
  if (newer) {
    const major = classToJava(Number(newer[1]));
    const fix = SHIPPED_JAVA.includes(major) ? { fix: { kind: 'java' as const, major }, fixLabel: `Pobierz i ustaw Javę ${major}` } : {};
    add({
      title: `Potrzebna Java ${major}`,
      detail: `Część gry albo któryś mod wymaga Javy ${major}, a gra działała na starszej. Jeśli to mod do nowszej wersji Minecrafta, lepiej go usunąć.`,
      ...fix
    });
  }
  const tooNew =
    /Unsupported class file major version \d+/.test(text) ||
    /ClassCastException: class jdk\.internal\.loader\.ClassLoaders\$AppClassLoader cannot be cast to class java\.net\.URLClassLoader/.test(text);
  if (tooNew) {
    add({
      title: 'Za nowa wersja Javy',
      detail: `Ta wersja Minecrafta i loadera działa tylko na Javie ${ctx.requiredJava}, a została uruchomiona na nowszej.`,
      ...javaFix(ctx.requiredJava)
    });
  }
  if (/\[launch\] Nie udało się uruchomić Javy/.test(text) && ctx.javaOverride) {
    add({
      title: 'Wskazana Java nie działa',
      detail: 'Nie dało się uruchomić programu Javy z podanej ścieżki.',
      fix: { kind: 'clearJava' },
      fixLabel: 'Użyj automatycznej Javy'
    });
  }
  const badOpt = text.match(/Unrecognized (?:VM )?option '?([^'\n]+)'?|Error: Could not create the Java Virtual Machine/);
  if (badOpt && instance.jvmArgs?.trim() && !/Could not reserve enough space|Invalid maximum heap size/.test(text)) {
    add({
      title: 'Nieobsługiwane argumenty JVM',
      detail: `Java odrzuciła argumenty z ustawień instancji${badOpt[1] ? ` (${badOpt[1].trim()})` : ''}. Pewnie są dla innej wersji Javy.`,
      fix: { kind: 'clearJvmArgs' },
      fixLabel: 'Usuń własne argumenty JVM'
    });
  }

  // ---------- Memory ----------
  if (/java\.lang\.OutOfMemoryError/.test(text)) {
    const ramMb = ramTarget(instance.ramMb, true);
    add({
      title: 'Zabrakło pamięci RAM',
      detail: ramMb
        ? `Gra miała przydzielone ${instance.ramMb} MB i to nie wystarczyło.`
        : `Gra ma już ${instance.ramMb} MB, a więcej nie warto dawać na tym komputerze. Zamknij inne programy albo usuń najcięższe mody.`,
      ...(ramMb ? { fix: { kind: 'ram' as const, ramMb }, fixLabel: `Zwiększ RAM do ${ramMb} MB` } : {})
    });
  }
  if (/Could not reserve enough space for|Invalid maximum heap size|There is insufficient memory for the Java Runtime/.test(text)) {
    const ramMb = ramTarget(instance.ramMb, false);
    add({
      title: 'Przydzielono za dużo RAM',
      detail: `System nie mógł dać grze ${instance.ramMb} MB pamięci.`,
      ...(ramMb ? { fix: { kind: 'ram' as const, ramMb }, fixLabel: `Zmniejsz RAM do ${ramMb} MB` } : {})
    });
  }

  // ---------- Missing / wrong dependencies ----------
  const missing = new Map<string, string>(); // dep id -> who asked
  const wrongVersion: string[] = [];
  const wrongMc: Array<{ id: string; name: string }> = [];
  let oldLoader = false;

  // Fabric / Quilt
  const fabricReq =
    /Mod '([^']+)' \(([\w.\-]+)\) \S+ requires (.+?) of (?:mod )?(?:'([^']+)' \(([\w.\-]+)\)|([\w.\-]+)),? (which is missing|but only the wrong version is present)/g;
  for (const m of text.matchAll(fabricReq)) {
    const [, reqName, reqId, , depName, depIdQ, depIdBare, state] = m;
    const depId = depIdQ ?? depIdBare;
    if (depId === 'minecraft') wrongMc.push({ id: reqId, name: reqName });
    else if (depId === 'fabricloader' || depId === 'quilt_loader') oldLoader = true;
    else if (depId === 'java') {
      const major = Number((m[3].match(/(\d+)/) ?? [])[1]);
      if (major) add({ title: `Potrzebna Java ${major}`, detail: `Mod ${nameOf(reqId, reqName)} wymaga Javy ${major}.`, ...javaFix(major) });
    } else if (state === 'which is missing') missing.set(depId, nameOf(reqId, reqName));
    else wrongVersion.push(`${nameOf(reqId, reqName)} → ${nameOf(depId, depName)}`);
  }
  // Forge / NeoForge 1.13+
  for (const m of text.matchAll(/Mod ID: '([\w.\-]+)', Requested by: '([\w.\-]+)', Expected range: '([^']*)', Actual version: '([^']*)'/g)) {
    const [, depId, reqId, , actual] = m;
    if (PLATFORM_IDS.has(depId)) {
      if (depId === 'minecraft') wrongMc.push({ id: reqId, name: reqId });
      else oldLoader = true;
    } else if (/MISSING/i.test(actual)) missing.set(depId, reqId);
    else wrongVersion.push(`${reqId} → ${depId}`);
  }
  // NeoForge 1.20.5+ style
  for (const m of text.matchAll(/Mod (\S+) requires (\S+) [^\n]*\n[^\n]*Currently, (\S+) is not installed/g)) {
    if (!PLATFORM_IDS.has(m[2])) missing.set(m[2], m[1]);
  }
  // Forge 1.7.10 – 1.12
  for (const m of text.matchAll(/MissingModsException: Mod ([\w.\-]+) \([^)]*\) requires \[([\w.\-]+)@/g)) {
    if (PLATFORM_IDS.has(m[2])) oldLoader = true;
    else missing.set(m[2], m[1]);
  }

  if (missing.size) {
    const ids = [...missing.keys()];
    add({
      title: ids.length === 1 ? `Brakuje moda „${ids[0]}”` : `Brakuje ${ids.length} wymaganych modów`,
      detail: [...missing].map(([dep, by]) => `${dep} (wymaga go ${by})`).join(', '),
      fix: { kind: 'installMods', modIds: ids },
      fixLabel: ids.length === 1 ? 'Pobierz brakujący mod' : 'Pobierz brakujące mody'
    });
  }
  if (wrongMc.length) {
    const files = wrongMc.map((w) => fileFor(w.id)).filter((f): f is string => !!f);
    add({
      title: 'Mody do innej wersji Minecrafta',
      detail: `${wrongMc.map((w) => nameOf(w.id, w.name)).join(', ')} nie pasuje do Minecrafta ${instance.mcVersion}.`,
      ...(files.length ? { fix: { kind: 'disableMods' as const, files }, fixLabel: 'Wyłącz te mody' } : {})
    });
  }
  if (wrongVersion.length) {
    add({
      title: 'Niezgodne wersje modów',
      detail: `Mod wymaga innej wersji zależności: ${wrongVersion.slice(0, 5).join(', ')}. Zaktualizuj mody.`,
      fix: { kind: 'openMods' },
      fixLabel: 'Sprawdź aktualizacje modów'
    });
  }
  if (oldLoader && instance.loader !== 'vanilla') {
    add({
      title: `Za stara wersja ${instance.loader}`,
      detail: `Któryś mod wymaga nowszego loadera niż ${instance.loaderVersion ?? 'zainstalowany'}.`,
      fix: { kind: 'updateLoader' },
      fixLabel: 'Ustaw najnowszy loader'
    });
  }

  // ---------- A specific mod broke ----------
  const culprits = new Map<string, string>(); // file -> why
  const blame = (id: string, why: string) => {
    if (PLATFORM_IDS.has(id) || id === '(unknown)') return;
    const file = fileFor(id);
    if (file && !culprits.has(file)) culprits.set(file, why);
  };
  for (const m of text.matchAll(/Mixin apply for mod ([\w.\-]+) failed/g)) blame(m[1], 'błąd mixina');
  for (const m of text.matchAll(/(?:Mixin|Injection)\w*(?:Error|Exception)[^\n]*? from mod ([\w.\-]+)/g)) blame(m[1], 'błąd mixina');
  for (const m of text.matchAll(/Mod File: [^\n]*?[\\/]mods[\\/]([^\\/\n]+?\.jar)\s*\n\s*Failure message: ([^\n]+)/g)) {
    if (!culprits.has(m[1])) culprits.set(m[1], m[2].trim());
  }
  const suspected = crashText.search(/Suspected Mods?:/);
  if (suspected >= 0) {
    const block = crashText.slice(suspected, suspected + 600).split('\n').slice(0, 6).join('\n');
    for (const m of block.matchAll(/\(([\w.\-]+)\)/g)) blame(m[1], 'wskazany w crash reporcie');
  }
  if (culprits.size) {
    const files = [...culprits.keys()];
    add({
      title: files.length === 1 ? `Mod „${files[0]}” powoduje błąd` : `${files.length} mody powodują błąd`,
      detail: [...culprits].map(([f, why]) => `${f}: ${why}`).join('\n'),
      fix: { kind: 'disableMods', files },
      fixLabel: files.length === 1 ? 'Wyłącz ten mod' : 'Wyłącz te mody'
    });
  }

  // ---------- Duplicates and wrong-loader jars ----------
  if (instance.loader !== 'vanilla') {
    const fabricInst = instance.loader === 'fabric';
    const hasConnector = modJars().some((j) => j.ids.includes('connector'));
    const isForeign = (j: JarMods) => (fabricInst ? j.kind === 'forge' : j.kind === 'fabric' && !hasConnector);
    const byId = new Map<string, JarMods[]>();
    for (const j of modJars().filter((j) => !isForeign(j))) {
      for (const id of j.ids.slice(0, 1)) byId.set(id, [...(byId.get(id) ?? []), j]);
    }
    const dupes = [...byId].filter(([, list]) => list.length > 1);
    if (dupes.length) {
      // Keep the newest copy of each mod, disable the rest.
      const files = dupes.flatMap(([, list]) => list.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(1).map((j) => j.file));
      add({
        title: 'Zduplikowane mody',
        detail: dupes.map(([id, list]) => `${id}: ${list.map((j) => j.file).join(', ')}`).join('\n'),
        fix: { kind: 'disableMods', files },
        fixLabel: 'Zostaw najnowsze, wyłącz starsze'
      });
    }
    const foreign = modJars().filter(isForeign);
    if (foreign.length) {
      add({
        title: fabricInst ? 'Mody do Forge w instancji Fabric' : 'Mody do Fabric w instancji Forge/NeoForge',
        detail: `Te pliki nie działają z tym loaderem (raczej nie one wywołały błąd, ale warto je usunąć): ${foreign
          .map((j) => j.file)
          .join(', ')}`,
        fix: { kind: 'disableMods', files: foreign.map((j) => j.file) },
        fixLabel: 'Wyłącz te mody'
      });
    }
  }

  // ---------- Corrupted files ----------
  for (const m of text.matchAll(/(?:Zip(?:Exception|Error)|invalid LOC header|zip END header|error in opening zip file)[^\n]*?([A-Za-z]:[\\/][^\s'"]+?\.jar)/g)) {
    const file = path.normalize(m[1]);
    const managed = [paths.libraries, paths.versions].some((root) => file.toLowerCase().startsWith(root.toLowerCase()));
    const modsDir = path.join(gameDir, 'mods').toLowerCase();
    if (managed) {
      add({
        title: 'Uszkodzony plik gry',
        detail: file,
        fix: { kind: 'deleteFile', path: file },
        fixLabel: 'Usuń i pobierz ponownie'
      });
    } else if (file.toLowerCase().startsWith(modsDir)) {
      add({
        title: `Uszkodzony mod „${path.basename(file)}”`,
        detail: 'Plik jest niekompletny albo uszkodzony. Pobierz go jeszcze raz.',
        fix: { kind: 'disableMods', files: [path.basename(file)] },
        fixLabel: 'Wyłącz ten mod'
      });
    }
  }

  // ---------- Graphics / system ----------
  const gpuDll = /(atio6axx|atioglxx|atig6pxx|nvoglv(?:32|64)|ig\w*icd(?:32|64)|igxelpicd64)\.dll/i;
  if ((/EXCEPTION_ACCESS_VIOLATION/.test(text) && gpuDll.test(text)) ||
    /Pixel format not accelerated|GLFW error 6554[23]|The driver does not appear to support OpenGL|Couldn't set pixel format/i.test(text)) {
    add({
      title: 'Problem ze sterownikiem karty graficznej',
      detail: 'Zaktualizuj sterowniki karty (NVIDIA, AMD lub Intel). Na laptopie ustaw w Windowsie javaw.exe na kartę dedykowaną (Ustawienia → Ekran → Grafika).'
    });
  }
  if (/No space left on device|There is not enough space on the disk/i.test(text)) {
    add({ title: 'Brak miejsca na dysku', detail: 'Zwolnij miejsce na dysku z danymi launchera i uruchom grę ponownie.' });
  }

  // The most telling line, for the "unknown cause" case and bug reports.
  const causes = [...(crashText || ctx.log).matchAll(/^Caused by: (.+)$/gm)];
  const keyLine =
    causes.at(-1)?.[1] ??
    (crashText || ctx.log).match(/^\s*((?:[a-z]\w*\.)+\w*(?:Exception|Error)\b[^\n]*)$/m)?.[1]?.trim();

  return {
    instanceId: instance.id,
    instanceName: instance.name,
    exitCode: ctx.exitCode,
    issues,
    keyLine,
    crashReportFile: crashFile,
    logTail: ctx.log.slice(-LOG_TAIL)
  };
}
