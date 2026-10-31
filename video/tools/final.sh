#!/bin/sh
# 把 om render 出来的母版压成成片 MP4：H.264 两遍编码，总大小压在约 188 MB（上限 200 MB）。
# 音频：低频收一点、高频提一点，响度统一到 -14 LUFS。
# 用法：sh tools/final.sh out/film-vN.mp4 out/校园智能体-演示视频.mp4
set -e
FF="$HOME/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.2-full_build/bin"
export PATH="$FF:$PATH"
IN="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"; OUT="$2"
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$IN")
# 目标 188 MB（十进制，离 200 MB 上限留余量），留 160 kbps 给音频、30 kbps 给封装，其余给视频（kbps）
VK=$(awk -v d="$DUR" 'BEGIN { printf "%d", (188000000 * 8 / d) / 1000 - 160 - 30 }')
echo "duration ${DUR}s  video ${VK} kbps"
cd "$(dirname "$OUT")"
LOG="final-pass"
ffmpeg -y -v error -stats -i "$IN" -c:v libx264 -preset slow -b:v ${VK}k -pass 1 -passlogfile "$LOG" -pix_fmt yuv420p -an -f mp4 NUL
ffmpeg -y -v error -stats -i "$IN" -c:v libx264 -preset slow -b:v ${VK}k -maxrate $((VK * 2))k -bufsize $((VK * 4))k -pass 2 -passlogfile "$LOG" -pix_fmt yuv420p \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 \
  -af "bass=g=-2:f=90,treble=g=2.5:f=4000,loudnorm=I=-14:TP=-1.5:LRA=11" -c:a aac -b:a 160k -ar 48000 -movflags +faststart "$(basename "$OUT")"
rm -f "$LOG"*.log "$LOG"*.mbtree
ls -l "$(basename "$OUT")"
