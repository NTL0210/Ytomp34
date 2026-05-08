/**
 * Progress data extracted from yt-dlp stdout
 */
export interface ProgressData {
  percentage: number;  // 0-100
  speed: string;       // e.g., "1.5MiB/s"
  eta: string;         // e.g., "00:05:23"
}

/**
 * ProgressParser interface
 * Parses yt-dlp stdout to extract download progress
 */
export interface ProgressParser {
  /**
   * Parse yt-dlp stdout line
   * Returns ProgressData if line contains progress info, null otherwise
   */
  parse(line: string): ProgressData | null;
  
  /**
   * Get last known progress values
   * Used as fallback when parsing fails
   */
  getLastKnown(): ProgressData;
}

/**
 * ProgressParser implementation
 * Parses multiple yt-dlp output formats with robust regex patterns
 * Validates: Requirements 6.1, 6.2, 6.3
 */
export class ProgressParserImpl implements ProgressParser {
  // Multiple regex patterns to match different yt-dlp progress formats
  private readonly progressPatterns = [
    // Full format: [download]  45.2% of 57.47MiB at 1.5MiB/s ETA 00:05:23
    /\[download\]\s+(\d+\.?\d*)%\s+of\s+~?\s*[\d.]+\s*\w+\s+at\s+([\d.]+\s*\w+\/s)\s+ETA\s+([\d:]+)/i,
    
    // With "in" instead of "at": [download]  45.2% of 57.47MiB in 1.5MiB/s ETA 00:05:23
    /\[download\]\s+(\d+\.?\d*)%\s+of\s+~?\s*[\d.]+\s*\w+\s+in\s+([\d.]+\s*\w+\/s)\s+ETA\s+([\d:]+)/i,
    
    // Without size: [download]  45.2% at 1.5MiB/s ETA 00:05:23
    /\[download\]\s+(\d+\.?\d*)%\s+at\s+([\d.]+\s*\w+\/s)\s+ETA\s+([\d:]+)/i,
    
    // With speed only: [download]  45.2% of 57.47MiB at 1.5MiB/s
    /\[download\]\s+(\d+\.?\d*)%\s+of\s+~?\s*[\d.]+\s*\w+\s+at\s+([\d.]+\s*\w+\/s)/i,
    
    // Percentage and speed only: [download]  45.2% at 1.5MiB/s
    /\[download\]\s+(\d+\.?\d*)%\s+at\s+([\d.]+\s*\w+\/s)/i,
    
    // Percentage only: [download]  45.2%
    /\[download\]\s+(\d+\.?\d*)%/i,
  ];
  
  private lastKnownProgress: ProgressData = {
    percentage: 0,
    speed: '0 B/s',
    eta: '--:--'
  };

  parse(line: string): ProgressData | null {
    // Try each pattern in order
    for (const pattern of this.progressPatterns) {
      const match = line.match(pattern);
      
      if (match) {
        const percentage = parseFloat(match[1]);
        const speed = match[2] ? this.normalizeSpeed(match[2]) : this.lastKnownProgress.speed;
        const eta = match[3] ? this.normalizeEta(match[3]) : this.lastKnownProgress.eta;
        
        this.lastKnownProgress = {
          percentage: Math.min(100, Math.max(0, percentage)), // Clamp 0-100
          speed,
          eta
        };
        
        return this.lastKnownProgress;
      }
    }
    
    // Check for conversion/post-processing messages
    if (line.includes('[ffmpeg]') || line.includes('Merging') || line.includes('Converting')) {
      // Keep last percentage but update status
      return {
        percentage: Math.max(95, this.lastKnownProgress.percentage), // At least 95%
        speed: 'Processing...',
        eta: 'Almost done'
      };
    }
    
    // Return null if no pattern matches
    return null;
  }

  getLastKnown(): ProgressData {
    return { ...this.lastKnownProgress };
  }

  /**
   * Normalize speed format (remove extra spaces, ensure consistent format)
   */
  private normalizeSpeed(speed: string): string {
    // Remove extra spaces
    speed = speed.trim().replace(/\s+/g, '');
    
    // Ensure it has /s suffix
    if (!speed.endsWith('/s')) {
      speed += '/s';
    }
    
    return speed;
  }

  /**
   * Normalize ETA format (ensure HH:MM:SS or MM:SS format)
   */
  private normalizeEta(eta: string): string {
    eta = eta.trim();
    
    // If it's already in correct format, return it
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(eta)) {
      return eta;
    }
    
    // If it's just seconds, convert to MM:SS
    const seconds = parseInt(eta);
    if (!isNaN(seconds)) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    
    return eta;
  }
}
