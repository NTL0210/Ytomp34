# Development Setup Guide

## Prerequisites

- Node.js v20 LTS
- npm or yarn
- Windows 10/11

## Installation Steps

### 1. Install Dependencies

```bash
npm install
```

### 2. Download Required Binaries

#### yt-dlp.exe

1. Visit: https://github.com/yt-dlp/yt-dlp/releases/latest
2. Download: `yt-dlp.exe`
3. Create folder: `bin/` in project root
4. Place file: `bin/yt-dlp.exe`

#### ffmpeg.exe

1. Visit: https://github.com/BtbN/FFmpeg-Builds/releases
2. Download: `ffmpeg-master-latest-win64-gpl.zip`
3. Extract and find: `bin/ffmpeg.exe`
4. Place file: `bin/ffmpeg.exe`

### 3. Verify Installation

```bash
# Check yt-dlp
bin/yt-dlp.exe --version

# Check ffmpeg
bin/ffmpeg.exe -version
```

### 4. Run Development Server

```bash
npm run electron:dev
```

## Build for Production

### Prepare Production Binaries

Copy binaries to resources folder:

```bash
# Create resources/bin if not exists
mkdir -p resources/bin

# Copy binaries
copy bin\yt-dlp.exe resources\bin\yt-dlp.exe
copy bin\ffmpeg.exe resources\bin\ffmpeg.exe
```

### Build Installer

```bash
# Build Windows installer
npm run electron:build:win

# Or build unpacked (faster for testing)
npm run electron:build:dir
```

Output will be in `dist-builder/` folder.

## Troubleshooting

### "Cannot find module 'electron'"

```bash
npm install
```

### "yt-dlp not found"

Make sure `bin/yt-dlp.exe` exists and is executable.

### "FFmpeg not found"

Make sure `bin/ffmpeg.exe` exists and is executable.

### Build fails with "icon.ico not found"

Create a placeholder icon or remove icon reference from electron-builder.yml temporarily.

## Project Structure

```
project/
├── bin/                    # Development binaries (gitignored)
│   ├── yt-dlp.exe
│   └── ffmpeg.exe
├── resources/bin/          # Production binaries (gitignored)
│   ├── yt-dlp.exe
│   └── ffmpeg.exe
├── src/
│   ├── main/              # Main process
│   ├── renderer/          # Renderer process
│   └── preload/           # Preload scripts
├── dist/                  # Build output
└── dist-builder/          # Installer output
```

## Next Steps

After setup, you can:

1. Run development server: `npm run electron:dev`
2. Run tests: `npm test`
3. Build for production: `npm run electron:build:win`
