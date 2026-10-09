param([Parameter(Mandatory)][string]$ArticleUrl)
$ErrorActionPreference='Stop'
$OutputEncoding=[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
try{
 $uri=[uri]$ArticleUrl
 if($uri.Scheme -ne 'https' -or $uri.Host -ne 'mp.weixin.qq.com' -or $uri.UserInfo){throw 'Invalid URL'}
 $response=Invoke-WebRequest -Uri $uri -TimeoutSec 25 -MaximumRedirection 0
 $html=$response.Content
 $bizMatch=[regex]::Match($html,'var\s+biz\s*=\s*"([^"]+)"')
 if(-not $bizMatch.Success){throw 'No public account identity'}
 $nameMatch=[regex]::Match($html,"nick_name:\s*'([^']+)'")
 [pscustomobject]@{ok=$true;biz=$bizMatch.Groups[1].Value;name=[Net.WebUtility]::HtmlDecode($nameMatch.Groups[1].Value)}|ConvertTo-Json -Compress
}catch{[pscustomobject]@{ok=$false;error=@{code='article_identity_unavailable'}}|ConvertTo-Json -Compress;exit 1}
