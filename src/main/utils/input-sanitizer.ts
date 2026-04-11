import { resolve, normalize } from 'path';
import { logger } from '../services/logger.service';

/**
 * Input Sanitizer Utility
 * Sanitizes user inputs to prevent security vulnerabilities
 * Requirements: REQ-NFR-004.1, REQ-NFR-004.8, REQ-FUN-007.3
 */

// Shell metacharacters that could be dangerous
const SHELL_METACHARACTERS = [
  ';', '&', '|', '`', '$', '(', ')', '<', '>', '\n', '\r',
  '\\', '"', "'", '*', '?', '[', ']', '{', '}', '!', '#',
];

// Windows invalid filename characters
const WINDOWS_INVALID_CHARS = ['<', '>', ':', '"', '/', '\\', '|', '?', '*'];

// Windows reserved filenames
const WINDOWS_RESERVED_NAMES = [
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
];

/**
 * Sanitize URL to remove shell metacharacters and validate format
 * Prevents command injection attacks
 */
export function sanitizeUrl(url: string): string {
  if (!url || typeof url !== 'string') {
    throw new Error('URL must be a non-empty string');
  }

  // Trim whitespace
  let sanitized = url.trim();

  // Check for shell metacharacters
  for (const char of SHELL_METACHARACTERS) {
    if (sanitized.includes(char)) {
      logger.warning('InputSanitizer', 'Shell metacharacter detected in URL', { 
        url, 
        char 
      });
      
      // For URLs, we should reject rather than sanitize
      // because removing these chars could break the URL
      throw new Error(`URL contains dangerous character: ${char}`);
    }
  }

  // Basic URL format validation
  try {
    new URL(sanitized);
  } catch {
    throw new Error('Invalid URL format');
  }

  return sanitized;
}

/**
 * Sanitize filename to remove invalid Windows characters
 * Limits length to 255 characters (filesystem limit)
 */
export function sanitizeFilename(filename: string): string {
  if (!filename || typeof filename !== 'string') {
    return 'unnamed';
  }

  let sanitized = filename.trim();

  // Remove or replace invalid Windows characters
  for (const char of WINDOWS_INVALID_CHARS) {
    sanitized = sanitized.replace(new RegExp(`\\${char}`, 'g'), '_');
  }

  // Remove control characters (0x00-0x1F)
  sanitized = sanitized.replace(/[\x00-\x1F]/g, '');

  // Remove leading/trailing dots and spaces (Windows doesn't allow)
  sanitized = sanitized.replace(/^[\s.]+|[\s.]+$/g, '');

  // Normalize multiple spaces
  sanitized = sanitized.replace(/\s+/g, ' ');

  // Check for Windows reserved names
  const nameWithoutExt = sanitized.split('.')[0].toUpperCase();
  if (WINDOWS_RESERVED_NAMES.includes(nameWithoutExt)) {
    sanitized = `_${sanitized}`;
  }

  // Limit length to 255 characters
  if (sanitized.length > 255) {
    const lastDotIndex = sanitized.lastIndexOf('.');
    if (lastDotIndex > 0) {
      // Preserve extension
      const ext = sanitized.substring(lastDotIndex);
      const name = sanitized.substring(0, 255 - ext.length);
      sanitized = name + ext;
    } else {
      sanitized = sanitized.substring(0, 255);
    }
  }

  // Ensure filename is not empty after sanitization
  if (sanitized.length === 0) {
    sanitized = 'unnamed';
  }

  return sanitized;
}

/**
 * Sanitize file path to prevent path traversal attacks
 * Resolves to absolute path and checks it's within allowed base directory
 */
export function sanitizePath(inputPath: string, baseDir: string): string {
  if (!inputPath || typeof inputPath !== 'string') {
    throw new Error('Path must be a non-empty string');
  }

  if (!baseDir || typeof baseDir !== 'string') {
    throw new Error('Base directory must be a non-empty string');
  }

  // Normalize the path
  const normalizedPath = normalize(inputPath);

  // Check for path traversal attempts
  if (normalizedPath.includes('..')) {
    logger.warning('InputSanitizer', 'Path traversal attempt detected', { 
      inputPath, 
      baseDir 
    });
    throw new Error('Path traversal detected');
  }

  // Resolve to absolute path
  const absolutePath = resolve(baseDir, normalizedPath);
  const absoluteBase = resolve(baseDir);

  // Verify the resolved path is within base directory
  if (!absolutePath.startsWith(absoluteBase)) {
    logger.warning('InputSanitizer', 'Path outside base directory', { 
      inputPath, 
      absolutePath, 
      baseDir 
    });
    throw new Error('Path is outside allowed directory');
  }

  return absolutePath;
}

/**
 * Sanitize command argument to prevent command injection
 * Used when spawning external processes
 */
export function sanitizeCommandArg(arg: string): string {
  if (!arg || typeof arg !== 'string') {
    return '';
  }

  let sanitized = arg.trim();

  // Check for shell metacharacters
  for (const char of SHELL_METACHARACTERS) {
    if (sanitized.includes(char)) {
      logger.warning('InputSanitizer', 'Shell metacharacter in command arg', { 
        arg, 
        char 
      });
      
      // Escape or reject
      throw new Error(`Command argument contains dangerous character: ${char}`);
    }
  }

  return sanitized;
}

/**
 * Validate and sanitize integer input
 */
export function sanitizeInteger(
  value: any,
  min?: number,
  max?: number,
  defaultValue?: number
): number {
  const parsed = parseInt(value, 10);

  if (isNaN(parsed)) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error('Invalid integer value');
  }

  if (min !== undefined && parsed < min) {
    throw new Error(`Value must be at least ${min}`);
  }

  if (max !== undefined && parsed > max) {
    throw new Error(`Value must be at most ${max}`);
  }

  return parsed;
}

/**
 * Validate and sanitize string input
 */
export function sanitizeString(
  value: any,
  maxLength?: number,
  allowedPattern?: RegExp
): string {
  if (typeof value !== 'string') {
    throw new Error('Value must be a string');
  }

  let sanitized = value.trim();

  if (maxLength && sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  if (allowedPattern && !allowedPattern.test(sanitized)) {
    throw new Error('String contains invalid characters');
  }

  return sanitized;
}

/**
 * Check if string contains only safe characters (alphanumeric, spaces, basic punctuation)
 */
export function isSafeString(value: string): boolean {
  // Allow alphanumeric, spaces, and basic punctuation
  const safePattern = /^[a-zA-Z0-9\s.,!?@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]*$/;
  return safePattern.test(value);
}
