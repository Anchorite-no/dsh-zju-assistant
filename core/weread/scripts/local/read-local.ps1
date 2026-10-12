# Prints every public-account article synced to this PC's WeChat as JSON. No UI, no network.
# Runs on the Windows PowerShell 5.1 that ships with Windows: keep to its syntax and .NET Framework APIs.
param([string]$PythonPath)
$ErrorActionPreference='Stop'
$OutputEncoding=[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
function Fail([string]$Code){'{"error":"'+$Code+'"}';exit 1}
try {
 $owners=@(Get-CimInstance Win32_Process|Where-Object{$_.Name -eq 'Weixin.exe' -and $_.CommandLine -notmatch '--type='})
 if($owners.Count -eq 0){Fail 'wechat_not_running'}
 if($owners.Count -ne 1){Fail 'multiple_wechat_processes'}
 $dataRoot=Join-Path $env:APPDATA 'Tencent\xwechat\xwechat_files'
 $dbPaths=@(if(Test-Path -LiteralPath $dataRoot){Get-ChildItem -LiteralPath $dataRoot -Directory|Where-Object{$_.Name -like 'wxid_*'}|ForEach-Object{$p=Join-Path $_.FullName 'db_storage\message\biz_message_0.db';if(Test-Path -LiteralPath $p){$p}}})
 if($dbPaths.Count -eq 0){Fail 'wechat_database_missing'}
 if($dbPaths.Count -ne 1){Fail 'multiple_wechat_profiles'}
 try{$pythonReady=& $PythonPath -c 'import sqlite3; from compression import zstd; print(1)' 2>$null;if($LASTEXITCODE -ne 0 -or $pythonReady -ne '1'){Fail 'runtime_missing'}}catch{Fail 'runtime_missing'}
 $stream=[IO.FileStream]::new($dbPaths[0],[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete)
 try{$page=[byte[]]::new(4096);$read=0;while($read -lt 4096){$n=$stream.Read($page,$read,4096-$read);if($n -le 0){throw 'Incomplete database header'};$read+=$n}}finally{$stream.Dispose()}
 Add-Type -TypeDefinition ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'runtime-key.cs'))+[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'snapshot.cs')))
 $result=[WeixinBizDbProbe]::Run([int]$owners[0].ProcessId,$page)
 try{
  if(-not $result.VerifiedDatabaseKey){Fail 'wechat_key_unavailable'}
  # The snapshot is already JSON. Printing it as text avoids 5.1's ConvertFrom-Json size limit and any date conversion.
  try{[WeixinBizDbProbe]::ReadSnapshot($result,$dbPaths[0],$PythonPath,(Join-Path $PSScriptRoot 'metadata.py'))}
  catch{Fail 'snapshot_failed'}
 }finally{[WeixinBizDbProbe]::Forget($result)}
}catch{Fail 'local_reader_failed'}
