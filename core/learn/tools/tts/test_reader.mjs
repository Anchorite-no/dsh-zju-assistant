import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const html=fs.readFileSync(new URL('./app.html',import.meta.url),'utf8');
new vm.Script(html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>')));
const grouping=html.slice(html.indexOf('function speechGroups('),html.indexOf('function dubFilm('));
const textCode=html.slice(html.indexOf('const AHEAD ='),html.indexOf('\nfunction write('));
const timers=[],requests=[];
class Audio {
  static instances=[];
  constructor(){this.dataset={};this.currentTime=0;this.ended=false;this.handlers={};this.loads=0;Audio.instances.push(this);}
  set src(v){this.url=v;this.currentTime=0;this.ended=false;this.loads++;}
  get src(){return this.url;}
  play(){this.paused=false;return Promise.resolve();}
  pause(){this.paused=true;}
  addEventListener(k,f){this.handlers[k]=f;}
  emit(k){this.handlers[k]?.();}
  removeAttribute(){}
}
const status={ready:true,voice_id:'A2',speech:{sentences:2,max_chars:120,gap:.3}};
const scope=vm.createContext({Audio,console,service:status,MOODS:Array(8).fill(''),plain:s=>s,
  setTimeout:f=>{timers.push(f);return timers.length;},clearTimeout(){},setInterval(){return 1;},clearInterval(){},
  fetch:async()=>({json:async()=>status}),post:async(path,body)=>{
    if(path==='/cached')return {};
    requests.push(body);
    const fp=body.lines.map(x=>x.key).join('-')+JSON.stringify(body.lines[0].mood||null);
    return {clips:Object.fromEntries(body.lines.map((x,i)=>[x.key,{fp,offset:i*3,seconds:3,continuous:i<body.lines.length-1,gap:.3}]))};
  }});
vm.runInContext(grouping+textCode+'\nthis.createFilm=textFilm;',scope);
const film=scope.createFilm();
film.add('我们先看一个简单的例子。然后再比较两个不同的条件。接着换一种方法重新计算。最后检查结论是否保持一致。',true);
const flush=async()=>{for(let i=0;i<8;i++)await new Promise(setImmediate);};
await flush();
assert.equal(requests.length,2,'four sentences should make two inference calls');
assert.equal(requests[0].lines.length,2);
const a=Audio.instances[0],cues=film.timeline.cues;
assert.equal(cues.length,4);
assert.equal(cues[1].s,cues[0].e,'no injected pause inside one audio group');
assert.equal(a.loads,1);
a.currentTime=3.01;a.emit('timeupdate');
assert.equal(film.at,1);
assert.equal(a.loads,1,'subtitle transition must not restart the media element');
film.pause();film.seek(cues[1].s);film.play();
assert.equal(a.currentTime,3,'seeking to the second sentence starts at its offset');
a.currentTime=4;film.pause();film.play();
assert.equal(a.currentTime,4,'pause/resume preserves the within-group position');
a.currentTime=6;a.ended=true;a.emit('ended');
timers.shift()();
assert.equal(film.at,2,'group end advances exactly once');
assert.equal(a.currentTime,0);
film.feel([0,0,0,0,0,0,0,.5],false);await flush();
assert.equal(requests.at(-2).lines.length,1,'per-sentence emotion must split its old group');
film.stop();
const boundary=vm.runInContext(`speechGroups([
 {text:'第一条完整中文句子',lang:'zh',para:true},
 {text:'第二条完整中文句子',lang:'zh'},
 {text:'A sufficiently long English sentence.',lang:'en'}]).map(g=>g.length)`,scope);
assert.deepEqual(Array.from(boundary),[1,1,1]);
console.log('Reader grouping, continuous playback, seeking, pause/resume, emotion regrouping and boundaries passed.');
