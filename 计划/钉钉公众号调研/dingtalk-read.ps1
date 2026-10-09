param(
  [ValidateSet('status','search','messages')][string]$Action = 'status',
  [string]$Query,
  [string]$ConversationId,
  [string]$Since,
  [string]$Profile
)
$ErrorActionPreference = 'Stop'
$cli = Join-Path $PSScriptRoot 'dws\dws.exe'
if (-not (Test-Path -LiteralPath $cli)) { throw '缺少本目录的官方 dws.exe。' }
if ($Action -eq 'status') {
  & $cli version
  & $cli auth status
  exit $LASTEXITCODE
}
$cliArgs = @()
if ($Profile) { $cliArgs += @('--profile', $Profile) }
$statusText = & $cli auth status @cliArgs
if ($LASTEXITCODE -ne 0) { throw '无法读取钉钉登录状态。' }
$auth = ($statusText -join "`n") | ConvertFrom-Json
if (-not $auth.authenticated) { throw '尚未授权钉钉。千问办公内的连接器登录态不一定会被独立 CLI 继承。' }
if ($Action -eq 'search') {
  if (-not $Query) { throw 'search 需要 -Query 群名称。' }
  $cliArgs += @('chat','search','--query',$Query)
} else {
  if (-not $ConversationId) { throw 'messages 需要 -ConversationId。' }
  $cliArgs += @('chat','message','list','--conversation-id',$ConversationId,'--limit','20')
  if ($Since) { $cliArgs += @('--time',$Since,'--direction','newer') }
}
& $cli @cliArgs --timeout 20
exit $LASTEXITCODE
