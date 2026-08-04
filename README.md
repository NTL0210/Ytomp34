# Ytomp34

<div align="center">

![Ytomp34 logo](assets/icon.ico)

**A desktop video and audio downloader built with Electron, React, TypeScript, yt-dlp, and ffmpeg.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-42-blue.svg)](https://www.electronjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-blue.svg)](https://react.dev/)

</div>

## Features

- Download video as MP4 or extract audio as MP3.
- Select available video resolution or audio quality.
- Queue multiple downloads with a configurable concurrency limit.
- Track progress, speed, ETA, retries, and errors.
- Cancel pending or active downloads.
- Save settings and restore queued tasks after an app restart.
- Automatically install bundled yt-dlp and ffmpeg when required.
- Use light or dark themes.

Pause and resume controls rely on Unix process signals and are therefore only
available on macOS and Linux. They are hidden in the current Windows build.

## Supported Systems

The packaged release script currently targets 64-bit Windows 10 and Windows
11. The source includes platform-specific yt-dlp and ffmpeg installers for
macOS and Linux, but packaged releases for those systems are not yet provided.

Ytomp34 uses yt-dlp and can work with YouTube, Vimeo, and many other sites that
yt-dlp supports. Site support can change when a site or yt-dlp changes.

## Getting Started

Requirements:

- Node.js 22 or newer
- npm

Clone and install:

```bash
git clone https://github.com/NTL0210/Ytomp34.git
cd Ytomp34
npm install
```

Run in development mode:

```bash
npm run dev
```

## Build A Windows Release

```bash
npm run lint
npm test -- --runInBand
npm run build
npm run test:electron-smoke
npm run build:win
npm run build:installer
```

The packaged application is written to:

```text
build/Ytomp34-win32-x64/Ytomp34.exe
```

The assisted Windows installer and NSIS update artifacts are written to
`build/installer`. The installer lets the user choose the installation folder
and creates Desktop and Start Menu shortcuts. Upload the generated `Setup.exe`,
`Setup.exe.blockmap`, and `latest.yml` files to the same public GitHub Release.
The in-app updater never checks or downloads in development mode, and installed
builds require separate user actions to check, download, and restart to install
an update.

`npm run build:legacy-installer` remains available for one transition release
if existing Squirrel installations need compatible update artifacts.

### Publishing a release

The Windows release workflow runs only for a semantic version tag such as
`v1.0.1`. Before creating a tag, update the `version` field in `package.json`
and `package-lock.json`, then commit and push that change. The workflow rejects
a tag that does not exactly match the package version. A successful run creates
the GitHub Release and uploads `Setup.exe`, `Setup.exe.blockmap`, `latest.yml`,
and `SHA256SUMS.txt`.

```bash
git tag v1.0.1
git push origin v1.0.1
```

The first launch may take longer while the app checks or downloads yt-dlp and
ffmpeg. An internet connection is required for automatic tool installation and
for fetching media metadata.

## Usage

1. Paste a supported video URL.
2. Fetch its metadata.
3. Select MP4 or MP3 and a quality option.
4. Start the download.
5. Follow progress in the download queue.

The download folder, theme, and maximum number of concurrent downloads can be
changed in Settings.

## Project Structure

```text
Ytomp34/
|-- electron/
|   |-- main/
|   |   |-- application/     Use cases
|   |   |-- domain/          Entities and value objects
|   |   |-- infrastructure/  yt-dlp, ffmpeg, storage, and logging
|   |   `-- ipc/             Main-process IPC handlers and contracts
|   `-- preload/             Restricted renderer API
|-- renderer/src/            React interface and Zustand store
|-- scripts/                 Build and smoke-test utilities
`-- tests/                   Unit and integration tests
```

## Available Commands

```text
npm run dev                  Start renderer and Electron in development
npm run build                Build renderer and Electron
npm run build:win            Build and package the Windows application
npm run build:installer      Build a Windows Setup.exe and update artifacts
npm run lint                 Run ESLint
npm test                     Run Jest tests
npm run test:electron-smoke  Verify the production preload API in Electron
```

## Troubleshooting

If YouTube asks you to confirm that you are not a bot, the app retries with
several yt-dlp extraction strategies. If every attempt fails, wait a few
minutes, update yt-dlp, and try again.

If automatic installation fails, check the internet connection and whether the
current user can write to the app data directory. Logs are stored under the
application user-data directory in the `logs` folder.

More details about extractor retries are available in
[ANTI-BOT-FIXES-SUMMARY.md](ANTI-BOT-FIXES-SUMMARY.md).

## Contributing

Issues and pull requests are welcome. Before submitting a change, run the lint,
test, build, and Electron smoke-test commands listed above. Add focused tests
for behavior changes and keep IPC contracts synchronized across processes.

## License

Ytomp34 is available under the [MIT License](LICENSE).

This project uses [yt-dlp](https://github.com/yt-dlp/yt-dlp),
[ffmpeg](https://ffmpeg.org/), [Electron](https://www.electronjs.org/),
[React](https://react.dev/), and [Tailwind CSS](https://tailwindcss.com/).
