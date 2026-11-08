# Creates the Kip icon (scripts/windows/kip.ico) and a "Kip" shortcut on the Desktop that runs scripts/start.sh in Git Bash.
# Run:  powershell -ExecutionPolicy Bypass -File scripts\windows\install-shortcut.ps1
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = (Resolve-Path "$PSScriptRoot\..\..").Path
$icoPath = Join-Path $PSScriptRoot "kip.ico"

# --- Icon: red rounded square with a white "K" (256px PNG wrapped in an .ico) ---
$size = 256
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = "AntiAlias"; $g.TextRenderingHint = "AntiAliasGridFit"
$g.Clear([System.Drawing.Color]::Transparent)
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$r = 56; $d = $r * 2
$path.AddArc(0, 0, $d, $d, 180, 90); $path.AddArc($size - $d, 0, $d, $d, 270, 90)
$path.AddArc($size - $d, $size - $d, $d, $d, 0, 90); $path.AddArc(0, $size - $d, $d, $d, 90, 90); $path.CloseFigure()
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush ([System.Drawing.Point]::new(0, 0)), ([System.Drawing.Point]::new($size, $size)), ([System.Drawing.Color]::FromArgb(255, 255, 70, 70)), ([System.Drawing.Color]::FromArgb(255, 150, 10, 25))
$g.FillPath($brush, $path)
$font = New-Object System.Drawing.Font "Segoe UI", 150, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$fmt = New-Object System.Drawing.StringFormat; $fmt.Alignment = "Center"; $fmt.LineAlignment = "Center"
$g.DrawString("K", $font, [System.Drawing.Brushes]::White, [System.Drawing.RectangleF]::new(0, 6, $size, $size), $fmt)
$g.Dispose()
$ms = New-Object System.IO.MemoryStream; $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); $png = $ms.ToArray()
$out = New-Object System.IO.MemoryStream; $w = New-Object System.IO.BinaryWriter $out
$w.Write([uint16]0); $w.Write([uint16]1); $w.Write([uint16]1)             # ICONDIR: 1 image
$w.Write([byte]0); $w.Write([byte]0); $w.Write([byte]0); $w.Write([byte]0) # 256x256 (0 = 256), no palette
$w.Write([uint16]1); $w.Write([uint16]32); $w.Write([uint32]$png.Length); $w.Write([uint32]22)
$w.Write($png); [System.IO.File]::WriteAllBytes($icoPath, $out.ToArray())

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
Write-Host "Created $lnkPath"
