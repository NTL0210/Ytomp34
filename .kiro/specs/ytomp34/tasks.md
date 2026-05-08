# Implementation Plan: Ytomp34

## Overview

This implementation plan breaks down the Ytomp34 video downloader application into discrete coding tasks following Clean Architecture principles. The application is built with Electron.js, React, TypeScript, and TailwindCSS. Tasks are organized to build incrementally from domain entities through infrastructure services to application use cases and finally the UI layer. Each task includes property-based tests where applicable to validate correctness properties defined in the design.

## Tasks

- [x] 1. Project setup and configuration
  - Initialize project structure with all required directories
  - Configure TypeScript, TailwindCSS, Vite, and electron-builder
  - Set up package.json with all dependencies and scripts
  - Create configuration files (tsconfig.json, tailwind.config.js, vite.config.ts, postcss.config.js)
  - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5_

- [x] 2. Implement domain entities and value objects
  - [x] 2.1 Create domain value objects (DownloadStatus, Format, Quality types)
    - Define TypeScript types for DownloadStatus, FormatType, Theme, ErrorType
    - Create Format and Quality interfaces with readonly properties
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 2.2 Create Video entity
    - Implement Video interface with id, url, title, duration, thumbnailUrl, availableFormats
    - Ensure all properties are readonly
    - _Requirements: 2.2, 2.5_

  - [x] 2.3 Create DownloadTask entity
    - Implement DownloadTask interface with all required fields
    - Include status, progress, speed, eta, filePath, format, quality, retryCount
    - Add createdAt, updatedAt timestamps and optional processId
    - _Requirements: 4.1, 4.2, 4.5, 5.1, 6.1, 10.1_

  - [x] 2.4 Create Settings entity
    - Implement Settings interface with theme, downloadDirectory, concurrentLimit
    - _Requirements: 11.1, 11.2, 13.1, 21.1_

  - [x] 2.5 Create DownloadQueue entity
    - Implement DownloadQueue interface with tasks array and maxConcurrent
    - Add methods: addTask, removeTask, getNextPendingTask, getActiveTasksCount, canStartNewTask
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 3. Implement infrastructure services
  - [x] 3.1 Implement Logger service
    - Create Logger interface with info, error, debug methods
    - Implement file-based logging with timestamp and log level
    - Add log rotation when files exceed 10MB
    - Retain last 5 log files
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

  - [x] 3.2 Implement FileSanitizer service
    - Create FileSanitizer interface with sanitize and ensureUnique methods
    - Implement sanitize: remove invalid characters (< > : " / \ | ? *), trim whitespace, limit to 200 chars
    - Use "download" as fallback for empty filenames
    - Implement ensureUnique: append numeric suffix if file exists
    - _Requirements: 4.3, 4.4, 20.1, 20.2, 20.3, 20.4, 20.5_

  - [ ]* 3.3 Write property test for FileSanitizer
    - **Property 5: Filename Sanitization Safety**
    - **Validates: Requirements 4.3, 20.1, 20.2, 20.3, 20.4, 20.5**
    - Test that sanitized filenames contain no invalid characters, are trimmed, ≤200 chars, and non-empty

  - [ ]* 3.4 Write property test for unique filename generation
    - **Property 6: Unique Filename Generation**
    - **Validates: Requirements 4.4**
    - Test that ensureUnique produces unique filenames when files exist

  - [x] 3.5 Implement ProgressParser service
    - Create ProgressParser interface with parse and getLastKnown methods
    - Implement regex parsing for yt-dlp stdout format: [download] X% of Y at Z ETA HH:MM:SS
    - Return null if parsing fails, maintain last known values
    - _Requirements: 6.1, 6.2, 6.3_

  - [ ]* 3.6 Write property test for ProgressParser
    - **Property 8: Progress Parsing Robustness**
    - **Validates: Requirements 6.1, 6.2, 6.3**
    - Test that parser extracts valid progress data or returns defaults

  - [x] 3.7 Implement SettingsStore service
    - Create SettingsStore interface with load, save, validate methods
    - Implement JSON file persistence in app data directory
    - Create default settings if file doesn't exist (light theme, system Downloads dir, concurrent limit 3)
    - Validate theme values (light/dark), concurrentLimit range (1-10), directory writability
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 12.2, 12.3, 12.4, 21.2, 21.3_

  - [ ]* 3.8 Write property test for Settings validation
    - **Property 14: Settings Validation and Range Enforcement**
    - **Validates: Requirements 11.4, 21.2, 21.3**
    - Test that validator accepts only valid theme values, concurrentLimit in [1,10], and writable directories

  - [x] 3.9 Implement YtDlpExecutor service
    - Create YtDlpExecutor interface with checkInstallation, fetchMetadata, startDownload, pauseProcess, resumeProcess, cancelProcess methods
    - Implement checkInstallation: execute `yt-dlp --version` and parse result
    - Implement fetchMetadata: execute `yt-dlp --dump-json <url>` with 10s timeout
    - Implement startDownload: spawn yt-dlp process with format/quality params, capture stdout/stderr
    - Implement pause/resume using SIGSTOP/SIGCONT signals
    - Implement cancel using SIGTERM (5s timeout) then SIGKILL
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 8.1, 8.3, 9.1, 9.2, 22.1, 22.2_

  - [ ]* 3.10 Write property test for process spawn parameters
    - **Property 7: Process Spawn Parameter Correctness**
    - **Validates: Requirements 5.3**
    - Test that yt-dlp command includes correct format code and quality parameters

  - [x] 3.11 Implement QueuePersistence service
    - Create QueuePersistence class with save and load methods
    - Implement JSON serialization/deserialization for DownloadQueue
    - Persist queue state to disk every 5 seconds
    - _Requirements: 7.5_

  - [x] 3.12 Implement DownloadTaskParser for serialization
    - Create DownloadTaskParser class with toJSON and fromJSON static methods
    - Implement pretty-printed JSON serialization
    - Handle Date serialization/deserialization for createdAt and updatedAt
    - _Requirements: 24.1, 24.2, 24.3, 24.4, 24.5_

  - [ ]* 3.13 Write property test for serialization round-trip
    - **Property 20: Serialization Round-Trip Equivalence**
    - **Validates: Requirements 24.5**
    - Test that parsing then printing then parsing produces equivalent DownloadTask

  - [x] 3.14 Implement ErrorCategorizer utility
    - Create ErrorCategorizer class with categorize method
    - Categorize errors into: yt_dlp_missing, invalid_url, network_error, permission_error, unknown
    - Use error message patterns for categorization
    - _Requirements: 14.2, 23.1_

  - [ ]* 3.15 Write property test for error categorization
    - **Property 16: Error Categorization Accuracy**
    - **Validates: Requirements 14.2**
    - Test that errors are categorized into exactly one category

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement application use cases
  - [x] 5.1 Implement FetchVideoInfoUseCase
    - Create FetchVideoInfoUseCase class with execute method
    - Inject YtDlpExecutor and Logger dependencies
    - Validate URL format using URL parser
    - Check yt-dlp installation before fetching
    - Execute metadata fetch with 10s timeout
    - Return FetchVideoInfoResponse with success/error
    - Handle and categorize errors (invalid_url, yt_dlp_missing, network_error, unknown)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.6, 14.1, 14.2, 14.3, 14.4_

  - [ ]* 5.2 Write property test for URL validation
    - **Property 1: URL Validation Correctness**
    - **Validates: Requirements 1.1**
    - Test that validator returns true for valid URLs and false for invalid URLs

  - [ ]* 5.3 Write property test for metadata parsing
    - **Property 2: Video Metadata Parsing Completeness**
    - **Validates: Requirements 2.2**
    - Test that parser extracts all required fields from valid yt-dlp JSON

  - [x] 5.4 Implement CreateDownloadTaskUseCase
    - Create CreateDownloadTaskUseCase class with execute method
    - Inject DownloadQueue, FileSanitizer, SettingsStore, Logger dependencies
    - Load settings to get download directory
    - Sanitize video title and ensure unique filename
    - Create DownloadTask entity with unique ID, pending status, progress 0
    - Add task to queue
    - Return StartDownloadResponse with taskId or error
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ]* 5.5 Write property test for download task creation
    - **Property 4: Download Task Creation Integrity**
    - **Validates: Requirements 4.1, 4.2, 4.5**
    - Test that created tasks have unique ID, status "pending", progress 0, and correct parameters

  - [x] 5.6 Implement ExecuteDownloadUseCase
    - Create ExecuteDownloadUseCase class with execute method
    - Inject YtDlpExecutor, DownloadQueue, Logger, progress/status callbacks
    - Update task status to "downloading"
    - Start yt-dlp download with progress, error, and complete callbacks
    - Store process ID in task for pause/resume/cancel
    - Handle download completion: set status to "completed", progress to 100
    - Handle download errors: implement retry logic (up to 3 times)
    - Add 5s delay for network error retries
    - Start next pending task when current task completes/fails
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 6.4, 10.1, 10.2, 10.3, 10.4, 23.1, 23.2, 23.3, 23.4, 23.5_

  - [ ]* 5.7 Write property test for retry logic
    - **Property 13: Retry Logic with Counter**
    - **Validates: Requirements 10.2, 10.4**
    - Test that tasks retry up to 3 times and stop after max retries

  - [x] 5.8 Implement ManageQueueUseCase
    - Create ManageQueueUseCase class for queue operations
    - Implement FIFO queue processing logic
    - Enforce concurrent download limit (check before starting new tasks)
    - Implement pause: send SIGSTOP signal, update status to "paused"
    - Implement resume: send SIGCONT signal, update status to "downloading"
    - Implement cancel: terminate process (SIGTERM then SIGKILL), remove from queue, delete partial files
    - Start next pending task after cancel if limit allows
    - Persist queue state every 5 seconds
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.2, 8.3, 8.4, 9.1, 9.2, 9.3, 9.4, 9.5_

  - [ ]* 5.9 Write property test for FIFO queue ordering
    - **Property 9: FIFO Queue Ordering**
    - **Validates: Requirements 7.1**
    - Test that tasks are processed in exact order they were added

  - [ ]* 5.10 Write property test for concurrent limit enforcement
    - **Property 10: Concurrent Download Limit Enforcement**
    - **Validates: Requirements 7.2, 21.2, 21.4**
    - Test that active downloads never exceed configured limit

  - [ ]* 5.11 Write property test for state machine transitions
    - **Property 11: State Machine Transition Validity**
    - **Validates: Requirements 7.4**
    - Test that all status transitions follow valid state machine paths

  - [ ]* 5.12 Write property test for queue task removal
    - **Property 12: Queue Task Removal**
    - **Validates: Requirements 9.3**
    - Test that removing task by ID removes it from queue and decreases length by 1

  - [x] 5.13 Implement UpdateSettingsUseCase
    - Create UpdateSettingsUseCase class with execute method
    - Inject SettingsStore and Logger dependencies
    - Validate settings updates using SettingsStore.validate
    - Update settings in store
    - Apply theme changes immediately
    - Handle invalid download directory: fallback to system Downloads, show warning
    - Handle concurrent limit changes: allow running downloads to complete
    - Return UpdateSettingsResponse with updated settings or error
    - _Requirements: 11.1, 11.3, 11.4, 11.5, 11.6, 12.1, 12.2, 12.3, 12.4, 13.2, 13.3, 21.3, 21.5_

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement IPC layer
  - [x] 7.1 Create IPC contracts and types
    - Define all request/response interfaces for video, download, and settings operations
    - Create FetchVideoInfoRequest/Response, StartDownloadRequest/Response
    - Create PauseDownloadRequest/Response, ResumeDownloadRequest/Response, CancelDownloadRequest/Response
    - Create GetSettingsRequest/Response, UpdateSettingsRequest/Response, SelectFolderRequest/Response
    - Create event interfaces: ProgressUpdateEvent, QueueStateEvent
    - _Requirements: 16.3, 16.5_

  - [x] 7.2 Implement video IPC handlers
    - Create videoHandlers.ts with handler for 'video:fetch-info' channel
    - Validate incoming IPC messages for type and structure
    - Invoke FetchVideoInfoUseCase and return response
    - Handle errors gracefully, log and return error response
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.5, 14.5, 16.3, 16.5, 17.5_

  - [ ]* 7.3 Write property test for IPC message validation
    - **Property 18: IPC Message Validation**
    - **Validates: Requirements 16.3, 16.5**
    - Test that main process validates message structure and rejects invalid messages

  - [x] 7.4 Implement download IPC handlers
    - Create downloadHandlers.ts with handlers for download operations
    - Implement 'download:start' handler: validate request, invoke CreateDownloadTaskUseCase and ExecuteDownloadUseCase
    - Implement 'download:pause' handler: invoke ManageQueueUseCase.pause
    - Implement 'download:resume' handler: invoke ManageQueueUseCase.resume
    - Implement 'download:cancel' handler: invoke ManageQueueUseCase.cancel
    - Send 'download:progress' events to renderer at least once per second
    - Send 'download:queue-update' events when queue state changes
    - _Requirements: 4.1, 4.2, 5.1, 6.4, 6.5, 8.5, 9.1_

  - [x] 7.5 Implement settings IPC handlers
    - Create settingsHandlers.ts with handlers for settings operations
    - Implement 'settings:get' handler: invoke SettingsStore.load
    - Implement 'settings:update' handler: invoke UpdateSettingsUseCase
    - Implement 'settings:select-folder' handler: open native folder dialog, verify write permissions
    - _Requirements: 11.1, 11.3, 11.4, 12.1, 12.2, 12.3, 12.4, 12.5_

  - [x] 7.6 Implement preload script with contextBridge
    - Create electron/preload/index.ts
    - Use contextBridge.exposeInMainWorld to expose safe API
    - Expose methods: fetchVideoInfo, startDownload, pauseDownload, resumeDownload, cancelDownload
    - Expose methods: getSettings, updateSettings, selectFolder
    - Expose event listeners: onProgressUpdate, onQueueUpdate, removeAllListeners
    - Add TypeScript declarations for window.electronAPI
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5_

  - [x] 7.7 Implement Electron main process entry point
    - Create electron/main/index.ts
    - Configure BrowserWindow with contextIsolation=true, nodeIntegration=false
    - Set up preload script path
    - Register all IPC handlers (video, download, settings)
    - Initialize dependency injection container
    - Check yt-dlp installation on startup, show warning if not found
    - Load settings and restore queue state from disk
    - Display main window within 2 seconds
    - _Requirements: 16.1, 16.2, 22.1, 22.2, 22.3, 22.4, 22.5_

  - [ ]* 7.8 Write property test for error resilience
    - **Property 17: Error Resilience (No Crash)**
    - **Validates: Requirements 14.5**
    - Test that application handles errors gracefully without crashing

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement React UI components
  - [x] 9.1 Create Zustand store
    - Create renderer/src/store/useAppStore.ts
    - Define AppState interface with currentVideo, downloadQueue, settings, isLoading, error
    - Implement state setters: setCurrentVideo, setDownloadQueue, updateTask, removeTask
    - Implement settings setters: setSettings, updateSetting
    - Implement UI state setters: setLoading, setError
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_

  - [x] 9.2 Create useIPC custom hook
    - Create renderer/src/hooks/useIPC.ts
    - Wrap window.electronAPI methods in React hooks
    - Set up IPC event listeners in useEffect
    - Update Zustand store when IPC events received
    - Clean up listeners on unmount
    - _Requirements: 17.3, 17.4_

  - [ ]* 9.3 Write property test for state updates from IPC
    - **Property 19: State Update from IPC Events**
    - **Validates: Requirements 17.3**
    - Test that Zustand store updates correctly when IPC events received

  - [x] 9.4 Create ThemeToggle component
    - Create renderer/src/components/ThemeToggle.tsx
    - Display light/dark theme toggle button using lucide-react icons (Sun/Moon)
    - Apply TailwindCSS classes for styling
    - Update theme in Zustand store and call updateSettings IPC
    - Apply theme class to document root immediately
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 18.1, 18.2, 18.4_

  - [x] 9.5 Create URLInput component
    - Create renderer/src/components/URLInput.tsx
    - Display input field for URL entry with lucide-react icons
    - Validate URL on input change
    - Display error message for invalid URLs
    - Enable "Fetch Info" button only for valid URLs
    - Call fetchVideoInfo IPC on button click
    - Show loading state while fetching
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 18.1, 18.2, 18.3, 18.4, 18.5_

  - [x] 9.6 Create VideoInfo component
    - Create renderer/src/components/VideoInfo.tsx
    - Display video title, duration, and thumbnail from currentVideo state
    - Format duration as HH:MM:SS
    - Use TailwindCSS for responsive layout
    - Show placeholder when no video loaded
    - _Requirements: 2.5, 18.1, 18.2, 18.3, 18.4, 18.5_

  - [x] 9.7 Create FormatSelector component
    - Create renderer/src/components/FormatSelector.tsx
    - Display MP4 and MP3 format options using lucide-react icons
    - Display quality options based on selected format (video qualities for MP4, audio bitrates for MP3)
    - Default to highest available quality
    - Update quality options when format changes
    - Use TailwindCSS for styling
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 18.1, 18.2, 18.3, 18.4, 18.5_

  - [ ]* 9.8 Write property test for default quality selection
    - **Property 3: Default Quality Selection**
    - **Validates: Requirements 3.4**
    - Test that FormatSelector defaults to highest quality for selected format

  - [x] 9.9 Create DownloadItem component
    - Create renderer/src/components/DownloadItem.tsx
    - Display download task with title, progress bar, speed, ETA, status
    - Show pause/resume/cancel buttons using lucide-react icons based on status
    - Display retry count for error status
    - Update progress bar within 100ms of receiving progress event
    - Call pause/resume/cancel IPC methods on button clicks
    - Use TailwindCSS for styling and responsive layout
    - _Requirements: 6.5, 6.6, 8.5, 9.1, 10.5, 18.1, 18.2, 18.3, 18.4, 18.5_

  - [x] 9.10 Create DownloadQueue component
    - Create renderer/src/components/DownloadQueue.tsx
    - Display list of DownloadItem components from downloadQueue state
    - Show empty state when queue is empty
    - Use TailwindCSS for layout
    - _Requirements: 7.1, 7.2, 18.1, 18.2, 18.3, 18.4, 18.5_

  - [x] 9.11 Create Settings component
    - Create renderer/src/components/Settings.tsx
    - Display current download directory path
    - Show "Select Folder" button to change download directory using lucide-react icons
    - Display concurrent download limit slider (1-10)
    - Call selectFolder and updateSettings IPC methods
    - Display error messages for invalid settings
    - Use TailwindCSS for form styling
    - _Requirements: 11.4, 12.1, 12.2, 12.3, 12.4, 12.5, 21.1, 21.2, 21.3, 21.4, 21.5, 18.1, 18.2, 18.3, 18.4, 18.5_

  - [x] 9.12 Create main App component
    - Create renderer/src/App.tsx
    - Compose all components: ThemeToggle, URLInput, VideoInfo, FormatSelector, DownloadQueue, Settings
    - Implement minimalist layout with clean design
    - Apply theme classes from Zustand store
    - Ensure responsive behavior for different window sizes
    - Display error notifications from store.error
    - Use TailwindCSS for overall layout
    - _Requirements: 13.3, 13.4, 14.3, 18.1, 18.2, 18.3, 18.4, 18.5_

  - [x] 9.13 Create renderer entry point
    - Create renderer/index.html with root div
    - Create renderer/src/main.tsx to render App component
    - Import TailwindCSS styles
    - Set up React 18 root rendering
    - _Requirements: 18.4_

- [x] 10. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Integration and wiring
  - [x] 11.1 Wire dependency injection container
    - Register all infrastructure services in container
    - Register all use cases with injected dependencies
    - Ensure proper initialization order
    - _Requirements: 25.1, 25.2_

  - [x] 11.2 Connect IPC handlers to use cases
    - Wire video handlers to FetchVideoInfoUseCase
    - Wire download handlers to CreateDownloadTaskUseCase, ExecuteDownloadUseCase, ManageQueueUseCase
    - Wire settings handlers to UpdateSettingsUseCase
    - Set up progress and queue update event emitters
    - _Requirements: 25.1, 25.2, 25.3, 25.4_

  - [x] 11.3 Connect React components to IPC
    - Wire useIPC hook to all components
    - Ensure Zustand store updates from IPC events
    - Test end-to-end flow: URL input → metadata fetch → format selection → download → progress → completion
    - _Requirements: 17.3, 17.4, 25.1, 25.2, 25.3, 25.4_

  - [ ]* 11.4 Write integration tests for end-to-end flows
    - Test complete download flow from URL input to completion
    - Test pause/resume/cancel operations
    - Test settings updates
    - Test error handling and retry logic
    - Test queue management with concurrent downloads

- [x] 12. Error handling and logging
  - [x] 12.1 Implement error display in UI
    - Create error notification component
    - Display user-friendly error messages from ERROR_MESSAGES map
    - Show actionable guidance for common errors
    - Include links for yt-dlp installation when needed
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

  - [x] 12.2 Verify logging throughout application
    - Ensure all errors logged with timestamp, type, stack trace
    - Verify log rotation at 10MB
    - Verify retention of last 5 log files
    - Test log file creation in app data directory
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

  - [x] 12.3 Test graceful degradation scenarios
    - Test app behavior when yt-dlp not installed (show warning, allow settings)
    - Test fallback to system Downloads when configured directory invalid
    - Test error recovery without app crash
    - _Requirements: 11.6, 14.5, 22.2_

- [x] 13. Build configuration and packaging
  - [x] 13.1 Configure electron-builder
    - Create electron-builder.json with Windows targets (NSIS + portable)
    - Configure NSIS installer options (custom directory, shortcuts)
    - Configure portable executable options
    - Set app metadata (name, version, description, author)
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5_

  - [x] 13.2 Create application icon
    - Create icon.ico file (256x256) in assets directory
    - Configure icon paths in electron-builder.json
    - _Requirements: 19.1_

  - [x] 13.3 Test build process
    - Run build:renderer to compile React app
    - Run build:electron to compile main process
    - Run build:win to create NSIS installer and portable executable
    - Verify both artifacts are created in dist/ directory
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5_

  - [ ]* 13.4 Test installer and portable executable
    - Install using NSIS installer, verify shortcuts created
    - Run portable executable, verify settings stored in executable directory
    - Test uninstaller
    - Verify app data locations

- [x] 14. Final testing and polish
  - [x] 14.1 Run full test suite
    - Run all unit tests
    - Run all property-based tests (20 properties)
    - Run all integration tests
    - Verify 80%+ code coverage
    - _Requirements: All_

  - [x] 14.2 Manual testing of critical flows
    - Test URL input → metadata → download → completion flow
    - Test pause/resume/cancel operations
    - Test concurrent downloads with different limits
    - Test retry logic with network errors
    - Test theme switching
    - Test settings persistence across restarts
    - Test queue persistence and restoration
    - _Requirements: All_

  - [x] 14.3 Performance and UX testing
    - Verify app starts within 2 seconds
    - Verify metadata fetch completes within 10 seconds
    - Verify progress updates at least once per second
    - Verify UI updates within 100ms of progress events
    - Test responsive behavior at different window sizes
    - _Requirements: 2.6, 6.4, 6.6, 22.5_

  - [x] 14.4 Security verification
    - Verify contextIsolation=true and nodeIntegration=false
    - Verify IPC message validation
    - Verify no sensitive data in logs
    - Test with malformed IPC messages
    - _Requirements: 16.1, 16.2, 16.3, 16.5_

- [x] 15. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional property-based tests and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- Integration tests verify external dependencies (yt-dlp, file system, IPC)
- The implementation follows Clean Architecture with strict layer separation
- TypeScript is used throughout for type safety
- All 20 correctness properties from the design are covered by property test sub-tasks
