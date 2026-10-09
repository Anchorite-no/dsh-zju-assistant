import fs from 'node:fs'
import {createRequire} from 'node:module'
import {OfficialWereadClient} from '../../core/weread/official.mjs'
const {load}=createRequire('D:/Innovation/package.json')('js-yaml')
const client=new OfficialWereadClient({getApiKey:()=>load(fs.readFileSync('D:/Innovation/api-keys.local.yaml','utf8')).refs.WEREAD_API_KEY})
const checks=[
 ['shelf',()=>client.publishers()],
 ['publisher-search',()=>client.publishers('浙大体育与艺术')],
 ['publisher-chapters',()=>client.call('/book/chapterinfo',{bookId:'MP_WXS_3223096120'})],
 ['article-review',()=>client.call('/review/single',{reviewId:'MP_WXS_3223096120_8GOGPHQUaRhssML1duP3Vw',commentsCount:0,likesCount:0})],
]
for(const [check,run] of checks){try{const result=await run();console.log(JSON.stringify({check,ok:true,fields:Object.keys(result),accounts:result.accounts,chapters:Array.isArray(result.chapters)?result.chapters.length:undefined,reviewFields:result.review?Object.keys(result.review):undefined,htmlLength:typeof result.htmlContent==='string'?result.htmlContent.length:undefined}));}catch(e){console.log(JSON.stringify({check,ok:false,code:e.code,remoteCode:e.remoteCode}));}}
