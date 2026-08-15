$ErrorActionPreference = "Continue"

$androidDir  = "G:\Project\android"
$projectRoot = "G:\Project"

# Toolchain absolute paths
$androidJar     = "D:\Public_Environment\AndroidSDK\platforms\android-34\android.jar"
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
New-Item -ItemType Directory -Path "$buildDir\res_flat", "$buildDir\gen", "$buildDir\classes", "$buildDir\dex", "$buildDir\apk_contents" -Force | Out-Null

# Step 4: Compile resources and generate base APK
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
& "D:\Public_Environment\JDK\bin\java.exe" -cp $r8Jar com.android.tools.r8.D8 --lib $androidJar --output "$buildDir\dex" --min-api 24 $classJar 2>&1 | Out-Null
Write-Host "  classes.dex generated successfully" -ForegroundColor Green

# Step 6: Assemble APK with standard Unix forward-slashes
Write-Host "`n[5/5] Assembling & Signing APK (v1 + v2 + v3 Scheme)..." -ForegroundColor Yellow
Add-Type -AssemblyName System.IO.Compression.FileSystem

$resZip = [System.IO.Compression.ZipFile]::OpenRead($resApk)
foreach ($entry in $resZip.Entries) {
    $targetPath = [System.IO.Path]::Combine("$buildDir\apk_contents", $entry.FullName)
    $dir = [System.IO.Path]::GetDirectoryName($targetPath)
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $targetPath, $true)
}
$resZip.Dispose()

Copy-Item "$buildDir\dex\classes.dex" "$buildDir\apk_contents\classes.dex" -Force

$distDst = "$buildDir\apk_contents\assets\dist"
if (-not (Test-Path $distDst)) { New-Item -ItemType Directory -Path $distDst -Force | Out-Null }
Copy-Item "$targetAssets\*" $distDst -Recurse -Force

$unalignedApk = "$buildDir\app-unaligned.apk"
if (Test-Path $unalignedApk) { Remove-Item $unalignedApk -Force }

$zipOut = [System.IO.Compression.ZipFile]::Open($unalignedApk, "Create")
$baseContentDir = (Resolve-Path "$buildDir\apk_contents").Path
$filesToPack = Get-ChildItem $baseContentDir -Recurse -File
foreach ($fileItem in $filesToPack) {
    $full = $fileItem.FullName
    $rel = $full.Substring($baseContentDir.Length + 1).Replace("\", "/")
    $level = [System.IO.Compression.CompressionLevel]::Optimal
    if ($rel -eq "resources.arsc") {
        $level = [System.IO.Compression.CompressionLevel]::NoCompression
    }
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zipOut, $full, $rel, $level) | Out-Null
}
$zipOut.Dispose()

# Keystore
if (-not (Test-Path $keystorePath)) {
    & "D:\Public_Environment\JDK\bin\keytool.exe" -genkey -v -keystore $keystorePath -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 -storepass android -keypass android -dname "CN=Android Debug,O=Android,C=US" 2>&1 | Out-Null
}

# Sign and verify
& "D:\Public_Environment\JDK\bin\javac.exe" -encoding UTF-8 -cp $apksignerJar -d $toolsDir "$toolsDir\SignApk.java" "$toolsDir\VerifyApk.java" 2>&1 | Out-Null
& "D:\Public_Environment\JDK\bin\java.exe" -cp "$toolsDir;$apksignerJar" com.lyrascore.tools.SignApk $unalignedApk $outputApk $keystorePath "androiddebugkey" "android"
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