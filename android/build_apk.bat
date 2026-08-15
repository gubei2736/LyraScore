@echo off
chcp 65001 >nul
echo ===================================================
echo   LyraScore 天琴乐谱 - Android APK 极速打包程序
echo ===================================================

cd /d "%~dp0\.."

set "PATH=D:\Public_Environment\Node\nvm\v20.18.0;D:\Public_Environment\Git\cmd;%PATH%"

echo [1/3] 正在构建前端离线轻量资源 (Vite Build)...
call npm run build

if %errorlevel% neq 0 (
    echo [错误] 前端资源构建失败，请检查控制台错误！
    pause
    exit /b %errorlevel%
)

echo [2/3] 正在同步资源至 Android Assets 目录...
if not exist "android\app\src\main\assets\dist" mkdir "android\app\src\main\assets\dist"
xcopy /E /I /Y "dist\*" "android\app\src\main\assets\dist\" >nul

echo [3/3] 前端资源已完整打包至 Android 原生工程！
echo APK 工程目录：G:\Project\android
echo.
echo 提示：
echo 1. 您可以使用 Android Studio 打开 G:\Project\android 工程，一键点击 'Build APK' 生成 APK。
echo 2. 您也可以在本地使用 'npm run dev' 实时启动乐谱阅读器并在平板浏览器中沉浸全屏阅读。
echo ===================================================
pause
