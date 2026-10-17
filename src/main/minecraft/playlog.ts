import path from 'path';
import { paths } from '../utils/paths';
import { readJson, writeJson } from '../utils/store';
import type { PlaySession } from '../../shared/types';

const FILE = () => path.join(paths.root, 'playlog.json');
const CAP = 2000;

/** Every finished game session, oldest first (for weekly stats on Home). */
export function readPlaylog(): PlaySession[] {
  return readJson<PlaySession[]>(FILE(), []);
}

export function logSession(instanceId: string, start: number, ms: number): void {
  if (ms < 5000) return; // instant crashes aren't play time
  const log = readPlaylog();
  log.push({ instanceId, start, ms });
  writeJson(FILE(), log.slice(-CAP));
}
