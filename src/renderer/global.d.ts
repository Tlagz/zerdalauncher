import type { LauncherApi } from '../preload/index';

declare global {
  interface Window {
    api: LauncherApi;
  }
}

export {};
