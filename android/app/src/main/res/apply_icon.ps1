
Add-Type -AssemblyName System.Drawing

$srcImage = [System.Drawing.Image]::FromFile("G:\\Project\\android\\图标.png")

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
    $dir = "G:\\Project\\android\\app\\src\\main\\res\\" + $m.name
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force }
    Resize-Icon $m.size ($dir + "\\ic_launcher.png") $false
    Resize-Icon $m.size ($dir + "\\ic_launcher_round.png") $true
}

$srcImage.Dispose()
Write-Host "SUCCESS: Converted user icon to all Android mipmaps!"
