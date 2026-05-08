import { Format } from '../value-objects';

/**
 * Video entity
 * Represents video metadata extracted from yt-dlp
 * All properties are readonly (immutable)
 */
export interface Video {
  readonly id: string;              // Unique video identifier
  readonly url: string;             // Original video URL
  readonly title: string;           // Video title
  readonly duration: number;        // Duration in seconds
  readonly thumbnailUrl: string;    // Thumbnail image URL
  readonly availableFormats: Format[];  // Available download formats
}
