# Ytomp34 - Video Downloader

<div align="center">

![Ytomp34 Logo](assets/icon.ico)

**A production-ready, cross-platform video/audio downloader built with Electron.js**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Electron](https://img.shields.io/badge/Electron-28.3.3-blue.svg)](https://www.electronjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.x-blue.svg)](https://reactjs.org/)

</div>

## ✨ Features

### Core Functionality
- 🎥 **Video & Audio Download** - Support for MP4 (video) and MP3 (audio) formats
- 🔄 **Queue Management** - Download multiple files with concurrent processing
- ⏸️ **Download Control** - Pause, resume, and cancel downloads
- 📊 **Real-time Progress** - Live progress tracking with speed and ETA
- 🎨 **Modern UI** - Clean, minimalist interface with dark/light theme support

### Advanced Features
- 🤖 **Anti-Bot Detection** - 3-attempt retry system with multiple extraction strategies
- 📦 **Auto-Installation** - Automatically downloads yt-dlp and ffmpeg on first run
- 💾 **Queue Persistence** - Saves download queue state across app restarts
- ⚙️ **Configurable Settings** - Customize download directory, concurrent limits, and theme
- 🛡️ **Error Handling** - Comprehensive error categorization with user-friendly messages

## 🏗️ Architecture

Built with **Clean Architecture** principles:

```
├── Domain Layer          # Business entities and value objects
├── Application Layer     # Use cases and business logic
├── Infrastructure Layer  # External services (yt-dlp, ffmpeg, file system)
└── Presentation Layer    # React UI components
```

### Tech Stack
- **Frontend**: React 18, TypeScript, Tailwind CSS, Zustand
- **Backend**: Electron 28, Node.js, yt-dlp, ffmpeg
- **Build**: Vite, electron-packager
- **Testing**: Jest (39/39 tests passing)

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm
- Windows 10/11 (macOS and Linux support coming soon)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/NTL0210/Ytomp34.git
cd Ytomp34
```

2. **Install dependencies**
```bash
npm install
```

3. **Run in development mode**
```bash
npm run dev
```

4. **Build for production**
```bash
npm run build
node package-app.js
```

The packaged app will be in `build/Ytomp34-win32-x64/Ytomp34.exe`

## 📖 Usage

### Basic Workflow
1. **Enter Video URL** - Paste a YouTube (or supported platform) URL
2. **Fetch Info** - Click "Fetch Info" to load video metadata
3. **Select Format** - Choose MP4 (video) or MP3 (audio) and quality
4. **Start Download** - Click "Start Download" to add to queue
5. **Monitor Progress** - Watch real-time progress in the download queue

### Supported Platforms
- YouTube
- Vimeo
- And 1000+ other sites supported by yt-dlp

## 🛠️ Development

### Project Structure
```
Ytomp34/
├── electron/
│   ├── main/              # Main process
│   │   ├── domain/        # Entities and value objects
│   │   ├── application/   # Use cases
│   │   ├── infrastructure/# External services
│   │   └── ipc/           # IPC handlers
│   └── preload/           # Preload script
├── renderer/
│   └── src/
│       ├── components/    # React components
│       ├── hooks/         # Custom hooks
│       ├── store/         # Zustand store
│       └── constants/     # Constants and configs
├── tests/
│   ├── unit/              # Unit tests
│   └── integration/       # Integration tests
└── scripts/               # Build and utility scripts
```

### Available Scripts
```bash
npm run dev              # Start development server
npm run build            # Build for production
npm run build:renderer   # Build renderer only
npm run build:electron   # Build electron only
npm test                 # Run tests
npm run lint             # Run ESLint
```

## 🤖 Anti-Bot Detection

Ytomp34 includes advanced anti-bot detection to handle YouTube's bot protection:

### Multi-Strategy Approach
1. **Attempt 1**: Standard web browser simulation with realistic headers
2. **Attempt 2**: Mobile web client fallback
3. **Attempt 3**: Android client (most reliable)

### Progressive Timeouts
- Attempt 1: 45 seconds
- Attempt 2: 60 seconds
- Attempt 3: 75 seconds

### Smart Retry Logic
- Automatic wait periods between retries (5s → 10s → 15s)
- Different user agents and extraction methods per attempt
- Comprehensive error messages for bot detection scenarios

## 📋 Requirements

### Functional Requirements
- ✅ URL input and validation
- ✅ Video metadata fetching
- ✅ Format and quality selection
- ✅ Download queue management
- ✅ Concurrent download control
- ✅ Progress tracking
- ✅ Error handling and recovery
- ✅ Settings persistence
- ✅ Theme support

### Non-Functional Requirements
- ✅ Fast startup (< 2 seconds)
- ✅ Responsive UI (< 100ms interactions)
- ✅ Reliable downloads with retry logic
- ✅ Clean Architecture for maintainability
- ✅ Comprehensive test coverage

## 🧪 Testing

Run the test suite:
```bash
npm test
```

**Test Coverage**: 39/39 tests passing
- Unit tests for use cases and infrastructure
- Integration tests for graceful degradation
- Property-based tests (optional)

## 📝 Documentation

- [Requirements](/.kiro/specs/ytomp34/requirements.md) - Detailed functional requirements
- [Design](/.kiro/specs/ytomp34/design.md) - Architecture and design decisions
- [Tasks](/.kiro/specs/ytomp34/tasks.md) - Implementation task breakdown
- [Anti-Bot Fixes](ANTI-BOT-FIXES-SUMMARY.md) - Bot detection solutions
- [Bugfix Report](FINAL-BUGFIX-REPORT.md) - Complete bugfix documentation

## 🐛 Known Issues & Solutions

### YouTube Bot Detection
If you encounter "Sign in to confirm you're not a bot" errors:
1. The app will automatically retry with different strategies
2. Wait 10-15 minutes if all attempts fail
3. Try a different video URL
4. Consider using a VPN for persistent issues

### Installation Issues
- **yt-dlp not found**: App will auto-download on first run
- **ffmpeg missing**: App will auto-download on first run
- **Permission errors**: Run as Administrator if needed

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Guidelines
1. Follow Clean Architecture principles
2. Write tests for new features
3. Update documentation
4. Follow TypeScript best practices
5. Use conventional commit messages

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - Video extraction
- [ffmpeg](https://ffmpeg.org/) - Audio/video processing
- [Electron](https://www.electronjs.org/) - Cross-platform desktop framework
- [React](https://reactjs.org/) - UI framework
- [Tailwind CSS](https://tailwindcss.com/) - Styling

## 📧 Contact

For questions or support, please open an issue on GitHub.

---

<div align="center">

**Made with ❤️ using Clean Architecture principles**

[Report Bug](https://github.com/NTL0210/Ytomp34/issues) · [Request Feature](https://github.com/NTL0210/Ytomp34/issues)

</div>