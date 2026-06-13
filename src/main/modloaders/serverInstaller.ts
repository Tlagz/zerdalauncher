import { spawn } from 'child_process';

/**
 * Run a Forge/NeoForge installer in headless `--installServer` mode against the
 * given server directory. The installer downloads libraries and writes the
 * platform arg files used to launch the modded server.
 */
export function runServerInstaller(
  javaExe: string,
  installerPath: string,
  serverDir: string,
  log: (line: string) => void
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(javaExe, ['-jar', installerPath, '--installServer', serverDir], {
      cwd: serverDir
    });
    child.stdout?.on('data', (b) => log(b.toString()));
    child.stderr?.on('data', (b) => log(b.toString()));
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error('Instalator serwera zakończył się kodem ' + (code ?? '?')))
    );
  });
}
