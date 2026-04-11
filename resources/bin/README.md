# Binary Dependencies

This folder should contain the following binaries for production builds:

## Required Binaries

### 1. yt-dlp.exe
- **Download from:** https://github.com/yt-dlp/yt-dlp/releases/latest
- **File:** yt-dlp.exe (Windows executable)
- **Version:** Latest stable
- **Size:** ~10-15 MB

### 2. ffmpeg.exe
- **Download from:** https://github.com/BtbN/FFmpeg-Builds/releases
- **File:** ffmpeg.exe (from ffmpeg-master-latest-win64-gpl.zip)
- **Version:** Latest stable
- **Size:** ~100-120 MB

## Installation Instructions

1. Download yt-dlp.exe from the link above
2. Place it in this directory: `resources/bin/yt-dlp.exe`
3. Download FFmpeg builds (choose win64-gpl)
4. Extract and copy `ffmpeg.exe` to: `resources/bin/ffmpeg.exe`

## Verification

After placing the binaries, verify:
```bash
resources/bin/yt-dlp.exe --version
resources/bin/ffmpeg.exe -version
```

## Development

For development, the application will look for these binaries in:
- Production: `resources/bin/`
- Development: `bin/` (root directory)

Create a `bin/` folder in the project root and copy the binaries there for development.

## Note

These binaries are NOT included in the repository due to their size.
They will be bundled during the build process via electron-builder's `extraResources`.
