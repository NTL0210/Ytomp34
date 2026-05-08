import { FormatType } from './FormatType';
import { Quality } from './Quality';

/**
 * Format value object
 * Represents a download format with available quality options
 */
export interface Format {
  readonly type: FormatType;      // 'mp4' or 'mp3'
  readonly qualities: Quality[];  // Available quality options for this format
}
