import { spawn } from 'child_process';
import os from 'os';

export interface GameSample {
  /** Working set of the game process, bytes. */
  ram: number;
  /** Share of the whole machine's CPU, 0–100. */
  cpu: number;
}

/**
 * Samples a running game's memory and CPU every two seconds. One long-lived
 * PowerShell per game (starting a process per sample would cost more than the
 * game measurement itself). Windows only; elsewhere it does nothing.
 */
export function monitorGame(pid: number, onSample: (s: GameSample) => void): () => void {
  if (process.platform !== 'win32' || !pid) return () => undefined;
  const script =
    `$id=${Math.floor(pid)}; while ($true) { $p = Get-Process -Id $id -ErrorAction SilentlyContinue; ` +
    `if (-not $p) { break }; "$($p.WorkingSet64) $([int64]$p.TotalProcessorTime.TotalMilliseconds)"; Start-Sleep -Seconds 2 }`;
  const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true });
  const cores = Math.max(1, os.cpus().length);
  let last: { cpuMs: number; at: number } | null = null;
  let buf = '';
  ps.stdout.on('data', (chunk: Buffer) => {
    buf += chunk.toString();
    const lines = buf.split(/\r?\n/);
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const [ramS, cpuS] = line.trim().split(/\s+/);
      const ram = Number(ramS);
      const cpuMs = Number(cpuS);
      if (!Number.isFinite(ram) || !Number.isFinite(cpuMs)) continue;
      const now = Date.now();
      const cpu = last ? Math.min(100, Math.max(0, ((cpuMs - last.cpuMs) / ((now - last.at) * cores)) * 100)) : 0;
      last = { cpuMs, at: now };
      onSample({ ram, cpu: Math.round(cpu) });
    }
  });
  ps.on('error', () => undefined);
  return () => {
    if (!ps.killed) ps.kill();
  };
}
