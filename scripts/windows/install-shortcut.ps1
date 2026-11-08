# Creates the Kip icon (scripts/windows/kip.ico, made from the Kip picture in src/web/public/kip.png) and a "Kip" shortcut
# on the Desktop that runs scripts/start.sh in Git Bash.
# Run:  powershell -ExecutionPolicy Bypass -File scripts\windows\install-shortcut.ps1
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = (Resolve-Path "$PSScriptRoot\..\..").Path
$icoPath = Join-Path $PSScriptRoot "kip.ico"
$sprite = Join-Path $root "src\web\public\kip.png"
if (-not (Test-Path $sprite)) { throw "Missing $sprite" }

# --- Icon: Kip centred on a transparent square, saved at several sizes (PNG images wrapped in an .ico) ---
$src = New-Object System.Drawing.Bitmap $sprite
# Find the picture's real edges (ignoring see-through margins) so Kip fills the icon edge to edge.
$minX = $src.Width; $minY = $src.Height; $maxX = 0; $maxY = 0
for ($y = 0; $y -lt $src.Height; $y++) { for ($x = 0; $x -lt $src.Width; $x++) {
  if ($src.GetPixel($x, $y).A -gt 40) { if ($x -lt $minX) { $minX = $x }; if ($x -gt $maxX) { $maxX = $x }; if ($y -lt $minY) { $minY = $y }; if ($y -gt $maxY) { $maxY = $y } }
} }
$cropW = $maxX - $minX + 1; $cropH = $maxY - $minY + 1
$sizes = 256, 128, 64, 48, 32, 16
$pngs = foreach ($size in $sizes) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = "HighQualityBicubic"; $g.SmoothingMode = "AntiAlias"; $g.PixelOffsetMode = "HighQuality"
  $g.Clear([System.Drawing.Color]::Transparent)
  $margin = [Math]::Max(1, [Math]::Round($size * 0.02))        # almost no empty border
  $scale = [Math]::Min(($size - 2 * $margin) / $cropW, ($size - 2 * $margin) / $cropH)
  $w = $cropW * $scale; $h = $cropH * $scale
  $dest = New-Object System.Drawing.RectangleF ([single](($size - $w) / 2)), ([single](($size - $h) / 2)), ([single]$w), ([single]$h)
  $g.DrawImage($src, $dest, (New-Object System.Drawing.RectangleF ([single]$minX), ([single]$minY), ([single]$cropW), ([single]$cropH)), [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose()
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  , @{ Size = $size; Bytes = $ms.ToArray() }
}
$src.Dispose()
$out = New-Object System.IO.MemoryStream
$w = New-Object System.IO.BinaryWriter $out
$w.Write([uint16]0); $w.Write([uint16]1); $w.Write([uint16]$pngs.Count)  # ICONDIR
$offset = 6 + 16 * $pngs.Count
foreach ($p in $pngs) {
  $dim = if ($p.Size -ge 256) { 0 } else { $p.Size }                      # 0 means 256
  $w.Write([byte]$dim); $w.Write([byte]$dim); $w.Write([byte]0); $w.Write([byte]0)
  $w.Write([uint16]1); $w.Write([uint16]32); $w.Write([uint32]$p.Bytes.Length); $w.Write([uint32]$offset)
  $offset += $p.Bytes.Length
}
foreach ($p in $pngs) { $w.Write($p.Bytes) }
[System.IO.File]::WriteAllBytes($icoPath, $out.ToArray())

# --- Shortcut: Git Bash, started in the repo, running start.sh ---
$gitBash = @("$env:ProgramFiles\Git\git-bash.exe", "${env:ProgramFiles(x86)}\Git\git-bash.exe", "$env:LOCALAPPDATA\Programs\Git\git-bash.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $gitBash) { throw "Git for Windows (git-bash.exe) not found. Install it from https://git-scm.com" }
$lnkPath = Join-Path ([Environment]::GetFolderPath("Desktop")) "Kip.lnk"
$sh = (New-Object -ComObject WScript.Shell).CreateShortcut($lnkPath)
$sh.TargetPath = $gitBash
$sh.Arguments = "--cd=`"$root`" -c `"./scripts/start.sh`""
$sh.WorkingDirectory = $root
$sh.IconLocation = "$icoPath,0"
$sh.Description = "Start Kip - morning briefing"
$sh.Save()
Write-Host "Created $icoPath and $lnkPath"
