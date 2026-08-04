/**
 * Infrastructure services
 * External dependencies and implementations
 */
export { Logger, FileLogger } from './Logger';
export { FileSanitizer, FileSanitizerImpl } from './FileSanitizer';
export { ProgressParser, ProgressParserImpl, ProgressData } from './ProgressParser';
export { SettingsStore, SettingsStoreImpl } from './SettingsStore';
export { YtDlpExecutor, YtDlpExecutorImpl } from './YtDlpExecutor';
export { QueuePersistence } from './QueuePersistence';
export { DownloadTaskParser } from './DownloadTaskParser';
export { ErrorCategorizer } from './ErrorCategorizer';
export {
  YtDlpInstaller,
  MIN_SUPPORTED_YT_DLP_VERSION,
  isYtDlpVersionOlderThan
} from './YtDlpInstaller';
export { FfmpegInstaller } from './FfmpegInstaller';
export { getSquirrelAction, handleSquirrelStartup } from './SquirrelStartup';
export {
  AppUpdateService,
  AppUpdateState,
  AppUpdateStatus,
  isNewerVersion,
  parseVersion
} from './AppUpdateService';
