/**
 * YtDlpInstaller
 * Automatically downloads and installs yt-dlp if not present
 */

import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import * as os from 'os';
import { spawn } from 'child_process';
import { app } from 'electron';
import { FileLogger } from './Logger';

export const MIN_SUPPORTED_YT_DLP_VERSION = '2026.06.09';

export function isYtDlpVersionOlderThan(version: string | undefined, minimum: string): boolean {
  const normalize = (value: string | undefined): number | null => {
    const match = value?.trim().match(/^(\d{4})\.(\d{2})\.(\d{2})/);
    return match ? Number(`${match[1]}${match[2]}${match[3]}`) : null;
  };

  const currentValue = normalize(version);
  const minimumValue = normalize(minimum);
  return currentValue !== null && minimumValue !== null && currentValue < minimumValue;
}

export class YtDlpInstaller {
  private logger: FileLogger;
  private ytDlpPath: string;
  private downloadUrl: string;

  constructor(logger: FileLogger) {
    this.logger = logger;

    // Determine platform-specific download URL and path
    const platform = os.platform();
    const appDataPath = app.getPath('userData');
    const binDir = path.join(appDataPath, 'bin');

    if (platform === 'win32') {
      this.ytDlpPath = path.join(binDir, 'yt-dlp.exe');
      this.downloadUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
    } else if (platform === 'darwin') {
      this.ytDlpPath = path.join(binDir, 'yt-dlp');
      this.downloadUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos';
    } else {
      // Linux
      this.ytDlpPath = path.join(binDir, 'yt-dlp');
      this.downloadUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';
    }

    // Ensure bin directory exists
    if (!fs.existsSync(binDir)) {
      fs.mkdirSync(binDir, { recursive: true });
    }
  }

  /**
   * Check if yt-dlp is installed
   */
  isInstalled(): boolean {
    return fs.existsSync(this.ytDlpPath);
  }

  /**
   * Get yt-dlp executable path
   */
  getExecutablePath(): string {
    return this.ytDlpPath;
  }

  /**
   * Download and install yt-dlp
   */
  async install(): Promise<{ success: boolean; error?: string }> {
    try {
      this.logger.info('Downloading yt-dlp...', { url: this.downloadUrl });

      const version = await this.downloadAndReplace();

      this.logger.info('yt-dlp installed successfully', {
        path: this.ytDlpPath,
        version
      });
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to install yt-dlp', error as Error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Download file from URL
   */
  private downloadFile(url: string, destination: string, redirectCount = 0): Promise<void> {
    return new Promise((resolve, reject) => {
      if (redirectCount > 5) {
        reject(new Error('Too many redirects while downloading yt-dlp'));
        return;
      }

      let downloadedBytes = 0;
      let totalBytes = 0;

      const request = https.get(url, (response) => {
        // Handle redirects
        if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400) {
          const redirectUrl = response.headers.location;
          response.resume();

          if (redirectUrl) {
            const resolvedUrl = new URL(redirectUrl, url).toString();
            this.downloadFile(resolvedUrl, destination, redirectCount + 1).then(resolve).catch(reject);
            return;
          }

          reject(new Error('Download redirect did not include a destination'));
          return;
        }

        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
          return;
        }

        totalBytes = parseInt(response.headers['content-length'] || '0', 10);
        const file = fs.createWriteStream(destination);
        let settled = false;

        const fail = (error: Error) => {
          if (settled) return;
          settled = true;
          file.destroy();
          this.removeFileIfPresent(destination);
          reject(error);
        };

        response.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          const progress = totalBytes > 0 ? (downloadedBytes / totalBytes * 100).toFixed(1) : '0';
          this.logger.info('Download progress', { progress: `${progress}%` });
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close((error) => {
            if (error) {
              fail(error);
              return;
            }

            if (!settled) {
              settled = true;
              resolve();
            }
          });
        });

        response.on('error', fail);
        file.on('error', fail);
      });

      request.on('error', reject);
    });
  }

  /**
   * Download and validate a replacement before touching the working binary.
   * The previous executable is restored if the final rename fails.
   */
  private async downloadAndReplace(): Promise<string> {
    const uniqueSuffix = `${process.pid}-${Date.now()}`;
    const temporaryPath = `${this.ytDlpPath}.${uniqueSuffix}.download`;
    const backupPath = `${this.ytDlpPath}.${uniqueSuffix}.backup`;
    let backupCreated = false;

    try {
      await this.downloadFile(this.downloadUrl, temporaryPath);

      if (os.platform() !== 'win32') {
        fs.chmodSync(temporaryPath, 0o755);
      }

      const version = await this.verifyExecutable(temporaryPath);

      if (fs.existsSync(this.ytDlpPath)) {
        fs.renameSync(this.ytDlpPath, backupPath);
        backupCreated = true;
      }

      try {
        fs.renameSync(temporaryPath, this.ytDlpPath);
      } catch (replaceError) {
        if (backupCreated && fs.existsSync(backupPath)) {
          try {
            fs.renameSync(backupPath, this.ytDlpPath);
            backupCreated = false;
          } catch (rollbackError) {
            throw new Error(
              `Failed to replace yt-dlp (${this.errorMessage(replaceError)}) and restore the previous version: ${this.errorMessage(rollbackError)}`
            );
          }
        }

        throw replaceError;
      }

      if (backupCreated) {
        try {
          fs.unlinkSync(backupPath);
          backupCreated = false;
        } catch (cleanupError) {
          // A leftover backup is harmless and can help manual recovery.
          this.logger.error('Failed to remove old yt-dlp backup', cleanupError as Error, {
            path: backupPath
          });
        }
      }

      return version;
    } finally {
      this.removeFileIfPresent(temporaryPath);
    }
  }

  private verifyExecutable(executablePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(executablePath, ['--version']);
      let version = '';
      let errorOutput = '';
      let settled = false;

      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);

        if (error) {
          reject(error);
        } else {
          resolve(version.trim());
        }
      };

      child.stdout.on('data', (data) => {
        version += data.toString();
      });

      child.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      child.on('error', (error) => {
        finish(new Error(`Downloaded yt-dlp could not start: ${error.message}`));
      });

      child.on('close', (code) => {
        if (code !== 0 || !version.trim()) {
          finish(new Error(
            `Downloaded yt-dlp failed verification${errorOutput.trim() ? `: ${errorOutput.trim()}` : ''}`
          ));
          return;
        }

        finish();
      });

      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        finish(new Error('Downloaded yt-dlp verification timed out'));
      }, 10000);
    });
  }

  private removeFileIfPresent(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      this.logger.error('Failed to clean up temporary yt-dlp file', error as Error, {
        path: filePath
      });
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  /**
   * Update yt-dlp to latest version
   */
  async update(): Promise<{ success: boolean; error?: string }> {
    try {
      this.logger.info('Updating yt-dlp...', { url: this.downloadUrl });
      const version = await this.downloadAndReplace();
      this.logger.info('yt-dlp updated successfully', {
        path: this.ytDlpPath,
        version
      });
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to update yt-dlp', error as Error);
      return { success: false, error: errorMessage };
    }
  }
}
