import type { TunnelStatus } from '../../shared/types';
import { openPort, closePort } from './upnp';
import {
  ensureSecret,
  ensureTunnel,
  tunnelAddress,
  startAgent,
  stopAgent,
  deleteTunnel,
  forgetSecret,
  PlayitAuthError
} from './playit';

/**
 * Making a local server reachable for friends:
 *  1. UPnP — ask the router to forward the port. Direct connection, no extra ping.
 *  2. playit.gg — relay with European nodes, for routers without UPnP or ISPs
 *     using CGNAT. Needs a one-time account link in the browser.
 */
type Share = { method: 'upnp'; port: number } | { method: 'playit' };

const shares = new Map<string, Share>();
/** Starts in progress; deleting the entry cancels the start at its next step. */
const starting = new Map<string, symbol>();

let emitTunnel: (s: TunnelStatus) => void = () => {};
export function initTunnel(cb: (s: TunnelStatus) => void): void {
  emitTunnel = cb;
}

class Cancelled extends Error {}

export async function startTunnel(serverId: string, port: number, serverName: string): Promise<void> {
  if (shares.has(serverId) || starting.has(serverId)) return;
  const token = Symbol(serverId);
  starting.set(serverId, token);
  const alive = () => {
    if (starting.get(serverId) !== token) throw new Cancelled();
  };

  try {
    emitTunnel({ id: serverId, state: 'starting', message: 'Otwieram port na routerze (UPnP)…' });
    let upnpError: string;
    try {
      const address = await openPort(port);
      alive();
      shares.set(serverId, { method: 'upnp', port });
      emitTunnel({ id: serverId, state: 'active', method: 'upnp', address });
      return;
    } catch (e) {
      if (e instanceof Cancelled) throw e;
      upnpError = (e as Error).message;
    }

    alive();
    emitTunnel({ id: serverId, state: 'starting', message: `${upnpError} Łączę z playit.gg…` });
    const viaPlayit = async (): Promise<string> => {
      const secret = await ensureSecret((claimUrl) => {
        alive();
        emitTunnel({
          id: serverId,
          state: 'claim',
          claimUrl,
          message: 'Zaloguj się na playit.gg w przeglądarce i zaakceptuj launcher (tylko za pierwszym razem).'
        });
      });
      alive();
      emitTunnel({ id: serverId, state: 'starting', message: 'Tworzę tunel playit.gg…' });
      const tunnelId = await ensureTunnel(secret, serverId, serverName, port);
      await startAgent(secret);
      return tunnelAddress(secret, tunnelId);
    };
    let address: string;
    try {
      address = await viaPlayit();
    } catch (e) {
      if (!(e instanceof PlayitAuthError)) throw e;
      // Saved secret no longer valid — link the launcher again, once.
      stopAgent();
      forgetSecret();
      alive();
      address = await viaPlayit();
    }
    alive();
    shares.set(serverId, { method: 'playit' });
    emitTunnel({ id: serverId, state: 'active', method: 'playit', address });
  } catch (e) {
    if (e instanceof Cancelled) return;
    emitTunnel({ id: serverId, state: 'error', message: (e as Error).message });
    throw e;
  } finally {
    if (starting.get(serverId) === token) starting.delete(serverId);
  }
}

export function stopTunnel(serverId: string): void {
  starting.delete(serverId);
  const share = shares.get(serverId);
  shares.delete(serverId);
  if (share?.method === 'upnp') void closePort(share.port).catch(() => {});
  if (![...shares.values()].some((s) => s.method === 'playit')) stopAgent();
  emitTunnel({ id: serverId, state: 'stopped' });
}

/** Server deleted: stop sharing and drop its playit tunnel too. */
export function releaseServerTunnel(serverId: string): void {
  stopTunnel(serverId);
  void deleteTunnel(serverId).catch(() => {});
}

export function stopAllTunnels(): void {
  for (const id of [...shares.keys(), ...starting.keys()]) stopTunnel(id);
}
