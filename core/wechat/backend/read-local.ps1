# JSON protocol: one snapshot for all registered public accounts. No UI/network.
param([switch]$Doctor, [string]$TargetsPath, [string]$PythonPath)
$ErrorActionPreference='Stop'
$OutputEncoding=[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
function Emit-Failure([string]$Code){[pscustomobject]@{ok=$false;error=@{code=$Code};source=$script:source}|ConvertTo-Json -Compress -Depth 5;exit 1}
try {
 $owners=@(Get-CimInstance Win32_Process|Where-Object{$_.Name -eq 'Weixin.exe' -and $_.CommandLine -notmatch '--type='})
 if($owners.Count -eq 0){Emit-Failure 'wechat_not_running'}
 if($owners.Count -ne 1){Emit-Failure 'multiple_wechat_processes'}
 $dataRoot=Join-Path $env:APPDATA 'Tencent\xwechat\xwechat_files'
 if(-not(Test-Path -LiteralPath $dataRoot)){Emit-Failure 'wechat_database_missing'}
 $dbPaths=@(Get-ChildItem -LiteralPath $dataRoot -Directory|Where-Object{$_.Name -like 'wxid_*'}|ForEach-Object{$p=Join-Path $_.FullName 'db_storage\message\biz_message_0.db';if(Test-Path -LiteralPath $p){$p}})
 if($dbPaths.Count -eq 0){Emit-Failure 'wechat_database_missing'}
 if($dbPaths.Count -ne 1){Emit-Failure 'multiple_wechat_profiles'}
 $version=(Get-Item -LiteralPath $owners[0].ExecutablePath).VersionInfo.FileVersion
 $profile=[IO.Path]::GetDirectoryName([IO.Path]::GetDirectoryName([IO.Path]::GetDirectoryName($dbPaths[0])))
 $sourceId=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($profile.ToLowerInvariant()))).ToLowerInvariant()
 $source=@{backend='windows-weixin-local-v1';sourceId=$sourceId;wechatVersion=$version;testedVersion='4.1.15.13';database='biz_message_0.db';additionalShards=@(Get-ChildItem -LiteralPath ([IO.Path]::GetDirectoryName($dbPaths[0])) -Filter 'biz_message_*.db'|Where-Object Name -NE 'biz_message_0.db').Count}
 if($Doctor){[pscustomobject]@{ok=$true;status='process_and_database_found';sessionReadVerified=$false;source=$source}|ConvertTo-Json -Compress -Depth 5;exit 0}
 if(-not $TargetsPath -or -not(Test-Path -LiteralPath $TargetsPath) -or -not $PythonPath){Emit-Failure 'invalid_reader_request'}
 $request=Get-Content -LiteralPath $TargetsPath -Raw|ConvertFrom-Json
 if($request.action -ne 'discover'){
  $targets=@($request)
  if($targets.Count -lt 1 -or $targets.Count -gt 200){Emit-Failure 'invalid_reader_request'}
  foreach($target in $targets){try{$number=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($target.biz));if($number -notmatch '^\d{6,20}$'){throw 'Invalid identifier'}}catch{Emit-Failure 'invalid_reader_request'}}
 }
 $stream=[IO.FileStream]::new($dbPaths[0],[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete)
 try{$page=[byte[]]::new(4096);$stream.ReadExactly($page)}finally{$stream.Dispose()}
 Add-Type -TypeDefinition ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'runtime-key.cs'))+[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'snapshot.cs')))
 $result=[WeixinBizDbProbe]::Run([int]$owners[0].ProcessId,$page,$false,$true,$true)
 try{
  if(-not $result.ProcessReadable){Emit-Failure 'wechat_process_unreadable'}
  if(-not $result.VerifiedDatabaseKey){Emit-Failure 'wechat_session_or_version_unavailable'}
  try{$snapshot=[WeixinBizDbProbe]::InspectTargets($result,$dbPaths[0],$PythonPath,(Join-Path $PSScriptRoot 'metadata.py'),$TargetsPath)|ConvertFrom-Json -DateKind String}
  catch{Emit-Failure 'snapshot_verification_failed'}
  [pscustomobject]@{ok=$true;source=$source;snapshot=$snapshot}|ConvertTo-Json -Compress -Depth 15
 }finally{[WeixinBizDbProbe]::Forget($result)}
}catch{Emit-Failure 'local_reader_failed'}
