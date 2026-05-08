/**
 * DownloadQueue Component
 * Displays list of DownloadItem components
 * Shows empty state when queue is empty
 * Validates: Requirements 7.1, 7.2, 18.1, 18.2, 18.3, 18.4, 18.5
 */

import React from 'react';
import { Download } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { DownloadItem } from './DownloadItem';

export const DownloadQueue: React.FC = () => {
  const { downloadQueue } = useAppStore();

  if (downloadQueue.length === 0) {
    return (
      <div className="w-full p-8 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg flex flex-col items-center justify-center text-gray-400 dark:text-gray-500">
        <Download className="w-12 h-12 mb-2" />
        <p className="text-sm">No downloads in queue</p>
        <p className="text-xs">Start a download to see it here</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Download Queue
        </h3>
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {downloadQueue.length} {downloadQueue.length === 1 ? 'item' : 'items'}
        </span>
      </div>
      
      <div className="space-y-2">
        {downloadQueue.map((task) => (
          <DownloadItem key={task.id} task={task} />
        ))}
      </div>
    </div>
  );
};
