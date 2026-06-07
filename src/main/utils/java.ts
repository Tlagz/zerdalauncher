import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export function detectJava(customPath?: string): string | null {
  const candidates: string[] = [];
  if (customPath) candidates.push(customPath);
  if (process.env.JAVA_HOME) candidates.push(path.join(process.env.JAVA_HOME, 'bin', 'javaw.exe'));
  if (process.env.JAVA_HOME) candidates.push(path.join(process.env.JAVA_HOME, 'bin', 'java.exe'));

  // Common Windows install locations
  const programFiles = [
    process.env['ProgramFiles'] || 'C:\\Program Files',
    process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
  ];
  for (const pf of programFiles) {
    for (const vendor of ['Java', 'Eclipse Adoptium', 'Microsoft', 'Zulu', 'Amazon Corretto']) {
      const dir = path.join(pf, vendor);
      if (!fs.existsSync(dir)) continue;
      try {
        for (const sub of fs.readdirSync(dir)) {
          const exe = path.join(dir, sub, 'bin', 'javaw.exe');
          if (fs.existsSync(exe)) candidates.push(exe);
        }
      } catch {
        /* ignore */
      }
    }
  }

  // Fallback to PATH
  candidates.push('javaw.exe');
  candidates.push('java.exe');

  for (const c of candidates) {
    if (verifyJava(c)) return c;
  }
  return null;
}

export function verifyJava(exe: string): boolean {
  return getJavaMajor(exe) !== null;
}

/** Returns the major version (8, 17, 21, …) of a Java executable, or null if it cannot be run. */
export function getJavaMajor(exe: string): number | null {
  try {
    const result = spawnSync(exe, ['-version'], { encoding: 'utf8' });
    const out = `${result.stderr ?? ''}${result.stdout ?? ''}`;
    // Matches: version "1.8.0_381"  |  version "17.0.9"  |  version "21"
    const m = out.match(/version "(\d+)(?:\.(\d+))?[^"]*"/);
    if (!m) return null;
    const first = parseInt(m[1], 10);
    // Legacy scheme "1.8" -> major 8; modern "17" -> 17
    if (first === 1 && m[2]) return parseInt(m[2], 10);
    return first;
  } catch {
    return null;
  }
}

/**
 * Collect all system Java executables we can find, paired with their major version.
 * Used to pick a runtime that satisfies a Minecraft version's requirement.
 */
export function listSystemJavas(): Array<{ exe: string; major: number }> {
  const out: Array<{ exe: string; major: number }> = [];
  const seen = new Set<string>();
  const add = (exe: string) => {
    if (seen.has(exe.toLowerCase())) return;
    seen.add(exe.toLowerCase());
    const major = getJavaMajor(exe);
    if (major !== null) out.push({ exe, major });
  };

  if (process.env.JAVA_HOME) {
    add(path.join(process.env.JAVA_HOME, 'bin', 'javaw.exe'));
  }
  const programFiles = [
    process.env['ProgramFiles'] || 'C:\\Program Files',
    process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
  ];
  for (const pf of programFiles) {
    for (const vendor of ['Java', 'Eclipse Adoptium', 'Microsoft', 'Zulu', 'Amazon Corretto', 'BellSoft']) {
      const dir = path.join(pf, vendor);
      if (!fs.existsSync(dir)) continue;
      try {
        for (const sub of fs.readdirSync(dir)) {
          const exe = path.join(dir, sub, 'bin', 'javaw.exe');
          if (fs.existsSync(exe)) add(exe);
        }
      } catch {
        /* ignore */
      }
    }
  }
  return out;
}

/** Find a system Java whose major version is >= required. Returns null if none. */
export function findSystemJava(requiredMajor: number): string | null {
  const all = listSystemJavas();
  // Prefer the closest match >= required, else null.
  const ok = all.filter((j) => j.major >= requiredMajor).sort((a, b) => a.major - b.major);
  return ok[0]?.exe ?? null;
}
