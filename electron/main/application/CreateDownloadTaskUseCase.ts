import * as path from 'path';
import * as fs from 'fs';
import { DownloadTask, DownloadQueue } from '../domain/entities';
import { FormatType } from '../domain/value-objects';
import { FileSanitizer, SettingsStore, Logger } from '../infrastructure';

/**
 * StartDownload request/response contracts
 */
export interface StartDownloadRequest {
    url: string;
    videoTitle: string;
    format: FormatType;
    quality: string;
}

export interface StartDownloadResponse {
    success: boolean;
    taskId?: string;
    error?: {
        type: 'invalid_params' | 'queue_full' | 'unknown' | 'permission_error';
        message: string;
    };
}

/**
 * CreateDownloadTaskUseCase
 * Loads settings, sanitizes filename, creates task with unique ID, adds to queue
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5
 */
export class CreateDownloadTaskUseCase {
    constructor(
        private queue: DownloadQueue,
        private fileSanitizer: FileSanitizer,
        private settingsStore: SettingsStore,
        private logger: Logger
    ) { }

    async execute(request: StartDownloadRequest): Promise<StartDownloadResponse> {
        try {
            // Load settings to get download directory
            const settings = await this.settingsStore.load();

            // Validate download directory exists and is writable
            const dirValidation = this.validateDownloadDirectory(settings.downloadDirectory);
            if (!dirValidation.valid) {
                this.logger.error('Download directory not accessible', undefined, {
                    directory: settings.downloadDirectory,
                    error: dirValidation.error
                });
                return {
                    success: false,
                    error: {
                        type: 'permission_error',
                        message: dirValidation.error || 'Download directory is not accessible. Please check permissions or change the download folder in settings.'
                    }
                };
            }

            // Sanitize video title
            const sanitizedTitle = this.fileSanitizer.sanitize(request.videoTitle);

            // Determine file extension based on format
            const extension = request.format === 'mp4' ? '.mp4' : '.mp3';

            // Ensure unique filename
            const uniqueFilename = this.ensureUniqueAcrossQueue(
                settings.downloadDirectory,
                sanitizedTitle,
                extension
            );

            // Create download task with unique ID
            const task: DownloadTask = {
                id: this.generateId(),
                url: request.url,
                videoTitle: request.videoTitle,
                status: 'pending',
                progress: 0,
                speed: '0 B/s',
                eta: '--:--:--',
                filePath: path.join(settings.downloadDirectory, uniqueFilename),
                selectedFormat: request.format,
                selectedQuality: request.quality,
                retryCount: 0,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            // Add task to queue
            this.queue.addTask(task);

            this.logger.info('Download task created', {
                taskId: task.id,
                videoTitle: request.videoTitle,
                format: request.format,
                quality: request.quality
            });

            return {
                success: true,
                taskId: task.id
            };
        } catch (error) {
            this.logger.error('Failed to create download task', error as Error);

            return {
                success: false,
                error: {
                    type: 'unknown',
                    message: (error as Error).message
                }
            };
        }
    }

    /**
     * Validate download directory exists and is writable
     */
    private validateDownloadDirectory(directory: string): { valid: boolean; error?: string } {
        try {
            if (!fs.existsSync(directory)) {
                return { valid: false, error: 'Download directory does not exist' };
            }

            // Check write permission by attempting to create a temp file
            fs.accessSync(directory, fs.constants.W_OK);

            return { valid: true };
        } catch (error) {
            const err = error as NodeJS.ErrnoException;
            if (err.code === 'EACCES' || err.code === 'EPERM') {
                return { valid: false, error: 'Permission denied: cannot write to download directory' };
            }
            if (err.code === 'ENOENT') {
                return { valid: false, error: 'Download directory does not exist' };
            }
            return { valid: false, error: 'Download directory is not accessible' };
        }
    }

    private generateId(): string {
        return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Disk checks alone are not enough when several tasks with the same title
     * are queued before any of them creates its output file.
     */
    private ensureUniqueAcrossQueue(directory: string, filename: string, extension: string): string {
        for (let counter = 0; counter <= this.queue.tasks.length; counter += 1) {
            const candidateBase = counter === 0 ? filename : `${filename} (${counter})`;
            const candidate = this.fileSanitizer.ensureUnique(directory, candidateBase, extension);
            const candidatePath = path.resolve(directory, candidate).toLowerCase();
            const alreadyQueued = this.queue.tasks.some(task =>
                path.resolve(task.filePath).toLowerCase() === candidatePath
            );

            if (!alreadyQueued) {
                return candidate;
            }
        }

        throw new Error('Could not allocate a unique output filename');
    }
}
