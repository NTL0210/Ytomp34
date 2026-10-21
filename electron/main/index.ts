/**
 * Electron Main Process Entry Point
 * Initializes application, configures BrowserWindow, registers IPC handlers
 * Validates: Requirements 16.1, 16.2, 22.1, 22.2, 22.3, 22.4, 22.5
 */

import * as electron from 'electron';
import type { BrowserWindow as BrowserWindowType } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

const { app, BrowserWindow } = electron;

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
    RECOMMENDED_YT_DLP_VERSION,
    isYtDlpVersionOlderThan,
    FfmpegInstaller,
    DenoInstaller,
    setCookieConfig,
    buildYtDlpCandidates,
    resolveFirstRunnableTool,
    testToolCandidate,
    ResolvedTool,
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
    private mainWindow: BrowserWindowType | null = null;
    private container: Container;
    private downloadHandlers: DownloadHandlers | null = null;
    private manageQueueUseCase: ManageQueueUseCase | null = null;

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

        // Register IPC handlers before the renderer is loaded. The renderer
        // calls settings:get as soon as it mounts; registering afterwards (as
        // this used to) raced with tool checks and produced
        // "No handler registered for 'settings:get'".
        this.registerIpcHandlers();

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

        // Cookies are optional and opt-in. Forcing --cookies-from-browser here
        // breaks every request on machines where Chrome/Edge cookies cannot be
        // decrypted (DPAPI app-bound encryption). Users who need authenticated
        // YouTube access can set one of these environment variables.
        const cookiesFile = process.env.YTDLP_COOKIES_FILE?.trim();
        const cookiesFromBrowser = process.env.YTDLP_COOKIES_FROM_BROWSER?.trim();
        if (cookiesFile || cookiesFromBrowser) {
            setCookieConfig({
                cookiesFile: cookiesFile || undefined,
                cookiesFromBrowser: cookiesFile ? undefined : cookiesFromBrowser,
                fallbackBrowsers: []
            });
            logger.info('Configured optional yt-dlp cookies', {
                cookiesFile: cookiesFile || undefined,
                cookiesFromBrowser: cookiesFile ? undefined : cookiesFromBrowser
            });
        }

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

        const sendProgress = (message: string, percent: number) => {
            if (onProgress) onProgress({ message, percent });
        };

        const bundledCandidate = {
            id: 'bundled' as const,
            label: 'bundled yt-dlp',
            command: ytDlpInstaller.getExecutablePath(),
            prefixArgs: []
        };

        const keepBundledCurrent = async (tool: ResolvedTool | null): Promise<ResolvedTool | null> => {
            if (!tool || tool.id !== 'bundled') return tool;
            if (!isYtDlpVersionOlderThan(tool.version, RECOMMENDED_YT_DLP_VERSION)) return tool;

            logger.info('Bundled yt-dlp is outdated, updating safely...', {
                version: tool.version,
                recommendedVersion: RECOMMENDED_YT_DLP_VERSION
            });

            const updateResult = await ytDlpInstaller.update();
            if (!updateResult.success) {
                logger.error(
                    'Bundled yt-dlp update failed; continuing with the existing working version',
                    new Error(updateResult.error || 'Unknown update error')
                );
                return tool;
            }

            return await testToolCandidate(bundledCandidate) ?? tool;
        };

        const detectYtDlp = async (): Promise<ResolvedTool | null> => {
            const existing = await resolveFirstRunnableTool(
                buildYtDlpCandidates(ytDlpInstaller.getExecutablePath())
            );
            const current = await keepBundledCurrent(existing);
            if (current) return current;

            logger.info('No working yt-dlp found, downloading...');
            sendProgress('Downloading yt-dlp...', 15);

            const installResult = await ytDlpInstaller.install();
            if (!installResult.success) {
                logger.error('Failed to download yt-dlp', new Error(installResult.error || 'Unknown error'));
                return null;
            }

            return keepBundledCurrent(await testToolCandidate(bundledCandidate));
        };

        try {
            logger.info('Checking yt-dlp, JavaScript runtime, and ffmpeg installation...');
            sendProgress('Checking yt-dlp...', 5);

            const tool = await detectYtDlp();
            if (tool) {
                ytDlpExecutor.setCommand(tool.command, tool.prefixArgs);
                logger.info('Using yt-dlp', {
                    source: tool.id,
                    version: tool.version,
                    command: tool.command
                });
            } else {
                logger.error('No working yt-dlp installation was found. Downloads will fail until it is available.');
            }

            // Self-healing: the executor calls this when a download fails
            // because the binary disappeared or was replaced by an invalid file.
            ytDlpExecutor.setRepairHandler(async () => {
                sendProgress('Repairing yt-dlp...', 15);
                const repaired = await detectYtDlp();
                if (!repaired) return false;

                ytDlpExecutor.setCommand(repaired.command, repaired.prefixArgs);
                const check = await ytDlpExecutor.checkInstallation();
                if (check.installed) {
                    logger.info('yt-dlp repaired successfully', {
                        source: repaired.id,
                        version: check.version
                    });
                }
                return check.installed;
            });

            sendProgress('Checking Deno runtime...', 25);

            // Full YouTube format extraction requires a JavaScript runtime.
            logger.info('Checking Deno JavaScript runtime...');
            if (!denoInstaller.isInstalled() || !(await denoInstaller.isRunnable())) {
                sendProgress('Downloading Deno runtime...', 30);
                const result = await denoInstaller.install();
                if (!result.success) {
                    logger.error(
                        'Failed to install Deno; some YouTube qualities may be unavailable',
                        new Error(result.error || 'Unknown error')
                    );
                }
            }

            if (denoInstaller.isInstalled() && await denoInstaller.isRunnable()) {
                const denoPath = denoInstaller.getExecutablePath();
                ytDlpExecutor.setJavaScriptRuntimePath(denoPath);
                logger.info('Using bundled Deno runtime for yt-dlp', { path: denoPath });
            } else {
                ytDlpExecutor.setJavaScriptRuntimePath('');
                logger.info('Deno runtime unavailable; continuing without a JavaScript runtime');
            }

            sendProgress('Checking ffmpeg...', 35);
            logger.info('Checking ffmpeg installation...');

            const ffmpegState = await ffmpegInstaller.ensureAvailable();
            if (ffmpegState.available) {
                // location is undefined when ffmpeg is on PATH.
                ytDlpExecutor.setFfmpegLocation(ffmpegState.location ?? null);
                ytDlpExecutor.setFfmpegAvailable(true);
                logger.info('ffmpeg available', {
                    source: ffmpegState.source,
                    location: ffmpegState.location ?? 'PATH',
                    version: ffmpegState.version
                });
            } else {
                ytDlpExecutor.setFfmpegAvailable(false);
                logger.error(
                    'ffmpeg is unavailable. Video downloads will use pre-merged formats and audio downloads will be saved as m4a.',
                    new Error(ffmpegState.error || 'ffmpeg could not be installed')
                );
            }

            sendProgress('Verifying installations...', 45);

            const finalCheck = await ytDlpExecutor.checkInstallation();
            if (finalCheck.installed) {
                logger.info('yt-dlp verification successful', { version: finalCheck.version });
            } else {
                logger.error('yt-dlp verification failed - downloads will use fallbacks where possible');
            }

            logger.info('Tool verification complete', {
                ytDlp: finalCheck.installed,
                ffmpeg: ffmpegState.available,
                deno: denoInstaller.isInstalled()
            });
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

        const pendingTasks = queue.tasks.filter(t => t.status === 'pending');
        if (pendingTasks.length > 0) {
            logger.info('Starting pending tasks from restored queue', {
                pendingCount: pendingTasks.length
            });
        }

        if (this.manageQueueUseCase) {
            await this.manageQueueUseCase.processQueue();
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

            this.mainWindow.loadFile(rendererPath).catch((error: Error) => {
                logger.error('Failed to load renderer', error);

                // Try alternative path
                const altPath = path.join(__dirname, '..', '..', 'renderer', 'index.html');
                logger.info('Trying alternative renderer path', { altPath });

                this.mainWindow!.loadFile(altPath).catch((altError: Error) => {
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
    private registerIpcHandlers(): void {
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
        this.manageQueueUseCase = manageQueueUseCase;

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

        logger.info('All IPC handlers registered');
    }

    /**
     * Get main window instance
     */
    getMainWindow(): BrowserWindowType | null {
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
