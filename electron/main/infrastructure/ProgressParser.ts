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
 * Parses yt-dlp output format: [download]  45.2% of 57.47MiB at 1.5MiB/s ETA 00:05:23
 * Validates: Requirements 6.1, 6.2, 6.3
 */
export class ProgressParserImpl implements ProgressParser {
  // Regex to match yt-dlp progress format
  private readonly progressRegex = /\[download\]\s+(\d+\.?\d*)%\s+of\s+[\d.]+\w+\s+at\s+([\d.]+\w+\/s)\s+ETA\s+([\d:]+)/;
  
  private lastKnownProgress: ProgressData = {
    percentage: 0,
    speed: '0 B/s',
    eta: '--:--:--'
  };

  parse(line: string): ProgressData | null {
    const match = line.match(this.progressRegex);
    
    if (match) {
      this.lastKnownProgress = {
        percentage: parseFloat(match[1]),
        speed: match[2],
        eta: match[3]
      };
      return this.lastKnownProgress;
    }
    
    // Return null if parsing fails (caller can use getLastKnown())
    return null;
  }

  getLastKnown(): ProgressData {
    return { ...this.lastKnownProgress };
  }
}
