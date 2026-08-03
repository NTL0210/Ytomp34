export type AppUpdateState =
  | 'idle'
  | 'development'
  | 'unsupported'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface AppUpdateStatus {
  state: AppUpdateState;
  currentVersion: string;
  latestVersion?: string;
  releaseName?: string;
  releaseNotes?: string;
  publishedAt?: string;
  releaseUrl?: string;
  error?: string;
}

export interface AppUpdateResponse {
  success: boolean;
  data: AppUpdateStatus;
}
