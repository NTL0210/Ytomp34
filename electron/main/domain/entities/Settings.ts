import { Theme } from '../value-objects';

/**
 * Settings entity
 * Represents user preferences and application configuration
 */
export interface Settings {
  theme: Theme;                  // Application theme ('light' or 'dark')
  downloadDirectory: string;     // Directory where downloads are saved
  concurrentLimit: number;       // Max concurrent downloads (1-10, default 3)
}
