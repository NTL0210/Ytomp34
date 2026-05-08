#!/usr/bin/env powershell

Write-Host "=== ADVANCED YT-DLP TESTING ===" -ForegroundColor Green

$userDataPath = "$env:APPDATA\ytomp34"
$binPath = "$userDataPath\bin"
$ytdlpPath = "$binPath\yt-dlp.exe"

if (-not (Test-Path $ytdlpPath)) {
    Write-Host "ERROR: yt-dlp not found at $ytdlpPath" -ForegroundColor Red
    exit 1
}

# Test URL
$testUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

Write-Host "Testing URL: $testUrl" -ForegroundColor Yellow
Write-Host ""

# Test 1: Basic approach
Write-Host "Test 1: Basic approach" -ForegroundColor Cyan
try {
    $result1 = & $ytdlpPath --dump-json --no-warnings $testUrl 2>&1
    if ($result1 -and $result1 -notlike "*ERROR*") {
        Write-Host "SUCCESS: Basic approach works" -ForegroundColor Green
    } else {
        Write-Host "FAILED: $result1" -ForegroundColor Red
    }
} catch {
    Write-Host "FAILED: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 2: With user agent
Write-Host "Test 2: With user agent" -ForegroundColor Cyan
try {
    $result2 = & $ytdlpPath --dump-json --no-warnings --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" $testUrl 2>&1
    if ($result2 -and $result2 -notlike "*ERROR*") {
        Write-Host "SUCCESS: User agent approach works" -ForegroundColor Green
    } else {
        Write-Host "FAILED: $result2" -ForegroundColor Red
    }
} catch {
    Write-Host "FAILED: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 3: With mobile client
Write-Host "Test 3: With mobile client" -ForegroundColor Cyan
try {
    $result3 = & $ytdlpPath --dump-json --no-warnings --extractor-args "youtube:player_client=mweb" $testUrl 2>&1
    if ($result3 -and $result3 -notlike "*ERROR*") {
        Write-Host "SUCCESS: Mobile client works" -ForegroundColor Green
    } else {
        Write-Host "FAILED: $result3" -ForegroundColor Red
    }
} catch {
    Write-Host "FAILED: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 4: With Android client
Write-Host "Test 4: With Android client" -ForegroundColor Cyan
try {
    $result4 = & $ytdlpPath --dump-json --no-warnings --extractor-args "youtube:player_client=android" $testUrl 2>&1
    if ($result4 -and $result4 -notlike "*ERROR*") {
        Write-Host "SUCCESS: Android client works" -ForegroundColor Green
    } else {
        Write-Host "FAILED: $result4" -ForegroundColor Red
    }
} catch {
    Write-Host "FAILED: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Test 5: Update yt-dlp
Write-Host "Test 5: Updating yt-dlp to latest version" -ForegroundColor Cyan
try {
    $updateResult = & $ytdlpPath --update 2>&1
    Write-Host "Update result: $updateResult" -ForegroundColor Yellow
    
    # Test again after update
    $result5 = & $ytdlpPath --dump-json --no-warnings $testUrl 2>&1
    if ($result5 -and $result5 -notlike "*ERROR*") {
        Write-Host "SUCCESS: Works after update" -ForegroundColor Green
    } else {
        Write-Host "FAILED after update: $result5" -ForegroundColor Red
    }
} catch {
    Write-Host "FAILED: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== RECOMMENDATIONS ===" -ForegroundColor Yellow
Write-Host "1. If any test succeeded, that method should work in the app" -ForegroundColor White
Write-Host "2. If all tests failed, YouTube is likely blocking all requests" -ForegroundColor White
Write-Host "3. Try using a VPN or wait 30-60 minutes" -ForegroundColor White
Write-Host "4. Consider testing with a different video platform (Vimeo, etc.)" -ForegroundColor White