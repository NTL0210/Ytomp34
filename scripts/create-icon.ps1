# Create Application Icon Script

Write-Host "Ytomp34 Icon Creation Guide" -ForegroundColor Cyan
Write-Host "==============================" -ForegroundColor Cyan

$iconPath = Join-Path $PSScriptRoot "..\assets\icon.ico"

if (Test-Path $iconPath) {
    Write-Host "Icon file already exists at: $iconPath" -ForegroundColor Green
    $fileSize = (Get-Item $iconPath).Length
    Write-Host "File size: $fileSize bytes" -ForegroundColor Yellow
    
    if ($fileSize -lt 1000) {
        Write-Host "Warning: Icon file seems too small. Replace with proper icon." -ForegroundColor Yellow
    }
} else {
    Write-Host "Icon file not found. Creating placeholder..." -ForegroundColor Yellow
    
    $iconDir = Split-Path $iconPath -Parent
    if (-not (Test-Path $iconDir)) {
        New-Item -ItemType Directory -Path $iconDir -Force | Out-Null
    }
    
    "PLACEHOLDER_ICON" | Out-File -FilePath $iconPath -Encoding ASCII
    
    Write-Host "Placeholder created at: $iconPath" -ForegroundColor Green
    Write-Host "IMPORTANT: Replace with real icon before production!" -ForegroundColor Red
}

Write-Host ""
Write-Host "To create a proper icon:" -ForegroundColor Cyan
Write-Host "1. Visit https://www.icoconverter.com/" -ForegroundColor White
Write-Host "2. Upload a PNG image (256x256 or larger)" -ForegroundColor White
Write-Host "3. Download and save as assets/icon.ico" -ForegroundColor White
