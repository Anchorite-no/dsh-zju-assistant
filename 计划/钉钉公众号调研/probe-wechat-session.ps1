param([string]$SnapshotPath, [switch]$Live, [switch]$ClientCompatible, [switch]$InspectOnly, [switch]$InspectArticle, [switch]$CookieTokenFlow, [string]$CredentialUrl, [switch]$InspectHome, [switch]$NativeQueryOnly)
# Relevant-domain cookies stay in memory and are sent only to mp.weixin.qq.com.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security.Cryptography.ProtectedData
function Invoke-ScopedWechatGet([string]$Url, $CookieJar, $RequestHeaders) {
  $uri = [uri]$Url
  if ($uri.Scheme -ne 'https' -or $uri.Host -ne 'mp.weixin.qq.com' -or $uri.Port -ne 443) { throw 'Unexpected destination.' }
  $handler = [Net.Http.HttpClientHandler]::new()
  $handler.AllowAutoRedirect = $false
  $handler.CookieContainer = $CookieJar
  $handler.AutomaticDecompression = [Net.DecompressionMethods]::All
  $client = [Net.Http.HttpClient]::new($handler)
  $client.Timeout = [TimeSpan]::FromSeconds(25)
  $request = [Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::Get,$uri)
  $reply = $null
  try {
    foreach ($headerName in $RequestHeaders.Keys) { [void]$request.Headers.TryAddWithoutValidation($headerName,[string]$RequestHeaders[$headerName]) }
    $reply = $client.SendAsync($request).GetAwaiter().GetResult()
    return [pscustomobject]@{StatusCode=[int]$reply.StatusCode;Content=$reply.Content.ReadAsStringAsync().GetAwaiter().GetResult();Redirect=$reply.Headers.Location}
  } finally { if ($null -ne $reply) { $reply.Dispose() }; $request.Dispose(); $client.Dispose() }
}
if ([bool]$SnapshotPath -eq [bool]$Live) { throw 'Choose exactly one of -Live or -SnapshotPath.' }
if ($Live) {
  $snapshots = @(& (Join-Path $PSScriptRoot 'snapshot-wechat-cookies.ps1') -InMemory)
  $snapshot = $snapshots | Where-Object { $_.StartsWith('multitab|') } | Select-Object -First 1
  if (-not $snapshot) { throw 'No live article-browser snapshot is available.' }
  $bytes = [Convert]::FromBase64String($snapshot.Split('|',2)[1])
  $start = [Diagnostics.ProcessStartInfo]::new((Get-Command python).Source)
  $start.ArgumentList.Add((Join-Path $PSScriptRoot 'cookie-snapshot-reader.py'))
  $start.UseShellExecute = $false
  $start.CreateNoWindow = $true
  $start.RedirectStandardInput = $true
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  $proc = [Diagnostics.Process]::Start($start)
  try {
    $proc.StandardInput.BaseStream.Write($bytes,0,$bytes.Length)
    $proc.StandardInput.Close()
    $encoded = $proc.StandardOutput.ReadToEnd()
    $readerError = $proc.StandardError.ReadToEnd()
    $proc.WaitForExit()
    if ($proc.ExitCode -ne 0) { throw 'In-memory cookie snapshot validation failed.' }
    $saved = $encoded | ConvertFrom-Json
  } finally { [Array]::Clear($bytes,0,$bytes.Length); $proc.Dispose(); $snapshot=$null; $snapshots=$null; $encoded=$null }
} else {
$probeBase = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'CampusAgent\wechat-session-probe'))
$full = [IO.Path]::GetFullPath($SnapshotPath)
if (-not $full.StartsWith($probeBase + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Snapshot must be inside the private probe directory.' }
$env:WECHAT_SESSION_PROBE_DB = $full
try {
  $encoded = & node -e 'const {DatabaseSync}=require("node:sqlite");const db=new DatabaseSync(process.env.WECHAT_SESSION_PROBE_DB,{readOnly:true});const v=db.prepare("SELECT value FROM meta WHERE key=?").get("version");const rows=db.prepare("SELECT host_key,name,path,value,encrypted_value FROM cookies WHERE host_key=? AND path=?").all("mp.weixin.qq.com","/").map(x=>({...x,encrypted_value:Buffer.from(x.encrypted_value).toString("base64")}));console.log(JSON.stringify({version:Number(v?.value||0),rows}));db.close();'
  if ($LASTEXITCODE -ne 0) { throw 'Cookie metadata read failed.' }
  $saved = ($encoded -join "`n") | ConvertFrom-Json
} finally { Remove-Item Env:WECHAT_SESSION_PROBE_DB -ErrorAction SilentlyContinue }
}
$statePath = Join-Path $env:APPDATA 'Tencent\xwechat\radium\web\Local State'
$state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
$wrapped = [Convert]::FromBase64String($state.os_crypt.encrypted_key)
if ([Text.Encoding]::ASCII.GetString($wrapped,0,5) -ne 'DPAPI') { throw 'Unsupported key format.' }
$key = [Security.Cryptography.ProtectedData]::Unprotect($wrapped[5..($wrapped.Length-1)],$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
$cookieValues = @{}
try {
  foreach ($row in $saved.rows) {
    if ($row.value) { $cookieValues[$row.name] = [string]$row.value; continue }
    $blob = [Convert]::FromBase64String($row.encrypted_value)
    if ($blob.Length -lt 31 -or [Text.Encoding]::ASCII.GetString($blob,0,3) -ne 'v10') { continue }
    $plain = [byte[]]::new($blob.Length-31)
    $aes = [Security.Cryptography.AesGcm]::new([byte[]]$key,16)
    try {
      $aes.Decrypt([byte[]]$blob[3..14],[byte[]]$blob[15..($blob.Length-17)],[byte[]]$blob[($blob.Length-16)..($blob.Length-1)],$plain)
      $start = 0
      if ($saved.version -ge 24) {
        $expected = [Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($row.host_key))
        if ($plain.Length -lt 32 -or [Convert]::ToHexString($expected) -ne [Convert]::ToHexString([byte[]]$plain[0..31])) { throw 'Cookie host binding mismatch.' }
        $start = 32
      }
      $value = [Text.Encoding]::UTF8.GetString($plain,$start,$plain.Length-$start)
      if ($value -match "[\r\n]") { throw 'Invalid cookie value.' }
      $cookieValues[$row.name] = $value
    } finally { $aes.Dispose(); [Array]::Clear($plain,0,$plain.Length) }
  }
} finally { [Array]::Clear($key,0,$key.Length) }

$session = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
foreach ($name in $cookieValues.Keys) {
  $cookie = [Net.Cookie]::new($name,$cookieValues[$name],'/','mp.weixin.qq.com')
  $cookie.Secure = $true
  $session.Cookies.Add($cookie)
}
$biz = 'MzA3MDk5NDA0NA=='
$outgoing = $session.Cookies.GetCookies([uri]'https://mp.weixin.qq.com/mp/profile_ext')
if ($InspectOnly) {
  [pscustomobject]@{storedCookieCount=$cookieValues.Count;outgoingCookieCount=$outgoing.Count;outgoingCookieNames=@($outgoing | ForEach-Object {$_.Name});headerBytes=$session.Cookies.GetCookieHeader([uri]'https://mp.weixin.qq.com/mp/profile_ext').Length;allRelevantCookieMetadata=$saved.metadata;cookieValuesPrinted=$false}|ConvertTo-Json -Depth 5
  $cookieValues.Clear()
  exit 0
}
$baseUrl = 'https://mp.weixin.qq.com/mp/profile_ext?action=getmsg&__biz=' + [uri]::EscapeDataString($biz) + '&f=json&offset=0&count=5&scene=124&is_ok=1'
if ($cookieValues.ContainsKey('appmsg_token')) { $baseUrl += '&appmsg_token=' + [uri]::EscapeDataString($cookieValues['appmsg_token']) }
$headers = @{Referer=('https://mp.weixin.qq.com/mp/profile_ext?action=home&__biz='+[uri]::EscapeDataString($biz));Accept='application/json,text/plain,*/*'}
if ($ClientCompatible) {
  $client = Get-CimInstance Win32_Process | Where-Object {$_.Name -eq 'WeChatAppEx.exe' -and $_.CommandLine -match '--wechat-sub-user-agent'} | Select-Object -First 1
  $match = [regex]::Match([string]$client.CommandLine,'--wechat-sub-user-agent=(?:"([^"]+)"|([^\s]+))')
  if (-not $match.Success) { throw 'Native WeChat user-agent metadata unavailable.' }
  $suffix = if ($match.Groups[1].Success) { $match.Groups[1].Value } else { $match.Groups[2].Value }
  if ($suffix -match "[\r\n]") { throw 'Invalid native user-agent metadata.' }
  $headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Safari/537.36 ' + $suffix
  foreach ($pair in @(@('wxuin','uin'),@('pass_ticket','pass_ticket'))) {
    if ($cookieValues.ContainsKey($pair[0])) { $baseUrl += '&'+$pair[1]+'='+[uri]::EscapeDataString($cookieValues[$pair[0]]) }
  }
}
if ($CookieTokenFlow) {
  # Historical cookie/appmsg_token protocol, documented independently of the uin/key credential route.
  $baseUrl = [regex]::Replace($baseUrl,'([?&])uin=[^&]*','${1}uin=777')
  if ($baseUrl -notmatch '[?&]uin=') { $baseUrl += '&uin=777' }
  $baseUrl += '&key=777&wxtoken=777&x5=1'
  $headers['X-Requested-With'] = 'XMLHttpRequest'
  $headers['Accept'] = 'application/json, text/javascript, */*; q=0.01'
}
try {
  $bootstrapStatus = $null
  if ($CredentialUrl) {
    $probeStage='native-context-validation'
    $native = [uri]$CredentialUrl
    if ($native.Scheme -ne 'https' -or $native.Host -ne 'mp.weixin.qq.com' -or $native.AbsolutePath -ne '/s') { throw 'Unexpected native credential source.' }
    $params = [System.Web.HttpUtility]::ParseQueryString($native.Query)
    if ($params['__biz'] -ne $biz -or -not $params['key'] -or -not $params['uin'] -or -not $params['pass_ticket']) { throw 'Native credential identity mismatch.' }
    if ($NativeQueryOnly) { $session.Cookies = [Net.CookieContainer]::new() }
    $probeStage='native-article-request'
    $bootstrap = Invoke-ScopedWechatGet $native.AbsoluteUri $session.Cookies $headers
    $bootstrapStatus = $bootstrap.StatusCode
    $baseUrl = 'https://mp.weixin.qq.com/mp/profile_ext?action=getmsg&__biz=' + [uri]::EscapeDataString($biz) + '&f=json&offset=0&count=10&is_ok=1'
    $requestFields = if ($NativeQueryOnly) { @('uin','key','pass_ticket') } else { @('uin','key','pass_ticket','devicetype','version') }
    foreach ($field in $requestFields) {
      if ($params[$field]) { $baseUrl += '&'+$field+'='+[uri]::EscapeDataString($params[$field]) }
    }
    $newCookies = $session.Cookies.GetCookies([uri]'https://mp.weixin.qq.com/mp/profile_ext')
    $appmsg = $newCookies | Where-Object {$_.Name -eq 'appmsg_token'} | Select-Object -First 1
    if ($appmsg -and -not $NativeQueryOnly) { $baseUrl += '&appmsg_token=' + [uri]::EscapeDataString($appmsg.Value) }
    $outgoing = $newCookies
    $headers['X-Requested-With'] = 'XMLHttpRequest'
    $headers['Accept'] = 'application/json, text/javascript, */*; q=0.01'
  }
  if ($InspectHome) {
    $probeStage='native-home-request'
    $homeUrl=$baseUrl.Replace('action=getmsg','action=home')
    $homeReply=Invoke-ScopedWechatGet $homeUrl $session.Cookies $headers
    $scriptUrls=@()
    foreach($m in [regex]::Matches($homeReply.Content,'(?i)<script[^>]+src=["\x27]([^"\x27]+)')) {
      $s=$m.Groups[1].Value
      if($s.StartsWith('//')){$s='https:'+$s}
      $u=$null
      if([uri]::TryCreate($s,[UriKind]::Absolute,[ref]$u) -and $u.Host -in @('res.wx.qq.com','mp.weixin.qq.com')) {
        $scriptUrls += $u.GetLeftPart([UriPartial]::Path)
      }
    }
    $t=[regex]::Match($homeReply.Content,'(?is)<title[^>]*>(.*?)</title>')
    [pscustomobject]@{mode='home-context';httpStatus=$homeReply.StatusCode;contentLength=$homeReply.Content.Length;title=$t.Groups[1].Value;containsGeneralMessageList=$homeReply.Content.Contains('general_msg_list');containsHomePageList=$homeReply.Content.Contains('home_page_list');articleLinkOccurrences=[regex]::Matches($homeReply.Content,'mp\.weixin\.qq\.com/s[/?]').Count;scriptUrls=@($scriptUrls|Select-Object -Unique);credentialValuesPrinted=$false}|ConvertTo-Json -Depth 4
    return
  }
  if ($InspectArticle) {
    $probeStage='article-request'
    $article = if($CredentialUrl){$bootstrap}else{Invoke-ScopedWechatGet 'https://mp.weixin.qq.com/s/4qwgIC-4Fk_6Se9NvKSXYQ' $session.Cookies $headers}
    $probeStage='article-parse'
    $fields = @()
    foreach ($field in @('biz','uin','key','pass_ticket','appmsg_token','nickname','user_name')) {
      $pattern = '(?m)^\s*(?:var\s+|window\.)' + $field + '\s*=\s*["\x27]([^"\x27]*)["\x27]'
      $found = [regex]::Match($article.Content,$pattern)
      $fields += [pscustomobject]@{name=$field;found=$found.Success;nonEmpty=($found.Success -and $found.Groups[1].Value.Length -gt 0);length=if($found.Success){$found.Groups[1].Value.Length}else{0}}
    }
    $title=[regex]::Match($article.Content,'(?is)<h1[^>]*class="[^"]*rich_media_title[^"]*"[^>]*>(.*?)</h1>')
    $publicUrl=$null
    if($CredentialUrl){$publicUrl='https://mp.weixin.qq.com/s?'+((@('__biz','mid','idx','sn')|ForEach-Object{$_+'='+[uri]::EscapeDataString($params[$_])}) -join '&')}
    [pscustomobject]@{mode='article-context';httpStatus=[int]$article.StatusCode;contentLength=$article.Content.Length;title=[Net.WebUtility]::HtmlDecode(([regex]::Replace($title.Groups[1].Value,'<[^>]+>','')).Trim());publicUrl=$publicUrl;articleBodyPresent=$article.Content.Contains('id="js_content"');redirectScheme=if($article.Redirect){$article.Redirect.Scheme}else{$null};redirectHost=if($article.Redirect){$article.Redirect.Host}else{$null};redirectPath=if($article.Redirect){$article.Redirect.AbsolutePath}else{$null};redirectQueryKeys=if($article.Redirect){@($article.Redirect.Query.TrimStart('?').Split('&')|Where-Object{$_}|ForEach-Object{($_ -split '=',2)[0]})}else{@()};containsVerification=$article.Content.Contains('验证');fields=$fields;cookieValuesPrinted=$false}|ConvertTo-Json -Depth 5
    return
  }
  $probeStage='history-request'
  $response = Invoke-ScopedWechatGet $baseUrl $session.Cookies $headers
  $probeStage='history-parse'
  $data = $null
  try { $data = $response.Content | ConvertFrom-Json } catch {}
  $list = $null
  if ($data.general_msg_list) { try {$list = $data.general_msg_list | ConvertFrom-Json} catch {} }
  $items = @()
  foreach ($msg in $list.list) {
    if ($msg.app_msg_ext_info) {
      $items += [pscustomobject]@{title=$msg.app_msg_ext_info.title;time=$msg.comm_msg_info.datetime}
      foreach ($child in $msg.app_msg_ext_info.multi_app_msg_item_list) { $items += [pscustomobject]@{title=$child.title;time=$msg.comm_msg_info.datetime} }
    }
  }
  [pscustomobject]@{
    checkedAt=[DateTimeOffset]::UtcNow.ToString('o')
    cookieDatabaseVersion=$saved.version
    source=if($Live){'live-in-memory'}else{'existing-snapshot'}
    credentialUpdates=@($saved.rows | Where-Object {$_.name -in @('wap_sid2','appmsg_token')} | ForEach-Object {[pscustomobject]@{name=$_.name;updatedAt=if($_.updatedChromeMicros){[DateTimeOffset]::FromUnixTimeMilliseconds([long]([decimal]$_.updatedChromeMicros/1000-11644473600000)).ToString('o')}else{$null}}})
    clientCompatible=[bool]$ClientCompatible
    cookieTokenFlow=[bool]$CookieTokenFlow
    nativeCredentialUsed=[bool]$CredentialUrl
    nativeQueryOnly=[bool]$NativeQueryOnly
    bootstrapStatus=$bootstrapStatus
    cookieNames=@($cookieValues.Keys | Sort-Object)
    outgoingCookieCount=$outgoing.Count
    httpStatus=[int]$response.StatusCode
    ret=$data.ret
    errorMessage=$data.errmsg
    baseResponse=$data.base_resp
    resultKeys=if($data){@($data.PSObject.Properties.Name)}else{@()}
    serverMessageCount=$data.msg_count
    homePageListType=if($null -ne $data.home_page_list){$data.home_page_list.GetType().Name}else{$null}
    homePageListSample=if($data.home_page_list){@($data.home_page_list|Select-Object -First 1)}else{@()}
    account='浙大体育与艺术'
    articleCount=$items.Count
    samples=@($items | Select-Object -First 3)
    nextOffset=$data.next_offset
    canContinue=$data.can_msg_continue
    cookieValuesPrinted=$false
  } | ConvertTo-Json -Depth 6
} catch {
  # Exceptions can include the URL, which carries a token. Never print them.
  [pscustomobject]@{requestFailed=$true;stage=$probeStage;line=$_.InvocationInfo.ScriptLineNumber;errorType=$_.Exception.GetType().Name;cookieValuesPrinted=$false}|ConvertTo-Json
} finally { $cookieValues.Clear() }
