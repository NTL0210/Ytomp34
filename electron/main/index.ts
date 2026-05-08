/**
 * Electron Main Process Entry Point
 * Initializes application, configures BrowserWindow, registers IPC handlers
 * Validates: Requirements 16.1, 16.2, 22.1, 22.2, 22.3, 22.4, 22.5
 */

import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import * as os from 'os';

// Domain entities
import { DownloadQueue } from './domain/entities';

// Infrastructure services
import {
  FileLogger,
  FileSanitizerImpl,
  ProgressParserImpl,
  SettingsStoreImpl,
  YtDlpExecutorImpl,
  QueuePersistence,
  ErrorCategorizer,
  YtDlpInstaller,
  FfmpegInstaller
} from './infrastructure';

// Application use cases
import {
  FetchVideoInfoUseCase,
  CreateDownloadTaskUseCase,
  ExecuteDownloadUseCase,
  ManageQueueUseCase,
  UpdateSettingsUseCase
} from './application';

// IPC handlers
import { VideoHandlers, DownloadHandlers, SettingsHandlers } from './ipc';

/**
 * Dependency Injection Container
 */
class Container {
  private static instance: Container;
  private services: Map<string, any> = new Map();

  static getInstance(): Container {
    if (!Container.instance) {
      Container.instance = new Container();
    }
    return Container.instance;
  }

  register<T>(key: string, service: T): void {
    this.services.set(key, service);
  }

  resolve<T>(key: string): T {
    const service = this.services.get(key);
    if (!service) {
      throw new Error(`Service not found: ${key}`);
    }
    return service;
  }
}

/**
 * Application class
 */
class Application {
  private mainWindow: BrowserWindow | null = null;
  private container: Container;
  private downloadHandlers: DownloadHandlers | null = null;

  constructor() {
    this.container = Container.getInstance();
  }

  /**
   * Initialize the application
   */
  async initialize(): Promise<void> {
    const startTime = Date.now();

    // Initialize dependency injection container
    await this.initializeContainer();

    // Check yt-dlp installation
    await this.checkYtDlpInstallation();

    // Load settings
    await this.loadSettings();

    // Restore queue state
    await this.restoreQueueState();

    // Create main window
    this.createMainWindow();

    // Register IPC handlers
    this.registerIpcHandlers();

    const elapsedTime = Date.now() - startTime;
    const logger = this.container.resolve<FileLogger>('logger');
    logger.info('Application initialized', { elapsedTime: `${elapsedTime}ms` });

    // Ensure window is displayed within 2 seconds
    if (elapsedTime > 2000) {
      logger.error('Application initialization exceeded 2 seconds', undefined, { elapsedTime });
    }
  }

  /**
   * Initialize dependency injection container
   */
  private async initializeContainer(): Promise<void> {
    // Infrastructure services
    const logger = new FileLogger();
    const fileSanitizer = new FileSanitizerImpl();
    const progressParser = new ProgressParserImpl();
    const settingsStore = new SettingsStoreImpl();
    const ytDlpExecutor = new YtDlpExecutorImpl();
    const errorCategorizer = new ErrorCategorizer();
    const queuePersistence = new QueuePersistence();

    // Register infrastructure services
    this.container.register('logger', logger);
    this.container.register('fileSanitizer', fileSanitizer);
    this.container.register('progressParser', progressParser);
    this.container.register('settingsStore', settingsStore);
    this.container.register('ytDlpExecutor', ytDlpExecutor);
    this.container.register('errorCategorizer', errorCategorizer);
    this.container.register('queuePersistence', queuePersistence);

    // Create download queue
    const settings = await settingsStore.load();
    const queue: DownloadQueue = {
      id: 'main-queue',
      tasks: [],
      maxConcurrent: settings.concurrentLimit,
      addTask: function(task) {
        this.tasks.push(task);
      },
      removeTask: function(taskId) {
        this.tasks = this.tasks.filter(t => t.id !== taskId);
      },
      getNextPendingTask: function() {
        return this.tasks.find(t => t.status === 'pending') || null;
      },
      getActiveTasksCount: function() {
        return this.tasks.filter(t => t.status === 'downloading').length;
      },
      canStartNewTask: function() {
        return this.getActiveTasksCount() < this.maxConcurrent;
      }
    };

    this.container.register('queue', queue);

    logger.info('Dependency injection container initialized');
  }

  /**
   * Check yt-dlp installation on startup
   */
  private async checkYtDlpInstallation(): Promise<void> {
    const logger = this.container.resolve<FileLogger>('logger');
    const ytDlpExecutor = this.container.resolve<YtDlpExecutorImpl>('ytDlpExecutor');
    const ytDlpInstaller = new YtDlpInstaller(logger);
    const ffmpegInstaller = new FfmpegInstaller(logger);

    try {
      logger.info('Checking yt-dlp and ffmpeg installation...');

      // First check if yt-dlp is in system PATH
      logger.info('Checking system yt-dlp...');
      const { installed, version } = await ytDlpExecutor.checkInstallation();

      if (!installed) {
        logger.info('yt-dlp not found in system PATH, checking bundled version...');
        
        // Check if we have a bundled version
        if (ytDlpInstaller.isInstalled()) {
          const bundledPath = ytDlpInstaller.getExecutablePath();
          logger.info('Found bundled yt-dlp, setting path...', { path: bundledPath });
          ytDlpExecutor.setExecutablePath(bundledPath);
          
          const { installed: bundledInstalled, version: bundledVersion } = await ytDlpExecutor.checkInstallation();
          
          if (bundledInstalled) {
            logger.info('Using bundled yt-dlp', { version: bundledVersion, path: bundledPath });
          } else {
            logger.error('Bundled yt-dlp exists but not working, re-downloading...');
            const result = await ytDlpInstaller.install();
            
            if (result.success) {
              ytDlpExecutor.setExecutablePath(bundledPath);
              const { version: newVersion } = await ytDlpExecutor.checkInstallation();
              logger.info('yt-dlp re-downloaded successfully', { version: newVersion });
            } else {
              logger.error('Failed to re-download yt-dlp', new Error(result.error || 'Unknown error'));
            }
          }
        } else {
          // Neither system nor bundled version found - download it
          logger.info('yt-dlp not found, downloading...');
          
          const result = await ytDlpInstaller.install();
          
          if (result.success) {
            const bundledPath = ytDlpInstaller.getExecutablePath();
            ytDlpExecutor.setExecutablePath(bundledPath);
            
            const { installed: newInstalled, version: newVersion } = await ytDlpExecutor.checkInstallation();
            
            if (newInstalled) {
              logger.info('yt-dlp downloaded and installed successfully', { version: newVersion, path: bundledPath });
            } else {
              logger.error('yt-dlp downloaded but not working', new Error('Installation verification failed'));
            }
          } else {
            logger.error('Failed to download yt-dlp', new Error(result.error || 'Unknown error'));
          }
        }
      } else {
        logger.info('yt-dlp is installed in system PATH', { version });
      }

      // Check and install ffmpeg
      logger.info('Checking ffmpeg installation...');
      
      if (!ffmpegInstaller.isInstalled()) {
        logger.info('ffmpeg not found, downloading...');
        
        const result = await ffmpegInstaller.install();
        
        if (result.success) {
          const ffmpegDir = ffmpegInstaller.getBinDirectory();
          ytDlpExecutor.setFfmpegLocation(ffmpegDir);
          logger.info('ffmpeg downloaded and installed successfully', { path: ffmpegDir });
        } else {
          logger.error('Failed to download ffmpeg', new Error(result.error || 'Unknown error'));
        }
      } else {
        const ffmpegDir = ffmpegInstaller.getBinDirectory();
        ytDlpExecutor.setFfmpegLocation(ffmpegDir);
        logger.info('Using bundled ffmpeg', { path: ffmpegDir });
      }

      // Final verification with detailed logging
      logger.info('Final verification of installations...');
      
      const finalCheck = await ytDlpExecutor.checkInstallation();
      if (finalCheck.installed) {
        logger.info('✓ yt-dlp verification successful', { version: finalCheck.version });
      } else {
        logger.error('✗ yt-dlp verification failed - app may not work correctly');
        
        // Try to force set bundled path if it exists
        if (ytDlpInstaller.isInstalled()) {
          const forcePath = ytDlpInstaller.getExecutablePath();
          logger.info('Forcing bundled yt-dlp path...', { path: forcePath });
          ytDlpExecutor.setExecutablePath(forcePath);
          
          const forceCheck = await ytDlpExecutor.checkInstallation();
          logger.info('Force check result:', forceCheck);
        }
      }

      const ffmpegExists = ffmpegInstaller.isInstalled();
      logger.info('ffmpeg verification', { installed: ffmpegExists, path: ffmpegInstaller.getBinDirectory() });

    } catch (error) {
      logger.error('Failed to check installations', error as Error);
    }
  }

  /**
   * Load settings from disk
   */
  private async loadSettings(): Promise<void> {
    const logger = this.container.resolve<FileLogger>('logger');
    const settingsStore = this.container.resolve<SettingsStoreImpl>('settingsStore');

    try {
      const settings = await settingsStore.load();
      logger.info('Settings loaded', { settings });
    } catch (error) {
      logger.error('Failed to load settings', error as Error);
    }
  }

  /**
   * Restore queue state from disk
   */
  private async restoreQueueState(): Promise<void> {
    const logger = this.container.resolve<FileLogger>('logger');
    const queuePersistence = this.container.resolve<QueuePersistence>('queuePersistence');
    const queue = this.container.resolve<DownloadQueue>('queue');

    try {
      const restoredQueue = await queuePersistence.load();

      if (restoredQueue) {
        // Restore tasks but reset downloading tasks to pending
        queue.tasks = restoredQueue.tasks.map((task: any) => {
          if (task.status === 'downloading') {
            return { ...task, status: 'pending' as const, processId: undefined };
          }
          return task;
        });

        logger.info('Queue state restored', { taskCount: queue.tasks.length });
      } else {
        logger.info('No queue state to restore');
      }
    } catch (error) {
      logger.error('Failed to restore queue state', error as Error);
    }
  }

  /**
   * Create main browser window
   */
  private createMainWindow(): void {
    const logger = this.container.resolve<FileLogger>('logger');

    // Determine preload path correctly for both development and production
    let preloadPath: string;
    
    if (process.env.NODE_ENV === 'development') {
      // Development: project_root/dist/electron/preload/index.js
      preloadPath = path.join(__dirname, '..', 'preload', 'index.js');
    } else {
      // Production: Check if we're in asar or regular directory structure
      // In electron-packager: resources/app/dist/electron/main/index.js
      // __dirname = resources/app/dist/electron/main
      preloadPath = path.join(__dirname, '..', 'preload', 'index.js');
      
      // Verify the file exists, if not try alternative paths
      if (!require('fs').existsSync(preloadPath)) {
        // Try absolute path from app root
        const appRoot = process.resourcesPath ? path.join(process.resourcesPath, 'app') : path.join(__dirname, '..', '..', '..');
        preloadPath = path.join(appRoot, 'dist', 'electron', 'preload', 'index.js');
        
        if (!require('fs').existsSync(preloadPath)) {
          // Last resort: relative to main process
          preloadPath = path.join(__dirname, '..', 'preload', 'index.js');
        }
      }
    }
    
    logger.info('Preload path resolved', { 
      preloadPath, 
      __dirname, 
      exists: require('fs').existsSync(preloadPath),
      resourcesPath: process.resourcesPath,
      nodeEnv: process.env.NODE_ENV
    });

    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        contextIsolation: true,      // CRITICAL: Isolate renderer context
        nodeIntegration: false,       // CRITICAL: Disable Node.js in renderer
        sandbox: false,               // CRITICAL: Disable sandbox to allow preload to run
        preload: preloadPath,
        webSecurity: false            // Allow loading local files in production
      }
    });

    // Load renderer
    if (process.env.NODE_ENV === 'development') {
      this.mainWindow.loadURL('http://localhost:5173');
      this.mainWindow.webContents.openDevTools();
    } else {
      // In production with electron-packager: resources/app/dist/renderer/index.html
      let rendererPath: string;
      
      if (process.resourcesPath) {
        // Standard electron-packager structure
        rendererPath = path.join(process.resourcesPath, 'app', 'dist', 'renderer', 'index.html');
      } else {
        // Fallback: relative to main process
        rendererPath = path.join(__dirname, '..', '..', 'renderer', 'index.html');
      }
      
      logger.info('Loading renderer from', { 
        rendererPath, 
        exists: require('fs').existsSync(rendererPath),
        resourcesPath: process.resourcesPath
      });
      
      this.mainWindow.loadFile(rendererPath).catch((error) => {
        logger.error('Failed to load renderer', error);
        
        // Try alternative path
        const altPath = path.join(__dirname, '..', '..', 'renderer', 'index.html');
        logger.info('Trying alternative renderer path', { altPath });
        
        this.mainWindow!.loadFile(altPath).catch((altError) => {
          logger.error('Failed to load renderer from alternative path', altError);
        });
      });
      
      // Open DevTools for debugging
      this.mainWindow.webContents.openDevTools();
    }

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });

    logger.info('Main window created');
  }

  /**
   * Register all IPC handlers
   */
  private registerIpcHandlers(): void {
    const logger = this.container.resolve<FileLogger>('logger');
    const queue = this.container.resolve<DownloadQueue>('queue');

    // Initialize use cases
    const fetchVideoInfoUseCase = new FetchVideoInfoUseCase(
      this.container.resolve('ytDlpExecutor'),
      logger,
      this.container.resolve('errorCategorizer')
    );

    const createDownloadTaskUseCase = new CreateDownloadTaskUseCase(
      queue,
      this.container.resolve('fileSanitizer'),
      this.container.resolve('settingsStore'),
      logger
    );

    // Create callbacks for ExecuteDownloadUseCase
    const onProgressUpdate = (taskId: string, progress: any) => {
      if (this.downloadHandlers) {
        this.downloadHandlers.sendProgressUpdate(taskId, progress, 'downloading');
      }
    };

    const onStatusChange = (taskId: string, status: string) => {
      if (this.downloadHandlers) {
        this.downloadHandlers.sendQueueUpdate();
      }
    };

    const executeDownloadUseCase = new ExecuteDownloadUseCase(
      this.container.resolve('ytDlpExecutor'),
      queue,
      this.container.resolve('progressParser'),
      logger,
      onProgressUpdate,
      onStatusChange
    );

    const manageQueueUseCase = new ManageQueueUseCase(
      queue,
      this.container.resolve('ytDlpExecutor'),
      this.container.resolve('queuePersistence'),
      logger
    );

    // Wire ExecuteDownloadUseCase to ManageQueueUseCase (avoid circular dependency)
    manageQueueUseCase.setExecuteDownloadUseCase(executeDownloadUseCase);

    const updateSettingsUseCase = new UpdateSettingsUseCase(
      this.container.resolve('settingsStore'),
      queue,
      logger
    );

    // Register IPC handlers
    const videoHandlers = new VideoHandlers(fetchVideoInfoUseCase, logger);
    videoHandlers.register();

    this.downloadHandlers = new DownloadHandlers(
      createDownloadTaskUseCase,
      executeDownloadUseCase,
      manageQueueUseCase,
      queue,
      logger,
      () => this.mainWindow
    );
    this.downloadHandlers.register();

    const settingsHandlers = new SettingsHandlers(
      updateSettingsUseCase,
      this.container.resolve('settingsStore'),
      logger
    );
    settingsHandlers.register();

    logger.info('All IPC handlers registered');
  }

  /**
   * Get main window instance
   */
  getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  /**
   * Cleanup on app quit
   */
  cleanup(): void {
    const logger = this.container.resolve<FileLogger>('logger');

    // Stop download handlers interval
    if (this.downloadHandlers) {
      this.downloadHandlers.stopProgressUpdateInterval();
    }

    logger.info('Application cleanup completed');
  }
}

// ============================================================================
// Electron App Lifecycle
// ============================================================================

let application: Application | null = null;

app.whenReady().then(async () => {
  application = new Application();
  await application.initialize();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (application && !application.getMainWindow()) {
    application.initialize();
  }
});

app.on('before-quit', () => {
  if (application) {
    application.cleanup();
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  app.quit();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
});
