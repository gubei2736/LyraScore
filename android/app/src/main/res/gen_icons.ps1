
Add-Type -AssemblyName System.Drawing

function Draw-ScoreIcon([int]$size, [string]$outPath, [bool]$isRound) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    # 1. 绘制现代天琴蓝微渐变底座
    $rect = New-Object System.Drawing.Rectangle 0, 0, $size, $size
    $color1 = [System.Drawing.Color]::FromArgb(255, 30, 64, 175)
    $color2 = [System.Drawing.Color]::FromArgb(255, 37, 99, 235)
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, $color1, $color2, 45.0
    
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    if ($isRound) {
        $path.AddEllipse(0, 0, $size, $size)
    } else {
        $r = [int]($size * 0.22)
        $d = $r * 2
        $path.AddArc(0, 0, $d, $d, 180, 90)
        $path.AddArc($size - $d, 0, $d, $d, 270, 90)
        $path.AddArc($size - $d, $size - $d, $d, $d, 0, 90)
        $path.AddArc(0, $size - $d, $d, $d, 90, 90)
        $path.CloseFigure()
    }
    $g.FillPath($brush, $path)

    # 2. 绘制精致装饰性弧形乐谱线
    $linePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(60, 255, 255, 255)), ([Math]::Max(1.0, $size * 0.015))
    $y1 = $size * 0.70
    $y2 = $size * 0.76
    $y3 = $size * 0.82
    $g.DrawBezier($linePen, [float]($size*0.1), [float]$y1, [float]($size*0.4), [float]($y1 - $size*0.06), [float]($size*0.7), [float]($y1 + $size*0.06), [float]($size*0.9), [float]$y1)
    $g.DrawBezier($linePen, [float]($size*0.1), [float]$y2, [float]($size*0.4), [float]($y2 - $size*0.06), [float]($size*0.7), [float]($y2 + $size*0.06), [float]($size*0.9), [float]$y2)
    $g.DrawBezier($linePen, [float]($size*0.1), [float]$y3, [float]($size*0.4), [float]($y3 - $size*0.06), [float]($size*0.7), [float]($y3 + $size*0.06), [float]($size*0.9), [float]$y3)

    # 3. 绘制金色高音谱号与音符图案
    $family = New-Object System.Drawing.FontFamily "Segoe UI Symbol"
    if ($family -eq $null) { $family = [System.Drawing.FontFamily]::GenericSansSerif }
    $font = New-Object System.Drawing.Font $family, ([float]($size * 0.48)), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel

    $goldBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 254, 240, 138))
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center

    $textRect = New-Object System.Drawing.RectangleF 0, ([float]($size * 0.02)), [float]$size, [float]$size
    $g.DrawString([char]0x266B, $font, $goldBrush, $textRect, $sf)

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
    $dir = "G:\Project\android\app\src\main\res\" + $m.name
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force }
    Draw-ScoreIcon $m.size ($dir + "\ic_launcher.png") $false
    Draw-ScoreIcon $m.size ($dir + "\ic_launcher_round.png") $true
}
Write-Host "All Android App Icons created with perfect music symbol!"
