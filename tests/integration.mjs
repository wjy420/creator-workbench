import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const folder=path.resolve('data/test-fixtures');await fs.mkdir(folder,{recursive:true});
function command(args){const r=spawnSync('ffmpeg',args,{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr)}
command(['-y','-f','lavfi','-i','testsrc2=size=640x360:rate=24','-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-t','4','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',path.join(folder,'test.mp4')]);
command(['-y','-f','lavfi','-i','sine=frequency=220:sample_rate=44100','-t','2',path.join(folder,'music.wav')]);
const base='http://127.0.0.1:8769';async function request(url,body,method='POST'){const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const obj=await r.json();assert.ok(r.ok,JSON.stringify(obj));return obj}
const r=await fetch(base+'/api/upload?name=test.mp4',{method:'POST',body:await fs.readFile(path.join(folder,'test.mp4'))});const p=await r.json();assert.ok(r.ok,JSON.stringify(p));
await request(`/api/projects/${p.id}`,{config:{...p.config,resolution:'original'}},'PATCH');
const m=await fetch(base+`/api/upload?type=music&id=${p.id}&name=music.wav`,{method:'POST',body:await fs.readFile(path.join(folder,'music.wav'))});assert.ok(m.ok,await m.text());
await request(`/api/projects/${p.id}/srt`,{text:'1\n00:00:00,500 --> 00:00:03,500\n真实字幕导出测试'});
const job=await request(`/api/projects/${p.id}/export`,{});let state,done;for(let i=0;i<60;i++){await new Promise(r=>setTimeout(r,500));state=await(await fetch(base+'/api/state')).json();done=state.jobs.find(x=>x.id===job.id);if(done.status!=='running')break}assert.equal(done.status,'done',done.message);const out=path.resolve('data',p.id,done.result.file);const probe=spawnSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',out],{encoding:'utf8',windowsHide:true});const meta=JSON.parse(probe.stdout);assert.ok(meta.streams.some(x=>x.codec_type==='audio'));assert.ok(meta.streams.some(x=>x.codec_type==='video'&&x.width===640));assert.ok(Math.abs(Number(meta.format.duration)-4)<.2);
command(['-y','-ss','2','-i',out,'-frames:v','1',path.join(folder,'export-check.png')]);
const range=await fetch(base+done.result.url,{headers:{Range:'bytes=0-99'}});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,100);
const denied=await fetch(base+'/api/settings',{method:'POST',headers:{Origin:'https://example.com','Content-Type':'application/json'},body:'{}'});assert.equal(denied.status,403);
console.log(JSON.stringify({success:true,projectId:p.id,output:out,preview:path.join(folder,'export-check.png'),duration:meta.format.duration},null,2));
