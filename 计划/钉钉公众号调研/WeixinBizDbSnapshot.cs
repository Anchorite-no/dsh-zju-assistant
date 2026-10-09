// In-memory, read-only SQLCipher snapshot for the one official-account DB.
namespace WeixinResearch {
using System;
using System.IO;
using System.Collections.Generic;
using System.Diagnostics;
using System.Security.Cryptography;

public static class BizSnapshot {
 static uint Be(byte[] b,int o) => (uint)(b[o]<<24|b[o+1]<<16|b[o+2]<<8|b[o+3]);
 static byte[] ReadFile(string path,bool optional=false) {
  if(optional&&!File.Exists(path))return Array.Empty<byte>();
  using(var f=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.ReadWrite|FileShare.Delete)){
   if(f.Length>64*1024*1024)throw new Exception("Snapshot exceeds bounded size.");
   byte[] b=new byte[(int)f.Length];f.ReadExactly(b);return b;
  }
 }
 static bool Same(byte[] a,byte[] b) => a.Length==b.Length&&CryptographicOperations.FixedTimeEquals(SHA256.HashData(a),SHA256.HashData(b));
 static void Sum(byte[] data,int offset,int count,bool little,ref uint s0,ref uint s1){
  for(int i=offset;i<offset+count;i+=8){uint a=little?BitConverter.ToUInt32(data,i):Be(data,i);uint b=little?BitConverter.ToUInt32(data,i+4):Be(data,i+4);s0=unchecked(s0+a+s1);s1=unchecked(s1+b+s0);}
 }
 static byte[] Page(byte[] input,int offset,uint pgno,byte[] key,byte[] macKey){
  int skip=pgno==1?16:0;byte[] message=new byte[4032-skip+4];Array.Copy(input,offset+skip,message,0,4032-skip);Array.Copy(BitConverter.GetBytes(pgno),0,message,4032-skip,4);
  using(var h=new HMACSHA512(macKey)){if(!CryptographicOperations.FixedTimeEquals(h.ComputeHash(message),new ReadOnlySpan<byte>(input,offset+4032,64)))throw new Exception("Page authentication failed.");}
  using(var aes=Aes.Create()){aes.Key=key;aes.Mode=CipherMode.CBC;aes.Padding=PaddingMode.None;byte[] iv=new byte[16];Array.Copy(input,offset+4016,iv,0,16);aes.IV=iv;
   using(var dec=aes.CreateDecryptor()){byte[] plain=dec.TransformFinalBlock(input,offset+skip,4016-skip);byte[] result=new byte[4096];if(pgno==1)Array.Copy(System.Text.Encoding.ASCII.GetBytes("SQLite format 3\0"),result,16);Array.Copy(plain,0,result,skip,plain.Length);Array.Clear(plain,0,plain.Length);return result;}
  }
 }
 sealed class WalState {
  public List<(uint page,int offset)> Frames=new List<(uint page,int offset)>();
  public int LastCommit=-1;public uint CommitPageCount;public bool IgnoredTail;public string TailReason="none";
 }
 static WalState ReadWal(byte[] wal){
  var result=new WalState();
  if(wal.Length==0)return result;
  if(wal.Length<32)throw new Exception("Incomplete WAL header.");
  uint magic=Be(wal,0);if((magic!=0x377f0682&&magic!=0x377f0683)||Be(wal,4)!=3007000||Be(wal,8)!=4096)throw new Exception("Unsupported WAL header.");
  uint s0=0,s1=0;bool little=magic==0x377f0682;Sum(wal,0,24,little,ref s0,ref s1);if(s0!=Be(wal,24)||s1!=Be(wal,28))throw new Exception("WAL header checksum failed.");
  for(int o=32;o+4120<=wal.Length;o+=4120){
   if(Be(wal,o+8)!=Be(wal,16)||Be(wal,o+12)!=Be(wal,20)){result.IgnoredTail=true;result.TailReason="salt-mismatch-stale-tail";break;}
   uint t0=s0,t1=s1;Sum(wal,o,8,little,ref t0,ref t1);Sum(wal,o+24,4096,little,ref t0,ref t1);
   if(t0!=Be(wal,o+16)||t1!=Be(wal,o+20))throw new Exception("WAL frame checksum failed; latest metadata cannot be verified.");s0=t0;s1=t1;
   uint number=Be(wal,o);if(number==0||number>16384)throw new Exception("Invalid WAL page number.");
   result.Frames.Add((number,o+24));uint commitSize=Be(wal,o+4);if(commitSize!=0){result.LastCommit=result.Frames.Count-1;result.CommitPageCount=commitSize;}
  }
  if(!result.IgnoredTail&&(wal.Length-32)%4120!=0){result.IgnoredTail=true;result.TailReason="incomplete-uncommitted-tail";}
  return result;
 }
 public static string AnalyzeWal(byte[] wal){var r=ReadWal(wal);return "{\"validFrames\":"+r.Frames.Count+",\"committedFrames\":"+(r.LastCommit+1)+",\"pageCount\":"+r.CommitPageCount+",\"tailReason\":\""+r.TailReason+"\"}";}
 public static string Inspect(byte[] key,string path,string python,string helper,string biz,string table){
  if(Path.GetFileName(path)!="biz_message_0.db")throw new Exception("Only the official-account database is allowed.");
  byte[] db=null,wal=null,plain=null,macKey=null;
  try{
   for(int attempt=0;attempt<3;attempt++){
    db=ReadFile(path);wal=ReadFile(path+"-wal",true);byte[] again=ReadFile(path);byte[] walAgain=ReadFile(path+"-wal",true);
    bool stable=Same(db,again)&&Same(wal,walAgain);Array.Clear(again,0,again.Length);Array.Clear(walAgain,0,walAgain.Length);
    if(stable)break;Array.Clear(db,0,db.Length);Array.Clear(wal,0,wal.Length);db=null;wal=null;
   }
   if(db==null)throw new Exception("Database changed during snapshot; retry later.");
   if(db.Length<4096||db.Length%4096!=0)throw new Exception("Unexpected database size.");
   byte[] salt=new byte[16];Array.Copy(db,salt,16);for(int i=0;i<16;i++)salt[i]^=0x3a;macKey=Rfc2898DeriveBytes.Pbkdf2(key,salt,2,HashAlgorithmName.SHA512,32);
   byte[] first=Page(db,0,1,key,macKey);uint pageCount=Be(first,28);Array.Clear(first,0,first.Length);
   var walState=ReadWal(wal);var frames=walState.Frames;int lastCommit=walState.LastCommit,validFrames=frames.Count;bool ignoredTail=walState.IgnoredTail;string tailReason=walState.TailReason;
   if(walState.CommitPageCount>0)pageCount=walState.CommitPageCount;
   if(pageCount==0||pageCount>16384)throw new Exception("Invalid final page count.");
   var latest=new Dictionary<uint,int>();for(int i=0;i<=lastCommit;i++)latest[frames[i].page]=frames[i].offset;
   plain=new byte[checked((int)pageCount*4096)];int walPages=0;
   for(uint number=1;number<=pageCount;number++){
    byte[] page;int offset;if(latest.TryGetValue(number,out offset)){page=Page(wal,offset,number,key,macKey);walPages++;}else{offset=checked((int)(number-1)*4096);if(offset+4096>db.Length)throw new Exception("Missing database page.");page=Page(db,offset,number,key,macKey);}
    Array.Copy(page,0,plain,(number-1)*4096,4096);Array.Clear(page,0,page.Length);
   }
   // WAL has been merged into a private in-memory image. SQLite deserialize
   // requires rollback-journal header versions; the source files are untouched.
   plain[18]=1;plain[19]=1;
   var info=new ProcessStartInfo(python){UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true};
   info.ArgumentList.Add(helper);info.ArgumentList.Add("--biz");info.ArgumentList.Add(biz);
   if(!string.IsNullOrEmpty(table)){info.ArgumentList.Add("--table");info.ArgumentList.Add(table);}
   using(var p=Process.Start(info)){
    var stdout=p.StandardOutput.ReadToEndAsync();var stderr=p.StandardError.ReadToEndAsync();p.StandardInput.BaseStream.Write(plain,0,plain.Length);p.StandardInput.Close();
    if(!p.WaitForExit(30000)){p.Kill();throw new Exception("Local metadata parser timed out.");}if(p.ExitCode!=0)throw new Exception("Local metadata parser failed.");
    return "{\"databasePages\":"+pageCount+",\"authenticatedPages\":"+pageCount+",\"walValidFrames\":"+validFrames+",\"walCommittedFrames\":"+(lastCommit+1)+",\"walPagesApplied\":"+walPages+",\"walTailIgnored\":"+(ignoredTail?"true":"false")+",\"walTailReason\":\""+tailReason+"\",\"databaseModified\":false,\"plaintextDatabaseSaved\":false,\"metadata\":"+stdout.Result.Trim()+"}";
   }
  }finally{foreach(var b in new[]{db,wal,plain,macKey})if(b!=null)Array.Clear(b,0,b.Length);}
 }
}
}
