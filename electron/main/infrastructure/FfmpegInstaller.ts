/**
 * FfmpegInstaller
 * Automatically downloads and installs ffmpeg if not present
 */

import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import * as os from 'os';
import { app } from 'electron';
import { FileLogger } from './Logger';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class FfmpegInstaller {
  private logger: FileLogger;
  private ffmpegPath: string;
  private ffprobePath: string;
  private binDir: string;

  constructor(logger: FileLogger) {
    this.logger = logger;

    const appDataPath = app.getPath('userData');
    this.binDir = path.join(appDataPath, 'bin');

    const platform = os.platform();
    if (platform === 'win32') {
      this.ffmpegPath = path.join(this.binDir, 'ffmpeg.exe');
      this.ffprobePath = path.join(this.binDir, 'ffprobe.exe');
    } else {
      this.ffmpegPath = path.join(this.binDir, 'ffmpeg');
      this.ffprobePath = path.join(this.binDir, 'ffprobe');
    }

    // Ensure bin directory exists
    if (!fs.existsSync(this.binDir)) {
      fs.mkdirSync(this.binDir, { recursive: true });
    }
  }

  /**
   * Check if ffmpeg is installed
   */
  isInstalled(): boolean {
    return fs.existsSync(this.ffmpegPath) && fs.existsSync(this.ffprobePath);
  }

  /**
   * Get ffmpeg directory path (for --ffmpeg-location)
   */
  getBinDirectory(): string {
    return this.binDir;
  }

  /**
   * Download and install ffmpeg
   */
  async install(): Promise<{ success: boolean; error?: string }> {
    try {
      const platform = os.platform();
      
      if (platform === 'win32') {
        return await this.installWindows();
      } else if (platform === 'darwin') {
        return await this.installMacOS();
      } else {
        return await this.installLinux();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to install ffmpeg', error as Error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Install ffmpeg on Windows
   */
  private async installWindows(): Promise<{ success: boolean; error?: string }> {
    try {
      this.logger.info('Downloading ffmpeg for Windows...');

      // Download ffmpeg essentials build from gyan.dev
      const downloadUrl = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip';
      const zipPath = path.join(this.binDir, 'ffmpeg.zip');

      await this.downloadFile(downloadUrl, zipPath);

      this.logger.info('Extracting ffmpeg...');

      // Extract using PowerShell
      const extractCommand = `Expand-Archive -Path "${zipPath}" -DestinationPath "${this.binDir}" -Force`;
      await execAsync(extractCommand, { shell: 'powershell.exe' });

      // Find extracted ffmpeg directory
      const extractedDirs = fs.readdirSync(this.binDir).filter(name => name.startsWith('ffmpeg-'));
      if (extractedDirs.length === 0) {
        throw new Error('Failed to find extracted ffmpeg directory');
      }

      const extractedDir = path.join(this.binDir, extractedDirs[0], 'bin');

      // Copy ffmpeg.exe and ffprobe.exe to bin directory
      fs.copyFileSync(path.join(extractedDir, 'ffmpeg.exe'), this.ffmpegPath);
      fs.copyFileSync(path.join(extractedDir, 'ffprobe.exe'), this.ffprobePath);

      // Cleanup
      fs.unlinkSync(zipPath);
      fs.rmSync(path.join(this.binDir, extractedDirs[0]), { recursive: true, force: true });

      this.logger.info('ffmpeg installed successfully', { path: this.binDir });
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to install ffmpeg on Windows', error as Error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Install ffmpeg on macOS
   */
  private async installMacOS(): Promise<{ success: boolean; error?: string }> {
    try {
      this.logger.info('Downloading ffmpeg for macOS...');

      // Download static builds from evermeet.cx
      const ffmpegUrl = 'https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip';
      const ffprobeUrl = 'https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip';

      const ffmpegZip = path.join(this.binDir, 'ffmpeg.zip');
      const ffprobeZip = path.join(this.binDir, 'ffprobe.zip');

      await this.downloadFile(ffmpegUrl, ffmpegZip);
      await this.downloadFile(ffprobeUrl, ffprobeZip);

      // Extract
      await execAsync(`unzip -o "${ffmpegZip}" -d "${this.binDir}"`);
      await execAsync(`unzip -o "${ffprobeZip}" -d "${this.binDir}"`);

      // Make executable
      fs.chmodSync(this.ffmpegPath, 0o755);
      fs.chmodSync(this.ffprobePath, 0o755);

      // Cleanup
      fs.unlinkSync(ffmpegZip);
      fs.unlinkSync(ffprobeZip);

      this.logger.info('ffmpeg installed successfully', { path: this.binDir });
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to install ffmpeg on macOS', error as Error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Install ffmpeg on Linux
   */
  private async installLinux(): Promise<{ success: boolean; error?: string }> {
    try {
      this.logger.info('Downloading ffmpeg for Linux...');

      // Download static builds from johnvansickle.com
      const downloadUrl = 'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz';
      const tarPath = path.join(this.binDir, 'ffmpeg.tar.xz');

      await this.downloadFile(downloadUrl, tarPath);

      this.logger.info('Extracting ffmpeg...');

      // Extract
      await execAsync(`tar -xJf "${tarPath}" -C "${this.binDir}"`);

      // Find extracted directory
      const extractedDirs = fs.readdirSync(this.binDir).filter(name => name.startsWith('ffmpeg-'));
      if (extractedDirs.length === 0) {
        throw new Error('Failed to find extracted ffmpeg directory');
      }

      const extractedDir = path.join(this.binDir, extractedDirs[0]);

      // Copy binaries
      fs.copyFileSync(path.join(extractedDir, 'ffmpeg'), this.ffmpegPath);
      fs.copyFileSync(path.join(extractedDir, 'ffprobe'), this.ffprobePath);

      // Make executable
      fs.chmodSync(this.ffmpegPath, 0o755);
      fs.chmodSync(this.ffprobePath, 0o755);

      // Cleanup
      fs.unlinkSync(tarPath);
      fs.rmSync(extractedDir, { recursive: true, force: true });

      this.logger.info('ffmpeg installed successfully', { path: this.binDir });
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to install ffmpeg on Linux', error as Error);
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
          this.logger.info('Download progress', { file: path.basename(destination), progress: `${progress}%` });
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
}
