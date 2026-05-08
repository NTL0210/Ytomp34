/**
 * Error categorization type
 * Used for consistent error handling and user feedback
 */
export type ErrorType = 
  | 'invalid_url'        // URL format is invalid
  | 'yt_dlp_missing'     // yt-dlp is not installed
  | 'network_error'      // Network connectivity issues
  | 'permission_error'   // File system permission denied
  | 'unknown';           // Other errors
