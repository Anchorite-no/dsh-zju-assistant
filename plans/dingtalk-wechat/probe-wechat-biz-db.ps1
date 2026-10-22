# Check read-only access to the single official-account message DB.
# Only candidates associated with that DB's salt are checked. No key is output.
param([switch]$DerivePassword, [switch]$InspectCodec, [switch]$DecodeRuntimeKey, [switch]$ReadMessages, [string]$OutputPath, [string]$Biz='MzA3MDk5NDA0NA==', [string]$AccountTable='')
$ErrorActionPreference='Stop'
$OutputEncoding=[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
try{$numericId=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Biz));if($numericId -notmatch '^\d{6,20}$'){throw 'Invalid ID'}}catch{throw 'Invalid public account biz identifier.'}
if($AccountTable -and $AccountTable -notmatch '^Msg_[0-9a-fA-F]{32}$'){throw 'Invalid public account table.'}
if($ReadMessages){$InspectCodec=$true;$DecodeRuntimeKey=$true}
if($OutputPath){$out=[IO.Path]::GetFullPath($OutputPath);$allowed=[IO.Path]::GetFullPath($PSScriptRoot)+'\';if(-not $out.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetExtension($out) -ne '.json'){throw 'Public metadata must be a JSON file inside the research directory.'}}
$dataRoot=Join-Path $env:APPDATA 'Tencent\xwechat\xwechat_files'
$dbPaths=@(Get-ChildItem -LiteralPath $dataRoot -Directory|Where-Object{$_.Name -like 'wxid_*'}|ForEach-Object{$p=Join-Path $_.FullName 'db_storage\message\biz_message_0.db';if(Test-Path -LiteralPath $p){$p}})
if($dbPaths.Count -ne 1){throw 'Expected exactly one official-account database.'}
$owners=@(Get-CimInstance Win32_Process|Where-Object{$_.Name -eq 'Weixin.exe' -and $_.CommandLine -notmatch '--type='})
if($owners.Count -ne 1){throw 'Expected exactly one main Weixin process.'}
$s=[IO.FileStream]::new($dbPaths[0],[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete)
try{$page=[byte[]]::new(4096);$s.ReadExactly($page)}finally{$s.Dispose()}
$probeSource=@'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;

public static class WeixinBizDbProbe {
 [StructLayout(LayoutKind.Sequential)] struct Region {
  public IntPtr BaseAddress,AllocationBase;public uint AllocationProtect;public ushort PartitionId,Padding;
  public UIntPtr RegionSize;public uint State,Protect,Type,Padding2;
 }
 [DllImport("kernel32.dll",SetLastError=true)]static extern IntPtr OpenProcess(uint a,bool inherit,int pid);
 [DllImport("kernel32.dll")]static extern UIntPtr VirtualQueryEx(IntPtr p,IntPtr a,out Region r,UIntPtr s);
 [DllImport("kernel32.dll")]static extern bool ReadProcessMemory(IntPtr p,IntPtr a,byte[] b,UIntPtr s,out UIntPtr n);
 [DllImport("kernel32.dll")]static extern bool CloseHandle(IntPtr p);
 public sealed class Result {public bool ProcessReadable,VerifiedDatabaseKey,BudgetReached;public long BytesRead;public int SaltHits,CandidatesChecked,PasswordsChecked,CodecCandidates,TargetCodecContexts,ValidPageHeaders,DirectHmacMatches,RuntimeLiterals;public string KeyFormat;public List<string> CodecMetadata=new List<string>();internal byte[] VerifiedKey;}
 public static void Forget(Result result){if(result.VerifiedKey!=null){Array.Clear(result.VerifiedKey,0,result.VerifiedKey.Length);result.VerifiedKey=null;}}
 static void Confirm(Result result,byte[] key,string format){result.VerifiedDatabaseKey=true;result.KeyFormat=format;result.VerifiedKey=(byte[])key.Clone();}
 public static string InspectTarget(Result result,string path,string python,string helper,string biz,string table){if(result.VerifiedKey==null)throw new Exception("No verified runtime key retained.");try{return WeixinResearch.BizSnapshot.Inspect(result.VerifiedKey,path,python,helper,biz,table);}finally{Forget(result);}}
 static bool DecodeKnownKeySpec(byte[] blob,byte[] salt,byte[] page,Result result){
  foreach(bool upper in new[]{false,true}){byte[] suffix=Encoding.ASCII.GetBytes(upper?Convert.ToHexString(salt):Convert.ToHexString(salt).ToLowerInvariant());byte[] mask=new byte[32];byte[] decoded=new byte[99];
   try{for(int j=66;j<98;j++)mask[j%32]=(byte)(blob[j]^suffix[j-66]);for(int j=0;j<99;j++)decoded[j]=(byte)(blob[j]^mask[j%32]);
    if(decoded[0]!=120||decoded[1]!=39||decoded[98]!=39)continue;
    byte[] candidate=null;try{candidate=Convert.FromHexString(Encoding.ASCII.GetString(decoded,2,64));result.RuntimeLiterals++;result.CandidatesChecked++;if(Verify(candidate,salt,page)){Confirm(result,candidate,"runtime-known-salt-mask");return true;}}catch(FormatException){}finally{if(candidate!=null)Array.Clear(candidate,0,candidate.Length);}
   }finally{Array.Clear(mask,0,32);Array.Clear(decoded,0,99);}
  }return false;
 }
 static bool PageHeader(byte[] key,byte[] page) {
  using(var aes=Aes.Create()){aes.Key=key;aes.Mode=CipherMode.CBC;aes.Padding=PaddingMode.None;byte[] iv=new byte[16];Array.Copy(page,4016,iv,0,16);aes.IV=iv;
   using(var decrypt=aes.CreateDecryptor()){byte[] plain=decrypt.TransformFinalBlock(page,16,32);try{return plain[0]==16&&plain[1]==0&&(plain[2]==1||plain[2]==2)&&(plain[3]==1||plain[3]==2)&&plain[4]==80&&plain[5]==64&&plain[6]==32&&plain[7]==32;}finally{Array.Clear(plain,0,plain.Length);}}
  }
 }
 static bool DirectMac(byte[] macKey,byte[] page) {byte[] message=new byte[4020];Array.Copy(page,16,message,0,4016);message[4016]=1;using(var mac=new HMACSHA512(macKey)){return CryptographicOperations.FixedTimeEquals(mac.ComputeHash(message),new ReadOnlySpan<byte>(page,4032,64));}}
 static byte[] ReadSmall(IntPtr h,ulong address,int count) {
  if(address<0x10000||address>0x00007FFFFFFF0000UL)return null;
  byte[] b=new byte[count];UIntPtr n;
  if(!ReadProcessMemory(h,new IntPtr(unchecked((long)address)),b,new UIntPtr((uint)count),out n)||n.ToUInt64()!=(ulong)count){Array.Clear(b,0,b.Length);return null;}return b;
 }
 // Field relationships from Tencent/sqlcipher crypto_impl.c and SQLCipher 4.x.
 // Read key pointers only after the referenced salt matches this one target DB.
 static bool CheckCodec(IntPtr h,ulong address,byte[] salt,byte[] page,Result result,bool derivePassword,bool decodeRuntimeKey) {
  byte[] ctx=ReadSmall(h,address,144);if(ctx==null)return false;
  try{foreach(int saltOffset in new[]{64,72}){
   byte[] referencedSalt=ReadSmall(h,BitConverter.ToUInt64(ctx,saltOffset),16);if(referencedSalt==null)continue;
   bool matches=CryptographicOperations.FixedTimeEquals(salt,referencedSalt);Array.Clear(referencedSalt,0,16);if(!matches)continue;
   result.TargetCodecContexts++;
   result.CodecMetadata.Add("salt-offset="+saltOffset+",reserve-old="+BitConverter.ToInt32(ctx,36)+",hmac-old="+BitConverter.ToInt32(ctx,40)+",algorithm-old="+BitConverter.ToInt32(ctx,48));
   foreach(int pointerOffset in new[]{saltOffset+32,saltOffset+40}){
    byte[] cipher=ReadSmall(h,BitConverter.ToUInt64(ctx,pointerOffset),64);if(cipher==null)continue;
    var shape=new List<string>();for(int si=0;si<64;si+=8){ulong word=BitConverter.ToUInt64(cipher,si);if(word==0)shape.Add(si+":zero");else if(word<4096)shape.Add(si+":small");else{byte[] value=ReadSmall(h,word,32);if(value==null)shape.Add(si+":nonpointer");else{var distinct=new HashSet<byte>(value);shape.Add(si+":pointer/distinct="+distinct.Count);Array.Clear(value,0,32);}}}result.CodecMetadata.Add("cipher-at="+pointerOffset+","+string.Join(";",shape));
    try{
     // Runtime blob format documented by TANGandXUE/wcdb-key-tool (MIT).
     // See THIRD_PARTY_NOTICES.txt. Only this DB's already-matched codec is read.
     if(decodeRuntimeKey&&BitConverter.ToInt32(ctx,32)==99){byte[] blob=ReadSmall(h,BitConverter.ToUInt64(cipher,32),99);if(blob!=null){try{if(DecodeKnownKeySpec(blob,salt,page,result))return true;byte[] mask=Convert.FromHexString("d2c7442458020000004889442450488b450048844c2448488944254048584c24");for(int j=0;j<blob.Length;j++)blob[j]^=mask[j%mask.Length];
       if(blob[0]==120&&blob[1]==39&&blob[98]==39){try{byte[] candidate=Convert.FromHexString(Encoding.ASCII.GetString(blob,2,64));byte[] embedded=Convert.FromHexString(Encoding.ASCII.GetString(blob,66,32));result.RuntimeLiterals++;try{if(CryptographicOperations.FixedTimeEquals(embedded,salt)){result.CandidatesChecked++;if(Verify(candidate,salt,page)){Confirm(result,candidate,"runtime-codec-keyspec");return true;}}}finally{Array.Clear(candidate,0,32);Array.Clear(embedded,0,16);}}catch(FormatException){}}
      }finally{Array.Clear(blob,0,blob.Length);}}}
     for(int keyOffset=8;keyOffset<=56;keyOffset+=8){byte[] key=ReadSmall(h,BitConverter.ToUInt64(cipher,keyOffset),32);if(key!=null){try{result.CandidatesChecked++;if(PageHeader(key,page))result.ValidPageHeaders++;if(DirectMac(key,page))result.DirectHmacMatches++;if(Verify(key,salt,page)){Confirm(result,key,"codec-raw-offset-"+keyOffset);return true;}}finally{Array.Clear(key,0,32);}}}
     if(derivePassword&&BitConverter.ToInt32(cipher,4)==32){byte[] pass=ReadSmall(h,BitConverter.ToUInt64(cipher,24),32);if(pass!=null){try{byte[] derived=Rfc2898DeriveBytes.Pbkdf2(pass,salt,256000,HashAlgorithmName.SHA512,32);result.PasswordsChecked++;try{if(Verify(derived,salt,page)){Confirm(result,derived,"codec-password");return true;}}finally{Array.Clear(derived,0,32);}}finally{Array.Clear(pass,0,32);}}}
    }finally{Array.Clear(cipher,0,cipher.Length);}
   }
  }}finally{Array.Clear(ctx,0,ctx.Length);}return false;
 }
 static bool Verify(byte[] key,byte[] salt,byte[] page) {
  byte[] hSalt=new byte[16];for(int i=0;i<16;i++)hSalt[i]=(byte)(salt[i]^0x3a);
  byte[] macKey=Rfc2898DeriveBytes.Pbkdf2(key,hSalt,2,HashAlgorithmName.SHA512,32);
  try{byte[] message=new byte[4020];Array.Copy(page,16,message,0,4016);message[4016]=1;
   using(var hmac=new HMACSHA512(macKey)){byte[] digest=hmac.ComputeHash(message);return CryptographicOperations.FixedTimeEquals(digest,new ReadOnlySpan<byte>(page,4032,64));}
  }finally{Array.Clear(macKey,0,macKey.Length);}
 }
 public static Result Run(int pid,byte[] page,bool derivePassword,bool inspectCodec,bool decodeRuntimeKey) {
  var result=new Result();if(Process.GetProcessById(pid).ProcessName!="Weixin")throw new Exception("Unexpected process.");
  IntPtr h=OpenProcess(0x410,false,pid);if(h==IntPtr.Zero)return result;result.ProcessReadable=true;
  byte[] salt=new byte[16];Array.Copy(page,salt,16);byte[] lower=Encoding.ASCII.GetBytes(Convert.ToHexString(salt).ToLowerInvariant());byte[] upper=Encoding.ASCII.GetBytes(Convert.ToHexString(salt));
  var seen=new HashSet<string>();var watch=Stopwatch.StartNew();var buffer=new byte[1024*1024];ulong address=0;
  byte[] signature=new byte[28];int[] fields={256000,2,16,32,16,16,4096};for(int i=0;i<fields.Length;i++)Array.Copy(BitConverter.GetBytes(fields[i]),0,signature,i*4,4);
  try{while(address<0x00007FFFFFFF0000UL&&result.BytesRead<768L*1024*1024){
   if(watch.Elapsed.TotalSeconds>50){result.BudgetReached=true;break;}
   Region r;if(VirtualQueryEx(h,new IntPtr(unchecked((long)address)),out r,new UIntPtr((uint)Marshal.SizeOf<Region>())).ToUInt64()==0)break;
   ulong start=unchecked((ulong)r.BaseAddress.ToInt64()),size=r.RegionSize.ToUInt64(),next=start+size;if(next<=address)break;address=next;
   uint protection=r.Protect&0xff;if(r.State!=0x1000||r.Type!=0x20000||(r.Protect&0x100)!=0||(protection!=4&&protection!=8&&protection!=0x40&&protection!=0x80))continue;
   for(ulong off=0;off<size;){
    if(result.BytesRead>=768L*1024*1024||watch.Elapsed.TotalSeconds>50){result.BudgetReached=true;break;}
    int wanted=(int)Math.Min((ulong)buffer.Length,size-off);UIntPtr got;ReadProcessMemory(h,new IntPtr(unchecked((long)(start+off))),buffer,new UIntPtr((uint)wanted),out got);int n=(int)Math.Min((ulong)wanted,got.ToUInt64());result.BytesRead+=n;
    if(inspectCodec){int from=0;var span=new ReadOnlySpan<byte>(buffer,0,n);while(from<n){int hit=span.Slice(from).IndexOf(signature);if(hit<0)break;hit+=from;result.CodecCandidates++;if(CheckCodec(h,start+off+(ulong)hit-4,salt,page,result,derivePassword,decodeRuntimeKey))return result;from=hit+signature.Length;}}
    foreach(var needle in new[]{salt,lower,upper}){int from=0;var span=new ReadOnlySpan<byte>(buffer,0,n);while(from<n){int hit=span.Slice(from).IndexOf(needle);if(hit<0)break;hit+=from;result.SaltHits++;
      var offsets=needle==salt?new[]{hit-32,hit-40,hit-48,hit+16,hit+24,hit+32}:new[]{hit-64};
      foreach(int p in offsets){if(p<0||p+(needle==salt?32:64)>n)continue;byte[] key=null;try{key=needle==salt?span.Slice(p,32).ToArray():Convert.FromHexString(Encoding.ASCII.GetString(buffer,p,64));}catch{continue;}
       try{string fingerprint=Convert.ToHexString(SHA256.HashData(key));if(!seen.Add(fingerprint))continue;result.CandidatesChecked++;if(Verify(key,salt,page)){Confirm(result,key,"raw");return result;}
        if(derivePassword){if(watch.Elapsed.TotalSeconds>50){result.BudgetReached=true;return result;}byte[] derived=Rfc2898DeriveBytes.Pbkdf2(key,salt,256000,HashAlgorithmName.SHA512,32);result.PasswordsChecked++;
         try{if(Verify(derived,salt,page)){Confirm(result,derived,"pbkdf2-sha512-256000");return result;}}finally{Array.Clear(derived,0,derived.Length);}
        }
       }finally{Array.Clear(key,0,key.Length);}
      }
      from=hit+needle.Length;
    }}
    if(wanted<=256)break;off+=(uint)(wanted-256);
   }
  }}finally{Array.Clear(buffer,0,buffer.Length);CloseHandle(h);}
  return result;
 }
}
'@
Add-Type -TypeDefinition ($probeSource+[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'WeixinBizDbSnapshot.cs')))
$result=[WeixinBizDbProbe]::Run([int]$owners[0].ProcessId,$page,[bool]$DerivePassword,[bool]$InspectCodec,[bool]$DecodeRuntimeKey)
if($ReadMessages){
 try{
  if(-not $result.VerifiedDatabaseKey){throw 'No verified key for the official-account database.'}
  $json=[WeixinBizDbProbe]::InspectTarget($result,$dbPaths[0],'C:\Program Files\Python314\python.exe',(Join-Path $PSScriptRoot 'read-wechat-biz-metadata.py'),$Biz,$AccountTable)
  $parsed=$json|ConvertFrom-Json
  if($OutputPath){$json|Set-Content -LiteralPath $out -Encoding utf8;[pscustomobject]@{file=$out;articleCount=$parsed.metadata.articleCount;databasePages=$parsed.databasePages;authenticatedPages=$parsed.authenticatedPages;walPagesApplied=$parsed.walPagesApplied;databaseIntegrity=$parsed.metadata.databaseIntegrity;diagnostics=$parsed.metadata.diagnostics;completeAccountFeed=$false}|ConvertTo-Json -Depth 5}else{$json}
 }finally{[WeixinBizDbProbe]::Forget($result)}
 return
}
[WeixinBizDbProbe]::Forget($result)
[pscustomobject]@{database='biz_message_0.db';processReadable=$result.ProcessReadable;verifiedDatabaseKey=$result.VerifiedDatabaseKey;keyFormat=$result.KeyFormat;megabytesRead=[Math]::Round($result.BytesRead/1MB,1);saltHits=$result.SaltHits;candidatesChecked=$result.CandidatesChecked;passwordsChecked=$result.PasswordsChecked;codecCandidates=$result.CodecCandidates;targetCodecContexts=$result.TargetCodecContexts;validPageHeaders=$result.ValidPageHeaders;directHmacMatches=$result.DirectHmacMatches;runtimeLiterals=$result.RuntimeLiterals;codecMetadata=$result.CodecMetadata;budgetReached=$result.BudgetReached;keyValuesPrinted=$false;databaseModified=$false}|ConvertTo-Json
