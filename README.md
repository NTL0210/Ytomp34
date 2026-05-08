# Ytomp34

Cross-platform video/audio downloader with queue management built with Electron.js, React, and TypeScript.

## Features

- Download videos and audio from 1000+ sites (YouTube, Vimeo, etc.)
- MP4 and MP3 format support with quality selection
- Queue management with concurrent downloads
- Pause, resume, and cancel downloads
- Automatic retry on failure (up to 3 attempts)
- Light and dark themes
- Persistent settings and queue state

## Prerequisites

- Node.js 18.x or higher
- npm 9.x or higher
- yt-dlp (required for downloading)

## Installation

### 1. Install dependencies

```bash
npm install
```

### 2. Install yt-dlp

**Using Scoop (Recommended):**
```powershell
scoop install yt-dlp
```

**Using Chocolatey:**
```powershell
choco install yt-dlp
```

**Manual:** Download from https://github.com/yt-dlp/yt-dlp/releases

## Development

```bash
# Run in development mode
npm run dev

# Run tests
npm test

# Run property-based tests
npm run test:property

# Lint code
npm run lint
```

## Building

```bash
# Build for Windows (NSIS installer + portable)
npm run build:win
```

Output will be in `dist/` directory:
- `Ytomp34-1.0.0-x64.exe` - NSIS installer
- `Ytomp34-1.0.0-portable.exe` - Portable executable

## Architecture

The application follows Clean Architecture principles:

- **Domain Layer**: Pure entities (Video, DownloadTask, Settings, Queue)
- **Infrastructure Layer**: External services (YtDlpExecutor, Logger, FileSanitizer, etc.)
- **Application Layer**: Use cases (FetchVideoInfo, ExecuteDownload, ManageQueue, etc.)
- **Presentation Layer**: React UI components with Zustand state management

## Tech Stack

- **Runtime**: Electron.js
- **UI**: React 18 + TailwindCSS
- **State Management**: Zustand
- **Icons**: lucide-react
- **Language**: TypeScript
- **Build**: Vite + electron-builder
- **Testing**: Jest + fast-check (property-based testing)

## License

MIT
