# LyraScore Android APK Build Script
$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path "$PSScriptRoot\.."
Set-Location $projectRoot

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "   LyraScore - Android APK Builder (PowerShell)" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan

Write-Host "[1/3] Building frontend assets (Vite)..." -ForegroundColor Yellow
$npmPath = "D:\Public_Environment\Node\nvm\v20.18.0\npm.cmd"
if (Test-Path $npmPath) {
    & $npmPath run build
} else {
    npm run build
}

Write-Host "[2/3] Syncing files to Android assets..." -ForegroundColor Yellow
$targetDir = "$PSScriptRoot\app\src\main\assets\dist"
if (-not (Test-Path $targetDir)) {
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
}

Copy-Item -Path "$projectRoot\dist\*" -Destination $targetDir -Recurse -Force

Write-Host "[3/3] Build completed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Android project path: $PSScriptRoot" -ForegroundColor White
Write-Host "You can now open this folder in Android Studio and build your APK." -ForegroundColor Green
Write-Host "===================================================" -ForegroundColor Cyan
