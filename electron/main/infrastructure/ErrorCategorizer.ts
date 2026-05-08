import { ErrorType } from '../domain/value-objects';

/**
 * ErrorCategorizer
 * Categorizes errors into predefined types for consistent handling
 */
export class ErrorCategorizer {
  categorize(error: Error): ErrorType {
    const message = error.message.toLowerCase();
    
    // Check for yt-dlp missing
    if (error.name === 'YtDlpNotFoundError' || message.includes('yt-dlp') && message.includes('not found')) {
      return 'yt_dlp_missing';
    }
    
    // Check for invalid URL
    if (message.includes('invalid url') || message.includes('malformed')) {
      return 'invalid_url';
    }
    
    // Check for network errors
    if (message.match(/network|enotfound|etimedout|connection/i)) {
      return 'network_error';
    }
    
    // Check for permission errors
    if (message.match(/eacces|eperm|permission denied/i)) {
      return 'permission_error';
    }
    
    // Default to unknown
    return 'unknown';
  }
}
