
Add-Type -AssemblyName System.Drawing

function Create-AppIcon([int]$size, [string]$filePath, [bool]$isRound) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    $rect = New-Object System.Drawing.Rectangle 0, 0, $size, $size
    $c1 = [System.Drawing.Color]::FromArgb(255, 26, 86, 219)
    $c2 = [System.Drawing.Color]::FromArgb(255, 37, 99, 235)
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, $c1, $c2, 45.0
    
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

    # 绘制高保真乐谱与天琴标志 (金色线条与音符)
    $goldPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 253, 224, 71)), ([Math]::Max(2.0, $size * 0.035))
    $goldBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 253, 224, 71))
    
    # 绘制两个发光音符头与符干
    $headR = [float]($size * 0.11)
    $x1 = [float]($size * 0.32)
    $y1 = [float]($size * 0.65)
    $x2 = [float]($size * 0.68)
    $y2 = [float]($size * 0.55)
    
    # 音符1
    $g.FillEllipse($goldBrush, [float]($x1 - $headR), [float]($y1 - $headR * 0.7), [float]($headR * 2), [float]($headR * 1.4))
    # 音符2
    $g.FillEllipse($goldBrush, [float]($x2 - $headR), [float]($y2 - $headR * 0.7), [float]($headR * 2), [float]($headR * 1.4))
    
    # 符干
    $stemTopY = [float]($size * 0.26)
    $g.DrawLine($goldPen, [float]($x1 + $headR * 0.7), $y1, [float]($x1 + $headR * 0.7), $stemTopY)
    $g.DrawLine($goldPen, [float]($x2 + $headR * 0.7), $y2, [float]($x2 + $headR * 0.7), [float]($stemTopY - $size * 0.05))
    
    # 符杠连接
    $beamPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 253, 224, 71)), ([Math]::Max(3.0, $size * 0.07))
    $g.DrawLine($beamPen, [float]($x1 + $headR * 0.7), $stemTopY, [float]($x2 + $headR * 0.7), [float]($stemTopY - $size * 0.05))

    $bmp.Save($filePath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
}

$sizes = @(
    @{ dir='mipmap-mdpi'; size=48 },
    @{ dir='mipmap-hdpi'; size=72 },
    @{ dir='mipmap-xhdpi'; size=96 },
    @{ dir='mipmap-xxhdpi'; size=144 },
    @{ dir='mipmap-xxxhdpi'; size=192 }
)

foreach ($item in $sizes) {
    $targetDir = "G:\Project\android\app\src\main\res\" + $item.dir
    if (-not (Test-Path $targetDir)) { New-Item -ItemType Directory -Path $targetDir -Force }
    Create-AppIcon $item.size ($targetDir + "\ic_launcher.png") $false
    Create-AppIcon $item.size ($targetDir + "\ic_launcher_round.png") $true
}
Write-Host "SUCCESS: Generated beautiful crisp music icons!"
