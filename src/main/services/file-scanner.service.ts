import { spawn } from 'child_process';
import { extname } from 'path';
import { statSync, promises as fs } from 'fs';
import { existsSync } from 'fs';
import { logger } from './logger.service';

/**
 * File Scanner Service
 * Validates downloaded files for security threats
 * Requirements: REQ-FUN-006.1, REQ-FUN-006.2, REQ-FUN-006.3, REQ-FUN-006.4,
 *               REQ-FUN-006.5, REQ-FUN-006.6, REQ-FUN-006.7, REQ-FUN-006.8,
 *               REQ-FUN-006.9, REQ-FUN-006.10
 */

// Extension whitelists and blacklists
const ALLOWED_EXTENSIONS = ['.mp4', '.mp3', '.webm', '.mkv', '.m4a', '.avi'];
const DANGEROUS_EXTENSIONS = ['.exe', '.bat', '.msi', '.cmd', '.scr', '.vbs', '.ps1', '.com', '.pif'];

// File size limits
const MIN_FILE_SIZE = 1; // 1 byte
const MAX_FILE_SIZE = 10 * 1024 * 1024 * 1024; // 10GB

// Windows Defender paths
const DEFENDER_PATHS = [
  'C:\\Program Files\\Windows Defender\\MpCmdRun.exe',
  'C:\\ProgramData\\Microsoft\\Windows Defender\\Platform\\*\\MpCmdRun.exe',
];

export interface ScanResult {
  safe: boolean;
  threats: string[];
  warnings: string[];
  scanPerformed: boolean;
}

class FileScannerService {
  private defenderPath: string | null = null;

  /**
   * Find Windows Defender executable
   */
  private async findDefender(): Promise<string | null> {
    if (this.defenderPath) {
      return this.defenderPath;
    }

    // Try known paths
    for (const path of DEFENDER_PATHS) {
      if (path.includes('*')) {
        // Handle wildcard path (Platform version folder)
        try {
          const baseDir = path.substring(0, path.indexOf('*') - 1);
          const files = await fs.readdir(baseDir);
          
          for (const file of files) {
            const fullPath = path.replace('*', file);
            if (existsSync(fullPath)) {
              this.defenderPath = fullPath;
              logger.info('FileScanner', 'Windows Defender found', { path: fullPath });
              return fullPath;
            }
          }
        } catch {
          continue;
        }
      } else {
        if (existsSync(path)) {
          this.defenderPath = path;
          logger.info('FileScanner', 'Windows Defender found', { path });
          return path;
        }
      }
    }

    logger.warning('FileScanner', 'Windows Defender not found');
    return null;
  }

  /**
   * Scan file for security threats
   * Performs extension validation, size validation, and Windows Defender scan
   */
  public async scanFile(filePath: string): Promise<ScanResult> {
    logger.info('FileScanner', 'Scanning file', { filePath });

    const result: ScanResult = {
      safe: true,
      threats: [],
      warnings: [],
      scanPerformed: false,
    };

    try {
      // Check file exists
      if (!existsSync(filePath)) {
        result.safe = false;
        result.threats.push('File does not exist');
        return result;
      }

      // Extension validation
      const extensionCheck = this.validateExtension(filePath);
      if (!extensionCheck.valid) {
        result.safe = false;
        result.threats.push(...extensionCheck.errors);
        return result;
      }
      result.warnings.push(...extensionCheck.warnings);

      // File size validation
      const sizeCheck = this.validateFileSize(filePath);
      if (!sizeCheck.valid) {
        result.safe = false;
        result.threats.push(...sizeCheck.errors);
        return result;
      }
      result.warnings.push(...sizeCheck.warnings);

      // Windows Defender scan
      const defenderResult = await this.scanWithDefender(filePath);
      result.scanPerformed = defenderResult.scanPerformed;
      
      if (!defenderResult.safe) {
        result.safe = false;
        result.threats.push(...defenderResult.threats);
      }
      result.warnings.push(...defenderResult.warnings);

      logger.info('FileScanner', 'File scan completed', {
        filePath,
        safe: result.safe,
        threats: result.threats.length,
        scanPerformed: result.scanPerformed,
      });

      return result;
    } catch (error) {
      logger.error('FileScanner', 'File scan failed', { filePath, error });
      result.safe = false;
      result.threats.push('Scan failed due to error');
      return result;
    }
  }

  /**
   * Validate file extension against whitelist and blacklist
   */
  private validateExtension(filePath: string): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const ext = extname(filePath).toLowerCase();
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check blacklist first (security critical)
    if (DANGEROUS_EXTENSIONS.includes(ext)) {
      errors.push(`Dangerous file extension detected: ${ext}`);
      return { valid: false, errors, warnings };
    }

    // Check whitelist
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      warnings.push(`File extension ${ext} is not in the standard whitelist`);
    }

    return { valid: true, errors, warnings };
  }

  /**
   * Validate file size
   */
  private validateFileSize(filePath: string): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const stats = statSync(filePath);
      const size = stats.size;

      // Check minimum size
      if (size < MIN_FILE_SIZE) {
        errors.push('File is empty or corrupted');
        return { valid: false, errors, warnings };
      }

      // Check maximum size
      if (size > MAX_FILE_SIZE) {
        errors.push(`File size (${this.formatBytes(size)}) exceeds maximum allowed (10GB)`);
        return { valid: false, errors, warnings };
      }

      // Warning for very large files
      if (size > 5 * 1024 * 1024 * 1024) { // > 5GB
        warnings.push(`File is very large: ${this.formatBytes(size)}`);
      }

      return { valid: true, errors, warnings };
    } catch (error) {
      errors.push('Failed to read file size');
      return { valid: false, errors, warnings };
    }
  }

  /**
   * Scan file with Windows Defender
   */
  private async scanWithDefender(filePath: string): Promise<{
    safe: boolean;
    threats: string[];
    warnings: string[];
    scanPerformed: boolean;
  }> {
    const result = {
      safe: true,
      threats: [] as string[],
      warnings: [] as string[],
      scanPerformed: false,
    };

    try {
      const defenderPath = await this.findDefender();

      if (!defenderPath) {
        result.warnings.push('Windows Defender not available - file not scanned');
        return result;
      }

      // Run Windows Defender scan
      const scanResult = await this.runDefenderScan(defenderPath, filePath);
      result.scanPerformed = true;

      if (!scanResult.success) {
        if (scanResult.threatDetected) {
          result.safe = false;
          result.threats.push('Threat detected by Windows Defender');
          
          // Delete the file
          try {
            await fs.unlink(filePath);
            logger.warning('FileScanner', 'Threat detected - file deleted', { filePath });
          } catch (error) {
            logger.error('FileScanner', 'Failed to delete infected file', { filePath, error });
          }
        } else if (scanResult.timeout) {
          result.warnings.push('Defender scan timed out');
        } else {
          result.warnings.push('Defender scan failed');
        }
      }

      return result;
    } catch (error) {
      logger.error('FileScanner', 'Defender scan error', { error });
      result.warnings.push('Defender scan encountered an error');
      return result;
    }
  }

  /**
   * Run Windows Defender scan on file
   */
  private async runDefenderScan(
    defenderPath: string,
    filePath: string
  ): Promise<{
    success: boolean;
    threatDetected: boolean;
    timeout: boolean;
  }> {
    return new Promise((resolve) => {
      const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

      // Spawn Defender scan
      // -Scan -ScanType 3 -File <path> = Custom scan on specific file
      const process = spawn(defenderPath, ['-Scan', '-ScanType', '3', '-File', filePath], {
        shell: false,
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      // Set timeout
      const timeout = setTimeout(() => {
        timedOut = true;
        process.kill('SIGTERM');
        logger.warning('FileScanner', 'Defender scan timed out', { filePath });
      }, TIMEOUT_MS);

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        clearTimeout(timeout);

        if (timedOut) {
          resolve({ success: false, threatDetected: false, timeout: true });
          return;
        }

        // Exit code 2 = threat detected
        // Exit code 0 = no threat
        const threatDetected = code === 2;
        const success = code === 0;

        logger.debug('FileScanner', 'Defender scan completed', {
          filePath,
          code,
          threatDetected,
          success,
        });

        resolve({ success, threatDetected, timeout: false });
      });

      process.on('error', (error) => {
        clearTimeout(timeout);
        logger.error('FileScanner', 'Defender process error', { error });
        resolve({ success: false, threatDetected: false, timeout: false });
      });
    });
  }

  /**
   * Format bytes to human-readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }
}

// Export singleton instance
export const fileScannerService = new FileScannerService();
