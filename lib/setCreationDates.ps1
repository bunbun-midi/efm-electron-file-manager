$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.Encoding]::UTF8
$items = [Console]::In.ReadToEnd() | ConvertFrom-Json
$failed = @()
foreach ($item in $items) {
    try {
        $date = [DateTime]::SpecifyKind([DateTime]'1970-01-01', [DateTimeKind]::Utc).AddMilliseconds([double]$item.created)
        if ([IO.Directory]::Exists([string]$item.path)) {
            [IO.Directory]::SetCreationTimeUtc([string]$item.path, $date)
        } else {
            [IO.File]::SetCreationTimeUtc([string]$item.path, $date)
        }
    } catch { $failed += [string]$item.path }
}
ConvertTo-Json -InputObject @($failed) -Compress
