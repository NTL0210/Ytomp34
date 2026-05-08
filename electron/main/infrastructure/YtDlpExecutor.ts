import { spawn, ChildProcess } from 'child_process';
import { Video } from '../domain/entities';
import { ProgressData } from './ProgressParser';

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
  private ytDlpCommand: string = 'yt-dlp'; // Default to system yt-dlp
  private ffmpegLocation: string | null = null; // ffmpeg directory path

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

  async checkInstallation(): Promise<{ installed: boolean; version?: string }> {
    return new Promise((resolve) => {
      console.log('Checking yt-dlp installation:', this.ytDlpCommand);
      
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
        console.log('yt-dlp version check completed:', { code, version: version.trim(), error: errorOutput });
        
        if (code === 0 && version.trim()) {
          resolve({ installed: true, version: version.trim() });
        } else {
          console.log('yt-dlp not working:', { code, error: errorOutput });
          resolve({ installed: false });
        }
      });
      
      process.on('error', (error) => {
        console.log('yt-dlp process error:', error.message);
        resolve({ installed: false });
      });
      
      // Timeout for version check (5 seconds)
      setTimeout(() => {
        console.log('yt-dlp version check timeout');
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
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Metadata fetch attempt ${attempt}/${maxRetries} for:`, url);
        
        const video = await this.fetchMetadataAttempt(url, attempt);
        console.log(`Metadata fetch successful on attempt ${attempt}`);
        return video;
      } catch (error) {
        lastError = error as Error;
        console.log(`Metadata fetch attempt ${attempt} failed:`, lastError.message);
        
        // If it's a bot detection error, wait longer between retries
        if (lastError.message.includes('not a bot') || lastError.message.includes('Sign in')) {
          if (attempt < maxRetries) {
            const waitTime = attempt * 5000; // 5s, 10s, 15s
            console.log(`Bot detection detected, waiting ${waitTime}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        } else if (attempt < maxRetries) {
          // For other errors, shorter wait
          const waitTime = attempt * 2000; // 2s, 4s
          console.log(`Waiting ${waitTime}ms before retry...`);
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
  private async fetchMetadataAttempt(url: string, attempt: number): Promise<Video> {
    return new Promise((resolve, reject) => {
      console.log('Starting yt-dlp metadata fetch for:', url);
      console.log('yt-dlp command:', this.ytDlpCommand);
      console.log('ffmpeg location:', this.ffmpegLocation);
      
      // Build command arguments with anti-bot measures
      const args = ['--dump-json'];
      
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
        args.push('--no-check-certificate');  // Skip SSL verification
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
      
      console.log(`Full command (attempt ${attempt}):`, this.ytDlpCommand, args.join(' '));
      
      const process = spawn(this.ytDlpCommand, args);
      
      let jsonOutput = '';
      let errorOutput = '';
      
      process.stdout.on('data', (data) => {
        const chunk = data.toString();
        console.log('yt-dlp stdout chunk:', chunk.substring(0, 200) + (chunk.length > 200 ? '...' : ''));
        jsonOutput += chunk;
      });
      
      process.stderr.on('data', (data) => {
        const line = data.toString();
        console.log('yt-dlp stderr:', line);
        errorOutput += line;
      });
      
      process.on('close', (code) => {
        console.log('yt-dlp process closed with code:', code);
        console.log('stdout length:', jsonOutput.length);
        console.log('stderr length:', errorOutput.length);
        
        if (code === 0 && jsonOutput.trim()) {
          try {
            // Try to parse JSON - sometimes there might be multiple JSON objects
            const lines = jsonOutput.trim().split('\n');
            let videoData = null;
            
            for (const line of lines) {
              if (line.trim().startsWith('{')) {
                try {
                  videoData = JSON.parse(line.trim());
                  break;
                } catch (e) {
                  console.log('Failed to parse line as JSON:', line.substring(0, 100));
                  continue;
                }
              }
            }
            
            if (!videoData) {
              // Try parsing the entire output
              videoData = JSON.parse(jsonOutput.trim());
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
            
            console.log('Metadata extracted successfully:', {
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
          
          if (errorOutput.includes('Sign in to confirm') || errorOutput.includes('not a bot')) {
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
        console.log(`yt-dlp metadata fetch timeout (${timeout/1000}s) - killing process`);
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
    return new Promise((resolve, reject) => {
      console.log('Starting download:', { url, format, quality, outputPath });
      console.log('yt-dlp command:', this.ytDlpCommand);
      console.log('ffmpeg location:', this.ffmpegLocation);
      
      // Build yt-dlp command arguments
      const args = [];

      // Format selection based on type
      if (format === 'mp3') {
        // For MP3: Download best audio and convert to MP3
        args.push('-f', 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio');
        args.push('--extract-audio');
        args.push('--audio-format', 'mp3');
        args.push('--audio-quality', '0'); // Best quality
        
        // Add ffmpeg location if available
        if (this.ffmpegLocation) {
          args.push('--ffmpeg-location', this.ffmpegLocation);
        }
      } else {
        // For MP4: Download video with audio
        if (quality && quality !== 'best') {
          // Use specific quality format with fallbacks
          const heightLimit = quality.replace('p', '');
          args.push('-f', `best[height<=${heightLimit}][ext=mp4]/best[height<=${heightLimit}]/best[ext=mp4]/best`);
        } else {
          // Use best available format with MP4 preference
          args.push('-f', 'best[ext=mp4]/best');
        }
        
        // Ensure we get both video and audio
        args.push('--merge-output-format', 'mp4');
        
        // Add ffmpeg location for potential merging
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
      args.push('-o', outputPath);
      args.push(url);
      
      console.log('Full download command:', this.ytDlpCommand, args.join(' '));
      
      const process = spawn(this.ytDlpCommand, args);
      const pid = process.pid!;
      
      // Store process for control operations
      this.processes.set(pid, process);
      
      let errorOutput = '';
      let lastProgressTime = Date.now();
      
      // Parse progress from stdout
      process.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        
        for (const line of lines) {
          if (line.trim()) {
            console.log('yt-dlp stdout:', line);
            
            // Try comprehensive progress parsing with multiple patterns
            let progressMatch = null;
            
            // Pattern 1: Full format with ETA
            progressMatch = line.match(/\[download\]\s+(\d+\.?\d*)%\s+of\s+~?\s*[\d.]+\s*\w+\s+at\s+([\d.]+\s*\w+\/s)\s+ETA\s+([\d:]+)/i);
            
            if (!progressMatch) {
              // Pattern 2: Without size
              progressMatch = line.match(/\[download\]\s+(\d+\.?\d*)%\s+at\s+([\d.]+\s*\w+\/s)\s+ETA\s+([\d:]+)/i);
            }
            
            if (!progressMatch) {
              // Pattern 3: With speed only
              progressMatch = line.match(/\[download\]\s+(\d+\.?\d*)%\s+of\s+~?\s*[\d.]+\s*\w+\s+at\s+([\d.]+\s*\w+\/s)/i);
            }
            
            if (!progressMatch) {
              // Pattern 4: Percentage and speed
              progressMatch = line.match(/\[download\]\s+(\d+\.?\d*)%\s+at\s+([\d.]+\s*\w+\/s)/i);
            }
            
            if (!progressMatch) {
              // Pattern 5: Percentage only
              progressMatch = line.match(/\[download\]\s+(\d+\.?\d*)%/i);
            }
            
            if (progressMatch) {
              const percentage = parseFloat(progressMatch[1]);
              const speed = progressMatch[2] ? progressMatch[2].trim().replace(/\s+/g, '') : 'Calculating...';
              const eta = progressMatch[3] ? progressMatch[3].trim() : 'Calculating...';
              
              const progress: ProgressData = {
                percentage: Math.min(100, Math.max(0, percentage)), // Clamp 0-100
                speed: speed.endsWith('/s') ? speed : speed + '/s',
                eta
              };
              
              onProgress(progress);
              lastProgressTime = Date.now();
            }
            
            // Check for conversion/post-processing progress
            if (line.includes('[ffmpeg]') || line.includes('Merging') || line.includes('Converting')) {
              console.log('Post-processing in progress:', line);
              onProgress({
                percentage: 99,
                speed: 'Processing...',
                eta: 'Almost done'
              });
              lastProgressTime = Date.now();
            }
            
            // Check for "Destination" line (download complete, starting post-process)
            if (line.includes('[download]') && line.includes('Destination:')) {
              console.log('Download complete, post-processing...');
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
        console.log('yt-dlp stderr:', line);
        errorOutput += line;
        
        // Check for specific error patterns
        if (line.includes('ERROR:') || line.includes('WARNING:')) {
          console.log('yt-dlp error/warning:', line);
        }
      });
      
      process.on('close', (code) => {
        this.processes.delete(pid);
        console.log('yt-dlp download process closed with code:', code);
        console.log('Error output:', errorOutput);
        
        if (code === 0) {
          console.log('Download completed successfully');
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
          console.log('Download appears stalled, killing process');
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
    const process = this.processes.get(pid);
    if (process) {
      process.kill('SIGSTOP');
    }
  }

  async resumeProcess(pid: number): Promise<void> {
    const process = this.processes.get(pid);
    if (process) {
      process.kill('SIGCONT');
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

  private extractFormats(formats: any[]): any[] {
    // Extract MP4 and MP3 formats with qualities
    const mp4Formats: any[] = [];
    const mp3Formats: any[] = [];
    
    formats.forEach(f => {
      if (f.vcodec && f.vcodec !== 'none') {
        // Video format
        mp4Formats.push({
          label: f.format_note || f.height ? `${f.height}p` : 'Unknown',
          value: f.format_id,
          resolution: f.height ? `${f.height}p` : undefined
        });
      } else if (f.acodec && f.acodec !== 'none') {
        // Audio format
        mp3Formats.push({
          label: f.abr ? `${f.abr}kbps` : 'Unknown',
          value: f.format_id,
          bitrate: f.abr
        });
      }
    });
    
    const result = [];
    
    if (mp4Formats.length > 0) {
      result.push({
        type: 'mp4',
        qualities: mp4Formats
      });
    }
    
    if (mp3Formats.length > 0) {
      result.push({
        type: 'mp3',
        qualities: mp3Formats
      });
    }
    
    return result;
  }
}
