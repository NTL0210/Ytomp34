import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

// Debug: Check if electronAPI is available
console.log('Renderer starting...');
console.log('window.electronAPI:', window.electronAPI);

if (!window.electronAPI) {
  console.error('electronAPI is not available! Preload script may have failed.');
  document.body.innerHTML = `
    <div style="padding: 20px; font-family: sans-serif;">
      <h1 style="color: red;">Error: Electron API not available</h1>
      <p>The preload script failed to expose the Electron API.</p>
      <p>Check the console for more details.</p>
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
