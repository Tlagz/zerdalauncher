import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  main: {
    // Keep node_modules deps (discord-rpc/ws, electron-updater, adm-zip, …) out
    // of the bundle — loaded from node_modules at runtime. Required because ws
    // lazily requires the optional native `bufferutil`, which can't be bundled.
    plugins: [externalizeDepsPlugin()],
    // Inject the CurseForge key at build time from the CF_API_KEY env var
    // (a GitHub Actions secret in CI). Keeps the key OUT of source / the repo.
    define: {
      __CF_API_KEY__: JSON.stringify(process.env.CF_API_KEY || '')
    },
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html')
      }
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer')
      }
    }
  }
});
