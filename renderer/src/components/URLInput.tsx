/**
 * URLInput Component
 * Displays input field for URL entry with validation
 * Shows error message for invalid URLs
 * Enables button only for valid URLs
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 18.1, 18.2, 18.3, 18.4, 18.5
 */

import React, { useState } from 'react';
import { Link, AlertCircle } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useIPC } from '../hooks/useIPC';

export const URLInput: React.FC = () => {
  const [url, setUrl] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const { isLoading } = useAppStore();
  const { fetchVideoInfo } = useIPC();

  // Validate URL format
  const isValidUrl = (urlString: string): boolean => {
    if (!urlString.trim()) return false;
    
    try {
      new URL(urlString);
      return true;
    } catch {
      return false;
    }
  };

  // Handle URL input change
  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value;
    setUrl(newUrl);
    
    // Clear error when user starts typing
    if (urlError) {
      setUrlError(null);
    }
  };

  // Handle fetch button click
  const handleFetch = async () => {
    if (!isValidUrl(url)) {
      setUrlError('Please enter a valid URL');
      return;
    }
    
    setUrlError(null);
    await fetchVideoInfo(url);
  };

  // Handle Enter key press
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && isValidUrl(url) && !isLoading) {
      handleFetch();
    }
  };

  const isValid = isValidUrl(url);

  return (
    <div className="w-full space-y-2">
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2">
            <Link className="w-5 h-5 text-gray-400" />
          </div>
          <input
            type="text"
            value={url}
            onChange={handleUrlChange}
            onKeyPress={handleKeyPress}
            placeholder="Enter video URL..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
        </div>
        <button
          onClick={handleFetch}
          disabled={!isValid || isLoading}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {isLoading ? 'Loading...' : 'Fetch Info'}
        </button>
      </div>
      
      {urlError && (
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
          <AlertCircle className="w-4 h-4" />
          <span>{urlError}</span>
        </div>
      )}
    </div>
  );
};
