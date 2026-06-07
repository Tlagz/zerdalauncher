import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

// Prevent the whole app from navigating to a file when something is dropped
// outside a designated drop zone (instance cards handle their own drops).
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

const root = createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
