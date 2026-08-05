import { spawn, ChildProcess } from 'child_process';
import { app } from 'electron';
import { PlaylistInfo, Video } from '../domain/entities';
import { Format, Quality } from '../domain/value-objects';
import { ProgressData, ProgressParserImpl } from './ProgressParser';

export interface YtDlpFormat {
  format_id?: string;
  ext?: string;
  vcodec?: string;
  acodec?: string;
  height?: number;
  tbr?: number;
  abr?: number;
  format_note?: string;
}

interface YtDlpMetadata {
  id?: string;
  display_id?: string;
  webpage_url?: string;
  title?: string;
  duration?: number;
  thumbnail?: string;
  formats?: YtDlpFormat[];
}

interface YtDlpPlaylistEntryMetadata {
  id?: string;
  url?: string;
  webpage_url?: string;
  original_url?: string;
  title?: string;
  duration?: number;
  thumbnail?: string;
  extractor?: string;
  extractor_key?: string;
  ie_key?: string;
}

interface YtDlpPlaylistMetadata {
  id?: string;
  title?: string;
  playlist_count?: number;
  n_entries?: number;
  entries?: Array<YtDlpPlaylistEntryMetadata | null>;
}

export const MAX_PLAYLIST_ITEMS = 100;

const BEST_AUDIO_SELECTOR = 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio';

export function buildJavaScriptRuntimeArgs(runtimePath: string | null): string[] {
  if (!runtimePath) return [];

  return [
    '--js-runtimes',
    `deno:${runtimePath}`,
    '--remote-components',
    'ejs:github'
  ];
}

export function extractAvailableFormats(formats: YtDlpFormat[]): Format[] {
  const videoHeights = new Set<number>();
  const audioFormats: YtDlpFormat[] = [];

  for (const format of formats) {
    if (format.vcodec && format.vcodec !== 'none' && format.height) {
      videoHeights.add(format.height);
    }

    if (
      format.acodec &&
      format.acodec !== 'none' &&
      (!format.vcodec || format.vcodec === 'none')
    ) {
      audioFormats.push(format);
    }
  }

  const result: Format[] = [];
  const sortedHeights = Array.from(videoHeights).sort((a, b) => b - a);

  if (sortedHeights.length > 0) {
    const qualities: Quality[] = [
      { label: 'Best Quality', value: 'best', resolution: 'best' },
      ...sortedHeights.map(height => ({
        label: `${height}p`,
        value: `${height}p`,
        resolution: `${height}p`
      }))
    ];
    result.push({ type: 'mp4', qualities });
  }

  const audioQualities: Quality[] = audioFormats
    .filter(format => Boolean(format.abr))
    .sort((a, b) => (b.abr || 0) - (a.abr || 0))
    .slice(0, 5)
    .map(format => ({
      label: `${Math.round(format.abr ?? 0)}kbps`,
      value: format.format_id ?? 'best',
      bitrate: format.abr
    }));

  if (audioQualities.length > 0) {
    result.push({
      type: 'mp3',
      qualities: [
        { label: 'Best Quality', value: 'best' },
        ...audioQualities
      ]
    });
  }

  return result;
}

/**
 * Build a conservative audio selector from a format id returned by yt-dlp.
 * Falling back to bestaudio keeps downloads working when a saved format id is
 * no longer available by the time the download starts.
 */
export function buildAudioFormatSelector(quality: string): string {
  const selectedFormatId = quality.trim();

  if (!selectedFormatId || selectedFormatId === 'best') {
    return BEST_AUDIO_SELECTOR;
  }

  // yt-dlp format ids are simple identifiers. Do not allow renderer input to
  // inject arbitrary format-selector expressions.
  if (!/^[A-Za-z0-9._-]+$/.test(selectedFormatId)) {
    return BEST_AUDIO_SELECTOR;
  }

  return `${selectedFormatId}/${BEST_AUDIO_SELECTOR}`;
}

/** Keep app behavior independent from user-level yt-dlp configuration. */
export function buildNetworkIsolationArgs(forceIpv4 = false): string[] {
  return forceIpv4
    ? ['--ignore-config', '--force-ipv4']
    : ['--ignore-config'];
}

/** Identify DNS failures that are worth retrying over IPv4. */
export function isDnsResolutionError(error: Error | string): boolean {
  const message = typeof error === 'string' ? error : error.message;
  return /could not resolve host|temporary failure in name resolution|getaddrinfo failed|name or service not known|enotfound/i.test(message);
}

function getPlaylistEntryUrl(entry: YtDlpPlaylistEntryMetadata): string | null {
  const candidates = [entry.webpage_url, entry.original_url, entry.url];

  for (const candidate of candidates) {
    if (!candidate) continue;

    try {
      const parsed = new URL(candidate);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return candidate;
      }
    } catch {
      // Flat YouTube entries can contain only a video id; handle below.
    }
  }

  const extractor = `${entry.extractor || ''} ${entry.extractor_key || ''} ${entry.ie_key || ''}`;
  if (entry.id && /youtube/i.test(extractor)) {
    return `https://www.youtube.com/watch?v=${encodeURIComponent(entry.id)}`;
  }

  return null;
}

export function parsePlaylistMetadata(
  rawMetadata: unknown,
  sourceUrl: string,
  limit = MAX_PLAYLIST_ITEMS
): PlaylistInfo {
  if (typeof rawMetadata !== 'object' || rawMetadata === null) {
    throw new Error('yt-dlp returned invalid playlist metadata');
  }

  const metadata = rawMetadata as YtDlpPlaylistMetadata;
  if (!Array.isArray(metadata.entries)) {
    throw new Error('The URL does not contain a playlist');
  }

  const parsedEntries = metadata.entries.flatMap(entry => {
    if (!entry) return [];
    const url = getPlaylistEntryUrl(entry);
    if (!url) return [];

    return [{
      id: entry.id || url,
      url,
      title: entry.title || 'Untitled video',
      duration: typeof entry.duration === 'number' ? entry.duration : 0,
      thumbnailUrl: entry.thumbnail || ''
    }];
  });
  const seenUrls = new Set<string>();
  const uniqueEntries = parsedEntries.filter(entry => {
    if (seenUrls.has(entry.url)) return false;
    seenUrls.add(entry.url);
    return true;
  });
  const safeLimit = Math.max(1, Math.min(Math.floor(limit), MAX_PLAYLIST_ITEMS));
  const entries = uniqueEntries.slice(0, safeLimit);
  const reportedTotal = metadata.playlist_count || metadata.n_entries || metadata.entries.length;
  const totalEntries = Math.max(reportedTotal, uniqueEntries.length);

  if (entries.length === 0) {
    throw new Error('The playlist does not contain any downloadable videos');
  }

  return {
    id: metadata.id || sourceUrl,
    title: metadata.title || 'Untitled playlist',
    entries,
    totalEntries,
    truncated: totalEntries > entries.length || uniqueEntries.length > entries.length
  };
}

/**
 * YtDlpExecutor interface
 * Provides interaction with yt-dlp command-line tool
 */
export interface YtDlpExecutor {
  /**
   * Check if yt-dlp is installed and accessible
   */
  checkInstallation(): Promise<{ installed: boolean; version?: string }>;
  
  /**
   * Fetch video metadata using --dump-json
   */
  fetchMetadata(url: string): Promise<Video>;

  /**
   * Fetch a flat playlist preview without downloading media.
   */
  fetchPlaylist(url: string): Promise<PlaylistInfo>;
  
  /**
   * Start download process
   * Returns process ID for control operations
   */
  startDownload(
    url: string,
    format: string,
    quality: string,
    outputPath: string,
    onProgress: (progress: ProgressData) => void,
    onError: (error: string) => void,
    onComplete: () => void
  ): Promise<number>;
  
  /**
   * Pause download process (SIGSTOP)
   */
  pauseProcess(pid: number): Promise<void>;
  
  /**
   * Resume download process (SIGCONT)
   */
  resumeProcess(pid: number): Promise<void>;
  
  /**
   * Cancel download process (SIGTERM then SIGKILL)
   */
  cancelProcess(pid: number): Promise<void>;
}

/**
 * YtDlpExecutor implementation
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.6, 5.1-5.7, 8.1, 8.3, 9.1, 9.2, 22.1, 22.2
 */
export class YtDlpExecutorImpl implements YtDlpExecutor {
  private processes: Map<number, ChildProcess> = new Map();
  private forceIpv4Hosts = new Set<string>();
  private ytDlpCommand: string = 'yt-dlp'; // Default to system yt-dlp
  private ffmpegLocation: string | null = null; // ffmpeg directory path
  private javaScriptRuntimePath: string | null = null;

  private debug(...args: unknown[]): void {
    if (!app.isPackaged) {
      console.log(...args);
    }
  }

  /**
   * Set custom yt-dlp executable path
   */
  setExecutablePath(path: string): void {
    this.ytDlpCommand = path;
  }

  /**
   * Set ffmpeg location directory
   */
  setFfmpegLocation(path: string): void {
    this.ffmpegLocation = path;
  }

  setJavaScriptRuntimePath(path: string): void {
    this.javaScriptRuntimePath = path;
  }

  async checkInstallation(): Promise<{ installed: boolean; version?: string }> {
    return new Promise((resolve) => {
      this.debug('Checking yt-dlp installation:', this.ytDlpCommand);
      
      const process = spawn(this.ytDlpCommand, ['--version']);
      
      let version = '';
      let errorOutput = '';
      
      process.stdout.on('data', (data) => {
        version += data.toString();
      });
      
      process.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });
      
      process.on('close', (code) => {
        this.debug('yt-dlp version check completed:', { code, version: version.trim(), error: errorOutput });
        
        if (code === 0 && version.trim()) {
          resolve({ installed: true, version: version.trim() });
        } else {
          this.debug('yt-dlp not working:', { code, error: errorOutput });
          resolve({ installed: false });
        }
      });
      
      process.on('error', (error) => {
        this.debug('yt-dlp process error:', error.message);
        resolve({ installed: false });
      });
      
      // Timeout for version check (5 seconds)
      setTimeout(() => {
        this.debug('yt-dlp version check timeout');
        process.kill('SIGKILL');
        resolve({ installed: false });
      }, 5000);
    });
  }

  /**
   * Fetch video metadata with retry logic and anti-bot measures
   */
  async fetchMetadata(url: string): Promise<Video> {
    const maxRetries = 3;
    let lastError: Error | null = null;
    let forceIpv4 = this.shouldForceIpv4(url);
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.debug(`Metadata fetch attempt ${attempt}/${maxRetries} for:`, url);
        
        const video = await this.fetchMetadataAttempt(url, attempt, forceIpv4);
        if (forceIpv4) {
          this.rememberIpv4Host(url);
        }
        this.debug(`Metadata fetch successful on attempt ${attempt}`);
        return video;
      } catch (error) {
        lastError = error as Error;
        this.debug(`Metadata fetch attempt ${attempt} failed:`, lastError.message);

        if (isDnsResolutionError(lastError)) {
          forceIpv4 = true;
        }
        
        // If it's a bot detection error, wait longer between retries
        if (lastError.message.includes('not a bot') || lastError.message.includes('Sign in')) {
          if (attempt < maxRetries) {
            const waitTime = attempt * 5000; // 5s, 10s, 15s
            this.debug(`Bot detection detected, waiting ${waitTime}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        } else if (attempt < maxRetries) {
          // For other errors, shorter wait
          const waitTime = attempt * 2000; // 2s, 4s
          this.debug(`Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }
    
    // All retries failed
    throw lastError || new Error('All metadata fetch attempts failed');
  }

  /**
   * Single attempt to fetch metadata
   */
  private async fetchMetadataAttempt(url: string, attempt: number, forceIpv4: boolean): Promise<Video> {
    return new Promise((resolve, reject) => {
      this.debug('Starting yt-dlp metadata fetch for:', url);
      this.debug('yt-dlp command:', this.ytDlpCommand);
      this.debug('ffmpeg location:', this.ffmpegLocation);
      
      // Build command arguments with anti-bot measures
      const args = [
        ...buildNetworkIsolationArgs(forceIpv4),
        ...buildJavaScriptRuntimeArgs(this.javaScriptRuntimePath),
        '--dump-json'
      ];
      
      // Different strategies for different attempts
      if (attempt === 1) {
        // First attempt: Standard approach with anti-bot headers
        args.push('--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        args.push('--add-header', 'Accept-Language:en-US,en;q=0.9');
        args.push('--add-header', 'Accept-Encoding:gzip, deflate, br');
        args.push('--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8');
      } else if (attempt === 2) {
        // Second attempt: Different user agent + try to use embedded player
        args.push('--user-agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.1 Safari/605.1.15');
        args.push('--extractor-args', 'youtube:player_client=web,mweb');  // Try mobile web client
      } else {
        // Third attempt: Use alternative extraction method
        args.push('--user-agent', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        args.push('--extractor-args', 'youtube:player_client=android,web');  // Try Android client
      }
      
      // Add ffmpeg location if available
      if (this.ffmpegLocation) {
        args.push('--ffmpeg-location', this.ffmpegLocation);
      }
      
      // Add other options for better reliability and bot avoidance
      args.push('--no-warnings');
      args.push('--ignore-errors');
      args.push('--socket-timeout', '30');
      args.push('--sleep-interval', attempt.toString());  // Increase sleep with attempts
      args.push('--max-sleep-interval', (attempt * 3).toString());  // Max sleep increases
      args.push('--extractor-retries', '2');
      args.push('--fragment-retries', '2');
      args.push('--skip-unavailable-fragments');
      args.push(url);
      
      this.debug(`Full command (attempt ${attempt}):`, this.ytDlpCommand, args.join(' '));
      
      const process = spawn(this.ytDlpCommand, args);
      
      let jsonOutput = '';
      let errorOutput = '';
      
      process.stdout.on('data', (data) => {
        const chunk = data.toString();
        this.debug('yt-dlp stdout chunk:', chunk.substring(0, 200) + (chunk.length > 200 ? '...' : ''));
        jsonOutput += chunk;
      });
      
      process.stderr.on('data', (data) => {
        const line = data.toString();
        this.debug('yt-dlp stderr:', line);
        errorOutput += line;
      });
      
      process.on('close', (code) => {
        this.debug('yt-dlp process closed with code:', code);
        this.debug('stdout length:', jsonOutput.length);
        this.debug('stderr length:', errorOutput.length);
        
        if (code === 0 && jsonOutput.trim()) {
          try {
            // Try to parse JSON - sometimes there might be multiple JSON objects
            const lines = jsonOutput.trim().split('\n');
            let videoData: YtDlpMetadata | null = null;
            
            for (const line of lines) {
              if (line.trim().startsWith('{')) {
                try {
                  const parsed: unknown = JSON.parse(line.trim());
                  if (typeof parsed === 'object' && parsed !== null) {
                    videoData = parsed as YtDlpMetadata;
                    break;
                  }
                } catch (e) {
                  this.debug('Failed to parse line as JSON:', line.substring(0, 100));
                  continue;
                }
              }
            }
            
            if (!videoData) {
              // Try parsing the entire output
              const parsed: unknown = JSON.parse(jsonOutput.trim());
              if (typeof parsed === 'object' && parsed !== null) {
                videoData = parsed as YtDlpMetadata;
              }
            }

            if (!videoData) {
              throw new Error('yt-dlp returned invalid metadata');
            }
            
            // Extract video metadata
            const video: Video = {
              id: videoData.id || videoData.display_id || 'unknown',
              url: videoData.webpage_url || url,
              title: videoData.title || 'Unknown Title',
              duration: videoData.duration || 0,
              thumbnailUrl: videoData.thumbnail || '',
              availableFormats: this.extractFormats(videoData.formats || [])
            };
            
            this.debug('Metadata extracted successfully:', {
              title: video.title,
              duration: video.duration,
              formatCount: video.availableFormats.length
            });
            resolve(video);
          } catch (error) {
            console.error('JSON parse error:', error);
            console.error('Raw output:', jsonOutput.substring(0, 500));
            reject(new Error(`Failed to parse video metadata: ${error instanceof Error ? error.message : 'Unknown error'}`));
          }
        } else {
          console.error('yt-dlp failed with code:', code);
          console.error('Error output:', errorOutput);
          
          // Provide more specific error messages for bot detection
          let errorMessage = 'Failed to fetch video information';
          
          if (isDnsResolutionError(errorOutput)) {
            const detail = errorOutput.split('\n')
              .find(line => isDnsResolutionError(line))
              ?.replace('ERROR:', '')
              .trim();
            errorMessage = detail || 'DNS resolution failed while contacting the video website';
          } else if (errorOutput.includes('Sign in to confirm') || errorOutput.includes('not a bot')) {
            errorMessage = 'YouTube is asking to verify you are not a bot. This is a temporary issue. Please try again in a few minutes or try a different video.';
          } else if (errorOutput.includes('Video unavailable')) {
            errorMessage = 'Video is unavailable or private';
          } else if (errorOutput.includes('network')) {
            errorMessage = 'Network error - check your internet connection';
          } else if (errorOutput.includes('timeout')) {
            errorMessage = 'Request timed out - try again later';
          } else if (errorOutput.includes('Unsupported URL')) {
            errorMessage = 'Unsupported video URL or platform';
          } else if (errorOutput.includes('Private video')) {
            errorMessage = 'This video is private and cannot be accessed';
          } else if (errorOutput.includes('age-restricted')) {
            errorMessage = 'This video is age-restricted and cannot be downloaded';
          } else if (code !== 0) {
            errorMessage = `yt-dlp failed (code ${code}): ${errorOutput.split('\n').find(line => line.includes('ERROR:'))?.replace('ERROR:', '').trim() || 'Unknown error'}`;
          }
          
          reject(new Error(errorMessage));
        }
      });
      
      process.on('error', (error) => {
        console.error('yt-dlp process error:', error);
        
        if (error.message.includes('ENOENT')) {
          reject(new Error('yt-dlp not found - please check installation'));
        } else {
          reject(new Error(`Process error: ${error.message}`));
        }
      });
      
      // Timeout increases with attempts: 45s, 60s, 75s
      const timeout = 45000 + (attempt - 1) * 15000;
      setTimeout(() => {
        this.debug(`yt-dlp metadata fetch timeout (${timeout/1000}s) - killing process`);
        process.kill('SIGKILL');
        reject(new Error(`Metadata fetch timeout (${timeout/1000}s) - video may be too large or network is slow. YouTube may also be blocking requests temporarily.`));
      }, timeout);
    });
  }

  async startDownload(
    url: string,
    format: string,
    quality: string,
    outputPath: string,
    onProgress: (progress: ProgressData) => void,
    onError: (error: string) => void,
    onComplete: () => void
  ): Promise<number> {
    return new Promise((resolve) => {
      this.debug('Starting download:', { url, format, quality, outputPath });
      this.debug('yt-dlp command:', this.ytDlpCommand);
      this.debug('ffmpeg location:', this.ffmpegLocation);
      
      // Build yt-dlp command arguments
      const args = buildNetworkIsolationArgs(this.shouldForceIpv4(url));
      args.push(...buildJavaScriptRuntimeArgs(this.javaScriptRuntimePath));

      // Format selection based on type
      if (format === 'mp3') {
        // Download the audio format selected in the UI, with a safe fallback
        // in case that exact format disappears before the download starts.
        args.push('-f', buildAudioFormatSelector(quality));
        args.push('--extract-audio');
        args.push('--audio-format', 'mp3');
        args.push('--audio-quality', '0'); // Best quality
        
        // Add ffmpeg location if available
        if (this.ffmpegLocation) {
          args.push('--ffmpeg-location', this.ffmpegLocation);
        }
      } else {
        // For MP4: Download video with audio
        // CRITICAL: Use proper format selector to get best video + best audio and merge
        // YouTube separates video and audio for high quality (>720p)
        
        if (quality && quality !== 'best') {
          // Download best video at specified height + best audio, then merge
          const heightLimit = quality.replace('p', '');
          
          // Format selector explanation:
          // bestvideo[height<=1080][ext=mp4] - Best MP4 video at or below specified height
          // bestvideo[height<=1080] - Fallback to any codec at specified height
          // bestaudio[ext=m4a] - Best M4A audio (compatible with MP4)
          // bestaudio - Fallback to any audio codec
          args.push('-f', `bestvideo[height<=${heightLimit}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${heightLimit}]+bestaudio/best[height<=${heightLimit}]`);
        } else {
          // Download best video + best audio and merge
          // This ensures we get the highest quality video and audio separately, then merge
          args.push('-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best');
        }
        
        // Merge video and audio into MP4 container
        args.push('--merge-output-format', 'mp4');
        
        // Add ffmpeg location for merging (REQUIRED for separate video+audio streams)
        if (this.ffmpegLocation) {
          args.push('--ffmpeg-location', this.ffmpegLocation);
        }
      }

      // Add progress and output options
      args.push('--newline');  // Force newline after each progress update
      args.push('--no-warnings');  // Reduce stderr noise
      args.push('--ignore-errors');  // Continue on non-fatal errors
      args.push('--socket-timeout', '30');  // 30 second socket timeout
      args.push('--retries', '3');  // Retry failed downloads
      args.push('--no-playlist');  // Every queue task represents exactly one media item
      args.push('-o', outputPath);
      args.push(url);
      
      this.debug('Full download command:', this.ytDlpCommand, args.join(' '));
      
      const process = spawn(this.ytDlpCommand, args);
      const pid = process.pid!;
      
      // Store process for control operations
      this.processes.set(pid, process);
      
      let errorOutput = '';
      let lastProgressTime = Date.now();
      const progressParser = new ProgressParserImpl();
      
      // Parse progress from stdout
      process.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        
        for (const line of lines) {
          if (line.trim()) {
            this.debug('yt-dlp stdout:', line);
            
            const progress = progressParser.parse(line);
            if (progress) {
              onProgress(progress);
              lastProgressTime = Date.now();
            }
            
            // Check for "Destination" line (download complete, starting post-process)
            if (line.includes('[download]') && line.includes('Destination:')) {
              this.debug('Download complete, post-processing...');
              onProgress({
                percentage: 100,
                speed: 'Complete',
                eta: '00:00'
              });
              lastProgressTime = Date.now();
            }
          }
        }
      });
      
      process.stderr.on('data', (data) => {
        const line = data.toString();
        this.debug('yt-dlp stderr:', line);
        errorOutput += line;
        
        // Check for specific error patterns
        if (line.includes('ERROR:') || line.includes('WARNING:')) {
          this.debug('yt-dlp error/warning:', line);
        }
      });
      
      process.on('close', (code) => {
        this.processes.delete(pid);
        this.debug('yt-dlp download process closed with code:', code);
        this.debug('Error output:', errorOutput);
        
        if (code === 0) {
          this.debug('Download completed successfully');
          onComplete();
        } else {
          console.error('Download failed with code:', code);
          
          // Provide more specific error messages
          let errorMessage = 'Download failed';
          
          if (errorOutput.includes('Video unavailable')) {
            errorMessage = 'Video is unavailable or has been removed';
          } else if (errorOutput.includes('network')) {
            errorMessage = 'Network error during download';
          } else if (errorOutput.includes('timeout')) {
            errorMessage = 'Download timed out';
          } else if (errorOutput.includes('ffmpeg')) {
            errorMessage = 'Audio/video processing failed - ffmpeg error';
          } else if (errorOutput.includes('Permission denied')) {
            errorMessage = 'Permission denied - check download folder permissions';
          } else if (code !== 0) {
            errorMessage = `Download failed (code ${code}): ${errorOutput.split('\n').find(line => line.includes('ERROR:')) || 'Unknown error'}`;
          }
          
          onError(errorMessage);
        }
      });
      
      process.on('error', (error) => {
        this.processes.delete(pid);
        console.error('yt-dlp download process error:', error);
        
        if (error.message.includes('ENOENT')) {
          onError('yt-dlp not found - please check installation');
        } else {
          onError(`Process error: ${error.message}`);
        }
      });
      
      // Monitor for stalled downloads
      const stallCheckInterval = setInterval(() => {
        const timeSinceLastProgress = Date.now() - lastProgressTime;
        if (timeSinceLastProgress > 120000) { // 2 minutes without progress
          this.debug('Download appears stalled, killing process');
          clearInterval(stallCheckInterval);
          process.kill('SIGKILL');
          onError('Download stalled - no progress for 2 minutes');
        }
      }, 30000); // Check every 30 seconds
      
      // Cleanup interval when process ends
      process.on('close', () => {
        clearInterval(stallCheckInterval);
      });
      
      resolve(pid);
    });
  }

  async pauseProcess(pid: number): Promise<void> {
    if (process.platform === 'win32') {
      throw new Error('Pausing downloads is not supported on Windows');
    }

    const childProcess = this.processes.get(pid);
    if (childProcess) {
      childProcess.kill('SIGSTOP');
    }
  }

  async fetchPlaylist(url: string): Promise<PlaylistInfo> {
    return new Promise((resolve, reject) => {
      const args = [
        ...buildNetworkIsolationArgs(this.shouldForceIpv4(url)),
        ...buildJavaScriptRuntimeArgs(this.javaScriptRuntimePath),
        '--dump-single-json',
        '--flat-playlist',
        '--yes-playlist',
        '--playlist-end',
        MAX_PLAYLIST_ITEMS.toString(),
        '--no-warnings',
        '--ignore-errors',
        '--socket-timeout',
        '30',
        '--extractor-retries',
        '3',
        url
      ];
      const child = spawn(this.ytDlpCommand, args);
      let jsonOutput = '';
      let errorOutput = '';
      let settled = false;

      const finish = (error?: Error, playlist?: PlaylistInfo) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);

        if (error) reject(error);
        else if (playlist) resolve(playlist);
      };

      child.stdout.on('data', data => {
        jsonOutput += data.toString();
      });

      child.stderr.on('data', data => {
        errorOutput += data.toString();
      });

      child.on('error', error => {
        finish(new Error(
          error.message.includes('ENOENT')
            ? 'yt-dlp not found - please check installation'
            : `Playlist process error: ${error.message}`
        ));
      });

      child.on('close', code => {
        if (code !== 0 || !jsonOutput.trim()) {
          const detail = errorOutput.split('\n')
            .find(line => line.includes('ERROR:'))
            ?.replace('ERROR:', '')
            .trim();
          finish(new Error(detail || 'Failed to fetch playlist information'));
          return;
        }

        try {
          const metadata: unknown = JSON.parse(jsonOutput.trim());
          finish(undefined, parsePlaylistMetadata(metadata, url));
        } catch (error) {
          finish(error instanceof Error ? error : new Error('Failed to parse playlist information'));
        }
      });

      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        finish(new Error('Playlist information fetch timed out'));
      }, 90000);
    });
  }

  async resumeProcess(pid: number): Promise<void> {
    if (process.platform === 'win32') {
      throw new Error('Resuming paused downloads is not supported on Windows');
    }

    const childProcess = this.processes.get(pid);
    if (childProcess) {
      childProcess.kill('SIGCONT');
    }
  }

  async cancelProcess(pid: number): Promise<void> {
    const process = this.processes.get(pid);
    if (!process) return;
    
    // Try SIGTERM first
    process.kill('SIGTERM');
    
    // Wait 5 seconds, then force kill with SIGKILL
    setTimeout(() => {
      if (this.processes.has(pid)) {
        process.kill('SIGKILL');
        this.processes.delete(pid);
      }
    }, 5000);
  }

  private shouldForceIpv4(url: string): boolean {
    try {
      return this.forceIpv4Hosts.has(new URL(url).hostname.toLowerCase());
    } catch {
      return false;
    }
  }

  private rememberIpv4Host(url: string): void {
    try {
      this.forceIpv4Hosts.add(new URL(url).hostname.toLowerCase());
    } catch {
      // URL validation happens before metadata extraction.
    }
  }

  private extractFormats(formats: YtDlpFormat[]): Format[] {
    const result = extractAvailableFormats(formats);
    
    this.debug('Extracted formats:', {
      sourceFormatCount: formats.length,
      result
    });
    
    return result;
  }
}
