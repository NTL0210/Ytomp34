import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

if (!window.electronAPI) {
  console.error('electronAPI is not available! Preload script may have failed.');
  document.body.innerHTML = `
    <div class="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div class="w-full max-w-[460px] rounded-xl border border-border bg-surface p-6 shadow-dialog" role="alert">
        <h1 class="text-[15px] font-semibold text-ink">Electron bridge unavailable</h1>
        <p class="mt-1 text-[12px] leading-5 text-muted">
          The desktop API did not load. Restart Ytomp34, and check the console if the problem continues.
        </p>
      </div>
    </div>
  `;
  throw new Error('electronAPI is not available');
}

const container = document.getElementById('root');

if (!container) {
  throw new Error('Root element not found');
}

const root = createRoot(container);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
