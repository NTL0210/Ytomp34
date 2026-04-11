import { app } from 'electron';
import { join } from 'path';
import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { logger } from './logger.service';

/**
 * Directory Manager Service
 * Manages application directories and ensures they exist
 * Requirements: REQ-FUN-015.1, REQ-FUN-016.1, REQ-FUN-016.2
 */

export interface AppDirectories {
  temp: string;
  cache: string;
  settings: string;
  history: string;
  logs: string;
  userData: string;
}

class DirectoryManagerService {
  private directories: AppDirectories | null = null;
  private initialized: boolean = false;

  /**
   * Initialize all application directories
   * Creates directories if they don't exist
   */
  public async initialize(): Promise<AppDirectories> {
    if (this.initialized && this.directories) {
      return this.directories;
    }

    logger.info('DirectoryManager', 'Initializing application directories');

    try {
      // Get base paths from Electron
      const userDataPath = app.getPath('userData');
      const logsPath = app.getPath('logs');
      
      // Define temp path with fallback
      let tempPath: string;
      try {
        tempPath = join(app.getPath('temp'), 'electron-video-downloader');
      } catch (error) {
        logger.warning('DirectoryManager', 'Failed to get app temp path, using OS temp', { error });
        tempPath = join(tmpdir(), 'electron-video-downloader');
      }

      this.directories = {
        temp: tempPath,
        cache: join(userDataPath, 'cache'),
        settings: join(userDataPath, 'settings'),
        history: join(userDataPath, 'history'),
        logs: logsPath,
        userData: userDataPath,
      };

      // Create all directories
      await this.createDirectories();

      this.initialized = true;
      logger.info('DirectoryManager', 'Directories initialized successfully', this.directories);

      return this.directories;
    } catch (error) {
      logger.error('DirectoryManager', 'Failed to initialize directories', { error });
      throw error;
    }
  }

  /**
   * Create all required directories
   */
  private async createDirectories(): Promise<void> {
    if (!this.directories) {
      throw new Error('Directories not defined');
    }

    const directoriesToCreate = Object.entries(this.directories);

    for (const [name, path] of directoriesToCreate) {
      try {
        await this.ensureDirectory(path);
        logger.debug('DirectoryManager', `Directory ensured: ${name}`, { path });
      } catch (error) {
        logger.error('DirectoryManager', `Failed to create directory: ${name}`, { path, error });
        
        // For critical directories, throw error
        if (name === 'userData' || name === 'settings') {
          throw error;
        }
        
        // For non-critical directories, continue with warning
        logger.warning('DirectoryManager', `Continuing without ${name} directory`);
      }
    }
  }

  /**
   * Ensure a directory exists, create if it doesn't
   */
  private async ensureDirectory(dirPath: string): Promise<void> {
    try {
      if (!existsSync(dirPath)) {
        await fs.mkdir(dirPath, { recursive: true });
        logger.debug('DirectoryManager', 'Directory created', { path: dirPath });
      }
    } catch (error: any) {
      // Check if error is due to permissions
      if (error.code === 'EACCES' || error.code === 'EPERM') {
        logger.error('DirectoryManager', 'Permission denied creating directory', { 
          path: dirPath, 
          error: error.message 
        });
        throw new Error(`Permission denied: Cannot create directory ${dirPath}`);
      }
      
      // Check if error is due to disk space
      if (error.code === 'ENOSPC') {
        logger.error('DirectoryManager', 'No disk space available', { path: dirPath });
        throw new Error('Insufficient disk space to create directories');
      }
      
      throw error;
    }
  }

  /**
   * Get all application directories
   * Initializes if not already done
   */
  public async getDirectories(): Promise<AppDirectories> {
    if (!this.initialized || !this.directories) {
      return await this.initialize();
    }
    return this.directories;
  }

  /**
   * Get specific directory path
   */
  public async getDirectory(name: keyof AppDirectories): Promise<string> {
    const dirs = await this.getDirectories();
    return dirs[name];
  }

  /**
   * Check if a directory exists
   */
  public async directoryExists(dirPath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(dirPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Get directory size in bytes
   */
  public async getDirectorySize(dirPath: string): Promise<number> {
    try {
      let totalSize = 0;
      const files = await fs.readdir(dirPath, { withFileTypes: true });

      for (const file of files) {
        const filePath = join(dirPath, file.name);
        
        if (file.isDirectory()) {
          totalSize += await this.getDirectorySize(filePath);
        } else {
          const stats = await fs.stat(filePath);
          totalSize += stats.size;
        }
      }

      return totalSize;
    } catch (error) {
      logger.error('DirectoryManager', 'Failed to calculate directory size', { dirPath, error });
      return 0;
    }
  }

  /**
   * Clean a directory (remove all files but keep directory)
   */
  public async cleanDirectory(dirPath: string): Promise<void> {
    try {
      if (!existsSync(dirPath)) {
        return;
      }

      const files = await fs.readdir(dirPath);
      
      for (const file of files) {
        const filePath = join(dirPath, file);
        try {
          const stats = await fs.stat(filePath);
          
          if (stats.isDirectory()) {
            await fs.rm(filePath, { recursive: true, force: true });
          } else {
            await fs.unlink(filePath);
          }
        } catch (error) {
          logger.warning('DirectoryManager', 'Failed to delete file during cleanup', { 
            filePath, 
            error 
          });
        }
      }

      logger.info('DirectoryManager', 'Directory cleaned', { dirPath });
    } catch (error) {
      logger.error('DirectoryManager', 'Failed to clean directory', { dirPath, error });
      throw error;
    }
  }

  /**
   * Reset initialization state (for testing)
   */
  public reset(): void {
    this.initialized = false;
    this.directories = null;
  }
}

// Export singleton instance
export const directoryManager = new DirectoryManagerService();
