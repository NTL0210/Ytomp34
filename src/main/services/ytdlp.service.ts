import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import { existsSync } from 'fs';
import { app } from 'electron';
import { logger } from './logger.service';
import type { VideoMetadata, VideoFormat } from '../../shared/types';

/**
 * YtDlp Service
 * Handles video metadata fetching and downloading using yt-dlp binary
 * Requirements: REQ-FUN-003.1, REQ-FUN-003.2, REQ-FUN-003.6, 
 *               REQ-FUN-015.2, REQ-NFR-004.2
 */

interface DownloadProgress {
  percentage: number;
  downloadedBytes: number;
  totalBytes: number;
  speed: number;
  eta: number;
}

class YtDlpService {
  private binaryPath: string = '';
  private currentProcess: ChildProcess | null = null;

  /**
   * Get yt-dlp binary path
   * Development: resources/bin/yt-dlp.exe
   * Production: resources/bin/yt-dlp.exe (packaged with app)
   */
  private getBinaryPath(): string {
    if (this.binaryPath) {
      return this.binaryPath;
    }

    // Check if running in development or production
    const isDev = !app.isPackaged;

    if (isDev) {
      // Development: binary in resources/bin/
      this.binaryPath = join(process.cwd(), 'resources', 'bin', 'yt-dlp.exe');
    } else {
      // Production: binary packaged with app
      this.binaryPath = join(process.resourcesPath, 'bin', 'yt-dlp.exe');
    }

    logger.info('YtDlp', 'Binary path resolved', {
      path: this.binaryPath,
      isDev,
      exists: existsSync(this.binaryPath),
    });

    return this.binaryPath;
  }

  /**
   * Verify yt-dlp binary exists
   */
  public async verifyBinary(): Promise<boolean> {
    const binaryPath = this.getBinaryPath();
    const exists = existsSync(binaryPath);

    if (!exists) {
      logger.error('YtDlp', 'Binary not found', { path: binaryPath });
    }

    return exists;
  }

  /**
   * Fetch video metadata using --dump-json flag
   * Returns title, thumbnail, duration, and available formats
   */
  public async fetchMetadata(url: string): Promise<VideoMetadata> {
    logger.info('YtDlp', 'Fetching metadata', { url });

    const binaryPath = this.getBinaryPath();

    if (!existsSync(binaryPath)) {
      throw new Error('yt-dlp binary not found. Please download it to resources/bin/');
    }

    return new Promise((resolve, reject) => {
      // Use --dump-json to get metadata as JSON
      // --no-playlist to avoid fetching playlist info
      const args = [
        '--dump-json',
        '--no-playlist',
        '--no-warnings',
        url,
      ];

      logger.debug('YtDlp', 'Spawning process', { binaryPath, args });

      // Spawn process WITHOUT shell (security requirement)
      const process = spawn(binaryPath, args, {
        shell: false,
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code !== 0) {
          logger.error('YtDlp', 'Metadata fetch failed', {
            url,
            code,
            stderr,
          });
          reject(new Error(`Failed to fetch metadata: ${stderr || 'Unknown error'}`));
          return;
        }

        try {
          // Parse JSON output
          const metadata = JSON.parse(stdout);

          // Extract relevant information
          const result: VideoMetadata = {
            title: metadata.title || 'Unknown Title',
            thumbnail: metadata.thumbnail || '',
            duration: metadata.duration || 0,
            formats: this.parseFormats(metadata.formats || []),
          };

          logger.info('YtDlp', 'Metadata fetched successfully', {
            url,
            title: result.title,
            formatCount: result.formats.length,
          });

          resolve(result);
        } catch (error) {
          logger.error('YtDlp', 'Failed to parse metadata JSON', {
            error,
            stdout: stdout.substring(0, 500),
          });
          reject(new Error('Failed to parse metadata'));
        }
      });

      process.on('error', (error) => {
        logger.error('YtDlp', 'Process error', { error });
        reject(error);
      });
    });
  }

  /**
   * Parse formats from yt-dlp JSON output
   */
  private parseFormats(formats: any[]): VideoFormat[] {
    const parsed: VideoFormat[] = [];

    for (const format of formats) {
      // Only include formats with both video and audio, or audio-only
      if (format.vcodec === 'none' && format.acodec === 'none') {
        continue; // Skip formats with no video and no audio
      }

      parsed.push({
        formatId: format.format_id || '',
        ext: format.ext || 'mp4',
        resolution: format.resolution || `${format.width}x${format.height}` || 'audio only',
        filesize: format.filesize || format.filesize_approx || 0,
        vcodec: format.vcodec || 'none',
        acodec: format.acodec || 'none',
        fps: format.fps || 0,
      });
    }

    // Sort by quality (resolution)
    parsed.sort((a, b) => {
      const aHeight = parseInt(a.resolution.split('x')[1]) || 0;
      const bHeight = parseInt(b.resolution.split('x')[1]) || 0;
      return bHeight - aHeight; // Descending order
    });

    return parsed;
  }

  /**
   * Download video with progress tracking
   * Returns a promise that resolves when download completes
   */
  public async download(
    url: string,
    outputPath: string,
    formatId: string,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<void> {
    logger.info('YtDlp', 'Starting download', { url, outputPath, formatId });

    const binaryPath = this.getBinaryPath();

    if (!existsSync(binaryPath)) {
      throw new Error('yt-dlp binary not found');
    }

    return new Promise((resolve, reject) => {
      const args = [
        '-f', formatId,
        '-o', outputPath,
        '--no-playlist',
        '--newline', // Output progress on new lines for easier parsing
        url,
      ];

      logger.debug('YtDlp', 'Spawning download process', { binaryPath, args });

      // Spawn WITHOUT shell (security requirement)
      this.currentProcess = spawn(binaryPath, args, {
        shell: false,
        windowsHide: true,
      });

      let stderr = '';

      this.currentProcess.stdout.on('data', (data) => {
        const output = data.toString();
        
        // Parse progress from stdout
        if (onProgress) {
          const progress = this.parseProgress(output);
          if (progress) {
            onProgress(progress);
          }
        }
      });

      this.currentProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      this.currentProcess.on('close', (code) => {
        this.currentProcess = null;

        if (code !== 0) {
          logger.error('YtDlp', 'Download failed', {
            url,
            code,
            stderr,
          });
          reject(new Error(`Download failed: ${stderr || 'Unknown error'}`));
          return;
        }

        logger.info('YtDlp', 'Download completed', { url, outputPath });
        resolve();
      });

      this.currentProcess.on('error', (error) => {
        this.currentProcess = null;
        logger.error('YtDlp', 'Process error during download', { error });
        reject(error);
      });
    });
  }

  /**
   * Parse download progress from yt-dlp output
   * Example: [download]  45.2% of 10.50MiB at 1.23MiB/s ETA 00:05
   */
  private parseProgress(output: string): DownloadProgress | null {
    // Regex to match yt-dlp progress output
    const progressRegex = /\[download\]\s+(\d+\.?\d*)%\s+of\s+~?(\d+\.?\d*)(.*?)\s+at\s+(\d+\.?\d*)(.*?)\s+ETA\s+(\d+):(\d+)/;
    const match = output.match(progressRegex);

    if (!match) {
      return null;
    }

    const percentage = parseFloat(match[1]);
    const totalSize = parseFloat(match[2]);
    const totalUnit = match[3].trim();
    const speed = parseFloat(match[4]);
    const speedUnit = match[5].trim();
    const etaMinutes = parseInt(match[6]);
    const etaSeconds = parseInt(match[7]);

    // Convert to bytes
    const totalBytes = this.convertToBytes(totalSize, totalUnit);
    const speedBytes = this.convertToBytes(speed, speedUnit);
    const downloadedBytes = Math.floor((percentage / 100) * totalBytes);
    const eta = etaMinutes * 60 + etaSeconds;

    return {
      percentage,
      downloadedBytes,
      totalBytes,
      speed: speedBytes,
      eta,
    };
  }

  /**
   * Convert size with unit to bytes
   */
  private convertToBytes(value: number, unit: string): number {
    const units: { [key: string]: number } = {
      'B': 1,
      'KiB': 1024,
      'MiB': 1024 * 1024,
      'GiB': 1024 * 1024 * 1024,
      'KB': 1000,
      'MB': 1000 * 1000,
      'GB': 1000 * 1000 * 1000,
    };

    return value * (units[unit] || 1);
  }

  /**
   * Cancel current download
   */
  public async cancelDownload(): Promise<void> {
    if (this.currentProcess) {
      logger.info('YtDlp', 'Cancelling download');
      this.currentProcess.kill('SIGTERM');
      this.currentProcess = null;
    }
  }

  /**
   * Check if download is in progress
   */
  public isDownloading(): boolean {
    return this.currentProcess !== null;
  }
}

// Export singleton instance
export const ytdlpService = new YtDlpService();
