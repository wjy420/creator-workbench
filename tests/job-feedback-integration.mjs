import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {pathToFileURL} from 'node:url';
const folder=path.resolve('data/job-feedback-tests',crypto.randomUUID());await fs.mkdir(folder,{recursive:true});
const video=path.join(folder,'input.mp4'),image=path.join(folder,'cover.png'),preload=path.join(folder,'slow-export.mjs');
function ff(args){const result=spawnSync('ffmpeg',['-y','-v','error',...args],{windowsHide:true});assert.equal(result.status,0,result.stderr?.toString())}
ff(['-f','lavfi','-i','color=c=0x242424:s=640x360:r=10','-f','lavfi','-i','sine=frequency=440','-t','8','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',video]);ff(['-f','lavfi','-i','color=c=navy:s=640x360','-frames:v','1',image]);
// Slow only this test service's real export so model results finish while FFmpeg runs.
await fs.writeFile(preload,`import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';const original=cp.spawn;cp.spawn=function(exe,args,options){if(exe==='ffmpeg'&&args.at(-1)?.endsWith('export-working.mp4')){args=[...args];args.splice(args.indexOf('-i'),0,'-re')}return original.call(this,exe,args,options)};syncBuiltinESMExports();`);
const png=await fs.readFile(image),mock=http.createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);res.setHeader('Content-Type','application/json');
 if(req.url==='/chat/completions'){const planning=body.messages[0].content.includes('sharedStyle');if(!planning)await new Promise(r=>setTimeout(r,500));res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(planning?{sharedStyle:'测试蓝色',horizontalPrompt:'横版测试',verticalPrompt:'竖版测试'}:{platforms:['抖音','视频号','小红书','B站'].map(platform=>({platform,title:'并行测试标题',description:'介绍并行任务的测试视频。',tags:[],alternatives:[]}))})}}]}))}
 else{await new Promise(r=>setTimeout(r,700));res.end(JSON.stringify({data:[{b64_json:png.toString('base64')}]}))}
});await new Promise(r=>mock.listen(0,'127.0.0.1',r));
const portProbe=http.createServer();await new Promise(r=>portProbe.listen(0,'127.0.0.1',r));const port=portProbe.address().port;await new Promise(r=>portProbe.close(r));
const base=`http://127.0.0.1:${port}`,service=spawn(process.execPath,['--import',pathToFileURL(preload).href,'server.mjs'],{env:{...process.env,PORT:String(port),DATA_DIR:path.join(folder,'workspace')},windowsHide:true,stdio:'pipe'});let errors='';service.stderr.on('data',d=>errors+=d);
const state=async()=>(await fetch(base+'/api/state')).json();
async function call(route,body={},method='POST'){const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),result=await r.json();assert.ok(r.ok,JSON.stringify(result));return result}
async function until(predicate){for(let i=0;i<800;i++){const s=await state();if(predicate(s))return s;await new Promise(r=>setTimeout(r,40))}throw new Error('等待超时 '+errors)}
try{
 for(let i=0;i<80;i++){try{if((await fetch(base+'/api/state')).ok)break}catch{}await new Promise(r=>setTimeout(r,50))}
 assert.equal(service.exitCode,null,errors);
 await call('/api/settings',{deepseekBase:`http://127.0.0.1:${mock.address().port}`,deepseekKey:'feedback-test-only',deepseekModel:'mock',imageBase:`http://127.0.0.1:${mock.address().port}`,imageKey:'feedback-test-only',imageModel:'mock'});
 const upload=await fetch(base+'/api/upload?name='+encodeURIComponent('并行消息测试.mp4'),{method:'POST',body:await fs.readFile(video)});assert.ok(upload.ok);const p=await upload.json(),root='/api/projects/'+p.id;
 await call(root,{config:{...p.config,resolution:'original',fontSize:24,chapterEnabled:false},subtitles:[{start:0,end:4,text:'并行任务状态测试'},{start:4,end:8,text:'封面完成后视频继续合成'}]},'PATCH');
 if(process.env.JOB_FEEDBACK_UI==='1'){console.log(JSON.stringify({base,folder,projectId:p.id}));console.log('UI_READY：按回车结束隔离服务');await once(process.stdin,'data');process.stdin.pause()}
 else{
  const exporting=await call(root+'/export'),[copy,cover]=await Promise.all([call(root+'/copy'),call(root+'/cover')]),get=(s,id)=>s.jobs.find(j=>j.id===id);
  const s=await until(s=>get(s,copy.id)?.status==='done'&&get(s,cover.id)?.status==='done');assert.equal(get(s,exporting.id).status,'running','封面和文案完成时，实际 FFmpeg 应仍在运行');const progress=get(s,exporting.id).progress;
  await until(s=>get(s,exporting.id)?.status==='running'&&get(s,exporting.id).progress>progress);
  const final=await until(s=>get(s,exporting.id)?.status!=='running'),result=get(final,exporting.id);assert.equal(result.status,'done',result.message);assert.ok((await fetch(base+result.result.url)).ok);
  console.log('PASS: 封面与文案先完成，真实 FFmpeg 继续推进并成功输出可下载视频。');
 }
}finally{if(service.exitCode===null){service.kill();await once(service,'exit')}await new Promise(r=>mock.close(r))}
