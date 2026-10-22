# Read-only, bounded inspection of request strings for one public account.
# Does not inject code, adjust privileges, write process memory, or dump memory.
param([int]$MegabytesPerProcess = 192, [switch]$Probe, [switch]$InspectHome, [switch]$NativeQueryOnly, [switch]$InspectArticle, [switch]$PublicOnly, [string]$OutputPath)
$ErrorActionPreference = 'Stop'
if ($MegabytesPerProcess -lt 1 -or $MegabytesPerProcess -gt 256) { throw 'Invalid bounded scan limit.' }
if ($PublicOnly -and $Probe) { throw 'Public-only discovery cannot use credentials.' }
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;

public static class WeixinRequestInspector {
  [StructLayout(LayoutKind.Sequential)] struct Region {
    public IntPtr BaseAddress, AllocationBase;
    public uint AllocationProtect; public ushort PartitionId, Alignment;
    public UIntPtr RegionSize; public uint State, Protect, Type, Alignment2;
  }
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool ReadProcessMemory(IntPtr p, IntPtr address, byte[] buffer, UIntPtr size, out UIntPtr bytes);
  [DllImport("kernel32.dll")] static extern UIntPtr VirtualQueryEx(IntPtr p, IntPtr address, out Region r, UIntPtr size);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  public sealed class Report {
    public int ProcessesRead, ProcessesDenied, TargetStringWindows, CredentialUrlCount;
    public long BytesRead;
    public bool BudgetReached;
    public string[] ObservedPaths;
    public string[] ObservedQueryKeys;
    public string[] PublicArticleUrls;
    public string[] PublicArticleTitles;
    public ArticleInfo[] Articles;
    internal bool CollectCredentials;
    internal HashSet<string> PublicUrls = new HashSet<string>();
    internal HashSet<string> ArticleTitles = new HashSet<string>();
    internal Dictionary<string,string> TitlesByUrl = new Dictionary<string,string>();
    internal HashSet<string> CredentialUrls = new HashSet<string>();
    public string[] CredentialTimingMetadata;
    public string FirstCredentialForLocalProbe() {
      string chosen=null; long best=long.MinValue;
      foreach(var s in CredentialUrls) {
        long when=GetClickTime(s);
        if(chosen==null || when>best){chosen=s;best=when;}
      }
      return chosen;
    }
  }
  public sealed class ArticleInfo { public string Url, Title; }
  static string PublicUrl(string raw, string target) {
    Uri u;
    if(!Uri.TryCreate(raw.Replace("&amp;","&"),UriKind.Absolute,out u) || u.Host!="mp.weixin.qq.com" || u.AbsolutePath!="/s")return null;
    var p=new Dictionary<string,string>();
    foreach(var pair in u.Query.TrimStart('?').Split('&')){int i=pair.IndexOf('=');if(i>0)p[Uri.UnescapeDataString(pair.Substring(0,i))]=Uri.UnescapeDataString(pair.Substring(i+1));}
    string biz,mid,idx,sn;
    if(!p.TryGetValue("__biz",out biz)||biz!=target+"=="||!p.TryGetValue("mid",out mid)||!Regex.IsMatch(mid,@"^\d+$")||!p.TryGetValue("idx",out idx)||!Regex.IsMatch(idx,@"^\d+$")||!p.TryGetValue("sn",out sn)||!Regex.IsMatch(sn,@"^[0-9a-fA-F]{32}$"))return null;
    return "https://mp.weixin.qq.com/s?__biz="+Uri.EscapeDataString(biz)+"&mid="+mid+"&idx="+idx+"&sn="+sn;
  }
  static long GetClickTime(string url) {
    var m=Regex.Match(new Uri(url).Query,@"(?:^|[?&])clicktime=(\d+)");
    long value;return m.Success && long.TryParse(m.Groups[1].Value,out value)?value:0;
  }
  static void InspectText(string text, string target, Report report, HashSet<string> paths, HashSet<string> keys) {
    text = text.Replace(@"\/", "/");
    foreach (Match record in Regex.Matches(text, @"\{[^{}]{1,12000}\}")) {
      if(!record.Value.Contains(target) || !record.Value.Contains("mp.weixin.qq.com/s")) continue;
      var title=Regex.Match(record.Value,"\"(?:title|msg_title|appmsg_title)\"\\s*:\\s*\"((?:\\\\.|[^\"\\\\]){1,1000})\"");
      if(title.Success){try{string value=Regex.Unescape(title.Groups[1].Value);if(value.Length<=300){report.ArticleTitles.Add(value);foreach(Match link in Regex.Matches(record.Value,@"https?://mp\.weixin\.qq\.com/[^\s\x00\x22\x27<>]{1,10000}")){string pub=PublicUrl(link.Value,target);if(pub!=null)report.TitlesByUrl[pub]=value;}}}catch{}}
    }
    foreach (Match m in Regex.Matches(text, @"https?://mp\.weixin\.qq\.com/[^\s\x00\x22\x27<>]{1,10000}")) {
      if (!m.Value.Contains(target)) continue;
      Uri u;
      if (!Uri.TryCreate(m.Value.Replace("&amp;","&"), UriKind.Absolute, out u) || u.Host != "mp.weixin.qq.com") continue;
      if (u.AbsolutePath != "/s" && u.AbsolutePath != "/mp/profile_ext") continue;
      paths.Add(u.AbsolutePath);
      var parameters = new Dictionary<string,string>();
      foreach (var item in u.Query.TrimStart('?').Split('&')) {
        int at = item.IndexOf('=');
        if (at <= 0) continue;
        string key = Uri.UnescapeDataString(item.Substring(0, at));
        string value = Uri.UnescapeDataString(item.Substring(at + 1));
        parameters[key] = value;
        if (key.Length < 80 && Regex.IsMatch(key, @"^[a-zA-Z0-9_]+$")) keys.Add(key);
      }
      string biz, authKey, uin, ticket;
      string mid, idx, sn;
      if(parameters.TryGetValue("__biz",out biz) && biz==target+"==" &&
         parameters.TryGetValue("mid",out mid) && Regex.IsMatch(mid,@"^\d+$") &&
         parameters.TryGetValue("idx",out idx) && Regex.IsMatch(idx,@"^\d+$") &&
         parameters.TryGetValue("sn",out sn) && Regex.IsMatch(sn,@"^[0-9a-fA-F]{32}$")) {
        report.PublicUrls.Add("https://mp.weixin.qq.com/s?__biz="+Uri.EscapeDataString(biz)+"&mid="+mid+"&idx="+idx+"&sn="+sn);
      }
      if (report.CollectCredentials && parameters.TryGetValue("__biz", out biz) && biz == target + "==" &&
          parameters.TryGetValue("key", out authKey) && authKey.Length > 8 &&
          parameters.TryGetValue("uin", out uin) && uin.Length > 3 &&
          parameters.TryGetValue("pass_ticket", out ticket) && ticket.Length > 8) {
        report.CredentialUrls.Add(u.AbsoluteUri);
      }
    }
  }
  public static Report Scan(int[] processIds, int maxMegabytes, bool collectCredentials) {
    var report = new Report(); report.CollectCredentials=collectCredentials; var paths = new HashSet<string>(); var keys = new HashSet<string>();
    string target = "MzA3MDk5NDA0NA";
    byte[][] needles = { Encoding.ASCII.GetBytes(target), Encoding.Unicode.GetBytes(target) };
    var clock = Stopwatch.StartNew();
    foreach (int pid in processIds) {
      if (clock.Elapsed.TotalSeconds > 45) { report.BudgetReached = true; break; }
      Process proc;
      try { proc = Process.GetProcessById(pid); } catch { continue; }
      if (proc.ProcessName != "WeChatAppEx") continue;
      IntPtr h = OpenProcess(0x410, false, pid); // QUERY_INFORMATION | VM_READ
      if (h == IntPtr.Zero) { report.ProcessesDenied++; continue; }
      report.ProcessesRead++;
      long scanned = 0; ulong address = 0; var buffer = new byte[1024 * 1024];
      try {
        while (address < 0x00007FFFFFFF0000UL && scanned < (long)maxMegabytes * 1024 * 1024) {
          if (clock.Elapsed.TotalSeconds > 45) { report.BudgetReached = true; break; }
          Region r;
          if (VirtualQueryEx(h, new IntPtr(unchecked((long)address)), out r, new UIntPtr((uint)Marshal.SizeOf<Region>())).ToUInt64() == 0) break;
          ulong start = unchecked((ulong)r.BaseAddress.ToInt64()), size = r.RegionSize.ToUInt64(), next = start + size;
          if (next <= address) break;
          address = next;
          if (r.State != 0x1000 || r.Type != 0x20000 || (r.Protect & 0x100) != 0 || (r.Protect & 0x0E) == 0) continue;
          for (ulong offset = 0; offset < size && scanned < (long)maxMegabytes * 1024 * 1024; ) {
            int wanted = (int)Math.Min((ulong)buffer.Length, size - offset);
            UIntPtr received;
            ReadProcessMemory(h, new IntPtr(unchecked((long)(start + offset))), buffer, new UIntPtr((uint)wanted), out received);
            int n = (int)Math.Min((ulong)wanted, received.ToUInt64());
            scanned += n; report.BytesRead += n;
            foreach (var needle in needles) {
              var span = new ReadOnlySpan<byte>(buffer, 0, n); int from = 0;
              while (from < n) {
                int hit = span.Slice(from).IndexOf(needle); if (hit < 0) break;
                hit += from; report.TargetStringWindows++;
                int lo = Math.Max(0, hit - 2048), hi = Math.Min(n, hit + 8192);
                string text = needle == needles[0] ? Encoding.UTF8.GetString(buffer, lo, hi-lo) : Encoding.Unicode.GetString(buffer, lo + ((hit-lo)%2), hi-lo-((hit-lo)%2));
                InspectText(text, target, report, paths, keys);
                from = hit + needle.Length;
              }
            }
            if (wanted <= 8192) break;
            offset += (uint)(wanted - 8192);
          }
        }
      } finally { Array.Clear(buffer,0,buffer.Length); CloseHandle(h); proc.Dispose(); }
    }
    report.CredentialUrlCount = report.CredentialUrls.Count;
    var timing=new List<string>();
    foreach(var u in report.CredentialUrls){long t=GetClickTime(u);timing.Add(t>0?DateTimeOffset.FromUnixTimeSeconds(t).ToString("o"):"no-clicktime");}
    report.CredentialTimingMetadata=timing.ToArray();
    report.ObservedPaths = new List<string>(paths).ToArray();
    report.ObservedQueryKeys = new List<string>(keys).ToArray();
    report.PublicArticleUrls = new List<string>(report.PublicUrls).ToArray();
    report.PublicArticleTitles = new List<string>(report.ArticleTitles).ToArray();
    var articles=new List<ArticleInfo>();
    foreach(var url in report.PublicUrls){string title; report.TitlesByUrl.TryGetValue(url,out title);articles.Add(new ArticleInfo{Url=url,Title=title});}
    report.Articles=articles.ToArray();
    return report;
  }
}
'@
$ids = @(Get-CimInstance Win32_Process | Where-Object {$_.Name -eq 'WeChatAppEx.exe'} | Sort-Object @{Expression={if($_.CommandLine -match '--utility-sub-type=network'){0}elseif($_.CommandLine -notmatch '--type='){1}else{2}}},CreationDate -Descending | Select-Object -ExpandProperty ProcessId)
$report = [WeixinRequestInspector]::Scan([int[]]$ids, $MegabytesPerProcess, (-not [bool]$PublicOnly))
if ($PublicOnly) {
  $result = [pscustomobject]@{checkedAt=[DateTimeOffset]::UtcNow.ToString('o');account='浙大体育与艺术';biz='MzA3MDk5NDA0NA==';source='already-loaded-weixin-data';completeAccountFeed=$false;requiresWeRead=$false;articleCount=$report.PublicArticleUrls.Count;items=@($report.Articles|ForEach-Object{[pscustomobject]@{url=$_.Url;title=$_.Title}});processesRead=$report.ProcessesRead;megabytesRead=[Math]::Round($report.BytesRead/1MB,1);budgetReached=$report.BudgetReached;credentialValuesIncluded=$false}
  $json=$result|ConvertTo-Json -Depth 6
  if($OutputPath){$out=[IO.Path]::GetFullPath($OutputPath);$allowed=[IO.Path]::GetFullPath($PSScriptRoot)+'\';if(-not $out.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetExtension($out) -ne '.json'){throw 'Public result must be a JSON file inside the research directory.'};$json|Set-Content -LiteralPath $out -Encoding utf8;[pscustomobject]@{file=$out;articleCount=$result.articleCount;withTitle=@($result.items|Where-Object{$_.title}).Count;completeAccountFeed=$false}|ConvertTo-Json}else{$json}
  return
}
[pscustomobject]@{processesRead=$report.ProcessesRead;processesDenied=$report.ProcessesDenied;megabytesRead=[Math]::Round($report.BytesRead/1MB,1);targetStringWindows=$report.TargetStringWindows;credentialUrlCount=$report.CredentialUrlCount;candidateClickTimes=$report.CredentialTimingMetadata;observedPaths=$report.ObservedPaths;observedQueryKeys=$report.ObservedQueryKeys;publicArticleUrls=$report.PublicArticleUrls;publicArticleTitles=$report.PublicArticleTitles;budgetReached=$report.BudgetReached;credentialValuesPrinted=$false}|ConvertTo-Json -Depth 4
if ($Probe -and $report.CredentialUrlCount -gt 0) {
  & (Join-Path $PSScriptRoot 'probe-wechat-session.ps1') -Live -ClientCompatible -CredentialUrl $report.FirstCredentialForLocalProbe() -InspectHome:$InspectHome -NativeQueryOnly:$NativeQueryOnly -InspectArticle:$InspectArticle
}
