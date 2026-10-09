// Private input is read with terminal echo disabled. Never log the input or headers.
import readline from 'node:readline'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire('D:/Innovation/package.json')
const { load, dump } = require('js-yaml')
async function secretInput() {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true); process.stdin.setEncoding('utf8'); process.stdin.resume()
    process.stdout.write('Ready for private input\n')
    return new Promise(resolve => {
      let value = ''
      const receive = chunk => {
        for (const ch of chunk) {
          if (ch === '\r' || ch === '\n') { process.stdin.off('data', receive); process.stdin.setRawMode(false); process.stdin.pause(); resolve(value); return }
          if (ch === '\u007f' || ch === '\b') value = value.slice(0,-1)
          else if (ch === '\u0003') process.exit(1)
          else value += ch
        }
      }
      process.stdin.on('data', receive)
    })
  }
  process.stdout.write('Ready for private input\n')
  const reader = readline.createInterface({ input: process.stdin, terminal: false })
  const value = await new Promise(resolve => reader.once('line', resolve)); reader.close(); process.stdin.pause(); return value
}
const key = await secretInput()
if (process.argv.includes('--input-check')) { console.log(JSON.stringify({inputReceived:!!key,valuePrinted:false})); process.exit(0) }
try {
  const response = await fetch('https://i.weread.qq.com/api/agent/gateway', { method:'POST', headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify({api_name:'/_list',skill_version:'1.0.4'}),signal:AbortSignal.timeout(30000) })
  const result=await response.json()
  const names=[...new Set(JSON.stringify(result).match(/\/(?:[A-Za-z_][A-Za-z0-9_-]*\/)*[A-Za-z_][A-Za-z0-9_-]*/g)??[])].filter(name=>!name.startsWith('//'))
  const error=Number(result.errcode??result.errCode??0)
  console.log(JSON.stringify({httpStatus:response.status,errorCode:error,fields:Object.keys(result),apiNames:names,upgradeRequired:!!result.upgrade_info}))
  if(response.ok&&!error&&!result.upgrade_info&&names.length>0){
    fs.writeFileSync(path.join(import.meta.dirname,'official-weread-capabilities.json'),JSON.stringify(result,null,2))
    if(process.argv.includes('--save-key')){
      const file='D:/Innovation/api-keys.local.yaml', config=load(fs.readFileSync(file,'utf8'))??{}; config.refs??={};config.refs.WEREAD_API_KEY=key;
      const temporary=file+'.weread.tmp';fs.writeFileSync(temporary,dump(config),{mode:0o600});fs.renameSync(temporary,file)
      console.log(JSON.stringify({savedToApplicationCredentialFile:true,keyPrinted:false}))
    }
  }
}catch(error){console.log(JSON.stringify({errorType:error.name,keyPrinted:false}));process.exitCode=1}
