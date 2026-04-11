# Electron Video Downloader

A production-ready Electron desktop application for downloading videos with local-first security.

## Features

- 🔒 Security-first architecture with URL validation and file scanning
- 📦 Local-first design - works offline (except for downloading)
- 🎨 Modern UI with dark/light theme support
- 🌍 Multi-language support (English/Vietnamese)
- ⚡ Built with Electron v28, TypeScript v5, and Vite v5

## Tech Stack

- **Electron** v28 - Desktop application framework
- **TypeScript** v5 - Type-safe development
- **Vite** v5 - Fast build tool and dev server
- **yt-dlp** - Video download engine
- **FFmpeg** - Audio/video processing

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run electron:dev

# Build TypeScript and Vite
npm run build

# Build for production (requires Developer Mode or Admin)
npm run electron:build:dir

# Run tests
npm test
```

### Known Issues

If you encounter symbolic link errors during build, see [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md) for solutions.

## Project Structure

```
src/
├── main/       # Main process (Node.js)
├── renderer/   # Renderer process (UI)
└── preload/    # Preload scripts (IPC bridge)
```

## Requirements

- Node.js v20 LTS
- Windows 10/11
- yt-dlp binary (will be bundled)
- FFmpeg binary (will be bundled)

## License

ISC

## Status

🚧 **In Development** - Phase 1: Core Infrastructure
