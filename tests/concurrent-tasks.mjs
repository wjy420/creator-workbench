import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
const folder=path.resolve('data/concurrency-test');await fs.mkdir(folder,{recursive:true});
function ff(args){const r=spawnSync('ffmpeg',['-y','-v','error',...args],{windowsHide:true,encoding:'utf8'});assert.equal(r.status,0,r.stderr)}
const source=path.join(folder,'input.mp4'),image=path.join(folder,'image.png'),stub=path.join(folder,'whisper-stub.mjs');
ff(['-f','lavfi','-i','testsrc2=s=640x360:r=25','-f','lavfi','-i','sine=frequency=440','-t','4','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',source]);
ff(['-f','lavfi','-i','color=c=navy:s=1280x720','-frames:v','1',image]);
await fs.writeFile(stub,"import fs from 'node:fs/promises';const output=process.argv[process.argv.indexOf('--output')+1];console.log(JSON.stringify({message:'测试识别中',progress:40}));await new Promise(r=>setTimeout(r,1800));await fs.writeFile(output,JSON.stringify({model:'test',device:'cpu',language:'zh',segments:[{start:0,end:2,text:'新识别字幕'},{start:2,end:4,text:'新识别字幕二'}]}));");
const bytes=await fs.readFile(image);let imageDelay=1300,copyDelay=1300;
const mock=http.createServer(async(req,res)=>{let raw='';for await(const x of req)raw+=x;const body=JSON.parse(raw);res.setHeader('Content-Type','application/json');if(req.url==='/chat/completions'){if(body.messages[0].content.includes('sharedStyle')){return res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({sharedStyle:'同一蓝色风格',horizontalPrompt:'横版标题',verticalPrompt:'竖版标题'})}}]}))}await new Promise(r=>setTimeout(r,copyDelay));res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({platforms:['抖音','视频号','小红书','B站'].map(platform=>({platform,title:'测试标题',description:'简单介绍视频内容。',tags:[],alternatives:[]})),coverTitle:'测试封面',coverPrompt:'测试画面'})}}]}))}else{await new Promise(r=>setTimeout(r,imageDelay));res.end(JSON.stringify({data:[{b64_json:bytes.toString('base64')}]}))}});
await new Promise(r=>mock.listen(8778,'127.0.0.1',r));
const service=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'8777',DATA_DIR:path.join(folder,'workspace'),WHISPER_PYTHON:process.execPath,WHISPER_SCRIPT:stub},windowsHide:true,stdio:'pipe'});let logs='';service.stderr.on('data',d=>logs+=d);
const base='http://127.0.0.1:8777',state=async()=>(await fetch(base+'/api/state')).json();
async function call(url,body={},method='POST'){const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const x=await r.json();assert.ok(r.ok,JSON.stringify(x));return x}
async function finish(ids){for(let i=0;i<220;i++){await new Promise(r=>setTimeout(r,100));const s=await state(),jobs=s.jobs.filter(j=>ids.includes(j.id));if(jobs.length===ids.length&&jobs.every(j=>j.status!=='running')){for(const j of jobs)assert.equal(j.status,'done',j.message+' '+logs);return s}}throw new Error('超时')}
try{
 for(let i=0;i<40;i++){try{if((await fetch(base+'/api/state')).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
 await call('/api/settings',{deepseekBase:'http://127.0.0.1:8778',deepseekKey:'test-only',deepseekModel:'mock',imageBase:'http://127.0.0.1:8778',imageKey:'test-only',imageModel:'mock'});
 const upload=await fetch(base+'/api/upload?name=Concurrent.mp4',{method:'POST',body:await fs.readFile(source)}),p=await upload.json();assert.ok(upload.ok);
 await call('/api/projects/'+p.id,{config:{...p.config,resolution:'original'},subtitles:[{start:0,end:4,text:'原始字幕快照'}]},'PATCH');
 const root='/api/projects/'+p.id;
 await finish([(await call(root+'/cover')).id]);
 const tasks=await Promise.all([call(root+'/copy'),call(root+'/transcribe'),call(root+'/cover',{slot:'horizontal'}),call(root+'/cover',{slot:'vertical'})]);
 const exportJob=await call(root+'/export');
 const duplicate=await fetch(base+root+'/export',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(duplicate.status,400);
 const duplicateCopy=await fetch(base+root+'/copy',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(duplicateCopy.status,400);
 await call(root,{config:{...p.config,resolution:'720p',bitrateKbps:8000}},'PATCH');
 let s=await finish([...tasks.map(j=>j.id),exportJob.id]),updated=s.projects.find(x=>x.id===p.id);
 assert.equal(updated.subtitles.length,2);assert.equal(updated.output.requestedBitrateKbps,3000);assert.equal(updated.output.width,640);assert.equal(updated.config.bitrateKbps,8000);assert.ok(updated.cover.horizontal&&updated.cover.vertical);assert.ok((await fs.readFile(path.join(folder,'workspace',p.id,'subtitles.srt'),'utf8')).includes('原始字幕快照'));
 imageDelay=1700;copyDelay=250;
 const manual=await call(root+'/cover',{slot:'horizontal'}),pipeline=await call(root+'/pipeline');
 const duplicatePipeline=await fetch(base+root+'/pipeline',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(duplicatePipeline.status,400);
 let waiting=false;for(let i=0;i<12;i++){await new Promise(r=>setTimeout(r,100));s=await state();if(s.jobs.find(j=>j.id===pipeline.id).stages?.cover?.status==='waiting'){waiting=true;break}}
 assert.ok(waiting,'一键处理应等待同一条正在运行的封面线路');
 for(let i=0;i<50;i++){if((await state()).jobs.find(j=>j.id===pipeline.id).stages?.copy?.status==='done')break;await new Promise(r=>setTimeout(r,50))}
 const independentCopy=await call(root+'/copy');await finish([manual.id,pipeline.id,independentCopy.id]);
 console.log('PASS: 五条线路并行、同任务防重复、运行中修改参数、合成快照、一键处理逐阶段等待而非项目锁定。');
}finally{service.kill();await new Promise(r=>mock.close(r))}
