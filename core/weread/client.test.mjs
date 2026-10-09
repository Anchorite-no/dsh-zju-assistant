import test from 'node:test'
import assert from 'node:assert/strict'
import { WereadClient, WereadError, parseContent, parsePublishers, publicLink } from './client.mjs'
import { CaptchaWorkflow, VisionRecognizer } from './captcha.mjs'

const id = 'MP_WXS_1234567890'
const article = n => ({ review: { reviewId: `${id}_token${n}abcdefghi`, createTime: 1700000000 + n, mpInfo: { title: `文章${n}`, originalId: `token${n}abcdefghi`, time: 1700000000 + n } } })
const page = (...groups) => ({ reviews: groups.map(items => ({ subReviews: items.map(article) })) })
const ok = body => ({ status: 200, body })

test('pagination advances by groups and expands multi-article pushes', async () => {
  const offsets = []
  const c = new WereadClient({ pageDelayMs: 0, transport: async request => { offsets.push(request.query.offset); return ok(request.query.offset === 0 ? page([1,2],[3,4,5]) : {reviews:[]}) } })
  const result = await c.articles({ account: id, limit: 10 })
  assert.equal(result.articles.length, 5); assert.deepEqual(offsets,[0,2]); assert.equal(result.completeAccountFeed,true)
})
test('repeated page is an explicit incomplete result, never an endless loop', async () => {
  const c = new WereadClient({pageDelayMs:0,transport:async()=>ok(page([1]))})
  await assert.rejects(c.articles({account:id,limit:10}),error=>error.code==='pagination_incomplete')
})
test('expired session renews once and does not convert empty errors into success', async () => {
  const calls=[]; let tries=0
  const c=new WereadClient({transport:async request=>{calls.push(request.path);if(request.path==='/web/login/renewal')return ok({succ:1});return ++tries===1?ok({errCode:-2012}):ok(page([1]))}})
  assert.equal((await c.articles({account:id,limit:1})).articles.length,1)
  assert.deepEqual(calls,['/web/mp/articles','/web/login/renewal','/web/mp/articles'])
})
test('-2041 is a verification challenge; valid proof is consumed only by its matching request', async () => {
  const calls=[]
  const c=new WereadClient({transport:async request=>{calls.push(request);return request.headers['x-wr-ticket']==='test-ticket'?ok(page([1])):ok({errCode:-2041})}})
  let challenge
  try{await c.articles({account:id,limit:1})}catch(error){challenge=error}
  assert.equal(challenge.code,'verification_required');assert.equal(calls.length,1)
  c.provideProof(challenge.details.requestKey,{ticket:'test-ticket',randstr:'test-randstr'})
  assert.equal((await c.articles({account:id,limit:1})).articles.length,1)
  assert.equal(calls[1].headers['x-wr-randstr'],'test-randstr')
  await assert.rejects(c.articles({account:id,limit:1}),error=>error.code==='verification_required')
})
test('subscribe checks shelf before and after a write, and does not double-submit after a timeout', async () => {
  let added=false,posts=0
  const c=new WereadClient({transport:async r=>{if(r.method==='POST'){posts++;added=true;throw new Error('timeout')}return ok({books:added?[{bookId:id,title:'测试号'}]:[]})}})
  assert.equal((await c.subscribe({account:id})).status,'added')
  assert.equal((await c.subscribe({account:id})).status,'already_added');assert.equal(posts,1)
})
test('resuming a captcha on a later page replays completed steps locally instead of fetching them again',async()=>{
  const calls=[]
  const c=new WereadClient({pageDelayMs:0,transport:async r=>{calls.push(r.query.offset);return r.query.offset===0?ok(page([1])):r.headers['x-wr-ticket']?ok({reviews:[]}):ok({errCode:-2041})}})
  let challenge;try{await c.run('article.list',{account:id,limit:10})}catch(error){challenge=error}
  const replay=await c.retryVerified(challenge.details,{ticket:'test-ticket',randstr:'test-randstr'})
  const result=await c.run('article.list',{account:id,limit:10},undefined,replay)
  assert.equal(result.articles.length,1);assert.deepEqual(calls,[0,1,1]);assert.equal(result.completeAccountFeed,true)
})
test('verified write retry is sent once; replay does not re-submit the mutation before readback',async()=>{
  let added=false,posts=0
  const c=new WereadClient({transport:async r=>{if(r.method==='POST'){if(!r.headers['x-wr-ticket'])return ok({errCode:-2041});posts++;added=true;return ok({succ:1})}return ok({books:added?[{bookId:id,title:'测试号'}]:[]})}})
  let error;try{await c.run('publisher.subscribe',{account:id})}catch(e){error=e}
  const replay=await c.retryVerified(error.details,{ticket:'test-ticket',randstr:'test-randstr'})
  assert.equal((await c.run('publisher.subscribe',{account:id},undefined,replay)).status,'added');assert.equal(posts,1)
})

test('article-read recovery reuses verified content even after its initial lookup filled the cache', async () => {
  let reads = 0
  const c = new WereadClient({ pageDelayMs: 0, transport: async r => {
    if (r.path === '/web/mp/articles') return ok(r.query.offset === 0 ? page([1]) : { reviews: [] })
    reads++
    return r.headers['x-wr-ticket'] ? ok('<div id="js_content">验证后的正文</div>') : ok({ errCode: -2041 })
  } })
  const input = { account: id, title: '文章1' }
  let error; try { await c.run('article.read', input) } catch (e) { error = e }
  const replay = await c.retryVerified(error.details, { ticket: 'synthetic-ticket', randstr: 'synthetic-randstr' })
  assert.equal((await c.run('article.read', input, undefined, replay)).article.content, '验证后的正文')
  assert.equal(reads, 2)
})
test('publisher parsing excludes unrelated books, and original links normalize the token',()=>{
  assert.deepEqual(parsePublishers({books:[{bookId:'12',title:'无关书籍'},{bookId:id,title:'测试号'}]}).map(x=>x.name),['测试号'])
  assert.equal(publicLink('abc~defghijk'),'https://mp.weixin.qq.com/s/abc_defghijk')
})
test('content parser reads only the article body and never evaluates remote scripts',()=>{
  const r=parseContent('<script>bad()</script><div id="js_content"><p>第一段 &amp; 内容</p><div>第二段</div><img data-src="https://example.com/a.png"></div><div>页尾不属于文章</div>')
  assert.match(r.content,/第一段 & 内容/);assert.doesNotMatch(r.content,/bad|页尾/);assert.equal(r.images.length,1)
  assert.throws(()=>parseContent('<div>登录</div>'),e=>e.code==='invalid_content')
})
function challenge(){return{kind:'image-choice',question:'一辆黑色的车',choices:Array.from({length:6},(_,i)=>({id:i+1,rect:{x:(i%3)*100,y:Math.floor(i/3)*100,width:98,height:98},image:`data:image/png;base64,${Buffer.from('synthetic-'+i).toString('base64')}`})),submitRect:{x:250,y:220,width:60,height:25}}}
function workflow(){const w={image:challenge(),clicks:[],submitted:0,reads:0,time:0};w.flow=new CaptchaWorkflow({now:()=>w.time,recognizer:{recognize:async()=>{w.reads++;return{selected:[5],confidence:0.99}}},adapter:{capture:async()=>structuredClone(w.image),click:async p=>w.clicks.push(p),submit:async()=>w.submitted++,waitForResult:async()=>w.failure?{status:'not_verified'}:{status:'verified',proof:{ticket:'test-ticket',randstr:'test-randstr'}}}});return w}
test('one captcha workflow supplies six images, resolves the selected ID to its stored position and verifies the outcome',async()=>{
  const w=workflow(); const prepared=await w.flow.prepare();assert.equal(prepared.choices.length,6)
  const result=await w.flow.recognize(prepared.taskId);assert.deepEqual(result.selected,[5])
  assert.equal((await w.flow.submit(prepared.taskId,result,{approved:true})).status,'verified')
  assert.equal(w.clicks[0].x,149);assert.equal(w.clicks[0].y,149);assert.equal(w.submitted,1)
})
test('no recognition or clicking without approval; image changes and expired captures invalidate results',async()=>{
  const w=workflow();await assert.rejects(w.flow.run(),e=>e.code==='verification_approval_required');assert.equal(w.reads,0)
  let p=await w.flow.prepare();w.image.choices[0].image='data:image/png;base64,Qg=='
  await assert.rejects(w.flow.submit(p.taskId,{selected:[1]},{approved:true}),e=>e.code==='verification_changed');assert.equal(w.clicks.length,0)
  p=await w.flow.prepare();w.time=61000;await assert.rejects(w.flow.recognize(p.taskId),e=>e.code==='verification_expired')
})
test('invalid choices, low confidence and a submitted but rejected challenge never count as verified',async()=>{
  const w=workflow();const p=await w.flow.prepare()
  for(const result of [{selected:[7]},{selected:[1,2]},{selected:[1],confidence:0.2}])await assert.rejects(w.flow.submit(p.taskId,result,{approved:true}),e=>e.code==='recognition_uncertain')
  w.failure=true;await assert.rejects(w.flow.submit(p.taskId,{selected:[1]},{approved:true}),e=>e.code==='verification_not_passed')
})
test('vision adapter sends only the prompt and six images with no account credentials',async()=>{
  let sent
  const recognizer=new VisionRecognizer({endpoint:'https://vision.example.com/v1/chat/completions',model:'test-vision',apiKey:'synthetic-api-key',fetcher:async(url,options)=>{sent=JSON.parse(options.body);return{ok:true,json:async()=>({choices:[{message:{content:'{"selected":[1],"confidence":0.95}'}}]})}}})
  assert.deepEqual((await recognizer.recognize(challenge())).selected,[1])
  assert.equal(sent.messages[0].content.filter(x=>x.type==='image_url').length,6);assert.doesNotMatch(JSON.stringify(sent),/wr_skey|cookie|ticket|synthetic-api-key/)
})
