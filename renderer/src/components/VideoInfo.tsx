/**
 * VideoInfo Component
 * Displays video title, duration (HH:MM:SS), and thumbnail
 * Shows placeholder when no video loaded
 * Validates: Requirements 2.5, 18.1, 18.2, 18.3, 18.4, 18.5
 */

import React from 'react';
import { Video } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

export const VideoInfo: React.FC = () => {
  const { currentVideo } = useAppStore();

  // Format duration from seconds to HH:MM:SS
  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    return [hours, minutes, secs]
      .map(v => v.toString().padStart(2, '0'))
      .join(':');
  };

  if (!currentVideo) {
    return (
      <div className="w-full p-8 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg flex flex-col items-center justify-center text-gray-400 dark:text-gray-500">
        <Video className="w-12 h-12 mb-2" />
        <p className="text-sm">No video loaded</p>
        <p className="text-xs">Enter a URL and click "Fetch Info" to get started</p>
      </div>
    );
  }

  return (
    <div className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <div className="flex flex-col md:flex-row gap-4 p-4">
        {/* Thumbnail */}
        <div className="flex-shrink-0">
          <img
            src={currentVideo.thumbnailUrl}
            alt={currentVideo.title}
            className="w-full md:w-48 h-auto rounded-lg object-cover"
            onError={(e) => {
              // Fallback if thumbnail fails to load
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>
        
        {/* Video details */}
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2 truncate">
            {currentVideo.title}
          </h3>
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <span className="font-medium">Duration:</span>
            <span>{formatDuration(currentVideo.duration)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
