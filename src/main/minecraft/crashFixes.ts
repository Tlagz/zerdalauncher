import fs from 'fs';
import path from 'path';
import { paths } from '../utils/paths';
import { readJson, writeJson } from '../utils/store';
import { getInstance, updateInstance } from './instances';
import { ensureMojangJre, RUNTIME_COMPONENTS } from './jre';
import { latestLoaderVersion } from '../modloaders/latest';
import { toggleContent, installContent, listInstalledContent } from '../mods';
import * as modrinth from '../mods/modrinth';
import type { AppSettings, CrashFix } from '../../shared/types';

type Progress = (current: number, total: number, message?: string) => void;

/** Apply a repair suggested by the crash analyzer. Returns a short summary for a toast. */
export async function applyCrashFix(instanceId: string, fix: CrashFix, progress: Progress): Promise<string> {
  const inst = getInstance(instanceId);
  if (!inst) throw new Error('Brak instancji.');

  switch (fix.kind) {
    case 'ram':
      updateInstance(instanceId, { ramMb: fix.ramMb });
      return `Ustawiono ${fix.ramMb} MB RAM.`;

    case 'java': {
      // The newest runtime of that major (e.g. 17 → java-runtime-gamma).
      const comp = [...RUNTIME_COMPONENTS].reverse().find((c) => c.javaMajor === fix.major);
      if (!comp) throw new Error(`Brak pakietu Javy ${fix.major} od Mojang.`);
      const exe = await ensureMojangJre(comp.component, (_p, c, t, m) => progress(c, t, m));
      updateInstance(instanceId, { javaPath: exe });
      return `Instancja używa teraz Javy ${fix.major}.`;
    }

    case 'clearJava': {
      updateInstance(instanceId, { javaPath: '' });
      const settings = readJson<Partial<AppSettings>>(paths.settings, {});
      if (settings.javaPath) writeJson(paths.settings, { ...settings, javaPath: '' });
      return 'Launcher sam dobierze Javę.';
    }

    case 'clearJvmArgs':
      updateInstance(instanceId, { jvmArgs: '' });
      return 'Usunięto własne argumenty JVM.';

    case 'disableMods': {
      const present = new Set(listInstalledContent(instanceId, 'mod').map((m) => m.fileName));
      let n = 0;
      for (const f of fix.files) {
        if (!present.has(f)) continue;
        toggleContent(instanceId, 'mod', f, false);
        n++;
      }
      return n ? `Wyłączono ${n} ${n === 1 ? 'mod' : 'mody'}. Możesz je włączyć w menedżerze modów.` : 'Te mody są już wyłączone.';
    }

    case 'installMods': {
      const failed: string[] = [];
      let i = 0;
      for (const id of fix.modIds) {
        progress(i++, fix.modIds.length, `Szukam „${id}”…`);
        try {
          const project = await modrinth.projectForModId(id, inst.mcVersion, inst.loader);
          const file = project && (await modrinth.getBestVersion(project, inst.mcVersion, inst.loader));
          if (!file) throw new Error('not found');
          await installContent(instanceId, 'mod', file, true);
        } catch {
          failed.push(id);
        }
      }
      if (failed.length === fix.modIds.length) {
        throw new Error(`Nie znaleziono na Modrinth: ${failed.join(', ')}. Poszukaj ich ręcznie w menedżerze modów.`);
      }
      return failed.length ? `Pobrano część modów. Nie znaleziono: ${failed.join(', ')}.` : 'Pobrano brakujące mody.';
    }

    case 'deleteFile': {
      const file = path.resolve(fix.path);
      const managed = [paths.libraries, paths.versions].some((r) => file.toLowerCase().startsWith(path.resolve(r).toLowerCase() + path.sep));
      if (!managed) throw new Error('Ten plik nie należy do launchera.');
      fs.rmSync(file, { force: true });
      return 'Usunięto plik. Zostanie pobrany przy następnym uruchomieniu.';
    }

    case 'updateLoader': {
      const v = await latestLoaderVersion(inst.loader, inst.mcVersion);
      if (!v) throw new Error('Nie znaleziono nowszej wersji loadera.');
      updateInstance(instanceId, { loaderVersion: v });
      return `Ustawiono ${inst.loader} ${v}.`;
    }

    case 'openMods':
      return '';
  }
}
