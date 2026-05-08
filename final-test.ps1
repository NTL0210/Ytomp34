#!/usr/bin/env powershell

Write-Host "=== YTOMP34 FINAL TEST ===" -ForegroundColor Green

# Check app exists
$appPath = "build\Ytomp34-win32-x64\Ytomp34.exe"
if (-not (Test-Path $appPath)) {
    Write-Host "ERROR: App not found at $appPath" -ForegroundColor Red
    exit 1
}

Write-Host "OK App found: $appPath" -ForegroundColor Green

# Check yt-dlp and ffmpeg are available
$userDataPath = "$env:APPDATA\ytomp34"
$binPath = "$userDataPath\bin"
$ytdlpPath = "$binPath\yt-dlp.exe"
$ffmpegPath = "$binPath\ffmpeg.exe"

Write-Host ""
Write-Host "Checking dependencies..." -ForegroundColor Yellow

if (Test-Path $ytdlpPath) {
    Write-Host "OK yt-dlp found: $ytdlpPath" -ForegroundColor Green
} else {
    Write-Host "INFO yt-dlp will be downloaded on first run" -ForegroundColor Yellow
}

if (Test-Path $ffmpegPath) {
    Write-Host "OK ffmpeg found: $ffmpegPath" -ForegroundColor Green
} else {
    Write-Host "INFO ffmpeg will be downloaded on first run" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== STARTING APP ===" -ForegroundColor Green
Write-Host "The app will now start. Please test the following:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Check if app opens without 'Unexpected Error'" -ForegroundColor White
Write-Host "2. Try this YouTube URL: https://www.youtube.com/watch?v=dQw4w9WgXcQ" -ForegroundColor White
Write-Host "3. Click 'Fetch Info' and wait up to 60 seconds" -ForegroundColor White
Write-Host "4. Check if video title appears: 'Rick Astley - Never Gonna Give You Up'" -ForegroundColor White
Write-Host "5. Try downloading both MP3 and MP4 formats" -ForegroundColor White
Write-Host "6. Check download progress and completion" -ForegroundColor White
Write-Host ""
Write-Host "IMPORTANT: Check the DevTools console for detailed logs!" -ForegroundColor Red
Write-Host "Press F12 in the app to open DevTools" -ForegroundColor Red
Write-Host ""

# Start the app
Start-Process -FilePath $appPath

Write-Host "App started! Monitor the console for any errors." -ForegroundColor Green