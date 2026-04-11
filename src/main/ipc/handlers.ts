import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/types';
import type {
  ValidationResult,
  VideoMetadata,
  DownloadRequest,
  Settings,
  HistoryEntry,
} from '../../shared/types';
import { logger } from '../services/logger.service';
import { urlValidator } from '../services/url-validator.service';
import { ytdlpService } from '../services/ytdlp.service';
import { downloadService } from '../services/download.service';

/**
 * IPC Handlers for Main Process
 * These handlers will be implemented in later tasks with actual service logic
 */

export function registerIPCHandlers(mainWindow: BrowserWindow): void {
  // Set main window for download service
  downloadService.setMainWindow(mainWindow);

  // URL Validation Handler
  ipcMain.handle(IPC_CHANNELS.CHECK_URL, async (_event, url: string): Promise<ValidationResult> => {
    logger.debug('IPC', 'CHECK_URL called', { url });
    
    try {
      const result = await urlValidator.validateURL(url);
      logger.info('IPC', 'URL validation result', { url, isValid: result.isValid });
      return result;
    } catch (error) {
      logger.error('IPC', 'URL validation failed', { url, error });
      return {
        isValid: false,
        warnings: [],
        errors: ['Failed to validate URL'],
        protocol: '',
        domain: '',
      };
    }
  });

  // Metadata Fetch Handler
  ipcMain.handle(IPC_CHANNELS.FETCH_METADATA, async (_event, url: string): Promise<VideoMetadata> => {
    logger.debug('IPC', 'FETCH_METADATA called', { url });
    
    try {
      const metadata = await ytdlpService.fetchMetadata(url);
      logger.info('IPC', 'Metadata fetched successfully', { 
        url, 
        title: metadata.title,
        formats: metadata.formats.length,
      });
      return metadata;
    } catch (error) {
      logger.error('IPC', 'Metadata fetch failed', { url, error });
      throw error;
    }
  });

  // Download Video Handler
  ipcMain.handle(IPC_CHANNELS.DOWNLOAD_VIDEO, async (_event, request: DownloadRequest): Promise<void> => {
    logger.info('IPC', 'DOWNLOAD_VIDEO called', { request });
    
    try {
      await downloadService.startDownload(request);
    } catch (error) {
      logger.error('IPC', 'Download failed', { request, error });
      throw error;
    }
  });

  // Cancel Download Handler
  ipcMain.handle(IPC_CHANNELS.CANCEL_DOWNLOAD, async (): Promise<void> => {
    logger.info('IPC', 'CANCEL_DOWNLOAD called');
    await downloadService.cancelDownload();
  });

  // Get Settings Handler
  ipcMain.handle(IPC_CHANNELS.GET_SETTINGS, async (): Promise<Settings> => {
    // TODO: Implement in Task 6.1 (Settings Service)
    logger.debug('IPC', 'GET_SETTINGS called');
    return {
      language: 'en',
      theme: 'system',
      defaultDownloadPath: '',
      maxDownloadSize: 10737418240, // 10GB
    };
  });

  // Update Settings Handler
  ipcMain.handle(IPC_CHANNELS.UPDATE_SETTINGS, async (_event, settings: Partial<Settings>): Promise<void> => {
    // TODO: Implement in Task 6.1 (Settings Service)
    logger.info('IPC', 'UPDATE_SETTINGS called', { settings });
  });

  // Get History Handler
  ipcMain.handle(IPC_CHANNELS.GET_HISTORY, async (): Promise<HistoryEntry[]> => {
    // TODO: Implement in Task 8.1 (History Service)
    logger.debug('IPC', 'GET_HISTORY called');
    return [];
  });

  // Clear History Handler
  ipcMain.handle(IPC_CHANNELS.CLEAR_HISTORY, async (): Promise<void> => {
    // TODO: Implement in Task 8.1 (History Service)
    logger.info('IPC', 'CLEAR_HISTORY called');
  });

  logger.info('IPC', 'All handlers registered successfully');
}

/**
 * Cleanup function to remove all IPC handlers
 * Should be called before app quit
 */
export function unregisterIPCHandlers(): void {
  Object.values(IPC_CHANNELS).forEach((channel) => {
    ipcMain.removeHandler(channel);
  });
  logger.info('IPC', 'All handlers unregistered');
}
