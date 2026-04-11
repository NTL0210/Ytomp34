import { dialog, BrowserWindow } from 'electron';
import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import { basename, dirname, join, extname } from 'path';
import { logger } from './logger.service';
import { sanitizeFilename } from '../utils/input-sanitizer';

/**
 * File Manager Service
 * Handles file save dialogs and file operations
 * Requirements: REQ-FUN-007.1, REQ-FUN-007.2, REQ-FUN-007.3, REQ-FUN-007.4,
 *               REQ-FUN-007.5, REQ-FUN-007.6, REQ-FUN-007.7, REQ-FUN-007.8,
 *               REQ-FUN-007.9, REQ-FUN-007.10
 */

export interface SaveFileOptions {
  defaultFilename: string;
  defaultPath?: string;
  filters?: { name: string; extensions: string[] }[];
}

export interface SaveFileResult {
  success: boolean;
  filePath?: string;
  cancelled?: boolean;
  error?: string;
}

class FileManagerService {
  /**
   * Show native save dialog and handle file saving
   */
  public async saveFile(
    sourcePath: string,
    options: SaveFileOptions,
    mainWindow?: BrowserWindow
  ): Promise<SaveFileResult> {
    logger.info('FileManager', 'Showing save dialog', { sourcePath, options });

    try {
      // Sanitize filename
      const sanitizedFilename = sanitizeFilename(options.defaultFilename);

      // Show save dialog
      const result = await dialog.showSaveDialog(mainWindow || BrowserWindow.getFocusedWindow()!, {
        title: 'Save Video',
        defaultPath: options.defaultPath 
          ? join(options.defaultPath, sanitizedFilename)
          : sanitizedFilename,
        filters: options.filters || [
          { name: 'Video Files', extensions: ['mp4', 'webm', 'mkv', 'avi'] },
          { name: 'Audio Files', extensions: ['mp3', 'm4a'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      // User cancelled
      if (result.canceled || !result.filePath) {
        logger.info('FileManager', 'Save dialog cancelled');
        
        // Cleanup source file
        await this.cleanupFile(sourcePath);
        
        return { success: false, cancelled: true };
      }

      const destinationPath = result.filePath;

      // Handle duplicate file
      if (existsSync(destinationPath)) {
        const overwrite = await this.promptOverwrite(destinationPath, mainWindow);
        
        if (!overwrite) {
          logger.info('FileManager', 'User chose not to overwrite existing file');
          await this.cleanupFile(sourcePath);
          return { success: false, cancelled: true };
        }
      }

      // Move file from temp to destination
      await this.moveFile(sourcePath, destinationPath);

      logger.info('FileManager', 'File saved successfully', {
        source: sourcePath,
        destination: destinationPath,
      });

      return {
        success: true,
        filePath: destinationPath,
      };
    } catch (error: any) {
      logger.error('FileManager', 'Failed to save file', { sourcePath, error });

      // Cleanup on error
      await this.cleanupFile(sourcePath);

      return {
        success: false,
        error: error.message || 'Failed to save file',
      };
    }
  }

  /**
   * Prompt user to overwrite existing file
   */
  private async promptOverwrite(
    filePath: string,
    mainWindow?: BrowserWindow
  ): Promise<boolean> {
    const filename = basename(filePath);

    const result = await dialog.showMessageBox(mainWindow || BrowserWindow.getFocusedWindow()!, {
      type: 'question',
      title: 'File Already Exists',
      message: `The file "${filename}" already exists. Do you want to replace it?`,
      detail: 'Replacing it will overwrite its current contents.',
      buttons: ['Cancel', 'Replace'],
      defaultId: 0,
      cancelId: 0,
    });

    return result.response === 1; // 1 = Replace button
  }

  /**
   * Move file from source to destination
   * Handles permission errors and cross-device moves
   */
  private async moveFile(sourcePath: string, destinationPath: string): Promise<void> {
    try {
      // Ensure destination directory exists
      const destDir = dirname(destinationPath);
      await fs.mkdir(destDir, { recursive: true });

      // Try rename first (fastest, works on same device)
      try {
        await fs.rename(sourcePath, destinationPath);
        logger.debug('FileManager', 'File moved using rename', {
          source: sourcePath,
          destination: destinationPath,
        });
        return;
      } catch (renameError: any) {
        // If rename fails (cross-device), fall back to copy + delete
        if (renameError.code === 'EXDEV') {
          logger.debug('FileManager', 'Cross-device move detected, using copy+delete');
          await fs.copyFile(sourcePath, destinationPath);
          await fs.unlink(sourcePath);
          return;
        }
        throw renameError;
      }
    } catch (error: any) {
      // Handle permission errors
      if (error.code === 'EACCES' || error.code === 'EPERM') {
        throw new Error(`Permission denied: Cannot write to ${destinationPath}`);
      }

      // Handle disk space errors
      if (error.code === 'ENOSPC') {
        throw new Error('Insufficient disk space');
      }

      throw error;
    }
  }

  /**
   * Cleanup temporary file
   */
  private async cleanupFile(filePath: string): Promise<void> {
    try {
      if (existsSync(filePath)) {
        await fs.unlink(filePath);
        logger.debug('FileManager', 'Temp file cleaned up', { filePath });
      }
    } catch (error) {
      logger.warning('FileManager', 'Failed to cleanup temp file', { filePath, error });
    }
  }

  /**
   * Generate unique filename if file exists
   * Appends (1), (2), etc. to filename
   */
  public generateUniqueFilename(filePath: string): string {
    if (!existsSync(filePath)) {
      return filePath;
    }

    const dir = dirname(filePath);
    const ext = extname(filePath);
    const nameWithoutExt = basename(filePath, ext);

    let counter = 1;
    let newPath: string;

    do {
      newPath = join(dir, `${nameWithoutExt} (${counter})${ext}`);
      counter++;
    } while (existsSync(newPath) && counter < 1000); // Safety limit

    return newPath;
  }

  /**
   * Check if file path is writable
   */
  public async isPathWritable(dirPath: string): Promise<boolean> {
    try {
      const testFile = join(dirPath, '.write-test');
      await fs.writeFile(testFile, 'test');
      await fs.unlink(testFile);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file size in bytes
   */
  public async getFileSize(filePath: string): Promise<number> {
    try {
      const stats = await fs.stat(filePath);
      return stats.size;
    } catch {
      return 0;
    }
  }
}

// Export singleton instance
export const fileManagerService = new FileManagerService();
