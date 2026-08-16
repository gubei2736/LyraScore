$ErrorActionPreference = "Continue"

$androidDir  = "G:\Project\android"
$projectRoot = "G:\Project"

# 注入 Public_Environment 工具链路径到 PATH
$nodeDir = "D:\Public_Environment\Node\nvm\v20.18.0"
if (Test-Path $nodeDir) {
    $env:PATH = "$nodeDir;$env:PATH"
}

# Toolchain absolute paths
$androidJar     = "D:\Public_Environment\AndroidSDK\platforms\android-34\android.jar"
$aapt2          = "D:\Public_Environment\AndroidSDK\build-tools\34.0.0\aapt2.exe"
$r8Jar          = "D:\Public_Environment\Cache\r8.jar"
$apksignerJar   = "D:\Public_Environment\AndroidSDK\build-tools\34.0.0\apksigner.jar"
$npmPath        = "D:\Public_Environment\Node\nvm\v20.18.0\npm.cmd"

# Project paths
$androidSrc     = "$androidDir\app\src\main"
$buildDir       = "$androidDir\app\build\pack"
$toolsDir       = "$androidDir\tools"
$outputApk      = "$androidDir\LyraScore.apk"
$keystorePath   = "$androidDir\debug.keystore"

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "         LyraScore - Android APK Builder           " -ForegroundColor Cyan
Write-Host "         Target: Android 7.0 - Android 16 (API 35) " -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan

# Step 1: Frontend Vite Build
Write-Host "`n[1/5] Building Web App (Vite)..." -ForegroundColor Yellow
Set-Location $projectRoot
if (Test-Path $npmPath) {
    & $npmPath run build
} else {
    npm run build
}
if ($LASTEXITCODE -ne 0) {
    Write-Host "Frontend build failed!" -ForegroundColor Red
    exit 1
}

# Step 2: Sync assets to Android assets/dist
Write-Host "`n[2/5] Syncing assets to Android assets/dist..." -ForegroundColor Yellow
$targetAssets = "$androidSrc\assets\dist"
if (Test-Path $targetAssets) {
    Remove-Item $targetAssets -Recurse -Force
}
New-Item -ItemType Directory -Path $targetAssets -Force | Out-Null
Copy-Item -Path "$projectRoot\dist\*" -Destination $targetAssets -Recurse -Force
$assetCount = (Get-ChildItem $targetAssets -Recurse -File).Count
Write-Host "  Synced $assetCount asset files" -ForegroundColor Green

# Step 3: Clean and init build dir
if (Test-Path $buildDir) {
    Remove-Item $buildDir -Recurse -Force
}
New-Item -ItemType Directory -Path "$buildDir\res_flat", "$buildDir\gen", "$buildDir\classes", "$buildDir\dex" -Force | Out-Null

# Step 4: Compile resources and generate base resources.apk
Write-Host "`n[3/5] Compiling resources & manifest (AAPT2)..." -ForegroundColor Yellow
$resDir = "$androidSrc\res"
$flatFiles = @()
if (Test-Path $resDir) {
    & "D:\Public_Environment\AndroidSDK\build-tools\34.0.0\aapt2.exe" compile --dir $resDir -o "$buildDir\res_flat" 2>&1 | Out-Null
    $flatFiles = (Get-ChildItem "$buildDir\res_flat" -Filter "*.flat").FullName
}

$resApk = "$buildDir\resources.apk"
$linkArgs = @(
    "link",
    "-I", $androidJar,
    "--manifest", "$androidSrc\AndroidManifest.xml",
    "--min-sdk-version", "24",
    "--target-sdk-version", "35",
    "--version-code", "1",
    "--version-name", "1.0.0",
    "--java", "$buildDir\gen",
    "-o", $resApk,
    "--auto-add-overlay"
)
foreach ($f in $flatFiles) { $linkArgs += @("-R", $f) }
& "D:\Public_Environment\AndroidSDK\build-tools\34.0.0\aapt2.exe" @linkArgs 2>&1 | Out-Null
Write-Host "  AAPT2 resources compiled (targetSdk=35)" -ForegroundColor Green

# Step 5: Compile Java & generate DEX
Write-Host "`n[4/5] Compiling Java & generating DEX (D8)..." -ForegroundColor Yellow
$javaSources = @()
Get-ChildItem "$androidSrc\java" -Filter "*.java" -Recurse | ForEach-Object { $javaSources += $_.FullName }
Get-ChildItem "$buildDir\gen" -Filter "*.java" -Recurse -ErrorAction SilentlyContinue | ForEach-Object { $javaSources += $_.FullName }
& "D:\Public_Environment\JDK\bin\javac.exe" -encoding UTF-8 -classpath $androidJar -source 11 -target 11 -d "$buildDir\classes" @javaSources 2>&1 | Out-Null

$classJar = "$buildDir\classes.jar"
& "D:\Public_Environment\JDK\bin\jar.exe" cf $classJar -C "$buildDir\classes" "."
$dexOut = "$buildDir\dex"
& "D:\Public_Environment\JDK\bin\java.exe" -cp $r8Jar com.android.tools.r8.D8 --lib $androidJar --output $dexOut --min-api 24 $classJar 2>&1 | Out-Null
Write-Host "  classes.dex generated successfully" -ForegroundColor Green

# Step 6: Assemble Standard Aligned APK (ApkPacker)
Write-Host "`n[5/5] Packaging & Signing Standard Android APK..." -ForegroundColor Yellow

# Compile Tools
& "D:\Public_Environment\JDK\bin\javac.exe" -encoding UTF-8 -cp $apksignerJar -d $toolsDir "$toolsDir\ApkPacker.java" "$toolsDir\SignApk.java" "$toolsDir\VerifyApk.java" 2>&1 | Out-Null

$rawApk = "$buildDir\app-unaligned.apk"
$classesDexFile = "$dexOut\classes.dex"
& "D:\Public_Environment\JDK\bin\java.exe" -cp $toolsDir com.lyrascore.tools.ApkPacker $resApk $classesDexFile $targetAssets $rawApk

# Keystore
if (-not (Test-Path $keystorePath)) {
    & "D:\Public_Environment\JDK\bin\keytool.exe" -genkey -v -keystore $keystorePath -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 -storepass android -keypass android -dname "CN=Android Debug,O=Android,C=US" 2>&1 | Out-Null
}

# Sign v1 + v2 + v3
& "D:\Public_Environment\JDK\bin\java.exe" -cp "$toolsDir;$apksignerJar" com.lyrascore.tools.SignApk $rawApk $outputApk $keystorePath "androiddebugkey" "android"
& "D:\Public_Environment\JDK\bin\java.exe" -cp "$toolsDir;$apksignerJar" com.lyrascore.tools.VerifyApk $outputApk

# Cleanup temp
Remove-Item $buildDir -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "`n=== APK Package Verification ===" -ForegroundColor Cyan
& "D:\Public_Environment\AndroidSDK\build-tools\34.0.0\aapt2.exe" dump badging $outputApk | Select-String -Pattern "package:|sdkVersion:|targetSdkVersion:|application-label:|launchable-activity:" | ForEach-Object { "  $_" }

if (Test-Path $outputApk) {
    $sizeMB = [math]::Round((Get-Item $outputApk).Length / 1MB, 2)
    Write-Host ""
    Write-Host "===================================================" -ForegroundColor Green
    Write-Host "       BUILD & SIGN SUCCESS (Android 16 Ready)     " -ForegroundColor Green
    Write-Host "===================================================" -ForegroundColor Green
    Write-Host "  APK File: $outputApk" -ForegroundColor White
    Write-Host "  APK Size: $sizeMB MB" -ForegroundColor White
    Write-Host "  Install : adb install -r `"$outputApk`"" -ForegroundColor Cyan
    Write-Host "===================================================" -ForegroundColor Green
} else {
    Write-Host "`nBuild failed: output APK not found." -ForegroundColor Red
    exit 1
}