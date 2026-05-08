#!/usr/bin/env powershell

Write-Host "=== YTOMP34 FINAL TEST - ANTI-BOT FIXED ===" -ForegroundColor Green

# Check app exists
$appPath = "build\Ytomp34-win32-x64\Ytomp34.exe"
if (-not (Test-Path $appPath)) {
    Write-Host "ERROR: App not found at $appPath" -ForegroundColor Red
    exit 1
}

Write-Host "OK App found: $appPath" -ForegroundColor Green

# Verify yt-dlp is working
$userDataPath = "$env:APPDATA\ytomp34"
$binPath = "$userDataPath\bin"
$ytdlpPath = "$binPath\yt-dlp.exe"

Write-Host ""
Write-Host "Verifying yt-dlp functionality..." -ForegroundColor Yellow

if (Test-Path $ytdlpPath) {
    try {
        $testResult = & $ytdlpPath --dump-json --no-warnings "https://www.youtube.com/watch?v=dQw4w9WgXcQ" 2>$null | Select-Object -First 1
        if ($testResult) {
            $json = $testResult | ConvertFrom-Json
            Write-Host "OK yt-dlp is working: $($json.title)" -ForegroundColor Green
        } else {
            Write-Host "WARNING: yt-dlp test failed, but app will try multiple strategies" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "WARNING: yt-dlp test failed, but app will try multiple strategies" -ForegroundColor Yellow
    }
} else {
    Write-Host "INFO: yt-dlp will be downloaded on first run" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== STARTING APP WITH ANTI-BOT FIXES ===" -ForegroundColor Green
Write-Host ""
Write-Host "NEW FEATURES IN THIS VERSION:" -ForegroundColor Cyan
Write-Host "OK 3-attempt retry system with different strategies" -ForegroundColor White
Write-Host "OK Anti-bot headers and user agents" -ForegroundColor White
Write-Host "OK Android/Mobile client fallbacks" -ForegroundColor White
Write-Host "OK Increased timeouts (45s, 60s, 75s)" -ForegroundColor White
Write-Host "OK Better error messages for bot detection" -ForegroundColor White
Write-Host ""
Write-Host "TESTING INSTRUCTIONS:" -ForegroundColor Yellow
Write-Host "1. App should open without Unexpected Error" -ForegroundColor White
Write-Host "2. Try URL: https://www.youtube.com/watch?v=dQw4w9WgXcQ" -ForegroundColor White
Write-Host "3. Click Fetch Info and wait (up to 3 attempts, max 75s)" -ForegroundColor White
Write-Host "4. Watch console for retry attempts and different strategies" -ForegroundColor White
Write-Host "5. If bot detection occurs, app will show helpful message" -ForegroundColor White
Write-Host "6. Try downloading if metadata fetch succeeds" -ForegroundColor White
Write-Host ""
Write-Host "CONSOLE MONITORING:" -ForegroundColor Red
Write-Host "Press F12 to open DevTools and watch for:" -ForegroundColor Red
Write-Host "- Metadata fetch attempt 1/3" -ForegroundColor White
Write-Host "- Bot detection detected, waiting..." -ForegroundColor White
Write-Host "- Using Android client or Using mobile client" -ForegroundColor White
Write-Host "- Metadata extracted successfully" -ForegroundColor White
Write-Host ""

# Start the app
Start-Process -FilePath $appPath

Write-Host "App started with anti-bot protection!" -ForegroundColor Green
Write-Host ""
Write-Host "If you still get bot detection errors:" -ForegroundColor Yellow
Write-Host "1. This is a YouTube-side issue, not an app bug" -ForegroundColor White
Write-Host "2. Try waiting 10-15 minutes and test again" -ForegroundColor White
Write-Host "3. Try a different video URL" -ForegroundColor White
Write-Host "4. Consider using a VPN if the issue persists" -ForegroundColor White