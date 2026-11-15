import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const folder=path.resolve('data/bitrate-api-test');await fs.mkdir(folder,{recursive:true});
const source=path.join(folder,'flat.mp4');
const generated=spawnSync('ffmpeg',['-y','-v','error','-f','lavfi','-i','color=c=gray:s=640x360:r=25','-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-t','4','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',source],{windowsHide:true,encoding:'utf8'});assert.equal(generated.status,0,generated.stderr);
const service=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'8777',DATA_DIR:path.join(folder,'workspace')},windowsHide:true,stdio:'ignore'});
const base='http://127.0.0.1:8777';
async function call(url,body,method='POST'){const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const value=await r.json();assert.ok(r.ok,JSON.stringify(value));return value}
try{
 for(let i=0;i<40;i++){try{if((await fetch(base+'/api/state')).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
 const upload=await fetch(base+'/api/upload?name=flat.mp4',{method:'POST',body:await fs.readFile(source)});const p=await upload.json();assert.ok(upload.ok);
 await call(`/api/projects/${p.id}/srt`,{text:'1\n00:00:00,200 --> 00:00:03,500\n无需先导出视频即可下载字幕'});
 let srt=await fetch(base+`/api/projects/${p.id}/subtitles`);assert.ok(srt.headers.get('content-disposition').includes('attachment'));assert.ok((await srt.text()).includes('无需先导出视频'));
 for(const kbps of [2000,8000]){
  await call(`/api/projects/${p.id}`,{config:{...p.config,bitrateKbps:kbps}},'PATCH');
  const job=await call(`/api/projects/${p.id}/export`,{});let done,state;
  for(let i=0;i<100;i++){await new Promise(r=>setTimeout(r,100));state=await(await fetch(base+'/api/state')).json();done=state.jobs.find(x=>x.id===job.id);if(done.status!=='running')break}
  assert.equal(done.status,'done',done.message);const output=state.projects.find(x=>x.id===p.id).output;
  assert.equal(output.requestedBitrateKbps,kbps);assert.ok(Math.abs(output.videoBitrateBps/(kbps*1000)-1)<.03,`输入 ${kbps} kbps，实际 ${output.videoBitrateBps/1000} kbps`);
  assert.ok(output.totalBitrateBps>output.videoBitrateBps);
  const metadata=await(await fetch(base+`/api/projects/${p.id}/metadata`)).json();assert.equal(metadata.output.videoBitrateBps,output.videoBitrateBps);assert.ok(metadata.source.videoBitrateBps<kbps*1000/10);
  const decode=spawnSync('ffmpeg',['-v','error','-i',path.join(folder,'workspace',p.id,output.file),'-f','null','-'],{windowsHide:true,encoding:'utf8'});assert.equal(decode.status,0,decode.stderr);
  console.log(JSON.stringify({requestedKbps:kbps,measuredVideoKbps:output.videoBitrateBps/1000,totalKbps:output.totalBitrateBps/1000}));
 }
 await call(`/api/projects/${p.id}`,{subtitles:[{start:.2,end:3.5,text:'导出后修改的最新字幕'}]},'PATCH');
 srt=await fetch(base+`/api/projects/${p.id}/subtitles`);assert.ok((await srt.text()).includes('导出后修改的最新字幕'));
 console.log('PASS: 固定码率、实测回读、完整 MP4 解码和实时 SRT 下载。');
}finally{service.kill()}
