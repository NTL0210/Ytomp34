# Download yt-dlp.exe script
# Run this script to automatically download yt-dlp binary

$ytdlpUrl = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
$outputPath = "resources\bin\yt-dlp.exe"

Write-Host "Downloading yt-dlp.exe..." -ForegroundColor Green

# Create directory if not exists
$dir = Split-Path -Parent $outputPath
if (!(Test-Path $dir)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

# Download file
try {
    Invoke-WebRequest -Uri $ytdlpUrl -OutFile $outputPath -UseBasicParsing
    Write-Host "✓ yt-dlp.exe downloaded successfully to $outputPath" -ForegroundColor Green
    
    # Check file size
    $fileSize = (Get-Item $outputPath).Length / 1MB
    Write-Host "File size: $([math]::Round($fileSize, 2)) MB" -ForegroundColor Cyan
    
} catch {
    Write-Host "✗ Failed to download yt-dlp.exe" -ForegroundColor Red
    Write-Host "Error: $_" -ForegroundColor Red
    Write-Host "`nPlease download manually from:" -ForegroundColor Yellow
    Write-Host $ytdlpUrl -ForegroundColor Yellow
    exit 1
}

Write-Host "`nyt-dlp is ready to use!" -ForegroundColor Green
