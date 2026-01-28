param(
  [string]$InputPath = "images\\eye2.png",
  [string]$OutputPath = "images\\eye2-small.png",
  [int]$TargetHeight = 14
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$img = [System.Drawing.Image]::FromFile($InputPath)
try {
  $targetW = [int][Math]::Round($img.Width * ($TargetHeight / [double]$img.Height))

  $bmp = New-Object System.Drawing.Bitmap $targetW, $TargetHeight
  try {
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    try {
      $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $g.DrawImage($img, 0, 0, $targetW, $TargetHeight)
    } finally {
      $g.Dispose()
    }

    $bmp.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $bmp.Dispose()
  }

  Write-Host ("Wrote {0} ({1}x{2})" -f $OutputPath, $targetW, $TargetHeight)
} finally {
  $img.Dispose()
}

