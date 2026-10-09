/**
 * 随应用带的 FFmpeg：依赖 ffmpeg-static，装包时下好当前系统的那一份，打包时跟着 node_modules 进安装目录。
 * ZJU Core 的智云命令转音频格式、合并回放要用 FFmpeg，它认环境变量 FFMPEG_PATH；
 * 壳启动引擎时把这个路径交过去，引擎启动的命令和应用自己跑的 core 命令都会继承。
 */
const { existsSync } = require('node:fs')

/** 自带的 FFmpeg 的绝对路径；当前系统没有对应的版本、或装包时没下成，就没有。 */
function bundledFfmpeg() {
  try {
    const file = require('ffmpeg-static')
    return typeof file === 'string' && existsSync(file) ? file : undefined
  } catch {
    return undefined
  }
}

/** 交给引擎进程的环境变量。用户自己设了 FFMPEG_PATH 的以用户的为准；没带上就不设，core 照常报缺 FFmpeg。 */
function ffmpegEnv(env = process.env) {
  if (env.FFMPEG_PATH) return {}
  const file = bundledFfmpeg()
  return file ? { FFMPEG_PATH: file } : {}
}

module.exports = { bundledFfmpeg, ffmpegEnv }
