import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'

/** 「文档」文件夹的位置。Windows 上问系统要（可能被挪到别的盘或 OneDrive 里），别的系统用主目录下的 Documents。 */
function documentsDirectory() {
  if (process.platform !== 'win32') return Promise.resolve(path.join(os.homedir(), 'Documents'))
  return new Promise((resolve) => {
    const command = '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); [Environment]::GetFolderPath([Environment+SpecialFolder]::MyDocuments)'
    execFile('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, timeout: 10_000 }, (error, stdout) => {
      const found = error ? '' : stdout.trim()
      resolve(found && path.isAbsolute(found) ? found : path.join(os.homedir(), 'Documents'))
    })
  })
}

const two = number => String(number).padStart(2, '0')

/**
 * 不选文件夹直接开始的对话，各自的文件夹：<文档>\CampusAgent\<日期>\<时分>，一个对话一个，
 * 对话里产生的文件就落在里面。聊天记录不在这里，在引擎自己的数据目录。
 * CAMPUS_CHATS_DIR 可以把整个位置换掉（界面测试时用，免得往真实的「文档」里写）。
 */
export class ChatFolders {
  constructor(root = process.env.CAMPUS_CHATS_DIR) {
    this.located = root ? Promise.resolve(path.resolve(root)) : documentsDirectory().then(documents => path.join(documents, 'CampusAgent'))
  }

  root() { return this.located }

  /** 新建一个对话文件夹；同一分钟里已经有了就在名字后面加序号。 */
  async create(now = new Date()) {
    const root = await this.located
    const day = path.join(root, `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`)
    fs.mkdirSync(day, { recursive: true })
    const base = `${two(now.getHours())}${two(now.getMinutes())}`
    for (let index = 1; ; index++) {
      const folder = path.join(day, index === 1 ? base : `${base}-${index}`)
      try { fs.mkdirSync(folder); return { root, path: folder } } catch (error) { if (error.code !== 'EEXIST') throw error }
    }
  }
}
