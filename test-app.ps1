#!/usr/bin/env powershell

# Test script for Ytomp34 app
Write-Host "=== Testing Ytomp34 App ===" -ForegroundColor Green

# Check if app exists
$appPath = "build\Ytomp34-win32-x64\Ytomp34.exe"
if (-not (Test-Path $appPath)) {
    Write-Host "ERROR: App not found at $appPath" -ForegroundColor Red
    exit 1
}

Write-Host "OK App executable found: $appPath" -ForegroundColor Green

# Check app structure
$resourcesPath = "build\Ytomp34-win32-x64\resources\app"
if (-not (Test-Path $resourcesPath)) {
    Write-Host "ERROR: Resources not found at $resourcesPath" -ForegroundColor Red
    exit 1
}

Write-Host "OK App resources found: $resourcesPath" -ForegroundColor Green

# Check critical files
$criticalFiles = @(
    "build\Ytomp34-win32-x64\resources\app\dist\electron\main\index.js",
    "build\Ytomp34-win32-x64\resources\app\dist\electron\preload\index.js",
    "build\Ytomp34-win32-x64\resources\app\dist\renderer\index.html"
)

foreach ($file in $criticalFiles) {
    if (Test-Path $file) {
        Write-Host "OK Found: $file" -ForegroundColor Green
    } else {
        Write-Host "ERROR Missing: $file" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "=== Starting App ===" -ForegroundColor Yellow
Write-Host "Launching $appPath..." -ForegroundColor Yellow
Write-Host "The app will open in a new window. Check the console for any errors." -ForegroundColor Yellow

# Start the app (non-blocking)
Start-Process -FilePath $appPath

Write-Host ""
Write-Host "=== App Started ===" -ForegroundColor Green
Write-Host "App is now running. Test the following:" -ForegroundColor Yellow
Write-Host "1. Check if the app window opens without errors" -ForegroundColor White
Write-Host "2. Try entering a YouTube URL (e.g., https://www.youtube.com/watch?v=dQw4w9WgXcQ)" -ForegroundColor White
Write-Host "3. Check if video info loads correctly" -ForegroundColor White
Write-Host "4. Try downloading a video/audio" -ForegroundColor White
Write-Host "5. Check the download progress and completion" -ForegroundColor White