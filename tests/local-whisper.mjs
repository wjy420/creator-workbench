import {spawn,spawnSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const folder=path.resolve('data/local-whisper-test');await fs.mkdir(folder,{recursive:true});
const speech=path.resolve('data/test-fixtures/local-speech.wav');
const video=path.join(folder,'speech.mp4');
const result=spawnSync('ffmpeg',['-y','-f','lavfi','-i','color=c=black:s=640x360:r=24','-i',speech,'-shortest','-c:v','libx264','-c:a','aac',video],{encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stderr);
const service=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'8774',DATA_DIR:path.join(folder,'workspace'),WHISPER_CACHE:path.resolve('data/models'),HF_HUB_OFFLINE:'1'},stdio:'pipe',windowsHide:true});
const base='http://127.0.0.1:8774';
try{
 for(let i=0;i<40;i++){try{if((await fetch(base+'/api/state')).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
 const health=await(await fetch(base+'/api/whisper')).json();assert.equal(health.cached,true);assert.equal(health.ready,true);
 const r=await fetch(base+'/api/upload?name=local-whisper-test.mp4',{method:'POST',body:await fs.readFile(video)});const p=await r.json();assert.ok(r.ok,JSON.stringify(p));
 const job=await(await fetch(base+`/api/projects/${p.id}/transcribe`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).json();
 let done,state;for(let i=0;i<240;i++){await new Promise(r=>setTimeout(r,500));state=await(await fetch(base+'/api/state')).json();done=state.jobs.find(x=>x.id===job.id);if(done.status!=='running')break}
 assert.equal(done.status,'done',done.message);const project=state.projects[0];const text=project.subtitles.map(x=>x.text).join('');assert.ok(text.includes('工作台'),text);assert.ok(project.subtitles.every(s=>s.end>s.start&&s.start>=0));assert.equal(project.transcription.engine,'faster-whisper');assert.equal(state.settings.deepseekKeySet,false);assert.equal(state.settings.imageKeySet,false);
 console.log(JSON.stringify({passed:true,offline:true,engine:project.transcription,text,segments:project.subtitles.length},null,2));
}finally{service.kill()}
