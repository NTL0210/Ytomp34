#!/usr/bin/env powershell

Write-Host "=== TESTING DIFFERENT YOUTUBE URLs ===" -ForegroundColor Green

$userDataPath = "$env:APPDATA\ytomp34"
$binPath = "$userDataPath\bin"
$ytdlpPath = "$binPath\yt-dlp.exe"

if (-not (Test-Path $ytdlpPath)) {
    Write-Host "ERROR: yt-dlp not found at $ytdlpPath" -ForegroundColor Red
    exit 1
}

# Test different URLs to find one that works
$testUrls = @(
    "https://www.youtube.com/watch?v=jNQXAC9IVRw",  # Me at the zoo (first YouTube video)
    "https://www.youtube.com/watch?v=9bZkp7q19f0",  # Gangnam Style
    "https://www.youtube.com/watch?v=kJQP7kiw5Fk",  # Despacito
    "https://www.youtube.com/watch?v=fJ9rUzIMcZQ",  # Bohemian Rhapsody
    "https://www.youtube.com/watch?v=L_jWHffIx5E"   # Smells Like Teen Spirit
)

Write-Host "Testing URLs to find one that works..." -ForegroundColor Yellow

foreach ($url in $testUrls) {
    Write-Host ""
    Write-Host "Testing: $url" -ForegroundColor Cyan
    
    try {
        $result = & $ytdlpPath --dump-json --no-warnings --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" $url 2>$null | Select-Object -First 1
        
        if ($result) {
            $json = $result | ConvertFrom-Json
            Write-Host "SUCCESS: $($json.title)" -ForegroundColor Green
            Write-Host "Duration: $($json.duration) seconds" -ForegroundColor Green
            Write-Host "This URL should work in the app!" -ForegroundColor Green
            break
        } else {
            Write-Host "FAILED: No output" -ForegroundColor Red
        }
    } catch {
        Write-Host "FAILED: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "=== RECOMMENDATIONS ===" -ForegroundColor Yellow
Write-Host "1. Try the successful URL above in the app" -ForegroundColor White
Write-Host "2. If all URLs fail, YouTube may be blocking requests temporarily" -ForegroundColor White
Write-Host "3. Try again in 10-15 minutes" -ForegroundColor White
Write-Host "4. Consider using a VPN if the issue persists" -ForegroundColor White