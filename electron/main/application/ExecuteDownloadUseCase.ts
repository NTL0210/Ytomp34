import { DownloadTask, DownloadQueue } from '../domain/entities';
import { DownloadStatus } from '../domain/value-objects';
import { YtDlpExecutor, Logger, ProgressData, DownloadOutputMetadata } from '../infrastructure';

/**
 * Callback types for progress and status updates
 */
export type ProgressCallback = (taskId: string, progress: ProgressData) => void;
export type StatusCallback = (taskId: string, status: DownloadStatus) => void;

/**
 * ExecuteDownloadUseCase
 * Starts download, handles progress callbacks, implements retry logic (3 times), starts next task on completion
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 6.4, 10.1, 10.2, 10.3, 10.4, 23.1, 23.2, 23.3, 23.4, 23.5
 */
export class ExecuteDownloadUseCase {
    private lastProgressUpdateTime: Map<string, number> = new Map();
    private lastProgressValue: Map<string, number> = new Map();
    // Update UI every 500ms for smooth ETA, but only if progress changed by >= 0.5%
    private readonly PROGRESS_UPDATE_THROTTLE_MS = 500;
    private readonly MIN_PROGRESS_DELTA = 0.5;

    constructor(
        private ytDlpExecutor: YtDlpExecutor,
        private queue: DownloadQueue,
        private logger: Logger,
        private onProgressUpdate: ProgressCallback,
        private onStatusChange: StatusCallback
    ) { }

    async execute(task: DownloadTask): Promise<void> {
        try {
            // Update status to downloading
            task.status = 'downloading';
            task.updatedAt = new Date();
            this.onStatusChange(task.id, 'downloading');

            this.logger.info('Starting download', {
                taskId: task.id,
                url: task.url,
                format: task.selectedFormat,
                quality: task.selectedQuality
            });

            // Start download with callbacks
            const pid = await this.ytDlpExecutor.startDownload(
                task.url,
                task.selectedFormat,
                task.selectedQuality,
                task.filePath,
                // Progress callback with throttling
                (progress: ProgressData) => {
                    // Always update task data (for internal state)
                    task.progress = progress.percentage;
                    task.speed = progress.speed;
                    task.eta = progress.eta;
                    task.updatedAt = new Date();

                    // Throttle UI updates to prevent ETA jumping
                    const now = Date.now();
                    const lastUpdate = this.lastProgressUpdateTime.get(task.id) || 0;
                    const lastProgress = this.lastProgressValue.get(task.id) || -1;
                    const timeSinceLastUpdate = now - lastUpdate;
                    const progressDelta = Math.abs(progress.percentage - lastProgress);

                    // Send UI update if:
                    // 1. Enough time has passed (500ms) AND progress changed by at least 0.5%
                    // 2. Progress is at 100% (completion)
                    // 3. This is the first update
                    // 4. Speed/ETA changed significantly (speed-based update)
                    const shouldUpdate =
                        (timeSinceLastUpdate >= this.PROGRESS_UPDATE_THROTTLE_MS && progressDelta >= this.MIN_PROGRESS_DELTA) ||
                        progress.percentage >= 100 ||
                        lastUpdate === 0;

                    if (shouldUpdate) {
                        this.lastProgressUpdateTime.set(task.id, now);
                        this.lastProgressValue.set(task.id, progress.percentage);
                        this.onProgressUpdate(task.id, progress);
                    }
                },
                // Error callback
                (error: string) => {
                    this.handleDownloadError(task, error);
                },
                // Complete callback with verified output metadata
                (metadata?: DownloadOutputMetadata) => {
                    this.handleDownloadComplete(task, metadata);
                },
                // Process ID changed (strategy retry or direct fallback)
                (pid: number) => {
                    task.processId = pid;
                },
                // Actual output path changed (ffmpeg-less audio fallback)
                (outputPath: string) => {
                    task.outputFilePath = outputPath;
                }
            );

            // Store process ID for pause/resume/cancel operations
            task.processId = pid;

            this.logger.info('Download process started', { taskId: task.id, pid });
        } catch (error) {
            this.logger.error('Failed to execute download', error as Error, { taskId: task.id });
            this.handleDownloadError(task, (error as Error).message);
        }
    }

    private handleDownloadComplete(task: DownloadTask, metadata?: DownloadOutputMetadata): void {
        task.status = 'completed';
        task.progress = 100;
        task.updatedAt = new Date();

        if (metadata) {
            task.outputFilePath = metadata.outputPath;
            task.actualWidth = metadata.width;
            task.actualHeight = metadata.height;
            task.actualResolution = metadata.resolution;
            task.actualQuality = metadata.qualityTier;
            task.actualVideoCodec = metadata.videoCodec;
            task.actualAudioCodec = metadata.audioCodec;
            task.actualContainer = metadata.container;
            task.verified = metadata.verified;
            task.hasAudio = metadata.hasAudio;
            task.qualityNote = metadata.warning;
        }

        this.onStatusChange(task.id, 'completed');

        // Clean up throttle tracking
        this.lastProgressUpdateTime.delete(task.id);

        this.logger.info('Download completed', {
            taskId: task.id,
            filePath: task.outputFilePath || task.filePath,
            requestedQuality: task.selectedQuality,
            actualResolution: task.actualResolution,
            actualQuality: task.actualQuality,
            videoCodec: task.actualVideoCodec,
            audioCodec: task.actualAudioCodec,
            container: task.actualContainer,
            verified: task.verified,
            warning: task.qualityNote
        });

        // Start next task in queue
        this.startNextTask();
    }

    private handleDownloadError(task: DownloadTask, error: string): void {
        task.errorMessage = error;
        task.updatedAt = new Date();

        // Clean up throttle tracking
        this.lastProgressUpdateTime.delete(task.id);
        this.lastProgressValue.delete(task.id);

        this.logger.error('Download error occurred', undefined, {
            taskId: task.id,
            error,
            retryCount: task.retryCount
        });

        // Check if should retry (max 3 attempts)
        if (task.retryCount < 3) {
            task.retryCount++;
            task.status = 'pending';
            task.progress = 0;
            task.speed = '0 B/s';
            task.eta = '--:--:--';
            task.processId = undefined; // Reset processId on retry
            task.actualWidth = undefined;
            task.actualHeight = undefined;
            task.actualResolution = undefined;
            task.actualQuality = undefined;
            task.actualVideoCodec = undefined;
            task.actualAudioCodec = undefined;
            task.actualContainer = undefined;
            task.verified = undefined;
            task.hasAudio = undefined;
            task.qualityNote = undefined;
            this.onStatusChange(task.id, 'pending');

            this.logger.info('Retrying download', {
                taskId: task.id,
                retryCount: task.retryCount,
                maxRetries: 3
            });

            // Add delay for network errors (5 seconds)
            if (this.isNetworkError(error)) {
                setTimeout(() => this.startNextTask(), 5000);
            } else {
                this.startNextTask();
            }
        } else {
            // Max retries reached, mark as error
            task.status = 'error';
            this.onStatusChange(task.id, 'error');

            this.logger.error('Download failed after max retries', undefined, {
                taskId: task.id,
                retryCount: task.retryCount
            });

            // Start next task
            this.startNextTask();
        }
    }

    private isNetworkError(error: string): boolean {
        const errorLower = error.toLowerCase();
        return (
            errorLower.includes('network') ||
            errorLower.includes('connection') ||
            errorLower.includes('timeout') ||
            errorLower.includes('enotfound') ||
            errorLower.includes('etimedout')
        );
    }

    private startNextTask(): void {
        // Check if we can start a new task
        if (this.queue.canStartNewTask()) {
            const nextTask = this.queue.getNextPendingTask();
            if (nextTask) {
                this.logger.info('Starting next task from queue', { taskId: nextTask.id });
                this.execute(nextTask);
            }
        }
    }
}
