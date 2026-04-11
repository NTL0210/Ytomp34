import { app, BrowserWindow } from 'electron';
import { join } from 'path';
import { registerIPCHandlers, unregisterIPCHandlers } from './ipc/handlers';
import { logger } from './services/logger.service';
import { directoryManager } from './services/directory-manager.service';
import { cacheService } from './services/cache.service';
import { tempManagerService } from './services/temp-manager.service';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  logger.info('App', 'Creating main window');
  
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Additional security settings
      webSecurity: true,
      allowRunningInsecureContent: false,
    }
  });

  // Register IPC handlers after window creation
  registerIPCHandlers(mainWindow);

  // Load the app
  if (process.env.VITE_DEV_SERVER_URL) {
    logger.info('App', 'Loading development server', { url: process.env.VITE_DEV_SERVER_URL });
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    logger.info('App', 'Loading production build');
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    logger.info('App', 'Main window closed');
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  logger.info('App', 'Application ready', { 
    version: app.getVersion(),
    platform: process.platform,
    logDir: logger.getLogDirectory(),
  });
  
  // Initialize directory structure
  try {
    const directories = await directoryManager.initialize();
    logger.info('App', 'Directory structure initialized', directories);
  } catch (error) {
    logger.error('App', 'Failed to initialize directory structure', { error });
    // Continue anyway - some features may not work but app should still start
  }
  
  // Initialize temp manager
  try {
    await tempManagerService.initialize();
  } catch (error) {
    logger.error('App', 'Failed to initialize temp manager', { error });
  }
  
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  logger.info('App', 'All windows closed');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  logger.info('App', 'Application quitting');
  
  // Cleanup IPC handlers before app quits
  unregisterIPCHandlers();
  
  // Cleanup temp files
  await tempManagerService.cleanup();
  
  // Flush cache to disk
  await cacheService.flush();
  
  // Flush all pending logs
  await logger.flush();
});
