import { app } from 'electron';
import { join } from 'path';
import { promises as fs } from 'fs';
import { existsSync, statSync } from 'fs';

/**
 * Logger Service
 * Provides async logging with file rotation and multiple log levels
 * Requirements: REQ-FUN-023.1, REQ-FUN-023.2, REQ-FUN-023.3
 */

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  context: string;
  message: string;
  data?: any;
}

class LoggerService {
  private logDir: string;
  private currentLogFile: string;
  private writeQueue: LogEntry[] = [];
  private isWriting: boolean = false;
  private readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  private readonly BATCH_WRITE_DELAY = 100; // 100ms
  private writeTimer: NodeJS.Timeout | null = null;

  constructor() {
    // Initialize log directory path
    this.logDir = app.getPath('logs');
    this.currentLogFile = this.getLogFilePath();
    this.initializeLogDirectory();
  }

  /**
   * Initialize log directory and ensure it exists
   */
  private async initializeLogDirectory(): Promise<void> {
    try {
      if (!existsSync(this.logDir)) {
        await fs.mkdir(this.logDir, { recursive: true });
      }
    } catch (error) {
      console.error('[Logger] Failed to create log directory:', error);
      // Fallback to console logging only
    }
  }

  /**
   * Get current log file path with timestamp
   */
  private getLogFilePath(): string {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return join(this.logDir, `app-${date}.log`);
  }

  /**
   * Format log entry as string
   */
  private formatLogEntry(entry: LogEntry): string {
    const dataStr = entry.data ? ` | ${JSON.stringify(entry.data)}` : '';
    return `[${entry.timestamp}] [${entry.level}] [${entry.context}] ${entry.message}${dataStr}\n`;
  }

  /**
   * Check if current log file needs rotation
   */
  private async checkRotation(): Promise<void> {
    try {
      if (existsSync(this.currentLogFile)) {
        const stats = statSync(this.currentLogFile);
        if (stats.size >= this.MAX_FILE_SIZE) {
          // Rotate: rename current file with timestamp
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const rotatedFile = this.currentLogFile.replace('.log', `-${timestamp}.log`);
          await fs.rename(this.currentLogFile, rotatedFile);
          
          // Update current log file path
          this.currentLogFile = this.getLogFilePath();
        }
      }
    } catch (error) {
      console.error('[Logger] Failed to rotate log file:', error);
    }
  }

  /**
   * Write queued log entries to file asynchronously
   */
  private async flushQueue(): Promise<void> {
    if (this.isWriting || this.writeQueue.length === 0) {
      return;
    }

    this.isWriting = true;

    try {
      // Check if rotation is needed
      await this.checkRotation();

      // Get all queued entries
      const entries = [...this.writeQueue];
      this.writeQueue = [];

      // Format all entries
      const logContent = entries.map(entry => this.formatLogEntry(entry)).join('');

      // Write to file asynchronously
      await fs.appendFile(this.currentLogFile, logContent, 'utf8');
    } catch (error) {
      console.error('[Logger] Failed to write logs:', error);
      // Re-queue failed entries
      this.writeQueue.unshift(...this.writeQueue);
    } finally {
      this.isWriting = false;

      // If there are more entries, schedule another flush
      if (this.writeQueue.length > 0) {
        this.scheduleFlush();
      }
    }
  }

  /**
   * Schedule a flush operation with debouncing
   */
  private scheduleFlush(): void {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
    }

    this.writeTimer = setTimeout(() => {
      this.flushQueue();
    }, this.BATCH_WRITE_DELAY);
  }

  /**
   * Add log entry to queue
   */
  private log(level: LogLevel, context: string, message: string, data?: any): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      context,
      message,
      data,
    };

    // Add to queue
    this.writeQueue.push(entry);

    // Also log to console for immediate feedback
    const consoleMethod = level === LogLevel.ERROR ? console.error : 
                         level === LogLevel.WARNING ? console.warn : 
                         console.log;
    consoleMethod(`[${entry.level}] [${context}] ${message}`, data || '');

    // Schedule async write
    this.scheduleFlush();
  }

  /**
   * Log DEBUG level message
   */
  public debug(context: string, message: string, data?: any): void {
    this.log(LogLevel.DEBUG, context, message, data);
  }

  /**
   * Log INFO level message
   */
  public info(context: string, message: string, data?: any): void {
    this.log(LogLevel.INFO, context, message, data);
  }

  /**
   * Log WARNING level message
   */
  public warning(context: string, message: string, data?: any): void {
    this.log(LogLevel.WARNING, context, message, data);
  }

  /**
   * Log ERROR level message
   */
  public error(context: string, message: string, data?: any): void {
    this.log(LogLevel.ERROR, context, message, data);
  }

  /**
   * Force flush all pending logs immediately
   * Should be called before app quit
   */
  public async flush(): Promise<void> {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    await this.flushQueue();
  }

  /**
   * Get log directory path
   */
  public getLogDirectory(): string {
    return this.logDir;
  }

  /**
   * Get current log file path
   */
  public getCurrentLogFile(): string {
    return this.currentLogFile;
  }
}

// Export singleton instance
export const logger = new LoggerService();
