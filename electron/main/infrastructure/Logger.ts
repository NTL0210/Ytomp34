import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export type LogLevel = 'info' | 'error' | 'debug';

/**
 * Logger interface
 * Provides structured logging with file rotation
 */
export interface Logger {
  info(message: string, meta?: Record<string, any>): void;
  error(message: string, error?: Error, meta?: Record<string, any>): void;
  debug(message: string, meta?: Record<string, any>): void;
}

/**
 * File-based logger implementation
 * - Logs to app data directory
 * - Rotates logs when they exceed 10MB
 * - Retains last 5 log files
 */
export class FileLogger implements Logger {
  private logDir: string;
  private currentLogFile: string;
  private readonly maxFileSize = 10 * 1024 * 1024; // 10MB
  private readonly maxFiles = 5;

  constructor() {
    // Get app data directory
    this.logDir = path.join(app.getPath('userData'), 'logs');
    
    // Ensure log directory exists
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
    
    // Set current log file
    this.currentLogFile = path.join(this.logDir, 'app.log');
    
    // Rotate if needed on startup
    this.rotateIfNeeded();
  }

  info(message: string, meta?: Record<string, any>): void {
    this.log('info', message, meta);
  }

  error(message: string, error?: Error, meta?: Record<string, any>): void {
    const errorMeta = error ? {
      ...meta,
      error: {
        message: error.message,
        stack: error.stack,
      }
    } : meta;
    
    this.log('error', message, errorMeta);
  }

  debug(message: string, meta?: Record<string, any>): void {
    this.log('debug', message, meta);
  }

  private log(level: LogLevel, message: string, meta?: Record<string, any>): void {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...(meta && { meta }),
    };
    
    const logLine = JSON.stringify(logEntry) + '\n';
    
    // Append to log file
    fs.appendFileSync(this.currentLogFile, logLine, 'utf-8');
    
    // Check if rotation needed
    this.rotateIfNeeded();
  }

  private rotateIfNeeded(): void {
    try {
      // Check if current log file exists and its size
      if (!fs.existsSync(this.currentLogFile)) {
        return;
      }
      
      const stats = fs.statSync(this.currentLogFile);
      
      if (stats.size >= this.maxFileSize) {
        this.rotate();
      }
    } catch (error) {
      // If rotation fails, continue logging to current file
      console.error('Log rotation failed:', error);
    }
  }

  private rotate(): void {
    // Get all existing log files
    const logFiles = fs.readdirSync(this.logDir)
      .filter(file => file.startsWith('app.log'))
      .sort()
      .reverse();
    
    // Delete oldest files if we have too many
    if (logFiles.length >= this.maxFiles) {
      const filesToDelete = logFiles.slice(this.maxFiles - 1);
      filesToDelete.forEach(file => {
        const filePath = path.join(this.logDir, file);
        try {
          fs.unlinkSync(filePath);
        } catch (error) {
          console.error(`Failed to delete old log file ${file}:`, error);
        }
      });
    }
    
    // Rename current log file with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rotatedFile = path.join(this.logDir, `app.log.${timestamp}`);
    
    try {
      fs.renameSync(this.currentLogFile, rotatedFile);
    } catch (error) {
      console.error('Failed to rotate log file:', error);
    }
  }
}
