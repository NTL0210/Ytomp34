/**
 * YtDlpInstaller
 * Automatically downloads and installs yt-dlp if not present
 */

import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import * as os from 'os';
import { app } from 'electron';
import { FileLogger } from './Logger';

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

      await this.downloadFile(this.downloadUrl, this.ytDlpPath);

      // Make executable on Unix-like systems
      if (os.platform() !== 'win32') {
        fs.chmodSync(this.ytDlpPath, 0o755);
      }

      this.logger.info('yt-dlp installed successfully', { path: this.ytDlpPath });
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
  private downloadFile(url: string, destination: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(destination);
      let downloadedBytes = 0;
      let totalBytes = 0;

      const request = https.get(url, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            file.close();
            fs.unlinkSync(destination);
            this.downloadFile(redirectUrl, destination).then(resolve).catch(reject);
            return;
          }
        }

        if (response.statusCode !== 200) {
          file.close();
          fs.unlinkSync(destination);
          reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
          return;
        }

        totalBytes = parseInt(response.headers['content-length'] || '0', 10);

        response.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          const progress = totalBytes > 0 ? (downloadedBytes / totalBytes * 100).toFixed(1) : '0';
          this.logger.info('Download progress', { progress: `${progress}%` });
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          resolve();
        });
      });

      request.on('error', (error) => {
        file.close();
        fs.unlinkSync(destination);
        reject(error);
      });

      file.on('error', (error) => {
        file.close();
        fs.unlinkSync(destination);
        reject(error);
      });
    });
  }

  /**
   * Update yt-dlp to latest version
   */
  async update(): Promise<{ success: boolean; error?: string }> {
    try {
      // Remove old version
      if (fs.existsSync(this.ytDlpPath)) {
        fs.unlinkSync(this.ytDlpPath);
      }

      // Download new version
      return await this.install();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to update yt-dlp', error as Error);
      return { success: false, error: errorMessage };
    }
  }
}
