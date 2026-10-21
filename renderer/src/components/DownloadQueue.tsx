/**
 * DownloadQueue Component
 * Displays list of DownloadItem components
 * Shows empty state when queue is empty
 * Validates: Requirements 7.1, 7.2, 18.1, 18.2, 18.3, 18.4, 18.5
 */

import React, { useMemo, useState } from 'react';
import { Download, History, Trash2, AlertCircle } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useIPC } from '../hooks/useIPC';
import { DownloadItem } from './DownloadItem';

export const DownloadQueue: React.FC = () => {
    const { downloadQueue } = useAppStore();
    const { clearCompleted, deleteCompletedFiles } = useIPC();
    const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
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

    const handleClearHistory = async () => {
        await clearCompleted();
    };

    const handleDeleteFiles = async () => {
        await deleteCompletedFiles();
        setShowDeleteConfirm(false);
    };

    return (
        <div className="w-full space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
                <div className="inline-flex p-1 bg-gray-100 dark:bg-gray-800 rounded-lg self-start">
                    <button
                        type="button"
                        onClick={() => setActiveTab('active')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'active'
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
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'history'
                            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                            : 'text-gray-600 dark:text-gray-400'
                            }`}
                    >
                        <History className="w-4 h-4" />
                        History ({historyTasks.length})
                    </button>
                </div>

                {activeTab === 'history' && historyTasks.length > 0 && (
                    <div className="flex gap-2 self-start">
                        <button
                            type="button"
                            onClick={() => setShowDeleteConfirm(true)}
                            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                            title="Permanently delete downloaded files AND clear history"
                        >
                            <Trash2 className="w-4 h-4" />
                            Delete files
                        </button>
                        <button
                            type="button"
                            onClick={handleClearHistory}
                            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                            title="Clear history records (keeps downloaded files)"
                        >
                            <History className="w-4 h-4" />
                            Clear history
                        </button>
                    </div>
                )}
            </div>

            {/* Delete files confirmation dialog */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full">
                                <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
                            </div>
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                Delete downloaded files?
                            </h3>
                        </div>
                        <p className="text-gray-600 dark:text-gray-300 mb-6">
                            This will permanently delete <strong>{historyTasks.length} downloaded file(s)</strong> from your disk
                            and remove them from history. This action cannot be undone.
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteFiles}
                                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                            >
                                Delete files
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
