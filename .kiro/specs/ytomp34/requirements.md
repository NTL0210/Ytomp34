# Requirements Document - Ytomp34

## Introduction

Ytomp34 is a cross-platform desktop application built with Electron.js that enables users to download videos and audio from online sources using yt-dlp. The application provides a minimalist user interface with queue management, format selection, progress tracking, and persistent settings. The system follows Clean Architecture principles with strict layer separation between presentation, application, domain, and infrastructure layers.

## Glossary

- **Application**: The Electron main process containing business logic and use cases
- **Renderer**: The Electron renderer process containing the React UI
- **Video_Metadata**: Information about a video including title, duration, available formats, and thumbnail
- **Download_Task**: A domain entity representing a single download operation with state, progress, and metadata
- **Download_Queue**: A FIFO queue managing multiple download tasks with concurrency control
- **yt-dlp**: External command-line tool for downloading videos and extracting metadata
- **IPC_Channel**: Inter-process communication channel between main and renderer processes
- **Settings_Store**: Persistent storage for user preferences including theme and download directory
- **Format_Selector**: Component allowing users to choose between MP4 (video) and MP3 (audio) formats
- **Progress_Parser**: Component that extracts progress, speed, and ETA from yt-dlp stdout
- **File_Sanitizer**: Component that removes invalid characters from filenames
- **State_Machine**: Download task state transitions (pending → downloading → completed/error/paused)

## Requirements

### Requirement 1: URL Input and Validation

**User Story:** As a user, I want to input a video URL and have it validated, so that I can ensure the URL is processable before attempting download.

#### Acceptance Criteria

1. WHEN a user inputs a URL, THE Application SHALL validate the URL format using a URL parser
2. IF the URL format is invalid, THEN THE Application SHALL display an error message to the user
3. WHEN a valid URL is submitted, THE Application SHALL enable the metadata fetch action
4. THE Application SHALL accept URLs from supported video platforms (YouTube, Vimeo, and other yt-dlp compatible sources)

### Requirement 2: Video Metadata Extraction

**User Story:** As a user, I want to see video information before downloading, so that I can verify I'm downloading the correct content.

#### Acceptance Criteria

1. WHEN a valid URL is provided, THE Application SHALL execute `yt-dlp --dump-json` to extract Video_Metadata
2. THE Application SHALL parse the JSON output and extract title, duration, thumbnail URL, and available formats
3. IF yt-dlp is not installed, THEN THE Application SHALL display an error message with installation instructions
4. IF yt-dlp execution fails, THEN THE Application SHALL display the error message from yt-dlp stderr
5. WHEN Video_Metadata is successfully extracted, THE Renderer SHALL display the title, duration, and thumbnail to the user
6. THE Application SHALL complete metadata extraction within 10 seconds or timeout with an error message

### Requirement 3: Format and Quality Selection

**User Story:** As a user, I want to select the output format and quality, so that I can download content in my preferred format.

#### Acceptance Criteria

1. WHEN Video_Metadata is available, THE Format_Selector SHALL display MP4 and MP3 format options
2. WHERE MP4 format is selected, THE Format_Selector SHALL display available video quality options (e.g., 1080p, 720p, 480p)
3. WHERE MP3 format is selected, THE Format_Selector SHALL display available audio bitrate options (e.g., 320kbps, 192kbps, 128kbps)
4. THE Format_Selector SHALL default to the highest available quality for the selected format
5. WHEN a user changes format selection, THE Format_Selector SHALL update the available quality options accordingly

### Requirement 4: Download Task Creation

**User Story:** As a user, I want to start a download with my selected format and quality, so that I can obtain the video or audio file.

#### Acceptance Criteria

1. WHEN a user initiates a download, THE Application SHALL create a Download_Task with a unique ID, URL, selected format, quality, and status "pending"
2. THE Application SHALL add the Download_Task to the Download_Queue
3. THE Application SHALL sanitize the video title using the File_Sanitizer to create a valid filename
4. IF a file with the same name exists in the download directory, THEN THE File_Sanitizer SHALL append a numeric suffix (e.g., "video (1).mp4")
5. THE Application SHALL store the target file path in the Download_Task

### Requirement 5: Download Execution

**User Story:** As a user, I want my downloads to execute automatically from the queue, so that I can download multiple videos without manual intervention.

#### Acceptance Criteria

1. WHEN a Download_Task enters the Download_Queue with status "pending", THE Application SHALL check the concurrent download limit
2. IF the number of active downloads is below the concurrent limit, THEN THE Application SHALL transition the Download_Task status to "downloading" and start execution
3. THE Application SHALL execute yt-dlp using `child_process.spawn` with the selected format and quality parameters
4. THE Application SHALL capture stdout from yt-dlp and pass it to the Progress_Parser
5. THE Application SHALL capture stderr from yt-dlp for error handling
6. WHEN yt-dlp process exits with code 0, THE Application SHALL transition the Download_Task status to "completed"
7. IF yt-dlp process exits with a non-zero code, THEN THE Application SHALL transition the Download_Task status to "error" and store the error message

### Requirement 6: Progress Tracking and Reporting

**User Story:** As a user, I want to see real-time download progress, so that I can monitor the download status.

#### Acceptance Criteria

1. WHILE a Download_Task status is "downloading", THE Progress_Parser SHALL parse yt-dlp stdout using regex patterns
2. THE Progress_Parser SHALL extract progress percentage, download speed, and estimated time remaining (ETA)
3. IF a progress value cannot be parsed, THEN THE Progress_Parser SHALL use the last known value or default to 0
4. THE Application SHALL send progress updates to the Renderer via IPC_Channel at least once per second
5. THE Renderer SHALL display progress percentage, speed, and ETA for each active Download_Task
6. THE Renderer SHALL update the progress display within 100ms of receiving an IPC progress event

### Requirement 7: Download Queue Management

**User Story:** As a user, I want downloads to be managed in a queue with automatic progression, so that multiple downloads can proceed efficiently.

#### Acceptance Criteria

1. THE Download_Queue SHALL process Download_Tasks in FIFO (first-in-first-out) order
2. THE Download_Queue SHALL enforce a configurable maximum concurrent download limit (default: 3)
3. WHEN a Download_Task completes or fails, THE Download_Queue SHALL automatically start the next pending Download_Task if available
4. THE Download_Queue SHALL maintain the State_Machine transitions for each Download_Task
5. THE Application SHALL persist the Download_Queue state to disk every 5 seconds to enable recovery after application restart

### Requirement 8: Download Pause and Resume

**User Story:** As a user, I want to pause and resume downloads, so that I can manage bandwidth and system resources.

#### Acceptance Criteria

1. WHEN a user requests to pause a Download_Task with status "downloading", THE Application SHALL send a SIGSTOP signal to the yt-dlp process
2. THE Application SHALL transition the Download_Task status from "downloading" to "paused"
3. WHEN a user requests to resume a Download_Task with status "paused", THE Application SHALL send a SIGCONT signal to the yt-dlp process
4. THE Application SHALL transition the Download_Task status from "paused" to "downloading"
5. THE Renderer SHALL display pause and resume controls only for Download_Tasks with status "downloading" or "paused"

### Requirement 9: Download Cancellation

**User Story:** As a user, I want to cancel downloads, so that I can remove unwanted downloads from the queue.

#### Acceptance Criteria

1. WHEN a user requests to cancel a Download_Task, THE Application SHALL terminate the yt-dlp process using SIGTERM
2. IF the process does not terminate within 5 seconds, THEN THE Application SHALL force termination using SIGKILL
3. THE Application SHALL remove the Download_Task from the Download_Queue
4. THE Application SHALL delete any partially downloaded files associated with the cancelled Download_Task
5. THE Application SHALL start the next pending Download_Task if the concurrent download limit allows

### Requirement 10: Download Retry System

**User Story:** As a user, I want failed downloads to be automatically retried, so that transient errors don't require manual intervention.

#### Acceptance Criteria

1. WHEN a Download_Task transitions to status "error", THE Application SHALL check the retry count
2. IF the retry count is less than 3, THEN THE Application SHALL increment the retry count and transition the Download_Task status back to "pending"
3. THE Application SHALL add the retried Download_Task to the end of the Download_Queue
4. IF the retry count reaches 3, THEN THE Application SHALL keep the Download_Task status as "error" and not retry
5. THE Renderer SHALL display the retry count for Download_Tasks with status "error"

### Requirement 11: Settings Management

**User Story:** As a user, I want to configure application settings, so that I can customize the application behavior to my preferences.

#### Acceptance Criteria

1. THE Settings_Store SHALL persist user settings including theme (light/dark) and download directory path
2. WHEN the application starts, THE Application SHALL load settings from the Settings_Store
3. IF the Settings_Store file does not exist, THEN THE Application SHALL create default settings with light theme and system Downloads directory
4. WHEN a user changes a setting, THE Application SHALL validate the new value and update the Settings_Store
5. THE Application SHALL apply theme changes immediately without requiring application restart
6. IF the configured download directory is invalid or inaccessible, THEN THE Application SHALL fall back to the system Downloads directory and display a warning

### Requirement 12: Download Directory Selection

**User Story:** As a user, I want to choose where downloaded files are saved, so that I can organize my downloads.

#### Acceptance Criteria

1. WHEN a user requests to change the download directory, THE Application SHALL open a native folder selection dialog
2. WHEN a user selects a folder, THE Application SHALL verify write permissions for the selected directory
3. IF the directory is writable, THEN THE Application SHALL update the download directory in the Settings_Store
4. IF the directory is not writable, THEN THE Application SHALL display an error message and keep the previous directory setting
5. THE Renderer SHALL display the current download directory path in the settings interface

### Requirement 13: Theme System

**User Story:** As a user, I want to switch between light and dark themes, so that I can use the application comfortably in different lighting conditions.

#### Acceptance Criteria

1. THE Renderer SHALL support exactly two themes: light (white background) and dark (black background)
2. WHEN a user selects a theme, THE Application SHALL update the theme setting in the Settings_Store
3. THE Renderer SHALL apply the selected theme to all UI components immediately
4. THE Renderer SHALL use TailwindCSS classes for theme styling
5. THE Renderer SHALL persist the theme selection across application restarts

### Requirement 14: Error Handling and User Feedback

**User Story:** As a user, I want clear error messages when something goes wrong, so that I can understand and resolve issues.

#### Acceptance Criteria

1. WHEN an error occurs, THE Application SHALL log the error with timestamp, error type, and stack trace
2. THE Application SHALL categorize errors as: yt-dlp missing, invalid URL, network error, permission error, or unknown error
3. THE Renderer SHALL display user-friendly error messages corresponding to each error category
4. THE Renderer SHALL provide actionable guidance for resolving common errors (e.g., "Install yt-dlp" with a link)
5. THE Application SHALL NOT crash when an error occurs; it SHALL handle the error gracefully and continue operation

### Requirement 15: Logging System

**User Story:** As a developer, I want comprehensive application logs, so that I can debug issues and monitor application behavior.

#### Acceptance Criteria

1. THE Application SHALL implement a logging system with three levels: info, error, and debug
2. THE Application SHALL write logs to a local file in the application data directory
3. THE Application SHALL include timestamp, log level, and message in each log entry
4. THE Application SHALL rotate log files when they exceed 10MB in size
5. THE Application SHALL retain the last 5 log files and delete older files

### Requirement 16: IPC Security

**User Story:** As a developer, I want secure inter-process communication, so that the application is protected from security vulnerabilities.

#### Acceptance Criteria

1. THE Application SHALL set `contextIsolation` to true in the Electron BrowserWindow configuration
2. THE Application SHALL set `nodeIntegration` to false in the Electron BrowserWindow configuration
3. THE Application SHALL validate all IPC message inputs for type and structure before processing
4. THE Application SHALL use a preload script to expose only necessary APIs to the Renderer
5. THE Application SHALL reject IPC messages with invalid or unexpected structure

### Requirement 17: State Management in Renderer

**User Story:** As a developer, I want centralized state management in the UI, so that the application state is predictable and maintainable.

#### Acceptance Criteria

1. THE Renderer SHALL use Zustand or Redux for state management
2. THE Renderer SHALL maintain state for: currentVideo (Video_Metadata), downloadQueue (array of Download_Tasks), and settings
3. WHEN an IPC event is received, THE Renderer SHALL update the corresponding state
4. THE Renderer SHALL derive UI state from the centralized state store
5. THE Renderer SHALL NOT store application state in React component local state except for UI-only state (e.g., modal open/closed)

### Requirement 18: UI Component Structure

**User Story:** As a developer, I want a clean UI component structure, so that the interface is maintainable and follows best practices.

#### Acceptance Criteria

1. THE Renderer SHALL use lucide-react for all icons (NO emoji)
2. THE Renderer SHALL implement a minimalist design with clean layout and responsive behavior
3. THE Renderer SHALL separate UI components into: URLInput, VideoInfo, FormatSelector, DownloadQueue, DownloadItem, Settings, and ThemeToggle
4. THE Renderer SHALL use TailwindCSS for all styling
5. THE Renderer SHALL ensure all components are responsive and work on different window sizes

### Requirement 19: Build System Configuration

**User Story:** As a developer, I want automated build configuration, so that I can create distributable installers and portable executables.

#### Acceptance Criteria

1. THE Application SHALL use electron-builder for creating distribution packages
2. WHERE the target platform is Windows, THE Application SHALL generate both NSIS installer (.exe) and portable executable
3. THE NSIS installer SHALL include install and uninstall functionality and create desktop shortcuts
4. THE portable executable SHALL run without installation and store settings in the executable directory
5. THE Application SHALL include application metadata (name, version, description, author) in the build configuration

### Requirement 20: Filename Sanitization

**User Story:** As a user, I want downloaded files to have valid filenames, so that files are saved correctly on my operating system.

#### Acceptance Criteria

1. WHEN creating a filename from a video title, THE File_Sanitizer SHALL remove or replace invalid characters: `< > : " / \ | ? *`
2. THE File_Sanitizer SHALL replace invalid characters with underscores or remove them
3. THE File_Sanitizer SHALL trim leading and trailing whitespace from filenames
4. THE File_Sanitizer SHALL limit filename length to 200 characters (excluding extension)
5. IF the sanitized filename is empty, THEN THE File_Sanitizer SHALL use a default filename "download" with appropriate extension

### Requirement 21: Concurrent Download Limit Configuration

**User Story:** As a user, I want to configure how many downloads run simultaneously, so that I can balance download speed and system resources.

#### Acceptance Criteria

1. THE Settings_Store SHALL include a concurrent download limit setting with a default value of 3
2. THE Settings_Store SHALL enforce a minimum concurrent download limit of 1 and maximum of 10
3. WHEN a user changes the concurrent download limit, THE Application SHALL validate the value is within the allowed range
4. THE Download_Queue SHALL respect the configured concurrent download limit when starting new downloads
5. WHEN the concurrent download limit is decreased, THE Application SHALL allow currently running downloads to complete but not start new downloads until the count is below the new limit

### Requirement 22: Application Initialization

**User Story:** As a user, I want the application to start quickly and reliably, so that I can begin using it without delays.

#### Acceptance Criteria

1. WHEN the application starts, THE Application SHALL verify yt-dlp is installed by executing `yt-dlp --version`
2. IF yt-dlp is not found, THEN THE Application SHALL display a warning message with installation instructions but continue to run
3. THE Application SHALL load settings from the Settings_Store within 1 second of startup
4. THE Application SHALL restore the Download_Queue state from disk if available
5. THE Application SHALL display the main window within 2 seconds of application launch

### Requirement 23: Network Error Handling

**User Story:** As a user, I want the application to handle network errors gracefully, so that temporary connectivity issues don't cause permanent failures.

#### Acceptance Criteria

1. WHEN yt-dlp reports a network error, THE Application SHALL categorize it as a network error (not a generic error)
2. THE Application SHALL include network errors in the retry system (up to 3 retries)
3. THE Renderer SHALL display a specific message for network errors indicating the issue is connectivity-related
4. THE Application SHALL wait 5 seconds before retrying a Download_Task that failed due to network error
5. IF all retries fail due to network errors, THEN THE Application SHALL keep the Download_Task in "error" status with a message suggesting checking internet connection

### Requirement 24: Parser and Pretty Printer for Download Task State

**User Story:** As a developer, I want to serialize and deserialize Download_Task state, so that the queue can be persisted and restored.

#### Acceptance Criteria

1. THE Application SHALL implement a Download_Task parser that converts JSON to Download_Task objects
2. THE Application SHALL implement a Download_Task pretty printer that converts Download_Task objects to formatted JSON
3. WHEN the Download_Queue is persisted, THE Application SHALL use the pretty printer to format all Download_Tasks as JSON
4. WHEN the application starts, THE Application SHALL use the parser to restore Download_Tasks from the persisted JSON
5. FOR ALL valid Download_Task objects, parsing then printing then parsing SHALL produce an equivalent object (round-trip property)

### Requirement 25: Future Extensibility Architecture

**User Story:** As a developer, I want the architecture to support future features, so that the application can grow without major refactoring.

#### Acceptance Criteria

1. THE Application SHALL use dependency injection to provide infrastructure services to use cases
2. THE Application SHALL define interfaces for external dependencies (yt-dlp executor, file system, storage) to enable mocking and future replacement
3. THE Domain layer SHALL contain only pure entities with no external dependencies
4. THE Application layer SHALL orchestrate use cases without direct dependencies on infrastructure implementation details
5. THE Architecture SHALL support adding new download sources (playlist, subtitle) by extending use cases without modifying domain entities

