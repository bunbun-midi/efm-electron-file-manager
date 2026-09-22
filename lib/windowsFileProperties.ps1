$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
$targetPath = [Console]::In.ReadToEnd() | ConvertFrom-Json
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Diagnostics;
public static class FileProperties {
    private delegate bool EnumProc(IntPtr hwnd, IntPtr state);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumProc callback, IntPtr state);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hwnd);
    public static bool HasWindow() {
        uint ownPid = (uint)Process.GetCurrentProcess().Id;
        bool found = false;
        EnumWindows((hwnd, state) => {
            uint pid; GetWindowThreadProcessId(hwnd, out pid);
            if (pid == ownPid && IsWindowVisible(hwnd)) found = true;
            return true;
        }, IntPtr.Zero);
        return found;
    }
    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool SHObjectProperties(IntPtr owner, uint kind, string path, string page);
}
'@
if (-not [FileProperties]::SHObjectProperties([IntPtr]::Zero, 2, $targetPath, $null)) {
    throw 'Windows could not open the Properties dialog.'
}
# Shell property sheets can be created asynchronously. Keep their host alive
# and service its STA message queue until the user closes the sheet.
Add-Type -AssemblyName System.Windows.Forms
$startup = [Diagnostics.Stopwatch]::StartNew()
$seen = $false
do {
    [System.Windows.Forms.Application]::DoEvents()
    $visible = [FileProperties]::HasWindow()
    if ($visible) { $seen = $true }
    if ($seen -and -not $visible) { break }
    Start-Sleep -Milliseconds 50
} while ($visible -or $startup.Elapsed.TotalSeconds -lt 3)
