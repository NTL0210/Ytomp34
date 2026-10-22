/**
 * Infrastructure services
 * External dependencies and implementations
 */
export { Logger, FileLogger } from './Logger';
export { FileSanitizer, FileSanitizerImpl } from './FileSanitizer';
export { ProgressParser, ProgressParserImpl, ProgressData } from './ProgressParser';
export { SettingsStore, SettingsStoreImpl } from './SettingsStore';
export { YtDlpExecutor, YtDlpExecutorImpl } from './YtDlpExecutor';
export { setCookieConfig, CookieConfig } from './YtDlpExecutor';
export { QueuePersistence } from './QueuePersistence';
export { DownloadTaskParser } from './DownloadTaskParser';
export { ErrorCategorizer } from './ErrorCategorizer';
export {
  YtDlpInstaller,
  MIN_SUPPORTED_YT_DLP_VERSION,
  RECOMMENDED_YT_DLP_VERSION,
  isYtDlpVersionOlderThan
} from './YtDlpInstaller';
export { FfmpegInstaller, FfmpegAvailability } from './FfmpegInstaller';
export {
  ExtractionStrategy,
  VideoFormatPlan,
  buildExtractionStrategies,
  buildPlayerClientArgs,
  buildVideoFormatSelector,
  buildVideoFormatPlans,
  buildAudioDownloadPlan,
  parseVideoQualityHeight,
  isBotCheckError,
  isCookieAccessError,
  isToolMissingError,
  isFfmpegError,
  isDirectMediaUrl,
  getDirectMediaExtension,
  isYouTubeUrl,
  replaceOutputExtension
} from './ExtractionStrategies';
export {
  DownloadOutputMetadata,
  MediaInspection,
  buildResolutionReport,
  formatDimensions,
  getFfprobeCommand,
  getQualityTier,
  inspectMediaFile,
  parseFfprobeOutput
} from './MediaInspector';
export { downloadDirectMedia, DirectMediaDownloadOptions, DirectMediaDownloadResult } from './DirectMediaDownloader';
export {
  ToolCandidate,
  ResolvedTool,
  buildYtDlpCandidates,
  testToolCandidate,
  resolveFirstRunnableTool
} from './ToolLocator';
export { DenoInstaller, getDenoReleaseAsset } from './DenoInstaller';
export { getSquirrelAction, handleSquirrelStartup } from './SquirrelStartup';
export {
  AppUpdateService,
  AppUpdateState,
  AppUpdateStatus,
  isNewerVersion,
  parseVersion
} from './AppUpdateService';
