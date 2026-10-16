import { fabricLoaders } from './fabric';
import { forgeVersionsFor } from './forge';
import { neoforgeVersionsFor } from './neoforge';
import type { ModLoader } from '../../shared/types';

/** Newest available loader version for an MC version, or undefined if none. */
export async function latestLoaderVersion(loader: ModLoader, mc: string): Promise<string | undefined> {
  if (loader === 'fabric') return (await fabricLoaders(mc)).latest;
  if (loader === 'forge') {
    const f = await forgeVersionsFor(mc);
    return f.recommended ?? f.latest;
  }
  if (loader === 'neoforge') return (await neoforgeVersionsFor(mc)).latest;
  return undefined;
}
