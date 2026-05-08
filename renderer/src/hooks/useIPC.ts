/**
 * useIPC Custom Hook
 * Wraps window.electronAPI methods and sets up IPC event listeners
 * Updates Zustand store when IPC events are received
 * Validates: Requirements 17.3, 17.4
 */

import { useEffect, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';

export const useIPC = () => {
  const {
    setCurrentVideo,
    setDownloadQueue,
    updateTask,
    setSettings,
    setLoading,
    setError,
  } = useAppStore();

  // Set up IPC event listeners
  useEffect(() => {
    // Listen for progress updates
    const cleanupProgress = window.electronAPI.onProgressUpdate((data) => {
      updateTask(data.taskId, {
        progress: data.progress,
        speed: data.speed,
        eta: data.eta,
        status: data.status,
        updatedAt: new Date(),
      });
    });

    // Listen for queue state updates
    const cleanupQueue = window.electronAPI.onQueueUpdate((data) => {
      setDownloadQueue(data.tasks);
    });

    // Cleanup listeners on unmount
    return () => {
      cleanupProgress();
      cleanupQueue();
    };
  }, [updateTask, setDownloadQueue]);

  // Fetch video info
  const fetchVideoInfo = async (url: string) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await window.electronAPI.fetchVideoInfo(url);
      
      if (response.success && response.data) {
        setCurrentVideo(response.data);
      } else if (response.error) {
        setError({ type: response.error.type, message: response.error.message });
      }
    } catch (error) {
      setError({ type: 'unknown', message: 'Failed to fetch video information' });
    } finally {
      setLoading(false);
    }
  };

  // Start download
  const startDownload = async (
    url: string,
    videoTitle: string,
    format: 'mp4' | 'mp3',
    quality: string
  ) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await window.electronAPI.startDownload(
        url,
        videoTitle,
        format,
        quality
      );
      
      if (!response.success && response.error) {
        setError({ type: response.error.type, message: response.error.message });
      }
    } catch (error) {
      setError({ type: 'unknown', message: 'Failed to start download' });
    } finally {
      setLoading(false);
    }
  };

  // Pause download
  const pauseDownload = async (taskId: string) => {
    try {
      const response = await window.electronAPI.pauseDownload(taskId);
      
      if (!response.success && response.error) {
        setError({ type: 'unknown', message: response.error });
      }
    } catch (error) {
      setError({ type: 'unknown', message: 'Failed to pause download' });
    }
  };

  // Resume download
  const resumeDownload = async (taskId: string) => {
    try {
      const response = await window.electronAPI.resumeDownload(taskId);
      
      if (!response.success && response.error) {
        setError({ type: 'unknown', message: response.error });
      }
    } catch (error) {
      setError({ type: 'unknown', message: 'Failed to resume download' });
    }
  };

  // Cancel download
  const cancelDownload = async (taskId: string) => {
    try {
      const response = await window.electronAPI.cancelDownload(taskId);
      
      if (!response.success && response.error) {
        setError({ type: 'unknown', message: response.error });
      }
    } catch (error) {
      setError({ type: 'unknown', message: 'Failed to cancel download' });
    }
  };

  // Get settings
  const getSettings = useCallback(async () => {
    try {
      console.log('Calling electronAPI.getSettings()...');
      const response = await window.electronAPI.getSettings();
      console.log('getSettings response:', response);
      
      if (response.success && response.data) {
        setSettings(response.data);
        console.log('Settings set successfully:', response.data);
        // Don't set error here - let App.tsx handle it
      } else {
        console.error('getSettings failed:', response);
        throw new Error('Failed to load settings from main process');
      }
    } catch (error) {
      console.error('getSettings error:', error);
      throw error; // Re-throw to let caller handle
    }
  }, [setSettings]);

  // Update settings
  const updateSettings = async (settings: {
    theme?: 'light' | 'dark';
    downloadDirectory?: string;
    concurrentLimit?: number;
  }) => {
    try {
      const response = await window.electronAPI.updateSettings(settings);
      
      if (response.success && response.data) {
        setSettings(response.data);
      } else if (response.error) {
        setError({ type: 'permission_error', message: response.error });
      }
    } catch (error) {
      setError({ type: 'unknown', message: 'Failed to update settings' });
    }
  };

  // Select folder
  const selectFolder = async () => {
    try {
      const response = await window.electronAPI.selectFolder();
      
      if (response.success && response.path) {
        await updateSettings({ downloadDirectory: response.path });
      }
    } catch (error) {
      setError({ type: 'unknown', message: 'Failed to select folder' });
    }
  };

  return {
    fetchVideoInfo,
    startDownload,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    getSettings,
    updateSettings,
    selectFolder,
  };
};
