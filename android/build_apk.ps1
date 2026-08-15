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
$buildDir       = "$androidDir\app\build\temp"
$toolsDir       = "$androidDir\tools"
$outputApk      = "$androidDir\LyraScore.apk"
$keystorePath   = "$androidDir\debug.keystore"

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "         LyraScore - Android APK Builder           " -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan

# Step 1: Frontend Build
Write-Host "`n[1/6] Building Web App (Vite)..." -ForegroundColor Yellow
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

# Step 2: Sync assets
Write-Host "`n[2/6] Syncing assets to Android project..." -ForegroundColor Yellow
$targetAssets = "$androidSrc\assets\dist"
if (Test-Path $targetAssets) {
    Remove-Item $targetAssets -Recurse -Force
}
New-Item -ItemType Directory -Path $targetAssets -Force | Out-Null
Copy-Item -Path "$projectRoot\dist\*" -Destination $targetAssets -Recurse -Force
$assetCount = (Get-ChildItem $targetAssets -Recurse -File).Count
Write-Host "  Synced $assetCount asset files to assets/dist" -ForegroundColor Green

# Step 3: Prepare build dir
if (Test-Path $buildDir) {
    Remove-Item $buildDir -Recurse -Force
}
New-Item -ItemType Directory -Path "$buildDir\res_flat" -Force | Out-Null
New-Item -ItemType Directory -Path "$buildDir\classes" -Force | Out-Null
New-Item -ItemType Directory -Path "$buildDir\gen" -Force | Out-Null
New-Item -ItemType Directory -Path "$buildDir\apk_contents" -Force | Out-Null
New-Item -ItemType Directory -Path "$buildDir\apk_out" -Force | Out-Null
New-Item -ItemType Directory -Path "$buildDir\tools_classes" -Force | Out-Null

# Step 4: Resource linking
Write-Host "`n[3/6] Linking Android resources (AAPT2)..." -ForegroundColor Yellow
$resDir = "$androidSrc\res"
$linkArgs = @("link", "-I", $androidJar, "--manifest", "$androidSrc\AndroidManifest.xml", "--java", "$buildDir\gen", "-o", "$buildDir\resources.apk", "--auto-add-overlay")
if (Test-Path $resDir) {
    & $aapt2 compile --dir $resDir -o "$buildDir\res_flat" 2>&1 | Out-Null
    $flatFiles = (Get-ChildItem "$buildDir\res_flat" -Filter "*.flat").FullName
    foreach ($f in $flatFiles) {
        $linkArgs += @("-R", $f)
    }
}
& $aapt2 @linkArgs 2>&1 | Out-Null
Write-Host "  Generated resources.apk and R.java" -ForegroundColor Green

# Step 5: Compile Java
Write-Host "`n[4/6] Compiling Java sources (javac)..." -ForegroundColor Yellow
$javaSources = @()
Get-ChildItem "$androidSrc\java" -Filter "*.java" -Recurse | ForEach-Object { $javaSources += $_.FullName }
Get-ChildItem "$buildDir\gen" -Filter "*.java" -Recurse -ErrorAction SilentlyContinue | ForEach-Object { $javaSources += $_.FullName }
& $javac -encoding UTF-8 -classpath $androidJar -source 11 -target 11 -d "$buildDir\classes" @javaSources 2>&1 | Out-Null
Write-Host "  Compiled $($javaSources.Count) Java source files" -ForegroundColor Green

# Step 6: DEX bytecode
Write-Host "`n[5/6] Generating DEX bytecode (D8)..." -ForegroundColor Yellow
$classJar = "$buildDir\classes.jar"
& $jar cf $classJar -C "$buildDir\classes" "."
& $java -cp $r8Jar com.android.tools.r8.D8 --lib $androidJar --output "$buildDir\apk_out" --min-api 23 $classJar 2>&1 | Out-Null
Write-Host "  classes.dex generated successfully" -ForegroundColor Green

# Step 7: Assembly and Sign
Write-Host "`n[6/6] Packaging and Signing APK (v1 + v2 + v3 Scheme)..." -ForegroundColor Yellow
Copy-Item "$buildDir\resources.apk" "$buildDir\resources.zip" -Force
Expand-Archive -Path "$buildDir\resources.zip" -DestinationPath "$buildDir\apk_contents" -Force
Copy-Item "$buildDir\apk_out\classes.dex" "$buildDir\apk_contents\" -Force

$distDst = "$buildDir\apk_contents\assets\dist"
New-Item -ItemType Directory -Path $distDst -Force | Out-Null
Copy-Item "$targetAssets\*" $distDst -Recurse -Force

$unsignedApk = "$buildDir\app-unsigned.apk"
if (Test-Path $unsignedApk) {
    Remove-Item $unsignedApk -Force
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($unsignedApk, "Create")
$apkContentPath = "$buildDir\apk_contents"
$filesToZip = Get-ChildItem $apkContentPath -Recurse -File
foreach ($f in $filesToZip) {
    $rel = $f.FullName.Substring($apkContentPath.Length + 1).Replace("\", "/")
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $f.FullName, $rel, "NoCompression") | Out-Null
}
$zip.Dispose()

# Keystore
if (-not (Test-Path $keystorePath)) {
    & $keytool -genkey -v -keystore $keystorePath -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 -storepass android -keypass android -dname "CN=Android Debug,O=Android,C=US" 2>&1 | Out-Null
}

# Compile and run sign tool
& $javac -encoding UTF-8 -cp $apksignerJar -d "$buildDir\tools_classes" "$toolsDir\SignApk.java" "$toolsDir\VerifyApk.java" 2>&1 | Out-Null
& $java -cp "$buildDir\tools_classes;$apksignerJar" com.lyrascore.tools.SignApk $unsignedApk $outputApk $keystorePath "androiddebugkey" "android"

# Verify signature
& $java -cp "$buildDir\tools_classes;$apksignerJar" com.lyrascore.tools.VerifyApk $outputApk

# Cleanup temp build dir
Remove-Item $buildDir -Recurse -Force -ErrorAction SilentlyContinue

if (Test-Path $outputApk) {
    $sizeMB = [math]::Round((Get-Item $outputApk).Length / 1MB, 2)
    Write-Host ""
    Write-Host "===================================================" -ForegroundColor Green
    Write-Host "              BUILD & SIGN SUCCESS!                " -ForegroundColor Green
    Write-Host "===================================================" -ForegroundColor Green
    Write-Host "  APK File: $outputApk" -ForegroundColor White
    Write-Host "  APK Size: $sizeMB MB" -ForegroundColor White
    Write-Host "  Install : adb install -r `"$outputApk`"" -ForegroundColor Cyan
    Write-Host "===================================================" -ForegroundColor Green
} else {
    Write-Host "`nBuild failed: output APK not found." -ForegroundColor Red
    exit 1
}