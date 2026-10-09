param(
  [string]$ArticleUrl = 'https://mp.weixin.qq.com/s/4qwgIC-4Fk_6Se9NvKSXYQ',
  [switch]$IdentityOnly
)
$ErrorActionPreference = 'Stop'
$OutputEncoding=[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$uri = [uri]$ArticleUrl
if ($uri.Scheme -ne 'https' -or $uri.Host -ne 'mp.weixin.qq.com') {
  throw '请提供 HTTPS 微信公众号文章链接。'
}
$html = (Invoke-WebRequest -Uri $uri -TimeoutSec 25).Content
$bizMatch = [regex]::Match($html, 'var\s+biz\s*=\s*"([^"]+)"')
if (-not $bizMatch.Success) { throw '未找到公众号标识，可能遇到验证页。' }
$biz = $bizMatch.Groups[1].Value
$nameMatch = [regex]::Match($html, "nick_name:\s*'([^']+)'")
$name = [Net.WebUtility]::HtmlDecode($nameMatch.Groups[1].Value)
if($IdentityOnly){[pscustomobject]@{account=[pscustomobject]@{name=$name;biz=$biz;numericId=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($biz))}}|ConvertTo-Json -Depth 3;return}
$albums = @([regex]::Matches($html, 'album_id=(\d+)') | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique)
$items = @()
$albumResults = @()
foreach ($album in $albums) {
  $albumUrl = 'https://mp.weixin.qq.com/mp/appmsgalbum?__biz=' + [uri]::EscapeDataString($biz) + '&action=getalbum&album_id=' + $album
  $page = (Invoke-WebRequest -Uri $albumUrl -TimeoutSec 25).Content
  $found = @()
  foreach ($tag in [regex]::Matches($page, '(?s)<[^>]+data-msgid="[^"]+"[^>]*>')) {
    $attrs = @{}
    foreach ($attr in [regex]::Matches($tag.Value, 'data-([\w-]+)="([^"]*)"')) {
      $attrs[$attr.Groups[1].Value] = [Net.WebUtility]::HtmlDecode($attr.Groups[2].Value)
    }
    $link = $attrs['link']
    if (-not $link) { continue }
    $linkUri = [uri]$link
    if ($linkUri.Host -ne 'mp.weixin.qq.com') { continue }
    $found += [pscustomobject]@{
      id = $biz + ':' + $attrs['msgid'] + ':' + $attrs['itemidx']
      title = $attrs['title']
      url = $link -replace '^http:', 'https:'
      albumId = $album
    }
  }
  $items += $found
  $albumResults += [pscustomobject]@{ id=$album; url=$albumUrl; count=$found.Count }
}
[pscustomobject]@{
  checkedAt = [DateTimeOffset]::UtcNow.ToString('o')
  account = [pscustomobject]@{ name=$name; biz=$biz; numericId=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($biz)) }
  seedArticle = $ArticleUrl
  coverage = 'seed_article_albums_first_page_only'
  completeAccountFeed = $false
  note = '仅演示无需登录从公开合集发现链接；不覆盖整个公众号、不保证最新、不遍历合集分页。'
  albums = $albumResults
  items = @($items | Sort-Object -Property id -Unique)
} | ConvertTo-Json -Depth 6
