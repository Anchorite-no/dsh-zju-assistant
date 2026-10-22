param([Parameter(Mandatory)][string]$FixturesPath)
$ErrorActionPreference='Stop'
$OutputEncoding=[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
Add-Type -TypeDefinition ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'WeixinBizDbSnapshot.cs')))
$cases=Get-Content -LiteralPath $FixturesPath -Raw|ConvertFrom-Json
$results=@{}
foreach($property in $cases.PSObject.Properties){
 try{$results[$property.Name]=[WeixinResearch.BizSnapshot]::AnalyzeWal([Convert]::FromBase64String($property.Value))|ConvertFrom-Json}
 catch{$results[$property.Name]=@{rejected=$true}}
}
$results|ConvertTo-Json -Depth 5
