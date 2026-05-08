/**
 * FormatSelector Component
 * Displays MP4 and MP3 format options with quality selection
 * Defaults to highest available quality
 * Updates quality options when format changes
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 18.1, 18.2, 18.3, 18.4, 18.5
 */

import React, { useState, useEffect } from 'react';
import { FileVideo, Music } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useIPC } from '../hooks/useIPC';

export const FormatSelector: React.FC = () => {
  const { currentVideo, isLoading } = useAppStore();
  const { startDownload } = useIPC();
  
  const [selectedFormat, setSelectedFormat] = useState<'mp4' | 'mp3'>('mp4');
  const [selectedQuality, setSelectedQuality] = useState<string>('');

  // Get available qualities for selected format
  const getAvailableQualities = () => {
    if (!currentVideo) return [];
    
    const format = currentVideo.availableFormats.find(f => f.type === selectedFormat);
    return format?.qualities || [];
  };

  // Update selected quality when format changes or video loads
  useEffect(() => {
    const qualities = getAvailableQualities();
    
    if (qualities.length > 0) {
      // Default to highest quality (first in array)
      setSelectedQuality(qualities[0].value);
    }
  }, [selectedFormat, currentVideo]);

  const handleFormatChange = (format: 'mp4' | 'mp3') => {
    setSelectedFormat(format);
  };

  const handleDownload = async () => {
    if (!currentVideo || !selectedQuality) return;
    
    await startDownload(
      currentVideo.url,
      currentVideo.title,
      selectedFormat,
      selectedQuality
    );
  };

  const availableQualities = getAvailableQualities();
  const canDownload = currentVideo && selectedQuality && !isLoading;

  if (!currentVideo) {
    return null;
  }

  return (
    <div className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-4">
      {/* Format selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Format
        </label>
        <div className="flex gap-2">
          <button
            onClick={() => handleFormatChange('mp4')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-colors ${
              selectedFormat === 'mp4'
                ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500'
            }`}
          >
            <FileVideo className="w-5 h-5" />
            <span className="font-medium">MP4 (Video)</span>
          </button>
          <button
            onClick={() => handleFormatChange('mp3')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-colors ${
              selectedFormat === 'mp3'
                ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500'
            }`}
          >
            <Music className="w-5 h-5" />
            <span className="font-medium">MP3 (Audio)</span>
          </button>
        </div>
      </div>

      {/* Quality selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Quality
        </label>
        <select
          value={selectedQuality}
          onChange={(e) => setSelectedQuality(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {availableQualities.map((quality) => (
            <option key={quality.value} value={quality.value}>
              {quality.label}
            </option>
          ))}
        </select>
      </div>

      {/* Download button */}
      <button
        onClick={handleDownload}
        disabled={!canDownload}
        className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
      >
        {isLoading ? 'Starting...' : 'Download'}
      </button>
    </div>
  );
};
