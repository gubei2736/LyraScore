/**
 * 生成 LyraScore 应用专属高清图标 (App Launcher Icons)
 * 采用天琴音乐谱号设计 + 现代渐变天琴蓝底座
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const resDir = path.resolve(__dirname, 'android/app/src/main/res');

// 创建各分辨率目录
const mipmaps = [
  { name: 'mipmap-mdpi', size: 48 },
  { name: 'mipmap-hdpi', size: 72 },
  { name: 'mipmap-xhdpi', size: 96 },
  { name: 'mipmap-xxhdpi', size: 144 },
  { name: 'mipmap-xxxhdpi', size: 192 }
];

mipmaps.forEach(m => {
  const dir = path.join(resDir, m.name);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// 构建高保真 SVG 图标 (音乐五线谱与天琴高音谱号)
function getSvg(isRound = false) {
  const rx = isRound ? '256' : '96';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
    <defs>
      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#1e40af" />
        <stop offset="50%" stop-color="#1d4ed8" />
        <stop offset="100%" stop-color="#2563eb" />
      </linearGradient>
      <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#fef08a" />
        <stop offset="50%" stop-color="#facc15" />
        <stop offset="100%" stop-color="#eab308" />
      </linearGradient>
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000000" flood-opacity="0.35" />
      </filter>
    </defs>
    
    <!-- 背景圆角底座 -->
    <rect width="512" height="512" rx="${rx}" fill="url(#bgGrad)" />
    
    <!-- 装饰性微五线谱弧线 -->
    <path d="M 64 360 Q 256 340 448 360" stroke="rgba(255,255,255,0.15)" stroke-width="4" fill="none" />
    <path d="M 64 380 Q 256 360 448 380" stroke="rgba(255,255,255,0.15)" stroke-width="4" fill="none" />
    <path d="M 64 400 Q 256 380 448 400" stroke="rgba(255,255,255,0.15)" stroke-width="4" fill="none" />
    
    <!-- 核心天琴高音谱号与音符徽标 -->
    <g filter="url(#glow)">
      <!-- 谱号大字符 -->
      <text x="256" y="375" font-size="340" font-family="'Segoe UI Symbol', 'Cinzel', 'Playfair Display', serif" fill="url(#goldGrad)" text-anchor="middle" font-weight="bold">🎼</text>
    </g>
  </svg>`;
}

const svgSquare = getSvg(false);
const svgRound = getSvg(true);

const squareSvgPath = path.join(resDir, 'icon_square.svg');
const roundSvgPath = path.join(resDir, 'icon_round.svg');
fs.writeFileSync(squareSvgPath, svgSquare, 'utf8');
fs.writeFileSync(roundSvgPath, svgRound, 'utf8');

console.log('SVG 图标已就绪，正在生成 Android PNG mipmap...');

// 使用 powershell 的 .NET Drawing API 渲染 SVG/PNG
const psScript = `
Add-Type -AssemblyName System.Drawing

function Draw-ScoreIcon([int]$size, [string]$outPath, [bool]$isRound) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.Clear([System.Drawing.Color]::Transparent)

    # 渐变底座
    $rect = New-Object System.Drawing.Rectangle 0, 0, $size, $size
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.Color]::FromArgb(255, 30, 64, 175)), ([System.Drawing.Color]::FromArgb(255, 37, 99, 235)), 45.0
    
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $radius = if ($isRound) { $size / 2 } else { $size * 0.22 }
    $d = $radius * 2
    $path.AddArc(0, 0, $d, $d, 180, 90)
    $path.AddArc($size - $d, 0, $d, $d, 270, 90)
    $path.AddArc($size - $d, $size - $d, $d, $d, 0, 90)
    $path.AddArc(0, $size - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    
    $g.FillPath($brush, $path)

    # 绘制音符与天琴图案
    $fontSize = [float]($size * 0.62)
    $font = New-Object System.Drawing.Font "Segoe UI Emoji", $fontSize, [System.Drawing.FontStyle]::Bold
    if ($font.Name -ne "Segoe UI Emoji") {
        $font = New-Object System.Drawing.Font "Arial", $fontSize, [System.Drawing.FontStyle]::Bold
    }
    
    $stringFormat = New-Object System.Drawing.StringFormat
    $stringFormat.Alignment = [System.Drawing.StringAlignment]::Center
    $stringFormat.LineAlignment = [System.Drawing.StringAlignment]::Center

    $textBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 254, 240, 138))
    $textRect = New-Object System.Drawing.RectangleF 0, ([float]($size * 0.04)), $size, $size
    $g.DrawString([char]::ConvertFromUtf32(0x1F3BC), $font, $textBrush, $textRect, $stringFormat)

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
    $dir = "G:\\Project\\android\\app\\src\\main\\res\\" + $m.name
    Draw-ScoreIcon $m.size ($dir + "\\ic_launcher.png") $false
    Draw-ScoreIcon $m.size ($dir + "\\ic_launcher_round.png") $true
}
Write-Host "All Android mipmap icons generated successfully!"
`;

fs.writeFileSync(path.join(resDir, 'gen.ps1'), psScript, 'utf8');
execSync(`powershell -ExecutionPolicy Bypass -File "${path.join(resDir, 'gen.ps1')}"`, { stdio: 'inherit' });
console.log('✅ 所有分辨率高清 App Launcher 图标生成完毕！');
