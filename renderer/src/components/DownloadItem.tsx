/**
 * DownloadItem Component
 * Displays download task with progress bar, speed, ETA, status
 * Shows pause/resume/cancel buttons based on status
 * Displays retry count for error status
 * Validates: Requirements 6.5, 6.6, 8.5, 9.1, 10.5, 18.1, 18.2, 18.3, 18.4, 18.5
 */

import React from 'react';
import { Pause, Play, X, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { useIPC } from '../hooks/useIPC';

interface DownloadTask {
  readonly id: string;
  readonly url: string;
  readonly videoTitle: string;
  status: 'pending' | 'downloading' | 'paused' | 'completed' | 'error';
  progress: number;
  speed: string;
  eta: string;
  readonly filePath: string;
  readonly selectedFormat: 'mp4' | 'mp3';
  readonly selectedQuality: string;
  retryCount: number;
  errorMessage?: string;
  readonly createdAt: Date;
  updatedAt: Date;
  processId?: number;
}

interface DownloadItemProps {
  task: DownloadTask;
}

export const DownloadItem: React.FC<DownloadItemProps> = ({ task }) => {
  const { pauseDownload, resumeDownload, cancelDownload } = useIPC();

  const handlePause = () => {
    pauseDownload(task.id);
  };

  const handleResume = () => {
    resumeDownload(task.id);
  };

  const handleCancel = () => {
    cancelDownload(task.id);
  };

  // Get status icon and color
  const getStatusDisplay = () => {
    switch (task.status) {
      case 'completed':
        return {
          icon: <CheckCircle className="w-5 h-5 text-green-600" />,
          color: 'text-green-600 dark:text-green-400',
          label: 'Completed',
        };
      case 'error':
        return {
          icon: <AlertCircle className="w-5 h-5 text-red-600" />,
          color: 'text-red-600 dark:text-red-400',
          label: `Error (Retry ${task.retryCount}/3)`,
        };
      case 'paused':
        return {
          icon: <Pause className="w-5 h-5 text-yellow-600" />,
          color: 'text-yellow-600 dark:text-yellow-400',
          label: 'Paused',
        };
      case 'pending':
        return {
          icon: <Clock className="w-5 h-5 text-gray-600" />,
          color: 'text-gray-600 dark:text-gray-400',
          label: 'Pending',
        };
      case 'downloading':
      default:
        return {
          icon: null,
          color: 'text-blue-600 dark:text-blue-400',
          label: 'Downloading',
        };
    }
  };

  const statusDisplay = getStatusDisplay();

  return (
    <div className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
            {task.videoTitle}
          </h4>
          <div className="flex items-center gap-2 mt-1">
            {statusDisplay.icon}
            <span className={`text-xs font-medium ${statusDisplay.color}`}>
              {statusDisplay.label}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {task.selectedFormat.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-1">
          {task.status === 'downloading' && (
            <button
              onClick={handlePause}
              className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              aria-label="Pause download"
            >
              <Pause className="w-4 h-4 text-gray-700 dark:text-gray-300" />
            </button>
          )}
          
          {task.status === 'paused' && (
            <button
              onClick={handleResume}
              className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              aria-label="Resume download"
            >
              <Play className="w-4 h-4 text-gray-700 dark:text-gray-300" />
            </button>
          )}
          
          {(task.status === 'downloading' || task.status === 'paused' || task.status === 'pending') && (
            <button
              onClick={handleCancel}
              className="p-2 rounded-lg bg-red-100 dark:bg-red-900/20 hover:bg-red-200 dark:hover:bg-red-900/30 transition-colors"
              aria-label="Cancel download"
            >
              <X className="w-4 h-4 text-red-600 dark:text-red-400" />
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {(task.status === 'downloading' || task.status === 'paused' || task.status === 'pending') && (
        <div className="mb-2">
          <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 dark:bg-blue-500 transition-all duration-300"
              style={{ width: `${task.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Progress details */}
      {task.status === 'downloading' && (
        <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
          <span>{task.progress.toFixed(1)}%</span>
          <span>{task.speed}</span>
          <span>ETA: {task.eta}</span>
        </div>
      )}

      {/* Error message */}
      {task.status === 'error' && task.errorMessage && (
        <div className="mt-2 text-xs text-red-600 dark:text-red-400">
          {task.errorMessage}
        </div>
      )}
    </div>
  );
};
