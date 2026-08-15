const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const srcIconPath = path.resolve(__dirname, 'android/图标.png');
const resDir = path.resolve(__dirname, 'android/app/src/main/res');

const psScript = `
Add-Type -AssemblyName System.Drawing

$srcImage = [System.Drawing.Image]::FromFile("${srcIconPath.replace(/\\/g, '\\\\')}")

function Resize-Icon([int]$size, [string]$outPath, [bool]$isRound) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    if ($isRound) {
        $path = New-Object System.Drawing.Drawing2D.GraphicsPath
        $path.AddEllipse(0, 0, $size, $size)
        $g.SetClip($path)
    }

    $destRect = New-Object System.Drawing.Rectangle 0, 0, $size, $size
    $g.DrawImage($srcImage, $destRect, 0, 0, $srcImage.Width, $srcImage.Height, [System.Drawing.GraphicsUnit]::Pixel)

    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
}

$mipmaps = @(
    @{ name='mipmap-mdpi'; size=48 },
    @{ name='mipmap-hdpi'; size=72 },
    @{ name='mipmap-xhdpi'; size=96 },
    @{ name='mipmap-xxhdpi'; size=144 },
    @{ name='mipmap-xxxhdpi'; size=192 }
)

foreach ($m in $mipmaps) {
    $dir = "${resDir.replace(/\\/g, '\\\\')}\\\\" + $m.name
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force }
    Resize-Icon $m.size ($dir + "\\\\ic_launcher.png") $false
    Resize-Icon $m.size ($dir + "\\\\ic_launcher_round.png") $true
}

$srcImage.Dispose()
Write-Host "SUCCESS: Converted user icon to all Android mipmaps!"
`;

fs.writeFileSync(path.join(resDir, 'apply_icon.ps1'), psScript, 'utf8');
execSync(`powershell -ExecutionPolicy Bypass -File "${path.join(resDir, 'apply_icon.ps1')}"`, { stdio: 'inherit' });
console.log('✅ 用户专属图标已成功应用至各分辨率 mipmap 资源目录！');
