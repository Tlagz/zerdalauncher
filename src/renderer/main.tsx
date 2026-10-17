import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { installPointerFx } from './ui/pointerFx';
import { initI18n } from './i18n';

installPointerFx();

// Prevent the whole app from navigating to a file when something is dropped
// outside a designated drop zone (instance cards handle their own drops).
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

// The language must be known before the first render (the translator watches the DOM).
window.api.settings
  .get()
  .then((s) => s.language ?? 'pl')
  .catch(() => 'pl' as const)
  .then((lang) => {
    initI18n(lang);
    createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  });
