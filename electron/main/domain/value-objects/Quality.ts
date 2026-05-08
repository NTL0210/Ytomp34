/**
 * Quality value object
 * Represents a quality option for a specific format
 */
export interface Quality {
  readonly label: string;        // Display label (e.g., "1080p", "320kbps")
  readonly value: string;        // Format code for yt-dlp
  readonly bitrate?: number;     // Audio bitrate (for MP3)
  readonly resolution?: string;  // Video resolution (for MP4)
}
