import { setWhere, type GameWhere } from '../discord';
import { pingServer } from './serverPing';

/**
 * Follows the game log to tell whether the player is in the menu, a world or
 * on a server, and reports it to Discord Rich Presence.
 */
export function createActivityTracker(quickPlay: { world?: string; server?: string }) {
  let where: GameWhere = quickPlay.server
    ? { kind: 'server', address: quickPlay.server }
    : quickPlay.world
      ? { kind: 'world', name: quickPlay.world }
      : { kind: 'menu' };
  let pending = '';

  const update = (next: GameWhere) => {
    if (JSON.stringify(next) === JSON.stringify(where)) return;
    where = next;
    setWhere(next);
    // Player count for the Discord party size.
    if (next.kind === 'server') {
      const address = next.address;
      pingServer(address, 4000)
        .then((p) => {
          if (p.online && p.players && where.kind === 'server' && where.address === address) {
            update({ kind: 'server', address, players: p.players });
          }
        })
        .catch(() => undefined);
    }
  };

  return {
    initial: where,
    onLog(chunk: string): void {
      pending += chunk;
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) {
        const conn = line.match(/Connecting to ([^\s,]+),\s*(\d+)/);
        if (conn) {
          update({ kind: 'server', address: conn[2] === '25565' ? conn[1] : `${conn[1]}:${conn[2]}` });
        } else if (/Starting integrated minecraft server/.test(line)) {
          update({ kind: 'world', name: where.kind === 'world' ? where.name : undefined });
        } else if (/Saving chunks for level 'ServerLevel\[(.+?)\]'/.test(line) && where.kind === 'world' && !where.name) {
          update({ kind: 'world', name: line.match(/ServerLevel\[(.+?)\]/)![1] });
        } else if (/Stopping server|Disconnected from server|Lost connection|Client disconnected/.test(line)) {
          update({ kind: 'menu' });
        }
      }
    }
  };
}
