@echo off
setlocal
cd /d "%~dp0\.."

set "PATH=D:\Public_Environment\Node\nvm\v20.18.0;D:\Public_Environment\Git\cmd;%PATH%"

echo ===================================================
echo   LyraScore - Android APK Builder
echo ===================================================

echo [1/3] Building frontend offline assets...
call "D:\Public_Environment\Node\nvm\v20.18.0\npm.cmd" run build

if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Frontend build failed!
    pause
    exit /b %ERRORLEVEL%
)

echo [2/3] Syncing assets to Android folder...
if not exist "android\app\src\main\assets\dist" (
    mkdir "android\app\src\main\assets\dist"
)

xcopy /E /I /Y "dist\*" "android\app\src\main\assets\dist\" >nul

echo [3/3] Frontend assets successfully synced to Android!
echo.
echo Android Project: %~dp0
echo.
echo You can now open this folder in Android Studio and build your APK!
echo ===================================================
pause
