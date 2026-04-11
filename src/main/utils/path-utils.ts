import { resolve, normalize, basename, isAbsolute } from 'path';
import { platform } from 'os';

/**
 * Path Utilities
 * Provides path sanitization and validation to prevent security issues
 * Requirements: REQ-FUN-015.1, REQ-FUN-016.1, REQ-FUN-016.2, REQ-NFR-004.1
 */

/**
 * Sanitize a file path to prevent path traversal attacks
 * Removes dangerous patterns like ../, ..\, and ensures path is within allowed directory
 */
export function sanitizePath(inputPath: string, baseDir: string): string {
  // Normalize the path (converts / to \ on Windows, removes redundant separators)
  const normalizedPath = normalize(inputPath);
  
  // Resolve to absolute path
  const absolutePath = resolve(baseDir, normalizedPath);
  const absoluteBase = resolve(baseDir);
  
  // Check if resolved path is within base directory
  if (!absolutePath.startsWith(absoluteBase)) {
    throw new Error(`Path traversal detected: ${inputPath}`);
  }
  
  return absolutePath;
}

/**
 * Sanitize filename to remove invalid characters
 * Windows invalid chars: < > : " / \ | ? *
 * Also limits length to 255 characters
 */
export function sanitizeFilename(filename: string): string {
  // Remove or replace invalid characters
  let sanitized = filename
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_') // Replace invalid chars with underscore
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
  
  // Remove leading/trailing dots (Windows doesn't allow)
  sanitized = sanitized.replace(/^\.+|\.+$/g, '');
  
  // Limit length to 255 characters (filesystem limit)
  if (sanitized.length > 255) {
    const ext = sanitized.substring(sanitized.lastIndexOf('.'));
    const name = sanitized.substring(0, 255 - ext.length);
    sanitized = name + ext;
  }
  
  // Ensure filename is not empty
  if (sanitized.length === 0) {
    sanitized = 'unnamed';
  }
  
  return sanitized;
}

/**
 * Validate if a path is safe (no path traversal attempts)
 */
export function isPathSafe(inputPath: string): boolean {
  const normalized = normalize(inputPath);
  
  // Check for path traversal patterns
  if (normalized.includes('..')) {
    return false;
  }
  
  // Check for absolute paths (should be relative)
  if (isAbsolute(normalized)) {
    return false;
  }
  
  return true;
}

/**
 * Get safe basename from path
 */
export function getSafeBasename(filePath: string): string {
  const base = basename(filePath);
  return sanitizeFilename(base);
}

/**
 * Check if path contains dangerous patterns
 */
export function containsDangerousPatterns(path: string): boolean {
  const dangerousPatterns = [
    /\.\./,           // Parent directory
    /[<>:"|?*]/,      // Invalid Windows chars
    /\x00/,           // Null byte
    /^[A-Z]:\\/i,     // Absolute Windows path
    /^\//,            // Absolute Unix path
  ];
  
  return dangerousPatterns.some(pattern => pattern.test(path));
}

/**
 * Ensure directory path ends with separator
 */
export function ensureTrailingSeparator(dirPath: string): string {
  const sep = platform() === 'win32' ? '\\' : '/';
  return dirPath.endsWith(sep) ? dirPath : dirPath + sep;
}
