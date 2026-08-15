$ErrorActionPreference = "Continue"

$androidDir  = "G:\Project\android"
$projectRoot = "G:\Project"

$JAVA_HOME      = "D:\Public_Environment\JDK"
$java           = "$JAVA_HOME\bin\java.exe"
$javac          = "$JAVA_HOME\bin\javac.exe"
$jar            = "$JAVA_HOME\bin\jar.exe"
$keytool        = "$JAVA_HOME\bin\keytool.exe"

$androidJar     = "D:\Public_Environment\AndroidSDK\platforms\android-34\android.jar"
$aapt2          = "D:\Public_Environment\AndroidSDK\build-tools\34.0.0\aapt2.exe"
$r8Jar          = "D:\Public_Environment\Cache\r8.jar"
$apksignerJar   = "D:\Public_Environment\AndroidSDK\build-tools\34.0.0\apksigner.jar"

$npmPath        = "D:\Public_Environment\Node\nvm\v20.18.0\npm.cmd"

$androidSrc     = "$androidDir\app\src\main"
$buildDir       = "$androidDir\app\build\pack"
$toolsDir       = "$androidDir\tools"
$outputApk      = "$androidDir\LyraScore.apk"
$keystorePath   = "$androidDir\debug.keystore"

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "         LyraScore - Android APK Builder           " -ForegroundColor Cyan
Write-Host "         Target: Android 7.0 - Android 16 (API 35) " -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan

# Step 1: Frontend Build
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

# Step 2: Sync assets to Android project
Write-Host "`n[2/5] Syncing assets to Android assets/dist..." -ForegroundColor Yellow
$targetAssets = "$androidSrc\assets\dist"
if (Test-Path $targetAssets) {
    Remove-Item $targetAssets -Recurse -Force
}
New-Item -ItemType Directory -Path $targetAssets -Force | Out-Null
Copy-Item -Path "$projectRoot\dist\*" -Destination $targetAssets -Recurse -Force
$assetCount = (Get-ChildItem $targetAssets -Recurse -File).Count
Write-Host "  Synced $assetCount asset files" -ForegroundColor Green

# Step 3: Prepare build dir
if (Test-Path $buildDir) {
    Remove-Item $buildDir -Recurse -Force
}
New-Item -ItemType Directory -Path "$buildDir\gen" -Force | Out-Null
New-Item -ItemType Directory -Path "$buildDir\classes" -Force | Out-Null
New-Item -ItemType Directory -Path "$buildDir\dex" -Force | Out-Null
New-Item -ItemType Directory -Path "$buildDir\apk_contents" -Force | Out-Null

# Step 4: Link resources via AAPT2 (targetSdkVersion 35)
Write-Host "`n[3/5] Linking Android resources (AAPT2, targetSdk 35)..." -ForegroundColor Yellow
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
& $aapt2 @linkArgs 2>&1 | Out-Null
Write-Host "  AAPT2 base package created with targetSdk=35" -ForegroundColor Green

# Step 5: Compile Java & Build DEX
Write-Host "`n[4/5] Compiling Java & generating DEX (D8)..." -ForegroundColor Yellow
$javaSources = @()
Get-ChildItem "$androidSrc\java" -Filter "*.java" -Recurse | ForEach-Object { $javaSources += $_.FullName }
Get-ChildItem "$buildDir\gen" -Filter "*.java" -Recurse -ErrorAction SilentlyContinue | ForEach-Object { $javaSources += $_.FullName }
& $javac -encoding UTF-8 -classpath $androidJar -source 11 -target 11 -d "$buildDir\classes" @javaSources 2>&1 | Out-Null

$classJar = "$buildDir\classes.jar"
& $jar cf $classJar -C "$buildDir\classes" "."
& $java -cp $r8Jar com.android.tools.r8.D8 --lib $androidJar --output "$buildDir\dex" --min-api 24 $classJar 2>&1 | Out-Null

# Step 6: Assemble raw APK with standard Unix forward-slashes
Write-Host "`n[5/5] Assembling & Signing APK (v1 + v2 + v3 Scheme)..." -ForegroundColor Yellow
Copy-Item $resApk "$buildDir\resources.zip" -Force
Expand-Archive -Path "$buildDir\resources.zip" -DestinationPath "$buildDir\apk_contents" -Force
Copy-Item "$buildDir\dex\classes.dex" "$buildDir\apk_contents\" -Force

$distDst = "$buildDir\apk_contents\assets\dist"
New-Item -ItemType Directory -Path $distDst -Force | Out-Null
Copy-Item "$targetAssets\*" $distDst -Recurse -Force

$rawApk = "$buildDir\app-unaligned.apk"
if (Test-Path $rawApk) { Remove-Item $rawApk -Force }

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($rawApk, "Create")
$apkContentPath = (Resolve-Path "$buildDir\apk_contents").Path
Get-ChildItem $apkContentPath -Recurse -File | ForEach-Object {
    $full = $_.FullName
    $entryName = $full.Substring($apkContentPath.Length + 1).Replace("\", "/")
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $full, $entryName, "Optimal") | Out-Null
}
$zip.Dispose()

# Keystore & Sign
if (-not (Test-Path $keystorePath)) {
    & $keytool -genkey -v -keystore $keystorePath -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 -storepass android -keypass android -dname "CN=Android Debug,O=Android,C=US" 2>&1 | Out-Null
}

& $javac -encoding UTF-8 -cp $apksignerJar -d $toolsDir "$toolsDir\SignApk.java" "$toolsDir\VerifyApk.java" 2>&1 | Out-Null
& $java -cp "$toolsDir;$apksignerJar" com.lyrascore.tools.SignApk $rawApk $outputApk $keystorePath "androiddebugkey" "android"
& $java -cp "$toolsDir;$apksignerJar" com.lyrascore.tools.VerifyApk $outputApk

# Cleanup temp build
Remove-Item $buildDir -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "`n=== APK Package Verification ===" -ForegroundColor Cyan
& $aapt2 dump badging $outputApk | Select-String -Pattern "package:|sdkVersion:|targetSdkVersion:|uses-permission:|launchable-activity:" | ForEach-Object { "  $_" }

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