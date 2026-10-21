import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { Settings } from '../domain/entities';
import { Theme } from '../domain/value-objects';

/**
 * Validation result
 */
export interface ValidationResult {
    valid: boolean;
    errors: string[];
}

/**
 * SettingsStore interface
 * Provides persistent storage for user settings
 */
export interface SettingsStore {
    /**
     * Load settings from disk
     * Creates default settings if file doesn't exist
     */
    load(): Promise<Settings>;

    /**
     * Save settings to disk
     */
    save(settings: Settings): Promise<void>;

    /**
     * Validate settings values
     */
    validate(settings: Partial<Settings>): ValidationResult;
}

/**
 * SettingsStore implementation
 * - Stores settings as JSON in app data directory
 * - Creates defaults if file doesn't exist
 * - Validates theme, concurrentLimit, and directory writability
 * Validates: Requirements 11.1, 11.2, 11.3, 11.4, 12.2, 12.3, 12.4, 21.2, 21.3
 */
export class SettingsStoreImpl implements SettingsStore {
    private settingsFile: string;

    constructor() {
        const userDataPath = app.getPath('userData');
        this.settingsFile = path.join(userDataPath, 'settings.json');
    }

    async load(): Promise<Settings> {
        try {
            // Check if settings file exists
            if (!fs.existsSync(this.settingsFile)) {
                // Create default settings
                const defaultSettings = this.createDefaultSettings();
                await this.save(defaultSettings);
                return defaultSettings;
            }

            // Read and parse settings file
            const data = await fs.promises.readFile(this.settingsFile, 'utf-8');
            let settings = JSON.parse(data) as Settings;

            // Convert relative download directory to absolute path
            if (settings.downloadDirectory && !path.isAbsolute(settings.downloadDirectory)) {
                settings = {
                    ...settings,
                    downloadDirectory: path.resolve(settings.downloadDirectory)
                };
                await this.save(settings);
            }

            // Validate loaded settings
            const validation = this.validate(settings);
            if (!validation.valid) {
                // If invalid, return defaults
                return this.createDefaultSettings();
            }

            return settings;
        } catch (error) {
            // If any error, return defaults
            return this.createDefaultSettings();
        }
    }

    async save(settings: Settings): Promise<void> {
        const data = JSON.stringify(settings, null, 2);
        await fs.promises.writeFile(this.settingsFile, data, 'utf-8');
    }

    validate(settings: Partial<Settings>): ValidationResult {
        const errors: string[] = [];

        // Validate theme
        if (settings.theme !== undefined) {
            if (settings.theme !== 'light' && settings.theme !== 'dark') {
                errors.push('Theme must be "light" or "dark"');
            }
        }

        // Validate concurrentLimit
        if (settings.concurrentLimit !== undefined) {
            if (settings.concurrentLimit < 1 || settings.concurrentLimit > 10) {
                errors.push('Concurrent limit must be between 1 and 10');
            }
        }

        // Validate downloadDirectory
        if (settings.downloadDirectory !== undefined) {
            try {
                // Convert relative paths to absolute
                let absolutePath = settings.downloadDirectory;
                if (!path.isAbsolute(absolutePath)) {
                    absolutePath = path.resolve(absolutePath);
                }

                // Check if directory exists and is writable
                if (fs.existsSync(absolutePath)) {
                    fs.accessSync(absolutePath, fs.constants.W_OK);
                } else {
                    errors.push('Download directory does not exist');
                }
            } catch (error) {
                errors.push('Download directory is not writable');
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    private createDefaultSettings(): Settings {
        return {
            theme: 'light' as Theme,
            downloadDirectory: app.getPath('downloads'),
            concurrentLimit: 3
        };
    }
}
