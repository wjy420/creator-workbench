import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {spawn,spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const folder=path.resolve('data/library-api-test');await fs.mkdir(folder,{recursive:true});
function ff(args){const r=spawnSync('ffmpeg',['-y','-v','error',...args],{windowsHide:true,encoding:'utf8'});assert.equal(r.status,0,r.stderr)}
const source=path.join(folder,'source.mp4'),sound=path.join(folder,'test.wav'),image=path.join(folder,'cover.png');
ff(['-f','lavfi','-i','color=c=gray:s=640x360:r=10','-t','1','-c:v','libx264',source]);ff(['-f','lavfi','-i','sine=frequency=440','-t','3',sound]);ff(['-f','lavfi','-i','color=c=navy:s=2560x1440','-frames:v','1',image]);
const png=await fs.readFile(image);const mock=http.createServer(async(req,res)=>{for await(const _ of req){}res.setHeader('Content-Type','application/json');if(req.url==='/chat/completions')return res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({sharedStyle:'同一风格',horizontalPrompt:'横版',verticalPrompt:'竖版'})}}]}));res.end(JSON.stringify({data:[{b64_json:png.toString('base64')}]}))});await new Promise(r=>mock.listen(8778,'127.0.0.1',r));
const service=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'8777',DATA_DIR:path.join(folder,'workspace')},windowsHide:true,stdio:'pipe'});let logs='';service.stderr.on('data',d=>logs+=d);
const base='http://127.0.0.1:8777';const state=async()=>(await fetch(base+'/api/state')).json();
async function call(url,body={},method='POST'){const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const x=await r.json();assert.ok(r.ok,JSON.stringify(x));return x}
async function upload(name){const r=await fetch(base+'/api/upload?name='+name,{method:'POST',body:await fs.readFile(source)});assert.ok(r.ok);return r.json()}
async function job(p,type){const j=await call(`/api/projects/${p.id}/${type}`);for(let i=0;i<150;i++){await new Promise(r=>setTimeout(r,100));const s=await state(),done=s.jobs.find(x=>x.id===j.id);if(done.status!=='running'){assert.equal(done.status,'done',done.message+' '+logs);return s}}throw new Error('任务超时')}
try{
 for(let i=0;i<40;i++){try{if((await fetch(base+'/api/state')).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
 const a=await upload('A.mp4'),b=await upload('B.mp4');
 const musicResponse=await fetch(base+'/api/music?name=Preview.wav',{method:'POST',body:await fs.readFile(sound)});assert.ok(musicResponse.ok);const music=await musicResponse.json();assert.ok(music.duration>2.9);assert.equal((await fetch(base+music.url)).status,200);
 await call('/api/projects/'+a.id,{musicId:music.id},'PATCH');await call('/api/projects/'+b.id,{musicId:music.id,config:{...b.config,resolution:'original'}},'PATCH');
 const preset=await call('/api/presets',{name:'带音乐的预设',config:b.config,musicId:music.id});await call('/api/defaultpreset',{id:preset.id});const c=await upload('C.mp4');assert.equal(c.musicId,music.id);
 let configured=await call('/api/projects/'+b.id,{presetId:preset.id},'PATCH');assert.equal(configured.presetId,preset.id);assert.equal(configured.musicId,music.id);assert.deepEqual(configured.config,preset.config);
 configured=await call('/api/projects/'+b.id,{config:{...configured.config,barHeight:19}},'PATCH');assert.equal(configured.presetId,null);
 configured=await call('/api/projects/'+b.id,{presetId:preset.id},'PATCH');configured=await call('/api/projects/'+b.id,{musicId:null},'PATCH');assert.equal(configured.presetId,null);assert.equal(configured.music,undefined);
 configured=await call('/api/projects/'+b.id,{presetId:preset.id},'PATCH');assert.equal(configured.musicId,music.id);configured=await call('/api/projects/'+b.id,{config:{...configured.config},prompt:'只改创作方向'},'PATCH');assert.equal(configured.presetId,preset.id);
 await call('/api/projects/'+b.id,{config:{...configured.config,resolution:'original'}},'PATCH');
 await call('/api/projects/'+a.id,{},'DELETE');
assert.equal((await fetch(base+music.url)).status,200);assert.ok((await state()).presets.find(x=>x.id===preset.id));
 await job(b,'export');let s=await job(b,'export');const videoRecords=s.artifacts.filter(x=>x.projectId===b.id&&x.type==='video');assert.equal(videoRecords.length,2);assert.notEqual(videoRecords[0].url,videoRecords[1].url);for(const a of videoRecords)assert.equal((await fetch(base+a.url)).status,200);
 await call('/api/settings',{deepseekBase:'http://127.0.0.1:8778',deepseekKey:'test-only',deepseekModel:'mock',imageBase:'http://127.0.0.1:8778',imageKey:'test-only',imageModel:'test'});await job(b,'cover');s=await job(b,'cover');const images=s.artifacts.filter(x=>x.projectId===b.id&&x.type==='image');assert.equal(images.length,4);assert.equal(new Set(images.map(x=>x.url)).size,4);
 await call('/api/artifacts/'+images[3].id,{},'DELETE');assert.equal((await fetch(base+images[3].url)).status,404);assert.equal((await fetch(base+images[0].url)).status,200);
 await call('/api/artifacts/'+images[0].id,{},'DELETE');const afterImageDelete=(await state()).projects.find(x=>x.id===b.id);const removedSlot=images[0].label==='横版封面'?'horizontal':'vertical',keptSlot=removedSlot==='horizontal'?'vertical':'horizontal';assert.ok(afterImageDelete.cover[keptSlot]);assert.equal(afterImageDelete.cover[removedSlot],undefined);
 const range=await fetch(base+videoRecords[0].url,{headers:{Range:'bytes=0-99'}});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,100);const concurrent=await Promise.allSettled([...Array.from({length:12},()=>fetch(base+videoRecords[0].url).then(r=>r.arrayBuffer())),call('/api/artifacts/'+videoRecords[0].id,{},'DELETE')]);assert.equal(concurrent.at(-1).status,'fulfilled');s=await state();assert.equal(s.projects.find(x=>x.id===b.id).output,undefined);assert.equal((await fetch(base+videoRecords[1].url)).status,200);
 await call('/api/projects/'+b.id,{},'DELETE');s=await state();assert.equal(s.artifacts.filter(x=>x.projectId===b.id).length,0);assert.ok(!s.projects.some(x=>x.id===b.id));assert.equal((await fetch(base+music.url)).status,200);
 await call('/api/music/'+music.id,{},'DELETE');s=await state();assert.ok(!s.music.some(x=>x.id===music.id));assert.equal((await fetch(base+c.sourceUrl)).status,200);assert.equal((await fetch(base+`/media/${c.id}/${encodeURIComponent(c.music)}`)).status,200);assert.equal(s.presets.find(x=>x.id===preset.id).musicId,undefined);
 console.log('PASS: 独立音乐导入/预览、预设配乐复用、重复合成与生图记录、生成文件删除、项目清理及跨项目素材保留。');
}finally{service.kill();await new Promise(r=>mock.close(r))}
