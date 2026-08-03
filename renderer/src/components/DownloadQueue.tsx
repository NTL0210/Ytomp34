/**
 * DownloadQueue Component
 * Displays list of DownloadItem components
 * Shows empty state when queue is empty
 * Validates: Requirements 7.1, 7.2, 18.1, 18.2, 18.3, 18.4, 18.5
 */

import React, { useMemo, useState } from 'react';
import { Download, History, Trash2 } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useIPC } from '../hooks/useIPC';
import { DownloadItem } from './DownloadItem';

export const DownloadQueue: React.FC = () => {
  const { downloadQueue } = useAppStore();
  const { clearCompleted } = useIPC();
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  const activeTasks = useMemo(
    () => downloadQueue.filter(task => task.status !== 'completed'),
    [downloadQueue]
  );
  const historyTasks = useMemo(
    () => downloadQueue
      .filter(task => task.status === 'completed')
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [downloadQueue]
  );

  if (downloadQueue.length === 0) {
    return (
      <div className="w-full p-8 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg flex flex-col items-center justify-center text-gray-400 dark:text-gray-500">
        <Download className="w-12 h-12 mb-2" />
        <p className="text-sm">No downloads in queue</p>
        <p className="text-xs">Start a download to see it here</p>
      </div>
    );
  }

  const visibleTasks = activeTab === 'active' ? activeTasks : historyTasks;

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
        <div className="inline-flex p-1 bg-gray-100 dark:bg-gray-800 rounded-lg self-start">
          <button
            type="button"
            onClick={() => setActiveTab('active')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'active'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            <Download className="w-4 h-4" />
            Active ({activeTasks.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'history'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            <History className="w-4 h-4" />
            History ({historyTasks.length})
          </button>
        </div>

        {activeTab === 'history' && historyTasks.length > 0 && (
          <button
            type="button"
            onClick={() => clearCompleted()}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors self-start"
            title="Clear history records without deleting downloaded files"
          >
            <Trash2 className="w-4 h-4" />
            Clear completed
          </button>
        )}
      </div>

      {visibleTasks.length === 0 ? (
        <div className="w-full p-6 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-center text-gray-400 dark:text-gray-500">
          <p className="text-sm">
            {activeTab === 'active' ? 'No active downloads' : 'No completed downloads yet'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visibleTasks.map(task => (
            <DownloadItem key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  );
};
