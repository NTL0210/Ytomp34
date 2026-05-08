import * as fs from 'fs';
import * as path from 'path';

/**
 * FileSanitizer interface
 * Provides filename sanitization and uniqueness checking
 */
export interface FileSanitizer {
  /**
   * Remove invalid characters from filename
   * - Removes: < > : " / \ | ? *
   * - Trims whitespace
   * - Limits to 200 characters
   * - Uses "download" as fallback for empty names
   */
  sanitize(filename: string): string;
  
  /**
   * Ensure filename is unique in directory
   * Appends numeric suffix if file exists: file.mp4 → file (1).mp4
   */
  ensureUnique(directory: string, filename: string, extension: string): string;
}

/**
 * FileSanitizer implementation
 * Validates: Requirements 4.3, 4.4, 20.1, 20.2, 20.3, 20.4, 20.5
 */
export class FileSanitizerImpl implements FileSanitizer {
  private readonly invalidCharsRegex = /[<>:"/\\|?*]/g;
  private readonly maxLength = 200;
  private readonly defaultName = 'download';

  sanitize(filename: string): string {
    // Remove invalid characters
    let sanitized = filename.replace(this.invalidCharsRegex, '');
    
    // Trim whitespace
    sanitized = sanitized.trim();
    
    // Limit length to 200 characters
    if (sanitized.length > this.maxLength) {
      sanitized = sanitized.substring(0, this.maxLength);
    }
    
    // Use default name if empty
    if (sanitized.length === 0) {
      sanitized = this.defaultName;
    }
    
    return sanitized;
  }

  ensureUnique(directory: string, filename: string, extension: string): string {
    const baseName = filename;
    let uniqueName = `${baseName}${extension}`;
    let counter = 1;
    
    // Check if file exists
    while (fs.existsSync(path.join(directory, uniqueName))) {
      // Append numeric suffix
      uniqueName = `${baseName} (${counter})${extension}`;
      counter++;
    }
    
    return uniqueName;
  }
}
