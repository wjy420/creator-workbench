import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
const folder=path.resolve('data/parallel-pipeline-test');await fs.mkdir(folder,{recursive:true});
const input=path.join(folder,'input.mp4'),image=path.join(folder,'image.png'),stub=path.join(folder,'whisper-stub.mjs'),failure=path.join(folder,'fail-asr');await fs.rm(failure,{force:true});
function ff(args){const r=spawnSync('ffmpeg',['-y','-v','error',...args],{windowsHide:true,encoding:'utf8'});assert.equal(r.status,0,r.stderr)}
ff(['-f','lavfi','-i','testsrc2=s=640x360:r=10','-f','lavfi','-i','sine=frequency=440','-t','2','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',input]);ff(['-f','lavfi','-i','color=c=navy:s=1280x720','-frames:v','1',image]);
await fs.writeFile(stub,`import fs from 'node:fs/promises';await new Promise(r=>setTimeout(r,600));const fail=await fs.access(${JSON.stringify(failure)}).then(()=>true,()=>false);await fs.writeFile(process.argv[process.argv.indexOf('--output')+1],JSON.stringify({model:'test',device:'cpu',language:'zh',segments:fail?[]:[{start:0,end:2,text:'刚识别出的新文稿'}]}));`);
let releaseCopy,releasePlan,modelCalls=0,imageCalls=0;const copyGate=new Promise(r=>releaseCopy=r),planGate=new Promise(r=>releasePlan=r),png=await fs.readFile(image);
const mock=http.createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);res.setHeader('Content-Type','application/json');if(req.url==='/chat/completions'){modelCalls++;assert.ok(body.messages[1].content.includes('刚识别出的新文稿'));if(body.messages[0].content.includes('sharedStyle')){assert.equal(JSON.parse(body.messages[1].content).copy,null,'并行封面必须根据新文稿策划，不能使用上次的旧文案');await planGate;res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({sharedStyle:'同一蓝色风格',horizontalPrompt:'横版新封面',verticalPrompt:'竖版新封面'})}}]}))}else{await copyGate;res.statusCode=500;res.end(JSON.stringify({error:{message:'模拟文案失败'}}))}}else{imageCalls++;res.end(JSON.stringify({data:[{b64_json:png.toString('base64')}]}))}});await new Promise(r=>mock.listen(8780,'127.0.0.1',r));
const service=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'8779',DATA_DIR:path.join(folder,'workspace'),WHISPER_PYTHON:process.execPath,WHISPER_SCRIPT:stub},windowsHide:true,stdio:'pipe'});let log='';service.stderr.on('data',d=>log+=d);
const base='http://127.0.0.1:8779',state=async()=>(await fetch(base+'/api/state')).json();
async function call(url,body={},method='POST'){const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),result=await r.json();assert.ok(r.ok,JSON.stringify(result));return result}
async function waitFor(predicate){for(let i=0;i<180;i++){const s=await state();if(predicate(s))return s;await new Promise(r=>setTimeout(r,50))}throw new Error('等待超时 '+log)}
async function upload(){const r=await fetch(base+'/api/upload?name=Parallel.mp4',{method:'POST',body:await fs.readFile(input)});assert.ok(r.ok);const p=await r.json();return call('/api/projects/'+p.id,{config:{...p.config,resolution:'original'},copy:{platforms:[],coverTitle:'旧标题',coverPrompt:'旧文案不应进入新封面策划'}},'PATCH')}
try{for(let i=0;i<40;i++){try{if((await fetch(base+'/api/state')).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
 await call('/api/settings',{deepseekBase:'http://127.0.0.1:8780',deepseekKey:'test-only',deepseekModel:'mock',imageBase:'http://127.0.0.1:8780',imageKey:'test-only',imageModel:'mock'});
 const p=await upload(),job=await call('/api/projects/'+p.id+'/pipeline',{prompt:'文案方向',coverDirection:'独立封面方向'}),get=s=>s.jobs.find(x=>x.id===job.id);
 let s=await waitFor(s=>get(s)?.stages?.transcribe?.status==='running');assert.equal(modelCalls,0);assert.equal(get(s).stages.export.status,'waiting');
 s=await waitFor(s=>get(s)?.stages?.export?.status==='done');let j=get(s);assert.equal(j.status,'running');assert.equal(j.stages.copy.status,'running');assert.equal(j.stages.cover.status,'running');assert.ok(j.result.url);assert.ok((await fetch(base+j.result.url)).ok);assert.ok(j.stages.export.createdAt-j.stages.transcribe.finishedAt<500,'字幕完成后立即启动合成');assert.ok(modelCalls>=1);
 const duplicate=await fetch(base+'/api/projects/'+p.id+'/cover',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"slot":"horizontal"}'});assert.equal(duplicate.status,400);
 releaseCopy();s=await waitFor(s=>get(s)?.stages?.copy?.status==='error');assert.equal(get(s).status,'running');assert.equal(get(s).stages.cover.status,'running');assert.ok(get(s).result.url);
 releasePlan();s=await waitFor(s=>get(s)?.status==='error');j=get(s);assert.equal(j.stages.cover.status,'done');assert.equal(j.stages.export.status,'done');assert.equal(imageCalls,2);assert.ok(s.projects.find(x=>x.id===p.id).cover.vertical);assert.ok(j.result.url);assert.match(j.message,/已成功的结果已保留/);
 await fs.writeFile(failure,'fail');const failed=await upload(),failedJob=await call('/api/projects/'+failed.id+'/pipeline'),callsBefore=modelCalls;s=await waitFor(s=>s.jobs.find(x=>x.id===failedJob.id)?.status==='error');const failedResult=s.jobs.find(x=>x.id===failedJob.id);assert.equal(failedResult.stages.export.status,'blocked');assert.equal(failedResult.stages.cover.status,'blocked');assert.equal(modelCalls,callsBefore);
 console.log('PASS: 字幕完成后文案、封面和真实合成并行；模型未完成时视频已可下载；单路失败保留其它结果；识别失败不启动后续任务。');
}finally{releaseCopy();releasePlan();service.kill();await new Promise(r=>mock.close(r))}
