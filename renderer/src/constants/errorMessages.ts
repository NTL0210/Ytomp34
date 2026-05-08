/**
 * Error Messages Map
 * User-friendly error messages with actionable guidance
 * Validates: Requirements 14.1, 14.2, 14.3, 14.4
 */

export type ErrorType = 'yt_dlp_missing' | 'invalid_url' | 'network_error' | 'permission_error' | 'unknown';

export interface ErrorDisplay {
  title: string;
  message: string;
  action?: {
    label: string;
    link?: string;
  };
}

export const ERROR_MESSAGES: Record<ErrorType, ErrorDisplay> = {
  yt_dlp_missing: {
    title: 'yt-dlp Not Found',
    message: 'yt-dlp is required to download videos. Please install it to continue.',
    action: {
      label: 'Installation Guide',
      link: 'https://github.com/yt-dlp/yt-dlp#installation'
    }
  },
  invalid_url: {
    title: 'Invalid URL',
    message: 'The URL you entered is not valid. Please check and try again.',
  },
  network_error: {
    title: 'Network Error',
    message: 'Network error occurred. Please check your internet connection and try again.',
  },
  permission_error: {
    title: 'Permission Denied',
    message: 'Permission denied. Please check folder permissions or choose a different location.',
  },
  unknown: {
    title: 'Unexpected Error',
    message: 'An unexpected error occurred. Please try again or check the logs for details.',
  }
};

/**
 * Get user-friendly error display from error type
 */
export function getErrorDisplay(errorType: ErrorType | string): ErrorDisplay {
  if (errorType in ERROR_MESSAGES) {
    return ERROR_MESSAGES[errorType as ErrorType];
  }
  return ERROR_MESSAGES.unknown;
}
