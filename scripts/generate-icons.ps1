# Generates every icon size Recall needs from one source image.
#
# Run:  powershell -NoProfile -File scripts/generate-icons.ps1 <source.png>
#
# System.Drawing ships with Windows, so this needs no image library. High-quality
# bicubic resampling matters here: the logo has fine circuit tracery that turns
# to mush at 16px with the default filter.

param([Parameter(Mandatory = $true)][string]$Source)

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$src = [System.Drawing.Image]::FromFile((Resolve-Path $Source))

function Save-Resized($width, $path) {
    $dir = Split-Path -Parent $path
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }

    $bmp = New-Object System.Drawing.Bitmap($width, $width)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($src, 0, 0, $width, $width)
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()

    "  {0,-52} {1}px" -f (Split-Path -Leaf $path), $width
}

"Website:"
Save-Resized 512 (Join-Path $root "public\logo.png")
Save-Resized 512 (Join-Path $root "app\icon.png")          # Next.js favicon
Save-Resized 180 (Join-Path $root "app\apple-icon.png")    # iOS home screen

"`nExtension:"
foreach ($s in 16, 32, 48, 128) {
    Save-Resized $s (Join-Path $root "extension\icons\icon$s.png")
}

"`nAndroid launcher:"
$densities = @{ "mdpi" = 48; "hdpi" = 72; "xhdpi" = 96; "xxhdpi" = 144; "xxxhdpi" = 192 }
foreach ($d in $densities.Keys) {
    Save-Resized $densities[$d] (Join-Path $root "android\app\src\main\res\mipmap-$d\ic_launcher.png")
    Save-Resized $densities[$d] (Join-Path $root "android\app\src\main\res\mipmap-$d\ic_launcher_round.png")
}

$src.Dispose()
"`nDone."
