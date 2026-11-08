# Cuts the black background out of a picture on a black backdrop, leaving a transparent PNG cropped to the subject.
# Only black that touches the picture edge is removed, so dark details inside the subject (eyes etc.) are kept.
# Usage: powershell -ExecutionPolicy Bypass -File scripts\windows\cutout.ps1 -Source kip-original.png [-Out src\web\public\kip.png] [-MaxHeight 360]
param(
  [Parameter(Mandatory = $true)][string]$Source,
  [string]$Out = "",
  [int]$MaxHeight = 360,
  [int]$Threshold = 46
)
$ErrorActionPreference = "Stop"
if (-not $Out) { $Out = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "..\..\src\web\public\kip.png" }
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @"
using System; using System.Collections.Generic; using System.Drawing; using System.Drawing.Imaging; using System.Runtime.InteropServices;
public static class Cutout {
  public static Bitmap Run(string path, int thr, int maxH) {
    Bitmap src = new Bitmap(path);
    int w = src.Width, h = src.Height;
    Bitmap bmp = new Bitmap(w, h, PixelFormat.Format32bppArgb);
    using (Graphics g = Graphics.FromImage(bmp)) g.DrawImage(src, 0, 0, w, h);
    src.Dispose();
    BitmapData d = bmp.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
    byte[] px = new byte[d.Stride * h];
    Marshal.Copy(d.Scan0, px, 0, px.Length);
    Func<int,int,int> mx = (x, y) => { int i = y * d.Stride + x * 4; return Math.Max(px[i], Math.Max(px[i+1], px[i+2])); };
    bool[] bg = new bool[w * h];
    Queue<int> q = new Queue<int>();
    Action<int,int> seed = (x, y) => { int k = y * w + x; if (!bg[k] && mx(x, y) < thr) { bg[k] = true; q.Enqueue(k); } };
    for (int x = 0; x < w; x++) { seed(x, 0); seed(x, h - 1); }
    for (int y = 0; y < h; y++) { seed(0, y); seed(w - 1, y); }
    int[] dx = { 1, -1, 0, 0 }, dy = { 0, 0, 1, -1 };
    while (q.Count > 0) {
      int k = q.Dequeue(); int x = k % w, y = k / w;
      for (int n = 0; n < 4; n++) { int nx = x + dx[n], ny = y + dy[n]; if (nx >= 0 && ny >= 0 && nx < w && ny < h) seed(nx, ny); }
    }
    // Soft edge: subject pixels within 2px of the removed background fade in with brightness, so no black halo remains.
    int minX = w, minY = h, maxX = 0, maxY = 0;
    for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
      int i = y * d.Stride + x * 4; int k = y * w + x;
      if (bg[k]) { px[i+3] = 0; continue; }
      bool near = false;
      for (int oy = -2; oy <= 2 && !near; oy++) for (int ox = -2; ox <= 2 && !near; ox++) {
        int nx = x + ox, ny = y + oy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && bg[ny * w + nx]) near = true;
      }
      if (near) { int a = (int)Math.Min(255, Math.Max(0, (mx(x, y) - 20) * 255 / 70)); px[i+3] = (byte)a; }
      if (px[i+3] > 8) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    }
    Marshal.Copy(px, 0, d.Scan0, px.Length);
    bmp.UnlockBits(d);
    int pad = 4;
    minX = Math.Max(0, minX - pad); minY = Math.Max(0, minY - pad); maxX = Math.Min(w - 1, maxX + pad); maxY = Math.Min(h - 1, maxY + pad);
    int cw = maxX - minX + 1, ch = maxY - minY + 1;
    double s = Math.Min(1.0, (double)maxH / ch);
    Bitmap outB = new Bitmap((int)Math.Round(cw * s), (int)Math.Round(ch * s), PixelFormat.Format32bppArgb);
    using (Graphics g = Graphics.FromImage(outB)) {
      g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
      g.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
      g.DrawImage(bmp, new Rectangle(0, 0, outB.Width, outB.Height), minX, minY, cw, ch, GraphicsUnit.Pixel);
    }
    bmp.Dispose();
    return outB;
  }
}
"@ -ReferencedAssemblies System.Drawing
$result = [Cutout]::Run((Resolve-Path $Source).Path, $Threshold, $MaxHeight)
$outFull = [System.IO.Path]::GetFullPath($Out)
New-Item -ItemType Directory -Force (Split-Path $outFull) | Out-Null
$result.Save($outFull, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "Wrote $outFull ($($result.Width)x$($result.Height))"
$result.Dispose()
