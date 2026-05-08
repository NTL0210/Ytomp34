$ErrorActionPreference = "Stop"

$binDir = "$env:APPDATA\Ytomp34\bin"
$ffmpegZip = "$binDir\ffmpeg.zip"
$downloadUrl = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"

Write-Host "Creating bin directory..." -ForegroundColor Green
New-Item -ItemType Directory -Force -Path $binDir | Out-Null

Write-Host "Downloading ffmpeg..." -ForegroundColor Green
Write-Host "This may take a few minutes (file size: ~80MB)..." -ForegroundColor Yellow

$ProgressPreference = 'SilentlyContinue'
Invoke-WebRequest -Uri $downloadUrl -OutFile $ffmpegZip -UseBasicParsing

Write-Host "Download complete! Extracting..." -ForegroundColor Green

Expand-Archive -Path $ffmpegZip -DestinationPath $binDir -Force

$extractedDirs = Get-ChildItem -Path $binDir -Directory | Where-Object { $_.Name -like "ffmpeg-*" }

if ($extractedDirs.Count -eq 0) {
    Write-Host "Error: Could not find extracted ffmpeg directory" -ForegroundColor Red
    exit 1
}

$extractedDir = $extractedDirs[0].FullName
$ffmpegBinDir = Join-Path $extractedDir "bin"

Write-Host "Copying ffmpeg.exe and ffprobe.exe..." -ForegroundColor Green

Copy-Item -Path (Join-Path $ffmpegBinDir "ffmpeg.exe") -Destination (Join-Path $binDir "ffmpeg.exe") -Force
Copy-Item -Path (Join-Path $ffmpegBinDir "ffprobe.exe") -Destination (Join-Path $binDir "ffprobe.exe") -Force

Write-Host "Cleaning up..." -ForegroundColor Green
Remove-Item -Path $ffmpegZip -Force
Remove-Item -Path $extractedDir -Recurse -Force

Write-Host ""
Write-Host "ffmpeg installed successfully!" -ForegroundColor Green
Write-Host "Location: $binDir" -ForegroundColor Cyan

$ffmpegPath = Join-Path $binDir "ffmpeg.exe"
if (Test-Path $ffmpegPath) {
    $version = & $ffmpegPath -version 2>&1 | Select-Object -First 1
    Write-Host "Version: $version" -ForegroundColor Cyan
}
