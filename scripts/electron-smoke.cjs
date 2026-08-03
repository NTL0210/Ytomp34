const { app, BrowserWindow } = require('electron');
const path = require('path');

const expectedMethods = [
  'fetchVideoInfo',
  'fetchPlaylistInfo',
  'startDownload',
  'pauseDownload',
  'resumeDownload',
  'cancelDownload',
  'retryDownload',
  'openDownloadedFile',
  'showDownloadedFile',
  'removeHistoryItem',
  'clearCompleted',
  'getSettings',
  'updateSettings',
  'selectFolder',
  'getUpdateStatus',
  'checkForAppUpdate',
  'downloadAppUpdate',
  'installAppUpdate',
  'onProgressUpdate',
  'onQueueUpdate',
  'onUpdateStatus'
];

app.disableHardwareAcceleration();

async function runSmokeTest() {
  const preload = path.join(__dirname, '..', 'dist', 'electron', 'preload', 'index.js');
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload,
      webSecurity: true
    }
  });

  await window.loadURL('data:text/html,<html><body>smoke</body></html>');

  const api = await window.webContents.executeJavaScript(`(() => {
    const exposed = window.electronAPI;
    return {
      available: Boolean(exposed),
      platform: exposed?.platform,
      methods: exposed
        ? Object.keys(exposed).filter((key) => typeof exposed[key] === 'function')
        : []
    };
  })()`);

  const missingMethods = expectedMethods.filter((method) => !api.methods.includes(method));
  if (!api.available || !api.platform || missingMethods.length > 0) {
    throw new Error(`Preload API check failed. Missing: ${missingMethods.join(', ') || 'API/platform'}`);
  }

  console.log(`Electron preload smoke test passed on ${api.platform}`);
  window.destroy();
}

app.whenReady()
  .then(runSmokeTest)
  .then(() => app.exit(0))
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
