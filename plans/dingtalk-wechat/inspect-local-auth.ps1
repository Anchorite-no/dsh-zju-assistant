# Read only. Inspect only DingTalk CLI / QwenWork auth metadata; never output credentials.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security.Cryptography.ProtectedData

function Get-Shape($Value, [int]$Depth = 0) {
  if ($null -eq $Value) { return $null }
  if ($Depth -gt 3) { return '[nested]' }
  if ($Value -is [System.Collections.IEnumerable] -and $Value -isnot [string] -and $Value -isnot [pscustomobject]) {
    return @($Value | Select-Object -First 8 | ForEach-Object { Get-Shape $_ ($Depth + 1) })
  }
  if ($Value -isnot [pscustomobject]) { return '[' + $Value.GetType().Name + ']' }
  $out = [ordered]@{}
  foreach ($p in $Value.PSObject.Properties) {
    if ($p.Name -match '(?i)token|secret|password|credential|cookie|authorization|code') {
      $out[$p.Name] = if ($p.Value) { '[present, redacted]' } else { '[absent]' }
    } elseif ($p.Name -match '^(schemaVersion|loginMethod|expiresAt|refreshExpiresAt|target|orgName|corpName|teamName|hasEnterpriseContext|hasSeat|seatAssigned|isEnterprise|isBiz|refreshStrategy|status|version)$') {
      $out[$p.Name] = $p.Value
    } elseif ($p.Value -is [pscustomobject] -or $p.Value -is [array]) {
      $out[$p.Name] = Get-Shape $p.Value ($Depth + 1)
    } else {
      $out[$p.Name] = if ($null -eq $p.Value) { $null } else { '[' + $p.Value.GetType().Name + ']' }
    }
  }
  return $out
}

$registryEntries = @()
$identityPairs = @()
$service = 'dws-cli'
$regPath = 'HKCU:\Software\DwsCli\keychain\dws-cli'
if (Test-Path -LiteralPath $regPath) {
  $reg = Get-Item -LiteralPath $regPath
  foreach ($valueName in $reg.GetValueNames()) {
    $padded = $valueName.Replace('-','+').Replace('_','/')
    $padded += '=' * ((4 - $padded.Length % 4) % 4)
    $account = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($padded))
    if (-not $account.StartsWith('auth-token')) { continue }
    $cipher = [Convert]::FromBase64String($reg.GetValue($valueName))
    $entropy = [Text.Encoding]::UTF8.GetBytes($service + [char]0 + $account)
    $plain = [Security.Cryptography.ProtectedData]::Unprotect($cipher,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    try {
      $data = [Text.Encoding]::UTF8.GetString($plain) | ConvertFrom-Json
      $identityPairs += [string]$data.corp_id + '|' + [string]$data.user_id
      $registryEntries += [pscustomobject]@{
        slot = if ($account -eq 'auth-token') {'legacy-mirror'} elseif ($account.StartsWith('auth-token:id:')) {'identity'} else {'organization-mirror'}
        organization = $data.corp_name
        source = $data.source
        accessTokenPresent = [bool]$data.access_token
        refreshTokenPresent = [bool]$data.refresh_token
        expiresAt = $data.expires_at
        refreshExpiresAt = $data.refresh_expires_at
      }
    } finally { [Array]::Clear($plain,0,$plain.Length) }
  }
}

$qwenDir = Join-Path $env:APPDATA 'QwenWorkCN'
$qwen = @()
$state = Get-Content -LiteralPath (Join-Path $qwenDir 'Local State') -Raw | ConvertFrom-Json
$wrappedKey = [Convert]::FromBase64String($state.os_crypt.encrypted_key)
if ([Text.Encoding]::ASCII.GetString($wrappedKey,0,5) -ne 'DPAPI') { throw 'Unsupported local key format' }
$key = [Security.Cryptography.ProtectedData]::Unprotect($wrappedKey[5..($wrappedKey.Length-1)],$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
try {
  foreach ($file in @('auth.dat','auth-v2.dat')) {
    $filePath = Join-Path $qwenDir $file
    if (-not (Test-Path -LiteralPath $filePath)) { continue }
    $blob = [IO.File]::ReadAllBytes($filePath)
    if ($blob.Length -lt 31 -or [Text.Encoding]::ASCII.GetString($blob,0,3) -ne 'v10') { throw 'Unsupported auth file format' }
    $iv = [byte[]]$blob[3..14]
    $ciphertext = [byte[]]$blob[15..($blob.Length-17)]
    $tag = [byte[]]$blob[($blob.Length-16)..($blob.Length-1)]
    $plain = [byte[]]::new($ciphertext.Length)
    $aes = [Security.Cryptography.AesGcm]::new([byte[]]$key,16)
    try {
      $aes.Decrypt($iv,$ciphertext,$tag,$plain)
      $data = [Text.Encoding]::UTF8.GetString($plain) | ConvertFrom-Json
      $qwen += [pscustomobject]@{file=$file;schema=(Get-Shape $data)}
    } finally { $aes.Dispose(); [Array]::Clear($plain,0,$plain.Length) }
  }
} finally { [Array]::Clear($key,0,$key.Length) }
[pscustomobject]@{distinctDwsIdentities=@($identityPairs | Select-Object -Unique).Count;dws=$registryEntries;qwen=$qwen} | ConvertTo-Json -Depth 12
