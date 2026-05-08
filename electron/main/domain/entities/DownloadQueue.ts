import { DownloadTask } from './DownloadTask';

/**
 * DownloadQueue entity
 * Manages multiple download tasks with FIFO ordering and concurrency control
 */
export interface DownloadQueue {
  readonly id: string;              // Unique queue identifier
  tasks: DownloadTask[];            // Array of download tasks
  maxConcurrent: number;            // Maximum concurrent downloads (mutable for settings updates)
  
  /**
   * Add a task to the queue
   */
  addTask(task: DownloadTask): void;
  
  /**
   * Remove a task from the queue by ID
   */
  removeTask(taskId: string): void;
  
  /**
   * Get the next pending task (FIFO order)
   * Returns null if no pending tasks
   */
  getNextPendingTask(): DownloadTask | null;
  
  /**
   * Get count of active (downloading) tasks
   */
  getActiveTasksCount(): number;
  
  /**
   * Check if a new task can be started
   * Returns true if active count < maxConcurrent
   */
  canStartNewTask(): boolean;
}
