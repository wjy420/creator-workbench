import {spawn,spawnSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {outputSize,defaults} from '../public/render-spec.js';
assert.equal(defaults.bitrateKbps,3000);assert.equal(defaults.resolution,'1080p');
for(const [p,expected] of [[{width:2560,height:1600},{width:1728,height:1080}],[{width:1080,height:1920},{width:1080,height:1920}]])assert.deepEqual(outputSize(p,'1080p'),expected);
const folder=path.resolve('data/resolution-test');await fs.mkdir(folder,{recursive:true});
const service=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'8777',DATA_DIR:path.join(folder,'workspace')},windowsHide:true,stdio:'ignore'});
const base='http://127.0.0.1:8777';
async function call(url,body,method='POST'){const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const x=await r.json();assert.ok(r.ok,JSON.stringify(x));return x}
try{
 for(let i=0;i<40;i++){try{if((await fetch(base+'/api/state')).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
 for(const [w,h] of [[640,400],[360,640]]){
  const file=path.join(folder,`${w}x${h}.mp4`);const gen=spawnSync('ffmpeg',['-y','-v','error','-f','lavfi','-i',`color=c=gray:s=${w}x${h}:r=10`,'-t','0.5','-c:v','libx264',file],{windowsHide:true,encoding:'utf8'});assert.equal(gen.status,0,gen.stderr);
  const r=await fetch(base+`/api/upload?name=${w}x${h}.mp4`,{method:'POST',body:await fs.readFile(file)});const p=await r.json();assert.equal(p.config.bitrateKbps,3000);assert.equal(p.config.resolution,'1080p');
  for(const resolution of ['480p','720p','1080p','2k','original']){
   await call(`/api/projects/${p.id}`,{config:{...p.config,resolution}},'PATCH');const j=await call(`/api/projects/${p.id}/export`,{});let done;
   for(let i=0;i<150;i++){await new Promise(r=>setTimeout(r,100));const state=await(await fetch(base+'/api/state')).json();done=state.jobs.find(x=>x.id===j.id);if(done.status!=='running')break}
   assert.equal(done.status,'done',done.message);
   const check=spawnSync('ffprobe',['-v','error','-show_streams','-of','json',path.join(folder,'workspace',p.id,done.result.file)],{windowsHide:true,encoding:'utf8'});const stream=JSON.parse(check.stdout).streams[0],size=outputSize(p,resolution);
   assert.equal(stream.width,size.width);assert.equal(stream.height,size.height);assert.ok(Math.abs(stream.width/stream.height-w/h)<.003);assert.equal(stream.sample_aspect_ratio,'1:1');
   console.log(`${w}×${h} / ${resolution}: ${stream.width}×${stream.height}`);
  }
 }
 console.log('PASS: 横竖屏所有分辨率均真实导出，保持原比例，默认 3000 kbps / 1080p。');
}finally{service.kill()}

