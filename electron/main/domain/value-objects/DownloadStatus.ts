/**
 * Download task status type
 * Represents the current state of a download task in the state machine
 */
export type DownloadStatus = 
  | 'pending'      // Task is queued, waiting to start
  | 'downloading'  // Task is actively downloading
  | 'paused'       // Task is paused by user
  | 'completed'    // Task completed successfully
  | 'error';       // Task failed (may retry if retryCount < 3)
