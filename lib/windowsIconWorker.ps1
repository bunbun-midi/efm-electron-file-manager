# Persistent local worker: one JSON request/response per line. Paths are data,
# never interpolated into PowerShell or C# source. Uses only Windows/.NET APIs.
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;

public static class ShellIconImages {
  [StructLayout(LayoutKind.Sequential)] public struct SIZE { public int cx, cy; }
  [ComImport, Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IImageFactory { [PreserveSig] int GetImage(SIZE size, uint flags, out IntPtr bitmap); }
  [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
  static extern void SHCreateItemFromParsingName(string name, IntPtr context, ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out IImageFactory factory);
  [StructLayout(LayoutKind.Sequential)] struct BITMAP {
    public int type, width, height, widthBytes;
    public ushort planes, bitsPixel;
    public IntPtr bits;
  }
  [StructLayout(LayoutKind.Sequential)] struct BITMAPINFO {
    public uint size; public int width, height; public ushort planes, bits;
    public uint compression, imageSize; public int xPels, yPels; public uint used, important;
  }
  [DllImport("gdi32.dll")] static extern int GetObject(IntPtr bitmap, int count, out BITMAP info);
  [DllImport("gdi32.dll")] static extern IntPtr CreateCompatibleDC(IntPtr dc);
  [DllImport("gdi32.dll")] static extern bool DeleteDC(IntPtr dc);
  [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr obj);
  [DllImport("gdi32.dll")] static extern int GetDIBits(IntPtr dc, IntPtr bitmap, uint start, uint lines, byte[] pixels, ref BITMAPINFO info, uint usage);
  public class Variant { public int width, height; public string dataUrl; }
  static Variant Encode(IntPtr handle) {
    BITMAP source;
    if (GetObject(handle, Marshal.SizeOf(typeof(BITMAP)), out source) == 0) throw new Exception("GetObject failed");
    int width = source.width, height = Math.Abs(source.height);
    if (width <= 0 || height <= 0 || width > 2048 || height > 2048) throw new Exception("Invalid bitmap dimensions");
    var info = new BITMAPINFO { size = 40, width = width, height = -height, planes = 1, bits = 32 };
    var pixels = new byte[width * height * 4];
    IntPtr dc = CreateCompatibleDC(IntPtr.Zero);
    try {
      if (GetDIBits(dc, handle, 0, (uint)height, pixels, ref info, 0) == 0) throw new Exception("GetDIBits failed");
    } finally { DeleteDC(dc); }
    // Shell images carry premultiplied alpha. Preserve it instead of using
    // FromHbitmap, which can discard transparency and introduce black boxes.
    using (var bitmap = new Bitmap(width, height, PixelFormat.Format32bppPArgb)) {
      var locked = bitmap.LockBits(new Rectangle(0, 0, width, height), ImageLockMode.WriteOnly, PixelFormat.Format32bppPArgb);
      try { Marshal.Copy(pixels, 0, locked.Scan0, pixels.Length); }
      finally { bitmap.UnlockBits(locked); }
      using (var stream = new MemoryStream()) {
        bitmap.Save(stream, ImageFormat.Png);
        return new Variant { width = width, height = height, dataUrl = "data:image/png;base64," + Convert.ToBase64String(stream.ToArray()) };
      }
    }
  }
  public static List<Variant> Read(string path) {
    var result = new List<Variant>();
    IImageFactory factory = null;
    try {
      var iid = new Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b");
      SHCreateItemFromParsingName(path, IntPtr.Zero, ref iid, out factory);
      foreach (int size in new int[] {16, 24, 32, 48, 64, 96, 128, 256}) {
        IntPtr bitmap = IntPtr.Zero;
        try {
          // ICONONLY | BIGGERSIZEOK: never substitute a document thumbnail,
          // and accept original larger artwork rather than scaling it down.
          if (factory.GetImage(new SIZE { cx = size, cy = size }, 5, out bitmap) == 0 && bitmap != IntPtr.Zero)
            result.Add(Encode(bitmap));
        } catch { /* retain other available sizes */ }
        finally { if (bitmap != IntPtr.Zero) DeleteObject(bitmap); }
      }
    } finally { if (factory != null) Marshal.ReleaseComObject(factory); }
    return result;
  }
}
'@
while ($null -ne ($requestLine = [Console]::ReadLine())) {
  $request = $null
  try {
    $request = $requestLine | ConvertFrom-Json
    $variants = @([ShellIconImages]::Read([string]$request.path))
    $response = @{ id = $request.id; variants = $variants }
  } catch {
    $response = @{ id = $request.id; variants = @() }
  }
  [Console]::WriteLine(($response | ConvertTo-Json -Depth 5 -Compress))
}
