/**
 * Electron Main Process Entry Point
 * Initializes application, configures BrowserWindow, registers IPC handlers
 * Validates: Requirements 16.1, 16.2, 22.1, 22.2, 22.3, 22.4, 22.5
 */

import { app, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

// Domain entities
import { DownloadQueue, DownloadTask } from './domain/entities';
import { ProgressData } from './infrastructure/ProgressParser';

// Infrastructure services
import {
    FileLogger,
    FileSanitizerImpl,
    SettingsStoreImpl,
    YtDlpExecutorImpl,
    QueuePersistence,
    ErrorCategorizer,
    YtDlpInstaller,
    MIN_SUPPORTED_YT_DLP_VERSION,
    isYtDlpVersionOlderThan,
    FfmpegInstaller,
    DenoInstaller,
    handleSquirrelStartup,
    AppUpdateService
} from './infrastructure';

// Application use cases
import {
    FetchPlaylistInfoUseCase,
    FetchVideoInfoUseCase,
    CreateDownloadTaskUseCase,
    ExecuteDownloadUseCase,
    ManageQueueUseCase,
    UpdateSettingsUseCase
} from './application';

// IPC handlers
import { VideoHandlers, DownloadHandlers, SettingsHandlers, UpdateHandlers, IPC_CHANNELS } from './ipc';

/**
 * Dependency Injection Container
 */
class Container {
    private static instance: Container;
    private services: Map<string, unknown> = new Map();

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
        return service as T;
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

        // Create main window early so user sees loading UI during first-run installations
        this.createMainWindow();

        // Send installation progress to renderer (will be received once renderer loads)
        this.sendInstallProgress('Starting application...', 0);

        // Clean up orphaned .part files from previous crashes
        await this.cleanupOrphanedPartFiles();
        this.sendInstallProgress('Cleaning up temporary files...', 10);

        // Check yt-dlp installation (this may download tools on first run)
        await this.checkYtDlpInstallation(progress => this.sendInstallProgress(progress.message, progress.percent));
        this.sendInstallProgress('Tools ready', 50);

        // Load settings
        await this.loadSettings();
        this.sendInstallProgress('Loading settings...', 60);

        // Restore queue state
        await this.restoreQueueState();
        this.sendInstallProgress('Restoring queue...', 70);

        // Process restored queue (start pending tasks)
        await this.processRestoredQueue();
        this.sendInstallProgress('Processing queue...', 80);

        // Register IPC handlers
        await this.registerIpcHandlers();
        this.sendInstallProgress('Ready', 100);

        const elapsedTime = Date.now() - startTime;
        const logger = this.container.resolve<FileLogger>('logger');
        logger.info('Application initialized', { elapsedTime: `${elapsedTime}ms` });

        // Ensure window is displayed within 2 seconds
        if (elapsedTime > 2000) {
            logger.error('Application initialization exceeded 2 seconds', undefined, { elapsedTime });
        }
    }

    /**
     * Send installation progress to renderer
     */
    private sendInstallProgress(message: string, percent: number): void {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('install:progress', { message, percent });
        }
    }

    /**
     * Initialize dependency injection container
     */
    private async initializeContainer(): Promise<void> {
        // Infrastructure services
        const logger = new FileLogger();
        const fileSanitizer = new FileSanitizerImpl();
        const settingsStore = new SettingsStoreImpl();
        const ytDlpExecutor = new YtDlpExecutorImpl();
        const errorCategorizer = new ErrorCategorizer();
        const queuePersistence = new QueuePersistence();

        // Register infrastructure services
        this.container.register('logger', logger);
        this.container.register('fileSanitizer', fileSanitizer);
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
            addTask: function (task) {
                this.tasks.push(task);
            },
            removeTask: function (taskId) {
                this.tasks = this.tasks.filter(t => t.id !== taskId);
            },
            getNextPendingTask: function () {
                return this.tasks.find(t => t.status === 'pending') || null;
            },
            getActiveTasksCount: function () {
                return this.tasks.filter(t => t.status === 'downloading').length;
            },
            canStartNewTask: function () {
                return this.getActiveTasksCount() < this.maxConcurrent;
            }
        };

        this.container.register('queue', queue);

        logger.info('Dependency injection container initialized');
    }

    /**
         * Check yt-dlp installation on startup
         */
    private async checkYtDlpInstallation(onProgress?: (msg: { message: string; percent: number }) => void): Promise<void> {
        const logger = this.container.resolve<FileLogger>('logger');
        const ytDlpExecutor = this.container.resolve<YtDlpExecutorImpl>('ytDlpExecutor');
        const ytDlpInstaller = new YtDlpInstaller(logger);
        const ffmpegInstaller = new FfmpegInstaller(logger);
        const denoInstaller = new DenoInstaller(logger);

        try {
            logger.info('Checking yt-dlp, JavaScript runtime, and ffmpeg installation...');

            const sendProgress = (message: string, percent: number) => {
                if (onProgress) onProgress({ message, percent });
            };

            sendProgress('Checking yt-dlp...', 5);

            // First check if yt-dlp is in system PATH
            logger.info('Checking system yt-dlp...');
            const { installed, version } = await ytDlpExecutor.checkInstallation();

            if (!installed) {
                logger.info('yt-dlp not found in system PATH, checking bundled version...');
                sendProgress('Downloading yt-dlp...', 10);

                // Check if we have a bundled version
                if (ytDlpInstaller.isInstalled()) {
                    const bundledPath = ytDlpInstaller.getExecutablePath();
                    logger.info('Found bundled yt-dlp, setting path...', { path: bundledPath });
                    ytDlpExecutor.setExecutablePath(bundledPath);

                    const { installed: bundledInstalled, version: bundledVersion } = await ytDlpExecutor.checkInstallation();

                    if (bundledInstalled) {
                        if (isYtDlpVersionOlderThan(bundledVersion, MIN_SUPPORTED_YT_DLP_VERSION)) {
                            logger.info('Bundled yt-dlp is outdated, updating safely...', {
                                version: bundledVersion,
                                minimumVersion: MIN_SUPPORTED_YT_DLP_VERSION
                            });
                            const updateResult = await ytDlpInstaller.update();

                            if (updateResult.success) {
                                const { version: updatedVersion } = await ytDlpExecutor.checkInstallation();
                                logger.info('Bundled yt-dlp updated', { version: updatedVersion, path: bundledPath });
                            } else {
                                logger.error(
                                    'Bundled yt-dlp update failed; continuing with the existing working version',
                                    new Error(updateResult.error || 'Unknown update error')
                                );
                            }
                        } else {
                            logger.info('Using bundled yt-dlp', { version: bundledVersion, path: bundledPath });
                        }
                    } else {
                        logger.error('Bundled yt-dlp exists but not working, re-downloading...');
                        sendProgress('Re-downloading yt-dlp...', 15);
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
                    sendProgress('Downloading yt-dlp...', 15);

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

            sendProgress('Checking Deno runtime...', 25);

            // Full YouTube format extraction requires a JavaScript runtime.
            logger.info('Checking Deno JavaScript runtime...');
            if (!denoInstaller.isInstalled()) {
                sendProgress('Downloading Deno runtime...', 30);
                const result = await denoInstaller.install();
                if (!result.success) {
                    logger.error(
                        'Failed to install Deno; some YouTube qualities may be unavailable',
                        new Error(result.error || 'Unknown error')
                    );
                }
            }

            if (denoInstaller.isInstalled()) {
                const denoPath = denoInstaller.getExecutablePath();
                ytDlpExecutor.setJavaScriptRuntimePath(denoPath);
                logger.info('Using bundled Deno runtime for yt-dlp', { path: denoPath });
            }

            sendProgress('Checking ffmpeg...', 35);

            // Check and install ffmpeg
            logger.info('Checking ffmpeg installation...');

            if (!ffmpegInstaller.isInstalled()) {
                logger.info('ffmpeg not found, downloading...');
                sendProgress('Downloading ffmpeg...', 40);

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
            sendProgress('Verifying installations...', 45);

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
                queue.tasks = restoredQueue.tasks.map((task: DownloadTask) => {
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
     * Clean up orphaned .part files from previous crashes
     */
    private async cleanupOrphanedPartFiles(): Promise<void> {
        const logger = this.container.resolve<FileLogger>('logger');
        const settingsStore = this.container.resolve<SettingsStoreImpl>('settingsStore');

        try {
            const settings = await settingsStore.load();
            const downloadDir = settings.downloadDirectory;

            if (!fs.existsSync(downloadDir)) {
                return;
            }

            const files = await fs.promises.readdir(downloadDir);
            const partFiles = files.filter(f => f.endsWith('.part'));

            for (const partFile of partFiles) {
                const fullPath = path.join(downloadDir, partFile);
                try {
                    await fs.promises.unlink(fullPath);
                    logger.info('Cleaned up orphaned .part file', { file: partFile });
                } catch (error) {
                    logger.error('Failed to delete .part file', error as Error, { file: partFile });
                }
            }

            if (partFiles.length > 0) {
                logger.info('Orphaned .part file cleanup completed', { cleanedCount: partFiles.length });
            }
        } catch (error) {
            logger.error('Failed to cleanup orphaned .part files', error as Error);
        }
    }

    /**
     * Process restored queue - start pending tasks
     */
    private async processRestoredQueue(): Promise<void> {
        const logger = this.container.resolve<FileLogger>('logger');
        const queue = this.container.resolve<DownloadQueue>('queue');

        // Check if there are pending tasks that need to be started
        const pendingTasks = queue.tasks.filter(t => t.status === 'pending');

        if (pendingTasks.length > 0) {
            logger.info('Found pending tasks in restored queue, will start processing after IPC handlers registered', {
                pendingCount: pendingTasks.length
            });
            // The actual processing will happen after IPC handlers are registered
            // We'll trigger it from registerIpcHandlers after wiring is complete
        }
    }

    /**
     * Create main browser window
     */
    private createMainWindow(): void {
        const logger = this.container.resolve<FileLogger>('logger');

        // Determine preload path correctly for both development and production
        let preloadPath: string;

        if (!app.isPackaged) {
            // Development: project_root/dist/electron/preload/index.js
            preloadPath = path.join(__dirname, '..', 'preload', 'index.js');
        } else {
            // Production: Check if we're in asar or regular directory structure
            // In electron-packager: resources/app/dist/electron/main/index.js
            // __dirname = resources/app/dist/electron/main
            preloadPath = path.join(__dirname, '..', 'preload', 'index.js');

            // Verify the file exists, if not try alternative paths
            if (!fs.existsSync(preloadPath)) {
                // Try absolute path from app root
                const appRoot = process.resourcesPath ? path.join(process.resourcesPath, 'app') : path.join(__dirname, '..', '..', '..');
                preloadPath = path.join(appRoot, 'dist', 'electron', 'preload', 'index.js');

                if (!fs.existsSync(preloadPath)) {
                    // Last resort: relative to main process
                    preloadPath = path.join(__dirname, '..', 'preload', 'index.js');
                }
            }
        }

        logger.info('Preload path resolved', {
            preloadPath,
            __dirname,
            exists: fs.existsSync(preloadPath),
            resourcesPath: process.resourcesPath,
            nodeEnv: process.env.NODE_ENV
        });

        const appIconPath = app.isPackaged
            ? path.join(app.getAppPath(), 'dist', 'renderer', 'icon.png')
            : path.join(app.getAppPath(), 'assets', 'icon.png');

        this.mainWindow = new BrowserWindow({
            width: 1200,
            height: 800,
            icon: appIconPath,
            webPreferences: {
                contextIsolation: true,      // CRITICAL: Isolate renderer context
                nodeIntegration: false,       // CRITICAL: Disable Node.js in renderer
                sandbox: true,
                preload: preloadPath,
                webSecurity: true
            }
        });

        // Load renderer
        if (!app.isPackaged) {
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
                exists: fs.existsSync(rendererPath),
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

        }

        this.mainWindow.on('closed', () => {
            this.mainWindow = null;
        });

        logger.info('Main window created');
    }

    /**
         * Register all IPC handlers
         */
    private async registerIpcHandlers(): Promise<void> {
        const logger = this.container.resolve<FileLogger>('logger');
        const queue = this.container.resolve<DownloadQueue>('queue');

        // Initialize use cases
        const fetchVideoInfoUseCase = new FetchVideoInfoUseCase(
            this.container.resolve('ytDlpExecutor'),
            logger,
            this.container.resolve('errorCategorizer')
        );

        const fetchPlaylistInfoUseCase = new FetchPlaylistInfoUseCase(
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
        const onProgressUpdate = (taskId: string, progress: ProgressData) => {
            if (this.downloadHandlers) {
                this.downloadHandlers.sendProgressUpdate(taskId, progress, 'downloading');
            }
        };

        const onStatusChange = () => {
            if (this.downloadHandlers) {
                this.downloadHandlers.sendQueueUpdate();
            }
        };

        const executeDownloadUseCase = new ExecuteDownloadUseCase(
            this.container.resolve('ytDlpExecutor'),
            queue,
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
            logger,
            manageQueueUseCase
        );

        // Register IPC handlers
        const videoHandlers = new VideoHandlers(
            fetchVideoInfoUseCase,
            fetchPlaylistInfoUseCase,
            logger
        );
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

        const updateService = new AppUpdateService(logger, (status) => {
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send(IPC_CHANNELS.UPDATE_STATUS, status);
            }
        }, () => queue.getActiveTasksCount() === 0);
        const updateHandlers = new UpdateHandlers(updateService);
        updateHandlers.register();

        // Process restored queue after all handlers are wired
        await manageQueueUseCase.processQueue();

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

const squirrelStartupHandled = handleSquirrelStartup();
if (process.platform === 'win32') {
    app.setAppUserModelId('com.squirrel.ytomp34.Ytomp34');
}

let application: Application | null = null;

if (!squirrelStartupHandled) {
    app.whenReady().then(async () => {
        application = new Application();
        await application.initialize();
    });
}

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
