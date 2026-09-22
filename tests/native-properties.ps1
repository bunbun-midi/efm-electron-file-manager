# Integration smoke test: close only property sheets owned by this test process.
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
public static class PropertySheetTest {
    delegate bool EnumProc(IntPtr hwnd, IntPtr state);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback, IntPtr state);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr hwnd, StringBuilder text, int size);
    [DllImport("user32.dll")] static extern bool PostMessage(IntPtr hwnd, uint message, IntPtr w, IntPtr l);
    static Timer timer;
    static int ticks;
    public static bool Found;
    public static void Start(uint ownPid) {
        timer = new Timer(_ => {
            EnumWindows((hwnd, state) => {
                uint pid; GetWindowThreadProcessId(hwnd, out pid);
                if (pid != ownPid) return true;
                var name = new StringBuilder(128); GetClassName(hwnd, name, name.Capacity);
                if (name.ToString() == "#32770") {
                    Found = true; PostMessage(hwnd, 0x10, IntPtr.Zero, IntPtr.Zero);
                }
                return true;
            }, IntPtr.Zero);
            if (Interlocked.Increment(ref ticks) > 40) Environment.Exit(2);
        }, null, 500, 500);
    }
    public static void Stop() { timer.Dispose(); }
}
'@
$testPath = Join-Path $PSScriptRoot 'native properties Unicode-é.txt'
try {
    Set-Content -LiteralPath $testPath -Value 'Properties test'
    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = 'powershell.exe'
    $scriptPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../lib/windowsFileProperties.ps1'))
    $info.Arguments = '-NoProfile -NonInteractive -Sta -File "' + $scriptPath + '"'
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardInput = $true
    $child = [Diagnostics.Process]::Start($info)
    [PropertySheetTest]::Start($child.Id)
    $json = ConvertTo-Json $testPath -Compress
    $bytes = [Text.Encoding]::UTF8.GetBytes($json)
    $child.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
    $child.StandardInput.Close()
    if (-not $child.WaitForExit(15000)) { $child.Kill(); throw 'Properties test timed out.' }
    [PropertySheetTest]::Stop()
    if ($child.ExitCode -ne 0) { throw 'Properties helper failed.' }
    if (-not [PropertySheetTest]::Found) { throw 'No native Properties dialog appeared.' }
    Write-Output 'Native Windows Properties dialog opened and closed successfully.'
} finally {
    Remove-Item -LiteralPath $testPath -ErrorAction SilentlyContinue
}
