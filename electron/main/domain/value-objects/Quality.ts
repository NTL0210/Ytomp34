/**
 * Quality value object
 * Represents a quality option for a specific format
 */
export interface Quality {
  readonly label: string;        // Display label (e.g., "1920 × 1080", "320kbps")
  readonly value: string;        // Selection token sent back to the main process
  readonly bitrate?: number;     // Audio bitrate (for MP3)
  readonly resolution?: string;  // Actual dimensions or resolution tier
  readonly width?: number;       // Representative video width
  readonly height?: number;      // Representative video height
  readonly fps?: number;         // Representative frame rate
  readonly formatId?: string;    // Representative yt-dlp format id
  readonly ext?: string;         // Representative container
  readonly vcodec?: string;      // Representative video codec
  readonly acodec?: string;      // Audio codec for audio choices
  readonly isProgressive?: boolean; // Video stream already contains audio
}
