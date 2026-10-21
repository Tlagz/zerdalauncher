import { parentPort } from 'worker_threads';
import { renderRegion } from './render';

// Renders region files off the main thread (a big region takes ~0.5 s).
parentPort?.on('message', (m: { id: number; file: string; cave: boolean }) => {
  try {
    const buf = renderRegion(m.file, m.cave);
    parentPort?.postMessage({ id: m.id, buf }, [buf.buffer as ArrayBuffer]);
  } catch (e) {
    parentPort?.postMessage({ id: m.id, error: (e as Error).message });
  }
});
