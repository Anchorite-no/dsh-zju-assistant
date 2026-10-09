import test from 'node:test'
import assert from 'node:assert/strict'
import { OfficialWereadClient, OFFICIAL_GATEWAY } from './official.mjs'
const definition={api_name:'/shelf/sync',params:[]}
test('official gateway uses the fixed trusted origin, top-level parameters and the pinned skill version',async()=>{
  const calls=[];const client=new OfficialWereadClient({getApiKey:()=> 'wrk-testkey',fetcher:async(url,options)=>{calls.push({url,body:JSON.parse(options.body),headers:options.headers});return{ok:true,status:200,json:async()=>calls.length===1?{errcode:0,apis:[definition]}:{books:[]}}}})
  await client.call('/shelf/sync');assert.equal(calls[1].url,OFFICIAL_GATEWAY);assert.deepEqual(calls[1].body,{api_name:'/shelf/sync',skill_version:'1.0.4'});assert.equal(calls[1].headers.authorization,'Bearer wrk-testkey')
  await assert.rejects(client.call('/web/mp/articles'),e=>e.code==='unsupported_official_api');assert.equal(calls.length,2)
})
test('upgrade notices and authentication failures stop official operations without browser fallback',async()=>{
  const upgrade=new OfficialWereadClient({getApiKey:()=> 'wrk-testkey',fetcher:async()=>({ok:true,status:200,json:async()=>({upgrade_info:{message:'new version'}})})})
  await assert.rejects(upgrade.capabilities(),e=>e.code==='skill_upgrade_required')
  const rejected=new OfficialWereadClient({getApiKey:()=> 'wrk-testkey',fetcher:async()=>({ok:false,status:401,json:async()=>({errcode:401})})})
  await assert.rejects(rejected.capabilities(),e=>e.code==='api_key_invalid')
})
test('publisher shelf output excludes ordinary books and article collection containers',async()=>{
  let n=0;const client=new OfficialWereadClient({getApiKey:()=> 'wrk-testkey',fetcher:async()=>({ok:true,status:200,json:async()=>++n===1?{apis:[definition]}:{books:[{bookId:'123',title:'ordinary'},{bookId:'MP_WXS_3223096120',title:'数字生命卡兹克'}],mp:{count:50}}})})
  assert.deepEqual((await client.publishers()).accounts.map(a=>a.name),['数字生命卡兹克'])
})
