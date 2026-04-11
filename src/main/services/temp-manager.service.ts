import { promises as fs } from 'fs';
import { join } from 'path';
import { existsSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { logger } from './logger.service';
import { directoryManager } from './directory-manager.service';

/**
 * Temp Manager Service
 * Manages temporary files with automatic cleanup
 * Requirements: REQ-FUN-016.1, REQ-FUN-016.2, REQ-FUN-016.3, REQ-FUN-016.4,
 *               REQ-FUN-016.5, REQ-FUN-016.6, REQ-FUN-016.7
 */

class TempManagerService {
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
  private readonly MAX_FILE_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
  private readonly STARTUP_CLEANUP_TIMEOUT_MS = 5000; // 5 seconds

  /**
   * Initialize temp manager
   * Performs startup cleanup and schedules periodic cleanup
   */
  public async initialize(): Promise<void> {
    logger.info('TempManager', 'Initializing temp manager');

    try {
      // Perform startup cleanup
      await this.startupCleanup();

      // Schedule periodic cleanup
      this.schedulePeriodicCleanup();

      logger.info('TempManager', 'Temp manager initialized');
    } catch (error) {
      logger.error('TempManager', 'Failed to initialize temp manager', { error });
    }
  }

  /**
   * Startup cleanup - delete all temp files within 5 seconds
   */
  private async startupCleanup(): Promise<void> {
    logger.info('TempManager', 'Starting startup cleanup');

    const startTime = Date.now();

    try {
      const tempDir = await this.getTempDirectory();

      if (!existsSync(tempDir)) {
        logger.debug('TempManager', 'Temp directory does not exist');
        return;
      }

      // Get all files in temp directory
      const files = await fs.readdir(tempDir);
      let deletedCount = 0;
      let failedCount = 0;

      for (const file of files) {
        // Check timeout
        if (Date.now() - startTime > this.STARTUP_CLEANUP_TIMEOUT_MS) {
          logger.warning('TempManager', 'Startup cleanup timeout reached', {
            deletedCount,
            remainingFiles: files.length - deletedCount - failedCount,
          });
          break;
        }

        const filePath = join(tempDir, file);

        try {
          await fs.unlink(filePath);
          deletedCount++;
        } catch (error) {
          failedCount++;
          logger.debug('TempManager', 'Failed to delete temp file', { file, error });
        }
      }

      const duration = Date.now() - startTime;
      logger.info('TempManager', 'Startup cleanup completed', {
        deletedCount,
        failedCount,
        duration,
      });
    } catch (error) {
      logger.error('TempManager', 'Startup cleanup failed', { error });
    }
  }

  /**
   * Schedule periodic cleanup every 6 hours
   */
  private schedulePeriodicCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.periodicCleanup().catch((error) => {
        logger.error('TempManager', 'Periodic cleanup failed', { error });
      });
    }, this.CLEANUP_INTERVAL_MS);

    logger.info('TempManager', 'Periodic cleanup scheduled', {
      intervalHours: this.CLEANUP_INTERVAL_MS / (60 * 60 * 1000),
    });
  }

  /**
   * Periodic cleanup - delete files older than 24 hours
   */
  private async periodicCleanup(): Promise<void> {
    logger.info('TempManager', 'Starting periodic cleanup');

    try {
      const tempDir = await this.getTempDirectory();

      if (!existsSync(tempDir)) {
        return;
      }

      const files = await fs.readdir(tempDir);
      const now = Date.now();
      let deletedCount = 0;

      for (const file of files) {
        const filePath = join(tempDir, file);

        try {
          const stats = statSync(filePath);
          const fileAge = now - stats.mtimeMs;

          // Delete if older than 24 hours
          if (fileAge > this.MAX_FILE_AGE_MS) {
            await fs.unlink(filePath);
            deletedCount++;
            logger.debug('TempManager', 'Deleted old temp file', {
              file,
              ageHours: Math.floor(fileAge / (60 * 60 * 1000)),
            });
          }
        } catch (error) {
          logger.debug('TempManager', 'Failed to process temp file', { file, error });
        }
      }

      logger.info('TempManager', 'Periodic cleanup completed', { deletedCount });
    } catch (error) {
      logger.error('TempManager', 'Periodic cleanup failed', { error });
    }
  }

  /**
   * Cleanup on app exit
   */
  public async cleanup(): Promise<void> {
    logger.info('TempManager', 'Performing exit cleanup');

    // Stop periodic cleanup
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Perform final cleanup
    try {
      await this.periodicCleanup();
    } catch (error) {
      logger.error('TempManager', 'Exit cleanup failed', { error });
    }
  }

  /**
   * Get temp directory with fallback to OS temp
   */
  private async getTempDirectory(): Promise<string> {
    try {
      return await directoryManager.getDirectory('temp');
    } catch (error) {
      logger.warning('TempManager', 'Failed to get app temp directory, using OS temp', { error });
      return join(tmpdir(), 'electron-video-downloader');
    }
  }

  /**
   * Manually trigger cleanup
   */
  public async manualCleanup(): Promise<void> {
    logger.info('TempManager', 'Manual cleanup triggered');
    await this.periodicCleanup();
  }

  /**
   * Get temp directory statistics
   */
  public async getStats(): Promise<{
    fileCount: number;
    totalSize: number;
    oldestFileAge: number;
  }> {
    try {
      const tempDir = await this.getTempDirectory();

      if (!existsSync(tempDir)) {
        return { fileCount: 0, totalSize: 0, oldestFileAge: 0 };
      }

      const files = await fs.readdir(tempDir);
      const now = Date.now();
      let totalSize = 0;
      let oldestFileAge = 0;

      for (const file of files) {
        const filePath = join(tempDir, file);

        try {
          const stats = statSync(filePath);
          totalSize += stats.size;

          const fileAge = now - stats.mtimeMs;
          if (fileAge > oldestFileAge) {
            oldestFileAge = fileAge;
          }
        } catch {
          // Skip files that can't be accessed
        }
      }

      return {
        fileCount: files.length,
        totalSize,
        oldestFileAge,
      };
    } catch (error) {
      logger.error('TempManager', 'Failed to get temp stats', { error });
      return { fileCount: 0, totalSize: 0, oldestFileAge: 0 };
    }
  }
}

// Export singleton instance
export const tempManagerService = new TempManagerService();
