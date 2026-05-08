#!/usr/bin/env powershell

Write-Host "=== YT-DLP DEBUG SCRIPT ===" -ForegroundColor Green

# Check if yt-dlp is in system PATH
Write-Host ""
Write-Host "Checking system yt-dlp..." -ForegroundColor Yellow
try {
    $systemVersion = yt-dlp --version 2>$null
    if ($systemVersion) {
        Write-Host "OK System yt-dlp found: $systemVersion" -ForegroundColor Green
    } else {
        Write-Host "ERROR System yt-dlp not found" -ForegroundColor Red
    }
} catch {
    Write-Host "ERROR System yt-dlp not found: $($_.Exception.Message)" -ForegroundColor Red
}

# Check app user data directory
$userDataPath = "$env:APPDATA\ytomp34"
$binPath = "$userDataPath\bin"
$ytdlpPath = "$binPath\yt-dlp.exe"

Write-Host ""
Write-Host "Checking app bundled yt-dlp..." -ForegroundColor Yellow
Write-Host "Expected path: $ytdlpPath"

if (Test-Path $ytdlpPath) {
    Write-Host "OK Bundled yt-dlp found" -ForegroundColor Green
    try {
        $bundledVersion = & $ytdlpPath --version 2>$null
        Write-Host "OK Bundled yt-dlp version: $bundledVersion" -ForegroundColor Green
    } catch {
        Write-Host "ERROR Bundled yt-dlp exists but not working: $($_.Exception.Message)" -ForegroundColor Red
    }
} else {
    Write-Host "ERROR Bundled yt-dlp not found" -ForegroundColor Red
    Write-Host "App will download it on first run" -ForegroundColor Yellow
}

# Check ffmpeg
$ffmpegPath = "$binPath\ffmpeg.exe"
Write-Host ""
Write-Host "Checking ffmpeg..." -ForegroundColor Yellow
Write-Host "Expected path: $ffmpegPath"

if (Test-Path $ffmpegPath) {
    Write-Host "OK Bundled ffmpeg found" -ForegroundColor Green
} else {
    Write-Host "ERROR Bundled ffmpeg not found" -ForegroundColor Red
    Write-Host "App will download it on first run" -ForegroundColor Yellow
}

# Test a simple yt-dlp command
Write-Host ""
Write-Host "Testing yt-dlp with a simple command..." -ForegroundColor Yellow
$testUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

if (Test-Path $ytdlpPath) {
    Write-Host "Testing bundled yt-dlp..."
    try {
        $testResult = & $ytdlpPath --dump-json --no-warnings $testUrl 2>$null | Select-Object -First 1
        if ($testResult) {
            $json = $testResult | ConvertFrom-Json
            Write-Host "OK yt-dlp test successful: $($json.title)" -ForegroundColor Green
        } else {
            Write-Host "ERROR yt-dlp test failed: No output" -ForegroundColor Red
        }
    } catch {
        Write-Host "ERROR yt-dlp test failed: $($_.Exception.Message)" -ForegroundColor Red
    }
} else {
    Write-Host "Skipping test - no yt-dlp found" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== DEBUG COMPLETE ===" -ForegroundColor Green
Write-Host "If issues persist:" -ForegroundColor Yellow
Write-Host "1. Check internet connection" -ForegroundColor White
Write-Host "2. Check Windows Defender/Antivirus" -ForegroundColor White
Write-Host "3. Try running app as Administrator" -ForegroundColor White
Write-Host "4. Check firewall settings" -ForegroundColor White