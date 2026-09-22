Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System.Runtime.InteropServices;
public static class ClipboardSequence { [DllImport("user32.dll")] public static extern uint GetClipboardSequenceNumber(); }
'@
function Read-Files {
  for ($attempt=0; $attempt -lt 4; $attempt++) {
    $before=[ClipboardSequence]::GetClipboardSequenceNumber()
    $data=[Windows.Forms.Clipboard]::GetDataObject()
    $paths=@(); $mode='copy'
    if ($data -and $data.GetDataPresent([Windows.Forms.DataFormats]::FileDrop)) {
      $paths=@($data.GetData([Windows.Forms.DataFormats]::FileDrop))
      if(@($paths | Where-Object { [string]::IsNullOrWhiteSpace($_) -or -not [IO.Path]::IsPathRooted($_) }).Count -gt 0) { Start-Sleep -Milliseconds 25; continue }
      $effect=$data.GetData('Preferred DropEffect')
      if ($effect -is [IO.Stream]) { $effect.Position=0; $bytes=New-Object byte[] 4; [void]$effect.Read($bytes,0,4); if ([BitConverter]::ToUInt32($bytes,0) -eq 2) { $mode='cut' } }
    }
    $after=[ClipboardSequence]::GetClipboardSequenceNumber()
    if ($before -eq $after) { return @{ paths=$paths; mode=$mode; token=[string]$after } }
  }
  throw 'Clipboard changed while reading. Try Paste again.'
}
function Write-Files($paths,$mode) {
  if ($paths.Count -eq 0) { [Windows.Forms.Clipboard]::Clear() }
  else {
    $data=New-Object Windows.Forms.DataObject
    $list=New-Object Collections.Specialized.StringCollection
    foreach($p in $paths) { [void]$list.Add([string]$p) }
    $data.SetFileDropList($list)
    $effect=1; if($mode -eq 'cut'){$effect=2}
    $stream=New-Object IO.MemoryStream(,[BitConverter]::GetBytes([uint32]$effect))
    $data.SetData('Preferred DropEffect',$stream)
    [Windows.Forms.Clipboard]::SetDataObject($data,$true,10,50)
  }
  return Read-Files
}
while($line=[Console]::ReadLine()) {
  $request=$null
  try {
    $request=$line | ConvertFrom-Json
    switch($request.action) {
      'checkpoint' {
        $original=[Windows.Forms.Clipboard]::GetDataObject()
        $savedClipboard=New-Object Windows.Forms.DataObject
        if($original){foreach($format in $original.GetFormats($false)){
          $value=$original.GetData($format,$false)
          if($value -is [IO.MemoryStream]){$value=New-Object IO.MemoryStream(,$value.ToArray())}
          if($null -ne $value){$savedClipboard.SetData($format,$false,$value)}
        }}
        $result=@{saved=$true}
      }
      'restore' { if($savedClipboard){[Windows.Forms.Clipboard]::SetDataObject($savedClipboard,$true)};$result=@{restored=$true} }
      'ping' { $result=@{ ready=$true } }
      'read' { $result=Read-Files }
      'write' { $result=Write-Files @($request.paths) $request.mode }
      'commit' {
        if([string][ClipboardSequence]::GetClipboardSequenceNumber() -eq [string]$request.token) { $result=Write-Files @($request.paths) 'cut' }
        else { $result=@{ changed=$true } }
      }
      default { throw 'Unsupported clipboard operation' }
    }
    @{id=$request.id;result=$result} | ConvertTo-Json -Depth 8 -Compress | ForEach-Object { [Console]::WriteLine($_) }
  } catch { @{id=$request.id;error=$_.Exception.Message} | ConvertTo-Json -Compress | ForEach-Object { [Console]::WriteLine($_) } }
}

