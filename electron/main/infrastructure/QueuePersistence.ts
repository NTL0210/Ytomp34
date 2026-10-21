import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { DownloadQueue, DownloadTask } from '../domain/entities';

interface PersistedQueue {
    id: string;
    maxConcurrent: number;
    tasks: DownloadTask[];
}

/**
 * QueuePersistence service
 * Persists and restores download queue state
 * Uses atomic writes to prevent corruption
 */
export class QueuePersistence {
    private queueFile: string;
    private tempQueueFile: string;
    // Serializes concurrent saves so the shared temp file is never written
    // by two saves at the same time (issue: queue corruption on concurrent writes).
    private saveChain: Promise<void> = Promise.resolve();

    private static readonly LOAD_TIMEOUT_MS = 5000;

    constructor() {
        const userDataPath = app.getPath('userData');
        this.queueFile = path.join(userDataPath, 'queue.json');
        this.tempQueueFile = path.join(userDataPath, 'queue.json.tmp');
    }

    async save(queue: DownloadQueue): Promise<void> {
        const run = this.saveChain.then(() => this.writeAtomic(queue));
        // Keep the chain alive even if a save fails; the error is still
        // propagated to the caller of this specific save.
        this.saveChain = run.catch(() => undefined);
        await run;
    }

    private async writeAtomic(queue: DownloadQueue): Promise<void> {
        const data = {
            id: queue.id,
            maxConcurrent: queue.maxConcurrent,
            tasks: queue.tasks
        };

        const json = JSON.stringify(data, null, 2);
        // Atomic write: write to temp file first, then rename
        await fs.promises.writeFile(this.tempQueueFile, json, 'utf-8');
        await fs.promises.rename(this.tempQueueFile, this.queueFile);
    }

    async load(): Promise<PersistedQueue | null> {
        // Never block startup longer than the timeout on a corrupted/huge file.
        return Promise.race([
            this.doLoad(),
            new Promise<null>(resolve => {
                const timer = setTimeout(() => resolve(null), QueuePersistence.LOAD_TIMEOUT_MS);
                // Do not keep the process alive just for this timer.
                (timer as NodeJS.Timeout).unref?.();
            })
        ]);
    }

    private async doLoad(): Promise<PersistedQueue | null> {
        try {
            if (!fs.existsSync(this.queueFile)) {
                return null;
            }

            const data = await this.readFileWithTimeout(this.queueFile, 5000); // 5 second timeout
            const parsed = JSON.parse(data) as PersistedQueue;

            // Validate parsed data structure
            if (!this.validatePersistedQueue(parsed)) {
                console.error('QueuePersistence: Invalid queue data structure, ignoring');
                return null;
            }

            return parsed;
        } catch (error) {
            console.error('QueuePersistence: Failed to load queue, starting fresh:', error);
            return null;
        }
    }

    private readFileWithTimeout(filePath: string, timeoutMs: number): Promise<string> {
        return Promise.race([
            fs.promises.readFile(filePath, 'utf-8'),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error(`Queue load timeout after ${timeoutMs}ms`)), timeoutMs)
            )
        ]);
    }

    private validatePersistedQueue(data: unknown): data is PersistedQueue {
        if (typeof data !== 'object' || data === null) return false;

        const queue = data as Record<string, unknown>;

        if (typeof queue.id !== 'string') return false;
        if (typeof queue.maxConcurrent !== 'number' || queue.maxConcurrent < 1 || queue.maxConcurrent > 10) return false;
        if (!Array.isArray(queue.tasks)) return false;

        // Validate each task has required fields
        for (const task of queue.tasks) {
            if (typeof task !== 'object' || task === null) return false;
            const t = task as Record<string, unknown>;
            if (typeof t.id !== 'string') return false;
            if (typeof t.url !== 'string') return false;
            if (typeof t.videoTitle !== 'string') return false;
            if (!['pending', 'downloading', 'paused', 'completed', 'error'].includes(t.status as string)) return false;
            if (typeof t.progress !== 'number') return false;
            if (typeof t.filePath !== 'string') return false;
            if (!['mp4', 'mp3'].includes(t.selectedFormat as string)) return false;
            if (typeof t.selectedQuality !== 'string') return false;
            if (typeof t.retryCount !== 'number') return false;
            if (typeof t.createdAt !== 'string') return false;
            if (typeof t.updatedAt !== 'string') return false;
        }

        return true;
    }
}
