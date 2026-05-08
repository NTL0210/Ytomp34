/**
 * Settings Component
 * Displays download directory path and concurrent limit slider
 * Shows "Select Folder" button to change download directory
 * Validates: Requirements 11.4, 12.1, 12.2, 12.3, 12.4, 12.5, 21.1, 21.2, 21.3, 21.4, 21.5, 18.1, 18.2, 18.3, 18.4, 18.5
 */

import React, { useState } from 'react';
import { Folder, Settings as SettingsIcon } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useIPC } from '../hooks/useIPC';

export const Settings: React.FC = () => {
  const { settings } = useAppStore();
  const { selectFolder, updateSettings } = useIPC();
  const [isOpen, setIsOpen] = useState(false);

  const handleConcurrentLimitChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    updateSettings({ concurrentLimit: value });
  };

  return (
    <div className="w-full">
      {/* Settings toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-gray-800 dark:text-gray-200"
      >
        <SettingsIcon className="w-5 h-5" />
        <span className="font-medium">Settings</span>
      </button>

      {/* Settings panel */}
      {isOpen && (
        <div className="mt-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-4">
          {/* Download directory */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Download Directory
            </label>
            <div className="flex gap-2">
              <div className="flex-1 flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 text-sm">
                <Folder className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{settings.downloadDirectory || 'Not set'}</span>
              </div>
              <button
                onClick={selectFolder}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium whitespace-nowrap"
              >
                Select Folder
              </button>
            </div>
          </div>

          {/* Concurrent download limit */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Concurrent Downloads: {settings.concurrentLimit}
            </label>
            <input
              type="range"
              min="1"
              max="10"
              value={settings.concurrentLimit}
              onChange={handleConcurrentLimitChange}
              className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
              <span>1</span>
              <span>5</span>
              <span>10</span>
            </div>
          </div>

          {/* Info text */}
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Concurrent downloads control how many files download simultaneously. Higher values may use more bandwidth and system resources.
          </p>
        </div>
      )}
    </div>
  );
};
